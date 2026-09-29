const express = require('express');
const PDFDocument = require('pdfkit');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSettings } = require('../utils/mysqlRecords');

const router = express.Router();
router.use(requireAuth);

const CURRENCY = 'NGN';
const money = (amount) => `${CURRENCY} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

async function feeStatus(studentId, executor = pool) {
  const settings = await getSettings(executor);
  if (!settings) return [];
  const [rows] = await executor.execute(
    'SELECT f.id, f.title, f.amount, f.term, f.session, COALESCE(SUM(CASE WHEN p.status = ? THEN p.amount ELSE 0 END), 0) AS paid FROM fees f LEFT JOIN payments p ON p.fee_id = f.id AND p.student_id = ? WHERE f.term = ? AND f.session = ? GROUP BY f.id, f.title, f.amount, f.term, f.session ORDER BY f.id',
    ['success', studentId, settings.term, settings.session]
  );
  return rows.map((row) => {
    const amount = Number(row.amount);
    const paid = Number(row.paid);
    const balance = Math.max(amount - paid, 0);
    return {
      id: Number(row.id), title: row.title, amount, term: row.term, session: row.session,
      paid, balance, status: balance === 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid',
    };
  });
}

async function paymentView(paymentId, executor = pool) {
  const [rows] = await executor.execute(
    'SELECT p.*, u.name AS student_name, u.school_id, c.name AS class_name, f.title AS fee_title FROM payments p LEFT JOIN users u ON u.id = p.student_id LEFT JOIN classes c ON c.id = u.class_id LEFT JOIN fees f ON f.id = p.fee_id WHERE p.id = ? LIMIT 1',
    [paymentId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id), studentId: Number(row.student_id), feeId: Number(row.fee_id), amount: Number(row.amount),
    method: row.method, status: row.status, reference: row.reference, receiptNo: row.receipt_no || '',
    term: row.term, session: row.session, date: row.date,
    studentName: row.student_name || 'Removed student', schoolId: row.school_id || '',
    className: row.class_name || '', feeTitle: row.fee_title || 'Fee',
  };
}

async function notifyRole(executor, role, title, body, type = 'payment', link = '/fees') {
  await executor.execute(
    'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ?',
    [title, body, type, link, role]
  );
}

async function notifyUser(executor, userId, title, body, type = 'payment', link = '/fees') {
  await executor.execute('INSERT INTO notifications (user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?)', [userId, title, body, type, link]);
}

async function createPayment(executor, studentId, feeId, amount, method, options = {}) {
  const [feeRows] = await executor.execute('SELECT id, title, amount, term, session FROM fees WHERE id = ?', [Number(feeId)]);
  const fee = feeRows[0];
  if (!fee) return { error: 'Choose a fee to pay' };
  const currentFees = await feeStatus(studentId, executor);
  const feeRow = currentFees.find((item) => item.id === Number(fee.id));
  if (!feeRow) return { error: 'That fee does not belong to the current term' };
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return { error: 'Enter a valid amount' };
  if (numericAmount > feeRow.balance) {
    return { error: `The balance on this fee is ${feeRow.balance.toLocaleString()}. You cannot pay more than that.` };
  }

  const status = options.status || 'success';
  const reference = options.reference || `CVC-${Date.now().toString(36).toUpperCase()}`;
  const [result] = await executor.execute(
    'INSERT INTO payments (student_id, fee_id, amount, method, status, reference, receipt_no, term, session) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
    [studentId, Number(fee.id), numericAmount, method, status, reference, fee.term, fee.session]
  );
  if (status === 'success') {
    const receiptNo = `RCT-${String(result.insertId).padStart(5, '0')}`;
    await executor.execute('UPDATE payments SET receipt_no = ? WHERE id = ?', [receiptNo, result.insertId]);
  }
  return { payment: await paymentView(Number(result.insertId), executor) };
}

async function paystackRequest(endpoint, options = {}) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('Paystack is not configured on the server');
  const response = await fetch(`https://api.paystack.co${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status) throw new Error(body.message || 'Paystack request failed');
  return body.data;
}

async function getParentChild(parentId, studentId, executor = pool) {
  const [rows] = await executor.execute('SELECT id, name, email, phone FROM users WHERE id = ? AND parent_id = ? AND role = ?', [Number(studentId), parentId, 'student']);
  return rows[0] || null;
}

async function notifyPayment(executor, payment, child, prefix = 'Payment received') {
  await notifyRole(executor, 'admin', prefix, `${payment.studentName}: NGN ${payment.amount.toLocaleString()} for ${payment.feeTitle}.`);
  if (child) await notifyUser(executor, child.id, 'Fee payment received', `NGN ${payment.amount.toLocaleString()} was paid towards your ${payment.feeTitle}.`);
  return payment;
}

router.get('/fees', async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    if (!settings) return res.json([]);
    const [rows] = await pool.execute('SELECT id, title, amount, term, session FROM fees WHERE session = ? AND term = ? ORDER BY id', [settings.session, settings.term]);
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), amount: Number(row.amount) })));
  } catch (err) {
    next(err);
  }
});

router.post('/fees', requireRole('admin'), async (req, res, next) => {
  const { title, amount } = req.body;
  if (!title || !Number(amount) || Number(amount) <= 0) return res.status(400).json({ message: 'Enter a fee name and an amount' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const settings = await getSettings(connection);
    if (!settings) {
      await connection.rollback();
      return res.status(503).json({ message: 'School term settings have not been configured' });
    }
    const [result] = await connection.execute('INSERT INTO fees (title, amount, term, session) VALUES (?, ?, ?, ?)', [title.trim(), Number(amount), settings.term, settings.session]);
    await connection.execute(
      'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role IN (?, ?)',
      ['New fee added', `${title.trim()}: NGN ${Number(amount).toLocaleString()} for ${settings.term}, ${settings.session}.`, 'fee', '/fees', 'student', 'parent']
    );
    await connection.commit();
    res.status(201).json({ id: Number(result.insertId), title: title.trim(), amount: Number(amount), term: settings.term, session: settings.session });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.put('/fees/:id', requireRole('admin'), async (req, res, next) => {
  const { title, amount } = req.body;
  try {
    const [rows] = await pool.execute('SELECT * FROM fees WHERE id = ?', [Number(req.params.id)]);
    const fee = rows[0];
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ message: 'Enter a fee name' });
    if (amount !== undefined && (!Number(amount) || Number(amount) <= 0)) return res.status(400).json({ message: 'Enter a valid amount' });
    await pool.execute('UPDATE fees SET title = ?, amount = ? WHERE id = ?', [title === undefined ? fee.title : title.trim(), amount === undefined ? Number(fee.amount) : Number(amount), fee.id]);
    await pool.execute(
      'INSERT INTO notifications (user_id, title, body, type, link) SELECT id, ?, ?, ?, ? FROM users WHERE role IN (?, ?)',
      ['Fee updated', `${title === undefined ? fee.title : title.trim()} is now NGN ${Number(amount === undefined ? fee.amount : amount).toLocaleString()} for ${fee.term}, ${fee.session}.`, 'fee', '/fees', 'student', 'parent']
    );
    const [updated] = await pool.execute('SELECT id, title, amount, term, session FROM fees WHERE id = ?', [fee.id]);
    res.json({ ...updated[0], id: Number(updated[0].id), amount: Number(updated[0].amount) });
  } catch (err) {
    next(err);
  }
});

router.delete('/fees/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const feeId = Number(req.params.id);
    const [payments] = await pool.execute('SELECT 1 FROM payments WHERE fee_id = ? LIMIT 1', [feeId]);
    if (payments.length) return res.status(400).json({ message: 'Students have already paid this fee, so it cannot be deleted' });
    const [result] = await pool.execute('DELETE FROM fees WHERE id = ?', [feeId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Fee not found' });
    res.json({ message: 'Fee removed' });
  } catch (err) {
    next(err);
  }
});

router.get('/children', requireRole('parent'), async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const [kids] = await pool.execute('SELECT s.id, s.name, s.school_id, s.class_id, c.name AS class_name FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.role = ? AND s.parent_id = ? ORDER BY s.name', ['student', req.user.id]);
    const children = await Promise.all(kids.map(async (kid) => {
      const fees = await feeStatus(Number(kid.id));
      const expected = fees.reduce((sum, fee) => sum + fee.amount, 0);
      const paid = fees.reduce((sum, fee) => sum + fee.paid, 0);
      return {
        id: Number(kid.id), name: kid.name, schoolId: kid.school_id, className: kid.class_name || 'Unassigned',
        fees, totals: { expected, paid, balance: expected - paid },
      };
    }));
    const [payments] = await pool.execute(
      'SELECT p.id FROM payments p JOIN users s ON s.id = p.student_id WHERE s.parent_id = ? ORDER BY p.date DESC',
      [req.user.id]
    );
    const paymentViews = await Promise.all(payments.map((row) => paymentView(Number(row.id))));
    res.json({
      settings, children, payments: paymentViews,
      paymentOptions: {
        paystackConfigured: Boolean(process.env.PAYSTACK_PUBLIC_KEY && process.env.PAYSTACK_SECRET_KEY),
        bank: { name: process.env.SCHOOL_BANK_NAME || '', accountName: process.env.SCHOOL_BANK_ACCOUNT_NAME || '', accountNumber: process.env.SCHOOL_BANK_ACCOUNT_NUMBER || '', code: process.env.SCHOOL_BANK_CODE || '' },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/paystack/initialize', requireRole('parent'), async (req, res) => {
  const { studentId, feeId, amount, callbackUrl } = req.body;
  try {
    const child = await getParentChild(req.user.id, studentId);
    if (!child) return res.status(403).json({ message: 'That is not one of your children' });
    const status = (await feeStatus(Number(child.id))).find((fee) => fee.id === Number(feeId));
    const numericAmount = Number(amount);
    if (!status || !numericAmount || numericAmount <= 0 || numericAmount > status.balance) return res.status(400).json({ message: 'Enter a valid amount for this fee' });
    const [parents] = await pool.execute('SELECT email FROM users WHERE id = ?', [req.user.id]);
    const transaction = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: parents[0]?.email,
        amount: Math.round(numericAmount * 100),
        currency: 'NGN', callback_url: callbackUrl,
        metadata: { studentId: Number(child.id), feeId: Number(feeId), parentId: Number(req.user.id) },
      }),
    });
    res.json({ authorizationUrl: transaction.authorization_url, reference: transaction.reference });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
});

router.get('/paystack/verify/:reference', requireRole('parent'), async (req, res) => {
  let connection;
  try {
    const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(req.params.reference)}`);
    if (transaction.status !== 'success') return res.status(400).json({ message: 'Paystack has not confirmed this payment' });
    const metadata = transaction.metadata || {};
    const child = await getParentChild(req.user.id, metadata.studentId);
    if (!child || Number(metadata.parentId) !== Number(req.user.id)) return res.status(403).json({ message: 'Payment ownership could not be verified' });
    const [existingRows] = await pool.execute('SELECT id FROM payments WHERE reference = ?', [transaction.reference]);
    if (existingRows.length) return res.json(await paymentView(Number(existingRows[0].id)));

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await createPayment(connection, Number(child.id), metadata.feeId, Number(transaction.amount) / 100, 'Paystack', { reference: transaction.reference });
    if (result.error) {
      await connection.rollback();
      return res.status(400).json({ message: result.error });
    }
    await notifyPayment(connection, result.payment, child);
    await connection.commit();
    res.status(201).json(result.payment);
  } catch (err) {
    if (connection) await connection.rollback();
    res.status(502).json({ message: err.message });
  } finally {
    connection?.release();
  }
});

router.post('/bank-transfer', requireRole('parent'), async (req, res, next) => {
  const { studentId, feeId, amount, reference } = req.body;
  if (!String(reference || '').trim()) return res.status(400).json({ message: 'Enter your bank transfer reference' });
  let connection;
  try {
    const child = await getParentChild(req.user.id, studentId);
    if (!child) return res.status(403).json({ message: 'That is not one of your children' });
    const [existing] = await pool.execute('SELECT id FROM payments WHERE reference = ?', [String(reference).trim()]);
    if (existing.length) return res.status(409).json({ message: 'That transfer reference has already been submitted' });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await createPayment(connection, Number(child.id), feeId, amount, 'Bank transfer', { status: 'pending', reference: String(reference).trim() });
    if (result.error) {
      await connection.rollback();
      return res.status(400).json({ message: result.error });
    }
    await notifyPayment(connection, result.payment, null, 'Bank transfer awaiting confirmation');
    await connection.commit();
    res.status(201).json({ ...result.payment, status: 'pending' });
  } catch (err) {
    if (connection) await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That transfer reference has already been submitted' });
    next(err);
  } finally {
    connection?.release();
  }
});

router.post('/confirm/:id', requireRole('admin'), async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM payments WHERE id = ? AND status = ? FOR UPDATE', [Number(req.params.id), 'pending']);
    const payment = rows[0];
    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ message: 'Pending payment not found' });
    }
    const feeRows = await feeStatus(Number(payment.student_id), connection);
    const status = feeRows.find((fee) => fee.id === Number(payment.fee_id));
    if (!status || Number(payment.amount) > status.balance) {
      await connection.rollback();
      return res.status(400).json({ message: 'This transfer is larger than the remaining fee balance' });
    }
    const receiptNo = `RCT-${String(payment.id).padStart(5, '0')}`;
    await connection.execute('UPDATE payments SET status = ?, receipt_no = ? WHERE id = ?', ['success', receiptNo, payment.id]);
    const receipt = await paymentView(Number(payment.id), connection);
    const [childRows] = await connection.execute('SELECT id FROM users WHERE id = ?', [payment.student_id]);
    await notifyPayment(connection, receipt, childRows[0] || null);
    await connection.commit();
    res.json(receipt);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

async function directPayment(req, res, next, studentId, feeId, amount, method, byParent = false) {
  if (!['Card', 'Bank transfer', 'USSD'].includes(method)) return res.status(400).json({ message: 'Choose a payment method' });
  if (method === 'Card' && String(req.body.cardNumber || '').replace(/\s/g, '').length < 13) return res.status(400).json({ message: 'Enter a valid card number' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await createPayment(connection, Number(studentId), feeId, amount, method);
    if (result.error) {
      await connection.rollback();
      return res.status(400).json({ message: result.error });
    }
    const message = `${result.payment.studentName} paid NGN ${result.payment.amount.toLocaleString()} for ${result.payment.feeTitle}${byParent ? ' (paid by parent)' : ''}.`;
    await notifyRole(connection, 'admin', 'Payment received', message);
    if (byParent) await notifyUser(connection, Number(studentId), 'Fee payment received', `NGN ${result.payment.amount.toLocaleString()} was paid towards your ${result.payment.feeTitle} by your parent.`);
    await connection.commit();
    res.status(201).json(result.payment);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
}

router.post('/pay-child', requireRole('parent'), async (req, res, next) => {
  const child = await getParentChild(req.user.id, req.body.studentId).catch(next);
  if (!child) return res.status(403).json({ message: 'That is not one of your children' });
  await directPayment(req, res, next, child.id, req.body.feeId, req.body.amount, req.body.method, true);
});

router.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const fees = await feeStatus(req.user.id);
    const [rows] = await pool.execute('SELECT id FROM payments WHERE student_id = ? ORDER BY date DESC', [req.user.id]);
    const payments = await Promise.all(rows.map((row) => paymentView(Number(row.id))));
    const expected = fees.reduce((sum, fee) => sum + fee.amount, 0);
    const paid = fees.reduce((sum, fee) => sum + fee.paid, 0);
    res.json({ settings, fees, payments, totals: { expected, paid, balance: expected - paid } });
  } catch (err) {
    next(err);
  }
});

router.post('/pay', requireRole('student'), async (req, res, next) => {
  await directPayment(req, res, next, req.user.id, req.body.feeId, req.body.amount, req.body.method);
});

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    let query = 'SELECT p.id FROM payments p LEFT JOIN users u ON u.id = p.student_id';
    const clauses = [];
    const values = [];
    if (req.query.classId) {
      clauses.push('u.class_id = ?');
      values.push(Number(req.query.classId));
    }
    if (req.query.search) {
      clauses.push('(LOWER(u.name) LIKE ? OR LOWER(u.school_id) LIKE ? OR LOWER(p.receipt_no) LIKE ?)');
      const search = `%${String(req.query.search).toLowerCase()}%`;
      values.push(search, search, search);
    }
    if (clauses.length) query += ` WHERE ${clauses.join(' AND ')}`;
    query += ' ORDER BY p.date DESC';
    const [rows] = await pool.execute(query, values);
    res.json(await Promise.all(rows.map((row) => paymentView(Number(row.id)))));
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireRole('admin'), async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const [students] = await pool.execute('SELECT s.id, s.name, s.school_id, s.class_id, c.name AS class_name FROM users s LEFT JOIN classes c ON c.id = s.class_id WHERE s.role = ? ORDER BY s.name', ['student']);
    const summaries = await Promise.all(students.map(async (student) => {
      const fees = await feeStatus(Number(student.id));
      const expected = fees.reduce((sum, fee) => sum + fee.amount, 0);
      const paid = fees.reduce((sum, fee) => sum + fee.paid, 0);
      return {
        id: Number(student.id), name: student.name, schoolId: student.school_id,
        classId: student.class_id === null ? null : Number(student.class_id), className: student.class_name || '',
        expected, paid, balance: expected - paid,
        status: expected - paid === 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Unpaid', fees,
      };
    }));
    const expected = summaries.reduce((sum, student) => sum + student.expected, 0);
    const collected = summaries.reduce((sum, student) => sum + student.paid, 0);
    res.json({ settings, totals: { expected, collected, outstanding: expected - collected }, students: summaries });
  } catch (err) {
    next(err);
  }
});

router.post('/record', requireRole('admin'), async (req, res, next) => {
  const { studentId, feeId, amount, method } = req.body;
  let connection;
  try {
    const [students] = await pool.execute('SELECT id FROM users WHERE id = ? AND role = ?', [Number(studentId), 'student']);
    if (!students.length) return res.status(400).json({ message: 'Choose a student' });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await createPayment(connection, Number(studentId), feeId, amount, method || 'Bank transfer');
    if (result.error) {
      await connection.rollback();
      return res.status(400).json({ message: result.error });
    }
    await notifyUser(connection, Number(studentId), 'Fee payment recorded', `NGN ${result.payment.amount.toLocaleString()} was recorded towards your ${result.payment.feeTitle}.`);
    await connection.commit();
    res.status(201).json(result.payment);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.get('/:id/receipt', async (req, res, next) => {
  try {
    const payment = await paymentView(Number(req.params.id));
    if (!payment) return res.status(404).json({ message: 'Receipt not found' });
    if (req.user.role === 'student' && payment.studentId !== Number(req.user.id)) return res.status(403).json({ message: 'You can only download your own receipts' });
    if (req.user.role === 'parent' && !await getParentChild(req.user.id, payment.studentId)) return res.status(403).json({ message: 'You can only download receipts for your own children' });
    if (req.user.role === 'teacher') return res.status(403).json({ message: 'You do not have access to this' });

    const [feeRows] = await pool.execute('SELECT amount FROM fees WHERE id = ?', [payment.feeId]);
    const [paidRows] = await pool.execute('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE student_id = ? AND fee_id = ? AND id <= ?', [payment.studentId, payment.feeId, payment.id]);
    const feeAmount = Number(feeRows[0]?.amount || 0);
    const balance = Math.max(feeAmount - Number(paidRows[0].paid), 0);
    const school = await getSettings(pool) || { schoolName: 'Broad Mind Private School', motto: '', address: '', phone: '' };
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payment.receiptNo || `payment-${payment.id}`}.pdf"`);
    doc.pipe(res);
    const width = doc.page.width - 72;
    doc.rect(0, 0, doc.page.width, 92).fill('#7A1440');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(19).text(school.schoolName, 36, 26);
    doc.fillColor('#FF8FC4').font('Helvetica-Oblique').fontSize(9).text(school.motto || '', 36, 51);
    doc.fillColor('#F5C8DC').font('Helvetica').fontSize(8.5).text(`${school.address || ''}  |  ${school.phone || ''}`, 36, 67);
    doc.fillColor('#3A1120').font('Helvetica-Bold').fontSize(15).text('Payment receipt', 36, 112);
    doc.fillColor('#7A4A5E').font('Helvetica').fontSize(9).text(`Receipt no. ${payment.receiptNo || 'Pending'}`, 36, 133);
    const detailRows = [
      ['Student', payment.studentName], ['School ID', payment.schoolId], ['Class', payment.className],
      ['Payment for', `${payment.feeTitle} (${payment.term}, ${payment.session})`], ['Method', payment.method],
      ['Reference', payment.reference], ['Date', new Date(payment.date).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })],
    ];
    let y = 160;
    detailRows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(10);
      const height = Math.max(22, doc.heightOfString(String(value || ''), { width: width - 110 }) + 10);
      doc.font('Helvetica').fontSize(9).fillColor('#A97E91').text(label, 36, y + 2, { width: 100 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#3A1120').text(String(value || ''), 146, y + 1, { width: width - 110 });
      y += height;
      doc.moveTo(36, y - 4).lineTo(36 + width, y - 4).lineWidth(0.5).strokeColor('#F6D9E6').stroke();
    });
    doc.roundedRect(36, y + 10, width, 64, 6).fill('#FDE3EE');
    doc.fillColor('#B8245A').font('Helvetica').fontSize(9).text('Amount paid', 52, y + 22);
    doc.font('Helvetica-Bold').fontSize(21).text(money(payment.amount), 52, y + 37);
    doc.fillColor('#7A4A5E').font('Helvetica').fontSize(9).text(`Balance on this fee: ${money(balance)}`, 36, y + 86);
    doc.fillColor('#A97E91').font('Helvetica').fontSize(8).text('Computer-generated receipt. Valid without a signature.', 36, doc.page.height - 66, { width, align: 'center' });
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;