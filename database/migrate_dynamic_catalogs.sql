USE `broad-mind-private-school`;

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
  name       VARCHAR(30) PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1
);

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