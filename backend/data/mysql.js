const mysql = require('mysql2/promise');

const requiredTables = [
  'settings', 'classes', 'users', 'class_subjects', 'timetable_slots', 'fees', 'payments', 'results',
  'quizzes', 'quiz_questions', 'submissions', 'announcements', 'notifications', 'school_sections',
  'class_categories', 'class_levels', 'exam_categories', 'exam_levels', 'question_bank',
  'cbt_examinations', 'cbt_attempts', 'cbt_access_logs', 'cbt_audit_logs', 'cbt_positions',
  'cbt_proctoring', 'cbt_monitor_signals', 'live_rooms', 'live_room_participants', 'live_signals', 'lms_proctoring',
  'portal_config', 'subjects', 'academic_terms', 'cbt_question_types', 'cbt_difficulties',
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'broad-mind-private-school',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
  dateStrings: true,
});

async function ping() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    const placeholders = requiredTables.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
      requiredTables
    );
    const presentTables = new Set(rows.map((row) => String(row.table_name ?? row.TABLE_NAME ?? Object.values(row)[0])));
    const missingTables = requiredTables.filter((table) => !presentTables.has(table));
    if (missingTables.length) {
      throw new Error(`Database schema is incomplete. Import database/schema.sql; missing tables: ${missingTables.join(', ')}`);
    }
  } finally {
    connection.release();
  }
}

module.exports = { pool, ping };
