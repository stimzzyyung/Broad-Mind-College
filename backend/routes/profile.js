const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');
const { userFromRow } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth);

// Which fields each role may edit. Students cannot rename themselves - the office does that.
const EDITABLE = {
  student: ['phone', 'address'],
  teacher: ['name', 'phone', 'address', 'bio', 'qualification'],
  admin: ['name', 'phone', 'address', 'bio'],
  parent: ['name', 'phone', 'address'],
};

async function build(user) {
  const profile = safeUser(user);
  if (user.role === 'student') {
    const [rows] = await pool.execute(
      'SELECT c.name AS class_name, u.name AS form_teacher_name FROM classes c LEFT JOIN users u ON u.id = c.form_teacher_id WHERE c.id = ?',
      [user.classId]
    );
    profile.className = rows[0]?.class_name || 'Unassigned';
    profile.formTeacherName = rows[0]?.form_teacher_name || 'Not assigned';
  }
  if (user.role === 'teacher') {
    const [rows] = await pool.execute(
      'SELECT DISTINCT c.name FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ? ORDER BY c.name',
      [user.id, user.id]
    );
    profile.classes = rows.map((row) => row.name);
  }
  if (user.role === 'parent') {
    const [rows] = await pool.execute('SELECT name FROM users WHERE role = ? AND parent_id = ? ORDER BY name', ['student', user.id]);
    profile.children = rows.map((row) => row.name);
  }
  return profile;
}

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = userFromRow(rows[0]);
    if (!user) return res.status(404).json({ message: 'Account not found' });
    res.json(await build(user));
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile
router.put('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = userFromRow(rows[0]);
    if (!user) return res.status(404).json({ message: 'Account not found' });

    const fields = EDITABLE[user.role] || [];
    const columnNames = { phone: 'phone', address: 'address', bio: 'bio', qualification: 'qualification', name: 'name' };
    const updates = fields.filter((field) => req.body[field] !== undefined);
    const values = updates.map((field) => String(req.body[field]).trim());
    const nextName = updates.includes('name') ? values[updates.indexOf('name')] : user.name;
    if (!nextName) return res.status(400).json({ message: 'Name cannot be empty' });

    if (updates.length) {
      const assignments = updates.map((field) => `${columnNames[field]} = ?`).join(', ');
      await pool.execute(`UPDATE users SET ${assignments} WHERE id = ?`, [...values, req.user.id]);
    }
    const [updatedRows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    res.json(await build(userFromRow(updatedRows[0])));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
