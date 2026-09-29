require('dotenv').config();
const { pool } = require('../data/mysql');

const expectedCounts = {
  settings: 1,
  users: 14,
  classes: 3,
  class_subjects: 18,
  timetable_slots: 90,
  fees: 4,
  payments: 11,
  results: 54,
  quizzes: 3,
  quiz_questions: 13,
  submissions: 1,
  announcements: 3,
  notifications: 0,
  school_sections: 0,
  class_categories: 0,
  class_levels: 0,
  exam_categories: 0,
  exam_levels: 0,
  question_bank: 0,
  cbt_examinations: 0,
  cbt_attempts: 0,
  cbt_access_logs: 0,
  cbt_audit_logs: 0,
  cbt_positions: 0,
  cbt_proctoring: 0,
  cbt_monitor_signals: 0,
  live_rooms: 0,
  live_room_participants: 0,
  live_signals: 0,
  lms_proctoring: 0,
};

async function removeSeededDemoData() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [settings] = await connection.execute('SELECT school_name, email, session, term FROM settings WHERE id = 1 FOR UPDATE');
    if (settings.length !== 1 || settings[0].school_name !== 'Broad Mind Private School' || settings[0].email !== 'info@crestview.edu') {
      throw new Error('Database signature did not match the audited demo settings; no rows were deleted.');
    }

    for (const [table, expected] of Object.entries(expectedCounts)) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      if (Number(rows[0].count) !== expected) {
        throw new Error(`Database signature did not match audited demo count for ${table}; no rows were deleted.`);
      }
    }

    const [adminRows] = await connection.execute(
      'SELECT id FROM users WHERE role = ? AND email = ? AND school_id = ?',
      ['admin', 'principal@crestview.edu', 'CVC/ADM/001']
    );
    const [crestviewUsers] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE email LIKE ?', ['%@crestview.edu']);
    if (adminRows.length !== 1 || Number(crestviewUsers[0].count) !== 5) {
      throw new Error('Demo account markers did not match the audited dataset; no rows were deleted.');
    }

    for (const table of [
      'submissions', 'quiz_questions', 'quizzes', 'payments', 'results', 'announcements',
      'fees', 'timetable_slots', 'class_subjects', 'users', 'classes', 'settings',
    ]) {
      await connection.query(`DELETE FROM \`${table}\``);
    }
    await connection.commit();
    console.log('Removed the verified seeded demo records. Database schema was preserved.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

removeSeededDemoData().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});