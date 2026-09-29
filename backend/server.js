require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, ping } = require('./data/mysql');

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

app.get('/api/health', async (req, res) => {
  try {
    await ping();
    res.json({ ok: true, database: 'mysql' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

// Each file in /routes handles one part of the portal
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/students', require('./routes/students'));
app.use('/api/teachers', require('./routes/teachers'));
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
async function start() {
  try {
    await ping();
    const server = app.listen(PORT, () => console.log(`School portal API connected to MySQL and listening on http://localhost:${PORT}`));
    const shutdown = () => {
      server.close(() => pool.end().finally(() => process.exit(0)));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (err) {
    console.error(`Unable to connect to MySQL database "${process.env.DB_NAME || 'broad-mind-private-school'}": ${err.message}`);
    process.exitCode = 1;
  }
}

start();
