const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');
const { userFromRow, getPortalConfig } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

async function makeAdminSchoolId(connection, schoolCode) {
  const prefix = `${schoolCode || 'BMS'}/ADM/`;
  const [rows] = await connection.execute('SELECT school_id FROM users WHERE school_id LIKE ?', [`${prefix}%`]);
  const highest = rows.reduce((max, row) => {
    const rawNum = row.school_id ? Number(row.school_id.slice(prefix.length)) : 0;
    return Math.max(max, isNaN(rawNum) ? 0 : rawNum);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

// GET /api/admins - List all administrators
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, role, school_id, name, email, phone, qualification, status, created_at, bio FROM users WHERE role = ? ORDER BY id ASC',
      ['admin']
    );
    res.json(rows.map((row) => safeUser(userFromRow(row))));
  } catch (err) {
    next(err);
  }
});

// POST /api/admins - Create a new administrator
router.post('/', async (req, res, next) => {
  const { name, email, phone, qualification, password } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'That email is already registered to an account' });
    }

    const schoolCode = (await getPortalConfig(connection, 'school_code')) || 'BMS';
    const schoolId = await makeAdminSchoolId(connection, schoolCode);
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.execute(
      'INSERT INTO users (role, school_id, name, email, password, phone, qualification, address, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['admin', schoolId, name.trim(), cleanEmail, passwordHash, phone ? phone.trim() : '', qualification ? qualification.trim() : 'Administrator', '', '', 'active']
    );

    const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
    await connection.commit();

    const newAdmin = safeUser(userFromRow(rows[0]));
    res.status(201).json(newAdmin);

  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with that email or staff ID already exists' });
    }
    next(err);
  } finally {
    connection?.release();
  }
});

// PUT /api/admins/:id - Update administrator details or status
router.put('/:id', async (req, res, next) => {
  const adminId = Number(req.params.id);
  const { name, phone, qualification, status, password } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM users WHERE id = ? AND role = ?', [adminId, 'admin']);
    const existing = rows[0];
    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ message: 'Administrator not found' });
    }

    // Safety check: Cannot suspend your own admin account
    if (status === 'suspended' && Number(req.user.id) === adminId) {
      await connection.rollback();
      return res.status(400).json({ message: 'You cannot suspend your own admin account' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!String(name).trim()) {
        await connection.rollback();
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      updates.push('name = ?');
      values.push(String(name).trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(String(phone).trim());
    }
    if (qualification !== undefined) {
      updates.push('qualification = ?');
      values.push(String(qualification).trim());
    }
    if (status !== undefined) {
      if (!['active', 'suspended'].includes(status)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Invalid status' });
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (password) {
      if (password.length < 6) {
        await connection.rollback();
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hash);
    }

    if (updates.length > 0) {
      values.push(adminId);
      await connection.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [updatedRows] = await connection.execute('SELECT * FROM users WHERE id = ?', [adminId]);
    await connection.commit();
    res.json(safeUser(userFromRow(updatedRows[0])));

  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// DELETE /api/admins/:id - Delete an administrator
router.delete('/:id', async (req, res, next) => {
  const adminId = Number(req.params.id);

  // Safety check 1: Cannot delete self
  if (Number(req.user.id) === adminId) {
    return res.status(400).json({ message: 'You cannot delete your own admin account' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM users WHERE id = ? AND role = ?', [adminId, 'admin']);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Administrator not found' });
    }

    // Safety check 2: Cannot delete the last active administrator
    const [activeRows] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE role = ? AND status = ?', ['admin', 'active']);
    if (activeRows[0].count <= 1) {
      await connection.rollback();
      return res.status(400).json({ message: 'Cannot delete the only remaining active administrator' });
    }

    await connection.execute('DELETE FROM users WHERE id = ?', [adminId]);
    await connection.commit();
    res.json({ message: 'Administrator deleted successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

module.exports = router;
