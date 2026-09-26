const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { SCHOOL_CODE, safeUser, teacherClassIds } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_PASSWORD = 'student123';

function withClass(data, student) {
  const cls = data.classes.find((c) => c.id === student.classId);
  return { ...safeUser(student), className: cls ? cls.name : 'Unassigned' };
}

// GET /api/students?classId=1&search=chi
// admin sees all, teachers see their own classes, parents see only their own children
router.get('/', requireRole('admin', 'teacher', 'parent'), (req, res) => {
  const data = db.read();
  const { classId, search } = req.query;

  let list = data.users.filter((u) => u.role === 'student');
  if (req.user.role === 'teacher') {
    const myClasses = teacherClassIds(data, req.user.id);
    list = list.filter((s) => myClasses.includes(s.classId));
  }
  if (req.user.role === 'parent') {
    list = list.filter((s) => s.parentId === req.user.id);
  }
  if (classId) list = list.filter((s) => s.classId === Number(classId));
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((s) => s.name.toLowerCase().includes(q) || s.schoolId.toLowerCase().includes(q));
  }
  res.json(list.map((s) => withClass(data, s)));
});

// POST /api/students  – register a new student
// Admins and teachers register any student. Parents can register their own children from the parent portal;
// the account is linked to them with parentId, and their own contact details fill the guardian fields.
router.post('/', requireRole('admin', 'teacher', 'parent'), (req, res) => {
  const { firstName, lastName, gender, dob, classId, guardianName, guardianPhone, address, email } = req.body;

  if (!firstName || !lastName || !gender || !dob || !classId) {
    return res.status(400).json({ message: 'Please fill in all the required fields' });
  }
  if ((req.user.role === 'admin' || req.user.role === 'teacher') && (!guardianName || !guardianPhone)) {
    return res.status(400).json({ message: 'Please fill in all the required fields' });
  }

  const data = db.read();
  if (!data.classes.some((c) => c.id === Number(classId))) {
    return res.status(400).json({ message: 'Choose a valid class' });
  }
  if (email && data.users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'That email is already used by another account' });
  }

  // Make a school ID like CVC/26/010
  const year = String(new Date().getFullYear()).slice(-2);
  let count = data.users.filter((u) => u.role === 'student').length + 1;
  let schoolId = `${SCHOOL_CODE}/${year}/${String(count).padStart(3, '0')}`;
  while (data.users.some((u) => u.schoolId === schoolId)) {
    count += 1;
    schoolId = `${SCHOOL_CODE}/${year}/${String(count).padStart(3, '0')}`;
  }

  // A parent registering their own child is the guardian by default
  let parentId = null;
  let guardian = { name: guardianName || '', phone: guardianPhone || '' };
  if (req.user.role === 'parent') {
    const parent = data.users.find((u) => u.id === req.user.id);
    parentId = parent.id;
    guardian = { name: guardianName || parent.name, phone: guardianPhone || parent.phone };
  }

  const student = {
    id: db.nextId(data.users),
    role: 'student',
    schoolId,
    name: `${firstName.trim()} ${lastName.trim()}`,
    gender,
    dob,
    email: email ? email.trim() : '',
    phone: '',
    password: bcrypt.hashSync(DEFAULT_PASSWORD, 8),
    classId: Number(classId),
    parentId,
    guardianName: guardian.name.trim(),
    guardianPhone: guardian.phone.trim(),
    address: address || '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  data.users.push(student);

  if (req.user.role === 'parent') {
    const cls = data.classes.find((c) => c.id === Number(classId));
    const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
    notifyUsers(data, admins, {
      title: 'New student registered',
      body: `${student.name} was registered by a parent into ${cls ? cls.name : 'a class'}.`,
      type: 'student',
      link: '/admin/students',
    });
  }

  if (req.user.role === 'teacher') {
    const cls = data.classes.find((c) => c.id === Number(classId));
    const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
    notifyUsers(data, admins, {
      title: 'New student registered',
      body: `${student.name} was registered by teacher ${req.user.name} into ${cls ? cls.name : 'a class'}.`,
      type: 'student',
      link: '/admin/students',
    });
  }

  db.write(data);

  res.status(201).json({
    student: withClass(data, student),
    credentials: { loginId: schoolId, password: DEFAULT_PASSWORD },
  });
});

// POST /api/students/bulk  { rows: [{ firstName, lastName, gender, dob, classId, guardianName, guardianPhone, address, email }] }
// Admin & Teacher – register many students at once, e.g. pasted from a spreadsheet.
router.post('/bulk', requireRole('admin', 'teacher'), (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'Add at least one row' });
  }
  if (rows.length > 200) {
    return res.status(400).json({ message: 'Please register at most 200 students at a time' });
  }

  const data = db.read();
  const results = [];
  let created = 0;

  rows.forEach((row, i) => {
    const rowNum = i + 1;
    const firstName = (row.firstName || '').toString().trim();
    const lastName = (row.lastName || '').toString().trim();
    const gender = (row.gender || '').toString().trim();
    const dob = (row.dob || '').toString().trim();
    const classId = row.classId;
    const guardianName = (row.guardianName || '').toString().trim();
    const guardianPhone = (row.guardianPhone || '').toString().trim();
    const email = (row.email || '').toString().trim();
    const address = (row.address || '').toString().trim();

    if (!firstName || !lastName || !gender || !dob || !classId || !guardianName || !guardianPhone) {
      results.push({ row: rowNum, ok: false, message: 'Missing required fields' });
      return;
    }
    const cls = data.classes.find((c) => c.id === Number(classId));
    if (!cls) {
      results.push({ row: rowNum, ok: false, message: 'Unknown class' });
      return;
    }
    if (email && data.users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) {
      results.push({ row: rowNum, ok: false, message: 'Email already used' });
      return;
    }

    const year = String(new Date().getFullYear()).slice(-2);
    let count = data.users.filter((u) => u.role === 'student').length + 1;
    let schoolId = `${SCHOOL_CODE}/${year}/${String(count).padStart(3, '0')}`;
    while (data.users.some((u) => u.schoolId === schoolId)) {
      count += 1;
      schoolId = `${SCHOOL_CODE}/${year}/${String(count).padStart(3, '0')}`;
    }

    const student = {
      id: db.nextId(data.users),
      role: 'student',
      schoolId,
      name: `${firstName} ${lastName}`,
      gender,
      dob,
      email,
      phone: '',
      password: bcrypt.hashSync(DEFAULT_PASSWORD, 8),
      classId: Number(classId),
      parentId: null,
      guardianName,
      guardianPhone,
      address,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    data.users.push(student);
    created += 1;
    results.push({ row: rowNum, ok: true, name: student.name, className: cls.name, loginId: schoolId, password: DEFAULT_PASSWORD });
  });

  if (created > 0) {
    if (req.user.role === 'teacher') {
      const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
      notifyUsers(data, admins, {
        title: 'Bulk students registered',
        body: `${created} student(s) were registered by teacher ${req.user.name}.`,
        type: 'student',
        link: '/admin/students',
      });
    }
    db.write(data);
  }
  res.status(created > 0 ? 201 : 400).json({
    message: `${created} of ${rows.length} student${rows.length === 1 ? '' : 's'} registered`,
    created,
    results,
  });
});

// PUT /api/students/:id  – edit a student (admin only)
router.put('/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const student = data.users.find((u) => u.id === Number(req.params.id) && u.role === 'student');
  if (!student) return res.status(404).json({ message: 'Student not found' });

  const allowed = ['name', 'gender', 'dob', 'guardianName', 'guardianPhone', 'address', 'status'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) student[field] = req.body[field];
  });
  if (req.body.classId) student.classId = Number(req.body.classId);

  db.write(data);
  res.json(withClass(data, student));
});

// DELETE /api/students/:id  – remove a student and everything that belongs to them
router.delete('/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const id = Number(req.params.id);
  const exists = data.users.some((u) => u.id === id && u.role === 'student');
  if (!exists) return res.status(404).json({ message: 'Student not found' });

  data.users = data.users.filter((u) => u.id !== id);
  data.payments = data.payments.filter((p) => p.studentId !== id);
  data.results = data.results.filter((r) => r.studentId !== id);
  data.submissions = data.submissions.filter((s) => s.studentId !== id);
  db.write(data);
  res.json({ message: 'Student removed' });
});

module.exports = router;
