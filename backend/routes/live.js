const express = require('express');
const db = require('../data/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { teacherClassIds } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

function ensureLiveData(data) {
  if (!Array.isArray(data.liveRooms)) data.liveRooms = [];
  if (!Array.isArray(data.liveSignals)) data.liveSignals = [];
}

function roomView(data, room) {
  return {
    id: room.id,
    classId: room.classId,
    title: room.title,
    hostId: room.hostId,
    hostName: data.users.find((user) => user.id === room.hostId)?.name || 'Teacher',
    status: room.status,
    createdAt: room.createdAt,
    participants: room.participants.map((participantId) => {
      const user = data.users.find((item) => item.id === participantId);
      return user ? { id: user.id, name: user.name, role: user.role } : null;
    }).filter(Boolean),
  };
}

function getRoom(data, id) {
  return data.liveRooms.find((room) => room.id === Number(id));
}

function canAccessRoom(data, room, user) {
  if (!room) return false;
  if (user.role === 'admin' || Number(user.id) === Number(room.hostId)) return true;
  if (user.role === 'teacher') return teacherClassIds(data, user.id).some((classId) => Number(classId) === Number(room.classId));
  const student = data.users.find((item) => item.id === user.id && item.role === 'student');
  return Boolean(student && Number(student.classId) === Number(room.classId));
}

function removeExpired(data) {
  ensureLiveData(data);
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  data.liveRooms = data.liveRooms.filter((room) => room.status === 'active' && new Date(room.createdAt).getTime() > cutoff);
  const activeIds = new Set(data.liveRooms.map((room) => room.id));
  data.liveSignals = data.liveSignals.filter((signal) => activeIds.has(signal.roomId) && new Date(signal.createdAt).getTime() > Date.now() - 10 * 60 * 1000);
}

router.get('/rooms', (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  removeExpired(data);
  db.write(data);
  res.json(data.liveRooms.filter((room) => canAccessRoom(data, room, req.user)).map((room) => roomView(data, room)));
});

router.post('/rooms', requireRole('teacher'), (req, res) => {
  const { classId, title } = req.body;
  const data = db.read();
  ensureLiveData(data);
  const numericClassId = Number(classId);
  const cls = data.classes.find((item) => item.id === numericClassId);
  if (!cls || !teacherClassIds(data, req.user.id).includes(numericClassId)) {
    return res.status(403).json({ message: 'You can only teach live classes you are assigned to' });
  }

  data.liveRooms = data.liveRooms.filter((room) => room.hostId !== req.user.id || room.status !== 'active');
  const room = {
    id: db.nextId(data.liveRooms),
    classId: numericClassId,
    title: String(title || `${cls.name} live class`).trim().slice(0, 100),
    hostId: req.user.id,
    status: 'active',
    createdAt: new Date().toISOString(),
    participants: [req.user.id],
  };
  data.liveRooms.push(room);
  db.write(data);
  res.status(201).json(roomView(data, room));
});

router.post('/rooms/:id/join', (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  const room = getRoom(data, req.params.id);
  if (!canAccessRoom(data, room, req.user)) return res.status(403).json({ message: 'You cannot join this live class' });
  if (room.status !== 'active') return res.status(410).json({ message: 'This live class has ended' });
  if (!room.participants.includes(req.user.id)) room.participants.push(req.user.id);
  db.write(data);
  res.json(roomView(data, room));
});

router.post('/rooms/:id/leave', (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  const room = getRoom(data, req.params.id);
  if (!room || !canAccessRoom(data, room, req.user)) return res.status(403).json({ message: 'You cannot leave this live class' });
  room.participants = room.participants.filter((id) => id !== req.user.id);
  if (room.hostId === req.user.id || room.participants.length === 0) room.status = 'ended';
  db.write(data);
  res.json({ ok: true });
});

router.delete('/rooms/:id', requireRole('teacher', 'admin'), (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  const room = getRoom(data, req.params.id);
  if (!room || (req.user.role !== 'admin' && room.hostId !== req.user.id)) return res.status(403).json({ message: 'Only the host can end this live class' });
  room.status = 'ended';
  room.participants = [];
  db.write(data);
  res.json({ ok: true });
});

router.get('/rooms/:id/signals', (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  const room = getRoom(data, req.params.id);
  if (!canAccessRoom(data, room, req.user)) return res.status(403).json({ message: 'You cannot access this live class' });
  const after = Number(req.query.after || 0);
  res.json(data.liveSignals.filter((signal) => signal.roomId === room.id && signal.id > after && signal.toId === req.user.id));
});

router.post('/rooms/:id/signals', (req, res) => {
  const data = db.read();
  ensureLiveData(data);
  const room = getRoom(data, req.params.id);
  const { toId, type, payload } = req.body;
  if (!canAccessRoom(data, room, req.user) || !room.participants.includes(req.user.id)) return res.status(403).json({ message: 'You are not in this live class' });
  if (!room.participants.includes(Number(toId)) || !['offer', 'answer', 'candidate', 'leave'].includes(type)) return res.status(400).json({ message: 'Invalid live class signal' });
  const signal = { id: db.nextId(data.liveSignals), roomId: room.id, fromId: req.user.id, toId: Number(toId), type, payload, createdAt: new Date().toISOString() };
  data.liveSignals.push(signal);
  db.write(data);
  res.status(201).json({ ok: true, id: signal.id });
});

module.exports = router;