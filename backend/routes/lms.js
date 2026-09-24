const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyUsers, notifyUser } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);

// A short version of a quiz for lists (no questions inside)
function summarise(data, quiz, user) {
  const cls = data.classes.find((c) => c.id === quiz.classId);
  const teacher = data.users.find((u) => u.id === quiz.teacherId);
  const submissions = data.submissions.filter((s) => s.quizId === quiz.id);
  const averagePercent = submissions.length
    ? Math.round(submissions.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / submissions.length)
    : null;

  const item = {
    id: quiz.id, title: quiz.title, subject: quiz.subject, type: quiz.type,
    classId: quiz.classId, className: cls ? cls.name : '',
    teacherName: teacher ? teacher.name : 'Unknown',
    durationMins: quiz.durationMins, dueDate: quiz.dueDate,
    questionCount: quiz.questions.length, createdAt: quiz.createdAt,
    submissionCount: submissions.length, averagePercent,
  };

  if (user.role === 'student') {
    const mine = submissions.find((s) => s.studentId === user.id);
    item.mySubmission = mine ? { score: mine.score, total: mine.total, submittedAt: mine.submittedAt } : null;
    item.closed = !mine && !!quiz.dueDate && quiz.dueDate < today();
  }
  return item;
}

// GET /api/lms/quizzes  – admin: all, teacher: mine, student: for my class
router.get('/quizzes', (req, res) => {
  const data = db.read();
  let list = data.quizzes;

  if (req.user.role === 'teacher') list = list.filter((q) => q.teacherId === req.user.id);
  if (req.user.role === 'student') {
    const me = data.users.find((u) => u.id === req.user.id);
    list = list.filter((q) => q.classId === me.classId);
  }

  res.json(
    list
      .map((q) => summarise(data, q, req.user))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );
});

// POST /api/lms/quizzes  – a teacher creates a quiz or test
router.post('/quizzes', requireRole('teacher'), (req, res) => {
  const { title, subject, classId, type, durationMins, dueDate, questions } = req.body;
  if (!title || !subject || !classId || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Add a title, subject, class and at least one question' });
  }

  const data = db.read();
  const cls = data.classes.find((c) => c.id === Number(classId));
  if (!cls) return res.status(400).json({ message: 'Choose a valid class' });
  const sub = cls.subjects.find((s) => s.name === subject);
  if (!sub || sub.teacherId !== req.user.id) {
    return res.status(403).json({ message: 'You can only create quizzes for subjects you teach' });
  }

  // Each question needs text, at least two filled options, and one correct answer
  const cleaned = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const options = (q.options || []).map((o) => String(o).trim());
    const answerIndex = Number(q.answerIndex);
    if (!q.question || !q.question.trim() || options.some((o) => !o) || options.length < 2 || !options[answerIndex]) {
      return res.status(400).json({ message: `Question ${i + 1} is incomplete. Fill every option and mark the correct one.` });
    }
    cleaned.push({ question: q.question.trim(), options, answerIndex });
  }

  const quiz = {
    id: db.nextId(data.quizzes),
    title: title.trim(),
    subject,
    classId: cls.id,
    teacherId: req.user.id,
    type: type === 'Test' ? 'Test' : 'Quiz',
    durationMins: Number(durationMins) || 15,
    dueDate: dueDate || '',
    createdAt: new Date().toISOString(),
    questions: cleaned,
  };
  data.quizzes.push(quiz);

  const classmates = data.users.filter((u) => u.role === 'student' && u.classId === cls.id).map((u) => u.id);
  notifyUsers(data, classmates, {
    title: `New ${quiz.type.toLowerCase()}: ${quiz.title}`,
    body: `${quiz.subject} · ${quiz.questions.length} question${quiz.questions.length === 1 ? '' : 's'}${quiz.dueDate ? ` · due ${quiz.dueDate}` : ''}`,
    type: 'quiz',
    link: `/lms/${quiz.id}`,
  });

  db.write(data);
  res.status(201).json(summarise(data, quiz, req.user));
});

// GET /api/lms/quizzes/:id
// Students get the questions WITHOUT answers. After submitting they get a full review.
router.get('/quizzes/:id', (req, res) => {
  const data = db.read();
  const quiz = data.quizzes.find((q) => q.id === Number(req.params.id));
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

  if (req.user.role === 'student') {
    const me = data.users.find((u) => u.id === req.user.id);
    if (me.classId !== quiz.classId) return res.status(403).json({ message: 'This quiz is not for your class' });

    const submission = data.submissions.find((s) => s.quizId === quiz.id && s.studentId === me.id);
    if (submission) return res.json({ ...summarise(data, quiz, req.user), questions: quiz.questions, submission });

    if (quiz.dueDate && quiz.dueDate < today()) {
      return res.status(403).json({ message: `This ${quiz.type.toLowerCase()} closed on ${quiz.dueDate}` });
    }
    const hidden = quiz.questions.map((q) => ({ question: q.question, options: q.options }));
    return res.json({ ...summarise(data, quiz, req.user), questions: hidden, submission: null });
  }

  if (req.user.role === 'teacher' && quiz.teacherId !== req.user.id) {
    return res.status(403).json({ message: 'This is not your quiz' });
  }
  res.json({ ...summarise(data, quiz, req.user), questions: quiz.questions });
});

// POST /api/lms/quizzes/:id/submit  { answers: [1, 0, 2, ...] }
router.post('/quizzes/:id/submit', requireRole('student'), (req, res) => {
  const data = db.read();
  const quiz = data.quizzes.find((q) => q.id === Number(req.params.id));
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

  const me = data.users.find((u) => u.id === req.user.id);
  if (me.classId !== quiz.classId) return res.status(403).json({ message: 'This quiz is not for your class' });
  if (data.submissions.some((s) => s.quizId === quiz.id && s.studentId === me.id)) {
    return res.status(400).json({ message: 'You have already submitted this' });
  }
  if (quiz.dueDate && quiz.dueDate < today()) {
    return res.status(400).json({ message: 'This quiz is closed' });
  }

  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  let score = 0;
  quiz.questions.forEach((q, i) => {
    if (Number(answers[i]) === q.answerIndex) score += 1;
  });

  const submission = {
    id: db.nextId(data.submissions),
    quizId: quiz.id,
    studentId: me.id,
    answers: quiz.questions.map((_, i) => (answers[i] === null || answers[i] === undefined ? null : Number(answers[i]))),
    score,
    total: quiz.questions.length,
    submittedAt: new Date().toISOString(),
  };
  data.submissions.push(submission);

  notifyUser(data, quiz.teacherId, {
    title: 'New quiz submission',
    body: `${me.name} scored ${score}/${quiz.questions.length} on ${quiz.title}.`,
    type: 'submission',
    link: '/lms',
  });

  db.write(data);

  res.status(201).json({ ...summarise(data, quiz, req.user), questions: quiz.questions, submission });
});

// GET /api/lms/quizzes/:id/submissions  – who took it and how they did
router.get('/quizzes/:id/submissions', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  const quiz = data.quizzes.find((q) => q.id === Number(req.params.id));
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
  if (req.user.role === 'teacher' && quiz.teacherId !== req.user.id) {
    return res.status(403).json({ message: 'This is not your quiz' });
  }

  const students = data.users.filter((u) => u.role === 'student' && u.classId === quiz.classId);
  const rows = students.map((student) => {
    const sub = data.submissions.find((s) => s.quizId === quiz.id && s.studentId === student.id);
    return {
      studentId: student.id, name: student.name, schoolId: student.schoolId,
      submitted: !!sub, score: sub ? sub.score : null, total: quiz.questions.length,
      submittedAt: sub ? sub.submittedAt : null,
    };
  });
  res.json({ quiz: summarise(data, quiz, req.user), rows });
});

// DELETE /api/lms/quizzes/:id
router.delete('/quizzes/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  const id = Number(req.params.id);
  const quiz = data.quizzes.find((q) => q.id === id);
  if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
  if (req.user.role === 'teacher' && quiz.teacherId !== req.user.id) {
    return res.status(403).json({ message: 'This is not your quiz' });
  }
  data.quizzes = data.quizzes.filter((q) => q.id !== id);
  data.submissions = data.submissions.filter((s) => s.quizId !== id);
  db.write(data);
  res.json({ message: 'Deleted' });
});

module.exports = router;
