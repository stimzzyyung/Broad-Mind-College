const express = require('express');
const { randomUUID } = require('crypto');
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
function createPayment(data, studentId, feeId, amount, method, options = {}) {
  const fee = data.fees.find((f) => f.id === Number(feeId));
  if (!fee) return { error: 'Choose a fee to pay' };

  const feeStatusRow = feeStatus(data, studentId).find((f) => f.id === fee.id);
  if (!feeStatusRow) return { error: 'That fee does not belong to the current term' };

  const amt = Number(amount);
  if (!amt || amt <= 0) return { error: 'Enter a valid amount' };
  if (amt > feeStatusRow.balance) {
    return { error: `The balance on this fee is ${feeStatusRow.balance.toLocaleString()}. You cannot pay more than that.` };
  }

  const id = db.nextId(data.payments);
  const status = options.status || 'success';
  const payment = {
    id,
    studentId,
    feeId: fee.id,
    amount: amt,
    method,
    status,
    reference: options.reference || `BMS-${Date.now().toString(36).toUpperCase()}`,
    receiptNo: status === 'success' ? `RCT-${String(id).padStart(5, '0')}` : '',
    term: fee.term,
    session: fee.session,
    date: new Date().toISOString(),
  };
  data.payments.push(payment);
  return { payment };
}

async function korapayRequest(path, options = {}) {
  if (!process.env.KORAPAY_SECRET_KEY) throw new Error('Korapay is not configured on the server');
  const response = await fetch(`https://api.korapay.com/merchant/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || !body.status) {
    throw new Error(body.message || `Korapay request failed with status ${response.status}`);
  }
  return body.data;
}

function parentChild(data, parentId, studentId) {
  return data.users.find((u) => u.id === Number(studentId) && u.role === 'student' && u.parentId === parentId);
}

function notifyPayment(data, payment, child, prefix = 'Payment received') {
  const receipt = describe(data, payment);
  const admins = data.users.filter((u) => u.role === 'admin').map((u) => u.id);
  notifyUsers(data, admins, {
    title: prefix,
    body: `${receipt.studentName}: NGN ${payment.amount.toLocaleString()} for ${receipt.feeTitle}.`,
    type: 'payment',
    link: '/fees',
  });
  if (child) notifyUsers(data, [child.id], {
    title: 'Fee payment received',
    body: `NGN ${payment.amount.toLocaleString()} was paid towards your ${receipt.feeTitle}.`,
    type: 'payment',
    link: '/fees',
  });
  return receipt;
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

  res.json({ settings: data.settings, children, payments, paymentOptions: {
    korapayConfigured: Boolean(process.env.KORAPAY_SECRET_KEY),
    bank: {
      name: process.env.SCHOOL_BANK_NAME || '',
      accountName: process.env.SCHOOL_BANK_ACCOUNT_NAME || '',
      accountNumber: process.env.SCHOOL_BANK_ACCOUNT_NUMBER || '',
      code: process.env.SCHOOL_BANK_CODE || '',
    },
  } });
});

// POST /api/payments/korapay/initialize { studentId, feeId, amount }
router.post('/korapay/initialize', requireRole('parent', 'student'), async (req, res) => {
  const { studentId, feeId, amount } = req.body;
  const data = db.read();
  const targetStudentId = studentId ?? req.user.id;
  const student = req.user.role === 'parent'
    ? parentChild(data, req.user.id, targetStudentId)
    : data.users.find((user) => user.id === req.user.id && user.role === 'student');
  if (!student || (req.user.role === 'student' && Number(targetStudentId) !== student.id)) {
    return res.status(403).json({ message: 'You cannot pay fees for this student' });
  }
  const fee = data.fees.find((item) => item.id === Number(feeId));
  const status = fee && feeStatus(data, student.id).find((item) => item.id === fee.id);
  const amt = Number(amount);
  if (!status || !amt || amt <= 0 || amt > status.balance) return res.status(400).json({ message: 'Enter a valid amount for this fee' });
  const payer = data.users.find((u) => u.id === req.user.id);
  const payerEmail = String(payer.email || req.body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address for your payment receipt' });
  }

  try {
    const reference = `BMS-${randomUUID()}`;
    const portal = req.user.role === 'parent' ? 'parent' : 'student';
    const redirectUrl = new URL(`/${portal}/fees`, process.env.CLIENT_URL || 'http://localhost:5173');
    const transaction = await korapayRequest('/charges/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: Math.round(amt),
        currency: 'NGN',
        reference,
        redirect_url: redirectUrl.toString(),
        narration: `${fee.title} for ${student.name} - Broad-Mind College`,
        customer: { name: payer.name, email: payerEmail },
        metadata: {
          studentId: String(student.id),
          feeId: String(fee.id),
          payerId: String(req.user.id),
          expectedAmount: String(Math.round(amt)),
        },
      }),
    });
    if (!transaction.checkout_url || !transaction.reference) {
      throw new Error('Korapay did not return a checkout URL and reference');
    }
    res.json({ checkoutUrl: transaction.checkout_url, reference: transaction.reference });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

// GET /api/payments/korapay/verify/:reference
router.get('/korapay/verify/:reference', requireRole('parent', 'student'), async (req, res) => {
  try {
    const transaction = await korapayRequest(`/charges/${encodeURIComponent(req.params.reference)}`);
    if (
      transaction.status !== 'success' ||
      (transaction.transaction_status && transaction.transaction_status !== 'success')
    ) {
      return res.status(400).json({ message: 'Korapay has not confirmed this payment' });
    }
    if (transaction.currency !== 'NGN') {
      return res.status(400).json({ message: 'The confirmed payment currency is not NGN' });
    }
    const metadata = transaction.metadata || {};
    const data = db.read();
    const student = req.user.role === 'parent'
      ? parentChild(data, req.user.id, Number(metadata.studentId))
      : data.users.find((user) =>
        user.id === req.user.id &&
        user.role === 'student' &&
        user.id === Number(metadata.studentId)
      );
    const fee = data.fees.find((item) => item.id === Number(metadata.feeId));
    if (!student || Number(metadata.payerId) !== req.user.id || !fee) {
      return res.status(403).json({ message: 'Payment ownership could not be verified' });
    }
    const paidAmount = Number(transaction.amount);
    if (
      !Number.isFinite(paidAmount) ||
      paidAmount <= 0 ||
      paidAmount !== Number(metadata.expectedAmount) ||
      (transaction.amount_expected !== undefined && paidAmount !== Number(transaction.amount_expected))
    ) {
      return res.status(400).json({ message: 'Korapay has not confirmed the expected payment amount' });
    }
    const paymentReference = transaction.payment_reference || transaction.reference;
    if (paymentReference !== req.params.reference) {
      return res.status(400).json({ message: 'The transaction reference could not be verified' });
    }
    const existing = data.payments.find((payment) => payment.reference === paymentReference);
    if (existing) return res.json(describe(data, existing));

    const result = createPayment(data, student.id, fee.id, paidAmount, 'Korapay', { reference: paymentReference });
    if (result.error) return res.status(400).json({ message: result.error });
    const receipt = notifyPayment(data, result.payment, student);
    db.write(data);
    res.status(201).json(receipt);
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

// POST /api/payments/bank-transfer { studentId, feeId, amount, reference }
router.post('/bank-transfer', requireRole('parent'), (req, res) => {
  const { studentId, feeId, amount, reference } = req.body;
  const data = db.read();
  const child = parentChild(data, req.user.id, studentId);
  if (!child) return res.status(403).json({ message: 'That is not one of your children' });
  const status = feeStatus(data, child.id).find((item) => item.id === Number(feeId));
  const amt = Number(amount);
  if (!status || !amt || amt <= 0 || amt > status.balance) return res.status(400).json({ message: 'Enter a valid amount for this fee' });
  if (!String(reference || '').trim()) return res.status(400).json({ message: 'Enter your bank transfer reference' });
  if (data.payments.some((payment) => payment.reference === String(reference).trim())) {
    return res.status(409).json({ message: 'That transfer reference has already been submitted' });
  }

  const result = createPayment(data, child.id, feeId, amt, 'Bank transfer', { status: 'pending', reference: String(reference).trim() });
  if (result.error) return res.status(400).json({ message: result.error });
  const receipt = notifyPayment(data, result.payment, null, 'Bank transfer awaiting confirmation');
  db.write(data);
  res.status(201).json({ ...receipt, status: 'pending' });
});

// POST /api/payments/confirm/:id – admin confirms a bank transfer
router.post('/confirm/:id', requireRole('admin'), (req, res) => {
  const data = db.read();
  const payment = data.payments.find((item) => item.id === Number(req.params.id) && item.status === 'pending');
  if (!payment) return res.status(404).json({ message: 'Pending payment not found' });
  const currentStatus = feeStatus(data, payment.studentId).find((item) => item.id === payment.feeId);
  if (!currentStatus || payment.amount > currentStatus.balance) {
    return res.status(400).json({ message: 'This transfer is larger than the remaining fee balance' });
  }
  payment.status = 'success';
  payment.receiptNo = `RCT-${String(payment.id).padStart(5, '0')}`;
  const child = data.users.find((user) => user.id === payment.studentId);
  const receipt = notifyPayment(data, payment, child);
  db.write(data);
  res.json(receipt);
});

// Retired demo endpoint. Use Korapay checkout or the confirmed bank-transfer flow.
router.post('/pay-child', requireRole('parent'), (req, res) => {
  res.status(410).json({ message: 'Direct demo payments are disabled. Use Korapay checkout or bank transfer.' });
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
    paymentOptions: { korapayConfigured: Boolean(process.env.KORAPAY_SECRET_KEY) },
    totals: { expected, paid, balance: expected - paid },
  });
});

// Retired demo endpoint. Payments must be verified by Korapay or confirmed as bank transfers.
router.post('/pay', requireRole('student'), (req, res) => {
  res.status(410).json({ message: 'Direct demo payments are disabled. Use Korapay checkout.' });
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
