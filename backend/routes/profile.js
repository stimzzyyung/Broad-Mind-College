const express = require('express');
const db = require('../data/db');
const { requireAuth } = require('../middleware/auth');
const { safeUser, teacherClassIds } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

// Which fields each role may edit. Students cannot rename themselves - the office does that.
const EDITABLE = {
  student: ['phone', 'address'],
  teacher: ['name', 'phone', 'address', 'bio', 'qualification'],
  admin: ['name', 'phone', 'address', 'bio'],
  parent: ['name', 'phone', 'address'],
};

function build(data, user) {
  const profile = safeUser(user);
  if (user.role === 'student') {
    const cls = data.classes.find((c) => c.id === user.classId);
    const formTeacher = cls && data.users.find((u) => u.id === cls.formTeacherId);
    profile.className = cls ? cls.name : 'Unassigned';
    profile.formTeacherName = formTeacher ? formTeacher.name : 'Not assigned';
  }
  if (user.role === 'teacher') {
    const ids = teacherClassIds(data, user.id);
    profile.classes = data.classes.filter((c) => ids.includes(c.id)).map((c) => c.name);
  }
  if (user.role === 'parent') {
    profile.children = data.users.filter((u) => u.role === 'student' && u.parentId === user.id).map((u) => u.name);
  }
  return profile;
}

// GET /api/profile
router.get('/', (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.user.id);
  res.json(build(data, user));
});

// PUT /api/profile
router.put('/', (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.user.id);
  EDITABLE[user.role].forEach((field) => {
    if (req.body[field] !== undefined) user[field] = String(req.body[field]).trim();
  });
  if (!user.name) return res.status(400).json({ message: 'Name cannot be empty' });
  db.write(data);
  res.json(build(data, user));
});

module.exports = router;
