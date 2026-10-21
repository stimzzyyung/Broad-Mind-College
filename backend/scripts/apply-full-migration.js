require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../data/mysql');

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log('Connected to MySQL. Applying complete schema and migrations...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. Create missing tables
    const tableQueries = [
      `CREATE TABLE IF NOT EXISTS portal_config (
        config_key   VARCHAR(100) PRIMARY KEY,
        config_value VARCHAR(255) NOT NULL,
        updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`,

      `CREATE TABLE IF NOT EXISTS subjects (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(100) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS academic_terms (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(60) NOT NULL UNIQUE,
        sort_order INT NOT NULL DEFAULT 0,
        is_active  TINYINT(1) NOT NULL DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_question_types (
        code      VARCHAR(40) PRIMARY KEY,
        label     VARCHAR(150) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_difficulties (
        name       VARCHAR(30) PRIMARY KEY,
        sort_order INT NOT NULL DEFAULT 0,
        is_active  TINYINT(1) NOT NULL DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS question_bank (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        question       LONGTEXT NOT NULL,
        question_type  VARCHAR(40) NOT NULL DEFAULT 'multiple_choice',
        options        JSON NOT NULL,
        correct_answer LONGTEXT NULL,
        subject        VARCHAR(100) NOT NULL,
        class_level    VARCHAR(50) DEFAULT '',
        class_id       INT NULL,
        school_section VARCHAR(30) DEFAULT '',
        exam_level     VARCHAR(100) DEFAULT '',
        category       VARCHAR(100) DEFAULT 'General',
        academic_year  VARCHAR(20) DEFAULT '',
        session        VARCHAR(20) DEFAULT '',
        term           VARCHAR(30) DEFAULT '',
        difficulty     VARCHAR(30) DEFAULT 'Medium',
        marks          DECIMAL(8,2) NOT NULL DEFAULT 1,
        explanation    TEXT NULL,
        created_by_id  INT NULL,
        created_by_name VARCHAR(150) DEFAULT '',
        created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at     DATETIME(3) NULL,
        copied_from_id BIGINT NULL,
        is_archived    TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_question_bank_subject_level (subject, class_level, academic_year),
        CONSTRAINT fk_question_bank_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
        CONSTRAINT fk_question_bank_creator FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_examinations (
        id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
        title                    VARCHAR(200) NOT NULL,
        academic_year            VARCHAR(20) NOT NULL,
        session                  VARCHAR(20) NOT NULL,
        term                     VARCHAR(30) NOT NULL,
        school_section           VARCHAR(30) DEFAULT '',
        class_category           VARCHAR(100) DEFAULT '',
        class_level              VARCHAR(50) DEFAULT '',
        class_id                 INT NULL,
        exam_level               VARCHAR(100) DEFAULT '',
        exam_category            VARCHAR(100) DEFAULT '',
        subject                  VARCHAR(100) NOT NULL,
        duration_mins            INT NOT NULL DEFAULT 60,
        total_marks              DECIMAL(10,2) NOT NULL DEFAULT 0,
        number_questions         INT NOT NULL DEFAULT 0,
        opening_date             DATE NULL,
        opening_time             TIME NULL,
        closing_date             DATE NULL,
        closing_time             TIME NULL,
        student_access_time      VARCHAR(80) DEFAULT '',
        instructions             TEXT NULL,
        status                   VARCHAR(30) NOT NULL DEFAULT 'scheduled',
        max_attempts             INT NOT NULL DEFAULT 1,
        result_calculation_method VARCHAR(50) DEFAULT '',
        questions                JSON NOT NULL,
        created_by_id            INT NULL,
        created_by_name          VARCHAR(150) DEFAULT '',
        created_at               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at               DATETIME(3) NULL,
        INDEX idx_cbt_exam_schedule (status, opening_date, closing_date),
        INDEX idx_cbt_exam_class (class_id, academic_year, term),
        CONSTRAINT fk_cbt_exam_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_exam_creator FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_attempts (
        id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
        attempt_code       VARCHAR(40) NOT NULL UNIQUE,
        student_id         INT NOT NULL,
        exam_id            BIGINT NOT NULL,
        attempt_number     INT NOT NULL DEFAULT 1,
        start_time         DATETIME(3) NOT NULL,
        expected_end_time  DATETIME(3) NOT NULL,
        submission_time    DATETIME(3) NULL,
        last_activity_time DATETIME(3) NULL,
        status             VARCHAR(30) NOT NULL DEFAULT 'In Progress',
        saved_answers      JSON NOT NULL,
        score              DECIMAL(10,2) NULL,
        percentage         DECIMAL(7,2) NULL,
        correct_count      INT NOT NULL DEFAULT 0,
        wrong_count        INT NOT NULL DEFAULT 0,
        unanswered_count  INT NOT NULL DEFAULT 0,
        grade              VARCHAR(10) NULL,
        passed             TINYINT(1) NULL,
        INDEX idx_cbt_attempt_student_exam (student_id, exam_id, attempt_number),
        INDEX idx_cbt_attempt_status_activity (status, last_activity_time),
        CONSTRAINT fk_cbt_attempt_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_cbt_attempt_exam FOREIGN KEY (exam_id) REFERENCES cbt_examinations(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_access_logs (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        student_id  INT NULL,
        exam_id     BIGINT NULL,
        attempt_id  BIGINT NULL,
        action      VARCHAR(50) NOT NULL,
        status      VARCHAR(30) NOT NULL DEFAULT '',
        details     TEXT NULL,
        ip_address  VARCHAR(45) DEFAULT '',
        user_agent  VARCHAR(500) DEFAULT '',
        created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_cbt_access_student_time (student_id, created_at),
        INDEX idx_cbt_access_exam_time (exam_id, created_at),
        CONSTRAINT fk_cbt_access_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_access_exam FOREIGN KEY (exam_id) REFERENCES cbt_examinations(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_access_attempt FOREIGN KEY (attempt_id) REFERENCES cbt_attempts(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_audit_logs (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        staff_id     INT NULL,
        staff_name   VARCHAR(150) DEFAULT '',
        student_id   INT NULL,
        student_name VARCHAR(150) DEFAULT '',
        exam_id      BIGINT NULL,
        exam_title   VARCHAR(200) DEFAULT '',
        action       VARCHAR(50) NOT NULL,
        reason       TEXT NULL,
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_cbt_audit_exam_time (exam_id, created_at),
        CONSTRAINT fk_cbt_audit_staff FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_audit_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_audit_exam FOREIGN KEY (exam_id) REFERENCES cbt_examinations(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_positions (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        exam_id     BIGINT NULL,
        class_id    INT NULL,
        class_level VARCHAR(50) DEFAULT '',
        term        VARCHAR(30) DEFAULT '',
        session     VARCHAR(20) DEFAULT '',
        positions   JSON NOT NULL,
        created_by  INT NULL,
        created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_cbt_position_class_term (class_id, session, term),
        CONSTRAINT fk_cbt_position_exam FOREIGN KEY (exam_id) REFERENCES cbt_examinations(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_position_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
        CONSTRAINT fk_cbt_position_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_proctoring (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        attempt_id  BIGINT NOT NULL,
        student_id  INT NOT NULL,
        exam_id     BIGINT NOT NULL,
        file_name   VARCHAR(255) NOT NULL,
        mime_type   VARCHAR(100) NOT NULL DEFAULT 'video/webm',
        bytes       BIGINT UNSIGNED NOT NULL DEFAULT 0,
        recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_cbt_proctor_attempt (attempt_id),
        CONSTRAINT fk_cbt_proctor_attempt FOREIGN KEY (attempt_id) REFERENCES cbt_attempts(id) ON DELETE CASCADE,
        CONSTRAINT fk_cbt_proctor_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_cbt_proctor_exam FOREIGN KEY (exam_id) REFERENCES cbt_examinations(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS cbt_monitor_signals (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        attempt_id BIGINT NOT NULL,
        from_id    INT NOT NULL,
        to_id      INT NOT NULL,
        type       ENUM('offer','answer','candidate','leave') NOT NULL,
        payload    JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_cbt_signal_recipient (to_id, id),
        INDEX idx_cbt_signal_attempt_time (attempt_id, created_at),
        CONSTRAINT fk_cbt_signal_attempt FOREIGN KEY (attempt_id) REFERENCES cbt_attempts(id) ON DELETE CASCADE,
        CONSTRAINT fk_cbt_signal_from FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_cbt_signal_to FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS live_rooms (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        class_id   INT NOT NULL,
        title      VARCHAR(100) NOT NULL,
        host_id    INT NOT NULL,
        status     VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_live_room_class_status (class_id, status),
        CONSTRAINT fk_live_room_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_room_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS live_room_participants (
        room_id      BIGINT NOT NULL,
        user_id      INT NOT NULL,
        joined_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (room_id, user_id),
        CONSTRAINT fk_live_participant_room FOREIGN KEY (room_id) REFERENCES live_rooms(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS live_signals (
        id         BIGINT AUTO_INCREMENT PRIMARY KEY,
        room_id    BIGINT NOT NULL,
        from_id    INT NOT NULL,
        to_id      INT NOT NULL,
        type       ENUM('offer','answer','candidate','leave') NOT NULL,
        payload    JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_live_signal_recipient (room_id, to_id, id),
        CONSTRAINT fk_live_signal_room FOREIGN KEY (room_id) REFERENCES live_rooms(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_signal_from FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_signal_to FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS lms_proctoring (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        quiz_id     INT NOT NULL,
        student_id  INT NOT NULL,
        file_name   VARCHAR(255) NOT NULL,
        mime_type   VARCHAR(100) NOT NULL DEFAULT 'video/webm',
        bytes       BIGINT UNSIGNED NOT NULL DEFAULT 0,
        recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_lms_proctor_quiz_student (quiz_id, student_id),
        CONSTRAINT fk_lms_proctor_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        CONSTRAINT fk_lms_proctor_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
    ];

    for (const q of tableQueries) {
      await connection.query(q);
    }
    console.log('✓ All missing tables created.');

    // 2. Add columns to payments table
    const [cols] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments'"
    );
    const existingCols = new Set(cols.map((c) => String(c.COLUMN_NAME || c.column_name || Object.values(c)[0])));

    if (!existingCols.has('receipt_file')) {
      await connection.query('ALTER TABLE payments ADD COLUMN receipt_file VARCHAR(255) NULL');
      console.log('✓ Added receipt_file column to payments');
    }
    if (!existingCols.has('receipt_mime')) {
      await connection.query('ALTER TABLE payments ADD COLUMN receipt_mime VARCHAR(100) NULL');
      console.log('✓ Added receipt_mime column to payments');
    }
    if (!existingCols.has('receipt_original_name')) {
      await connection.query('ALTER TABLE payments ADD COLUMN receipt_original_name VARCHAR(255) NULL');
      console.log('✓ Added receipt_original_name column to payments');
    }
    if (!existingCols.has('caption')) {
      await connection.query('ALTER TABLE payments ADD COLUMN caption TEXT NULL');
      console.log('✓ Added caption column to payments');
    }
    if (!existingCols.has('rejection_reason')) {
      await connection.query('ALTER TABLE payments ADD COLUMN rejection_reason VARCHAR(255) NULL');
      console.log('✓ Added rejection_reason column to payments');
    }

    // 3. Populate catalogs
    const catalogInserts = [
      `INSERT IGNORE INTO school_sections (id, code, name, description) VALUES
        ('primary', 'PRI', 'Primary School', 'Primary 1 to Primary 5'),
        ('jss', 'JSS', 'Junior Secondary School', 'JSS 1 to JSS 3'),
        ('sss', 'SSS', 'Senior Secondary School', 'SS 1 to SS 3')`,

      `INSERT IGNORE INTO class_categories (id, name, section_id, description, sort_order) VALUES
        (1, 'Primary Section', 'primary', 'Primary school classes', 1),
        (2, 'Junior Secondary Section', 'jss', 'Junior secondary classes', 2),
        (3, 'Senior Secondary Section', 'sss', 'Senior secondary classes', 3)`,

      `INSERT IGNORE INTO class_levels (id, name, category_id, section_id) VALUES
        (1, 'Primary 1', 1, 'primary'), (2, 'Primary 2', 1, 'primary'),
        (3, 'Primary 3', 1, 'primary'), (4, 'Primary 4', 1, 'primary'),
        (5, 'Primary 5', 1, 'primary'), (6, 'JSS1', 2, 'jss'),
        (7, 'JSS2', 2, 'jss'), (8, 'JSS3', 2, 'jss'),
        (9, 'SS1', 3, 'sss'), (10, 'SS2', 3, 'sss'), (11, 'SS3', 3, 'sss')`,

      `INSERT IGNORE INTO exam_categories (id, name, code, weight) VALUES
        (1, 'First Continuous Assessment', 'CA1', 20),
        (2, 'Second Continuous Assessment', 'CA2', 20),
        (3, 'Mid-Term Examination', 'MIDTERM', 30),
        (4, 'First Term Examination', 'TERM1', 60),
        (5, 'Second Term Examination', 'TERM2', 60),
        (6, 'Third Term Examination', 'TERM3', 60),
        (7, 'Final Examination', 'FINAL', 100),
        (8, 'Mock Examination', 'MOCK', 100),
        (9, 'Entrance Examination', 'ENTRANCE', 100),
        (10, 'Practice CBT', 'PRACTICE', 0)`,

      `INSERT IGNORE INTO exam_levels (id, name, section_id) VALUES
        (1, 'Primary School Level', 'primary'),
        (2, 'Junior Secondary Level', 'jss'),
        (3, 'Senior Secondary Level', 'sss'),
        (4, 'All School Levels', 'all')`,

      `INSERT IGNORE INTO subjects (name) VALUES
        ('Mathematics'), ('English Language'), ('Basic Science'), ('Civic Education'),
        ('Computer Studies'), ('Social Studies'), ('Physics'), ('Chemistry'),
        ('Biology'), ('Agricultural Science'), ('Economics'), ('Government'),
        ('Literature in English')`,

      `INSERT IGNORE INTO academic_terms (name, sort_order) VALUES
        ('First Term', 1), ('Second Term', 2), ('Third Term', 3), ('Final Examination', 4)`,

      `INSERT IGNORE INTO cbt_question_types (code, label) VALUES
        ('multiple_choice', 'Multiple Choice'), ('true_false', 'True / False'),
        ('short_answer', 'Short Answer'), ('theory', 'Theory / Essay')`,

      `INSERT IGNORE INTO cbt_difficulties (name, sort_order) VALUES
        ('Easy', 1), ('Medium', 2), ('Hard', 3)`,

      `INSERT INTO portal_config (config_key, config_value) VALUES
        ('email_domain', 'broadmindcollege.edu'),
        ('school_code', 'BMS')
        ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
    ];

    for (const q of catalogInserts) {
      await connection.query(q);
    }
    console.log('✓ Catalogs populated.');

    // 4. Update settings school_name if needed
    await connection.execute(
      "UPDATE settings SET school_name = 'Broad-Mind College', motto = 'Knowledge with character' WHERE id = 1"
    );
    console.log('✓ Settings verified.');

    // 5. Update/verify Admin account credentials
    // User requested:
    // login id: broaddmindprivateschool@gmail.com
    // password: broadmind123
    const adminPasswordHash = await bcrypt.hash('broadmind123', 10);
    const [adminCheck] = await connection.execute(
      'SELECT id FROM users WHERE LOWER(email) = ? OR id = 1 LIMIT 1',
      ['broaddmindprivateschool@gmail.com']
    );

    if (adminCheck.length > 0) {
      await connection.execute(
        'UPDATE users SET email = ?, password = ?, role = ?, status = ? WHERE id = ?',
        ['broaddmindprivateschool@gmail.com', adminPasswordHash, 'admin', 'active', adminCheck[0].id]
      );
      console.log(`✓ Admin user (ID: ${adminCheck[0].id}) updated with email broaddmindprivateschool@gmail.com and password broadmind123.`);
    } else {
      await connection.execute(
        'INSERT INTO users (role, school_id, name, email, password, phone, qualification, address, bio, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['admin', 'BMS/ADM/001', 'Mrs. Olufemi Olufumilola', 'broaddmindprivateschool@gmail.com', adminPasswordHash, '0801 234 5678', 'Principal', '', '', 'active']
      );
      console.log('✓ Created admin user with email broaddmindprivateschool@gmail.com and password broadmind123.');
    }

    // 6. Populate class_subjects and timetable_slots if empty
    const [classRows] = await connection.execute('SELECT id, name FROM classes ORDER BY id');
    const [existingSubjects] = await connection.execute('SELECT COUNT(*) AS count FROM class_subjects');
    const [existingSlots] = await connection.execute('SELECT COUNT(*) AS count FROM timetable_slots');

    const subjectList = [
      { name: 'Mathematics', teacherId: 2 },
      { name: 'English Language', teacherId: 3 },
      { name: 'Basic Science', teacherId: 4 },
      { name: 'Civic Education', teacherId: 3 },
      { name: 'Computer Studies', teacherId: 2 },
      { name: 'Social Studies', teacherId: 4 },
    ];

    if (Number(existingSubjects[0].count) === 0) {
      console.log('Populating class_subjects for all classes...');
      for (const cls of classRows) {
        for (const sub of subjectList) {
          await connection.execute(
            'INSERT IGNORE INTO class_subjects (class_id, subject, teacher_id) VALUES (?, ?, ?)',
            [cls.id, sub.name, sub.teacherId]
          );
        }
      }
      console.log('✓ class_subjects populated.');
    }

    if (Number(existingSlots[0].count) === 0) {
      console.log('Populating timetable_slots for all classes...');
      const periods = ['08:00 - 08:40', '08:40 - 09:20', '09:20 - 10:00', '10:30 - 11:10', '11:10 - 11:50', '11:50 - 12:30'];
      const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const subNames = subjectList.map((s) => s.name);

      for (const [clsIndex, cls] of classRows.entries()) {
        for (const [dayIndex, day] of weekdays.entries()) {
          for (const [pIndex, timeSlot] of periods.entries()) {
            const subject = subNames[(pIndex + dayIndex + clsIndex) % subNames.length];
            await connection.execute(
              'INSERT IGNORE INTO timetable_slots (class_id, day, period_index, time_slot, subject) VALUES (?, ?, ?, ?, ?)',
              [cls.id, day, pIndex, timeSlot, subject]
            );
          }
        }
      }
      console.log('✓ timetable_slots populated for all classes.');
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('🎉 Migration completed successfully!');
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
