const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../data/mysql');
const { SECRET, requireAuth } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');
const { userFromRow, getSettings, getPortalConfig } = require('../utils/mysqlRecords');

const router = express.Router();

router.get('/settings', async (req, res, next) => {
  try {
    const settings = (await getSettings(pool)) || {
      schoolName: 'Broad-Mind College',
      motto: 'Knowledge with character',
      session: '2026/2027',
      term: 'First Term',
    };
    const emailDomain = (await getPortalConfig(pool, 'email_domain')) || 'broadmindcollege.edu';
    res.json({ ...settings, emailDomain });
  } catch (err) {
    next(err);
  }
});


// POST /api/auth/login   { identifier, password, role }
// "identifier" can be the school ID (e.g. CVC/26/001) or an email address
router.post('/login', async (req, res, next) => {
  const { identifier, password, role } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Enter your ID or email and your password' });
  }

  const id = identifier.trim().toLowerCase();
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(school_id) = ? LIMIT 1',
      [id, id]
    );
    const user = userFromRow(rows[0]);

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Wrong ID/email or password' });
    }
    if (role && user.role !== role) {
      return res.status(403).json({ message: `This is not a ${role} account. Pick the correct portal above.` });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'This account has been suspended. Contact the school office.' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '8h' });
    res.json({ token, user: safeUser(user), settings: await getSettings(pool) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register  – a parent creates their own account (public, no login needed yet)
router.post('/register', async (req, res, next) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Fill in your name, email and a password' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Your password must be at least 6 characters' });
  }

  try {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email.trim()]);
    if (existing.length) {
      return res.status(409).json({ message: 'An account with that email already exists. Try signing in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 8);
    const [result] = await pool.execute(
      'INSERT INTO users (role, name, email, phone, password, address, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['parent', name.trim(), email.trim(), phone || '', passwordHash, '', '', 'active']
    );
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const parent = userFromRow(rows[0]);
    const token = jwt.sign({ id: parent.id, role: parent.role, name: parent.name }, SECRET, { expiresIn: '8h' });
    res.status(201).json({ token, user: safeUser(parent), settings: await getSettings(pool) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with that email already exists. Try signing in instead.' });
    }
    next(err);
  }
});

// GET /api/auth/me  – used when the page is refreshed, to restore the session
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const user = userFromRow(rows[0]);
    if (!user) return res.status(401).json({ message: 'Account not found' });
    res.json({ user: safeUser(user), settings: await getSettings(pool) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password   { currentPassword, newPassword }
router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }
  try {
    const [rows] = await pool.execute('SELECT id, password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Account not found' });
    if (!await bcrypt.compare(currentPassword, rows[0].password)) {
      return res.status(400).json({ message: 'Your current password is not correct' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 8);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
