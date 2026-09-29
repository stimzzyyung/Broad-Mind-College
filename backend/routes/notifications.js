const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, user_id AS userId, title, body, type, link, is_read AS `read`, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), userId: Number(row.userId), read: Boolean(row.read) })));
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ count: Number(rows[0].count) });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const [result] = await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });
    const [rows] = await pool.execute(
      'SELECT id, user_id AS userId, title, body, type, link, is_read AS `read`, created_at AS createdAt FROM notifications WHERE id = ?',
      [Number(req.params.id)]
    );
    const row = rows[0];
    res.json({ ...row, id: Number(row.id), userId: Number(row.userId), read: Boolean(row.read) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;