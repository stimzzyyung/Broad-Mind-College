// Small helper for creating in-app notifications. Call these from other routes
// right before db.write(data) so the notification is saved in the same write.
const db = require('./db');

function push(data, userId, { title, body, type = 'info', link = '' }) {
  if (!data.notifications) data.notifications = [];
  data.notifications.push({
    id: db.nextId(data.notifications),
    userId,
    title,
    body,
    type, // 'announcement' | 'fee' | 'quiz' | 'result' | 'payment' | 'student' | 'submission' | 'info'
    link, // appended to the viewer's own portal root, e.g. '/fees' -> '/student/fees'
    read: false,
    createdAt: new Date().toISOString(),
  });
}

function notifyUser(data, userId, payload) {
  if (userId) push(data, userId, payload);
}

function notifyUsers(data, userIds, payload) {
  [...new Set(userIds)].forEach((id) => push(data, id, payload));
}

function notifyRole(data, role, payload) {
  const ids = data.users.filter((u) => u.role === role).map((u) => u.id);
  notifyUsers(data, ids, payload);
}

module.exports = { notifyUser, notifyUsers, notifyRole };
