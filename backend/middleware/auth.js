const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// 1) Checks that the request has a valid login token
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please log in first' });

  try {
    req.user = jwt.verify(token, SECRET); // { id, role, name }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Your session has expired. Please log in again' });
  }
}

// 2) Checks that the logged-in user has one of the allowed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this' });
    }
    next();
  };
}

module.exports = { SECRET, requireAuth, requireRole };
