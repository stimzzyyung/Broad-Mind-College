const mysql = require('mysql2/promise');
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');

let pool;
let requestQueue = Promise.resolve();
const requestStorage = new AsyncLocalStorage();
const coreKeys = new Set([
  'settings', 'users', 'classes', 'fees', 'payments', 'results', 'quizzes',
  'submissions', 'announcements', 'notifications',
]);

function jsonValue(value) {
  if (value == null) return value;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function isoDate(value) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : `${String(value).replace(' ', 'T')}Z`;
}

async function rows(connection, sql, params = []) {
  const [result] = await connection.query(sql, params);
  return result;
}

async function loadData(connection) {
  const [
    settingsRows, userRows, classRows, subjectRows, timetableRows, fees, payments,
    results, quizRows, questionRows, submissions, announcements, notificationRows, extensionRows,
  ] = await Promise.all([
    rows(connection, 'SELECT * FROM settings WHERE id = 1'),
    rows(connection, 'SELECT * FROM users ORDER BY id'),
    rows(connection, 'SELECT * FROM classes ORDER BY id'),
    rows(connection, 'SELECT * FROM class_subjects ORDER BY id'),
    rows(connection, 'SELECT * FROM timetable_slots ORDER BY class_id, period_index, day'),
    rows(connection, 'SELECT * FROM fees ORDER BY id'),
    rows(connection, 'SELECT * FROM payments ORDER BY id'),
    rows(connection, 'SELECT * FROM results ORDER BY id'),
    rows(connection, 'SELECT * FROM quizzes ORDER BY id'),
    rows(connection, 'SELECT * FROM quiz_questions ORDER BY id'),
    rows(connection, 'SELECT * FROM submissions ORDER BY id'),
    rows(connection, 'SELECT * FROM announcements ORDER BY id'),
    rows(connection, 'SELECT * FROM notifications ORDER BY id'),
    rows(connection, 'SELECT payload FROM portal_extensions WHERE id = 1'),
  ]);

  if (!settingsRows.length) {
    throw new Error('The MySQL database is empty. Import database/schema.sql and database/seed_data.sql first.');
  }

  const settingsRow = settingsRows[0];
  const extensions = extensionRows.length ? jsonValue(extensionRows[0].payload) : {};
  const settings = {
    schoolName: settingsRow.school_name,
    motto: settingsRow.motto,
    session: settingsRow.session,
    term: settingsRow.term,
    address: settingsRow.address,
    phone: settingsRow.phone,
    email: settingsRow.email,
  };

  const users = userRows.map((user) => ({
    ...(extensions._user_metadata?.[user.id] || {}),
    id: user.id,
    role: user.role,
    schoolId: user.school_id,
    name: user.name,
    email: user.email || '',
    password: user.password,
    phone: user.phone || '',
    gender: user.gender,
    dob: user.dob ? String(user.dob).slice(0, 10) : '',
    classId: user.class_id,
    parentId: user.parent_id,
    guardianName: user.guardian_name || '',
    guardianPhone: user.guardian_phone || '',
    address: user.address || '',
    bio: user.bio || '',
    qualification: user.qualification || '',
    status: user.status || 'active',
    createdAt: isoDate(user.created_at),
  }));

  const classes = classRows.map((cls) => {
    const classTimetable = timetableRows.filter((slot) => slot.class_id === cls.id);
    const periods = [...new Set(classTimetable
      .filter((slot) => slot.day === 'Monday')
      .sort((a, b) => a.period_index - b.period_index)
      .map((slot) => slot.time_slot))];
    const days = {};
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      days[day] = classTimetable
        .filter((slot) => slot.day === day)
        .sort((a, b) => a.period_index - b.period_index)
        .map((slot) => slot.subject);
    }
    return {
      ...(extensions._class_metadata?.[cls.id] || {}),
      id: cls.id,
      name: cls.name,
      level: cls.level,
      formTeacherId: cls.form_teacher_id,
      subjects: subjectRows
        .filter((subject) => subject.class_id === cls.id)
        .map((subject) => ({ name: subject.subject, teacherId: subject.teacher_id })),
      timetable: { periods, days },
    };
  });

  const questionsByQuiz = new Map();
  for (const question of questionRows) {
    const quizQuestions = questionsByQuiz.get(question.quiz_id) || [];
    const questionIndex = quizQuestions.length;
    const metadata = extensions._quiz_question_metadata?.[`${question.quiz_id}:${questionIndex}`] || {};
    quizQuestions.push({
      ...metadata,
      id: question.id,
      question: question.question,
      options: metadata.options || [question.option_a, question.option_b, question.option_c, question.option_d]
        .filter((option) => option !== null),
      answerIndex: question.answer_index,
    });
    questionsByQuiz.set(question.quiz_id, quizQuestions);
  }

  const quizzes = quizRows.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    subject: quiz.subject,
    classId: quiz.class_id,
    teacherId: quiz.teacher_id,
    type: quiz.type,
    durationMins: quiz.duration_mins,
    dueDate: quiz.due_date ? String(quiz.due_date).slice(0, 10) : '',
    createdAt: isoDate(quiz.created_at),
    questions: questionsByQuiz.get(quiz.id) || [],
  }));

  const data = {
    settings,
    users,
    classes,
    fees: fees.map((fee) => ({ ...fee, amount: Number(fee.amount) })),
    payments: payments.map((payment) => ({
      id: payment.id,
      studentId: payment.student_id,
      feeId: payment.fee_id,
      amount: Number(payment.amount),
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
      receiptNo: payment.receipt_no,
      term: payment.term,
      session: payment.session,
      date: isoDate(payment.date),
    })),
    results: results.map((result) => ({
      id: result.id,
      studentId: result.student_id,
      classId: result.class_id,
      subject: result.subject,
      term: result.term,
      session: result.session,
      ca: result.ca,
      exam: result.exam,
      total: result.total,
      teacherId: result.teacher_id,
    })),
    quizzes,
    submissions: submissions.map((submission) => ({
      id: submission.id,
      quizId: submission.quiz_id,
      studentId: submission.student_id,
      answers: jsonValue(submission.answers),
      score: submission.score,
      total: submission.total,
      submittedAt: isoDate(submission.submitted_at),
    })),
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      author: announcement.author,
      date: isoDate(announcement.date),
    })),
    notifications: notificationRows.map((notification) => ({
      id: notification.id,
      userId: notification.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      link: notification.link,
      read: Boolean(notification.is_read),
      createdAt: isoDate(notification.created_at),
    })),
  };

  for (const [key, value] of Object.entries(extensions)) {
    if (!key.startsWith('_')) data[key] = value;
  }
  data.classes.forEach((cls) => Object.assign(cls, extensions._class_metadata?.[cls.id] || {}));
  data.users.forEach((user) => Object.assign(user, extensions._user_metadata?.[user.id] || {}));
  data.quizzes.forEach((quiz) => quiz.questions.forEach((question, index) => {
    Object.assign(
      question,
      extensions._quiz_question_metadata?.[`${quiz.id}:${index}`] || {}
    );
  }));
  return data;
}

async function insertRows(connection, table, columns, entries) {
  if (!entries.length) return;
  const names = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  for (const entry of entries) {
    await connection.execute(
      `INSERT INTO ${table} (${names}) VALUES (${placeholders})`,
      columns.map((column) => entry[column] ?? null)
    );
  }
}

function mysqlDate(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

async function saveData(data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'notifications', 'announcements', 'submissions', 'quiz_questions', 'quizzes',
      'results', 'payments', 'fees', 'timetable_slots', 'class_subjects', 'users',
      'classes', 'settings', 'portal_extensions',
    ]) {
      await connection.query(`DELETE FROM ${table}`);
    }

    await insertRows(connection, 'settings',
      ['id', 'school_name', 'motto', 'session', 'term', 'address', 'phone', 'email'],
      [{ id: 1, school_name: data.settings.schoolName, motto: data.settings.motto,
        session: data.settings.session, term: data.settings.term, address: data.settings.address,
        phone: data.settings.phone, email: data.settings.email }]);

    await insertRows(connection, 'classes', ['id', 'name', 'level', 'form_teacher_id'],
      data.classes.map((cls) => ({
        id: cls.id, name: cls.name, level: cls.level, form_teacher_id: cls.formTeacherId,
      })));
    await insertRows(connection, 'users', [
      'id', 'role', 'school_id', 'name', 'email', 'password', 'phone', 'gender', 'dob',
      'class_id', 'parent_id', 'guardian_name', 'guardian_phone', 'address', 'bio',
      'qualification', 'status', 'created_at',
    ], data.users.map((user) => ({
      id: user.id, role: user.role, school_id: user.schoolId || null, name: user.name,
      email: user.email || null, password: user.password, phone: user.phone || '',
      gender: user.gender || null, dob: user.dob || null, class_id: user.classId,
      parent_id: user.parentId, guardian_name: user.guardianName || '',
      guardian_phone: user.guardianPhone || '', address: user.address || '',
      bio: user.bio || null, qualification: user.qualification || null,
      status: user.status || 'active', created_at: mysqlDate(user.createdAt),
    })));

    await insertRows(connection, 'class_subjects',
      ['class_id', 'subject', 'teacher_id'],
      data.classes.flatMap((cls) => cls.subjects.map((subject) => ({
        class_id: cls.id, subject: subject.name, teacher_id: subject.teacherId,
      }))));

    await insertRows(connection, 'timetable_slots',
      ['class_id', 'day', 'period_index', 'time_slot', 'subject'],
      data.classes.flatMap((cls) => Object.entries(cls.timetable.days).flatMap(([day, subjects]) =>
        subjects.map((subject, periodIndex) => ({
          class_id: cls.id, day, period_index: periodIndex,
          time_slot: cls.timetable.periods[periodIndex], subject,
        })))));

    await insertRows(connection, 'fees', ['id', 'title', 'amount', 'term', 'session'], data.fees);
    await insertRows(connection, 'payments',
      ['id', 'student_id', 'fee_id', 'amount', 'method', 'status', 'reference', 'receipt_no', 'term', 'session', 'date'],
      data.payments.map((payment) => ({
        id: payment.id, student_id: payment.studentId, fee_id: payment.feeId,
        amount: payment.amount, method: payment.method, status: payment.status,
        reference: payment.reference, receipt_no: payment.receiptNo || null,
        term: payment.term, session: payment.session, date: mysqlDate(payment.date),
      })));
    await insertRows(connection, 'results',
      ['id', 'student_id', 'class_id', 'subject', 'term', 'session', 'ca', 'exam', 'total', 'teacher_id'],
      data.results.map((result) => ({
        id: result.id, student_id: result.studentId, class_id: result.classId,
        subject: result.subject, term: result.term, session: result.session, ca: result.ca,
        exam: result.exam, total: result.total, teacher_id: result.teacherId,
      })));

    await insertRows(connection, 'quizzes',
      ['id', 'title', 'subject', 'class_id', 'teacher_id', 'type', 'duration_mins', 'due_date', 'created_at'],
      data.quizzes.map((quiz) => ({
        id: quiz.id, title: quiz.title, subject: quiz.subject, class_id: quiz.classId,
        teacher_id: quiz.teacherId, type: quiz.type, duration_mins: quiz.durationMins,
        due_date: quiz.dueDate || null, created_at: mysqlDate(quiz.createdAt),
      })));
    await insertRows(connection, 'quiz_questions',
      ['id', 'quiz_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer_index'],
      data.quizzes.flatMap((quiz) => quiz.questions.map((question) => ({
        id: question.id, quiz_id: quiz.id, question: question.question,
        option_a: question.options[0], option_b: question.options[1],
        option_c: question.options[2], option_d: question.options[3],
        answer_index: question.answerIndex,
      }))));
    await insertRows(connection, 'submissions',
      ['id', 'quiz_id', 'student_id', 'answers', 'score', 'total', 'submitted_at'],
      data.submissions.map((submission) => ({
        id: submission.id, quiz_id: submission.quizId, student_id: submission.studentId,
        answers: JSON.stringify(submission.answers), score: submission.score,
        total: submission.total, submitted_at: mysqlDate(submission.submittedAt),
      })));

    await insertRows(connection, 'announcements',
      ['id', 'title', 'body', 'author', 'posted_by', 'date'],
      data.announcements.map((announcement) => ({
        id: announcement.id, title: announcement.title, body: announcement.body,
        author: announcement.author || '',
        posted_by: (data.users.find((user) => user.name === announcement.author) || {}).id,
        date: mysqlDate(announcement.date),
      })));
    await insertRows(connection, 'notifications',
      ['id', 'user_id', 'title', 'body', 'type', 'link', 'is_read', 'created_at'],
      data.notifications.map((notification) => ({
        id: notification.id, user_id: notification.userId, title: notification.title,
        body: notification.body || '', type: notification.type || 'info',
        link: notification.link || '', is_read: notification.read ? 1 : 0,
        created_at: mysqlDate(notification.createdAt),
      })));

    const extensions = {};
    for (const [key, value] of Object.entries(data)) {
      if (!coreKeys.has(key)) extensions[key] = value;
    }
    const classFields = new Set(['id', 'name', 'level', 'formTeacherId', 'subjects', 'timetable']);
    extensions._class_metadata = Object.fromEntries(data.classes.map((cls) => [
      cls.id,
      Object.fromEntries(Object.entries(cls).filter(([key]) => !classFields.has(key))),
    ]));
    const userFields = new Set([
      'id', 'role', 'schoolId', 'name', 'email', 'password', 'phone', 'gender', 'dob',
      'classId', 'parentId', 'guardianName', 'guardianPhone', 'address', 'bio',
      'qualification', 'status', 'createdAt',
    ]);
    extensions._user_metadata = Object.fromEntries(data.users.map((user) => [
      user.id,
      Object.fromEntries(Object.entries(user).filter(([key]) => !userFields.has(key))),
    ]));
    extensions._quiz_question_metadata = Object.fromEntries(data.quizzes.flatMap((quiz) =>
      quiz.questions.map((question, index) => {
        const questionFields = new Set(['id', 'question', 'options', 'answerIndex']);
        return [
          `${quiz.id}:${index}`,
          {
            ...Object.fromEntries(Object.entries(question).filter(([key]) => !questionFields.has(key))),
            options: question.options,
          },
        ];
      })
    ));
    await connection.execute(
      'INSERT INTO portal_extensions (id, payload) VALUES (1, ?)',
      [JSON.stringify(extensions)]
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      connection.release();
    }
  }
}

async function initialize({ allowEmpty = false } = {}) {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };
  const database = process.env.DB_NAME || 'broadmind_college';

  if (allowEmpty) {
    if (!/^[a-zA-Z0-9_$]+$/.test(database)) {
      throw new Error('DB_NAME may contain only letters, numbers, underscores, and dollar signs');
    }
    const connection = await mysql.createConnection({ ...config, multipleStatements: true });
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      const [tableRows] = await connection.query(
        'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
        [database]
      );
      if (Number(tableRows[0].table_count) === 0) {
        const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8')
          .replace(/CREATE DATABASE IF NOT EXISTS [a-zA-Z0-9_$]+/i, `CREATE DATABASE IF NOT EXISTS \`${database}\``)
          .replace(/USE [a-zA-Z0-9_$]+\s*;/i, `USE \`${database}\`;`);
        await connection.query(schema);
      }
    } finally {
      await connection.end();
    }
  }

  pool = mysql.createPool({
    ...config,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  });
  await pool.query('SELECT 1');
  if (allowEmpty) {
    const [tableRows] = await pool.query(
      'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
      [database]
    );
    if (Number(tableRows[0].table_count) === 0) {
      throw new Error(`No tables were created in ${database}. Import database/schema.sql and try again.`);
    }
  } else {
    await loadData(pool);
  }
}

async function refresh() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const data = await loadData(connection);
    await connection.commit();
    return data;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function read() {
  const context = requestStorage.getStore();
  if (!context) throw new Error('db.read() must be called during an API request');
  return context.data;
}

function write(data) {
  const context = requestStorage.getStore();
  if (!context) throw new Error('db.write() must be called during an API request');
  const snapshot = structuredClone(data);
  context.data = snapshot;
  context.pendingWrite = context.pendingWrite.catch(() => {}).then(() => saveData(snapshot));
  return context.pendingWrite;
}

async function seedDatabase(data) {
  await saveData(data);
  await refresh();
}

async function close() {
  if (pool) await pool.end();
}

function requestMiddleware(req, res, next) {
  const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  let release = () => {};
  let previous = Promise.resolve();

  if (isWriteRequest) {
    const turn = new Promise((resolve) => { release = resolve; });
    previous = requestQueue;
    requestQueue = previous.then(() => turn);
  }

  previous.then(async () => {
    try {
      const context = { data: await refresh(), pendingWrite: Promise.resolve() };
      const sendJson = res.json.bind(res);
      let released = false;
      const unlock = () => {
        if (!released) {
          released = true;
          release();
        }
      };
      if (isWriteRequest) res.once('finish', unlock);
      res.json = (body) => context.pendingWrite
        .then(() => sendJson(body), (error) => {
          console.error('Failed to commit request changes to MySQL:', error);
          if (res.headersSent) return undefined;
          res.status(500);
          return sendJson({ message: 'Unable to save changes to the database' });
        })
        .finally(unlock);
      requestStorage.run(context, next);
    } catch (error) {
      release();
      next(error);
    }
  }).catch((error) => {
    release();
    next(error);
  });
}

function nextId(list) {
  return list.length ? Math.max(...list.map((item) => item.id)) + 1 : 1;
}

module.exports = { initialize, requestMiddleware, read, write, seedDatabase, close, nextId };
