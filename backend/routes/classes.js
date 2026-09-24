const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { teacherClassIds } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_SUBJECTS = [
  'Mathematics', 'English Language', 'Basic Science', 'Civic Education', 'Computer Studies', 'Social Studies',
];
const PERIODS = ['08:00 - 08:40', '08:40 - 09:20', '09:20 - 10:00', '10:30 - 11:10', '11:10 - 11:50', '11:50 - 12:30'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function teacherName(data, id) {
  const t = data.users.find((u) => u.id === id);
  return t ? t.name : 'Not assigned';
}

// Adds teacher names and student counts so the frontend has less work to do
function describe(data, cls) {
  return {
    ...cls,
    formTeacherName: teacherName(data, cls.formTeacherId),
    studentCount: data.users.filter((u) => u.role === 'student' && u.classId === cls.id).length,
    subjects: cls.subjects.map((s) => ({ ...s, teacherName: teacherName(data, s.teacherId) })),
  };
}

// GET /api/classes  – admin: all classes, teacher: their classes, student: their own class
router.get('/', (req, res) => {
  const data = db.read();
  let list = data.classes;

  if (req.user.role === 'teacher') {
    const mine = teacherClassIds(data, req.user.id);
    list = list.filter((c) => mine.includes(c.id));
  }
  if (req.user.role === 'student') {
    const me = data.users.find((u) => u.id === req.user.id);
    list = list.filter((c) => c.id === me.classId);
  }
  res.json(list.map((c) => describe(data, c)));
});

// GET /api/classes/:id  – full details with the class list
router.get('/:id', (req, res) => {
  const data = db.read();
  const cls = data.classes.find((c) => c.id === Number(req.params.id));
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  if (req.user.role === 'teacher' && !teacherClassIds(data, req.user.id).includes(cls.id)) {
    return res.status(403).json({ message: 'This is not one of your classes' });
  }
  if (req.user.role === 'student') {
    const me = data.users.find((u) => u.id === req.user.id);
    if (me.classId !== cls.id) return res.status(403).json({ message: 'This is not your class' });
  }

  const students = data.users
    .filter((u) => u.role === 'student' && u.classId === cls.id)
    .map((s) => ({ id: s.id, name: s.name, schoolId: s.schoolId, gender: s.gender }));

  res.json({ ...describe(data, cls), students });
});

// POST /api/classes  – create a class (admin only)
router.post('/', requireRole('admin'), (req, res) => {
  const { name, level, formTeacherId } = req.body;
  if (!name) return res.status(400).json({ message: 'Give the class a name' });

  const data = db.read();
  if (data.classes.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).json({ message: 'A class with that name already exists' });
  }

  const timetable = { periods: PERIODS, days: {} };
  WEEKDAYS.forEach((day, d) => {
    timetable.days[day] = PERIODS.map((_, p) => DEFAULT_SUBJECTS[(p + d) % DEFAULT_SUBJECTS.length]);
  });

  const cls = {
    id: db.nextId(data.classes),
    name: name.trim(),
    level: level || 'Junior',
    formTeacherId: formTeacherId ? Number(formTeacherId) : null,
    subjects: DEFAULT_SUBJECTS.map((s) => ({ name: s, teacherId: null })),
    timetable,
  };
  data.classes.push(cls);
  db.write(data);
  res.status(201).json(describe(data, cls));
});

// PUT /api/classes/:id  – change the form teacher or who teaches each subject (admin only)
router.put('/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const cls = data.classes.find((c) => c.id === Number(req.params.id));
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const { name, formTeacherId, subjects } = req.body;
  if (name) cls.name = name.trim();
  if (formTeacherId !== undefined) cls.formTeacherId = formTeacherId ? Number(formTeacherId) : null;
  if (Array.isArray(subjects)) {
    cls.subjects = subjects.map((s) => ({ name: s.name, teacherId: s.teacherId ? Number(s.teacherId) : null }));
  }
  db.write(data);
  res.json(describe(data, cls));
});

// PUT /api/classes/:id/timetable  { periods: [...], days: { Monday: [...], ... } }  (admin only)
// Replaces the whole weekly timetable for a class.
router.put('/:id/timetable', requireRole('admin'), (req, res) => {
  const data = db.read();
  const cls = data.classes.find((c) => c.id === Number(req.params.id));
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const { periods, days } = req.body;

  if (!Array.isArray(periods) || periods.length === 0 || periods.some((p) => !p || !String(p).trim())) {
    return res.status(400).json({ message: 'Add at least one period, with a time for each' });
  }
  if (!days || typeof days !== 'object') {
    return res.status(400).json({ message: 'Missing the weekly schedule' });
  }
  for (const day of WEEKDAYS) {
    const row = days[day];
    if (!Array.isArray(row) || row.length !== periods.length) {
      return res.status(400).json({ message: `${day} needs a subject for every period` });
    }
    if (row.some((cell) => !cell || !String(cell).trim())) {
      return res.status(400).json({ message: `Fill in every period for ${day}, or use "Free period"` });
    }
  }

  cls.timetable = {
    periods: periods.map((p) => String(p).trim()),
    days: Object.fromEntries(WEEKDAYS.map((day) => [day, days[day].map((cell) => String(cell).trim())])),
  };

  const classmates = data.users.filter((u) => u.role === 'student' && u.classId === cls.id).map((u) => u.id);
  notifyUsers(data, classmates, {
    title: `${cls.name} timetable updated`,
    body: 'Your class timetable has changed. Check the Classes page for the new schedule.',
    type: 'info',
    link: '/classes',
  });

  db.write(data);
  res.json(describe(data, cls));
});

// DELETE /api/classes/:id  – only empty classes can be deleted
router.delete('/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const id = Number(req.params.id);
  if (data.users.some((u) => u.role === 'student' && u.classId === id)) {
    return res.status(400).json({ message: 'Move the students out of this class before deleting it' });
  }
  data.classes = data.classes.filter((c) => c.id !== id);
  db.write(data);
  res.json({ message: 'Class deleted' });
});

module.exports = router;
