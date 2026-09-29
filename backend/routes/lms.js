const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);
const parseJson = (value, fallback) => (typeof value === 'string' ? JSON.parse(value) : value) || fallback;

async function loadQuiz(id) {
  const [quizRows] = await pool.execute(
    'SELECT q.*, c.name AS class_name, u.name AS teacher_name FROM quizzes q LEFT JOIN classes c ON c.id = q.class_id LEFT JOIN users u ON u.id = q.teacher_id WHERE q.id = ? LIMIT 1',
    [id]
  );
  const row = quizRows[0];
  if (!row) return null;
  const [[questionRows], [submissionRows]] = await Promise.all([
    pool.execute('SELECT id, question, option_a, option_b, option_c, option_d, answer_index FROM quiz_questions WHERE quiz_id = ? ORDER BY id', [id]),
    pool.execute('SELECT id, quiz_id, student_id, answers, score, total, submitted_at FROM submissions WHERE quiz_id = ? ORDER BY submitted_at', [id]),
  ]);
  return {
    id: Number(row.id), title: row.title, subject: row.subject,
    classId: Number(row.class_id), className: row.class_name || '',
    teacherId: Number(row.teacher_id), teacherName: row.teacher_name || 'Unknown',
    type: row.type, durationMins: Number(row.duration_mins),
    dueDate: row.due_date || '', createdAt: row.created_at,
    questions: questionRows.map((question) => ({
      id: Number(question.id), question: question.question,
      options: [question.option_a, question.option_b, question.option_c, question.option_d].filter(Boolean),
      answerIndex: Number(question.answer_index),
    })),
    submissions: submissionRows.map((submission) => ({
      id: Number(submission.id), quizId: Number(submission.quiz_id), studentId: Number(submission.student_id),
      answers: parseJson(submission.answers, []), score: Number(submission.score),
      total: Number(submission.total), submittedAt: submission.submitted_at,
    })),
  };
}

function summarise(quiz, user) {
  const averagePercent = quiz.submissions.length
    ? Math.round(quiz.submissions.reduce((sum, submission) => sum + (submission.score / submission.total) * 100, 0) / quiz.submissions.length)
    : null;
  const item = {
    id: quiz.id, title: quiz.title, subject: quiz.subject, type: quiz.type,
    classId: quiz.classId, className: quiz.className, teacherName: quiz.teacherName,
    durationMins: quiz.durationMins, dueDate: quiz.dueDate,
    questionCount: quiz.questions.length, createdAt: quiz.createdAt,
    submissionCount: quiz.submissions.length, averagePercent,
  };
  if (user.role === 'student') {
    const mine = quiz.submissions.find((submission) => submission.studentId === Number(user.id));
    item.mySubmission = mine ? { score: mine.score, total: mine.total, submittedAt: mine.submittedAt } : null;
    item.closed = !mine && Boolean(quiz.dueDate) && String(quiz.dueDate).slice(0, 10) < today();
  }
  return item;
}

async function notify(connection, userId, title, body, type, link) {
  await connection.execute(
    'INSERT INTO notifications (user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?)',
    [userId, title, body, type, link]
  );
}

router.get('/quizzes', async (req, res, next) => {
  try {
    let query = 'SELECT id FROM quizzes';
    const values = [];
    if (req.user.role === 'teacher') {
      query += ' WHERE teacher_id = ?';
      values.push(req.user.id);
    } else if (req.user.role === 'student') {
      query += ' WHERE class_id = (SELECT class_id FROM users WHERE id = ? AND role = ?)';
      values.push(req.user.id, 'student');
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, values);
    const quizzes = await Promise.all(rows.map((row) => loadQuiz(Number(row.id))));
    res.json(quizzes.filter(Boolean).map((quiz) => summarise(quiz, req.user)));
  } catch (err) {
    next(err);
  }
});

router.post('/quizzes', requireRole('teacher'), async (req, res, next) => {
  const { title, subject, classId, type, durationMins, dueDate, questions } = req.body;
  if (!title || !subject || !classId || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Add a title, subject, class and at least one question' });
  }
  const cleaned = [];
  for (let index = 0; index < questions.length; index += 1) {
    const item = questions[index];
    const options = (item.options || []).map((option) => String(option).trim());
    const answerIndex = Number(item.answerIndex);
    if (!item.question || !item.question.trim() || options.length < 2 || options.length > 4 || options.some((option) => !option) || !options[answerIndex]) {
      return res.status(400).json({ message: `Question ${index + 1} is incomplete. Fill every option and mark the correct one.` });
    }
    cleaned.push({ question: item.question.trim(), options, answerIndex });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classes] = await connection.execute('SELECT id, name FROM classes WHERE id = ?', [Number(classId)]);
    if (!classes.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Choose a valid class' });
    }
    const [assignments] = await connection.execute(
      'SELECT teacher_id FROM class_subjects WHERE class_id = ? AND subject = ?',
      [Number(classId), subject]
    );
    if (!assignments.length || Number(assignments[0].teacher_id) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'You can only create quizzes for subjects you teach' });
    }

    const quizType = type === 'Test' ? 'Test' : 'Quiz';
    const [result] = await connection.execute(
      'INSERT INTO quizzes (title, subject, class_id, teacher_id, type, duration_mins, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title.trim(), subject, Number(classId), req.user.id, quizType, Number(durationMins) || 15, dueDate || null]
    );
    for (const question of cleaned) {
      await connection.execute(
        'INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, answer_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [result.insertId, question.question, ...Array.from({ length: 4 }, (_, index) => question.options[index] || ''), question.answerIndex]
      );
    }
    const questionNoun = `question${cleaned.length === 1 ? '' : 's'}`;
    const noticeBody = `${subject} · ${cleaned.length} ${questionNoun}${dueDate ? ` · due ${dueDate}` : ''}`;
    await connection.execute(
      'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ? AND class_id = ?',
      [`New ${quizType.toLowerCase()}: ${title.trim()}`, noticeBody, 'quiz', `/lms/${result.insertId}`, 'student', Number(classId)]
    );
    await connection.commit();
    const quiz = await loadQuiz(Number(result.insertId));
    res.status(201).json(summarise(quiz, req.user));
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.get('/quizzes/:id', async (req, res, next) => {
  try {
    const quiz = await loadQuiz(Number(req.params.id));
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    const item = summarise(quiz, req.user);
    if (req.user.role === 'student') {
      const [students] = await pool.execute('SELECT class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
      if (Number(students[0]?.class_id) !== quiz.classId) return res.status(403).json({ message: 'This quiz is not for your class' });
      const submission = quiz.submissions.find((row) => row.studentId === Number(req.user.id));
      if (submission) return res.json({ ...item, questions: quiz.questions, submission });
      if (quiz.dueDate && String(quiz.dueDate).slice(0, 10) < today()) {
        return res.status(403).json({ message: `This ${quiz.type.toLowerCase()} closed on ${String(quiz.dueDate).slice(0, 10)}` });
      }
      return res.json({ ...item, questions: quiz.questions.map(({ question, options }) => ({ question, options })), submission: null });
    }
    if (req.user.role === 'teacher' && quiz.teacherId !== Number(req.user.id)) {
      return res.status(403).json({ message: 'This is not your quiz' });
    }
    res.json({ ...item, questions: quiz.questions });
  } catch (err) {
    next(err);
  }
});

router.post('/quizzes/:id/submit', requireRole('student'), async (req, res, next) => {
  const quizId = Number(req.params.id);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const quiz = await loadQuiz(quizId);
    if (!quiz) {
      await connection.rollback();
      return res.status(404).json({ message: 'Quiz not found' });
    }
    const [students] = await connection.execute('SELECT id, name, class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
    const student = students[0];
    if (!student || Number(student.class_id) !== quiz.classId) {
      await connection.rollback();
      return res.status(403).json({ message: 'This quiz is not for your class' });
    }
    if (quiz.submissions.some((submission) => submission.studentId === Number(student.id))) {
      await connection.rollback();
      return res.status(400).json({ message: 'You have already submitted this' });
    }
    if (quiz.dueDate && String(quiz.dueDate).slice(0, 10) < today()) {
      await connection.rollback();
      return res.status(400).json({ message: 'This quiz is closed' });
    }

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const normalizedAnswers = quiz.questions.map((_, index) => answers[index] == null ? null : Number(answers[index]));
    const score = quiz.questions.reduce((total, question, index) => total + (Number(normalizedAnswers[index]) === question.answerIndex ? 1 : 0), 0);
    const [result] = await connection.execute(
      'INSERT INTO submissions (quiz_id, student_id, answers, score, total) VALUES (?, ?, ?, ?, ?)',
      [quizId, student.id, JSON.stringify(normalizedAnswers), score, quiz.questions.length]
    );
    await notify(connection, quiz.teacherId, 'New quiz submission', `${student.name} scored ${score}/${quiz.questions.length} on ${quiz.title}.`, 'submission', '/lms');
    await connection.commit();
    const submission = { id: Number(result.insertId), quizId, studentId: Number(student.id), answers: normalizedAnswers, score, total: quiz.questions.length, submittedAt: new Date().toISOString() };
    quiz.submissions.push(submission);
    res.status(201).json({ ...summarise(quiz, req.user), questions: quiz.questions, submission });
  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'You have already submitted this' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.post('/quizzes/:id/proctoring-recording', requireRole('student'), express.raw({ type: /video\/(webm|mp4)/, limit: '150mb' }), async (req, res, next) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message: 'No camera recording was received' });
  try {
    const quiz = await loadQuiz(Number(req.params.id));
    const [students] = await pool.execute('SELECT id, class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
    const student = students[0];
    if (!quiz || !student || Number(student.class_id) !== quiz.classId) {
      return res.status(403).json({ message: 'You cannot upload a recording for this assessment' });
    }
    const recordingsDir = path.resolve(process.env.PROCTORING_DIR || path.join(__dirname, '..', 'data', 'proctoring'));
    fs.mkdirSync(recordingsDir, { recursive: true });
    const fileName = `quiz-${quiz.id}-student-${student.id}-${Date.now()}.webm`;
    fs.writeFileSync(path.join(recordingsDir, fileName), req.body);
    await pool.execute(
      'INSERT INTO lms_proctoring (quiz_id, student_id, file_name, mime_type, bytes) VALUES (?, ?, ?, ?, ?)',
      [quiz.id, student.id, fileName, req.headers['content-type'] || 'video/webm', req.body.length]
    );
    res.status(201).json({ saved: true });
  } catch (err) {
    next(err);
  }
});

router.get('/quizzes/:id/submissions', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const quiz = await loadQuiz(Number(req.params.id));
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (req.user.role === 'teacher' && quiz.teacherId !== Number(req.user.id)) {
      return res.status(403).json({ message: 'This is not your quiz' });
    }
    const [students] = await pool.execute(
      'SELECT id, name, school_id FROM users WHERE role = ? AND class_id = ? ORDER BY name',
      ['student', quiz.classId]
    );
    const submissions = new Map(quiz.submissions.map((submission) => [submission.studentId, submission]));
    const rows = students.map((student) => {
      const submission = submissions.get(Number(student.id));
      return {
        studentId: Number(student.id), name: student.name, schoolId: student.school_id,
        submitted: Boolean(submission), score: submission ? submission.score : null,
        total: quiz.questions.length, submittedAt: submission ? submission.submittedAt : null,
      };
    });
    res.json({ quiz: summarise(quiz, req.user), rows });
  } catch (err) {
    next(err);
  }
});

router.delete('/quizzes/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const quizId = Number(req.params.id);
    const [rows] = await pool.execute('SELECT teacher_id FROM quizzes WHERE id = ?', [quizId]);
    if (!rows.length) return res.status(404).json({ message: 'Quiz not found' });
    if (req.user.role === 'teacher' && Number(rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'This is not your quiz' });
    }
    await pool.execute('DELETE FROM quizzes WHERE id = ?', [quizId]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;