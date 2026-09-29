USE `broad-mind-private-school`;

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