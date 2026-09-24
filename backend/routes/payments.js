const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { feeStatus } = require('../utils/helpers');
const { notifyUsers } = require('../data/notify');

const router = express.Router();
router.use(requireAuth);

// The PDF's built-in font cannot draw currency symbols, so the receipt uses the code instead
const CURRENCY = 'NGN';
const money = (n) => `${CURRENCY} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

// Adds student name, class and fee title to a payment
function describe(data, payment) {
  const student = data.users.find((u) => u.id === payment.studentId);
  const cls = student && data.classes.find((c) => c.id === student.classId);
  const fee = data.fees.find((f) => f.id === payment.feeId);
  return {
    ...payment,
    studentName: student ? student.name : 'Removed student',
    schoolId: student ? student.schoolId : '',
    className: cls ? cls.name : '',
    feeTitle: fee ? fee.title : 'Fee',
  };
}

// Shared by "student pays" and "admin records a payment"
function createPayment(data, studentId, feeId, amount, method) {
  const fee = data.fees.find((f) => f.id === Number(feeId));
  if (!fee) return { error: 'Choose a fee to pay' };

  const status = feeStatus(data, studentId).find((f) => f.id === fee.id);
  if (!status) return { error: 'That fee does not belong to the current term' };

  const amt = Number(amount);
  if (!amt || amt <= 0) return { error: 'Enter a valid amount' };
  if (amt > status.balance) {
    return { error: `The balance on this fee is ${status.balance.toLocaleString()}. You cannot pay more than that.` };
  }

  const id = db.nextId(data.payments);
  const payment = {
    id,
    studentId,
    feeId: fee.id,
    amount: amt,
    method,
    status: 'success',
    reference: `CVC-${Date.now().toString(36).toUpperCase()}`,
    receiptNo: `RCT-${String(id).padStart(5, '0')}`,
    term: fee.term,
    session: fee.session,
    date: new Date().toISOString(),
  };
  data.payments.push(payment);
  return { payment };
}

// ---------- Fee items ----------

// GET /api/payments/fees  – the fee list for the current term
router.get('/fees', (req, res) => {
  const data = db.read();
  const { session, term } = data.settings;
  res.json(data.fees.filter((f) => f.session === session && f.term === term));
});

// POST /api/payments/fees  { title, amount }  – admin adds a fee item
router.post('/fees', requireRole('admin'), (req, res) => {
  const { title, amount } = req.body;
  if (!title || !Number(amount) || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Enter a fee name and an amount' });
  }
  const data = db.read();
  const fee = {
    id: db.nextId(data.fees),
    title: title.trim(),
    amount: Number(amount),
    term: data.settings.term,
    session: data.settings.session,
  };
  data.fees.push(fee);

  const payers = data.users.filter((u) => u.role === 'student' || u.role === 'parent').map((u) => u.id);
  notifyUsers(data, payers, {
    title: 'New fee added',
    body: `${fee.title}: NGN ${fee.amount.toLocaleString()} for ${fee.term}, ${fee.session}.`,
    type: 'fee',
    link: '/fees',
  });

  db.write(data);
  res.status(201).json(fee);
});

// PUT /api/payments/fees/:id  { title, amount }  – admin changes the amount or name of a fee item
router.put('/fees/:id', requireRole('admin'), (req, res) => {
  const { title, amount } = req.body;
  const data = db.read();
  const fee = data.fees.find((f) => f.id === Number(req.params.id));
  if (!fee) return res.status(404).json({ message: 'Fee not found' });

  if (title !== undefined) {
    if (!title.trim()) return res.status(400).json({ message: 'Enter a fee name' });
    fee.title = title.trim();
  }
  if (amount !== undefined) {
    if (!Number(amount) || Number(amount) <= 0) return res.status(400).json({ message: 'Enter a valid amount' });
    fee.amount = Number(amount);
  }

  const payers = data.users.filter((u) => u.role === 'student' || u.role === 'parent').map((u) => u.id);
  notifyUsers(data, payers, {
    title: 'Fee updated',
    body: `${fee.title} is now NGN ${fee.amount.toLocaleString()} for ${fee.term}, ${fee.session}.`,
    type: 'fee',
    link: '/fees',
  });

  db.write(data);
  res.json(fee);
});

// DELETE /api/payments/fees/:id  – only allowed while nobody has paid it
router.delete('/fees/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const id = Number(req.params.id);
  if (data.payments.some((p) => p.feeId === id)) {
    return res.status(400).json({ message: 'Students have already paid this fee, so it cannot be deleted' });
  }
  data.fees = data.fees.filter((f) => f.id !== id);
  db.write(data);
  res.json({ message: 'Fee removed' });
});

// ---------- Parent ----------

// GET /api/payments/children  – fee status for every child linked to this parent
router.get('/children', requireRole('parent'), (req, res) => {
  const data = db.read();
  const kids = data.users.filter((u) => u.role === 'student' && u.parentId === req.user.id);

  const children = kids.map((s) => {
    const fees = feeStatus(data, s.id);
    const cls = data.classes.find((c) => c.id === s.classId);
    const expected = fees.reduce((sum, f) => sum + f.amount, 0);
    const paid = fees.reduce((sum, f) => sum + f.paid, 0);
    return {
      id: s.id, name: s.name, schoolId: s.schoolId, className: cls ? cls.name : 'Unassigned',
      fees, totals: { expected, paid, balance: expected - paid },
    };
  });

  const payments = data.payments
    .filter((p) => kids.some((k) => k.id === p.studentId))
    .map((p) => describe(data, p))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ settings: data.settings, children, payments });
});

// POST /api/payments/pay-child  { studentId, feeId, amount, method, cardNumber }
// A parent pays a fee for one of their own children. Same demo-only payment as /pay.
router.post('/pay-child', requireRole('parent'), (req, res) => {
  const { studentId, feeId, amount, method, cardNumber } = req.body;
  const data = db.read();
  const child = data.users.find((u) => u.id === Number(studentId) && u.role === 'student' && u.parentId === req.user.id);
  if (!child) return res.status(403).json({ message: 'That is not one of your children' });

  if (!['Card', 'Bank transfer', 'USSD'].includes(method)) {
    return res.status(400).json({ message: 'Choose a payment method' });
  }
  if (method === 'Card' && String(cardNumber || '').replace(/\s/g, '').length < 13) {
    return res.status(400).json({ message: 'Enter a valid card number' });
  }

  const result = createPayment(data, child.id, feeId, amount, method);
  if (result.error) return res.status(400).json({ message: result.error });

  const receipt = describe(data, result.payment);
  const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
  notifyUsers(data, admins, {
    title: 'Payment received',
    body: `${receipt.studentName} paid NGN ${result.payment.amount.toLocaleString()} for ${receipt.feeTitle} (paid by parent).`,
    type: 'payment',
    link: '/fees',
  });
  notifyUsers(data, [child.id], {
    title: 'Fee payment received',
    body: `NGN ${result.payment.amount.toLocaleString()} was paid towards your ${receipt.feeTitle} by your parent.`,
    type: 'payment',
    link: '/fees',
  });

  db.write(data);
  res.status(201).json(receipt);
});

// ---------- Student ----------

// GET /api/payments/my  – what I owe and what I have paid
router.get('/my', requireRole('student'), (req, res) => {
  const data = db.read();
  const fees = feeStatus(data, req.user.id);
  const payments = data.payments
    .filter((p) => p.studentId === req.user.id)
    .map((p) => describe(data, p))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const expected = fees.reduce((sum, f) => sum + f.amount, 0);
  const paid = fees.reduce((sum, f) => sum + f.paid, 0);
  res.json({
    settings: data.settings,
    fees,
    payments,
    totals: { expected, paid, balance: expected - paid },
  });
});

// POST /api/payments/pay  { feeId, amount, method, cardNumber }
// DEMO ONLY: no real money moves. To accept real payments, connect a payment
// gateway (Paystack, Flutterwave, Stripe...) and only create the payment record
// after the gateway confirms the transaction.
router.post('/pay', requireRole('student'), (req, res) => {
  const { feeId, amount, method, cardNumber } = req.body;
  if (!['Card', 'Bank transfer', 'USSD'].includes(method)) {
    return res.status(400).json({ message: 'Choose a payment method' });
  }
  if (method === 'Card' && String(cardNumber || '').replace(/\s/g, '').length < 13) {
    return res.status(400).json({ message: 'Enter a valid card number' });
  }

  const data = db.read();
  const result = createPayment(data, req.user.id, feeId, amount, method);
  if (result.error) return res.status(400).json({ message: result.error });

  const receipt = describe(data, result.payment);
  const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
  notifyUsers(data, admins, {
    title: 'Payment received',
    body: `${receipt.studentName} paid NGN ${result.payment.amount.toLocaleString()} for ${receipt.feeTitle}.`,
    type: 'payment',
    link: '/fees',
  });

  db.write(data);
  res.status(201).json(receipt);
});

// ---------- Admin ----------

// GET /api/payments?classId=1&search=chi  – every payment made
router.get('/', requireRole('admin'), (req, res) => {
  const data = db.read();
  const { classId, search } = req.query;
  let list = data.payments.map((p) => describe(data, p));

  if (classId) {
    const ids = data.users.filter((u) => u.classId === Number(classId)).map((u) => u.id);
    list = list.filter((p) => ids.includes(p.studentId));
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (p) => p.studentName.toLowerCase().includes(q) || p.schoolId.toLowerCase().includes(q) || p.receiptNo.toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(list);
});

// GET /api/payments/summary  – totals and a balance for every student
router.get('/summary', requireRole('admin'), (req, res) => {
  const data = db.read();
  const students = data.users
    .filter((u) => u.role === 'student')
    .map((s) => {
      const fees = feeStatus(data, s.id);
      const expected = fees.reduce((sum, f) => sum + f.amount, 0);
      const paid = fees.reduce((sum, f) => sum + f.paid, 0);
      const cls = data.classes.find((c) => c.id === s.classId);
      return {
        id: s.id, name: s.name, schoolId: s.schoolId, classId: s.classId,
        className: cls ? cls.name : '', expected, paid, balance: expected - paid,
        status: expected - paid === 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid',
        fees,
      };
    });

  const expected = students.reduce((sum, s) => sum + s.expected, 0);
  const collected = students.reduce((sum, s) => sum + s.paid, 0);
  res.json({
    settings: data.settings,
    totals: { expected, collected, outstanding: expected - collected },
    students,
  });
});

// POST /api/payments/record  { studentId, feeId, amount, method }
// For fees paid at the bank or school office – admin records them by hand
router.post('/record', requireRole('admin'), (req, res) => {
  const { studentId, feeId, amount, method } = req.body;
  const data = db.read();
  if (!data.users.some((u) => u.id === Number(studentId) && u.role === 'student')) {
    return res.status(400).json({ message: 'Choose a student' });
  }
  const result = createPayment(data, Number(studentId), feeId, amount, method || 'Bank transfer');
  if (result.error) return res.status(400).json({ message: result.error });

  const receipt = describe(data, result.payment);
  notifyUsers(data, [Number(studentId)], {
    title: 'Fee payment recorded',
    body: `NGN ${result.payment.amount.toLocaleString()} was recorded towards your ${receipt.feeTitle}.`,
    type: 'payment',
    link: '/fees',
  });

  db.write(data);
  res.status(201).json(receipt);
});

// ---------- Receipt (PDF) ----------

// GET /api/payments/:id/receipt  – students can only download their own receipts
router.get('/:id/receipt', (req, res) => {
  const data = db.read();
  const payment = data.payments.find((p) => p.id === Number(req.params.id));
  if (!payment) return res.status(404).json({ message: 'Receipt not found' });
  if (req.user.role === 'student' && payment.studentId !== req.user.id) {
    return res.status(403).json({ message: 'You can only download your own receipts' });
  }
  if (req.user.role === 'parent') {
    const child = data.users.find((u) => u.id === payment.studentId && u.parentId === req.user.id);
    if (!child) return res.status(403).json({ message: 'You can only download receipts for your own children' });
  }
  if (req.user.role === 'teacher') {
    return res.status(403).json({ message: 'You do not have access to this' });
  }

  const p = describe(data, payment);
  const fee = data.fees.find((f) => f.id === payment.feeId);
  const paidSoFar = data.payments
    .filter((x) => x.studentId === payment.studentId && x.feeId === payment.feeId && x.id <= payment.id)
    .reduce((sum, x) => sum + x.amount, 0);
  const balance = fee ? Math.max(fee.amount - paidSoFar, 0) : 0;
  const school = data.settings;

  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${p.receiptNo}.pdf"`);
  doc.pipe(res);

  const width = doc.page.width - 72;

  // Header band
  doc.rect(0, 0, doc.page.width, 92).fill('#7A1440');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(19).text(school.schoolName, 36, 26);
  doc.fillColor('#FF8FC4').font('Helvetica-Oblique').fontSize(9).text(school.motto, 36, 51);
  doc.fillColor('#F5C8DC').font('Helvetica').fontSize(8.5).text(`${school.address}  |  ${school.phone}`, 36, 67);

  // Title
  doc.fillColor('#3A1120').font('Helvetica-Bold').fontSize(15).text('Payment receipt', 36, 112);
  doc.fillColor('#7A4A5E').font('Helvetica').fontSize(9).text(`Receipt no. ${p.receiptNo}`, 36, 133);

  // Detail rows
  const rows = [
    ['Student', p.studentName],
    ['School ID', p.schoolId],
    ['Class', p.className],
    ['Payment for', `${p.feeTitle} (${p.term}, ${p.session})`],
    ['Method', p.method],
    ['Reference', p.reference],
    ['Date', new Date(p.date).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })],
  ];
  let y = 160;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(10);
    const height = Math.max(22, doc.heightOfString(String(value), { width: width - 110 }) + 10);
    doc.font('Helvetica').fontSize(9).fillColor('#A97E91').text(label, 36, y + 2, { width: 100 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#3A1120').text(String(value), 146, y + 1, { width: width - 110 });
    y += height;
    doc.moveTo(36, y - 4).lineTo(36 + width, y - 4).lineWidth(0.5).strokeColor('#F6D9E6').stroke();
  });

  // Amount box
  doc.roundedRect(36, y + 10, width, 64, 6).fill('#FDE3EE');
  doc.fillColor('#B8245A').font('Helvetica').fontSize(9).text('Amount paid', 52, y + 22);
  doc.font('Helvetica-Bold').fontSize(21).text(money(p.amount), 52, y + 37);
  doc.fillColor('#7A4A5E').font('Helvetica').fontSize(9)
    .text(`Balance on this fee: ${money(balance)}`, 36, y + 86);

  // Footer
  doc.fillColor('#A97E91').font('Helvetica').fontSize(8)
    .text('Computer-generated receipt. Valid without a signature.', 36, doc.page.height - 66, { width, align: 'center' });

  doc.end();
});

module.exports = router;
