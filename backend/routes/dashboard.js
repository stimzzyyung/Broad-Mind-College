const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { feeStatus, classRanking, termRank, schoolDay, teacherClassIds } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

const latest = (list) => [...list].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

// GET /api/dashboard  – the numbers for the Home page (different for each role)
router.get('/', (req, res) => {
  const data = db.read();
  const announcements = latest(data.announcements).slice(0, 5);
  const { day, isToday } = schoolDay();

  // ----- Principal / admin -----
  if (req.user.role === 'admin') {
    const students = data.users.filter((u) => u.role === 'student');
    let expected = 0;
    let collected = 0;
    students.forEach((s) => {
      const fees = feeStatus(data, s.id);
      expected += fees.reduce((sum, f) => sum + f.amount, 0);
      collected += fees.reduce((sum, f) => sum + f.paid, 0);
    });

    const recentPayments = latest(data.payments).slice(0, 5).map((p) => {
      const student = data.users.find((u) => u.id === p.studentId);
      const fee = data.fees.find((f) => f.id === p.feeId);
      return { id: p.id, amount: p.amount, date: p.date, studentName: student ? student.name : '', feeTitle: fee ? fee.title : '' };
    });

    const exams = data.cbt_examinations || [];
    const questions = data.question_bank || [];
    const attempts = data.cbt_attempts || [];
    const nowMs = Date.now();

    const activeExams = exams.filter((e) => {
      const start = new Date(`${e.openingDate}T${e.openingTime || '00:00'}:00`).getTime();
      const end = new Date(`${e.closingDate}T${e.closingTime || '23:59'}:00`).getTime();
      return e.status === 'active' || (e.status !== 'blocked' && e.status !== 'cancelled' && e.status !== 'closed' && nowMs >= start && nowMs <= end);
    });

    const scheduledExams = exams.filter((e) => {
      const start = new Date(`${e.openingDate}T${e.openingTime || '00:00'}:00`).getTime();
      return e.status === 'scheduled' && nowMs < start;
    });

    const completedAttempts = attempts.filter((a) => a.status === 'Submitted' || a.status === 'Auto Submitted');
    const studentsWhoTookExams = new Set(completedAttempts.map((a) => a.studentId)).size;

    const cbtAdmin = {
      totalExams: exams.length,
      activeExams: activeExams.length,
      scheduledExams: scheduledExams.length,
      totalQuestions: questions.length,
      totalStudentsWhoTookExams: studentsWhoTookExams,
      totalCompletedAttempts: completedAttempts.length,
      recentActivity: (data.cbt_access_logs || []).slice(-5).reverse().map((l) => {
        const stu = data.users.find((u) => u.id === l.studentId);
        const ex = exams.find((e) => e.id === l.examId);
        return {
          id: l.id,
          action: l.action,
          studentName: stu ? stu.name : 'Student',
          examTitle: ex ? ex.title : 'Exam',
          timestamp: l.timestamp,
        };
      }),
      recentResults: completedAttempts.slice(-5).reverse().map((a) => {
        const stu = data.users.find((u) => u.id === a.studentId);
        const ex = exams.find((e) => e.id === a.examId);
        return {
          id: a.id,
          studentName: stu ? stu.name : 'Student',
          examTitle: ex ? ex.title : 'Exam',
          score: a.score,
          percentage: a.percentage,
          grade: a.grade,
          date: a.submissionTime,
        };
      }),
    };

    return res.json({
      role: 'admin',
      counts: {
        students: students.length,
        teachers: data.users.filter((u) => u.role === 'teacher').length,
        classes: data.classes.length,
        quizzes: data.quizzes.length,
        cbtExams: exams.length,
        cbtQuestions: questions.length,
      },
      fees: { expected, collected, outstanding: expected - collected },
      studentsPerClass: data.classes.map((c) => ({
        name: c.name, count: students.filter((s) => s.classId === c.id).length,
      })),
      recentPayments,
      recentStudents: latest(students).slice(0, 4).map((s) => ({
        id: s.id, name: s.name, schoolId: s.schoolId,
        className: (data.classes.find((c) => c.id === s.classId) || {}).name || '',
      })),
      cbt: cbtAdmin,
      announcements,
    });
  }

  // ----- Teacher -----
  if (req.user.role === 'teacher') {
    const classIds = teacherClassIds(data, req.user.id);
    const myClasses = data.classes.filter((c) => classIds.includes(c.id));
    const studentCount = data.users.filter((u) => u.role === 'student' && classIds.includes(u.classId)).length;
    const myQuizzes = data.quizzes.filter((q) => q.teacherId === req.user.id);

    // Lessons this teacher takes today
    const lessons = [];
    myClasses.forEach((c) => {
      const subjectsITeach = c.subjects.filter((s) => s.teacherId === req.user.id).map((s) => s.name);
      (c.timetable.days[day] || []).forEach((subject, i) => {
        if (subjectsITeach.includes(subject)) lessons.push({ time: c.timetable.periods[i], subject, className: c.name, index: i });
      });
    });
    lessons.sort((a, b) => a.index - b.index);

    const recentSubmissions = latest(
      data.submissions.filter((s) => myQuizzes.some((q) => q.id === s.quizId)).map((s) => ({ ...s, date: s.submittedAt }))
    ).slice(0, 5).map((s) => {
      const quiz = data.quizzes.find((q) => q.id === s.quizId);
      const student = data.users.find((u) => u.id === s.studentId);
      return { id: s.id, studentName: student ? student.name : '', quizTitle: quiz.title, score: s.score, total: s.total, date: s.submittedAt };
    });

    const exams = data.cbt_examinations || [];
    const questions = data.question_bank || [];
    const attempts = data.cbt_attempts || [];
    const nowMs = Date.now();

    // Teacher CBT metrics
    const teacherExams = exams.filter((e) => e.createdById === req.user.id || classIds.includes(e.classId));
    const teacherQuestions = questions.filter((q) => q.createdById === req.user.id || q.subject);
    const teacherActiveExams = teacherExams.filter((e) => {
      const start = new Date(`${e.openingDate}T${e.openingTime || '00:00'}:00`).getTime();
      const end = new Date(`${e.closingDate}T${e.closingTime || '23:59'}:00`).getTime();
      return e.status === 'active' || (e.status !== 'blocked' && e.status !== 'cancelled' && e.status !== 'closed' && nowMs >= start && nowMs <= end);
    });
    const teacherScheduledExams = teacherExams.filter((e) => {
      const start = new Date(`${e.openingDate}T${e.openingTime || '00:00'}:00`).getTime();
      return e.status === 'scheduled' && nowMs < start;
    });
    const teacherCompletedExams = teacherExams.filter((e) => {
      const end = new Date(`${e.closingDate}T${e.closingTime || '23:59'}:00`).getTime();
      return e.status === 'closed' || nowMs > end;
    });

    const teacherExamIds = teacherExams.map((e) => e.id);
    const teacherAttempts = attempts.filter((a) => teacherExamIds.includes(a.examId) && (a.status === 'Submitted' || a.status === 'Auto Submitted'));

    const cbtTeacher = {
      totalQuestions: teacherQuestions.length,
      activeExams: teacherActiveExams.length,
      scheduledExams: teacherScheduledExams.length,
      completedExams: teacherCompletedExams.length,
      totalCompletedAttempts: teacherAttempts.length,
      studentResults: teacherAttempts.slice(-5).reverse().map((a) => {
        const stu = data.users.find((u) => u.id === a.studentId);
        const ex = exams.find((e) => e.id === a.examId);
        return {
          id: a.id,
          studentName: stu ? stu.name : 'Student',
          examTitle: ex ? ex.title : 'Exam',
          score: a.score,
          percentage: a.percentage,
          grade: a.grade,
          date: a.submissionTime,
        };
      }),
      recentActivity: (data.cbt_access_logs || [])
        .filter((l) => teacherExamIds.includes(l.examId))
        .slice(-5)
        .reverse()
        .map((l) => {
          const stu = data.users.find((u) => u.id === l.studentId);
          const ex = exams.find((e) => e.id === l.examId);
          return {
            id: l.id,
            action: l.action,
            studentName: stu ? stu.name : 'Student',
            examTitle: ex ? ex.title : 'Exam',
            timestamp: l.timestamp,
          };
        }),
    };

    return res.json({
      role: 'teacher',
      counts: { classes: myClasses.length, students: studentCount, quizzes: myQuizzes.length,
        submissions: data.submissions.filter((s) => myQuizzes.some((q) => q.id === s.quizId)).length,
        cbtExams: teacherExams.length, cbtQuestions: teacherQuestions.length },
      classes: myClasses.map((c) => ({
        id: c.id, name: c.name,
        studentCount: data.users.filter((u) => u.role === 'student' && u.classId === c.id).length,
        subjects: c.subjects.filter((s) => s.teacherId === req.user.id).map((s) => s.name),
        isFormTeacher: c.formTeacherId === req.user.id,
      })),
      today: { day, isToday, lessons },
      recentSubmissions,
      cbt: cbtTeacher,
      announcements,
    });
  }

  // ----- Parent -----
  if (req.user.role === 'parent') {
    const kids = data.users.filter((u) => u.role === 'student' && u.parentId === req.user.id);
    const children = kids.map((s) => {
      const fees = feeStatus(data, s.id);
      const cls = data.classes.find((c) => c.id === s.classId);
      const expected = fees.reduce((sum, f) => sum + f.amount, 0);
      const paid = fees.reduce((sum, f) => sum + f.paid, 0);
      return {
        id: s.id, name: s.name, schoolId: s.schoolId, className: cls ? cls.name : 'Unassigned',
        balance: expected - paid,
      };
    });
    const totals = children.reduce((sum, c) => sum + c.balance, 0);

    return res.json({
      role: 'parent',
      children,
      outstanding: totals,
      announcements,
    });
  }

  // ----- Student -----
  const me = data.users.find((u) => u.id === req.user.id);
  const cls = data.classes.find((c) => c.id === me.classId);
  const fees = feeStatus(data, me.id);
  const expected = fees.reduce((sum, f) => sum + f.amount, 0);
  const paid = fees.reduce((sum, f) => sum + f.paid, 0);

  // Latest term that has results
  const mine = data.results.filter((r) => r.studentId === me.id);
  let lastResult = null;
  if (mine.length) {
    const newest = [...mine].sort((a, b) => termRank(b.term, b.session) - termRank(a.term, a.session))[0];
    const ranking = classRanking(data, me.classId, newest.term, newest.session);
    const row = ranking.find((r) => r.student.id === me.id);
    if (row) lastResult = { term: newest.term, session: newest.session, average: row.average, grade: row.grade, position: row.position, outOf: ranking.length };
  }

  const todayLessons = cls
    ? (cls.timetable.days[day] || []).map((subject, i) => ({ time: cls.timetable.periods[i], subject }))
    : [];

  const todayDate = new Date().toISOString().slice(0, 10);
  const pendingQuizzes = data.quizzes
    .filter((q) => q.classId === me.classId)
    .filter((q) => !data.submissions.some((s) => s.quizId === q.id && s.studentId === me.id))
    .filter((q) => !q.dueDate || q.dueDate >= todayDate)
    .map((q) => ({ id: q.id, title: q.title, subject: q.subject, type: q.type, dueDate: q.dueDate, durationMins: q.durationMins, questionCount: q.questions.length }));

  // Student CBT Examination Metrics
  const exams = data.cbt_examinations || [];
  const attempts = (data.cbt_attempts || []).filter((a) => a.studentId === me.id);
  const nowMs = Date.now();

  const myClassExams = exams.filter((e) => {
    return Number(e.classId) === Number(me.classId) || (cls && e.classLevel && e.classLevel.toLowerCase() === cls.name.split(' ')[0].toLowerCase());
  });

  const availableExams = [];
  const upcomingExams = [];
  const inProgressExams = [];
  const completedExams = [];

  myClassExams.forEach((exam) => {
    const start = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();
    const end = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();
    const examAttempts = attempts.filter((a) => a.examId === exam.id);
    const activeAtt = examAttempts.find((a) => a.status === 'In Progress');
    const submittedAtt = examAttempts.find((a) => a.status === 'Submitted' || a.status === 'Auto Submitted');

    const item = {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      durationMins: exam.durationMins,
      totalMarks: exam.totalMarks,
      numberQuestions: exam.questions ? exam.questions.length : exam.numberQuestions,
      openingDate: exam.openingDate,
      openingTime: exam.openingTime,
      closingDate: exam.closingDate,
      closingTime: exam.closingTime,
    };

    if (activeAtt) {
      inProgressExams.push({ ...item, attemptId: activeAtt.id });
    } else if (submittedAtt) {
      completedExams.push({
        ...item,
        score: submittedAtt.score,
        percentage: submittedAtt.percentage,
        grade: submittedAtt.grade,
        submissionTime: submittedAtt.submissionTime,
      });
    } else if (exam.status === 'active' || (exam.status !== 'blocked' && exam.status !== 'cancelled' && exam.status !== 'closed' && nowMs >= start && nowMs <= end)) {
      availableExams.push(item);
    } else if (nowMs < start && exam.status !== 'cancelled') {
      upcomingExams.push({
        ...item,
        opensInSeconds: Math.max(0, Math.floor((start - nowMs) / 1000)),
      });
    }
  });

  const cbtStudent = {
    availableExams,
    upcomingExams,
    inProgressExams,
    completedExams,
    results: completedExams,
  };

  res.json({
    role: 'student',
    className: cls ? cls.name : 'Unassigned',
    formTeacher: cls && cls.formTeacherId ? (data.users.find((u) => u.id === cls.formTeacherId) || {}).name : null,
    fees: { expected, paid, balance: expected - paid },
    lastResult,
    today: { day, isToday, lessons: todayLessons },
    pendingQuizzes,
    cbt: cbtStudent,
    announcements,
  });
});

// POST /api/dashboard/announcements  { title, body }  – principal posts a notice
router.post('/announcements', requireRole('admin'), (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'Add a title and a message' });
  const data = db.read();
  const item = {
    id: db.nextId(data.announcements), title: title.trim(), body: body.trim(),
    author: req.user.name, date: new Date().toISOString(),
  };
  data.announcements.push(item);
  const recipients = data.users.filter((u) => u.role !== 'admin').map((u) => u.id);
  notifyUsers(data, recipients, {
    title: `Notice: ${item.title}`,
    body: item.body.length > 120 ? `${item.body.slice(0, 117)}...` : item.body,
    type: 'announcement',
    link: '',
  });
  db.write(data);
  res.status(201).json(item);
});

// DELETE /api/dashboard/announcements/:id
router.delete('/announcements/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  data.announcements = data.announcements.filter((a) => a.id !== Number(req.params.id));
  db.write(data);
  res.json({ message: 'Notice removed' });
});

module.exports = router;
