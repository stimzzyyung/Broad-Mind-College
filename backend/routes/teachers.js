const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { SCHOOL_CODE, safeUser } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const DEFAULT_PASSWORD = 'teacher123';

function withClasses(data, teacher) {
  const classes = data.classes
    .filter((c) => c.formTeacherId === teacher.id || c.subjects.some((s) => s.teacherId === teacher.id))
    .map((c) => c.name);
  return { ...safeUser(teacher), classes };
}

// GET /api/teachers
router.get('/', (req, res) => {
  const data = db.read();
  const list = data.users.filter((u) => u.role === 'teacher').map((t) => withClasses(data, t));
  res.json(list);
});

// POST /api/teachers  – add a teacher
router.post('/', (req, res) => {
  const { name, email, phone, qualification, subjects } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Name and email are required' });

  const data = db.read();
  if (data.users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'That email is already used by another account' });
  }

  const count = data.users.filter((u) => u.role === 'teacher').length + 1;
  const teacher = {
    id: db.nextId(data.users),
    role: 'teacher',
    schoolId: `${SCHOOL_CODE}/TCH/${String(count).padStart(3, '0')}`,
    name: name.trim(),
    email: email.trim(),
    phone: phone || '',
    qualification: qualification || '',
    subjects: subjects || [],
    password: bcrypt.hashSync(DEFAULT_PASSWORD, 8),
    address: '',
    bio: '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  data.users.push(teacher);
  db.write(data);

  res.status(201).json({
    teacher: withClasses(data, teacher),
    credentials: { loginId: teacher.email, password: DEFAULT_PASSWORD },
  });
});

// POST /api/teachers/bulk  { rows: [{ name, email, phone, qualification }] }
router.post('/bulk', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'Add at least one row' });
  }
  if (rows.length > 200) {
    return res.status(400).json({ message: 'Please add at most 200 teachers at a time' });
  }

  const data = db.read();
  const results = [];
  let created = 0;

  rows.forEach((row, i) => {
    const rowNum = i + 1;
    const name = (row.name || '').toString().trim();
    const email = (row.email || '').toString().trim();
    const phone = (row.phone || '').toString().trim();
    const qualification = (row.qualification || '').toString().trim();

    if (!name || !email) {
      results.push({ row: rowNum, ok: false, message: 'Name and email are required' });
      return;
    }
    if (data.users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) {
      results.push({ row: rowNum, ok: false, message: 'Email already used' });
      return;
    }

    const count = data.users.filter((u) => u.role === 'teacher').length + 1;
    const teacher = {
      id: db.nextId(data.users),
      role: 'teacher',
      schoolId: `${SCHOOL_CODE}/TCH/${String(count).padStart(3, '0')}`,
      name, email, phone, qualification, subjects: [],
      password: bcrypt.hashSync(DEFAULT_PASSWORD, 8),
      address: '', bio: '', status: 'active', createdAt: new Date().toISOString(),
    };
    data.users.push(teacher);
    created += 1;
    results.push({ row: rowNum, ok: true, name: teacher.name, loginId: teacher.email, password: DEFAULT_PASSWORD });
  });

  if (created > 0) db.write(data);
  res.status(created > 0 ? 201 : 400).json({
    message: `${created} of ${rows.length} teacher${rows.length === 1 ? '' : 's'} registered`,
    created,
    results,
  });
});

// DELETE /api/teachers/:id
router.delete('/:id', (req, res) => {
  const data = db.read();
  const id = Number(req.params.id);
  if (!data.users.some((u) => u.id === id && u.role === 'teacher')) {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  data.users = data.users.filter((u) => u.id !== id);
  // Free up the classes and subjects this teacher was handling
  data.classes.forEach((c) => {
    if (c.formTeacherId === id) c.formTeacherId = null;
    c.subjects.forEach((s) => {
      if (s.teacherId === id) s.teacherId = null;
    });
  });
  db.write(data);
  res.json({ message: 'Teacher removed' });
});

module.exports = router;
