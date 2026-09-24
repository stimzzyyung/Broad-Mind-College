// Creates data/db.json with sample school data.
// Run it with:  npm run seed   (it also runs automatically the first time you start the server)
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { FILE } = require('./db');

function seed() {
  const hash = (plain) => bcrypt.hashSync(plain, 8);
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const dateFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const settings = {
    schoolName: 'Crestview College',
    motto: 'Knowledge with character',
    session: '2026/2027',
    term: 'First Term',
    address: '12 Unity Road',
    phone: '0801 234 5678',
    email: 'info@crestview.edu',
  };

  const subjects = [
    'Mathematics',
    'English Language',
    'Basic Science',
    'Civic Education',
    'Computer Studies',
    'Social Studies',
  ];

  // ---------- People ----------
  const users = [];

  users.push({
    id: 1, role: 'admin', schoolId: 'CVC/ADM/001', name: 'Dr. Adaeze Okonkwo',
    email: 'principal@crestview.edu', password: hash('admin123'), phone: '0803 555 0101',
    address: 'Staff quarters, Block A', bio: 'Principal since 2019.', status: 'active', createdAt: daysAgo(400),
  });

  const teachers = [
    { id: 2, name: 'Mr. Tunde Bakare', email: 'tunde@crestview.edu', phone: '0803 555 0102',
      qualification: 'B.Sc Mathematics, PGDE', subjects: ['Mathematics', 'Computer Studies'] },
    { id: 3, name: 'Mrs. Ngozi Eze', email: 'ngozi@crestview.edu', phone: '0803 555 0103',
      qualification: 'B.A English, PGDE', subjects: ['English Language', 'Civic Education'] },
    { id: 4, name: 'Mr. Ibrahim Musa', email: 'ibrahim@crestview.edu', phone: '0803 555 0104',
      qualification: 'B.Sc Integrated Science', subjects: ['Basic Science', 'Social Studies'] },
  ];
  teachers.forEach((t, i) => {
    users.push({
      ...t, role: 'teacher', schoolId: `CVC/TCH/00${i + 1}`, password: hash('teacher123'),
      address: '', bio: '', status: 'active', createdAt: daysAgo(300),
    });
  });

  const studentList = [
    ['Chinedu Okafor', 'Male', 1], ['Aisha Bello', 'Female', 1], ['Tobi Adeyemi', 'Male', 1],
    ['Ifeoma Nwosu', 'Female', 2], ['Emeka Obi', 'Male', 2], ['Fatima Yusuf', 'Female', 2],
    ['Seun Ogunleye', 'Male', 3], ['Blessing Udoh', 'Female', 3], ['Kelechi Anyanwu', 'Male', 3],
  ];
  const birthYear = [0, 2014, 2013, 2011];
  studentList.forEach(([name, gender, classId], i) => {
    users.push({
      id: 5 + i, role: 'student', schoolId: `CVC/26/${String(i + 1).padStart(3, '0')}`,
      name, gender, email: '', password: hash('student123'), phone: '',
      dob: `${birthYear[classId]}-0${(i % 9) + 1}-15`, classId,
      parentId: name === 'Chinedu Okafor' ? 14 : null,
      guardianName: `Mr/Mrs ${name.split(' ')[1]}`, guardianPhone: `0805 555 01${10 + i}`,
      address: `${i + 3} Palm Avenue`, status: 'active', createdAt: daysAgo(40 - i * 4),
    });
  });

  // A sample parent account, linked to Chinedu Okafor above, so the parent portal has data to show
  users.push({
    id: 14, role: 'parent', name: 'Grace Okafor', email: 'parent@crestview.edu',
    password: hash('parent123'), phone: '0805 555 0110', address: '3 Palm Avenue',
    bio: '', status: 'active', createdAt: daysAgo(40),
  });

  // ---------- Classes & timetable ----------
  const periods = ['08:00 - 08:40', '08:40 - 09:20', '09:20 - 10:00', '10:30 - 11:10', '11:10 - 11:50', '11:50 - 12:30'];
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  function buildTimetable(offset) {
    const days = {};
    weekdays.forEach((day, d) => {
      days[day] = periods.map((_, p) => subjects[(p + d + offset) % subjects.length]);
    });
    return { periods, days };
  }
  const teacherFor = (subject) => teachers.find((t) => t.subjects.includes(subject)).id;

  const classes = [
    { id: 1, name: 'JSS 1A', level: 'Junior', formTeacherId: 2 },
    { id: 2, name: 'JSS 2A', level: 'Junior', formTeacherId: 3 },
    { id: 3, name: 'SS 1A', level: 'Senior', formTeacherId: 4 },
  ].map((c, i) => ({
    ...c,
    subjects: subjects.map((name) => ({ name, teacherId: teacherFor(name) })),
    timetable: buildTimetable(i * 2),
  }));

  // ---------- Fees & payments ----------
  const fees = [
    { id: 1, title: 'Tuition fee', amount: 85000 },
    { id: 2, title: 'PTA levy', amount: 5000 },
    { id: 3, title: 'Books and materials', amount: 15000 },
    { id: 4, title: 'Sports and clubs', amount: 3000 },
  ].map((f) => ({ ...f, term: settings.term, session: settings.session }));

  const payments = [];
  const addPayment = (studentId, feeId, amount, method, days) => {
    const id = payments.length + 1;
    payments.push({
      id, studentId, feeId, amount, method, status: 'success',
      reference: `CVC-SEED${String(id).padStart(4, '0')}`,
      receiptNo: `RCT-${String(id).padStart(5, '0')}`,
      term: settings.term, session: settings.session, date: daysAgo(days),
    });
  };
  addPayment(5, 1, 85000, 'Card', 6);
  addPayment(5, 2, 5000, 'Card', 6);
  addPayment(6, 1, 40000, 'Bank transfer', 5);
  addPayment(7, 3, 15000, 'Bank transfer', 4);
  addPayment(8, 1, 85000, 'Card', 3);
  addPayment(8, 2, 5000, 'Card', 3);
  addPayment(8, 3, 15000, 'Card', 3);
  addPayment(8, 4, 3000, 'Card', 3);
  addPayment(9, 1, 60000, 'Bank transfer', 2);
  addPayment(11, 1, 85000, 'Card', 1);
  addPayment(12, 2, 5000, 'Card', 1);

  // ---------- Results (last term) ----------
  let seedNum = 11;
  const rnd = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };
  const results = [];
  users.filter((u) => u.role === 'student').forEach((student) => {
    const cls = classes.find((c) => c.id === student.classId);
    cls.subjects.forEach((sub) => {
      const ca = Math.round(18 + rnd() * 20);
      const exam = Math.round(26 + rnd() * 32);
      results.push({
        id: results.length + 1, studentId: student.id, classId: cls.id, subject: sub.name,
        term: 'Third Term', session: '2025/2026', ca, exam, total: ca + exam, teacherId: sub.teacherId,
      });
    });
  });

  // ---------- LMS ----------
  const quizzes = [
    {
      id: 1, title: 'Algebra basics quiz', subject: 'Mathematics', classId: 1, teacherId: 2, type: 'Quiz',
      durationMins: 15, dueDate: dateFromNow(10), createdAt: daysAgo(3),
      questions: [
        { question: 'Solve: 2x + 6 = 14', options: ['x = 2', 'x = 4', 'x = 6', 'x = 10'], answerIndex: 1 },
        { question: 'What is the value of 3² + 4²?', options: ['7', '12', '25', '49'], answerIndex: 2 },
        { question: 'Simplify: 5a + 3a - 2a', options: ['6a', '8a', '10a', '4a'], answerIndex: 0 },
        { question: 'What is 25% of 240?', options: ['50', '60', '75', '80'], answerIndex: 1 },
        { question: 'Which of these numbers is prime?', options: ['21', '27', '29', '33'], answerIndex: 2 },
      ],
    },
    {
      id: 2, title: 'Grammar and comprehension test', subject: 'English Language', classId: 1, teacherId: 3, type: 'Test',
      durationMins: 20, dueDate: dateFromNow(7), createdAt: daysAgo(2),
      questions: [
        { question: 'Choose the correct sentence.', options: ['She go to school daily.', 'She goes to school daily.', 'She going to school daily.', 'She gone to school daily.'], answerIndex: 1 },
        { question: 'A word that describes a noun is called…', options: ['a verb', 'an adverb', 'an adjective', 'a pronoun'], answerIndex: 2 },
        { question: 'What is the plural of "child"?', options: ['childs', 'childes', 'children', 'childrens'], answerIndex: 2 },
        { question: 'Choose the word opposite in meaning to "generous".', options: ['Kind', 'Stingy', 'Rich', 'Happy'], answerIndex: 1 },
      ],
    },
    {
      id: 3, title: 'Introduction to computers', subject: 'Computer Studies', classId: 3, teacherId: 2, type: 'Quiz',
      durationMins: 10, dueDate: dateFromNow(14), createdAt: daysAgo(1),
      questions: [
        { question: 'Which device is used to type text into a computer?', options: ['Monitor', 'Keyboard', 'Speaker', 'Printer'], answerIndex: 1 },
        { question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'], answerIndex: 0 },
        { question: 'Which of these is an output device?', options: ['Mouse', 'Scanner', 'Monitor', 'Microphone'], answerIndex: 2 },
        { question: 'Software used to browse the internet is called a…', options: ['browser', 'compiler', 'router', 'firewall'], answerIndex: 0 },
      ],
    },
  ];

  const submissions = [
    { id: 1, quizId: 1, studentId: 5, answers: [1, 2, 0, 0, 2], score: 4, total: 5, submittedAt: daysAgo(1) },
  ];

  // ---------- Announcements ----------
  const announcements = [
    { id: 1, title: 'Welcome back to the new session', body: 'Classes are in full swing. Students should be in full school uniform every day.', author: 'Dr. Adaeze Okonkwo', date: daysAgo(6) },
    { id: 2, title: 'First-term fees', body: 'Please complete first-term fee payments before the end of October. Receipts can be downloaded from the portal.', author: 'Dr. Adaeze Okonkwo', date: daysAgo(4) },
    { id: 3, title: 'Inter-house sports trials', body: 'Trials hold next week. See your sports teacher to register.', author: 'Dr. Adaeze Okonkwo', date: daysAgo(1) },
  ];

  const data = { settings, users, classes, fees, payments, results, quizzes, submissions, announcements, notifications: [] };
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  try {
    require('./seed_cbt');
  } catch (e) {
    console.error('CBT seed error:', e);
  }
}

module.exports = seed;

// Lets you run "node data/seed.js" directly
if (require.main === module) {
  seed();
  console.log('Sample data created in data/db.json');
}
