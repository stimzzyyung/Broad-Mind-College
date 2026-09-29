const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');
const { userFromRow, getPortalConfig } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth);

function studentView(row) {
  const student = userFromRow(row);
  return { ...safeUser(student), className: row.class_name || 'Unassigned' };
}

async function makeSchoolId(connection, schoolCode, year, reserved = new Set()) {
  const prefix = `${schoolCode}/${year}/`;
  const [rows] = await connection.execute(
    'SELECT school_id FROM users WHERE role = ? AND school_id LIKE ? ORDER BY school_id DESC',
    ['student', `${prefix}%`]
  );
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.school_id.slice(prefix.length)) || 0), 0);
  let serial = highest + 1;
  let schoolId = `${prefix}${String(serial).padStart(3, '0')}`;
  while (reserved.has(schoolId)) {
    serial += 1;
    schoolId = `${prefix}${String(serial).padStart(3, '0')}`;
  }
  reserved.add(schoolId);
  return schoolId;
}

async function notifyAdmins(connection, title, body) {
  await connection.execute(
    'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ?',
    [title, body, 'student', '/admin/students', 'admin']
  );
}

router.get('/', requireRole('admin', 'teacher', 'parent'), async (req, res, next) => {
  try {
    let query = 'SELECT s.*, c.name AS class_name FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.role = ?';
    const values = ['student'];
    if (req.user.role === 'teacher') {
      query += ' AND (s.class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?) OR s.class_id IN (SELECT id FROM classes WHERE form_teacher_id = ?))';
      values.push(req.user.id, req.user.id);
    } else if (req.user.role === 'parent') {
      query += ' AND s.parent_id = ?';
      values.push(req.user.id);
    }
    if (req.query.classId) {
      query += ' AND s.class_id = ?';
      values.push(Number(req.query.classId));
    }
    if (req.query.search) {
      query += ' AND (LOWER(s.name) LIKE ? OR LOWER(s.school_id) LIKE ?)';
      const search = `%${String(req.query.search).toLowerCase()}%`;
      values.push(search, search);
    }
    query += ' ORDER BY s.name';
    const [rows] = await pool.execute(query, values);
    res.json(rows.map(studentView));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin', 'teacher', 'parent'), async (req, res, next) => {
  const { firstName, lastName, gender, dob, classId, guardianName, guardianPhone, address, email } = req.body;
  if (!firstName || !lastName || !gender || !dob || !classId) {
    return res.status(400).json({ message: 'Please fill in all the required fields' });
  }
  if (['admin', 'teacher'].includes(req.user.role) && (!guardianName || !guardianPhone)) {
    return res.status(400).json({ message: 'Please fill in all the required fields' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classes] = await connection.execute('SELECT id, name FROM classes WHERE id = ?', [Number(classId)]);
    if (!classes.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Choose a valid class' });
    }
    if (email) {
      const [existing] = await connection.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email.trim().toLowerCase()]);
      if (existing.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'That email is already used by another account' });
      }
    }

    let parentId = null;
    let guardian = { name: guardianName || '', phone: guardianPhone || '' };
    if (req.user.role === 'parent') {
      const [parents] = await connection.execute('SELECT id, name, phone FROM users WHERE id = ? AND role = ?', [req.user.id, 'parent']);
      if (!parents.length) {
        await connection.rollback();
        return res.status(403).json({ message: 'Parent account not found' });
      }
      parentId = Number(parents[0].id);
      guardian = { name: guardianName || parents[0].name, phone: guardianPhone || parents[0].phone };
    }

    const schoolCode = await getPortalConfig(connection, 'school_code');
    if (!schoolCode) {
      await connection.rollback();
      return res.status(503).json({ message: 'Configure portal_config.school_code before registering students' });
    }
    const year = String(new Date().getFullYear()).slice(-2);
    const schoolId = await makeSchoolId(connection, schoolCode, year);
    const temporaryPassword = randomBytes(12).toString('base64url');
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const [result] = await connection.execute(
      'INSERT INTO users (role, school_id, name, email, password, gender, dob, class_id, parent_id, guardian_name, guardian_phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['student', schoolId, name, email ? email.trim() : null, bcrypt.hashSync(temporaryPassword, 12), gender, dob, Number(classId), parentId, guardian.name.trim(), guardian.phone.trim(), address || '', 'active']
    );

    if (req.user.role === 'parent') {
      await notifyAdmins(connection, 'New student registered', `${name} was registered by a parent into ${classes[0].name}.`);
    } else if (req.user.role === 'teacher') {
      await notifyAdmins(connection, 'New student registered', `${name} was registered by teacher ${req.user.name} into ${classes[0].name}.`);
    }
    await connection.commit();
    const [createdRows] = await pool.execute('SELECT s.*, c.name AS class_name FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?', [result.insertId]);
    res.status(201).json({
      student: studentView(createdRows[0]),
      credentials: { loginId: schoolId, password: temporaryPassword },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That email or student ID is already in use' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.post('/bulk', requireRole('admin', 'teacher'), async (req, res, next) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'Add at least one row' });
  if (rows.length > 200) return res.status(400).json({ message: 'Please register at most 200 students at a time' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const results = [];
    let created = 0;
    const reserved = new Set();
    const schoolCode = await getPortalConfig(connection, 'school_code');
    if (!schoolCode) {
      await connection.rollback();
      return res.status(503).json({ message: 'Configure portal_config.school_code before registering students' });
    }
    const year = String(new Date().getFullYear()).slice(-2);

    for (const [index, row] of rows.entries()) {
      const rowNum = index + 1;
      const firstName = String(row.firstName || '').trim();
      const lastName = String(row.lastName || '').trim();
      const gender = String(row.gender || '').trim();
      const dob = String(row.dob || '').trim();
      const classId = Number(row.classId);
      const guardianName = String(row.guardianName || '').trim();
      const guardianPhone = String(row.guardianPhone || '').trim();
      const email = String(row.email || '').trim();
      const address = String(row.address || '').trim();

      if (!firstName || !lastName || !gender || !dob || !classId || !guardianName || !guardianPhone) {
        results.push({ row: rowNum, ok: false, message: 'Missing required fields' });
        continue;
      }
      const [classes] = await connection.execute('SELECT id, name FROM classes WHERE id = ?', [classId]);
      if (!classes.length) {
        results.push({ row: rowNum, ok: false, message: 'Unknown class' });
        continue;
      }
      if (email) {
        const [existing] = await connection.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email.toLowerCase()]);
        if (existing.length) {
          results.push({ row: rowNum, ok: false, message: 'Email already used' });
          continue;
        }
      }

      const schoolId = await makeSchoolId(connection, schoolCode, year, reserved);
      const temporaryPassword = randomBytes(12).toString('base64url');
      const name = `${firstName} ${lastName}`;
      const [result] = await connection.execute(
        'INSERT INTO users (role, school_id, name, email, password, gender, dob, class_id, guardian_name, guardian_phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['student', schoolId, name, email || null, bcrypt.hashSync(temporaryPassword, 12), gender, dob, classId, guardianName, guardianPhone, address, 'active']
      );
      created += 1;
      results.push({ row: rowNum, ok: true, name, className: classes[0].name, loginId: schoolId, password: temporaryPassword, studentId: result.insertId });
    }

    if (created && req.user.role === 'teacher') {
      await notifyAdmins(connection, 'Bulk students registered', `${created} student(s) were registered by teacher ${req.user.name}.`);
    }
    await connection.commit();
    res.status(created > 0 ? 201 : 400).json({
      message: `${created} of ${rows.length} student${rows.length === 1 ? '' : 's'} registered`,
      created,
      results: results.map(({ studentId, ...item }) => item),
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const columnNames = { name: 'name', gender: 'gender', dob: 'dob', guardianName: 'guardian_name', guardianPhone: 'guardian_phone', address: 'address', status: 'status' };
  try {
    const [found] = await pool.execute('SELECT id FROM users WHERE id = ? AND role = ?', [Number(req.params.id), 'student']);
    if (!found.length) return res.status(404).json({ message: 'Student not found' });
    const fields = Object.keys(columnNames).filter((field) => req.body[field] !== undefined);
    const assignments = fields.map((field) => `${columnNames[field]} = ?`);
    const values = fields.map((field) => req.body[field]);
    if (req.body.classId !== undefined) {
      const classId = req.body.classId ? Number(req.body.classId) : null;
      if (classId !== null) {
        const [classes] = await pool.execute('SELECT id FROM classes WHERE id = ?', [classId]);
        if (!classes.length) return res.status(400).json({ message: 'Choose a valid class' });
      }
      assignments.push('class_id = ?');
      values.push(classId);
    }
    if (assignments.length) await pool.execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, [...values, Number(req.params.id)]);
    const [rows] = await pool.execute('SELECT s.*, c.name AS class_name FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?', [Number(req.params.id)]);
    res.json(studentView(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ? AND role = ?', [Number(req.params.id), 'student']);
    if (!result.affectedRows) return res.status(404).json({ message: 'Student not found' });
    res.json({ message: 'Student removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;