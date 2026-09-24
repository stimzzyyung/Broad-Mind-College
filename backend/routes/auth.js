const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../data/db');
const { SECRET, requireAuth } = require('../middleware/auth');
const { safeUser } = require('../utils/helpers');

const router = express.Router();

// POST /api/auth/login   { identifier, password, role }
// "identifier" can be the school ID (e.g. CVC/26/001) or an email address
router.post('/login', (req, res) => {
  const { identifier, password, role } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Enter your ID or email and your password' });
  }

  const data = db.read();
  const id = identifier.trim().toLowerCase();
  const user = data.users.find(
    (u) => (u.email || '').toLowerCase() === id || (u.schoolId || '').toLowerCase() === id
  );

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Wrong ID/email or password' });
  }
  if (role && user.role !== role) {
    return res.status(403).json({ message: `This is not a ${role} account. Pick the correct portal above.` });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ message: 'This account has been suspended. Contact the school office.' });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '8h' });
  res.json({ token, user: safeUser(user), settings: data.settings });
});

// POST /api/auth/register  – a parent creates their own account (public, no login needed yet)
router.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Fill in your name, email and a password' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Your password must be at least 6 characters' });
  }

  const data = db.read();
  if (data.users.some((u) => (u.email || '').toLowerCase() === email.trim().toLowerCase())) {
    return res.status(409).json({ message: 'An account with that email already exists. Try signing in instead.' });
  }

  const parent = {
    id: db.nextId(data.users),
    role: 'parent',
    name: name.trim(),
    email: email.trim(),
    phone: phone || '',
    password: bcrypt.hashSync(password, 8),
    address: '',
    bio: '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  data.users.push(parent);
  db.write(data);

  const token = jwt.sign({ id: parent.id, role: parent.role, name: parent.name }, SECRET, { expiresIn: '8h' });
  res.status(201).json({ token, user: safeUser(parent), settings: data.settings });
});

// GET /api/auth/me  – used when the page is refreshed, to restore the session
router.get('/me', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(401).json({ message: 'Account not found' });
  res.json({ user: safeUser(user), settings: data.settings });
});

// POST /api/auth/change-password   { currentPassword, newPassword }
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }
  const data = db.read();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ message: 'Your current password is not correct' });
  }
  user.password = bcrypt.hashSync(newPassword, 8);
  db.write(data);
  res.json({ message: 'Password changed' });
});

module.exports = router;
