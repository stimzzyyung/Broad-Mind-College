const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gradeFor } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);
const parseJson = (value, fallback = null) => (typeof value === 'string' ? JSON.parse(value) : value) ?? fallback;
const dateTimeValue = (value) => value ? new Date(value).toISOString().slice(0, 23).replace('T', ' ') : null;

function getCbtGrade(percentage) {
  if (percentage >= 75) return { grade: 'A', remark: 'Excellent' };
  if (percentage >= 65) return { grade: 'B', remark: 'Good' };
  if (percentage >= 50) return { grade: 'C', remark: 'Credit' };
  if (percentage >= 40) return { grade: 'D', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

function questionFromRow(row) {
  return {
    id: Number(row.id), question: row.question, type: row.question_type,
    options: parseJson(row.options, []), correctAnswer: row.correct_answer,
    subject: row.subject, classLevel: row.class_level, classId: row.class_id === null ? null : Number(row.class_id),
    schoolSection: row.school_section, examLevel: row.exam_level, category: row.category,
    year: row.academic_year, session: row.session, term: row.term, difficulty: row.difficulty,
    marks: Number(row.marks), explanation: row.explanation || '',
    createdById: row.created_by_id === null ? null : Number(row.created_by_id), createdByName: row.created_by_name,
    createdAt: row.created_at, updatedAt: row.updated_at, copiedFromId: row.copied_from_id === null ? null : Number(row.copied_from_id),
    isArchived: Boolean(row.is_archived),
  };
}

function examFromRow(row) {
  return {
    id: Number(row.id), title: row.title, year: row.academic_year, session: row.session, term: row.term,
    schoolSection: row.school_section, classCategory: row.class_category, classLevel: row.class_level,
    classId: row.class_id === null ? null : Number(row.class_id), examLevel: row.exam_level,
    examCategory: row.exam_category, subject: row.subject, durationMins: Number(row.duration_mins),
    totalMarks: Number(row.total_marks), numberQuestions: Number(row.number_questions),
    openingDate: row.opening_date, openingTime: row.opening_time, closingDate: row.closing_date,
    closingTime: row.closing_time, studentAccessTime: row.student_access_time, instructions: row.instructions,
    status: row.status, maxAttempts: Number(row.max_attempts), resultCalculationMethod: row.result_calculation_method,
    questions: parseJson(row.questions, []), createdById: row.created_by_id === null ? null : Number(row.created_by_id),
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function attemptFromRow(row) {
  return {
    id: Number(row.id), attemptCode: row.attempt_code,
    studentId: Number(row.student_id), studentName: row.student_name,
    studentSchoolId: row.student_school_id, className: row.class_name,
    examId: Number(row.exam_id), examTitle: row.exam_title,
    attemptNumber: Number(row.attempt_number), startTime: row.start_time,
    expectedEndTime: row.expected_end_time, submissionTime: row.submission_time,
    lastActivityTime: row.last_activity_time, status: row.status,
    savedAnswers: parseJson(row.saved_answers, {}), score: row.score === null ? null : Number(row.score),
    percentage: row.percentage === null ? null : Number(row.percentage),
    correctCount: Number(row.correct_count), wrongCount: Number(row.wrong_count),
    unansweredCount: Number(row.unanswered_count), grade: row.grade,
    passed: row.passed === null ? null : Boolean(row.passed),
  };
}

async function findQuestions(filters = {}, archiveOnly = false) {
  const clauses = [];
  const values = [];
  if (archiveOnly || filters.isArchived === 'true') clauses.push('(is_archived = 1 OR CAST(academic_year AS UNSIGNED) < 2026)');
  else if (filters.isArchived === 'false') clauses.push('is_archived = 0');
  for (const [parameter, column] of [
    ['subject', 'subject'], ['schoolSection', 'school_section'], ['classLevel', 'class_level'],
    ['year', 'academic_year'], ['session', 'session'], ['term', 'term'], ['difficulty', 'difficulty'], ['type', 'question_type'],
  ]) {
    if (filters[parameter]) {
      clauses.push(parameter === 'subject' ? `LOWER(${column}) = ?` : `${column} = ?`);
      values.push(parameter === 'subject' ? String(filters[parameter]).toLowerCase() : filters[parameter]);
    }
  }
  if (filters.classId) {
    clauses.push('class_id = ?');
    values.push(Number(filters.classId));
  }
  if (filters.category) {
    clauses.push('LOWER(category) LIKE ?');
    values.push(`%${String(filters.category).toLowerCase()}%`);
  }
  if (filters.search) {
    clauses.push('(LOWER(question) LIKE ? OR LOWER(category) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(CAST(options AS CHAR)) LIKE ?)');
    const search = `%${String(filters.search).toLowerCase()}%`;
    values.push(search, search, search, search);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const order = archiveOnly ? 'ORDER BY CAST(academic_year AS UNSIGNED) DESC, created_at DESC' : 'ORDER BY created_at DESC';
  const [rows] = await pool.execute(`SELECT * FROM question_bank ${where} ${order}`, values);
  return rows.map(questionFromRow);
}

async function loadExam(examId, executor = pool) {
  const [rows] = await executor.execute('SELECT * FROM cbt_examinations WHERE id = ? LIMIT 1', [examId]);
  return rows[0] ? examFromRow(rows[0]) : null;
}

async function loadAttempt(attemptId, executor = pool, lock = false) {
  const [rows] = await executor.execute(
    `SELECT a.*, u.name AS student_name, u.school_id AS student_school_id, c.name AS class_name, e.title AS exam_title FROM cbt_attempts a LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id LEFT JOIN cbt_examinations e ON e.id = a.exam_id WHERE a.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [attemptId]
  );
  return rows[0] ? attemptFromRow(rows[0]) : null;
}

function scoreAnswers(exam, answers) {
  const questions = exam.questions || [];
  let correctCount = 0;
  let score = 0;
  questions.forEach((question, index) => {
    const answer = answers?.[index];
    if (answer !== null && answer !== undefined && String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase()) {
      correctCount += 1;
      score += Number(question.marks) || 1;
    }
  });
  const totalMarks = Number(exam.totalMarks) || questions.length || 1;
  const percentage = Math.round((score / totalMarks) * 100);
  const answeredCount = Object.keys(answers || {}).length;
  return {
    score, totalMarks, percentage, correctCount,
    wrongCount: Math.max(0, answeredCount - correctCount),
    unansweredCount: Math.max(0, questions.length - answeredCount),
    grade: getCbtGrade(percentage).grade,
    passed: percentage >= 50,
  };
}

async function updateAttempt(executor, attemptId, values) {
  await executor.execute(
    'UPDATE cbt_attempts SET status = ?, saved_answers = ?, last_activity_time = ?, submission_time = ?, score = ?, percentage = ?, correct_count = ?, wrong_count = ?, unanswered_count = ?, grade = ?, passed = ? WHERE id = ?',
    [values.status, JSON.stringify(values.savedAnswers || {}), dateTimeValue(values.lastActivityTime), dateTimeValue(values.submissionTime), values.score, values.percentage, values.correctCount, values.wrongCount, values.unansweredCount, values.grade, values.passed === null ? null : Number(values.passed), attemptId]
  );
}

async function logAccess(executor, { studentId, examId, attemptId, action, status, details, req }) {
  const ipAddress = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const [result] = await executor.execute(
    'INSERT INTO cbt_access_logs (student_id, exam_id, attempt_id, action, status, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [studentId || null, examId || null, attemptId || null, action, status || 'success', details || '', ipAddress, req.headers['user-agent'] || '']
  );
  return { id: Number(result.insertId), studentId, examId, attemptId: attemptId || null, action, timestamp: new Date().toISOString(), ipAddress, status: status || 'success', details: details || '', userAgent: req.headers['user-agent'] || '' };
}

async function logAudit(executor, { staffId, staffName, studentId, studentName, examId, examTitle, action, reason }) {
  const [result] = await executor.execute(
    'INSERT INTO cbt_audit_logs (staff_id, staff_name, student_id, student_name, exam_id, exam_title, action, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [staffId || null, staffName || '', studentId || null, studentName || 'N/A', examId || null, examTitle || 'N/A', action, reason || 'Administrative action']
  );
  return { id: Number(result.insertId), staffId, staffName, studentId: studentId || null, studentName: studentName || 'N/A', examId: examId || null, examTitle: examTitle || 'N/A', action, date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 8), reason: reason || 'Administrative action', createdAt: new Date().toISOString() };
}

async function canMonitorAttempt(attempt, user) {
  if (!attempt) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'student') return Number(attempt.studentId) === Number(user.id);
  if (user.role !== 'teacher') return false;
  const [rows] = await pool.execute(
    'SELECT 1 FROM users s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE s.id = ? AND s.role = ? AND (c.form_teacher_id = ? OR cs.teacher_id = ?) LIMIT 1',
    [attempt.studentId, 'student', user.id, user.id]
  );
  return rows.length > 0;
}

// ==========================================
// 1. METADATA & CONFIGURATION
// ==========================================
router.get('/meta', async (req, res, next) => {
  try {
  const [[schoolSections], [classCategories], [classLevels], [examCategories], [examLevels], [classes], [settingsRows], [subjectRows], [sessionRows], [termRows], [yearRows], [difficultyRows], [questionTypeRows]] = await Promise.all([
    pool.execute('SELECT id, code, name, description FROM school_sections ORDER BY name'),
    pool.execute('SELECT id, name, section_id AS sectionId, description, sort_order AS `order` FROM class_categories ORDER BY sort_order, name'),
    pool.execute('SELECT id, name, category_id AS categoryId, section_id AS sectionId FROM class_levels ORDER BY id'),
    pool.execute('SELECT id, name, code, weight FROM exam_categories ORDER BY id'),
    pool.execute('SELECT id, name, section_id AS sectionId FROM exam_levels ORDER BY id'),
    pool.execute('SELECT id, name, level, school_section AS schoolSection FROM classes ORDER BY name'),
    pool.execute('SELECT session, term FROM settings ORDER BY id LIMIT 1'),
    pool.execute('SELECT name FROM subjects WHERE is_active = 1 ORDER BY name'),
    pool.execute("SELECT session FROM settings WHERE session IS NOT NULL AND session <> '' UNION SELECT session FROM fees UNION SELECT session FROM results UNION SELECT session FROM cbt_examinations ORDER BY session DESC"),
    pool.execute("SELECT term FROM settings WHERE term IS NOT NULL AND term <> '' UNION SELECT term FROM fees UNION SELECT term FROM results UNION SELECT term FROM cbt_examinations ORDER BY term"),
    pool.execute("SELECT academic_year AS year FROM cbt_examinations UNION SELECT academic_year AS year FROM question_bank UNION SELECT LEFT(session, 4) AS year FROM settings WHERE session IS NOT NULL AND session <> '' ORDER BY year DESC"),
    pool.execute('SELECT name FROM cbt_difficulties WHERE is_active = 1 ORDER BY sort_order'),
    pool.execute('SELECT code AS value, label FROM cbt_question_types WHERE is_active = 1 ORDER BY code'),
  ]);

  res.json({
    schoolSections,
    classCategories,
    classLevels,
    examCategories: examCategories.map((row) => ({ ...row, weight: Number(row.weight) })),
    examLevels,
    classes: classes.map((row) => ({ ...row, id: Number(row.id), schoolSection: row.schoolSection || '' })),
    subjects: subjectRows.map((row) => row.name),
    sessions: sessionRows.map((row) => row.session),
    terms: termRows.map((row) => row.term),
    years: yearRows.map((row) => String(row.year)),
    difficulties: difficultyRows.map((row) => row.name),
    questionTypes: questionTypeRows,
    currentSession: settingsRows[0]?.session || '',
    currentTerm: settingsRows[0]?.term || '',
    serverTime: new Date().toISOString(),
  });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. QUESTION BANK & PREVIOUS ARCHIVE
// ==========================================

// GET /api/cbt/questions  – search and filter questions
router.get('/questions', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const questions = await findQuestions(req.query);
    res.json({ total: questions.length, questions });
  } catch (err) {
    next(err);
  }
});

// GET /api/cbt/questions/archive  – dedicated endpoint for Previous Questions Archive
router.get('/questions/archive', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const questions = await findQuestions(req.query, true);
    res.json({ total: questions.length, questions });
  } catch (err) {
    next(err);
  }
});

// POST /api/cbt/questions  – create a new question in the Question Bank
router.post('/questions', requireRole('teacher', 'admin'), async (req, res, next) => {
  const {
    question,
    type = 'multiple_choice',
    options = [],
    correctAnswer,
    subject,
    classLevel,
    classId,
    schoolSection,
    examLevel,
    category,
    year = '2026',
    session = '2026/2027',
    term = 'First Term',
    difficulty = 'Medium',
    marks = 1,
    explanation = '',
  } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ message: 'Question text is required' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Subject is required' });
  }

  if (type === 'multiple_choice') {
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ message: 'Multiple choice requires at least Option A and Option B' });
    }
    if (correctAnswer === undefined || correctAnswer === null || correctAnswer === '') {
      return res.status(400).json({ message: 'Please specify the correct answer' });
    }
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO question_bank (question, question_type, options, correct_answer, subject, class_level, class_id, school_section, exam_level, category, academic_year, session, term, difficulty, marks, explanation, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [question.trim(), type, JSON.stringify((options || []).map((option) => String(option).trim())), String(correctAnswer || '').trim(), subject, classLevel || 'JSS1', classId ? Number(classId) : null, schoolSection || 'jss', examLevel || 'Junior Secondary Level', category ? category.trim() : 'General', String(year || '2026'), session || '2026/2027', term || 'First Term', difficulty || 'Medium', Number(marks) || 1, explanation ? explanation.trim() : '', req.user.id, req.user.name]
    );
    const [rows] = await pool.execute('SELECT * FROM question_bank WHERE id = ?', [result.insertId]);
    res.status(201).json(questionFromRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

// GET /api/cbt/questions/:id  – preview question
router.get('/questions/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM question_bank WHERE id = ?', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ message: 'Question not found' });
    res.json(questionFromRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/cbt/questions/:id  – edit question
router.put('/questions/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  const columns = {
    question: 'question', type: 'question_type', options: 'options', correctAnswer: 'correct_answer',
    subject: 'subject', classLevel: 'class_level', classId: 'class_id', schoolSection: 'school_section',
    examLevel: 'exam_level', category: 'category', year: 'academic_year', session: 'session', term: 'term',
    difficulty: 'difficulty', marks: 'marks', explanation: 'explanation', isArchived: 'is_archived',
  };
  try {
    const [found] = await pool.execute('SELECT id FROM question_bank WHERE id = ?', [Number(req.params.id)]);
    if (!found.length) return res.status(404).json({ message: 'Question not found' });
    const fields = Object.keys(columns).filter((field) => req.body[field] !== undefined);
    const values = fields.map((field) => {
      const value = req.body[field];
      if (field === 'options') return JSON.stringify(Array.isArray(value) ? value.map((option) => String(option).trim()) : []);
      if (field === 'marks') return Number(value) || 1;
      if (field === 'classId') return value ? Number(value) : null;
      if (field === 'isArchived') return value ? 1 : 0;
      return value;
    });
    if (fields.length) {
      const assignments = fields.map((field) => `${columns[field]} = ?`);
      assignments.push('updated_at = CURRENT_TIMESTAMP(3)');
      await pool.execute(`UPDATE question_bank SET ${assignments.join(', ')} WHERE id = ?`, [...values, Number(req.params.id)]);
    }
    const [rows] = await pool.execute('SELECT * FROM question_bank WHERE id = ?', [Number(req.params.id)]);
    res.json(questionFromRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cbt/questions/:id  – delete question
router.delete('/questions/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const [result] = await pool.execute('DELETE FROM question_bank WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Question not found' });
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/cbt/questions/copy  – copy questions into bank or prepare for exam (original stays unchanged)
router.post('/questions/copy', requireRole('teacher', 'admin'), async (req, res, next) => {
  const { questionIds, targetYear = '2026', targetSession = '2026/2027', targetTerm = 'First Term' } = req.body;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return res.status(400).json({ message: 'Select at least one question to copy' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const placeholders = questionIds.map(() => '?').join(', ');
    const [rows] = await connection.execute(`SELECT * FROM question_bank WHERE id IN (${placeholders})`, questionIds.map(Number));
    const questionsById = new Map(rows.map((row) => [Number(row.id), questionFromRow(row)]));
    const copiedQuestions = [];
    for (const rawId of questionIds) {
      const original = questionsById.get(Number(rawId));
      if (!original) continue;
      const [result] = await connection.execute(
        'INSERT INTO question_bank (question, question_type, options, correct_answer, subject, class_level, class_id, school_section, exam_level, category, academic_year, session, term, difficulty, marks, explanation, created_by_id, created_by_name, copied_from_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [original.question, original.type, JSON.stringify(original.options), original.correctAnswer, original.subject, original.classLevel, original.classId, original.schoolSection, original.examLevel, original.category, String(targetYear), targetSession, targetTerm, original.difficulty, original.marks, original.explanation, req.user.id, req.user.name, original.id]
      );
      const [created] = await connection.execute('SELECT * FROM question_bank WHERE id = ?', [result.insertId]);
      copiedQuestions.push(questionFromRow(created[0]));
    }
    await connection.commit();
    res.status(201).json({ message: `Successfully copied ${copiedQuestions.length} question(s). Originals remain untouched.`, copiedQuestions });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// ==========================================
// 3. CBT EXAMINATIONS MANAGEMENT
// ==========================================

// Helper to determine active time status
function computeExamTimeStatus(exam) {
  const now = new Date().getTime();
  const start = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();
  const end = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();

  let timeState = 'scheduled'; // before opening
  let secondsToOpen = Math.max(0, Math.floor((start - now) / 1000));
  let secondsToClose = Math.max(0, Math.floor((end - now) / 1000));

  if (exam.status === 'blocked') {
    return { timeState: 'blocked', isOpen: false, isClosed: false, secondsToOpen, secondsToClose };
  }
  if (exam.status === 'cancelled') {
    return { timeState: 'cancelled', isOpen: false, isClosed: true, secondsToOpen, secondsToClose };
  }
  if (exam.status === 'closed') {
    return { timeState: 'closed', isOpen: false, isClosed: true, secondsToOpen: 0, secondsToClose: 0 };
  }

  if (now < start) {
    timeState = 'scheduled';
    return { timeState, isOpen: false, isClosed: false, secondsToOpen, secondsToClose };
  } else if (now >= start && now <= end) {
    timeState = 'active';
    return { timeState, isOpen: true, isClosed: false, secondsToOpen: 0, secondsToClose };
  } else {
    timeState = 'expired';
    return { timeState, isOpen: false, isClosed: true, secondsToOpen: 0, secondsToClose: 0 };
  }
}

// GET /api/cbt/exams  – list examinations with comprehensive filters
router.get('/exams', async (req, res, next) => {
  try {
    const { year, session, term, subject, schoolSection, classId, status, examCategory } = req.query;
    const clauses = [];
    const values = [];
    const filters = [
      ['year', 'academic_year'], ['session', 'session'], ['term', 'term'],
      ['schoolSection', 'school_section'], ['classId', 'class_id'], ['status', 'status'], ['examCategory', 'exam_category'],
    ];
    for (const [parameter, column] of filters) {
      if (req.query[parameter]) {
        clauses.push(`e.${column} = ?`);
        values.push(parameter === 'classId' ? Number(req.query[parameter]) : req.query[parameter]);
      }
    }
    if (subject) {
      clauses.push('LOWER(e.subject) = ?');
      values.push(String(subject).toLowerCase());
    }
    if (req.user.role === 'student') {
      clauses.push('(e.class_id = (SELECT class_id FROM users WHERE id = ?) OR (e.class_id IS NULL AND LOWER(e.class_level) = LOWER((SELECT c.name FROM users s JOIN classes c ON c.id = s.class_id WHERE s.id = ?))))');
      values.push(req.user.id, req.user.id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT e.*, c.name AS class_name, COUNT(DISTINCT a.id) AS total_attempts FROM cbt_examinations e LEFT JOIN classes c ON c.id = e.class_id LEFT JOIN cbt_attempts a ON a.exam_id = e.id ${where} GROUP BY e.id ORDER BY e.created_at DESC`,
      values
    );
    const exams = await Promise.all(rows.map(async (row) => {
      const exam = examFromRow(row);
      let myAttempt = null;
      if (req.user.role === 'student') {
        const [attemptRows] = await pool.execute('SELECT * FROM cbt_attempts WHERE exam_id = ? AND student_id = ? ORDER BY attempt_number DESC LIMIT 1', [exam.id, req.user.id]);
        if (attemptRows[0]) myAttempt = attemptFromRow(attemptRows[0]);
      }
      return {
        id: exam.id, title: exam.title, year: exam.year, session: exam.session, term: exam.term,
        schoolSection: exam.schoolSection, classCategory: exam.classCategory, classLevel: exam.classLevel,
        classId: exam.classId, className: row.class_name || exam.classLevel, examLevel: exam.examLevel,
        examCategory: exam.examCategory, subject: exam.subject, durationMins: exam.durationMins,
        totalMarks: exam.totalMarks, numberQuestions: exam.numberQuestions,
        openingDate: exam.openingDate, openingTime: exam.openingTime, closingDate: exam.closingDate,
        closingTime: exam.closingTime, instructions: exam.instructions, status: exam.status,
        maxAttempts: exam.maxAttempts || 1, resultCalculationMethod: exam.resultCalculationMethod || 'highest',
        totalAttempts: Number(row.total_attempts), timeInfo: computeExamTimeStatus(exam),
        myAttempt: myAttempt ? {
          id: myAttempt.id, status: myAttempt.status, score: myAttempt.score, percentage: myAttempt.percentage,
          grade: myAttempt.grade, startTime: myAttempt.startTime, submissionTime: myAttempt.submissionTime,
        } : null,
        createdAt: exam.createdAt,
      };
    }));
    res.json(exams);
  } catch (err) {
    next(err);
  }
});

// POST /api/cbt/exams  – create a new CBT examination (Teacher & Admin)
router.post('/exams', requireRole('teacher', 'admin'), async (req, res, next) => {
  const {
    title,
    year = '2026',
    session = '2026/2027',
    term = 'First Term',
    schoolSection = 'jss',
    classCategory = 'Junior Secondary Section',
    classLevel = 'JSS1',
    classId,
    examLevel = 'Junior Secondary Level',
    examCategory = 'First Term Examination',
    subject,
    durationMins = 60,
    totalMarks = 100,
    openingDate,
    openingTime = '08:00',
    closingDate,
    closingTime = '17:00',
    studentAccessTime = 'Standard Window',
    instructions = 'Read all questions carefully. Choose the single best answer for each question.',
    status = 'scheduled',
    maxAttempts = 1,
    resultCalculationMethod = 'highest',
    questionIds = [],
    customQuestions = [],
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'Examination title is required' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Subject is required' });
  }
  if (!openingDate || !closingDate) {
    return res.status(400).json({ message: 'Opening and closing dates are required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const finalQuestions = [];
    if (Array.isArray(questionIds) && questionIds.length) {
      const placeholders = questionIds.map(() => '?').join(', ');
      const [rows] = await connection.execute(`SELECT * FROM question_bank WHERE id IN (${placeholders})`, questionIds.map(Number));
      const byId = new Map(rows.map((row) => [Number(row.id), questionFromRow(row)]));
      questionIds.forEach((id) => {
        const question = byId.get(Number(id));
        if (question) finalQuestions.push({
          id: question.id, question: question.question, type: question.type,
          options: question.options, correctAnswer: question.correctAnswer,
          marks: question.marks || 1, category: question.category || 'General', explanation: question.explanation || '',
        });
      });
    }
    if (Array.isArray(customQuestions)) {
      customQuestions.forEach((question, index) => finalQuestions.push({
        id: finalQuestions.length + index + 1,
        question: question.question, type: question.type || 'multiple_choice',
        options: question.options || [], correctAnswer: question.correctAnswer,
        marks: question.marks || 1, category: question.category || 'General', explanation: question.explanation || '',
      }));
    }
    const calculatedTotalMarks = finalQuestions.reduce((sum, question) => sum + (Number(question.marks) || 1), 0);
    const examValues = [
      title.trim(), String(year), session, term, schoolSection, classCategory, classLevel,
      classId ? Number(classId) : null, examLevel, examCategory, subject, Number(durationMins) || 60,
      calculatedTotalMarks > 0 ? calculatedTotalMarks : Number(totalMarks) || 100,
      finalQuestions.length, openingDate, openingTime, closingDate, closingTime, studentAccessTime,
      instructions, status || 'scheduled', Number(maxAttempts) || 1, resultCalculationMethod,
      JSON.stringify(finalQuestions), req.user.id, req.user.name,
    ];
    const [result] = await connection.execute(
      'INSERT INTO cbt_examinations (title, academic_year, session, term, school_section, class_category, class_level, class_id, exam_level, exam_category, subject, duration_mins, total_marks, number_questions, opening_date, opening_time, closing_date, closing_time, student_access_time, instructions, status, max_attempts, result_calculation_method, questions, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      examValues
    );
    const exam = { id: Number(result.insertId), title: title.trim(), year: String(year), session, term, schoolSection, classCategory, classLevel, classId: classId ? Number(classId) : null, examLevel, examCategory, subject, durationMins: Number(durationMins) || 60, totalMarks: calculatedTotalMarks > 0 ? calculatedTotalMarks : Number(totalMarks) || 100, numberQuestions: finalQuestions.length, openingDate, openingTime, closingDate, closingTime, studentAccessTime, instructions, status: status || 'scheduled', maxAttempts: Number(maxAttempts) || 1, resultCalculationMethod, questions: finalQuestions, createdById: Number(req.user.id), createdByName: req.user.name, createdAt: new Date().toISOString() };
    await logAudit(connection, {
      staffId: req.user.id, staffName: req.user.name, examId: exam.id, examTitle: exam.title,
      action: 'CREATE_EXAM', reason: `Created exam with ${finalQuestions.length} questions`,
    });
    await connection.commit();
    res.status(201).json(exam);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// GET /api/cbt/exams/:id  – get full exam details
router.get('/exams/:id', async (req, res, next) => {
  try {
    const exam = await loadExam(Number(req.params.id));
    if (!exam) return res.status(404).json({ message: 'Examination not found' });
    const [classes] = await pool.execute('SELECT name FROM classes WHERE id = ?', [exam.classId]);
    const timeInfo = computeExamTimeStatus(exam);
    if (req.user.role === 'student') {
      const [students] = await pool.execute('SELECT id, class_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'student']);
      const student = students[0];
      if (!student) return res.status(401).json({ message: 'Unauthorized' });
      if (exam.classId && Number(exam.classId) !== Number(student.class_id)) {
        return res.status(403).json({ message: 'You are not enrolled in the class assigned to this examination' });
      }
      const [attemptRows] = await pool.execute('SELECT * FROM cbt_attempts WHERE exam_id = ? AND student_id = ? ORDER BY attempt_number', [exam.id, req.user.id]);
      const activeAttempt = attemptRows.find((attempt) => attempt.status === 'In Progress');
      return res.json({
        id: exam.id, title: exam.title, year: exam.year, session: exam.session, term: exam.term,
        schoolSection: exam.schoolSection, classLevel: exam.classLevel, className: classes[0]?.name || exam.classLevel,
        subject: exam.subject, durationMins: exam.durationMins, totalMarks: exam.totalMarks,
        numberQuestions: exam.numberQuestions, openingDate: exam.openingDate, openingTime: exam.openingTime,
        closingDate: exam.closingDate, closingTime: exam.closingTime, instructions: exam.instructions,
        status: exam.status, maxAttempts: exam.maxAttempts || 1, attemptsUsed: attemptRows.length,
        hasActiveAttempt: Boolean(activeAttempt), activeAttemptId: activeAttempt ? Number(activeAttempt.id) : null,
        timeInfo, serverTime: new Date().toISOString(),
      });
    }
    const [attemptRows] = await pool.execute('SELECT COUNT(*) AS count FROM cbt_attempts WHERE exam_id = ?', [exam.id]);
    res.json({ ...exam, className: classes[0]?.name || exam.classLevel, timeInfo, attemptsCount: Number(attemptRows.count), serverTime: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// PUT /api/cbt/exams/:id  – edit examination settings and questions
router.put('/exams/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  const examId = Number(req.params.id);
  const columns = {
    title: 'title', year: 'academic_year', session: 'session', term: 'term', schoolSection: 'school_section',
    classCategory: 'class_category', classLevel: 'class_level', classId: 'class_id', examLevel: 'exam_level',
    examCategory: 'exam_category', subject: 'subject', durationMins: 'duration_mins', totalMarks: 'total_marks',
    openingDate: 'opening_date', openingTime: 'opening_time', closingDate: 'closing_date', closingTime: 'closing_time',
    studentAccessTime: 'student_access_time', instructions: 'instructions', status: 'status', maxAttempts: 'max_attempts',
    resultCalculationMethod: 'result_calculation_method', questions: 'questions',
  };
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const exam = await loadExam(examId, connection);
    if (!exam) {
      await connection.rollback();
      return res.status(404).json({ message: 'Examination not found' });
    }
    const fields = Object.keys(columns).filter((field) => req.body[field] !== undefined);
    const values = fields.map((field) => {
      const value = req.body[field];
      if (field === 'classId') return value ? Number(value) : null;
      if (['durationMins', 'totalMarks', 'maxAttempts'].includes(field)) return Number(value);
      if (field === 'questions') return JSON.stringify(value);
      if (field === 'year') return String(value);
      return value;
    });
    if (fields.length) {
      const assignments = fields.map((field) => `${columns[field]} = ?`);
      assignments.push('updated_at = CURRENT_TIMESTAMP(3)');
      if (req.body.questions !== undefined) {
        assignments.push('number_questions = ?');
        values.push(Array.isArray(req.body.questions) ? req.body.questions.length : 0);
      }
      await connection.execute(`UPDATE cbt_examinations SET ${assignments.join(', ')} WHERE id = ?`, [...values, examId]);
    }
    const updatedExam = await loadExam(examId, connection);
    await logAudit(connection, { staffId: req.user.id, staffName: req.user.name, examId, examTitle: updatedExam.title, action: 'UPDATE_EXAM', reason: req.body.reason || 'Updated examination parameters' });
    await connection.commit();
    res.json(updatedExam);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// PUT /api/cbt/exams/:id/control  – Principal & Teacher controls (Open, Close, Block, Unblock, Reschedule, Cancel)
router.put('/exams/:id/control', requireRole('teacher', 'admin'), async (req, res, next) => {
  const { action, openingDate, openingTime, closingDate, closingTime, durationMins, reason } = req.body;

  if (!action) {
    return res.status(400).json({ message: 'Control action is required (e.g. open, close, block, unblock, reschedule, cancel)' });
  }

  const examId = Number(req.params.id);
  let exam;
  try {
    exam = await loadExam(examId);
  } catch (err) {
    return next(err);
  }
  if (!exam) return res.status(404).json({ message: 'Examination not found' });
  const updates = {};
  switch (action) {
    case 'open':
      updates.status = 'active';
      break;
    case 'close':
      updates.status = 'closed';
      break;
    case 'block':
      updates.status = 'blocked';
      break;
    case 'unblock':
      updates.status = 'scheduled';
      break;
    case 'cancel':
      updates.status = 'cancelled';
      break;
    case 'reschedule':
      if (openingDate) updates.opening_date = openingDate;
      if (openingTime) updates.opening_time = openingTime;
      if (closingDate) updates.closing_date = closingDate;
      if (closingTime) updates.closing_time = closingTime;
      if (durationMins) updates.duration_mins = Number(durationMins);
      break;
    default:
      return res.status(400).json({ message: `Unknown control action: ${action}` });
  }

  try {
    const assignments = Object.keys(updates).map((field) => `${field} = ?`);
    const values = Object.values(updates);
    assignments.push('updated_at = CURRENT_TIMESTAMP(3)');
    await pool.execute(`UPDATE cbt_examinations SET ${assignments.join(', ')} WHERE id = ?`, [...values, examId]);
    const updatedExam = await loadExam(examId);
    await logAudit(pool, { staffId: req.user.id, staffName: req.user.name, examId, examTitle: exam.title, action: `CONTROL_${action.toUpperCase()}`, reason: reason || `Performed ${action} operation on examination` });
    res.json({ message: `Examination ${action}ed successfully`, exam: updatedExam });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cbt/exams/:id
router.delete('/exams/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const exam = await loadExam(id, connection);
    if (!exam) {
      await connection.rollback();
      return res.status(404).json({ message: 'Examination not found' });
    }
    await logAudit(connection, { staffId: req.user.id, staffName: req.user.name, examId: id, examTitle: exam.title, action: 'DELETE_EXAM', reason: 'Examination deleted by staff' });
    await connection.execute('DELETE FROM cbt_examinations WHERE id = ?', [id]);
    await connection.commit();
    res.json({ message: 'Examination and associated attempts deleted' });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// ==========================================
// 4. CBT EXAMINATION ATTEMPTS & SECURE EXECUTION
// ==========================================

// POST /api/cbt/exams/:id/start  – Student starts or resumes CBT attempt
router.post('/exams/:id/start', requireRole('student'), async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const exam = await loadExam(Number(req.params.id), connection);
    if (!exam) {
      await connection.rollback();
      return res.status(404).json({ message: 'Examination not found' });
    }
    const [studentRows] = await connection.execute(
      'SELECT u.id, u.name, u.school_id, u.class_id, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.role = ?',
      [req.user.id, 'student']
    );
    const student = studentRows[0];
    if (!student) {
      await connection.rollback();
      return res.status(401).json({ message: 'Student account not found' });
    }
    if (exam.classId && Number(exam.classId) !== Number(student.class_id)) {
      await logAccess(connection, { studentId: student.id, examId: exam.id, action: 'ACCESS_REJECTED', status: 'failed', details: 'Mismatched class authorization', req });
      await connection.commit();
      return res.status(403).json({ message: 'Access Denied: You are not authorized to take examinations for another class.' });
    }
    if (['blocked', 'cancelled', 'closed'].includes(exam.status)) {
      await connection.rollback();
      const message = exam.status === 'blocked'
        ? 'This examination has been temporarily blocked by the administration.'
        : exam.status === 'cancelled' ? 'This examination has been cancelled.' : 'This examination has officially closed.';
      return res.status(403).json({ message });
    }

    const [attemptRows] = await connection.execute('SELECT * FROM cbt_attempts WHERE exam_id = ? AND student_id = ? ORDER BY attempt_number FOR UPDATE', [exam.id, student.id]);
    const attempts = attemptRows.map((row) => attemptFromRow({ ...row, student_name: student.name, student_school_id: student.school_id, class_name: student.class_name, exam_title: exam.title }));
    const now = new Date();
    const nowMs = now.getTime();
    const examEndMs = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();
    const examStartMs = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();
    const activeAttempt = attempts.find((attempt) => attempt.status === 'In Progress');

    if (activeAttempt) {
      const expectedEndMs = new Date(activeAttempt.expectedEndTime).getTime();
      if (nowMs >= expectedEndMs || nowMs >= examEndMs) {
        const grade = scoreAnswers(exam, activeAttempt.savedAnswers);
        const completed = { ...activeAttempt, status: 'Auto Submitted', submissionTime: now.toISOString(), ...grade };
        await updateAttempt(connection, activeAttempt.id, completed);
        await logAccess(connection, { studentId: student.id, examId: exam.id, attemptId: activeAttempt.id, action: 'AUTO_SUBMIT', status: 'completed', details: 'Attempt auto-submitted due to time expiration on reconnection', req });
        await connection.commit();
        return res.status(200).json({ resumed: false, message: 'Your time for this examination has expired. It was automatically submitted.', attempt: completed, isCompleted: true });
      }
      const remainingSeconds = Math.max(0, Math.floor((Math.min(expectedEndMs, examEndMs) - nowMs) / 1000));
      activeAttempt.lastActivityTime = now.toISOString();
      await updateAttempt(connection, activeAttempt.id, activeAttempt);
      await logAccess(connection, { studentId: student.id, examId: exam.id, attemptId: activeAttempt.id, action: 'RESUME', status: 'success', details: `Resumed attempt. ${remainingSeconds}s remaining`, req });
      await connection.commit();
      return res.json({
        resumed: true,
        attempt: { id: activeAttempt.id, attemptCode: activeAttempt.attemptCode, attemptNumber: activeAttempt.attemptNumber, startTime: activeAttempt.startTime, expectedEndTime: activeAttempt.expectedEndTime, savedAnswers: activeAttempt.savedAnswers || {}, status: activeAttempt.status },
        remainingSeconds, serverTime: now.toISOString(),
        exam: { id: exam.id, title: exam.title, subject: exam.subject, durationMins: exam.durationMins, totalMarks: exam.totalMarks, instructions: exam.instructions },
        student: { id: Number(student.id), name: student.name, schoolId: student.school_id, className: student.class_name || '' },
        questions: sanitizeQuestionsForStudent(exam.questions || []),
      });
    }

    if (nowMs < examStartMs) {
      await connection.rollback();
      return res.status(403).json({ message: 'This examination is not available yet. Please return at the scheduled time.', opensInSeconds: Math.max(0, Math.floor((examStartMs - nowMs) / 1000)), scheduledOpening: `${exam.openingDate} ${exam.openingTime}` });
    }
    if (nowMs > examEndMs) {
      await connection.rollback();
      return res.status(403).json({ message: 'This examination has expired and is no longer accepting attempts.' });
    }
    const completedAttempts = attempts.filter((attempt) => ['Submitted', 'Auto Submitted'].includes(attempt.status));
    const maxAttempts = Number(exam.maxAttempts) || 1;
    if (completedAttempts.length >= maxAttempts) {
      await connection.rollback();
      return res.status(403).json({ message: `You have completed all permitted attempts (${completedAttempts.length}/${maxAttempts}) for this examination.`, attemptsUsed: completedAttempts.length, maxAttempts });
    }

    const attemptNumber = attempts.length + 1;
    const permittedEndMs = Math.min(nowMs + (Number(exam.durationMins) || 60) * 60 * 1000, examEndMs);
    const expectedEndTime = new Date(permittedEndMs).toISOString();
    const attemptCode = `ATT-${exam.year}-${require('crypto').randomUUID()}`;
    const [result] = await connection.execute(
      'INSERT INTO cbt_attempts (attempt_code, student_id, exam_id, attempt_number, start_time, expected_end_time, last_activity_time, status, saved_answers, correct_count, wrong_count, unanswered_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [attemptCode, student.id, exam.id, attemptNumber, dateTimeValue(now), dateTimeValue(expectedEndTime), dateTimeValue(now), 'In Progress', JSON.stringify({}), 0, 0, exam.questions.length]
    );
    const attemptId = Number(result.insertId);
    const remainingSeconds = Math.max(0, Math.floor((permittedEndMs - nowMs) / 1000));
    await logAccess(connection, { studentId: student.id, examId: exam.id, attemptId, action: 'START', status: 'success', details: `Started attempt #${attemptNumber}. Allocated ${remainingSeconds}s`, req });
    await connection.commit();
    res.status(201).json({
      resumed: false,
      attempt: { id: attemptId, attemptCode, attemptNumber, startTime: now.toISOString(), expectedEndTime, savedAnswers: {}, status: 'In Progress' },
      remainingSeconds, serverTime: now.toISOString(),
      exam: { id: exam.id, title: exam.title, subject: exam.subject, durationMins: exam.durationMins, totalMarks: exam.totalMarks, instructions: exam.instructions },
      student: { id: Number(student.id), name: student.name, schoolId: student.school_id, className: student.class_name || '' },
      questions: sanitizeQuestionsForStudent(exam.questions || []),
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// POST /api/cbt/attempts/:id/save  – Periodic & continuous answer autosaving
router.post('/attempts/:id/save', requireRole('student'), async (req, res, next) => {
  const { answers } = req.body;
  const attemptId = Number(req.params.id);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const attempt = await loadAttempt(attemptId, connection, true);
    if (!attempt) {
      await connection.rollback();
      return res.status(404).json({ message: 'Attempt not found' });
    }
    if (Number(attempt.studentId) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Unauthorized attempt modification' });
    }
    if (attempt.status !== 'In Progress') {
      await connection.rollback();
      return res.status(400).json({ message: `Attempt is no longer in progress (status: ${attempt.status})`, status: attempt.status });
    }
    const exam = await loadExam(attempt.examId, connection);
    const now = new Date();
    const nowMs = now.getTime();
    const expectedEndMs = new Date(attempt.expectedEndTime).getTime();
    const examEndMs = exam ? new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime() : expectedEndMs;
    const savedAnswers = answers && typeof answers === 'object' ? { ...attempt.savedAnswers, ...answers } : attempt.savedAnswers;
    if (nowMs >= expectedEndMs || nowMs >= examEndMs) {
      const grade = scoreAnswers(exam || { questions: [], totalMarks: 0 }, savedAnswers);
      const completed = { ...attempt, savedAnswers, status: 'Auto Submitted', submissionTime: now.toISOString(), ...grade };
      await updateAttempt(connection, attemptId, completed);
      await logAccess(connection, { studentId: req.user.id, examId: attempt.examId, attemptId, action: 'AUTO_SUBMIT', status: 'completed', details: 'Time ran out during autosave', req });
      await connection.commit();
      return res.json({ saved: true, timeExpired: true, status: 'Auto Submitted', message: 'Time has expired. Examination automatically submitted.', attempt: completed });
    }
    const lastActivityTime = now.toISOString();
    await updateAttempt(connection, attemptId, { ...attempt, savedAnswers, lastActivityTime });
    const remainingSeconds = Math.max(0, Math.floor((Math.min(expectedEndMs, examEndMs) - nowMs) / 1000));
    await connection.commit();
    res.json({ saved: true, timeExpired: false, remainingSeconds, lastSaved: lastActivityTime });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// POST /api/cbt/attempts/:id/proctoring-recording - stores the completed camera recording
router.post(
  '/attempts/:id/proctoring-recording',
  requireRole('student'),
  express.raw({ type: /video\/(webm|mp4)/, limit: '150mb' }),
  async (req, res, next) => {
    const attemptId = Number(req.params.id);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message: 'No camera recording was received' });
    try {
      const [rows] = await pool.execute('SELECT id, exam_id FROM cbt_attempts WHERE id = ? AND student_id = ?', [attemptId, req.user.id]);
      if (!rows.length) return res.status(404).json({ message: 'Attempt not found' });
      const recordingsDir = path.resolve(process.env.PROCTORING_DIR || path.join(__dirname, '..', 'data', 'proctoring'));
      fs.mkdirSync(recordingsDir, { recursive: true });
      const fileName = `attempt-${attemptId}-${Date.now()}.webm`;
      fs.writeFileSync(path.join(recordingsDir, fileName), req.body);
      const [result] = await pool.execute(
        'INSERT INTO cbt_proctoring (attempt_id, student_id, exam_id, file_name, mime_type, bytes) VALUES (?, ?, ?, ?, ?, ?)',
        [attemptId, req.user.id, rows[0].exam_id, fileName, req.headers['content-type'] || 'video/webm', req.body.length]
      );
      res.status(201).json({ saved: true, recordingId: Number(result.insertId) });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/cbt/attempts/:id/submit  – Manual or triggered submission
router.post('/attempts/:id/submit', requireRole('student'), async (req, res, next) => {
  const { answers, autoSubmitted = false } = req.body;
  const attemptId = Number(req.params.id);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const attempt = await loadAttempt(attemptId, connection, true);
    if (!attempt) {
      await connection.rollback();
      return res.status(404).json({ message: 'Attempt not found' });
    }
    if (Number(attempt.studentId) !== Number(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Unauthorized attempt submission' });
    }
    if (attempt.status !== 'In Progress') {
      await connection.rollback();
      return res.status(400).json({ message: `This examination has already been submitted or locked (status: ${attempt.status}).`, attempt });
    }
    const exam = await loadExam(attempt.examId, connection);
    if (!exam) {
      await connection.rollback();
      return res.status(404).json({ message: 'Examination details not found' });
    }
    const now = new Date();
    const savedAnswers = answers && typeof answers === 'object' ? { ...attempt.savedAnswers, ...answers } : attempt.savedAnswers;
    const grade = scoreAnswers(exam, savedAnswers);
    const status = autoSubmitted ? 'Auto Submitted' : 'Submitted';
    await updateAttempt(connection, attemptId, { ...attempt, ...grade, savedAnswers, status, submissionTime: now.toISOString(), lastActivityTime: now.toISOString() });
    await logAccess(connection, { studentId: req.user.id, examId: exam.id, attemptId, action: autoSubmitted ? 'AUTO_SUBMIT' : 'SUBMIT', status: 'completed', details: `Scored ${grade.score}/${grade.totalMarks} (${grade.percentage}%) - Grade: ${grade.grade}`, req });
    await connection.commit();
    res.json({
      message: 'Examination submitted successfully!',
      result: { attemptId, attemptCode: attempt.attemptCode, status, score: grade.score, totalMarks: grade.totalMarks, percentage: grade.percentage, correctCount: grade.correctCount, wrongCount: grade.wrongCount, unansweredCount: grade.unansweredCount, grade: grade.grade, remark: getCbtGrade(grade.percentage).remark, passed: grade.passed, submissionTime: now.toISOString() },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// GET /api/cbt/exams/:id/my-result  – Student gets their submission result
router.get('/exams/:id/my-result', requireRole('student'), async (req, res, next) => {
  try {
    const examId = Number(req.params.id);
    const [rows] = await pool.execute(
      'SELECT a.*, u.name AS student_name, u.school_id AS student_school_id, c.name AS class_name, e.title AS exam_title FROM cbt_attempts a JOIN cbt_examinations e ON e.id = a.exam_id LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id WHERE a.exam_id = ? AND a.student_id = ? AND a.status IN (?, ?) ORDER BY a.attempt_number',
      [examId, req.user.id, 'Submitted', 'Auto Submitted']
    );
    if (!rows.length) return res.status(404).json({ message: 'No submitted result found for this examination' });
    const exam = await loadExam(examId);
    const attempts = rows.map(attemptFromRow);
    let bestAttempt = attempts[attempts.length - 1];
    if (exam?.resultCalculationMethod === 'highest') bestAttempt = [...attempts].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    else if (exam?.resultCalculationMethod === 'first') bestAttempt = attempts[0];
    res.json({ examTitle: exam?.title || 'Examination', subject: exam?.subject || '', totalMarks: exam?.totalMarks || 100, attempt: bestAttempt, allAttempts: attempts });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. ADMINISTRATIVE OVERRIDES & ATTEMPTS AUDITING
// ==========================================

// GET /api/cbt/exams/:id/attempts  – View all attempts for an exam (Teacher & Admin)
router.get('/exams/:id/attempts', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
  const examId = Number(req.params.id);
  const exam = await loadExam(examId);
  if (!exam) return res.status(404).json({ message: 'Examination not found' });
  const [rows] = await pool.execute('SELECT a.*, u.name AS student_name, u.school_id AS student_school_id, c.name AS class_name, e.title AS exam_title FROM cbt_attempts a LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id LEFT JOIN cbt_examinations e ON e.id = a.exam_id WHERE a.exam_id = ? ORDER BY a.attempt_number', [examId]);
  const attempts = rows.map(attemptFromRow);

  res.json({
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      totalMarks: exam.totalMarks,
      maxAttempts: exam.maxAttempts || 1,
    },
    attempts,
  });
  } catch (err) {
    next(err);
  }
});

// GET /api/cbt/exam-attempts  – Global attempts query across all exams
router.get('/exam-attempts', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const { examId, studentId, status } = req.query;
    const clauses = [];
    const values = [];
    for (const [field, column] of [['examId', 'a.exam_id'], ['studentId', 'a.student_id'], ['status', 'a.status']]) {
      if (req.query[field]) {
        clauses.push(`${column} = ?`);
        values.push(field === 'status' ? req.query[field] : Number(req.query[field]));
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT a.*, u.name AS student_name, u.school_id AS student_school_id, c.name AS class_name, e.title AS exam_title, e.subject, e.total_marks FROM cbt_attempts a LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id LEFT JOIN cbt_examinations e ON e.id = a.exam_id ${where} ORDER BY a.start_time DESC`,
      values
    );
    const _unusedFilters = { examId, studentId };
    res.json(rows.map((row) => ({ ...attemptFromRow(row), subject: row.subject || '', totalMarks: Number(row.total_marks || 100) })));
  } catch (err) {
    next(err);
  }
});

router.get('/monitor/active', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const clauses = ['a.status = ?'];
    const values = ['In Progress'];
    if (req.query.examId) {
      clauses.push('a.exam_id = ?');
      values.push(Number(req.query.examId));
    }
    if (req.user.role === 'teacher') {
      clauses.push('(c.form_teacher_id = ? OR a.student_id IN (SELECT s.id FROM users s JOIN class_subjects cs ON cs.class_id = s.class_id WHERE cs.teacher_id = ?))');
      values.push(req.user.id, req.user.id);
    }
    const [rows] = await pool.execute(
      `SELECT a.id, a.student_id, u.name AS student_name, u.school_id, c.name AS class_name, a.exam_id, e.title AS exam_title, a.start_time, a.last_activity_time, a.status FROM cbt_attempts a JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id JOIN cbt_examinations e ON e.id = a.exam_id WHERE ${clauses.join(' AND ')} ORDER BY a.start_time DESC`,
      values
    );
    res.json(rows.map((row) => ({ id: Number(row.id), studentId: Number(row.student_id), studentName: row.student_name, studentSchoolId: row.school_id || '', className: row.class_name || '', examId: Number(row.exam_id), examTitle: row.exam_title, startTime: row.start_time, lastActivityTime: row.last_activity_time, status: row.status })));
  } catch (err) {
    next(err);
  }
});

router.get('/monitor/signals', requireRole('teacher', 'admin', 'student'), async (req, res, next) => {
  try {
    const clauses = ['s.to_id = ?', 's.id > ?'];
    const values = [req.user.id, Number(req.query.after || 0)];
    if (req.query.attemptId) {
      clauses.push('s.attempt_id = ?');
      values.push(Number(req.query.attemptId));
    }
    if (req.query.examId) {
      clauses.push('a.exam_id = ?');
      values.push(Number(req.query.examId));
    }
    if (req.user.role === 'teacher') {
      clauses.push('(c.form_teacher_id = ? OR a.student_id IN (SELECT s2.id FROM users s2 JOIN class_subjects cs ON cs.class_id = s2.class_id WHERE cs.teacher_id = ?))');
      values.push(req.user.id, req.user.id);
    } else if (req.user.role === 'student') {
      clauses.push('a.student_id = ?');
      values.push(req.user.id);
    }
    const [rows] = await pool.execute(
      `SELECT s.* FROM cbt_monitor_signals s JOIN cbt_attempts a ON a.id = s.attempt_id LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id WHERE ${clauses.join(' AND ')} ORDER BY s.id`,
      values
    );
    res.json(rows.map((row) => ({ id: Number(row.id), attemptId: Number(row.attempt_id), fromId: Number(row.from_id), toId: Number(row.to_id), type: row.type, payload: parseJson(row.payload), createdAt: row.created_at })));
  } catch (err) {
    next(err);
  }
});

router.post('/monitor/signals', requireRole('teacher', 'admin', 'student'), async (req, res, next) => {
  const { attemptId: rawAttemptId, toId: rawToId, type, payload } = req.body;
  const attemptId = Number(rawAttemptId);
  const toId = Number(rawToId);
  try {
  const attempt = await loadAttempt(attemptId);
  if (!attempt || !await canMonitorAttempt(attempt, req.user)) return res.status(403).json({ message: 'You cannot monitor this examination attempt' });
  if (!['offer', 'answer', 'candidate', 'leave'].includes(type)) return res.status(400).json({ message: 'Invalid monitoring signal' });

  if (req.user.role === 'student') {
    const [recipients] = await pool.execute('SELECT id, role FROM users WHERE id = ? AND role IN (?, ?)', [toId, 'teacher', 'admin']);
    const recipient = recipients[0];
    if (!recipient || !await canMonitorAttempt(attempt, { id: Number(recipient.id), role: recipient.role })) return res.status(403).json({ message: 'This staff member cannot monitor your attempt' });
  } else if (toId !== Number(attempt.studentId)) {
    return res.status(400).json({ message: 'Monitoring signals must be sent to the candidate' });
  }
  await pool.execute('DELETE FROM cbt_monitor_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)');
  const [result] = await pool.execute('INSERT INTO cbt_monitor_signals (attempt_id, from_id, to_id, type, payload) VALUES (?, ?, ?, ?, ?)', [attemptId, req.user.id, toId, type, payload == null ? null : JSON.stringify(payload)]);
  res.status(201).json({ ok: true, id: Number(result.insertId) });
  } catch (err) {
    next(err);
  }
});

// POST /api/cbt/attempts/:id/override  – Teacher / Principal Attempt Override
router.post('/attempts/:id/override', requireRole('teacher', 'admin'), async (req, res, next) => {
  const { action, reason } = req.body;
  const attemptId = Number(req.params.id);

  if (!action || !reason || !reason.trim()) {
    return res.status(400).json({ message: 'Both override action and a valid reason are strictly required for auditing' });
  }

  if (!['RESET_ATTEMPT', 'ALLOW_ANOTHER_ATTEMPT', 'FORCE_SUBMIT', 'CANCEL_ATTEMPT', 'UNLOCK_ATTEMPT'].includes(action)) {
    return res.status(400).json({ message: `Unsupported override action: ${action}` });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const attempt = await loadAttempt(attemptId, connection, true);
    if (!attempt) {
      await connection.rollback();
      return res.status(404).json({ message: 'Attempt not found' });
    }
    const exam = await loadExam(attempt.examId, connection);
    const now = new Date();
    let updated = { ...attempt };
    if (action === 'RESET_ATTEMPT') {
      const durationMs = (Number(exam?.durationMins) || 60) * 60 * 1000;
      updated = { ...updated, status: 'In Progress', startTime: now.toISOString(), expectedEndTime: new Date(now.getTime() + durationMs).toISOString(), submissionTime: null, savedAnswers: {}, score: null, percentage: null, correctCount: 0, wrongCount: 0, unansweredCount: exam?.questions.length || 0, grade: null, passed: null };
    } else if (action === 'ALLOW_ANOTHER_ATTEMPT') {
      updated.status = 'Unlocked';
    } else if (action === 'FORCE_SUBMIT') {
      const grade = scoreAnswers(exam || { questions: [], totalMarks: 0 }, attempt.savedAnswers);
      updated = { ...updated, ...grade, status: 'Submitted', submissionTime: now.toISOString() };
    } else if (action === 'CANCEL_ATTEMPT') {
      updated.status = 'Cancelled';
    } else if (action === 'UNLOCK_ATTEMPT') {
      updated.status = 'In Progress';
      updated.expectedEndTime = new Date(now.getTime() + (Number(req.body.extraMinutes) || 15) * 60 * 1000).toISOString();
    }
    await updateAttempt(connection, attemptId, updated);
    await connection.execute('UPDATE cbt_attempts SET start_time = ?, expected_end_time = ? WHERE id = ?', [dateTimeValue(updated.startTime), dateTimeValue(updated.expectedEndTime), attemptId]);
    const auditEntry = await logAudit(connection, {
      staffId: req.user.id, staffName: req.user.name, studentId: attempt.studentId,
      studentName: attempt.studentName || 'Unknown Student', examId: exam?.id,
      examTitle: exam?.title || 'Unknown Examination', action, reason: reason.trim(),
    });
    await connection.commit();
    res.json({ message: `Attempt successfully modified with action ${action}`, attempt: updated, auditEntry });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

// GET /api/cbt/audit-logs  – View Attempt Override Audit Logs
router.get('/audit-logs', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, staff_id AS staffId, staff_name AS staffName, student_id AS studentId, student_name AS studentName, exam_id AS examId, exam_title AS examTitle, action, DATE_FORMAT(created_at, \'%Y-%m-%d\') AS date, TIME_FORMAT(created_at, \'%H:%i:%s\') AS time, reason, created_at AS createdAt FROM cbt_audit_logs ORDER BY created_at DESC LIMIT 500');
    res.json(rows.map((row) => ({ ...row, id: Number(row.id) })));
  } catch (err) {
    next(err);
  }
});

// GET /api/cbt/access-logs  – View Examination Access History Logs
router.get('/access-logs', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const clauses = [];
    const values = [];
    if (req.query.examId) { clauses.push('l.exam_id = ?'); values.push(Number(req.query.examId)); }
    if (req.query.studentId) { clauses.push('l.student_id = ?'); values.push(Number(req.query.studentId)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT l.id, l.student_id AS studentId, l.exam_id AS examId, l.attempt_id AS attemptId, l.action, l.status, l.details, l.ip_address AS ipAddress, l.user_agent AS userAgent, l.created_at AS timestamp, u.name AS studentName, u.school_id AS studentSchoolId, e.title AS examTitle FROM cbt_access_logs l LEFT JOIN users u ON u.id = l.student_id LEFT JOIN cbt_examinations e ON e.id = l.exam_id ${where} ORDER BY l.created_at DESC LIMIT 200`,
      values
    );
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), studentId: row.studentId === null ? null : Number(row.studentId), examId: row.examId === null ? null : Number(row.examId), attemptId: row.attemptId === null ? null : Number(row.attemptId), studentName: row.studentName || 'Unknown', studentSchoolId: row.studentSchoolId || '', examTitle: row.examTitle || 'Unknown' })));
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. EXAMINATION RESULTS MANAGEMENT
// ==========================================

// GET /api/cbt/results  – Global Results query with filters
router.get('/results', async (req, res, next) => {
  try {
    const filters = [
      ['examId', 'a.exam_id', Number], ['year', 'e.academic_year', String], ['session', 'e.session', String],
      ['term', 'e.term', String], ['schoolSection', 'e.school_section', String], ['classId', 'u.class_id', Number],
      ['studentId', 'a.student_id', Number],
    ];
    const clauses = ["a.status IN ('Submitted', 'Auto Submitted')"];
    const values = [];
    for (const [parameter, column, convert] of filters) {
      if (req.query[parameter]) {
        clauses.push(`${column} = ?`);
        values.push(convert(req.query[parameter]));
      }
    }
    if (req.query.subject) {
      clauses.push('LOWER(e.subject) = ?');
      values.push(String(req.query.subject).toLowerCase());
    }
    if (req.query.search) {
      clauses.push('(LOWER(u.name) LIKE ? OR LOWER(u.school_id) LIKE ? OR LOWER(e.title) LIKE ?)');
      const search = `%${String(req.query.search).toLowerCase()}%`;
      values.push(search, search, search);
    }
    if (req.user.role === 'student') {
      clauses.push('a.student_id = ?');
      values.push(req.user.id);
    }
    const [rows] = await pool.execute(
      `SELECT a.id, a.attempt_code, a.student_id, u.name AS student_name, u.school_id, u.class_id, c.name AS class_name, COALESCE(e.school_section, c.school_section, 'jss') AS school_section, a.exam_id, e.title AS exam_title, e.subject, e.academic_year, e.session, e.term, a.score, e.total_marks, a.percentage, a.correct_count, a.wrong_count, a.unanswered_count, a.grade, a.passed, a.status, a.start_time, a.submission_time FROM cbt_attempts a JOIN cbt_examinations e ON e.id = a.exam_id LEFT JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id WHERE ${clauses.join(' AND ')} ORDER BY a.submission_time DESC`,
      values
    );
    const results = rows.map((row) => ({
      id: Number(row.id), attemptCode: row.attempt_code, studentId: Number(row.student_id),
      studentName: row.student_name || 'Unknown Student', studentSchoolId: row.school_id || '',
      classId: row.class_id === null ? null : Number(row.class_id), className: row.class_name || 'Unassigned',
      schoolSection: row.school_section, examId: Number(row.exam_id), examTitle: row.exam_title,
      subject: row.subject, year: row.academic_year, session: row.session, term: row.term,
      score: Number(row.score || 0), totalMarks: Number(row.total_marks || 100),
      percentage: Number(row.percentage || 0), correctCount: Number(row.correct_count || 0),
      wrongCount: Number(row.wrong_count || 0), unansweredCount: Number(row.unanswered_count || 0),
      grade: row.grade || 'F', passed: row.passed === null ? null : Boolean(row.passed),
      status: row.status, startTime: row.start_time, submissionTime: row.submission_time,
    }));
    res.json({ total: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. GENERATE STUDENT POSITION & RANKINGS
// ==========================================

// POST /api/cbt/positions/generate  – Generate position ranking with ties handling
router.post('/positions/generate', requireRole('teacher', 'admin'), async (req, res, next) => {
  const {
    year = '2026',
    session = '2026/2027',
    term = 'First Term',
    schoolSection,
    classId,
    examId,
    subject,
    type = 'class', // 'class', 'subject', 'exam', 'overall'
  } = req.body;

  try {
  const clauses = ["a.status IN ('Submitted', 'Auto Submitted')"];
  const values = [];
  for (const [column, value] of [['e.academic_year', year], ['e.session', session], ['e.term', term]]) {
    if (value) { clauses.push(`${column} = ?`); values.push(String(value)); }
  }
  if (examId) { clauses.push('e.id = ?'); values.push(Number(examId)); }
  if (subject) { clauses.push('LOWER(e.subject) = ?'); values.push(String(subject).toLowerCase()); }
  if (classId) { clauses.push('u.class_id = ?'); values.push(Number(classId)); }
  const [results] = await pool.execute(
    `SELECT a.student_id, u.name AS student_name, u.school_id, c.name AS class_name, a.score, e.total_marks FROM cbt_attempts a JOIN cbt_examinations e ON e.id = a.exam_id JOIN users u ON u.id = a.student_id LEFT JOIN classes c ON c.id = u.class_id WHERE ${clauses.join(' AND ')}`,
    values
  );
  const grouped = new Map();
  results.forEach((row) => {
    const id = Number(row.student_id);
    const student = grouped.get(id) || { studentId: id, studentName: row.student_name, schoolId: row.school_id || '', className: row.class_name || 'Unassigned', examsTaken: 0, totalScore: 0, totalPossible: 0 };
    student.examsTaken += 1;
    student.totalScore += Number(row.score || 0);
    student.totalPossible += Number(row.total_marks || 100);
    grouped.set(id, student);
  });
  const studentRows = [...grouped.values()].map((student) => {
    const percentage = student.totalPossible > 0 ? Math.round((student.totalScore / student.totalPossible) * 100) : 0;
    return { ...student, average: Number((student.totalScore / student.examsTaken).toFixed(1)), percentage, grade: getCbtGrade(percentage).grade };
  });
  if (studentRows.length === 0) return res.status(400).json({ message: 'No examination results found for the selected criteria' });

  // Sort descending by total score, then average
  studentRows.sort((a, b) => b.totalScore - a.totalScore || b.average - a.average);

  // Format rank with standard tie-handling (1st, 2nd, 2nd, 4th...)
  let currentRank = 1;
  const formattedRankings = studentRows.map((row, idx) => {
    if (idx > 0) {
      if (row.totalScore < studentRows[idx - 1].totalScore) {
        currentRank = idx + 1;
      }
    }
    const suffix =
      currentRank === 1 ? '1st' : currentRank === 2 ? '2nd' : currentRank === 3 ? '3rd' : `${currentRank}th`;

    return {
      ...row,
      rank: currentRank,
      position: suffix,
    };
  });

  const [classes] = classId ? await pool.execute('SELECT name FROM classes WHERE id = ?', [Number(classId)]) : [[]];
  const [selectedExams] = examId ? await pool.execute('SELECT title FROM cbt_examinations WHERE id = ?', [Number(examId)]) : [[]];
  const positionRecord = {
    type,
    year,
    session,
    term,
    schoolSection: schoolSection || 'all',
    classId: classId ? Number(classId) : null,
    className: classId ? (classes[0]?.name || '') : 'All Classes',
    examId: examId ? Number(examId) : null,
    examTitle: examId ? (selectedExams[0]?.title || '') : 'Multiple Exams',
    subject: subject || 'All Subjects',
    totalStudents: formattedRankings.length,
    rankings: formattedRankings,
    generatedAt: new Date().toISOString(),
    generatedByName: req.user.name,
  };

  const [inserted] = await pool.execute(
    'INSERT INTO cbt_positions (type, academic_year, session, term, school_section, class_id, exam_id, subject, total_students, positions, generated_by, generated_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [type, String(year), session, term, schoolSection || 'all', classId ? Number(classId) : null, examId ? Number(examId) : null, subject || 'All Subjects', formattedRankings.length, JSON.stringify(formattedRankings), req.user.id, req.user.name]
  );
  positionRecord.id = Number(inserted.insertId);
  res.status(201).json(positionRecord);
  } catch (err) {
    next(err);
  }
});

// GET /api/cbt/positions  – View generated position records
router.get('/positions', async (req, res, next) => {
  try {
    const clauses = [];
    const values = [];
    for (const [parameter, column] of [['classId', 'class_id'], ['session', 'session'], ['term', 'term']]) {
      if (req.query[parameter]) { clauses.push(`${column} = ?`); values.push(parameter === 'classId' ? Number(req.query[parameter]) : req.query[parameter]); }
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(`SELECT * FROM cbt_positions ${where} ORDER BY created_at DESC`, values);
    res.json(rows.map((row) => ({ id: Number(row.id), type: row.type, year: row.academic_year, session: row.session, term: row.term, schoolSection: row.school_section, classId: row.class_id === null ? null : Number(row.class_id), className: row.class_name || '', examId: row.exam_id === null ? null : Number(row.exam_id), examTitle: row.exam_title || '', subject: row.subject, totalStudents: Number(row.total_students), rankings: parseJson(row.positions, []), generatedAt: row.created_at, generatedByName: row.generated_by_name })));
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 8. CLASS CATEGORIES & EXAM LEVELS MANAGEMENT
// ==========================================

function registerCatalogRoutes({ route, table, fields, defaults, select, orderBy, deleteMessage, notFoundMessage }) {
  router.get(route, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(`SELECT ${select} FROM ${table} ORDER BY ${orderBy}`);
      res.json(rows.map((row) => ({ ...row, id: Number(row.id) })));
    } catch (err) { next(err); }
  });
  router.post(route, requireRole('admin'), async (req, res, next) => {
    if (!req.body.name) return res.status(400).json({ message: 'Name is required' });
    try {
      const names = Object.keys(fields);
      const columns = names.map((field) => fields[field]);
      const values = names.map((field) => req.body[field] === undefined ? defaults[field] : fields[field].convert(req.body[field]));
      const [result] = await pool.execute(
        `INSERT INTO ${table} (${columns.map((field) => field.column).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values
      );
      const [rows] = await pool.execute(`SELECT ${select} FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json({ ...rows[0], id: Number(rows[0].id) });
    } catch (err) { next(err); }
  });
  router.put(`${route}/:id`, requireRole('admin'), async (req, res, next) => {
    try {
      const updates = Object.keys(fields).filter((field) => req.body[field] !== undefined);
      if (updates.length) {
        const assignments = updates.map((field) => `${fields[field].column.name} = ?`);
        const values = updates.map((field) => fields[field].convert(req.body[field]));
        const [result] = await pool.execute(`UPDATE ${table} SET ${assignments.join(', ')} WHERE id = ?`, [...values, Number(req.params.id)]);
        if (!result.affectedRows) return res.status(404).json({ message: notFoundMessage });
      }
      const [rows] = await pool.execute(`SELECT ${select} FROM ${table} WHERE id = ?`, [Number(req.params.id)]);
      if (!rows.length) return res.status(404).json({ message: notFoundMessage });
      res.json({ ...rows[0], id: Number(rows[0].id) });
    } catch (err) { next(err); }
  });
  router.delete(`${route}/:id`, requireRole('admin'), async (req, res, next) => {
    try {
      const [result] = await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [Number(req.params.id)]);
      if (!result.affectedRows) return res.status(404).json({ message: notFoundMessage });
      res.json({ message: deleteMessage });
    } catch (err) { next(err); }
  });
}

registerCatalogRoutes({
  route: '/class-categories', table: 'class_categories',
  select: 'id, name, section_id AS sectionId, description, sort_order AS `order`', orderBy: 'sort_order, id',
  fields: {
    name: { column: { name: 'name' }, convert: (value) => String(value).trim() },
    sectionId: { column: { name: 'section_id' }, convert: (value) => value },
    description: { column: { name: 'description' }, convert: (value) => value || '' },
    order: { column: { name: 'sort_order' }, convert: (value) => Number(value) || 0 },
  },
  defaults: { name: '', sectionId: 'jss', description: '', order: 0 },
  deleteMessage: 'Category deleted', notFoundMessage: 'Category not found',
});
registerCatalogRoutes({
  route: '/class-levels', table: 'class_levels',
  select: 'id, name, category_id AS categoryId, section_id AS sectionId', orderBy: 'id',
  fields: {
    name: { column: { name: 'name' }, convert: (value) => String(value).trim() },
    categoryId: { column: { name: 'category_id' }, convert: (value) => Number(value) || null },
    sectionId: { column: { name: 'section_id' }, convert: (value) => value },
  },
  defaults: { name: '', categoryId: 1, sectionId: 'jss' }, deleteMessage: 'Level deleted', notFoundMessage: 'Level not found',
});
registerCatalogRoutes({
  route: '/exam-categories', table: 'exam_categories',
  select: 'id, name, code, weight', orderBy: 'id',
  fields: {
    name: { column: { name: 'name' }, convert: (value) => String(value).trim() },
    code: { column: { name: 'code' }, convert: (value) => String(value).trim().toUpperCase() },
    weight: { column: { name: 'weight' }, convert: (value) => Number(value) || 100 },
  },
  defaults: { name: '', code: 'EXAM', weight: 100 }, deleteMessage: 'Exam category deleted', notFoundMessage: 'Exam category not found',
});
registerCatalogRoutes({
  route: '/exam-levels', table: 'exam_levels',
  select: 'id, name, section_id AS sectionId', orderBy: 'id',
  fields: {
    name: { column: { name: 'name' }, convert: (value) => String(value).trim() },
    sectionId: { column: { name: 'section_id' }, convert: (value) => value },
  },
  defaults: { name: '', sectionId: 'all' }, deleteMessage: 'Exam level deleted', notFoundMessage: 'Exam level not found',
});

// ==========================================
// 9. CBT REPORTS & ANALYTICS
// ==========================================
router.get('/reports', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const [[examRows], [questionRows], [attemptRows], [sections]] = await Promise.all([
      pool.execute('SELECT id, school_section, status, opening_date, opening_time, closing_date, closing_time FROM cbt_examinations'),
      pool.execute('SELECT COUNT(*) AS count FROM question_bank'),
      pool.execute('SELECT a.id, a.student_id, a.score, a.percentage, a.grade, a.submission_time, e.title AS exam_title, e.subject, e.total_marks, u.name AS student_name, u.school_id FROM cbt_attempts a JOIN cbt_examinations e ON e.id = a.exam_id LEFT JOIN users u ON u.id = a.student_id WHERE a.status IN (?, ?) ORDER BY a.submission_time DESC', ['Submitted', 'Auto Submitted']),
      pool.execute('SELECT school_section, COUNT(*) AS count FROM cbt_examinations GROUP BY school_section'),
    ]);
    const attempts = attemptRows;
    const totalExams = examRows.length;
    const activeExams = examRows.filter((exam) => computeExamTimeStatus(examFromRow(exam)).isOpen).length;
    const scheduledExams = examRows.filter((exam) => computeExamTimeStatus(examFromRow(exam)).timeState === 'scheduled').length;
    const completedExams = examRows.filter((exam) => computeExamTimeStatus(examFromRow(exam)).isClosed).length;
    const subjectMap = new Map();
    for (const attempt of attempts) {
      const subject = attempt.subject || 'General';
      const item = subjectMap.get(subject) || { subject, attempts: 0, totalScore: 0, totalPossible: 0, passCount: 0 };
      item.attempts += 1;
      item.totalScore += Number(attempt.score) || 0;
      item.totalPossible += Number(attempt.total_marks) || 100;
      if ((Number(attempt.percentage) || 0) >= 50) item.passCount += 1;
      subjectMap.set(subject, item);
    }
    const subjectPerformance = [...subjectMap.values()].map((item) => ({
      subject: item.subject, attempts: item.attempts,
      averagePercent: item.totalPossible ? Math.round((item.totalScore / item.totalPossible) * 100) : 0,
      passRate: item.attempts ? Math.round((item.passCount / item.attempts) * 100) : 0,
    }));
    const sectionNames = { primary: 'Primary School', jss: 'Junior Secondary School', sss: 'Senior Secondary School' };
    const sectionCounts = new Map(sections.map((row) => [row.school_section, Number(row.count)]));
    const totalAttempts = attempts.length;
    const passCount = attempts.filter((attempt) => (Number(attempt.percentage) || 0) >= 50).length;
    res.json({
      metrics: {
        totalExams, activeExams, scheduledExams, completedExams,
        totalQuestions: Number(questionRows[0].count), totalAttempts,
        uniqueStudents: new Set(attempts.map((attempt) => Number(attempt.student_id))).size,
        averagePercentage: totalAttempts ? Math.round(attempts.reduce((sum, attempt) => sum + (Number(attempt.percentage) || 0), 0) / totalAttempts) : 0,
        passRate: totalAttempts ? Math.round((passCount / totalAttempts) * 100) : 0,
      },
      subjectPerformance,
      sectionBreakdown: Object.entries(sectionNames).map(([code, section]) => ({ section, code, exams: sectionCounts.get(code) || 0 })),
      recentAttempts: attempts.slice(0, 10).map((attempt) => ({
        id: Number(attempt.id), studentName: attempt.student_name || 'Unknown', studentSchoolId: attempt.school_id || '',
        examTitle: attempt.exam_title || 'Examination', subject: attempt.subject || '', score: Number(attempt.score) || 0,
        totalMarks: Number(attempt.total_marks) || 100, percentage: Number(attempt.percentage) || 0,
        grade: attempt.grade, submissionTime: attempt.submission_time,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
