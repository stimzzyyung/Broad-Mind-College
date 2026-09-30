require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./data/db');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://broad-mind-college.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use('/api', db.requestMiddleware);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Each file in /routes handles one part of the portal
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/students', require('./routes/students'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/parents', require('./routes/parents'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/results', require('./routes/results'));
app.use('/api/lms', require('./routes/lms'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/live', require('./routes/live'));
app.use('/api/cbt', require('./routes/cbt'));

// Anything else
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// If something crashes, send a friendly error instead of a stack trace
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 5000;

db.initialize()
  .then(() => {
    app.listen(PORT, () => console.log(`School portal API running on http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Unable to connect to the school MySQL database:', error.message);
    process.exitCode = 1;
  });
