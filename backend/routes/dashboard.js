const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gradeFor, termRank, schoolDay } = require('../utils/helpers');
const { getSettings } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth);

async function announcements() {
  const [rows] = await pool.execute('SELECT id, title, body, author, date FROM announcements ORDER BY date DESC LIMIT 5');
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

async function assignedClasses(teacherId) {
  const [rows] = await pool.execute(
    'SELECT DISTINCT c.id, c.name, c.level, c.school_section, c.class_level, c.form_teacher_id FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ? ORDER BY c.name',
    [teacherId, teacherId]
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), formTeacherId: row.form_teacher_id === null ? null : Number(row.form_teacher_id) }));
}

async function classSubjects(classId) {
  const [rows] = await pool.execute('SELECT subject AS name, teacher_id AS teacherId FROM class_subjects WHERE class_id = ?', [classId]);
  return rows.map((row) => ({ ...row, teacherId: row.teacherId === null ? null : Number(row.teacherId) }));
}

async function classTimetable(classId) {
  const [rows] = await pool.execute('SELECT day, period_index, time_slot, subject FROM timetable_slots WHERE class_id = ? ORDER BY day, period_index', [classId]);
  const periods = [...new Set(rows.map((row) => row.time_slot))];
  const days = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  rows.forEach((row) => {
    days[row.day][Number(row.period_index)] = row.subject;
  });
  return { periods, days };
}

async function adminDashboard(notices, settings) {
  const [[counts], [feeSummary], [classes], [recentPayments], [recentStudents], [examRows], [activity]] = await Promise.all([
    pool.execute('SELECT SUM(role = \'student\') AS students, SUM(role = \'teacher\') AS teachers, SUM(role = \'parent\') AS parents FROM users'),
    pool.execute('SELECT (SELECT COALESCE(SUM(amount), 0) FROM fees WHERE term = ? AND session = ?) * (SELECT COUNT(*) FROM users WHERE role = \'student\') AS expected, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = \'success\' AND term = ? AND session = ?) AS collected', [settings?.term || '', settings?.session || '', settings?.term || '', settings?.session || '']),
    pool.execute('SELECT c.id, c.name, COUNT(s.id) AS count FROM classes c LEFT JOIN users s ON s.class_id = c.id AND s.role = ? GROUP BY c.id, c.name ORDER BY c.name', ['student']),
    pool.execute('SELECT p.id, p.amount, p.date, u.name AS student_name, f.title AS fee_title FROM payments p LEFT JOIN users u ON u.id = p.student_id LEFT JOIN fees f ON f.id = p.fee_id ORDER BY p.date DESC LIMIT 5'),
    pool.execute('SELECT s.id, s.name, s.school_id, c.name AS class_name, s.created_at FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.role = ? ORDER BY s.created_at DESC LIMIT 4', ['student']),
    pool.execute('SELECT id, title, status, opening_date, opening_time, closing_date, closing_time FROM cbt_examinations'),
    pool.execute('SELECT (SELECT COUNT(*) FROM quizzes) AS quizzes, (SELECT COUNT(*) FROM question_bank) AS questions, (SELECT COUNT(*) FROM cbt_attempts WHERE status IN (\'Submitted\', \'Auto Submitted\')) AS attempts'),
  ]);
  const [[examQuestionCount], [completedAttempts], [accessLogs], [recentResults], [noticesCount]] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS count FROM question_bank'),
    pool.execute('SELECT a.id, a.student_id, a.exam_id, a.score, a.percentage, a.grade, a.submission_time, u.name AS student_name, e.title AS exam_title FROM cbt_attempts a LEFT JOIN users u ON u.id = a.student_id LEFT JOIN cbt_examinations e ON e.id = a.exam_id WHERE a.status IN (?, ?) ORDER BY a.submission_time DESC LIMIT 5', ['Submitted', 'Auto Submitted']),
    pool.execute('SELECT l.id, l.action, l.student_id, l.exam_id, l.created_at, u.name AS student_name, e.title AS exam_title FROM cbt_access_logs l LEFT JOIN users u ON u.id = l.student_id LEFT JOIN cbt_examinations e ON e.id = l.exam_id ORDER BY l.created_at DESC LIMIT 5'),
    pool.execute('SELECT COUNT(*) AS count FROM results'),
    pool.execute('SELECT COUNT(*) AS count FROM announcements'),
  ]);
  const [[classStudents], [paymentsByMonth]] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['student']),
    pool.execute('SELECT id, amount FROM payments WHERE status = ? ORDER BY date DESC LIMIT 8', ['success']),
  ]);
  const examCount = examRows.length;
  const now = Date.now();
  const activeExams = examRows.filter((exam) => {
    const start = new Date(`${exam.opening_date}T${exam.opening_time || '00:00'}:00`).getTime();
    const end = new Date(`${exam.closing_date}T${exam.closing_time || '23:59'}:00`).getTime();
    return exam.status === 'active' || (now >= start && now <= end && !['blocked', 'cancelled', 'closed'].includes(exam.status));
  }).length;
  const scheduledExams = examRows.filter((exam) => exam.status === 'scheduled' && now < new Date(`${exam.opening_date}T${exam.opening_time || '00:00'}:00`).getTime()).length;
  const expected = Number(feeSummary[0].expected);
  const collected = Number(feeSummary[0].collected);
  return {
    role: 'admin',
    counts: {
      students: Number(counts[0].students || 0), teachers: Number(counts[0].teachers || 0),
      classes: classes.length, quizzes: Number(activity[0].quizzes), cbtExams: examCount,
      cbtQuestions: Number(examQuestionCount[0].count),
    },
    fees: { expected, collected, outstanding: expected - collected },
    studentsPerClass: classes.map((row) => ({ name: row.name, count: Number(row.count) })),
    recentPayments: recentPayments.map((row) => ({ id: Number(row.id), amount: Number(row.amount), date: row.date, studentName: row.student_name || '', feeTitle: row.fee_title || '' })),
    recentStudents: recentStudents.map((row) => ({ id: Number(row.id), name: row.name, schoolId: row.school_id, className: row.class_name || '' })),
    cbt: {
      totalExams: examCount, activeExams, scheduledExams, totalQuestions: Number(activity[0].questions),
      totalStudentsWhoTookExams: Number(activity[0].attempts), totalCompletedAttempts: Number(activity[0].attempts),
      recentActivity: accessLogs.map((row) => ({ id: Number(row.id), action: row.action, studentName: row.student_name || 'Student', examTitle: row.exam_title || 'Exam', timestamp: row.created_at })),
      recentResults: completedAttempts.map((row) => ({ id: Number(row.id), studentName: row.student_name || 'Student', examTitle: row.exam_title || 'Exam', score: row.score, percentage: row.percentage, grade: row.grade, date: row.submission_time })),
    },
    announcements: notices,
    _activityCounts: { notices: Number(noticesCount[0].count), results: Number(recentResults[0].count), students: Number(classStudents[0].count), payments: paymentsByMonth.length },
  };
}

async function teacherDashboard(user, notices, day, isToday) {
  const classes = await assignedClasses(user.id);
  const classIds = classes.map((cls) => cls.id);
  const subjectsByClass = await Promise.all(classes.map(async (cls) => ({
    ...cls,
    subjects: await classSubjects(cls.id),
    timetable: await classTimetable(cls.id),
  })));
  const dashboardClasses = await Promise.all(subjectsByClass.map(async (cls) => {
    const [studentRows] = await pool.execute('SELECT COUNT(*) AS count FROM users WHERE role = ? AND class_id = ?', ['student', cls.id]);
    return {
      id: cls.id,
      name: cls.name,
      studentCount: Number(studentRows[0].count),
      subjects: cls.subjects.filter((subject) => Number(subject.teacherId) === Number(user.id)).map((subject) => subject.name),
      isFormTeacher: Number(cls.form_teacher_id) === Number(user.id),
    };
  }));
  const [[studentCount], [quizRows], [recentSubmissions], [exams], [questionCount], [accessRows]] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS count FROM users WHERE role = ? AND class_id IN (SELECT c.id FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ?)', ['student', user.id, user.id]),
    pool.execute('SELECT id FROM quizzes WHERE teacher_id = ?', [user.id]),
    pool.execute('SELECT s.id, s.score, s.total, s.submitted_at, u.name AS student_name, q.title AS quiz_title FROM submissions s JOIN quizzes q ON q.id = s.quiz_id JOIN users u ON u.id = s.student_id WHERE q.teacher_id = ? ORDER BY s.submitted_at DESC LIMIT 5', [user.id]),
    pool.execute('SELECT id, title, class_id, status, opening_date, opening_time, closing_date, closing_time, created_by_id FROM cbt_examinations WHERE created_by_id = ? OR class_id IN (SELECT c.id FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ?)', [user.id, user.id, user.id]),
    pool.execute('SELECT COUNT(*) AS count FROM question_bank'),
    pool.execute('SELECT id, action, student_id, exam_id, created_at FROM cbt_access_logs ORDER BY created_at DESC LIMIT 100'),
  ]);
  const completed = await pool.execute(
    'SELECT a.id, a.student_id, a.exam_id, a.score, a.percentage, a.grade, a.submission_time, u.name AS student_name, e.title AS exam_title FROM cbt_attempts a JOIN cbt_examinations e ON e.id = a.exam_id LEFT JOIN users u ON u.id = a.student_id WHERE a.status IN (?, ?) AND e.id IN (SELECT id FROM cbt_examinations WHERE created_by_id = ? OR class_id IN (SELECT c.id FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.form_teacher_id = ? OR cs.teacher_id = ?)) ORDER BY a.submission_time DESC LIMIT 5',
    ['Submitted', 'Auto Submitted', user.id, user.id, user.id]
  );
  const lessons = [];
  for (const cls of subjectsByClass) {
    const subjects = cls.subjects.filter((subject) => Number(subject.teacherId) === Number(user.id)).map((subject) => subject.name);
    (cls.timetable.days[day] || []).forEach((subject, index) => {
      if (subjects.includes(subject)) lessons.push({ time: cls.timetable.periods[index], subject, className: cls.name, index });
    });
  }
  lessons.sort((a, b) => a.index - b.index);
  const now = Date.now();
  const active = exams.filter((exam) => exam.status === 'active' || (now >= new Date(`${exam.opening_date}T${exam.opening_time || '00:00'}:00`).getTime() && now <= new Date(`${exam.closing_date}T${exam.closing_time || '23:59'}:00`).getTime() && !['blocked', 'cancelled', 'closed'].includes(exam.status)));
  const scheduled = exams.filter((exam) => exam.status === 'scheduled' && now < new Date(`${exam.opening_date}T${exam.opening_time || '00:00'}:00`).getTime());
  const completedExams = exams.filter((exam) => exam.status === 'closed' || now > new Date(`${exam.closing_date}T${exam.closing_time || '23:59'}:00`).getTime());
  const examIds = new Set(exams.map((exam) => Number(exam.id)));
  const recentActivity = accessRows.filter((row) => examIds.has(Number(row.exam_id))).slice(0, 5).map((row) => ({ id: Number(row.id), action: row.action, studentName: 'Student', examTitle: exams.find((exam) => Number(exam.id) === Number(row.exam_id))?.title || 'Exam', timestamp: row.created_at }));
  return {
    role: 'teacher',
    counts: {
      classes: classes.length, students: Number(studentCount[0].count), quizzes: quizRows.length,
      submissions: recentSubmissions.length, cbtExams: exams.length, cbtQuestions: Number(questionCount[0].count),
    },
    classes: dashboardClasses,
    today: { day, isToday, lessons },
    recentSubmissions: recentSubmissions.map((row) => ({ id: Number(row.id), studentName: row.student_name, quizTitle: row.quiz_title, score: Number(row.score), total: Number(row.total), date: row.submitted_at })),
    cbt: {
      totalQuestions: Number(questionCount[0].count), activeExams: active.length, scheduledExams: scheduled.length,
      completedExams: completedExams.length, totalCompletedAttempts: completed[0].length,
      studentResults: completed[0].map((row) => ({ id: Number(row.id), studentName: row.student_name || 'Student', examTitle: row.exam_title, score: row.score, percentage: row.percentage, grade: row.grade, date: row.submission_time })),
      recentActivity,
    },
    announcements: notices,
  };
}

async function parentDashboard(user, notices, settings) {
  const [children] = await pool.execute(
    'SELECT s.id, s.name, s.school_id, c.name AS class_name, GREATEST(COALESCE((SELECT SUM(f.amount) FROM fees f WHERE f.term = ? AND f.session = ?), 0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.id AND p.status = ? AND p.term = ? AND p.session = ?), 0), 0) AS balance FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.role = ? AND s.parent_id = ? ORDER BY s.name',
    [settings?.term || '', settings?.session || '', 'success', settings?.term || '', settings?.session || '', 'student', user.id]
  );
  const rows = children.map((child) => ({ id: Number(child.id), name: child.name, schoolId: child.school_id, className: child.class_name || 'Unassigned', balance: Number(child.balance) }));
  return { role: 'parent', children: rows, outstanding: rows.reduce((sum, child) => sum + child.balance, 0), announcements: notices };
}

async function studentDashboard(user, notices, settings, day, isToday) {
  const [studentRows] = await pool.execute('SELECT u.*, c.name AS class_name, c.class_level, c.form_teacher_id, f.name AS form_teacher_name FROM users u LEFT JOIN classes c ON c.id = u.class_id LEFT JOIN users f ON f.id = c.form_teacher_id WHERE u.id = ? AND u.role = ?', [user.id, 'student']);
  const student = studentRows[0];
  if (!student) return null;
  const classId = student.class_id === null ? null : Number(student.class_id);
  const [[fees], [timetable], [results], [quizzes], [exams], [attempts]] = await Promise.all([
    pool.execute('SELECT COALESCE((SELECT SUM(amount) FROM fees WHERE term = ? AND session = ?), 0) AS expected, COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = ? AND status = ? AND term = ? AND session = ?), 0) AS paid', [settings?.term || '', settings?.session || '', user.id, 'success', settings?.term || '', settings?.session || '']),
    classId ? pool.execute('SELECT period_index, time_slot, subject FROM timetable_slots WHERE class_id = ? AND day = ? ORDER BY period_index', [classId, day]) : [[]],
    pool.execute('SELECT term, session, total FROM results WHERE student_id = ? ORDER BY session DESC, term DESC', [user.id]),
    classId ? pool.execute('SELECT q.id, q.title, q.subject, q.type, q.due_date, q.duration_mins, COUNT(qq.id) AS question_count FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id LEFT JOIN submissions s ON s.quiz_id = q.id AND s.student_id = ? WHERE q.class_id = ? AND s.id IS NULL AND (q.due_date IS NULL OR q.due_date >= CURRENT_DATE()) GROUP BY q.id ORDER BY q.created_at DESC', [user.id, classId]) : [[]],
    pool.execute('SELECT e.* FROM cbt_examinations e WHERE e.class_id = ? OR (e.class_id IS NULL AND e.class_level = ?)', [classId || 0, student.class_level || '']),
    pool.execute('SELECT * FROM cbt_attempts WHERE student_id = ? ORDER BY start_time', [user.id]),
  ]);
  const expected = Number(fees[0].expected);
  const paid = Number(fees[0].paid);
  let lastResult = null;
  if (results.length) {
    results.sort((a, b) => termRank(b.term, b.session) - termRank(a.term, a.session));
    const newest = results[0];
    const [rankingRows] = await pool.execute(
      'SELECT u.id, AVG(r.total) AS average FROM users u JOIN results r ON r.student_id = u.id WHERE u.role = ? AND u.class_id = ? AND r.term = ? AND r.session = ? GROUP BY u.id ORDER BY average DESC',
      ['student', classId, newest.term, newest.session]
    );
    const rankIndex = rankingRows.findIndex((row) => Number(row.id) === Number(user.id));
    const studentResults = results.filter((row) => row.term === newest.term && row.session === newest.session);
    const average = Number((studentResults.reduce((sum, row) => sum + Number(row.total), 0) / studentResults.length).toFixed(1));
    if (rankIndex >= 0) lastResult = { term: newest.term, session: newest.session, average, grade: gradeFor(average).grade, position: rankIndex + 1, outOf: rankingRows.length };
  }
  const examsForStudent = exams.map((exam) => ({
    id: Number(exam.id), title: exam.title, subject: exam.subject, status: exam.status,
    openingDate: exam.opening_date, openingTime: exam.opening_time,
    closingDate: exam.closing_date, closingTime: exam.closing_time,
    durationMins: Number(exam.duration_mins), totalMarks: Number(exam.total_marks),
    numberQuestions: Number(exam.number_questions),
  }));
  const attemptsForStudent = attempts.map((attempt) => ({
    ...attempt, id: Number(attempt.id), examId: Number(attempt.exam_id), studentId: Number(attempt.student_id),
    submissionTime: attempt.submission_time, expectedEndTime: attempt.expected_end_time,
  }));
  const availableExams = [];
  const upcomingExams = [];
  const inProgressExams = [];
  const completedExams = [];
  const now = Date.now();
  for (const exam of examsForStudent) {
    const start = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();
    const end = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();
    const examAttempts = attemptsForStudent.filter((attempt) => attempt.examId === exam.id);
    const activeAttempt = examAttempts.find((attempt) => attempt.status === 'In Progress');
    const submitted = examAttempts.find((attempt) => ['Submitted', 'Auto Submitted'].includes(attempt.status));
    if (activeAttempt) inProgressExams.push({ ...exam, attemptId: activeAttempt.id });
    else if (submitted) completedExams.push({ ...exam, score: submitted.score, percentage: submitted.percentage, grade: submitted.grade, submissionTime: submitted.submissionTime });
    else if (exam.status === 'active' || (!['blocked', 'cancelled', 'closed'].includes(exam.status) && now >= start && now <= end)) availableExams.push(exam);
    else if (now < start && exam.status !== 'cancelled') upcomingExams.push({ ...exam, opensInSeconds: Math.max(0, Math.floor((start - now) / 1000)) });
  }
  return {
    role: 'student', className: student.class_name || 'Unassigned', formTeacher: student.form_teacher_name || null,
    fees: { expected, paid, balance: expected - paid }, lastResult,
    today: { day, isToday, lessons: timetable.map((row) => ({ time: row.time_slot, subject: row.subject })) },
    pendingQuizzes: quizzes.map((quiz) => ({ id: Number(quiz.id), title: quiz.title, subject: quiz.subject, type: quiz.type, dueDate: quiz.due_date, durationMins: Number(quiz.duration_mins), questionCount: Number(quiz.question_count) })),
    cbt: { availableExams, upcomingExams, inProgressExams, completedExams, results: completedExams },
    announcements: notices,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const notices = await announcements();
    const settings = await getSettings(pool);
    const { day, isToday } = schoolDay();
    let response;
    if (req.user.role === 'admin') response = await adminDashboard(notices, settings);
    else if (req.user.role === 'teacher') response = await teacherDashboard(req.user, notices, day, isToday);
    else if (req.user.role === 'parent') response = await parentDashboard(req.user, notices, settings);
    else response = await studentDashboard(req.user, notices, settings, day, isToday);
    if (!response) return res.status(404).json({ message: 'Account not found' });
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', requireRole('admin'), async (req, res, next) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'Add a title and a message' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO announcements (title, body, author, posted_by) VALUES (?, ?, ?, ?)',
      [title.trim(), body.trim(), req.user.name, req.user.id]
    );
    const noticeBody = body.trim().length > 120 ? `${body.trim().slice(0, 117)}...` : body.trim();
    await connection.execute(
      'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role <> ?',
      [`Notice: ${title.trim()}`, noticeBody, 'announcement', '', 'admin']
    );
    await connection.commit();
    const [rows] = await pool.execute('SELECT id, title, body, author, date FROM announcements WHERE id = ?', [result.insertId]);
    res.status(201).json({ ...rows[0], id: Number(rows[0].id) });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.delete('/announcements/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM announcements WHERE id = ?', [Number(req.params.id)]);
    res.json({ message: 'Notice removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;