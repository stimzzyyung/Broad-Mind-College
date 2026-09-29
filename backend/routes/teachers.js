const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');
const { userFromRow, getPortalConfig } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

async function withClasses(teacher) {
  const [rows] = await pool.execute(
    'SELECT DISTINCT c.name FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ? ORDER BY c.name',
    [teacher.id, teacher.id]
  );
  return { ...safeUser(teacher), classes: rows.map((row) => row.name) };
}

async function makeTeacherSchoolId(connection, schoolCode) {
  const prefix = `${schoolCode}/TCH/`;
  const [rows] = await connection.execute('SELECT school_id FROM users WHERE school_id LIKE ?', [`${prefix}%`]);
  const highest = rows.reduce((max, row) => Math.max(max, Number(row.school_id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE role = ? ORDER BY name', ['teacher']);
    res.json(await Promise.all(rows.map((row) => withClasses(userFromRow(row)))));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, email, phone, qualification } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'That email is already used by another account' });
    }
    const schoolCode = await getPortalConfig(connection, 'school_code');
    if (!schoolCode) {
      await connection.rollback();
      return res.status(503).json({ message: 'Configure portal_config.school_code before registering teachers' });
    }
    const schoolId = await makeTeacherSchoolId(connection, schoolCode);
    const temporaryPassword = randomBytes(12).toString('base64url');
    const [result] = await connection.execute(
      'INSERT INTO users (role, school_id, name, email, password, phone, qualification, address, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['teacher', schoolId, name.trim(), email.trim(), await bcrypt.hash(temporaryPassword, 12), phone || '', qualification || '', '', '', 'active']
    );
    await connection.commit();
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const teacher = userFromRow(rows[0]);
    res.status(201).json({
      teacher: await withClasses(teacher),
      credentials: { loginId: teacher.email, password: temporaryPassword },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That email or staff ID is already in use' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.post('/bulk', async (req, res, next) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'Add at least one row' });
  if (rows.length > 200) return res.status(400).json({ message: 'Please add at most 200 teachers at a time' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const results = [];
    let created = 0;
    const schoolCode = await getPortalConfig(connection, 'school_code');
    if (!schoolCode) {
      await connection.rollback();
      return res.status(503).json({ message: 'Configure portal_config.school_code before registering teachers' });
    }
    const existingEmails = new Set();
    const [existingRows] = await connection.execute('SELECT LOWER(email) AS email FROM users WHERE email IS NOT NULL');
    existingRows.forEach((row) => existingEmails.add(row.email));
    for (const [index, row] of rows.entries()) {
      const rowNum = index + 1;
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim();
      const phone = String(row.phone || '').trim();
      const qualification = String(row.qualification || '').trim();
      if (!name || !email) {
        results.push({ row: rowNum, ok: false, message: 'Name and email are required' });
        continue;
      }
      const normalizedEmail = email.toLowerCase();
      if (existingEmails.has(normalizedEmail)) {
        results.push({ row: rowNum, ok: false, message: 'Email already used' });
        continue;
      }
      const schoolId = await makeTeacherSchoolId(connection, schoolCode);
      const temporaryPassword = randomBytes(12).toString('base64url');
      const [result] = await connection.execute(
        'INSERT INTO users (role, school_id, name, email, password, phone, qualification, address, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['teacher', schoolId, name, email, await bcrypt.hash(temporaryPassword, 12), phone, qualification, '', '', 'active']
      );
      existingEmails.add(normalizedEmail);
      created += 1;
      results.push({ row: rowNum, ok: true, name, loginId: email, password: temporaryPassword, teacherId: result.insertId });
    }

    await connection.commit();
    res.status(created > 0 ? 201 : 400).json({
      message: `${created} of ${rows.length} teacher${rows.length === 1 ? '' : 's'} registered`,
      created,
      results: results.map(({ teacherId, ...item }) => item),
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const teacherId = Number(req.params.id);
    const [teachers] = await connection.execute('SELECT id FROM users WHERE id = ? AND role = ? FOR UPDATE', [teacherId, 'teacher']);
    if (!teachers.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Teacher not found' });
    }
    await connection.execute('UPDATE classes SET form_teacher_id = NULL WHERE form_teacher_id = ?', [teacherId]);
    await connection.execute('UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = ?', [teacherId]);
    await connection.execute('DELETE FROM users WHERE id = ?', [teacherId]);
    await connection.commit();
    res.json({ message: 'Teacher removed' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

module.exports = router;