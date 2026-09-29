const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSettings } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const term = settings?.term || '';
    const session = settings?.session || '';
    const [studentRows] = await pool.execute('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['student']);
    const studentCount = Number(studentRows[0].count);
    const [[feeRows], [paymentRows], [methodRows], [classRows], [recentRows], [monthlyRows], [activityRows], [overviewRows]] = await Promise.all([
      pool.execute('SELECT id, title, amount FROM fees WHERE term = ? AND session = ? ORDER BY id', [term, session]),
      pool.execute('SELECT p.id, p.student_id, p.fee_id, p.amount, p.method, p.date, u.name AS student_name, u.class_id AS student_class_id, f.title AS fee_title FROM payments p LEFT JOIN users u ON u.id = p.student_id LEFT JOIN fees f ON f.id = p.fee_id WHERE p.status = ? AND p.term = ? AND p.session = ? ORDER BY p.date DESC', ['success', term, session]),
      pool.execute('SELECT method, SUM(amount) AS total FROM payments WHERE status = ? AND term = ? AND session = ? GROUP BY method', ['success', term, session]),
      pool.execute('SELECT c.id, c.name, COUNT(DISTINCT s.id) AS students, COUNT(DISTINCT s.id) * (SELECT COALESCE(SUM(f.amount), 0) FROM fees f WHERE f.term = ? AND f.session = ?) AS expected FROM classes c LEFT JOIN users s ON s.role = ? AND s.class_id = c.id GROUP BY c.id, c.name ORDER BY c.name', [term, session, 'student']),
      pool.execute('SELECT p.id, p.amount, p.method, p.date, u.name AS student_name, f.title AS fee_title FROM payments p LEFT JOIN users u ON u.id = p.student_id LEFT JOIN fees f ON f.id = p.fee_id WHERE p.status = ? AND p.term = ? AND p.session = ? ORDER BY p.date DESC LIMIT 8', ['success', term, session]),
      pool.execute('SELECT DATE_FORMAT(date, \'%Y-%m\') AS month, SUM(amount) AS paid FROM payments WHERE status = ? AND date >= DATE_FORMAT(DATE_SUB(CURRENT_DATE(), INTERVAL 5 MONTH), \'%Y-%m-01\') GROUP BY DATE_FORMAT(date, \'%Y-%m\')', ['success']),
      pool.execute('SELECT (SELECT COUNT(*) FROM quizzes) AS quizzes, (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM cbt_examinations) AS exams, (SELECT COUNT(*) FROM cbt_attempts WHERE status IN (\'Submitted\', \'Auto Submitted\')) AS completed_attempts, (SELECT COUNT(*) FROM results) AS results, (SELECT COUNT(*) FROM announcements) AS announcements'),
      pool.execute('SELECT SUM(role = \'teacher\') AS teachers, SUM(role = \'parent\') AS parents FROM users'),
    ]);

    const feesExpectedPerStudent = feeRows.reduce((sum, fee) => sum + Number(fee.amount), 0);
    const expected = feesExpectedPerStudent * studentCount;
    const feeBreakdown = feeRows.map((fee) => {
      const paid = paymentRows.filter((payment) => Number(payment.fee_id) === Number(fee.id)).reduce((sum, payment) => sum + Number(payment.amount), 0);
      const feeExpected = Number(fee.amount) * studentCount;
      return { id: Number(fee.id), title: fee.title, expected: feeExpected, paid, outstanding: Math.max(feeExpected - paid, 0) };
    });
    const paidByMonth = new Map(monthlyRows.map((row) => [row.month, Number(row.paid)]));
    const monthly = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), paid: paidByMonth.get(key) || 0 };
    });
    const classes = classRows.map((row) => {
      const classPaid = paymentRows.reduce((sum, payment) => sum + (Number(payment.student_class_id) === Number(row.id) ? Number(payment.amount) : 0), 0);
      const classExpected = Number(row.expected);
      return {
        id: Number(row.id), name: row.name, students: Number(row.students), expected: classExpected,
        paid: classPaid, outstanding: classExpected - classPaid,
        collectionRate: classExpected ? Math.round((classPaid / classExpected) * 100) : 0,
      };
    });
    const feeTotal = feeBreakdown.reduce((sum, fee) => sum + fee.expected, 0);
    const paidTotal = feeBreakdown.reduce((sum, fee) => sum + fee.paid, 0);
    res.json({
      settings,
      overview: {
        students: studentCount, teachers: Number(overviewRows[0].teachers || 0),
        classes: classRows.length, parents: Number(overviewRows[0].parents || 0),
        notices: Number(activityRows[0].announcements),
      },
      finance: {
        expected: feeTotal, paid: paidTotal, outstanding: feeTotal - paidTotal,
        collectionRate: feeTotal ? Math.round((paidTotal / feeTotal) * 100) : 0,
        feeBreakdown,
        paymentMethods: Object.fromEntries(methodRows.map((row) => [row.method || 'Other', Number(row.total)])),
        monthly,
      },
      classes,
      activity: {
        quizzes: Number(activityRows[0].quizzes), quizSubmissions: Number(activityRows[0].submissions),
        exams: Number(activityRows[0].exams), examAttempts: Number(activityRows[0].completed_attempts),
        results: Number(activityRows[0].results), announcements: Number(activityRows[0].announcements),
      },
      recentPayments: recentRows.map((row) => ({
        id: Number(row.id), studentName: row.student_name || 'Removed student', feeTitle: row.fee_title || 'Fee',
        amount: Number(row.amount), method: row.method || 'Other', date: row.date,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;