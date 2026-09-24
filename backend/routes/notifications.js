const express = require('express');
const db = require('../data/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications  – mine, newest first, most recent 50
router.get('/', (req, res) => {
  const data = db.read();
  const list = (data.notifications || [])
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json(list);
});

// GET /api/notifications/unread-count  – for the bell badge, polled every so often
router.get('/unread-count', (req, res) => {
  const data = db.read();
  const count = (data.notifications || []).filter((n) => n.userId === req.user.id && !n.read).length;
  res.json({ count });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  const data = db.read();
  (data.notifications || []).forEach((n) => {
    if (n.userId === req.user.id) n.read = true;
  });
  db.write(data);
  res.json({ message: 'All notifications marked as read' });
});

// POST /api/notifications/:id/read
router.post('/:id/read', (req, res) => {
  const data = db.read();
  const n = (data.notifications || []).find((x) => x.id === Number(req.params.id) && x.userId === req.user.id);
  if (!n) return res.status(404).json({ message: 'Notification not found' });
  n.read = true;
  db.write(data);
  res.json(n);
});

module.exports = router;
