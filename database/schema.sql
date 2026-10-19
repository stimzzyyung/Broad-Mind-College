-- ==========================================================
-- Broad Mind Private School portal — MySQL schema
-- Empty production schema for Broad Mind Private School.
-- This file creates the portal schema and standard lookup catalogs. It does
-- not insert demo users, exams, results, payments, or drop existing tables.
-- Works in phpMyAdmin: open phpMyAdmin -> Import -> choose this file -> Go.
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `broad-mind-private-school`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `broad-mind-private-school`;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------
-- Single-row table for the school's own settings
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id           TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  school_name  VARCHAR(150) NOT NULL,
  motto        VARCHAR(200) DEFAULT '',
  session      VARCHAR(20)  NOT NULL,          -- e.g. '2026/2027'
  term         ENUM('First Term','Second Term','Third Term') NOT NULL,
  address      VARCHAR(200) DEFAULT '',
  phone        VARCHAR(50)  DEFAULT '',
  email        VARCHAR(150) DEFAULT ''
);

-- ----------------------------------------------------------
-- Classes. form_teacher_id is an application-managed reference to users.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(50) NOT NULL UNIQUE,   -- e.g. 'JSS 1A'
  level           VARCHAR(20) DEFAULT '',        -- 'Junior' / 'Senior'
  school_section  VARCHAR(30) DEFAULT '',
  class_level     VARCHAR(50) DEFAULT '',
  form_teacher_id INT NULL
);

-- ----------------------------------------------------------
-- Everybody who can log in: principal, teachers, students, parents.
-- Columns that don't apply to a role are simply left NULL
-- (e.g. a teacher has no dob, a parent has no schoolId).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  role            ENUM('admin','teacher','student','parent') NOT NULL,
  school_id       VARCHAR(30)  NULL UNIQUE,      -- e.g. 'CVC/26/001'; NULL for parents
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NULL UNIQUE,      -- required for admin/teacher/parent, optional for students
  password        VARCHAR(255) NOT NULL,         -- bcrypt hash
  phone           VARCHAR(30)  DEFAULT '',
  gender          ENUM('Male','Female') NULL,    -- students
  dob             DATE NULL,                     -- students
  class_id        INT NULL,                      -- students
  parent_id       INT NULL,                      -- students: which parent account registered them
  guardian_name   VARCHAR(150) DEFAULT '',        -- students
  guardian_phone  VARCHAR(30)  DEFAULT '',        -- students
  address         VARCHAR(255) DEFAULT '',
  bio             TEXT NULL,                      -- admin/teacher
  qualification   VARCHAR(150) NULL,              -- teacher
  status          VARCHAR(20)  DEFAULT 'active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_class  FOREIGN KEY (class_id)  REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_parent FOREIGN KEY (parent_id) REFERENCES users(id)   ON DELETE SET NULL,
  INDEX idx_users_role (role),
  INDEX idx_users_class (class_id)
);

-- ----------------------------------------------------------
-- Which teacher takes which subject, in which class
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_subjects (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  class_id   INT NOT NULL,
  subject    VARCHAR(100) NOT NULL,
  teacher_id INT NULL,
  CONSTRAINT fk_cs_class   FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)   ON DELETE SET NULL,
  UNIQUE KEY uniq_class_subject (class_id, subject)
);

-- ----------------------------------------------------------
-- One row per class/day/period. Rebuilt whenever a class's
-- timetable changes.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS timetable_slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  class_id     INT NOT NULL,
  day          ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  period_index TINYINT UNSIGNED NOT NULL,     -- 0-based position in the day
  time_slot    VARCHAR(20) NOT NULL,          -- e.g. '08:00 - 08:40'
  subject      VARCHAR(100) NOT NULL,
  CONSTRAINT fk_tt_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_slot (class_id, day, period_index)
);

-- ----------------------------------------------------------
-- Fee items for a term (Tuition, PTA levy, ...)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS fees (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  title   VARCHAR(100) NOT NULL,
  amount  DECIMAL(12,2) NOT NULL,
  term    VARCHAR(20) NOT NULL,
  session VARCHAR(20) NOT NULL
);

-- ----------------------------------------------------------
-- Payments made towards a fee (by a student directly, a
-- parent on a child's behalf, or recorded by the office)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  fee_id      INT NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  method      VARCHAR(30) NOT NULL,           -- Card / Bank transfer / USSD / Cash / POS
  status      VARCHAR(20) DEFAULT 'success',
  reference   VARCHAR(50) UNIQUE,
  receipt_no  VARCHAR(50) UNIQUE,
  term        VARCHAR(20),
  session     VARCHAR(20),
  date                  DATETIME DEFAULT CURRENT_TIMESTAMP,
  receipt_file          VARCHAR(255) NULL,
  receipt_mime          VARCHAR(100) NULL,
  receipt_original_name VARCHAR(255) NULL,
  caption               TEXT NULL,
  CONSTRAINT fk_pay_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_fee     FOREIGN KEY (fee_id)     REFERENCES fees(id)  ON DELETE CASCADE,
  INDEX idx_payments_student (student_id)
);

-- ----------------------------------------------------------
-- One row per student, per subject, per term
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS results (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  class_id    INT NOT NULL,
  subject     VARCHAR(100) NOT NULL,
  term        VARCHAR(20) NOT NULL,
  session     VARCHAR(20) NOT NULL,
  ca          TINYINT UNSIGNED NOT NULL,       -- out of 40
  exam        TINYINT UNSIGNED NOT NULL,       -- out of 60
  total       TINYINT UNSIGNED NOT NULL,       -- ca + exam, out of 100
  teacher_id  INT NULL,
  CONSTRAINT fk_res_student FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_res_class   FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)   ON DELETE SET NULL,
  UNIQUE KEY uniq_result (student_id, subject, term, session),
  INDEX idx_results_class_term (class_id, term, session)
);
-- Grades (A1, B2, C4 ...) are not stored — they're calculated from `total`
-- whenever a result is displayed, the same way the app does it, so the
-- grading scale can change without having to rewrite old rows.

-- ----------------------------------------------------------
-- LMS: quizzes/tests, their questions, and student submissions
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  subject       VARCHAR(100) NOT NULL,
  class_id      INT NOT NULL,
  teacher_id    INT NOT NULL,
  type          ENUM('Quiz','Test') DEFAULT 'Quiz',
  duration_mins INT DEFAULT 15,
  due_date      DATE NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quiz_class   FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)   ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id      INT NOT NULL,
  question     TEXT NOT NULL,
  option_a     VARCHAR(255) NOT NULL,
  option_b     VARCHAR(255) NOT NULL,
  option_c     VARCHAR(255) NOT NULL,
  option_d     VARCHAR(255) NOT NULL,
  answer_index TINYINT UNSIGNED NOT NULL,      -- 0=A, 1=B, 2=C, 3=D
  CONSTRAINT fk_qq_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id      INT NOT NULL,
  student_id   INT NOT NULL,
  answers      JSON NOT NULL,                  -- e.g. [1, 2, 0, 0, 2]  (one option index per question)
  score        INT NOT NULL,
  total        INT NOT NULL,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_quiz    FOREIGN KEY (quiz_id)    REFERENCES quizzes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE CASCADE,
  UNIQUE KEY uniq_submission (quiz_id, student_id)   -- one attempt per student per quiz
);

-- ----------------------------------------------------------
-- Notice board
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  title     VARCHAR(200) NOT NULL,
  body      TEXT NOT NULL,
  author    VARCHAR(150) DEFAULT '',
  posted_by INT NULL,
  date      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ann_user FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------
-- Per-user notifications (bell icon in the portal)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(500) DEFAULT '',
  type       VARCHAR(30)  DEFAULT 'info',      -- announcement / fee / quiz / result / payment / student / submission / info
  link       VARCHAR(200) DEFAULT '',          -- appended to the viewer's own portal root, e.g. '/fees'
  is_read    TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_unread (user_id, is_read)
);

SET FOREIGN_KEY_CHECKS = 1;
-- ----------------------------------------------------------
-- School structure and CBT configuration
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS school_sections (
  id          VARCHAR(30) PRIMARY KEY,
  code        VARCHAR(20) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS class_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  section_id  VARCHAR(30) NULL,
  description VARCHAR(255) DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_class_category_section FOREIGN KEY (section_id) REFERENCES school_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS class_levels (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  category_id INT NULL,
  section_id  VARCHAR(30) NULL,
  CONSTRAINT fk_class_level_category FOREIGN KEY (category_id) REFERENCES class_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_class_level_section FOREIGN KEY (section_id) REFERENCES school_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_categories (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(100) NOT NULL,
  code   VARCHAR(30) NOT NULL UNIQUE,
  weight DECIMAL(6,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_levels (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  section_id VARCHAR(30) NULL
);

-- ----------------------------------------------------------
-- Computer-based examinations
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_bank (
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
);

CREATE TABLE IF NOT EXISTS cbt_examinations (
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
);

CREATE TABLE IF NOT EXISTS cbt_attempts (
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
);

CREATE TABLE IF NOT EXISTS cbt_access_logs (
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
);

CREATE TABLE IF NOT EXISTS cbt_audit_logs (
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
);

CREATE TABLE IF NOT EXISTS cbt_positions (
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
);

-- Recordings are stored on the configured persistent file/object store;
-- this table stores only ownership and file metadata, never video bytes.
CREATE TABLE IF NOT EXISTS cbt_proctoring (
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
);

CREATE TABLE IF NOT EXISTS cbt_monitor_signals (
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
);

-- ----------------------------------------------------------
-- Live-class rooms, participants and WebRTC signaling
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_rooms (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  class_id   INT NOT NULL,
  title      VARCHAR(100) NOT NULL,
  host_id    INT NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_live_room_class_status (class_id, status),
  CONSTRAINT fk_live_room_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_room_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_room_participants (
  room_id      BIGINT NOT NULL,
  user_id      INT NOT NULL,
  joined_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (room_id, user_id),
  CONSTRAINT fk_live_participant_room FOREIGN KEY (room_id) REFERENCES live_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_live_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_signals (
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
);

CREATE TABLE IF NOT EXISTS lms_proctoring (
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
);

CREATE TABLE IF NOT EXISTS portal_config (
  config_key   VARCHAR(100) PRIMARY KEY,
  config_value VARCHAR(255) NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS subjects (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cbt_question_types (
  code      VARCHAR(40) PRIMARY KEY,
  label     VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cbt_difficulties (
  name      VARCHAR(30) PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- Built-in school structure and CBT option lists; these are configuration,
-- not sample accounts or student records. INSERT IGNORE keeps re-imports safe.
INSERT IGNORE INTO school_sections (id, code, name, description) VALUES
  ('primary', 'PRI', 'Primary School', 'Primary 1 to Primary 5'),
  ('jss', 'JSS', 'Junior Secondary School', 'JSS 1 to JSS 3'),
  ('sss', 'SSS', 'Senior Secondary School', 'SS 1 to SS 3');

INSERT IGNORE INTO class_categories (id, name, section_id, description, sort_order) VALUES
  (1, 'Primary Section', 'primary', 'Primary school classes', 1),
  (2, 'Junior Secondary Section', 'jss', 'Junior secondary classes', 2),
  (3, 'Senior Secondary Section', 'sss', 'Senior secondary classes', 3);

INSERT IGNORE INTO class_levels (id, name, category_id, section_id) VALUES
  (1, 'Primary 1', 1, 'primary'), (2, 'Primary 2', 1, 'primary'),
  (3, 'Primary 3', 1, 'primary'), (4, 'Primary 4', 1, 'primary'),
  (5, 'Primary 5', 1, 'primary'), (6, 'JSS1', 2, 'jss'),
  (7, 'JSS2', 2, 'jss'), (8, 'JSS3', 2, 'jss'),
  (9, 'SS1', 3, 'sss'), (10, 'SS2', 3, 'sss'), (11, 'SS3', 3, 'sss');

INSERT IGNORE INTO exam_categories (id, name, code, weight) VALUES
  (1, 'First Continuous Assessment', 'CA1', 20),
  (2, 'Second Continuous Assessment', 'CA2', 20),
  (3, 'Mid-Term Examination', 'MIDTERM', 30),
  (4, 'First Term Examination', 'TERM1', 60),
  (5, 'Second Term Examination', 'TERM2', 60),
  (6, 'Third Term Examination', 'TERM3', 60),
  (7, 'Final Examination', 'FINAL', 100),
  (8, 'Mock Examination', 'MOCK', 100),
  (9, 'Entrance Examination', 'ENTRANCE', 100),
  (10, 'Practice CBT', 'PRACTICE', 0);

INSERT IGNORE INTO exam_levels (id, name, section_id) VALUES
  (1, 'Primary School Level', 'primary'),
  (2, 'Junior Secondary Level', 'jss'),
  (3, 'Senior Secondary Level', 'sss'),
  (4, 'All School Levels', 'all');

INSERT IGNORE INTO subjects (name) VALUES
  ('Mathematics'), ('English Language'), ('Basic Science'), ('Civic Education'),
  ('Computer Studies'), ('Social Studies'), ('Physics'), ('Chemistry'),
  ('Biology'), ('Agricultural Science'), ('Economics'), ('Government'),
  ('Literature in English');

INSERT IGNORE INTO academic_terms (name, sort_order) VALUES
  ('First Term', 1), ('Second Term', 2), ('Third Term', 3), ('Final Examination', 4);

INSERT IGNORE INTO cbt_question_types (code, label) VALUES
  ('multiple_choice', 'Multiple Choice'), ('true_false', 'True / False'),
  ('short_answer', 'Short Answer'), ('theory', 'Theory / Essay');

INSERT IGNORE INTO cbt_difficulties (name, sort_order) VALUES
  ('Easy', 1), ('Medium', 2), ('Hard', 3);

INSERT IGNORE INTO portal_config (config_key, config_value) VALUES
  ('email_domain', 'broadmindcollege.edu');

SET FOREIGN_KEY_CHECKS = 1;
