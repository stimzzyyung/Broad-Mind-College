const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

async function classView(classId) {
  const [classRows] = await pool.execute(
    'SELECT c.*, u.name AS form_teacher_name, (SELECT COUNT(*) FROM users s WHERE s.role = ? AND s.class_id = c.id) AS student_count FROM classes c LEFT JOIN users u ON u.id = c.form_teacher_id WHERE c.id = ?',
    ['student', classId]
  );
  const row = classRows[0];
  if (!row) return null;

  const [[subjectRows], [slotRows]] = await Promise.all([
    pool.execute(
      'SELECT cs.subject, cs.teacher_id, u.name AS teacher_name FROM class_subjects cs LEFT JOIN users u ON u.id = cs.teacher_id WHERE cs.class_id = ? ORDER BY cs.id',
      [classId]
    ),
    pool.execute('SELECT day, period_index, time_slot, subject FROM timetable_slots WHERE class_id = ? ORDER BY day, period_index', [classId]),
  ]);

  const periods = [...new Set(slotRows.map((slot) => slot.time_slot))];
  const days = Object.fromEntries(WEEKDAYS.map((day) => [day, Array(periods.length).fill('Free period')]));
  slotRows.forEach((slot) => {
    if (days[slot.day]) days[slot.day][Number(slot.period_index)] = slot.subject;
  });

  return {
    id: Number(row.id),
    name: row.name,
    level: row.level || '',
    schoolSection: row.school_section || '',
    classLevel: row.class_level || '',
    formTeacherId: row.form_teacher_id === null ? null : Number(row.form_teacher_id),
    formTeacherName: row.form_teacher_name || 'Not assigned',
    studentCount: Number(row.student_count),
    subjects: subjectRows.map((subject) => ({
      name: subject.subject,
      teacherId: subject.teacher_id === null ? null : Number(subject.teacher_id),
      teacherName: subject.teacher_name || 'Not assigned',
    })),
    timetable: { periods, days },
  };
}

async function isAssignedTeacher(classId, teacherId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM classes c WHERE c.id = ? AND c.form_teacher_id = ? UNION SELECT 1 FROM class_subjects WHERE class_id = ? AND teacher_id = ? LIMIT 1',
    [classId, teacherId, classId, teacherId]
  );
  return rows.length > 0;
}

async function notifyClassStudents(classId, className) {
  await pool.execute(
    'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ? AND class_id = ?',
    [`${className} timetable updated`, 'Your class timetable has changed. Check the Classes page for the new schedule.', 'info', '/classes', 'student', classId]
  );
}

router.get('/', async (req, res, next) => {
  try {
    let query = 'SELECT id FROM classes';
    const values = [];
    if (req.user.role === 'teacher' && req.query.all !== 'true') {
      query += ' WHERE form_teacher_id = ? OR id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?)';
      values.push(req.user.id, req.user.id);
    } else if (req.user.role === 'student') {
      query = 'SELECT class_id AS id FROM users WHERE id = ? AND role = ? AND class_id IS NOT NULL';
      values.push(req.user.id, 'student');
    }
    query += ' ORDER BY id';
    const [rows] = await pool.execute(query, values);
    res.json((await Promise.all(rows.map((row) => classView(Number(row.id))))).filter(Boolean));
  } catch (err) {
    next(err);
  }
});

router.get('/subjects', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT name FROM subjects WHERE is_active = 1 ORDER BY name');
    res.json(rows.map((row) => row.name));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const classId = Number(req.params.id);
    const cls = await classView(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (req.user.role === 'teacher' && !await isAssignedTeacher(classId, req.user.id)) {
      return res.status(403).json({ message: 'This is not one of your classes' });
    }
    if (req.user.role === 'student') {
      const [studentRows] = await pool.execute('SELECT class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
      if (Number(studentRows[0]?.class_id) !== classId) return res.status(403).json({ message: 'This is not your class' });
    }
    const [students] = await pool.execute(
      'SELECT id, name, school_id AS schoolId, gender FROM users WHERE role = ? AND class_id = ? ORDER BY name',
      ['student', classId]
    );
    res.json({ ...cls, students: students.map((student) => ({ ...student, id: Number(student.id) })) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  const { name, level, formTeacherId, schoolSection, classLevel } = req.body;
  if (!name) return res.status(400).json({ message: 'Give the class a name' });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO classes (name, level, school_section, class_level, form_teacher_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), level || 'Junior', schoolSection || '', classLevel || '', formTeacherId ? Number(formTeacherId) : null]
    );
    await connection.commit();
    res.status(201).json(await classView(result.insertId));
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A class with that name already exists' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const classId = Number(req.params.id);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classRows] = await connection.execute('SELECT id FROM classes WHERE id = ? FOR UPDATE', [classId]);
    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Class not found' });
    }
    const { name, level, formTeacherId, schoolSection, classLevel, subjects } = req.body;
    const columns = [];
    const values = [];
    for (const [field, column] of [['name', 'name'], ['level', 'level'], ['schoolSection', 'school_section'], ['classLevel', 'class_level']]) {
      if (req.body[field] !== undefined) {
        columns.push(`${column} = ?`);
        values.push(field === 'name' ? String(name).trim() : req.body[field]);
      }
    }
    if (formTeacherId !== undefined) {
      columns.push('form_teacher_id = ?');
      values.push(formTeacherId ? Number(formTeacherId) : null);
    }
    if (columns.length) await connection.execute(`UPDATE classes SET ${columns.join(', ')} WHERE id = ?`, [...values, classId]);
    if (Array.isArray(subjects)) {
      await connection.execute('DELETE FROM class_subjects WHERE class_id = ?', [classId]);
      for (const subject of subjects) {
        await connection.execute(
          'INSERT INTO class_subjects (class_id, subject, teacher_id) VALUES (?, ?, ?)',
          [classId, subject.name, subject.teacherId ? Number(subject.teacherId) : null]
        );
      }
    }
    await connection.commit();
    res.json(await classView(classId));
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A class with that name already exists' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.put('/:id/timetable', requireRole('admin', 'teacher'), async (req, res, next) => {
  const classId = Number(req.params.id);
  const { periods, days } = req.body;
  if (!Array.isArray(periods) || periods.length === 0 || periods.some((period) => !period || !String(period).trim())) {
    return res.status(400).json({ message: 'Add at least one period, with a time for each' });
  }
  if (!days || typeof days !== 'object') return res.status(400).json({ message: 'Missing the weekly schedule' });
  for (const day of WEEKDAYS) {
    if (!Array.isArray(days[day]) || days[day].length !== periods.length) {
      return res.status(400).json({ message: `${day} needs a subject for every period` });
    }
    if (days[day].some((cell) => !cell || !String(cell).trim())) {
      return res.status(400).json({ message: `Fill in every period for ${day}, or use "Free period"` });
    }
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classRows] = await connection.execute('SELECT name FROM classes WHERE id = ? FOR UPDATE', [classId]);
    if (!classRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Class not found' });
    }
    if (req.user.role === 'teacher' && !await isAssignedTeacher(classId, req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Only an assigned teacher can edit this timetable' });
    }
    await connection.execute('DELETE FROM timetable_slots WHERE class_id = ?', [classId]);
    for (const day of WEEKDAYS) {
      for (const [periodIndex, period] of periods.entries()) {
        await connection.execute(
          'INSERT INTO timetable_slots (class_id, day, period_index, time_slot, subject) VALUES (?, ?, ?, ?, ?)',
          [classId, day, periodIndex, String(period).trim(), String(days[day][periodIndex]).trim()]
        );
      }
    }
    await connection.commit();
    await notifyClassStudents(classId, classRows[0].name);
    res.json(await classView(classId));
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const classId = Number(req.params.id);
    const [students] = await pool.execute('SELECT COUNT(*) AS count FROM users WHERE role = ? AND class_id = ?', ['student', classId]);
    if (Number(students[0].count)) return res.status(400).json({ message: 'Move the students out of this class before deleting it' });
    const [result] = await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Class not found' });
    res.json({ message: 'Class deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;