const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gradeFor, termRank } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

function availableTerms(results) {
  const terms = [];
  for (const result of results) {
    if (!terms.some((item) => item.term === result.term && item.session === result.session)) {
      terms.push({ term: result.term, session: result.session });
    }
  }
  return terms.sort((a, b) => termRank(b.term, b.session) - termRank(a.term, a.session));
}

async function teacherHasClass(classId, teacherId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM classes WHERE id = ? AND form_teacher_id = ? UNION SELECT 1 FROM class_subjects WHERE class_id = ? AND teacher_id = ? LIMIT 1',
    [classId, teacherId, classId, teacherId]
  );
  return rows.length > 0;
}

async function classRanking(classId, term, session) {
  const [rows] = await pool.execute(
    'SELECT u.id, u.name, u.school_id AS schoolId, COUNT(r.id) AS subjects, COALESCE(SUM(r.total), 0) AS total, AVG(r.total) AS average FROM users u JOIN results r ON r.student_id = u.id WHERE u.role = ? AND u.class_id = ? AND r.term = ? AND r.session = ? GROUP BY u.id, u.name, u.school_id ORDER BY average DESC, u.name',
    ['student', classId, term, session]
  );
  let previousAverage = null;
  let previousPosition = 0;
  return rows.map((row, index) => {
    const average = Number(Number(row.average).toFixed(1));
    const position = average === previousAverage ? previousPosition : index + 1;
    previousAverage = average;
    previousPosition = position;
    return {
      id: Number(row.id), name: row.name, schoolId: row.schoolId,
      subjects: Number(row.subjects), total: Number(row.total), average,
      position, grade: gradeFor(average).grade,
    };
  });
}

router.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const [users] = await pool.execute('SELECT id, name, school_id, class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
    const me = users[0];
    if (!me) return res.status(404).json({ message: 'Student account not found' });
    const [mine] = await pool.execute(
      'SELECT id, student_id AS studentId, class_id AS classId, subject, term, session, ca, exam, total, teacher_id AS teacherId FROM results WHERE student_id = ? ORDER BY session DESC, term DESC, subject',
      [me.id]
    );
    const terms = availableTerms(mine);
    const term = req.query.term || terms[0]?.term;
    const session = req.query.session || terms[0]?.session;
    if (!term) return res.json({ terms, results: [], summary: null });

    const rows = mine.filter((result) => result.term === term && result.session === session).map((result) => ({ ...result, ...gradeFor(Number(result.total)) }));
    let summary = null;
    let ranking = [];
    if (rows.length && me.class_id !== null) {
      const total = rows.reduce((sum, result) => sum + Number(result.total), 0);
      const average = Number((total / rows.length).toFixed(1));
      ranking = await classRanking(Number(me.class_id), term, session);
      const mineRank = ranking.find((row) => row.id === Number(me.id));
      summary = { total, average, grade: gradeFor(average).grade, position: mineRank?.position || null, outOf: ranking.length, subjects: rows.length };
    }
    const [classes] = await pool.execute('SELECT name FROM classes WHERE id = ?', [me.class_id]);
    const [settingsRows] = await pool.execute('SELECT * FROM settings ORDER BY id LIMIT 1');
    const settings = settingsRows[0] ? {
      schoolName: settingsRows[0].school_name, motto: settingsRows[0].motto,
      session: settingsRows[0].session, term: settingsRows[0].term,
      address: settingsRows[0].address, phone: settingsRows[0].phone, email: settingsRows[0].email,
    } : null;
    res.json({
      terms, term, session, results: rows, summary,
      student: { name: me.name, schoolId: me.school_id, className: classes[0]?.name || '' },
      school: settings,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const { classId, subject, term, session } = req.query;
    if (req.user.role === 'teacher' && !await teacherHasClass(Number(classId), req.user.id)) {
      return res.status(403).json({ message: 'This is not one of your classes' });
    }
    const [rows] = await pool.execute(
      'SELECT id, student_id AS studentId, class_id AS classId, subject, term, session, ca, exam, total, teacher_id AS teacherId FROM results WHERE class_id = ? AND subject = ? AND term = ? AND session = ? ORDER BY student_id',
      [Number(classId), subject, term, session]
    );
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), studentId: Number(row.studentId), classId: Number(row.classId), teacherId: row.teacherId === null ? null : Number(row.teacherId) })));
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', requireRole('teacher', 'admin'), async (req, res, next) => {
  const { classId: rawClassId, subject, term, session, scores } = req.body;
  if (!rawClassId || !subject || !term || !session || !Array.isArray(scores)) {
    return res.status(400).json({ message: 'Choose a class, subject and term first' });
  }
  const classId = Number(rawClassId);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classes] = await connection.execute('SELECT id FROM classes WHERE id = ?', [classId]);
    if (!classes.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Class not found' });
    }
    const [subjects] = await connection.execute(
      'SELECT teacher_id FROM class_subjects WHERE class_id = ? AND subject = ?',
      [classId, subject]
    );
    if (!subjects.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'That subject is not taught in this class' });
    }
    if (req.user.role === 'teacher' && Number(subjects[0].teacher_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'You are not the teacher for this subject' });
    }

    const validated = [];
    for (const row of scores) {
      if (row.ca === '' || row.ca == null || row.exam === '' || row.exam == null) continue;
      const [students] = await connection.execute(
        'SELECT id, name FROM users WHERE id = ? AND role = ? AND class_id = ?',
        [Number(row.studentId), 'student', classId]
      );
      if (!students.length) continue;
      const ca = Number(row.ca);
      const exam = Number(row.exam);
      if (!Number.isFinite(ca) || !Number.isFinite(exam) || ca < 0 || ca > 40 || exam < 0 || exam > 60) {
        await connection.rollback();
        return res.status(400).json({ message: `Check the scores for ${students[0].name}. CA is out of 40 and exam is out of 60.` });
      }
      validated.push({ studentId: Number(students[0].id), ca, exam });
    }

    for (const row of validated) {
      await connection.execute(
        'INSERT INTO results (student_id, class_id, subject, term, session, ca, exam, total, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), ca = VALUES(ca), exam = VALUES(exam), total = VALUES(total), teacher_id = VALUES(teacher_id)',
        [row.studentId, classId, subject, term, session, row.ca, row.exam, row.ca + row.exam, req.user.id]
      );
    }
    if (validated.length) {
      const studentPlaceholders = validated.map(() => '?').join(', ');
      await connection.execute(
        `INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ? AND class_id = ? AND id IN (${studentPlaceholders})`,
        [`${subject} result posted`, `Your ${subject} score for ${term}, ${session} is now available.`, 'result', '/results', 'student', classId, ...validated.map((row) => row.studentId)]
      );
    }
    await connection.commit();
    res.json({ message: `Saved ${validated.length} result${validated.length === 1 ? '' : 's'}`, saved: validated.length });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.get('/class-summary', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const { classId: rawClassId, term, session } = req.query;
    const classId = Number(rawClassId);
    if (req.user.role === 'teacher' && !await teacherHasClass(classId, req.user.id)) {
      return res.status(403).json({ message: 'This is not one of your classes' });
    }
    const ranking = await classRanking(classId, term, session);
    const [rows] = await pool.execute(
      'SELECT subject, ROUND(AVG(total), 1) AS average, COUNT(*) AS count FROM results WHERE class_id = ? AND term = ? AND session = ? GROUP BY subject ORDER BY subject',
      [classId, term, session]
    );
    res.json({ ranking, subjectAverages: rows.map((row) => ({ subject: row.subject, average: Number(row.average), count: Number(row.count) })) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;