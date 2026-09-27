const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gradeFor, termRank, teacherClassIds, classRanking } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

// All the term/session pairs that have results, newest first
function availableTerms(results) {
  const terms = [];
  results.forEach((r) => {
    if (!terms.some((t) => t.term === r.term && t.session === r.session)) {
      terms.push({ term: r.term, session: r.session });
    }
  });
  return terms.sort((a, b) => termRank(b.term, b.session) - termRank(a.term, a.session));
}

// ---------- Student ----------

// GET /api/results/my?term=Third Term&session=2025/2026
router.get('/my', requireRole('student'), (req, res) => {
  const data = db.read();
  const me = data.users.find((u) => u.id === req.user.id);
  const mine = data.results.filter((r) => r.studentId === me.id);
  const terms = availableTerms(mine);

  const term = req.query.term || (terms[0] && terms[0].term);
  const session = req.query.session || (terms[0] && terms[0].session);
  if (!term) return res.json({ terms, results: [], summary: null });

  const rows = mine
    .filter((r) => r.term === term && r.session === session)
    .map((r) => ({ ...r, ...gradeFor(r.total) }));

  let summary = null;
  if (rows.length) {
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const average = Number((total / rows.length).toFixed(1));
    const ranking = classRanking(data, me.classId, term, session);
    const mineRank = ranking.find((r) => r.student.id === me.id);
    summary = {
      total,
      average,
      grade: gradeFor(average).grade,
      position: mineRank ? mineRank.position : null,
      outOf: ranking.length,
      subjects: rows.length,
    };
  }

  const cls = data.classes.find((c) => c.id === me.classId);
  res.json({
    terms, term, session, results: rows, summary,
    student: { name: me.name, schoolId: me.schoolId, className: cls ? cls.name : '' },
    school: data.settings,
  });
});

// ---------- Teacher & admin ----------

// GET /api/results?classId=1&subject=Mathematics&term=First Term&session=2026/2027
// Returns the scores already saved, so the teacher's grid can be pre-filled
router.get('/', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  const { classId, subject, term, session } = req.query;
  if (req.user.role === 'teacher' && !teacherClassIds(data, req.user.id).includes(Number(classId))) {
    return res.status(403).json({ message: 'This is not one of your classes' });
  }
  const rows = data.results.filter(
    (r) => r.classId === Number(classId) && r.subject === subject && r.term === term && r.session === session
  );
  res.json(rows);
});

// POST /api/results/bulk  – save the scores of a whole class for one subject
// { classId, subject, term, session, scores: [{ studentId, ca, exam }] }
router.post('/bulk', requireRole('teacher', 'admin'), (req, res) => {
  const { classId, subject, term, session, scores } = req.body;
  if (!classId || !subject || !term || !session || !Array.isArray(scores)) {
    return res.status(400).json({ message: 'Choose a class, subject and term first' });
  }

  const data = db.read();
  const cls = data.classes.find((c) => c.id === Number(classId));
  if (!cls) return res.status(404).json({ message: 'Class not found' });

  const sub = cls.subjects.find((s) => s.name === subject);
  if (!sub) return res.status(400).json({ message: 'That subject is not taught in this class' });
  if (req.user.role === 'teacher' && sub.teacherId !== req.user.id) {
    return res.status(403).json({ message: 'You are not the teacher for this subject' });
  }

  // Check every row first, so we never save half of a class
  const rows = [];
  for (const row of scores) {
    if (row.ca === '' || row.ca == null || row.exam === '' || row.exam == null) continue; // skip empty rows
    const student = data.users.find((u) => u.id === Number(row.studentId) && u.classId === cls.id);
    if (!student) continue;

    const ca = Number(row.ca);
    const exam = Number(row.exam);
    if (Number.isNaN(ca) || Number.isNaN(exam) || ca < 0 || ca > 40 || exam < 0 || exam > 60) {
      return res.status(400).json({ message: `Check the scores for ${student.name}. CA is out of 40 and exam is out of 60.` });
    }
    rows.push({ student, ca, exam });
  }

  rows.forEach(({ student, ca, exam }) => {
    const existing = data.results.find(
      (r) => r.studentId === student.id && r.subject === subject && r.term === term && r.session === session
    );
    if (existing) {
      existing.ca = ca;
      existing.exam = exam;
      existing.total = ca + exam;
      existing.teacherId = req.user.id;
    } else {
      data.results.push({
        id: db.nextId(data.results), studentId: student.id, classId: cls.id, subject, term, session,
        ca, exam, total: ca + exam, teacherId: req.user.id,
      });
    }
  });

  const studentIds = rows.map(({ student }) => student.id);
  notifyUsers(data, studentIds, {
    title: `${subject} result posted`,
    body: `Your ${subject} score for ${term}, ${session} is now available.`,
    type: 'result',
    link: '/results',
  });

  db.write(data);
  res.json({ message: `Saved ${rows.length} result${rows.length === 1 ? '' : 's'}`, saved: rows.length });
});

// GET /api/results/class-summary?classId=1&term=...&session=...
// Student ranking and the average score for each subject
router.get('/class-summary', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  const { classId, term, session } = req.query;
  if (req.user.role === 'teacher' && !teacherClassIds(data, req.user.id).includes(Number(classId))) {
    return res.status(403).json({ message: 'This is not one of your classes' });
  }

  const ranking = classRanking(data, Number(classId), term, session).map((r) => ({
    id: r.student.id, name: r.student.name, schoolId: r.student.schoolId,
    subjects: r.subjects, total: r.total, average: r.average, position: r.position, grade: r.grade,
  }));

  const subjects = {};
  data.results
    .filter((r) => r.classId === Number(classId) && r.term === term && r.session === session)
    .forEach((r) => {
      subjects[r.subject] = subjects[r.subject] || { sum: 0, count: 0 };
      subjects[r.subject].sum += r.total;
      subjects[r.subject].count += 1;
    });
  const subjectAverages = Object.entries(subjects).map(([subject, v]) => ({
    subject, average: Number((v.sum / v.count).toFixed(1)), count: v.count,
  }));

  res.json({ ranking, subjectAverages });
});

module.exports = router;
