const express = require('express');
const { pool } = require('../data/mysql');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function canAccessRoom(room, user) {
  if (!room) return false;
  if (user.role === 'admin' || Number(user.id) === Number(room.host_id)) return true;
  if (user.role === 'teacher') {
    const [rows] = await pool.execute(
      'SELECT 1 FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.id = ? AND (c.form_teacher_id = ? OR cs.teacher_id = ?) LIMIT 1',
      [room.class_id, user.id, user.id]
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute('SELECT 1 FROM users WHERE id = ? AND role = ? AND class_id = ?', [user.id, 'student', room.class_id]);
  return rows.length > 0;
}

async function roomView(roomId) {
  const [rows] = await pool.execute(
    'SELECT r.*, h.name AS host_name FROM live_rooms r JOIN users h ON h.id = r.host_id WHERE r.id = ?',
    [roomId]
  );
  if (!rows.length) return null;
  const room = rows[0];
  const [participants] = await pool.execute(
    'SELECT u.id, u.name, u.role FROM live_room_participants p JOIN users u ON u.id = p.user_id WHERE p.room_id = ? ORDER BY p.joined_at',
    [roomId]
  );
  return {
    id: Number(room.id), classId: Number(room.class_id), title: room.title,
    hostId: Number(room.host_id), hostName: room.host_name, status: room.status,
    createdAt: room.created_at,
    participants: participants.map((participant) => ({ ...participant, id: Number(participant.id) })),
  };
}

async function getRoom(roomId) {
  const [rows] = await pool.execute('SELECT * FROM live_rooms WHERE id = ?', [roomId]);
  return rows[0] || null;
}

router.get('/rooms', async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM live_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)');
    await pool.execute('UPDATE live_rooms SET status = ? WHERE status = ? AND created_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)', ['ended', 'active']);
    let query = 'SELECT DISTINCT r.id FROM live_rooms r LEFT JOIN live_room_participants p ON p.room_id = r.id LEFT JOIN users s ON s.id = ? LEFT JOIN classes c ON c.id = r.class_id LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE r.status = ? AND (r.host_id = ? OR p.user_id = ? OR ? = ?)';
    const values = [req.user.id, 'active', req.user.id, req.user.id, req.user.role, 'admin'];
    if (req.user.role === 'teacher') {
      query = 'SELECT DISTINCT r.id FROM live_rooms r LEFT JOIN classes c ON c.id = r.class_id LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE r.status = ? AND (r.host_id = ? OR c.form_teacher_id = ? OR cs.teacher_id = ?)';
      values.splice(0, values.length, 'active', req.user.id, req.user.id, req.user.id);
    } else if (req.user.role === 'student') {
      query = 'SELECT r.id FROM live_rooms r JOIN users s ON s.id = ? AND s.role = ? AND s.class_id = r.class_id WHERE r.status = ?';
      values.splice(0, values.length, req.user.id, 'student', 'active');
    } else if (req.user.role === 'admin') {
      query = 'SELECT id FROM live_rooms WHERE status = ?';
      values.splice(0, values.length, 'active');
    }
    const [rows] = await pool.execute(query, values);
    const rooms = await Promise.all(rows.map((row) => roomView(Number(row.id))));
    res.json(rooms.filter(Boolean));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms', requireRole('teacher'), async (req, res, next) => {
  const classId = Number(req.body.classId);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [classes] = await connection.execute(
      'SELECT c.id, c.name FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.id = ? AND (c.form_teacher_id = ? OR cs.teacher_id = ?) LIMIT 1',
      [classId, req.user.id, req.user.id]
    );
    if (!classes.length) {
      await connection.rollback();
      return res.status(403).json({ message: 'You can only teach live classes you are assigned to' });
    }
    await connection.execute('UPDATE live_rooms SET status = ? WHERE host_id = ? AND status = ?', ['ended', req.user.id, 'active']);
    const [result] = await connection.execute(
      'INSERT INTO live_rooms (class_id, title, host_id, status) VALUES (?, ?, ?, ?)',
      [classId, String(req.body.title || `${classes[0].name} live class`).trim().slice(0, 100), req.user.id, 'active']
    );
    await connection.execute('INSERT INTO live_room_participants (room_id, user_id) VALUES (?, ?)', [result.insertId, req.user.id]);
    await connection.commit();
    res.status(201).json(await roomView(Number(result.insertId)));
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

router.post('/rooms/:id/join', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id);
    const room = await getRoom(roomId);
    if (!await canAccessRoom(room, req.user)) return res.status(403).json({ message: 'You cannot join this live class' });
    if (room.status !== 'active') return res.status(410).json({ message: 'This live class has ended' });
    await pool.execute('INSERT IGNORE INTO live_room_participants (room_id, user_id) VALUES (?, ?)', [roomId, req.user.id]);
    res.json(await roomView(roomId));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:id/leave', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id);
    const room = await getRoom(roomId);
    if (!await canAccessRoom(room, req.user)) return res.status(403).json({ message: 'You cannot leave this live class' });
    await pool.execute('DELETE FROM live_room_participants WHERE room_id = ? AND user_id = ?', [roomId, req.user.id]);
    const [participants] = await pool.execute('SELECT COUNT(*) AS count FROM live_room_participants WHERE room_id = ?', [roomId]);
    if (Number(room.host_id) === Number(req.user.id) || !Number(participants[0].count)) {
      await pool.execute('UPDATE live_rooms SET status = ? WHERE id = ?', ['ended', roomId]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/rooms/:id', requireRole('teacher', 'admin'), async (req, res, next) => {
  try {
    const roomId = Number(req.params.id);
    const room = await getRoom(roomId);
    if (!room || (req.user.role !== 'admin' && Number(room.host_id) !== Number(req.user.id))) {
      return res.status(403).json({ message: 'Only the host can end this live class' });
    }
    await pool.execute('UPDATE live_rooms SET status = ? WHERE id = ?', ['ended', roomId]);
    await pool.execute('DELETE FROM live_room_participants WHERE room_id = ?', [roomId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:id/signals', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id);
    const room = await getRoom(roomId);
    if (!await canAccessRoom(room, req.user)) return res.status(403).json({ message: 'You cannot access this live class' });
    const [member] = await pool.execute('SELECT 1 FROM live_room_participants WHERE room_id = ? AND user_id = ?', [roomId, req.user.id]);
    if (!member.length) return res.status(403).json({ message: 'You are not in this live class' });
    const [rows] = await pool.execute(
      'SELECT id, room_id AS roomId, from_id AS fromId, to_id AS toId, type, payload, created_at AS createdAt FROM live_signals WHERE room_id = ? AND id > ? AND to_id = ? ORDER BY id',
      [roomId, Number(req.query.after || 0), req.user.id]
    );
    res.json(rows.map((row) => ({ ...row, id: Number(row.id), roomId: Number(row.roomId), fromId: Number(row.fromId), toId: Number(row.toId) })));
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:id/signals', async (req, res, next) => {
  try {
    const roomId = Number(req.params.id);
    const room = await getRoom(roomId);
    const toId = Number(req.body.toId);
    const { type, payload } = req.body;
    if (!await canAccessRoom(room, req.user)) return res.status(403).json({ message: 'You are not in this live class' });
    if (!['offer', 'answer', 'candidate', 'leave'].includes(type)) return res.status(400).json({ message: 'Invalid live class signal' });
    const [members] = await pool.execute(
      'SELECT user_id FROM live_room_participants WHERE room_id = ? AND user_id IN (?, ?)',
      [roomId, req.user.id, toId]
    );
    if (members.length !== 2 || !members.some((member) => Number(member.user_id) === Number(req.user.id)) || !members.some((member) => Number(member.user_id) === toId)) {
      return res.status(400).json({ message: 'Invalid live class signal' });
    }
    const [result] = await pool.execute(
      'INSERT INTO live_signals (room_id, from_id, to_id, type, payload) VALUES (?, ?, ?, ?, ?)',
      [roomId, req.user.id, toId, type, payload == null ? null : JSON.stringify(payload)]
    );
    res.status(201).json({ ok: true, id: Number(result.insertId) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;