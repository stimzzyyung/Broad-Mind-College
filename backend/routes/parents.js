const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { safeUser, teacherClassIds } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
const DEFAULT_PASSWORD = 'parent123';

router.post('/', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const { name, email, phone = '', studentIds = [] } = req.body;
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'Name and email are required' });
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ message: 'Select at least one student for this parent account' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const data = db.read();
  if (data.users.some((user) => (user.email || '').trim().toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ message: 'That email is already used by another account' });
  }

  const selectedIds = [...new Set(studentIds.map(Number))];
  const students = selectedIds.map((id) => data.users.find((user) => user.id === id && user.role === 'student'));
  if (students.some((student) => !student)) {
    return res.status(400).json({ message: 'One or more selected students could not be found' });
  }
  if (students.some((student) => student.parentId)) {
    return res.status(409).json({ message: 'A selected student is already linked to a parent account' });
  }
  if (req.user.role === 'teacher') {
    const allowedClasses = new Set(teacherClassIds(data, req.user.id));
    if (students.some((student) => !allowedClasses.has(student.classId))) {
      return res.status(403).json({ message: 'You can only link parents to students in your classes' });
    }
  }

  const parent = {
    id: db.nextId(data.users),
    role: 'parent',
    name: name.trim(),
    email: email.trim(),
    phone: typeof phone === 'string' ? phone.trim() : '',
    password: bcrypt.hashSync(DEFAULT_PASSWORD, 8),
    address: '',
    bio: '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  data.users.push(parent);
  students.forEach((student) => {
    student.parentId = parent.id;
    student.guardianName = parent.name;
    student.guardianPhone = parent.phone;
  });

  const admins = data.users.filter((user) => user.role === 'admin').map((user) => user.id);
  notifyUsers(data, admins, {
    title: 'New parent account created',
    body: `${parent.name} was onboarded by ${req.user.name}.`,
    type: 'parent',
    link: '/admin/students',
  });

  db.write(data);
  res.status(201).json({
    parent: safeUser(parent),
    credentials: { loginId: parent.email, password: DEFAULT_PASSWORD },
  });
});

module.exports = router;
