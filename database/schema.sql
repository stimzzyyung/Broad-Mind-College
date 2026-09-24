-- ==========================================================
-- Broad Mind Private School portal — MySQL schema
-- Mirrors the data currently kept in backend/data/db.json
-- (users, classes, fees, payments, results, the LMS and
-- notifications), normalised into proper tables.
--
-- Import order: this file first, then seed_data.sql.
-- Works in phpMyAdmin: open phpMyAdmin -> Import -> choose this
-- file -> Go, then repeat for seed_data.sql.
-- ==========================================================

CREATE DATABASE IF NOT EXISTS crestview_portal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crestview_portal;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------
-- Single-row table for the school's own settings
-- ----------------------------------------------------------
DROP TABLE IF EXISTS settings;
CREATE TABLE settings (
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
-- Classes. form_teacher_id points at users.id, added as a
-- foreign key further down once the users table exists
-- (the two tables reference each other).
-- ----------------------------------------------------------
DROP TABLE IF EXISTS classes;
CREATE TABLE classes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(50) NOT NULL UNIQUE,   -- e.g. 'JSS 1A'
  level           VARCHAR(20) DEFAULT '',        -- 'Junior' / 'Senior'
  form_teacher_id INT NULL
);

-- ----------------------------------------------------------
-- Everybody who can log in: principal, teachers, students, parents.
-- Columns that don't apply to a role are simply left NULL
-- (e.g. a teacher has no dob, a parent has no schoolId).
-- ----------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
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

ALTER TABLE classes
  ADD CONSTRAINT fk_classes_form_teacher FOREIGN KEY (form_teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------
-- Which teacher takes which subject, in which class
-- ----------------------------------------------------------
DROP TABLE IF EXISTS class_subjects;
CREATE TABLE class_subjects (
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
DROP TABLE IF EXISTS timetable_slots;
CREATE TABLE timetable_slots (
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
DROP TABLE IF EXISTS fees;
CREATE TABLE fees (
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
DROP TABLE IF EXISTS payments;
CREATE TABLE payments (
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
  date        DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_fee     FOREIGN KEY (fee_id)     REFERENCES fees(id)  ON DELETE CASCADE,
  INDEX idx_payments_student (student_id)
);

-- ----------------------------------------------------------
-- One row per student, per subject, per term
-- ----------------------------------------------------------
DROP TABLE IF EXISTS results;
CREATE TABLE results (
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
DROP TABLE IF EXISTS quizzes;
CREATE TABLE quizzes (
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

DROP TABLE IF EXISTS quiz_questions;
CREATE TABLE quiz_questions (
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

DROP TABLE IF EXISTS submissions;
CREATE TABLE submissions (
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
DROP TABLE IF EXISTS announcements;
CREATE TABLE announcements (
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
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
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
