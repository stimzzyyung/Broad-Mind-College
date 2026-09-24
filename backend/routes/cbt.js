const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { gradeFor } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

// Helper to sanitize questions before sending to students (NEVER send correct answers/explanations to student!)
function sanitizeQuestionsForStudent(questions) {
  return questions.map((q, idx) => ({
    id: q.id || idx + 1,
    questionNumber: idx + 1,
    question: q.question,
    type: q.type || 'multiple_choice',
    options: q.options || [],
    marks: q.marks || 1,
    category: q.category || '',
  }));
}

// Letter grades calculator for CBT percentages
function getCbtGrade(percentage) {
  if (percentage >= 75) return { grade: 'A', remark: 'Excellent' };
  if (percentage >= 65) return { grade: 'B', remark: 'Good' };
  if (percentage >= 50) return { grade: 'C', remark: 'Credit' };
  if (percentage >= 40) return { grade: 'D', remark: 'Pass' };
  return { grade: 'F', remark: 'Fail' };
}

// Ensure database collections for CBT exist
function ensureCbtCollections(data) {
  if (!data.school_sections) {
    data.school_sections = [
      { id: 'primary', code: 'PRI', name: 'Primary School', description: 'Primary 1 to Primary 5' },
      { id: 'jss', code: 'JSS', name: 'Junior Secondary School', description: 'JSS 1 to JSS 3' },
      { id: 'sss', code: 'SSS', name: 'Senior Secondary School', description: 'SS 1 to SS 3' },
    ];
  }
  if (!data.class_categories) {
    data.class_categories = [
      { id: 1, name: 'Primary Section', sectionId: 'primary', description: 'Basic education classes', order: 1 },
      { id: 2, name: 'Junior Secondary Section', sectionId: 'jss', description: 'Lower secondary classes', order: 2 },
      { id: 3, name: 'Senior Secondary Section', sectionId: 'sss', description: 'Upper secondary classes', order: 3 },
    ];
  }
  if (!data.class_levels) {
    data.class_levels = [
      { id: 1, name: 'Primary 1', categoryId: 1, sectionId: 'primary' },
      { id: 2, name: 'Primary 2', categoryId: 1, sectionId: 'primary' },
      { id: 3, name: 'Primary 3', categoryId: 1, sectionId: 'primary' },
      { id: 4, name: 'Primary 4', categoryId: 1, sectionId: 'primary' },
      { id: 5, name: 'Primary 5', categoryId: 1, sectionId: 'primary' },
      { id: 6, name: 'JSS1', categoryId: 2, sectionId: 'jss' },
      { id: 7, name: 'JSS2', categoryId: 2, sectionId: 'jss' },
      { id: 8, name: 'JSS3', categoryId: 2, sectionId: 'jss' },
      { id: 9, name: 'SS1', categoryId: 3, sectionId: 'sss' },
      { id: 10, name: 'SS2', categoryId: 3, sectionId: 'sss' },
      { id: 11, name: 'SS3', categoryId: 3, sectionId: 'sss' },
    ];
  }
  if (!data.exam_categories) {
    data.exam_categories = [
      { id: 1, name: 'First Continuous Assessment', code: 'CA1', weight: 20 },
      { id: 2, name: 'Second Continuous Assessment', code: 'CA2', weight: 20 },
      { id: 3, name: 'Mid-Term Examination', code: 'MIDTERM', weight: 30 },
      { id: 4, name: 'First Term Examination', code: 'TERM1', weight: 60 },
      { id: 5, name: 'Second Term Examination', code: 'TERM2', weight: 60 },
      { id: 6, name: 'Third Term Examination', code: 'TERM3', weight: 60 },
      { id: 7, name: 'Final Examination', code: 'FINAL', weight: 100 },
      { id: 8, name: 'Mock Examination', code: 'MOCK', weight: 100 },
      { id: 9, name: 'Entrance Examination', code: 'ENTRANCE', weight: 100 },
      { id: 10, name: 'Practice CBT', code: 'PRACTICE', weight: 0 },
    ];
  }
  if (!data.exam_levels) {
    data.exam_levels = [
      { id: 1, name: 'Primary School Level', sectionId: 'primary' },
      { id: 2, name: 'Junior Secondary Level', sectionId: 'jss' },
      { id: 3, name: 'Senior Secondary Level', sectionId: 'sss' },
      { id: 4, name: 'All School Levels', sectionId: 'all' },
    ];
  }
  if (!data.question_bank) data.question_bank = [];
  if (!data.cbt_examinations) data.cbt_examinations = [];
  if (!data.cbt_attempts) data.cbt_attempts = [];
  if (!data.cbt_access_logs) data.cbt_access_logs = [];
  if (!data.cbt_audit_logs) data.cbt_audit_logs = [];
  if (!data.cbt_positions) data.cbt_positions = [];
}

// Helper to log CBT access
function logAccess(data, { studentId, examId, attemptId, action, status, details, req }) {
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const entry = {
    id: db.nextId(data.cbt_access_logs),
    studentId,
    examId,
    attemptId: attemptId || null,
    action,
    timestamp: new Date().toISOString(),
    ipAddress,
    status: status || 'success',
    details: details || '',
    userAgent: req.headers['user-agent'] || '',
  };
  data.cbt_access_logs.push(entry);
}

// Helper to log administrative override audit
function logAudit(data, { staffId, staffName, studentId, studentName, examId, examTitle, action, reason }) {
  const now = new Date();
  const entry = {
    id: db.nextId(data.cbt_audit_logs),
    staffId,
    staffName,
    studentId: studentId || null,
    studentName: studentName || 'N/A',
    examId: examId || null,
    examTitle: examTitle || 'N/A',
    action,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    reason: reason || 'Administrative action',
    createdAt: now.toISOString(),
  };
  data.cbt_audit_logs.push(entry);
  return entry;
}

// ==========================================
// 1. METADATA & CONFIGURATION
// ==========================================
router.get('/meta', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const subjects = [
    'Mathematics',
    'English Language',
    'Basic Science',
    'Civic Education',
    'Computer Studies',
    'Social Studies',
    'Physics',
    'Chemistry',
    'Biology',
    'Agricultural Science',
    'Economics',
    'Government',
    'Literature in English',
  ];

  const sessions = ['2026/2027', '2025/2026', '2024/2025', '2023/2024'];
  const terms = ['First Term', 'Second Term', 'Third Term', 'Final Examination'];
  const years = ['2026', '2025', '2024', '2023'];
  const difficulties = ['Easy', 'Medium', 'Hard'];
  const questionTypes = [
    { value: 'multiple_choice', label: 'Multiple Choice (A, B, C, D)' },
    { value: 'true_false', label: 'True / False' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'theory', label: 'Theory / Essay' },
  ];

  res.json({
    schoolSections: data.school_sections,
    classCategories: data.class_categories,
    classLevels: data.class_levels,
    examCategories: data.exam_categories,
    examLevels: data.exam_levels,
    classes: data.classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      schoolSection: c.schoolSection || (c.level === 'Primary' ? 'primary' : c.level === 'Senior' ? 'sss' : 'jss'),
    })),
    subjects,
    sessions,
    terms,
    years,
    difficulties,
    questionTypes,
    currentSession: data.settings?.session || '2026/2027',
    currentTerm: data.settings?.term || 'First Term',
    serverTime: new Date().toISOString(),
  });
});

// ==========================================
// 2. QUESTION BANK & PREVIOUS ARCHIVE
// ==========================================

// GET /api/cbt/questions  – search and filter questions
router.get('/questions', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const {
    search,
    subject,
    schoolSection,
    classLevel,
    classId,
    category,
    year,
    session,
    term,
    difficulty,
    type,
    isArchived,
  } = req.query;

  let list = data.question_bank;

  // Filter archived flag: default false unless requested
  if (isArchived === 'true') {
    list = list.filter((q) => q.isArchived === true || (q.year && Number(q.year) < 2026));
  } else if (isArchived === 'false') {
    list = list.filter((q) => !q.isArchived);
  }

  if (subject) list = list.filter((q) => q.subject.toLowerCase() === subject.toLowerCase());
  if (schoolSection) list = list.filter((q) => q.schoolSection === schoolSection);
  if (classLevel) list = list.filter((q) => q.classLevel === classLevel);
  if (classId) list = list.filter((q) => Number(q.classId) === Number(classId));
  if (category) list = list.filter((q) => (q.category || '').toLowerCase().includes(category.toLowerCase()));
  if (year) list = list.filter((q) => String(q.year) === String(year));
  if (session) list = list.filter((q) => q.session === session);
  if (term) list = list.filter((q) => q.term === term);
  if (difficulty) list = list.filter((q) => q.difficulty === difficulty);
  if (type) list = list.filter((q) => q.type === type);

  if (search) {
    const qTerm = search.toLowerCase();
    list = list.filter(
      (q) =>
        q.question.toLowerCase().includes(qTerm) ||
        (q.category && q.category.toLowerCase().includes(qTerm)) ||
        q.subject.toLowerCase().includes(qTerm) ||
        (q.options && q.options.some((opt) => opt.toLowerCase().includes(qTerm)))
    );
  }

  res.json({
    total: list.length,
    questions: list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  });
});

// GET /api/cbt/questions/archive  – dedicated endpoint for Previous Questions Archive
router.get('/questions/archive', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { search, subject, schoolSection, classLevel, category, year } = req.query;

  // Archived questions are those marked as archived OR from previous years (year < 2026)
  let list = data.question_bank.filter((q) => q.isArchived || (q.year && Number(q.year) < 2026));

  if (subject) list = list.filter((q) => q.subject.toLowerCase() === subject.toLowerCase());
  if (schoolSection) list = list.filter((q) => q.schoolSection === schoolSection);
  if (classLevel) list = list.filter((q) => q.classLevel === classLevel);
  if (category) list = list.filter((q) => (q.category || '').toLowerCase().includes(category.toLowerCase()));
  if (year) list = list.filter((q) => String(q.year) === String(year));

  if (search) {
    const qTerm = search.toLowerCase();
    list = list.filter(
      (q) =>
        q.question.toLowerCase().includes(qTerm) ||
        q.subject.toLowerCase().includes(qTerm) ||
        (q.category && q.category.toLowerCase().includes(qTerm))
    );
  }

  res.json({
    total: list.length,
    questions: list.sort((a, b) => (b.year || 0) - (a.year || 0)),
  });
});

// POST /api/cbt/questions  – create a new question in the Question Bank
router.post('/questions', requireRole('teacher', 'admin'), (req, res) => {
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

  const data = db.read();
  ensureCbtCollections(data);

  const newQuestion = {
    id: db.nextId(data.question_bank),
    question: question.trim(),
    type,
    options: (options || []).map((o) => String(o).trim()),
    correctAnswer: String(correctAnswer || '').trim(),
    subject,
    classLevel: classLevel || 'JSS1',
    classId: classId ? Number(classId) : null,
    schoolSection: schoolSection || 'jss',
    examLevel: examLevel || 'Junior Secondary Level',
    category: category ? category.trim() : 'General',
    year: String(year || '2026'),
    session: session || '2026/2027',
    term: term || 'First Term',
    difficulty: difficulty || 'Medium',
    marks: Number(marks) || 1,
    explanation: explanation ? explanation.trim() : '',
    createdById: req.user.id,
    createdByName: req.user.name,
    createdAt: new Date().toISOString(),
    isArchived: false,
  };

  data.question_bank.push(newQuestion);
  db.write(data);

  res.status(201).json(newQuestion);
});

// GET /api/cbt/questions/:id  – preview question
router.get('/questions/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const q = data.question_bank.find((item) => item.id === Number(req.params.id));
  if (!q) return res.status(404).json({ message: 'Question not found' });
  res.json(q);
});

// PUT /api/cbt/questions/:id  – edit question
router.put('/questions/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const q = data.question_bank.find((item) => item.id === Number(req.params.id));
  if (!q) return res.status(404).json({ message: 'Question not found' });

  const fields = [
    'question',
    'type',
    'options',
    'correctAnswer',
    'subject',
    'classLevel',
    'classId',
    'schoolSection',
    'examLevel',
    'category',
    'year',
    'session',
    'term',
    'difficulty',
    'marks',
    'explanation',
    'isArchived',
  ];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === 'options' && Array.isArray(req.body[field])) {
        q.options = req.body.options.map((o) => String(o).trim());
      } else if (field === 'marks') {
        q.marks = Number(req.body.marks) || 1;
      } else if (field === 'classId') {
        q.classId = req.body.classId ? Number(req.body.classId) : null;
      } else {
        q[field] = req.body[field];
      }
    }
  });

  q.updatedAt = new Date().toISOString();
  db.write(data);
  res.json(q);
});

// DELETE /api/cbt/questions/:id  – delete question
router.delete('/questions/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const id = Number(req.params.id);
  const idx = data.question_bank.findIndex((item) => item.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Question not found' });

  data.question_bank.splice(idx, 1);
  db.write(data);
  res.json({ message: 'Question deleted successfully' });
});

// POST /api/cbt/questions/copy  – copy questions into bank or prepare for exam (original stays unchanged)
router.post('/questions/copy', requireRole('teacher', 'admin'), (req, res) => {
  const { questionIds, targetYear = '2026', targetSession = '2026/2027', targetTerm = 'First Term' } = req.body;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return res.status(400).json({ message: 'Select at least one question to copy' });
  }

  const data = db.read();
  ensureCbtCollections(data);

  const copiedQuestions = [];
  questionIds.forEach((id) => {
    const original = data.question_bank.find((q) => q.id === Number(id));
    if (original) {
      const cloned = {
        ...original,
        id: db.nextId(data.question_bank) + copiedQuestions.length,
        year: String(targetYear),
        session: targetSession,
        term: targetTerm,
        isArchived: false,
        copiedFromId: original.id,
        createdById: req.user.id,
        createdByName: req.user.name,
        createdAt: new Date().toISOString(),
      };
      copiedQuestions.push(cloned);
    }
  });

  data.question_bank.push(...copiedQuestions);
  db.write(data);

  res.status(201).json({
    message: `Successfully copied ${copiedQuestions.length} question(s). Originals remain untouched.`,
    copiedQuestions,
  });
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
router.get('/exams', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { year, session, term, subject, schoolSection, classId, status, examCategory } = req.query;

  let list = data.cbt_examinations;

  // Student role restriction: student only sees exams for their class & section
  if (req.user.role === 'student') {
    const student = data.users.find((u) => u.id === req.user.id);
    if (!student || !student.classId) {
      return res.json([]);
    }
    const studentClass = data.classes.find((c) => c.id === student.classId);
    list = list.filter(
      (e) =>
        Number(e.classId) === Number(student.classId) ||
        (studentClass && e.classLevel && e.classLevel.toLowerCase() === studentClass.name.split(' ')[0].toLowerCase())
    );
  }

  // Teacher role filter: can view all or their subjects/classes
  if (req.user.role === 'teacher') {
    // Teachers can see exams they created or for their classes
  }

  if (year) list = list.filter((e) => String(e.year) === String(year));
  if (session) list = list.filter((e) => e.session === session);
  if (term) list = list.filter((e) => e.term === term);
  if (subject) list = list.filter((e) => e.subject.toLowerCase() === subject.toLowerCase());
  if (schoolSection) list = list.filter((e) => e.schoolSection === schoolSection);
  if (classId) list = list.filter((e) => Number(e.classId) === Number(classId));
  if (examCategory) list = list.filter((e) => e.examCategory === examCategory);
  if (status) list = list.filter((e) => e.status === status);

  const enriched = list.map((exam) => {
    const timeInfo = computeExamTimeStatus(exam);
    const cls = data.classes.find((c) => c.id === exam.classId);
    const attempts = data.cbt_attempts.filter((a) => a.examId === exam.id);

    let myAttempt = null;
    if (req.user.role === 'student') {
      const myAttempts = attempts.filter((a) => a.studentId === req.user.id);
      myAttempt = myAttempts[myAttempts.length - 1] || null;
    }

    return {
      id: exam.id,
      title: exam.title,
      year: exam.year,
      session: exam.session,
      term: exam.term,
      schoolSection: exam.schoolSection,
      classCategory: exam.classCategory,
      classLevel: exam.classLevel,
      classId: exam.classId,
      className: cls ? cls.name : exam.classLevel,
      examLevel: exam.examLevel,
      examCategory: exam.examCategory,
      subject: exam.subject,
      durationMins: exam.durationMins,
      totalMarks: exam.totalMarks,
      numberQuestions: exam.questions ? exam.questions.length : exam.numberQuestions,
      openingDate: exam.openingDate,
      openingTime: exam.openingTime,
      closingDate: exam.closingDate,
      closingTime: exam.closingTime,
      instructions: exam.instructions,
      status: exam.status,
      maxAttempts: exam.maxAttempts || 1,
      resultCalculationMethod: exam.resultCalculationMethod || 'highest',
      totalAttempts: attempts.length,
      timeInfo,
      myAttempt: myAttempt
        ? {
            id: myAttempt.id,
            status: myAttempt.status,
            score: myAttempt.score,
            percentage: myAttempt.percentage,
            grade: myAttempt.grade,
            startTime: myAttempt.startTime,
            submissionTime: myAttempt.submissionTime,
          }
        : null,
      createdAt: exam.createdAt,
    };
  });

  res.json(enriched.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
});

// POST /api/cbt/exams  – create a new CBT examination (Teacher & Admin)
router.post('/exams', requireRole('teacher', 'admin'), (req, res) => {
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

  const data = db.read();
  ensureCbtCollections(data);

  // Compile questions for this exam
  let finalQuestions = [];

  // Pick selected questions from question bank
  if (Array.isArray(questionIds) && questionIds.length > 0) {
    questionIds.forEach((qId) => {
      const q = data.question_bank.find((item) => item.id === Number(qId));
      if (q) {
        // Deep copy so changes to the bank do not alter this exam
        finalQuestions.push({
          id: q.id,
          question: q.question,
          type: q.type || 'multiple_choice',
          options: [...(q.options || [])],
          correctAnswer: q.correctAnswer,
          marks: q.marks || 1,
          category: q.category || 'General',
          explanation: q.explanation || '',
        });
      }
    });
  }

  // Add any custom questions provided directly
  if (Array.isArray(customQuestions) && customQuestions.length > 0) {
    customQuestions.forEach((cq, i) => {
      finalQuestions.push({
        id: finalQuestions.length + i + 1,
        question: cq.question,
        type: cq.type || 'multiple_choice',
        options: cq.options || [],
        correctAnswer: cq.correctAnswer,
        marks: cq.marks || 1,
        category: cq.category || 'General',
        explanation: cq.explanation || '',
      });
    });
  }

  // Calculate total marks if not explicitly set
  const calculatedTotalMarks = finalQuestions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

  const newExam = {
    id: db.nextId(data.cbt_examinations),
    title: title.trim(),
    year: String(year),
    session,
    term,
    schoolSection,
    classCategory,
    classLevel,
    classId: classId ? Number(classId) : null,
    examLevel,
    examCategory,
    subject,
    durationMins: Number(durationMins) || 60,
    totalMarks: calculatedTotalMarks > 0 ? calculatedTotalMarks : Number(totalMarks) || 100,
    numberQuestions: finalQuestions.length,
    openingDate,
    openingTime,
    closingDate,
    closingTime,
    studentAccessTime,
    instructions,
    status: status || 'scheduled',
    maxAttempts: Number(maxAttempts) || 1,
    resultCalculationMethod,
    questions: finalQuestions,
    createdById: req.user.id,
    createdByName: req.user.name,
    createdAt: new Date().toISOString(),
  };

  data.cbt_examinations.push(newExam);

  // Audit log creation
  logAudit(data, {
    staffId: req.user.id,
    staffName: req.user.name,
    examId: newExam.id,
    examTitle: newExam.title,
    action: 'CREATE_EXAM',
    reason: `Created exam with ${finalQuestions.length} questions`,
  });

  db.write(data);
  res.status(201).json(newExam);
});

// GET /api/cbt/exams/:id  – get full exam details
router.get('/exams/:id', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const exam = data.cbt_examinations.find((e) => e.id === Number(req.params.id));
  if (!exam) return res.status(404).json({ message: 'Examination not found' });

  const timeInfo = computeExamTimeStatus(exam);
  const cls = data.classes.find((c) => c.id === exam.classId);

  // If student is requesting exam details
  if (req.user.role === 'student') {
    const student = data.users.find((u) => u.id === req.user.id);
    if (!student) return res.status(401).json({ message: 'Unauthorized' });

    // Validate class authorization
    if (exam.classId && Number(exam.classId) !== Number(student.classId)) {
      return res.status(403).json({ message: 'You are not enrolled in the class assigned to this examination' });
    }

    const myAttempts = data.cbt_attempts.filter(
      (a) => a.examId === exam.id && a.studentId === req.user.id
    );
    const activeAttempt = myAttempts.find((a) => a.status === 'In Progress');

    // Never send questions before student starts exam!
    return res.json({
      id: exam.id,
      title: exam.title,
      year: exam.year,
      session: exam.session,
      term: exam.term,
      schoolSection: exam.schoolSection,
      classLevel: exam.classLevel,
      className: cls ? cls.name : exam.classLevel,
      subject: exam.subject,
      durationMins: exam.durationMins,
      totalMarks: exam.totalMarks,
      numberQuestions: exam.questions ? exam.questions.length : exam.numberQuestions,
      openingDate: exam.openingDate,
      openingTime: exam.openingTime,
      closingDate: exam.closingDate,
      closingTime: exam.closingTime,
      instructions: exam.instructions,
      status: exam.status,
      maxAttempts: exam.maxAttempts || 1,
      attemptsUsed: myAttempts.length,
      hasActiveAttempt: !!activeAttempt,
      activeAttemptId: activeAttempt ? activeAttempt.id : null,
      timeInfo,
      serverTime: new Date().toISOString(),
    });
  }

  // Teacher / Admin: return full questions with answers
  const attempts = data.cbt_attempts.filter((a) => a.examId === exam.id);
  res.json({
    ...exam,
    className: cls ? cls.name : exam.classLevel,
    timeInfo,
    attemptsCount: attempts.length,
    serverTime: new Date().toISOString(),
  });
});

// PUT /api/cbt/exams/:id  – edit examination settings and questions
router.put('/exams/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const exam = data.cbt_examinations.find((e) => e.id === Number(req.params.id));
  if (!exam) return res.status(404).json({ message: 'Examination not found' });

  const editableFields = [
    'title',
    'year',
    'session',
    'term',
    'schoolSection',
    'classCategory',
    'classLevel',
    'classId',
    'examLevel',
    'examCategory',
    'subject',
    'durationMins',
    'totalMarks',
    'openingDate',
    'openingTime',
    'closingDate',
    'closingTime',
    'studentAccessTime',
    'instructions',
    'status',
    'maxAttempts',
    'resultCalculationMethod',
    'questions',
  ];

  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === 'classId') {
        exam.classId = req.body.classId ? Number(req.body.classId) : null;
      } else if (field === 'durationMins' || field === 'totalMarks' || field === 'maxAttempts') {
        exam[field] = Number(req.body[field]);
      } else {
        exam[field] = req.body[field];
      }
    }
  });

  if (exam.questions && Array.isArray(exam.questions)) {
    exam.numberQuestions = exam.questions.length;
  }

  exam.updatedAt = new Date().toISOString();

  logAudit(data, {
    staffId: req.user.id,
    staffName: req.user.name,
    examId: exam.id,
    examTitle: exam.title,
    action: 'UPDATE_EXAM',
    reason: req.body.reason || 'Updated examination parameters',
  });

  db.write(data);
  res.json(exam);
});

// PUT /api/cbt/exams/:id/control  – Principal & Teacher controls (Open, Close, Block, Unblock, Reschedule, Cancel)
router.put('/exams/:id/control', requireRole('teacher', 'admin'), (req, res) => {
  const { action, openingDate, openingTime, closingDate, closingTime, durationMins, reason } = req.body;

  if (!action) {
    return res.status(400).json({ message: 'Control action is required (e.g. open, close, block, unblock, reschedule, cancel)' });
  }

  const data = db.read();
  ensureCbtCollections(data);

  const exam = data.cbt_examinations.find((e) => e.id === Number(req.params.id));
  if (!exam) return res.status(404).json({ message: 'Examination not found' });

  switch (action) {
    case 'open':
      exam.status = 'active';
      break;
    case 'close':
      exam.status = 'closed';
      break;
    case 'block':
      exam.status = 'blocked';
      break;
    case 'unblock':
      exam.status = 'scheduled';
      break;
    case 'cancel':
      exam.status = 'cancelled';
      break;
    case 'reschedule':
      if (openingDate) exam.openingDate = openingDate;
      if (openingTime) exam.openingTime = openingTime;
      if (closingDate) exam.closingDate = closingDate;
      if (closingTime) exam.closingTime = closingTime;
      if (durationMins) exam.durationMins = Number(durationMins);
      break;
    default:
      return res.status(400).json({ message: `Unknown control action: ${action}` });
  }

  exam.updatedAt = new Date().toISOString();

  logAudit(data, {
    staffId: req.user.id,
    staffName: req.user.name,
    examId: exam.id,
    examTitle: exam.title,
    action: `CONTROL_${action.toUpperCase()}`,
    reason: reason || `Performed ${action} operation on examination`,
  });

  db.write(data);
  res.json({ message: `Examination ${action}ed successfully`, exam });
});

// DELETE /api/cbt/exams/:id
router.delete('/exams/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const id = Number(req.params.id);
  const idx = data.cbt_examinations.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Examination not found' });

  const exam = data.cbt_examinations[idx];
  data.cbt_examinations.splice(idx, 1);

  // Also remove associated attempts
  data.cbt_attempts = data.cbt_attempts.filter((a) => a.examId !== id);

  logAudit(data, {
    staffId: req.user.id,
    staffName: req.user.name,
    examId: id,
    examTitle: exam.title,
    action: 'DELETE_EXAM',
    reason: 'Examination deleted by staff',
  });

  db.write(data);
  res.json({ message: 'Examination and associated attempts deleted' });
});

// ==========================================
// 4. CBT EXAMINATION ATTEMPTS & SECURE EXECUTION
// ==========================================

// POST /api/cbt/exams/:id/start  – Student starts or resumes CBT attempt
router.post('/exams/:id/start', requireRole('student'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const exam = data.cbt_examinations.find((e) => e.id === Number(req.params.id));
  if (!exam) return res.status(404).json({ message: 'Examination not found' });

  const student = data.users.find((u) => u.id === req.user.id);
  if (!student) return res.status(401).json({ message: 'Student account not found' });

  // 1. Validate student class / section
  if (exam.classId && Number(exam.classId) !== Number(student.classId)) {
    logAccess(data, {
      studentId: student.id,
      examId: exam.id,
      action: 'ACCESS_REJECTED',
      status: 'failed',
      details: 'Mismatched class authorization',
      req,
    });
    db.write(data);
    return res.status(403).json({
      message: 'Access Denied: You are not authorized to take examinations for another class.',
    });
  }

  // 2. Validate exam status
  if (exam.status === 'blocked') {
    return res.status(403).json({ message: 'This examination has been temporarily blocked by the administration.' });
  }
  if (exam.status === 'cancelled') {
    return { message: 'This examination has been cancelled.' };
  }
  if (exam.status === 'closed') {
    return res.status(403).json({ message: 'This examination has officially closed.' });
  }

  // 3. Check existing attempts
  const studentAttempts = data.cbt_attempts.filter(
    (a) => a.examId === exam.id && a.studentId === student.id
  );

  // Check if an attempt is currently In Progress -> RESUME IT!
  const activeAttempt = studentAttempts.find((a) => a.status === 'In Progress');

  const now = new Date();
  const nowMs = now.getTime();
  const examEndMs = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();
  const examStartMs = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();

  if (activeAttempt) {
    // Attempt exists: check if time has already expired
    const expectedEndMs = new Date(activeAttempt.expectedEndTime).getTime();

    if (nowMs >= expectedEndMs || nowMs >= examEndMs) {
      // Auto-submit expired attempt
      activeAttempt.status = 'Auto Submitted';
      activeAttempt.submissionTime = now.toISOString();

      // Grade saved answers
      let correctCount = 0;
      let score = 0;
      const questions = exam.questions || [];
      questions.forEach((q, idx) => {
        const studentAns = activeAttempt.savedAnswers ? activeAttempt.savedAnswers[idx] : null;
        if (studentAns !== null && studentAns !== undefined && String(studentAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) {
          correctCount += 1;
          score += Number(q.marks) || 1;
        }
      });
      const totalMarks = exam.totalMarks || (questions.length || 1);
      const percentage = Math.round((score / totalMarks) * 100);
      const gradeObj = getCbtGrade(percentage);

      activeAttempt.score = score;
      activeAttempt.percentage = percentage;
      activeAttempt.correctCount = correctCount;
      activeAttempt.wrongCount = Object.keys(activeAttempt.savedAnswers || {}).length - correctCount;
      activeAttempt.unansweredCount = Math.max(0, questions.length - Object.keys(activeAttempt.savedAnswers || {}).length);
      activeAttempt.grade = gradeObj.grade;
      activeAttempt.passed = percentage >= 50;

      logAccess(data, {
        studentId: student.id,
        examId: exam.id,
        attemptId: activeAttempt.id,
        action: 'AUTO_SUBMIT',
        status: 'completed',
        details: 'Attempt auto-submitted due to time expiration on reconnection',
        req,
      });

      db.write(data);
      return res.status(200).json({
        resumed: false,
        message: 'Your time for this examination has expired. It was automatically submitted.',
        attempt: activeAttempt,
        isCompleted: true,
      });
    }

    // Time remains: calculate remaining seconds
    const remainingSeconds = Math.max(0, Math.floor((Math.min(expectedEndMs, examEndMs) - nowMs) / 1000));
    activeAttempt.lastActivityTime = now.toISOString();

    logAccess(data, {
      studentId: student.id,
      examId: exam.id,
      attemptId: activeAttempt.id,
      action: 'RESUME',
      status: 'success',
      details: `Resumed attempt. ${remainingSeconds}s remaining`,
      req,
    });

    db.write(data);

    return res.json({
      resumed: true,
      attempt: {
        id: activeAttempt.id,
        attemptCode: activeAttempt.attemptCode,
        attemptNumber: activeAttempt.attemptNumber,
        startTime: activeAttempt.startTime,
        expectedEndTime: activeAttempt.expectedEndTime,
        savedAnswers: activeAttempt.savedAnswers || {},
        status: activeAttempt.status,
      },
      remainingSeconds,
      serverTime: now.toISOString(),
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        durationMins: exam.durationMins,
        totalMarks: exam.totalMarks,
        instructions: exam.instructions,
      },
      student: {
        id: student.id,
        name: student.name,
        schoolId: student.schoolId,
        className: (data.classes.find((c) => c.id === student.classId) || {}).name || '',
      },
      questions: sanitizeQuestionsForStudent(exam.questions || []),
    });
  }

  // 4. No active attempt -> Validate window for starting a new attempt
  if (nowMs < examStartMs) {
    const diffSecs = Math.max(0, Math.floor((examStartMs - nowMs) / 1000));
    return res.status(403).json({
      message: 'This examination is not available yet. Please return at the scheduled time.',
      opensInSeconds: diffSecs,
      scheduledOpening: `${exam.openingDate} ${exam.openingTime}`,
    });
  }
  if (nowMs > examEndMs) {
    return res.status(403).json({
      message: 'This examination has expired and is no longer accepting attempts.',
    });
  }

  // 5. Check maximum attempts limit
  const maxAttemptsAllowed = Number(exam.maxAttempts) || 1;
  const completedAttempts = studentAttempts.filter(
    (a) => a.status === 'Submitted' || a.status === 'Auto Submitted'
  );

  if (completedAttempts.length >= maxAttemptsAllowed) {
    return res.status(403).json({
      message: `You have completed all permitted attempts (${completedAttempts.length}/${maxAttemptsAllowed}) for this examination.`,
      attemptsUsed: completedAttempts.length,
      maxAttempts: maxAttemptsAllowed,
    });
  }

  // 6. Create NEW Attempt with server-controlled duration
  const attemptNumber = studentAttempts.length + 1;
  const durationMs = (Number(exam.durationMins) || 60) * 60 * 1000;
  // Permitted end is the earliest of (now + duration) and exam closing time!
  const permittedEndMs = Math.min(nowMs + durationMs, examEndMs);
  const expectedEndTime = new Date(permittedEndMs).toISOString();

  const newAttempt = {
    id: db.nextId(data.cbt_attempts),
    attemptCode: `ATT-${exam.year}-${String(db.nextId(data.cbt_attempts)).padStart(4, '0')}`,
    studentId: student.id,
    studentName: student.name,
    studentSchoolId: student.schoolId,
    examId: exam.id,
    examTitle: exam.title,
    attemptNumber,
    startTime: now.toISOString(),
    expectedEndTime,
    submissionTime: null,
    lastActivityTime: now.toISOString(),
    status: 'In Progress',
    savedAnswers: {},
    score: null,
    percentage: null,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: exam.questions ? exam.questions.length : 0,
    grade: null,
    passed: null,
  };

  data.cbt_attempts.push(newAttempt);

  const remainingSeconds = Math.max(0, Math.floor((permittedEndMs - nowMs) / 1000));

  logAccess(data, {
    studentId: student.id,
    examId: exam.id,
    attemptId: newAttempt.id,
    action: 'START',
    status: 'success',
    details: `Started attempt #${attemptNumber}. Allocated ${remainingSeconds}s`,
    req,
  });

  db.write(data);

  res.status(201).json({
    resumed: false,
    attempt: {
      id: newAttempt.id,
      attemptCode: newAttempt.attemptCode,
      attemptNumber: newAttempt.attemptNumber,
      startTime: newAttempt.startTime,
      expectedEndTime: newAttempt.expectedEndTime,
      savedAnswers: {},
      status: newAttempt.status,
    },
    remainingSeconds,
    serverTime: now.toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      durationMins: exam.durationMins,
      totalMarks: exam.totalMarks,
      instructions: exam.instructions,
    },
    student: {
      id: student.id,
      name: student.name,
      schoolId: student.schoolId,
      className: (data.classes.find((c) => c.id === student.classId) || {}).name || '',
    },
    questions: sanitizeQuestionsForStudent(exam.questions || []),
  });
});

// POST /api/cbt/attempts/:id/save  – Periodic & continuous answer autosaving
router.post('/attempts/:id/save', requireRole('student'), (req, res) => {
  const { answers } = req.body;
  const attemptId = Number(req.params.id);

  const data = db.read();
  ensureCbtCollections(data);

  const attempt = data.cbt_attempts.find((a) => a.id === attemptId);
  if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

  if (attempt.studentId !== req.user.id) {
    return res.status(403).json({ message: 'Unauthorized attempt modification' });
  }

  if (attempt.status !== 'In Progress') {
    return res.status(400).json({
      message: `Attempt is no longer in progress (status: ${attempt.status})`,
      status: attempt.status,
    });
  }

  const exam = data.cbt_examinations.find((e) => e.id === attempt.examId);
  const now = new Date();
  const nowMs = now.getTime();
  const expectedEndMs = new Date(attempt.expectedEndTime).getTime();
  const examEndMs = exam ? new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime() : expectedEndMs;

  // Server-side time expiry verification
  if (nowMs >= expectedEndMs || nowMs >= examEndMs) {
    // Time has expired! Perform auto-submission
    attempt.status = 'Auto Submitted';
    attempt.submissionTime = now.toISOString();

    if (answers && typeof answers === 'object') {
      attempt.savedAnswers = { ...attempt.savedAnswers, ...answers };
    }

    // Grade answers
    const questions = exam ? exam.questions || [] : [];
    let correctCount = 0;
    let score = 0;
    questions.forEach((q, idx) => {
      const studentAns = attempt.savedAnswers ? attempt.savedAnswers[idx] : null;
      if (studentAns !== null && studentAns !== undefined && String(studentAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) {
        correctCount += 1;
        score += Number(q.marks) || 1;
      }
    });

    const totalMarks = exam ? exam.totalMarks : questions.length;
    const percentage = Math.round((score / totalMarks) * 100);
    const gradeObj = getCbtGrade(percentage);

    attempt.score = score;
    attempt.percentage = percentage;
    attempt.correctCount = correctCount;
    attempt.wrongCount = Object.keys(attempt.savedAnswers || {}).length - correctCount;
    attempt.unansweredCount = Math.max(0, questions.length - Object.keys(attempt.savedAnswers || {}).length);
    attempt.grade = gradeObj.grade;
    attempt.passed = percentage >= 50;

    logAccess(data, {
      studentId: req.user.id,
      examId: attempt.examId,
      attemptId: attempt.id,
      action: 'AUTO_SUBMIT',
      status: 'completed',
      details: 'Time ran out during autosave',
      req,
    });

    db.write(data);
    return res.json({
      saved: true,
      timeExpired: true,
      status: 'Auto Submitted',
      message: 'Time has expired. Examination automatically submitted.',
      attempt,
    });
  }

  // Update answers
  if (answers && typeof answers === 'object') {
    attempt.savedAnswers = { ...attempt.savedAnswers, ...answers };
  }
  attempt.lastActivityTime = now.toISOString();

  const remainingSeconds = Math.max(0, Math.floor((Math.min(expectedEndMs, examEndMs) - nowMs) / 1000));

  db.write(data);

  res.json({
    saved: true,
    timeExpired: false,
    remainingSeconds,
    lastSaved: attempt.lastActivityTime,
  });
});

// POST /api/cbt/attempts/:id/submit  – Manual or triggered submission
router.post('/attempts/:id/submit', requireRole('student'), (req, res) => {
  const { answers, autoSubmitted = false } = req.body;
  const attemptId = Number(req.params.id);

  const data = db.read();
  ensureCbtCollections(data);

  const attempt = data.cbt_attempts.find((a) => a.id === attemptId);
  if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

  if (attempt.studentId !== req.user.id) {
    return res.status(403).json({ message: 'Unauthorized attempt submission' });
  }

  if (attempt.status !== 'In Progress') {
    return res.status(400).json({
      message: `This examination has already been submitted or locked (status: ${attempt.status}).`,
      attempt,
    });
  }

  const exam = data.cbt_examinations.find((e) => e.id === attempt.examId);
  if (!exam) return res.status(404).json({ message: 'Examination details not found' });

  const now = new Date();

  // Save latest answers if passed in
  if (answers && typeof answers === 'object') {
    attempt.savedAnswers = { ...attempt.savedAnswers, ...answers };
  }

  // Server-side scoring against true answer key
  const questions = exam.questions || [];
  let correctCount = 0;
  let score = 0;

  questions.forEach((q, idx) => {
    const studentAns = attempt.savedAnswers ? attempt.savedAnswers[idx] : null;
    if (studentAns !== null && studentAns !== undefined && String(studentAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) {
      correctCount += 1;
      score += Number(q.marks) || 1;
    }
  });

  const totalMarks = exam.totalMarks || (questions.length || 1);
  const percentage = Math.round((score / totalMarks) * 100);
  const gradeObj = getCbtGrade(percentage);

  attempt.submissionTime = now.toISOString();
  attempt.status = autoSubmitted ? 'Auto Submitted' : 'Submitted';
  attempt.score = score;
  attempt.percentage = percentage;
  attempt.correctCount = correctCount;
  attempt.wrongCount = Object.keys(attempt.savedAnswers || {}).length - correctCount;
  attempt.unansweredCount = Math.max(0, questions.length - Object.keys(attempt.savedAnswers || {}).length);
  attempt.grade = gradeObj.grade;
  attempt.passed = percentage >= 50;

  logAccess(data, {
    studentId: req.user.id,
    examId: exam.id,
    attemptId: attempt.id,
    action: autoSubmitted ? 'AUTO_SUBMIT' : 'SUBMIT',
    status: 'completed',
    details: `Scored ${score}/${totalMarks} (${percentage}%) - Grade: ${gradeObj.grade}`,
    req,
  });

  db.write(data);

  res.json({
    message: 'Examination submitted successfully!',
    result: {
      attemptId: attempt.id,
      attemptCode: attempt.attemptCode,
      status: attempt.status,
      score: attempt.score,
      totalMarks,
      percentage: attempt.percentage,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unansweredCount: attempt.unansweredCount,
      grade: attempt.grade,
      remark: gradeObj.remark,
      passed: attempt.passed,
      submissionTime: attempt.submissionTime,
    },
  });
});

// GET /api/cbt/exams/:id/my-result  – Student gets their submission result
router.get('/exams/:id/my-result', requireRole('student'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const examId = Number(req.params.id);
  const attempts = data.cbt_attempts.filter(
    (a) => a.examId === examId && a.studentId === req.user.id && (a.status === 'Submitted' || a.status === 'Auto Submitted')
  );

  if (attempts.length === 0) {
    return res.status(404).json({ message: 'No submitted result found for this examination' });
  }

  // Pick best or latest attempt according to calculation method
  const exam = data.cbt_examinations.find((e) => e.id === examId);
  let bestAttempt = attempts[attempts.length - 1];

  if (exam && exam.resultCalculationMethod === 'highest') {
    bestAttempt = [...attempts].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  } else if (exam && exam.resultCalculationMethod === 'first') {
    bestAttempt = attempts[0];
  }

  res.json({
    examTitle: exam ? exam.title : 'Examination',
    subject: exam ? exam.subject : '',
    totalMarks: exam ? exam.totalMarks : 100,
    attempt: bestAttempt,
    allAttempts: attempts,
  });
});

// ==========================================
// 5. ADMINISTRATIVE OVERRIDES & ATTEMPTS AUDITING
// ==========================================

// GET /api/cbt/exams/:id/attempts  – View all attempts for an exam (Teacher & Admin)
router.get('/exams/:id/attempts', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const examId = Number(req.params.id);
  const exam = data.cbt_examinations.find((e) => e.id === examId);
  if (!exam) return res.status(404).json({ message: 'Examination not found' });

  const attempts = data.cbt_attempts
    .filter((a) => a.examId === examId)
    .map((att) => {
      const student = data.users.find((u) => u.id === att.studentId);
      const studentClass = student ? data.classes.find((c) => c.id === student.classId) : null;
      return {
        ...att,
        studentName: student ? student.name : 'Unknown Student',
        studentSchoolId: student ? student.schoolId : '',
        className: studentClass ? studentClass.name : '',
      };
    });

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
});

// GET /api/cbt/exam-attempts  – Global attempts query across all exams
router.get('/exam-attempts', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { examId, studentId, status, session, term } = req.query;

  let list = data.cbt_attempts;

  if (examId) list = list.filter((a) => Number(a.examId) === Number(examId));
  if (studentId) list = list.filter((a) => Number(a.studentId) === Number(studentId));
  if (status) list = list.filter((a) => a.status === status);

  const enriched = list.map((att) => {
    const student = data.users.find((u) => u.id === att.studentId);
    const exam = data.cbt_examinations.find((e) => e.id === att.examId);
    const cls = student ? data.classes.find((c) => c.id === student.classId) : null;
    return {
      ...att,
      studentName: student ? student.name : 'Unknown',
      studentSchoolId: student ? student.schoolId : '',
      className: cls ? cls.name : '',
      examTitle: exam ? exam.title : 'Unknown Examination',
      subject: exam ? exam.subject : '',
      totalMarks: exam ? exam.totalMarks : 100,
    };
  });

  res.json(enriched.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0)));
});

// POST /api/cbt/attempts/:id/override  – Teacher / Principal Attempt Override
router.post('/attempts/:id/override', requireRole('teacher', 'admin'), (req, res) => {
  const { action, reason } = req.body;
  const attemptId = Number(req.params.id);

  if (!action || !reason || !reason.trim()) {
    return res.status(400).json({ message: 'Both override action and a valid reason are strictly required for auditing' });
  }

  const data = db.read();
  ensureCbtCollections(data);

  const attempt = data.cbt_attempts.find((a) => a.id === attemptId);
  if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

  const student = data.users.find((u) => u.id === attempt.studentId);
  const exam = data.cbt_examinations.find((e) => e.id === attempt.examId);

  const now = new Date();

  switch (action) {
    case 'RESET_ATTEMPT': {
      // Clears answers and resets to In Progress with fresh permitted time
      const durationMs = (Number(exam?.durationMins) || 60) * 60 * 1000;
      attempt.status = 'In Progress';
      attempt.startTime = now.toISOString();
      attempt.expectedEndTime = new Date(now.getTime() + durationMs).toISOString();
      attempt.submissionTime = null;
      attempt.savedAnswers = {};
      attempt.score = null;
      attempt.percentage = null;
      attempt.grade = null;
      break;
    }
    case 'ALLOW_ANOTHER_ATTEMPT': {
      // Marks current as locked/completed, creates permission for another attempt by raising exam limit for this student or canceling
      attempt.status = 'Unlocked';
      break;
    }
    case 'FORCE_SUBMIT': {
      // Forces submission immediately
      attempt.status = 'Submitted';
      attempt.submissionTime = now.toISOString();
      // Calculate score if needed
      if (exam && exam.questions) {
        let correctCount = 0;
        let score = 0;
        exam.questions.forEach((q, idx) => {
          const studentAns = attempt.savedAnswers ? attempt.savedAnswers[idx] : null;
          if (studentAns !== null && studentAns !== undefined && String(studentAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) {
            correctCount += 1;
            score += Number(q.marks) || 1;
          }
        });
        const totalMarks = exam.totalMarks || (exam.questions.length || 1);
        attempt.score = score;
        attempt.percentage = Math.round((score / totalMarks) * 100);
        attempt.grade = getCbtGrade(attempt.percentage).grade;
      }
      break;
    }
    case 'CANCEL_ATTEMPT': {
      attempt.status = 'Cancelled';
      break;
    }
    case 'UNLOCK_ATTEMPT': {
      // Re-enables in-progress state with additional time
      const extraMinutes = Number(req.body.extraMinutes) || 15;
      attempt.status = 'In Progress';
      attempt.expectedEndTime = new Date(now.getTime() + extraMinutes * 60 * 1000).toISOString();
      break;
    }
    default:
      return res.status(400).json({ message: `Unsupported override action: ${action}` });
  }

  // Record required Audit Log
  const auditEntry = logAudit(data, {
    staffId: req.user.id,
    staffName: req.user.name,
    studentId: student ? student.id : null,
    studentName: student ? student.name : 'Unknown Student',
    examId: exam ? exam.id : null,
    examTitle: exam ? exam.title : 'Unknown Examination',
    action,
    reason: reason.trim(),
  });

  db.write(data);

  res.json({
    message: `Attempt successfully modified with action ${action}`,
    attempt,
    auditEntry,
  });
});

// GET /api/cbt/audit-logs  – View Attempt Override Audit Logs
router.get('/audit-logs', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  res.json(data.cbt_audit_logs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
});

// GET /api/cbt/access-logs  – View Examination Access History Logs
router.get('/access-logs', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { examId, studentId } = req.query;
  let list = data.cbt_access_logs;

  if (examId) list = list.filter((l) => Number(l.examId) === Number(examId));
  if (studentId) list = list.filter((l) => Number(l.studentId) === Number(studentId));

  const enriched = list.map((l) => {
    const student = data.users.find((u) => u.id === l.studentId);
    const exam = data.cbt_examinations.find((e) => e.id === l.examId);
    return {
      ...l,
      studentName: student ? student.name : 'Unknown',
      studentSchoolId: student ? student.schoolId : '',
      examTitle: exam ? exam.title : 'Unknown',
    };
  });

  res.json(enriched.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 200));
});

// ==========================================
// 6. EXAMINATION RESULTS MANAGEMENT
// ==========================================

// GET /api/cbt/results  – Global Results query with filters
router.get('/results', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { examId, year, session, term, subject, schoolSection, classId, studentId, search } = req.query;

  // Filter completed attempts
  let attempts = data.cbt_attempts.filter(
    (a) => a.status === 'Submitted' || a.status === 'Auto Submitted'
  );

  // If student: only view their own
  if (req.user.role === 'student') {
    attempts = attempts.filter((a) => a.studentId === req.user.id);
  }

  let enriched = attempts.map((att) => {
    const student = data.users.find((u) => u.id === att.studentId);
    const exam = data.cbt_examinations.find((e) => e.id === att.examId);
    const cls = student ? data.classes.find((c) => c.id === student.classId) : null;

    return {
      id: att.id,
      attemptCode: att.attemptCode,
      studentId: att.studentId,
      studentName: student ? student.name : 'Unknown Student',
      studentSchoolId: student ? student.schoolId : '',
      classId: cls ? cls.id : null,
      className: cls ? cls.name : 'Unassigned',
      schoolSection: exam ? exam.schoolSection : (cls?.schoolSection || 'jss'),
      examId: att.examId,
      examTitle: exam ? exam.title : 'Examination',
      subject: exam ? exam.subject : 'Subject',
      year: exam ? exam.year : '2026',
      session: exam ? exam.session : '2026/2027',
      term: exam ? exam.term : 'First Term',
      score: att.score || 0,
      totalMarks: exam ? exam.totalMarks : 100,
      percentage: att.percentage || 0,
      correctCount: att.correctCount || 0,
      wrongCount: att.wrongCount || 0,
      unansweredCount: att.unansweredCount || 0,
      grade: att.grade || 'F',
      passed: att.passed,
      status: att.status,
      startTime: att.startTime,
      submissionTime: att.submissionTime,
    };
  });

  // Apply filters
  if (examId) enriched = enriched.filter((r) => Number(r.examId) === Number(examId));
  if (year) enriched = enriched.filter((r) => String(r.year) === String(year));
  if (session) enriched = enriched.filter((r) => r.session === session);
  if (term) enriched = enriched.filter((r) => r.term === term);
  if (subject) enriched = enriched.filter((r) => r.subject.toLowerCase() === subject.toLowerCase());
  if (schoolSection) enriched = enriched.filter((r) => r.schoolSection === schoolSection);
  if (classId) enriched = enriched.filter((r) => Number(r.classId) === Number(classId));
  if (studentId) enriched = enriched.filter((r) => Number(r.studentId) === Number(studentId));

  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(
      (r) =>
        r.studentName.toLowerCase().includes(s) ||
        r.studentSchoolId.toLowerCase().includes(s) ||
        r.examTitle.toLowerCase().includes(s)
    );
  }

  res.json({
    total: enriched.length,
    results: enriched.sort((a, b) => new Date(b.submissionTime || 0) - new Date(a.submissionTime || 0)),
  });
});

// ==========================================
// 7. GENERATE STUDENT POSITION & RANKINGS
// ==========================================

// POST /api/cbt/positions/generate  – Generate position ranking with ties handling
router.post('/positions/generate', requireRole('teacher', 'admin'), (req, res) => {
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

  const data = db.read();
  ensureCbtCollections(data);

  // Collect relevant results
  let attempts = data.cbt_attempts.filter(
    (a) => a.status === 'Submitted' || a.status === 'Auto Submitted'
  );

  let targetStudents = data.users.filter((u) => u.role === 'student');
  if (classId) {
    targetStudents = targetStudents.filter((s) => s.classId === Number(classId));
  }

  // Filter exams matching criteria
  let targetExams = data.cbt_examinations;
  if (year) targetExams = targetExams.filter((e) => String(e.year) === String(year));
  if (session) targetExams = targetExams.filter((e) => e.session === session);
  if (term) targetExams = targetExams.filter((e) => e.term === term);
  if (examId) targetExams = targetExams.filter((e) => e.id === Number(examId));
  if (subject) targetExams = targetExams.filter((e) => e.subject.toLowerCase() === subject.toLowerCase());

  const examIds = targetExams.map((e) => e.id);

  // Compute student scores
  const studentRows = targetStudents
    .map((student) => {
      const studentAttempts = attempts.filter(
        (a) => a.studentId === student.id && examIds.includes(a.examId)
      );

      if (studentAttempts.length === 0) return null;

      const totalScore = studentAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
      const totalPossible = studentAttempts.reduce((sum, a) => {
        const ex = targetExams.find((e) => e.id === a.examId);
        return sum + (ex?.totalMarks || 100);
      }, 0);

      const percentage = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;
      const average = Number((totalScore / studentAttempts.length).toFixed(1));
      const grade = getCbtGrade(percentage).grade;
      const cls = data.classes.find((c) => c.id === student.classId);

      return {
        studentId: student.id,
        studentName: student.name,
        schoolId: student.schoolId,
        className: cls ? cls.name : 'Unassigned',
        examsTaken: studentAttempts.length,
        totalScore,
        totalPossible,
        average,
        percentage,
        grade,
      };
    })
    .filter(Boolean);

  if (studentRows.length === 0) {
    return res.status(400).json({ message: 'No examination results found for the selected criteria' });
  }

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

  const positionRecord = {
    id: db.nextId(data.cbt_positions),
    type,
    year,
    session,
    term,
    schoolSection: schoolSection || 'all',
    classId: classId ? Number(classId) : null,
    className: classId ? (data.classes.find((c) => c.id === Number(classId))?.name || '') : 'All Classes',
    examId: examId ? Number(examId) : null,
    examTitle: examId ? (targetExams.find((e) => e.id === Number(examId))?.title || '') : 'Multiple Exams',
    subject: subject || 'All Subjects',
    totalStudents: formattedRankings.length,
    rankings: formattedRankings,
    generatedAt: new Date().toISOString(),
    generatedByName: req.user.name,
  };

  data.cbt_positions.push(positionRecord);
  db.write(data);

  res.status(201).json(positionRecord);
});

// GET /api/cbt/positions  – View generated position records
router.get('/positions', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const { classId, session, term } = req.query;
  let list = data.cbt_positions;

  if (classId) list = list.filter((p) => Number(p.classId) === Number(classId));
  if (session) list = list.filter((p) => p.session === session);
  if (term) list = list.filter((p) => p.term === term);

  res.json(list.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0)));
});

// ==========================================
// 8. CLASS CATEGORIES & EXAM LEVELS MANAGEMENT
// ==========================================

// Class categories CRUD
router.get('/class-categories', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  res.json(data.class_categories);
});

router.post('/class-categories', requireRole('admin'), (req, res) => {
  const { name, sectionId, description, order } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });

  const data = db.read();
  ensureCbtCollections(data);

  const newCat = {
    id: db.nextId(data.class_categories),
    name: name.trim(),
    sectionId: sectionId || 'jss',
    description: description || '',
    order: Number(order) || data.class_categories.length + 1,
  };
  data.class_categories.push(newCat);
  db.write(data);
  res.status(201).json(newCat);
});

router.put('/class-categories/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const cat = data.class_categories.find((c) => c.id === Number(req.params.id));
  if (!cat) return res.status(404).json({ message: 'Category not found' });

  if (req.body.name) cat.name = req.body.name.trim();
  if (req.body.sectionId) cat.sectionId = req.body.sectionId;
  if (req.body.description !== undefined) cat.description = req.body.description;
  if (req.body.order !== undefined) cat.order = Number(req.body.order);

  db.write(data);
  res.json(cat);
});

router.delete('/class-categories/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const id = Number(req.params.id);
  data.class_categories = data.class_categories.filter((c) => c.id !== id);
  db.write(data);
  res.json({ message: 'Category deleted' });
});

// Class levels CRUD
router.get('/class-levels', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  res.json(data.class_levels);
});

router.post('/class-levels', requireRole('admin'), (req, res) => {
  const { name, categoryId, sectionId } = req.body;
  if (!name) return res.status(400).json({ message: 'Level name is required' });

  const data = db.read();
  ensureCbtCollections(data);

  const newLevel = {
    id: db.nextId(data.class_levels),
    name: name.trim(),
    categoryId: Number(categoryId) || 1,
    sectionId: sectionId || 'jss',
  };
  data.class_levels.push(newLevel);
  db.write(data);
  res.status(201).json(newLevel);
});

router.put('/class-levels/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const lvl = data.class_levels.find((l) => l.id === Number(req.params.id));
  if (!lvl) return res.status(404).json({ message: 'Level not found' });

  if (req.body.name) lvl.name = req.body.name.trim();
  if (req.body.categoryId) lvl.categoryId = Number(req.body.categoryId);
  if (req.body.sectionId) lvl.sectionId = req.body.sectionId;

  db.write(data);
  res.json(lvl);
});

// Exam categories CRUD
router.get('/exam-categories', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  res.json(data.exam_categories);
});

router.post('/exam-categories', requireRole('admin'), (req, res) => {
  const { name, code, weight } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const data = db.read();
  ensureCbtCollections(data);

  const cat = {
    id: db.nextId(data.exam_categories),
    name: name.trim(),
    code: (code || name.slice(0, 4)).toUpperCase(),
    weight: Number(weight) || 100,
  };
  data.exam_categories.push(cat);
  db.write(data);
  res.status(201).json(cat);
});

router.put('/exam-categories/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const cat = data.exam_categories.find((c) => c.id === Number(req.params.id));
  if (!cat) return res.status(404).json({ message: 'Not found' });

  if (req.body.name) cat.name = req.body.name.trim();
  if (req.body.code) cat.code = req.body.code.trim().toUpperCase();
  if (req.body.weight !== undefined) cat.weight = Number(req.body.weight);

  db.write(data);
  res.json(cat);
});

router.delete('/exam-categories/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  data.exam_categories = data.exam_categories.filter((c) => c.id !== Number(req.params.id));
  db.write(data);
  res.json({ message: 'Exam category deleted' });
});

// Exam levels CRUD
router.get('/exam-levels', (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  res.json(data.exam_levels);
});

router.post('/exam-levels', requireRole('admin'), (req, res) => {
  const { name, sectionId } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const data = db.read();
  ensureCbtCollections(data);

  const lvl = {
    id: db.nextId(data.exam_levels),
    name: name.trim(),
    sectionId: sectionId || 'all',
  };
  data.exam_levels.push(lvl);
  db.write(data);
  res.status(201).json(lvl);
});

router.put('/exam-levels/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const lvl = data.exam_levels.find((l) => l.id === Number(req.params.id));
  if (!lvl) return res.status(404).json({ message: 'Not found' });

  if (req.body.name) lvl.name = req.body.name.trim();
  if (req.body.sectionId) lvl.sectionId = req.body.sectionId;

  db.write(data);
  res.json(lvl);
});

router.delete('/exam-levels/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);
  data.exam_levels = data.exam_levels.filter((l) => l.id !== Number(req.params.id));
  db.write(data);
  res.json({ message: 'Exam level deleted' });
});

// ==========================================
// 9. CBT REPORTS & ANALYTICS
// ==========================================
router.get('/reports', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureCbtCollections(data);

  const exams = data.cbt_examinations;
  const attempts = data.cbt_attempts.filter(
    (a) => a.status === 'Submitted' || a.status === 'Auto Submitted'
  );

  const totalExams = exams.length;
  const activeExams = exams.filter((e) => computeExamTimeStatus(e).isOpen).length;
  const scheduledExams = exams.filter((e) => computeExamTimeStatus(e).timeState === 'scheduled').length;
  const completedExams = exams.filter((e) => computeExamTimeStatus(e).isClosed).length;
  const totalQuestions = data.question_bank.length;

  const uniqueStudents = new Set(attempts.map((a) => a.studentId)).size;
  const averagePercentage = attempts.length
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / attempts.length)
    : 0;
  const passCount = attempts.filter((a) => (a.percentage || 0) >= 50).length;
  const passRate = attempts.length ? Math.round((passCount / attempts.length) * 100) : 0;

  // Breakdown by subject
  const subjectMap = {};
  attempts.forEach((att) => {
    const exam = exams.find((e) => e.id === att.examId);
    const sub = exam ? exam.subject : 'General';
    if (!subjectMap[sub]) {
      subjectMap[sub] = { subject: sub, attempts: 0, totalScore: 0, totalPossible: 0, passCount: 0 };
    }
    subjectMap[sub].attempts += 1;
    subjectMap[sub].totalScore += att.score || 0;
    subjectMap[sub].totalPossible += exam?.totalMarks || 100;
    if ((att.percentage || 0) >= 50) subjectMap[sub].passCount += 1;
  });

  const subjectPerformance = Object.values(subjectMap).map((item) => ({
    subject: item.subject,
    attempts: item.attempts,
    averagePercent: item.totalPossible > 0 ? Math.round((item.totalScore / item.totalPossible) * 100) : 0,
    passRate: item.attempts > 0 ? Math.round((item.passCount / item.attempts) * 100) : 0,
  }));

  // Breakdown by school section
  const sectionBreakdown = [
    { section: 'Primary School', code: 'primary', exams: exams.filter((e) => e.schoolSection === 'primary').length },
    { section: 'Junior Secondary School', code: 'jss', exams: exams.filter((e) => e.schoolSection === 'jss').length },
    { section: 'Senior Secondary School', code: 'sss', exams: exams.filter((e) => e.schoolSection === 'sss').length },
  ];

  res.json({
    metrics: {
      totalExams,
      activeExams,
      scheduledExams,
      completedExams,
      totalQuestions,
      totalAttempts: attempts.length,
      uniqueStudents,
      averagePercentage,
      passRate,
    },
    subjectPerformance,
    sectionBreakdown,
    recentAttempts: attempts
      .map((att) => {
        const student = data.users.find((u) => u.id === att.studentId);
        const exam = exams.find((e) => e.id === att.examId);
        return {
          id: att.id,
          studentName: student ? student.name : 'Unknown',
          studentSchoolId: student ? student.schoolId : '',
          examTitle: exam ? exam.title : 'Examination',
          subject: exam ? exam.subject : '',
          score: att.score,
          totalMarks: exam ? exam.totalMarks : 100,
          percentage: att.percentage,
          grade: att.grade,
          submissionTime: att.submissionTime,
        };
      })
      .sort((a, b) => new Date(b.submissionTime || 0) - new Date(a.submissionTime || 0))
      .slice(0, 10),
  });
});

module.exports = router;
