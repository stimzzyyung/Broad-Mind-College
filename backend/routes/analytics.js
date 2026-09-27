const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { feeStatus } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const data = db.read();
  const students = data.users.filter((user) => user.role === 'student');
  const currentFees = data.fees.filter((fee) => fee.session === data.settings.session && fee.term === data.settings.term);
  const currentFeeIds = new Set(currentFees.map((fee) => fee.id));
  const currentPayments = data.payments.filter((payment) => currentFeeIds.has(payment.feeId) && payment.status === 'success');
  const studentTotals = new Map();

  students.forEach((student) => {
    const status = feeStatus(data, student.id);
    studentTotals.set(student.id, {
      expected: status.reduce((sum, fee) => sum + fee.amount, 0),
      paid: status.reduce((sum, fee) => sum + fee.paid, 0),
    });
  });

  const finance = [...studentTotals.values()].reduce((totals, value) => ({
    expected: totals.expected + value.expected,
    paid: totals.paid + value.paid,
  }), { expected: 0, paid: 0 });
  finance.outstanding = finance.expected - finance.paid;
  finance.collectionRate = finance.expected ? Math.round((finance.paid / finance.expected) * 100) : 0;

  const feeBreakdown = currentFees.map((fee) => {
    const paid = currentPayments.filter((payment) => payment.feeId === fee.id).reduce((sum, payment) => sum + payment.amount, 0);
    return { id: fee.id, title: fee.title, expected: fee.amount * students.length, paid, outstanding: Math.max(fee.amount * students.length - paid, 0) };
  });

  const paymentMethods = currentPayments.reduce((methods, payment) => {
    const method = payment.method || 'Other';
    methods[method] = (methods[method] || 0) + payment.amount;
    return methods;
  }, {});

  const classes = data.classes.map((cls) => {
    const classStudents = students.filter((student) => student.classId === cls.id);
    const totals = classStudents.reduce((sum, student) => {
      const value = studentTotals.get(student.id) || { expected: 0, paid: 0 };
      return { expected: sum.expected + value.expected, paid: sum.paid + value.paid };
    }, { expected: 0, paid: 0 });
    return { id: cls.id, name: cls.name, students: classStudents.length, expected: totals.expected, paid: totals.paid, outstanding: totals.expected - totals.paid, collectionRate: totals.expected ? Math.round((totals.paid / totals.expected) * 100) : 0 };
  });

  const attempts = data.cbt_attempts || [];
  const completedAttempts = attempts.filter((attempt) => attempt.status === 'Submitted' || attempt.status === 'Auto Submitted');
  const recentPayments = [...currentPayments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).map((payment) => {
    const student = students.find((user) => user.id === payment.studentId);
    const fee = data.fees.find((item) => item.id === payment.feeId);
    return { id: payment.id, studentName: student ? student.name : 'Removed student', feeTitle: fee ? fee.title : 'Fee', amount: payment.amount, method: payment.method || 'Other', date: payment.date };
  });

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const paid = data.payments.filter((payment) => payment.status === 'success').filter((payment) => {
      const paymentDate = new Date(payment.date);
      return paymentDate.getMonth() === date.getMonth() && paymentDate.getFullYear() === date.getFullYear();
    }).reduce((sum, payment) => sum + payment.amount, 0);
    return { label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), paid };
  });

  res.json({
    settings: data.settings,
    overview: { students: students.length, teachers: data.users.filter((user) => user.role === 'teacher').length, classes: data.classes.length, parents: data.users.filter((user) => user.role === 'parent').length, notices: data.announcements.length },
    finance: { ...finance, feeBreakdown, paymentMethods, monthly },
    classes,
    activity: { quizzes: (data.quizzes || []).length, quizSubmissions: (data.submissions || []).length, exams: (data.cbt_examinations || []).length, examAttempts: completedAttempts.length, results: (data.results || []).length, announcements: data.announcements.length },
    recentPayments,
  });
});

module.exports = router;