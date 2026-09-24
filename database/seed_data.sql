-- ==========================================================
-- Seed data for the Crestview College portal
-- Generated to match backend/data/seed.js exactly (same demo
-- people, classes, timetable pattern and sample scores).
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Settings (single row)
INSERT INTO settings (id, school_name, motto, session, term, address, phone, email) VALUES
  (1, 'Crestview College', 'Knowledge with character', '2026/2027', 'First Term', '12 Unity Road', '0801 234 5678', 'info@crestview.edu');

-- Classes (form_teacher_id is set further down, once the teachers exist)
INSERT INTO classes (id, name, level) VALUES
  (1, 'JSS 1A', 'Junior'),
  (2, 'JSS 2A', 'Junior'),
  (3, 'SS 1A', 'Senior');

-- Users: 1 principal, 3 teachers, 9 students, 1 parent
INSERT INTO users (id, role, school_id, name, email, password, phone, gender, dob, class_id, parent_id, guardian_name, guardian_phone, address, bio, qualification, status, created_at) VALUES
  (1, 'admin', 'CVC/ADM/001', 'Dr. Adaeze Okonkwo', 'principal@crestview.edu', '$2b$08$ArAWUSsNHuToY5e0oiArpe5I5aqN.mWXe3eTnUUPZgwfoV0Z68AK6', '0803 555 0101', NULL, NULL, NULL, NULL, NULL, NULL, 'Staff quarters, Block A', 'Principal since 2019.', NULL, 'active', NOW() - INTERVAL 400 DAY),
  (2, 'teacher', 'CVC/TCH/001', 'Mr. Tunde Bakare', 'tunde@crestview.edu', '$2b$08$/hYotag3VYl2ulgZC5KL1.RkkGL3G5k5MElHSud.HtXhCoz2cXbl.', '0803 555 0102', NULL, NULL, NULL, NULL, NULL, NULL, '', '', 'B.Sc Mathematics, PGDE', 'active', NOW() - INTERVAL 300 DAY),
  (3, 'teacher', 'CVC/TCH/002', 'Mrs. Ngozi Eze', 'ngozi@crestview.edu', '$2b$08$/hYotag3VYl2ulgZC5KL1.RkkGL3G5k5MElHSud.HtXhCoz2cXbl.', '0803 555 0103', NULL, NULL, NULL, NULL, NULL, NULL, '', '', 'B.A English, PGDE', 'active', NOW() - INTERVAL 300 DAY),
  (4, 'teacher', 'CVC/TCH/003', 'Mr. Ibrahim Musa', 'ibrahim@crestview.edu', '$2b$08$/hYotag3VYl2ulgZC5KL1.RkkGL3G5k5MElHSud.HtXhCoz2cXbl.', '0803 555 0104', NULL, NULL, NULL, NULL, NULL, NULL, '', '', 'B.Sc Integrated Science', 'active', NOW() - INTERVAL 300 DAY),
  (5, 'student', 'CVC/26/001', 'Chinedu Okafor', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Male', '2014-01-15', 1, 14, 'Mr/Mrs Okafor', '0805 555 0110', '3 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 40 DAY),
  (6, 'student', 'CVC/26/002', 'Aisha Bello', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Female', '2014-02-15', 1, NULL, 'Mr/Mrs Bello', '0805 555 0111', '4 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 36 DAY),
  (7, 'student', 'CVC/26/003', 'Tobi Adeyemi', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Male', '2014-03-15', 1, NULL, 'Mr/Mrs Adeyemi', '0805 555 0112', '5 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 32 DAY),
  (8, 'student', 'CVC/26/004', 'Ifeoma Nwosu', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Female', '2013-04-15', 2, NULL, 'Mr/Mrs Nwosu', '0805 555 0113', '6 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 28 DAY),
  (9, 'student', 'CVC/26/005', 'Emeka Obi', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Male', '2013-05-15', 2, NULL, 'Mr/Mrs Obi', '0805 555 0114', '7 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 24 DAY),
  (10, 'student', 'CVC/26/006', 'Fatima Yusuf', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Female', '2013-06-15', 2, NULL, 'Mr/Mrs Yusuf', '0805 555 0115', '8 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 20 DAY),
  (11, 'student', 'CVC/26/007', 'Seun Ogunleye', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Male', '2011-07-15', 3, NULL, 'Mr/Mrs Ogunleye', '0805 555 0116', '9 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 16 DAY),
  (12, 'student', 'CVC/26/008', 'Blessing Udoh', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Female', '2011-08-15', 3, NULL, 'Mr/Mrs Udoh', '0805 555 0117', '10 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 12 DAY),
  (13, 'student', 'CVC/26/009', 'Kelechi Anyanwu', NULL, '$2b$08$bm3YyDHymckOvNXxIh/sM.OdTUndIS01wbNuaWpNkvveL40uj2Y3O', '', 'Male', '2011-09-15', 3, NULL, 'Mr/Mrs Anyanwu', '0805 555 0118', '11 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 8 DAY),
  (14, 'parent', NULL, 'Grace Okafor', 'parent@crestview.edu', '$2b$08$tA/A6dF6VWGqcx2ass3V.uA5AorHNQimAkkFpxmiJVUeBsNwNyXm.', '0805 555 0110', NULL, NULL, NULL, NULL, NULL, NULL, '3 Palm Avenue', NULL, NULL, 'active', NOW() - INTERVAL 40 DAY);

-- Now that the teachers exist, assign each class its form teacher
UPDATE classes SET form_teacher_id = 2 WHERE id = 1;
UPDATE classes SET form_teacher_id = 3 WHERE id = 2;
UPDATE classes SET form_teacher_id = 4 WHERE id = 3;

-- Subject-teacher assignment (same 6 subjects taught the same way in every class)
INSERT INTO class_subjects (class_id, subject, teacher_id) VALUES
  (1, 'Mathematics', 2),
  (1, 'English Language', 3),
  (1, 'Basic Science', 4),
  (1, 'Civic Education', 3),
  (1, 'Computer Studies', 2),
  (1, 'Social Studies', 4),
  (2, 'Mathematics', 2),
  (2, 'English Language', 3),
  (2, 'Basic Science', 4),
  (2, 'Civic Education', 3),
  (2, 'Computer Studies', 2),
  (2, 'Social Studies', 4),
  (3, 'Mathematics', 2),
  (3, 'English Language', 3),
  (3, 'Basic Science', 4),
  (3, 'Civic Education', 3),
  (3, 'Computer Studies', 2),
  (3, 'Social Studies', 4);

-- Timetable (built the same way the app builds it: subject = SUBJECTS[(period + day + offset) % 6])
INSERT INTO timetable_slots (class_id, day, period_index, time_slot, subject) VALUES
  (1, 'Monday', 0, '08:00 - 08:40', 'Mathematics'),
  (1, 'Monday', 1, '08:40 - 09:20', 'English Language'),
  (1, 'Monday', 2, '09:20 - 10:00', 'Basic Science'),
  (1, 'Monday', 3, '10:30 - 11:10', 'Civic Education'),
  (1, 'Monday', 4, '11:10 - 11:50', 'Computer Studies'),
  (1, 'Monday', 5, '11:50 - 12:30', 'Social Studies'),
  (1, 'Tuesday', 0, '08:00 - 08:40', 'English Language'),
  (1, 'Tuesday', 1, '08:40 - 09:20', 'Basic Science'),
  (1, 'Tuesday', 2, '09:20 - 10:00', 'Civic Education'),
  (1, 'Tuesday', 3, '10:30 - 11:10', 'Computer Studies'),
  (1, 'Tuesday', 4, '11:10 - 11:50', 'Social Studies'),
  (1, 'Tuesday', 5, '11:50 - 12:30', 'Mathematics'),
  (1, 'Wednesday', 0, '08:00 - 08:40', 'Basic Science'),
  (1, 'Wednesday', 1, '08:40 - 09:20', 'Civic Education'),
  (1, 'Wednesday', 2, '09:20 - 10:00', 'Computer Studies'),
  (1, 'Wednesday', 3, '10:30 - 11:10', 'Social Studies'),
  (1, 'Wednesday', 4, '11:10 - 11:50', 'Mathematics'),
  (1, 'Wednesday', 5, '11:50 - 12:30', 'English Language'),
  (1, 'Thursday', 0, '08:00 - 08:40', 'Civic Education'),
  (1, 'Thursday', 1, '08:40 - 09:20', 'Computer Studies'),
  (1, 'Thursday', 2, '09:20 - 10:00', 'Social Studies'),
  (1, 'Thursday', 3, '10:30 - 11:10', 'Mathematics'),
  (1, 'Thursday', 4, '11:10 - 11:50', 'English Language'),
  (1, 'Thursday', 5, '11:50 - 12:30', 'Basic Science'),
  (1, 'Friday', 0, '08:00 - 08:40', 'Computer Studies'),
  (1, 'Friday', 1, '08:40 - 09:20', 'Social Studies'),
  (1, 'Friday', 2, '09:20 - 10:00', 'Mathematics'),
  (1, 'Friday', 3, '10:30 - 11:10', 'English Language'),
  (1, 'Friday', 4, '11:10 - 11:50', 'Basic Science'),
  (1, 'Friday', 5, '11:50 - 12:30', 'Civic Education'),
  (2, 'Monday', 0, '08:00 - 08:40', 'Basic Science'),
  (2, 'Monday', 1, '08:40 - 09:20', 'Civic Education'),
  (2, 'Monday', 2, '09:20 - 10:00', 'Computer Studies'),
  (2, 'Monday', 3, '10:30 - 11:10', 'Social Studies'),
  (2, 'Monday', 4, '11:10 - 11:50', 'Mathematics'),
  (2, 'Monday', 5, '11:50 - 12:30', 'English Language'),
  (2, 'Tuesday', 0, '08:00 - 08:40', 'Civic Education'),
  (2, 'Tuesday', 1, '08:40 - 09:20', 'Computer Studies'),
  (2, 'Tuesday', 2, '09:20 - 10:00', 'Social Studies'),
  (2, 'Tuesday', 3, '10:30 - 11:10', 'Mathematics'),
  (2, 'Tuesday', 4, '11:10 - 11:50', 'English Language'),
  (2, 'Tuesday', 5, '11:50 - 12:30', 'Basic Science'),
  (2, 'Wednesday', 0, '08:00 - 08:40', 'Computer Studies'),
  (2, 'Wednesday', 1, '08:40 - 09:20', 'Social Studies'),
  (2, 'Wednesday', 2, '09:20 - 10:00', 'Mathematics'),
  (2, 'Wednesday', 3, '10:30 - 11:10', 'English Language'),
  (2, 'Wednesday', 4, '11:10 - 11:50', 'Basic Science'),
  (2, 'Wednesday', 5, '11:50 - 12:30', 'Civic Education'),
  (2, 'Thursday', 0, '08:00 - 08:40', 'Social Studies'),
  (2, 'Thursday', 1, '08:40 - 09:20', 'Mathematics'),
  (2, 'Thursday', 2, '09:20 - 10:00', 'English Language'),
  (2, 'Thursday', 3, '10:30 - 11:10', 'Basic Science'),
  (2, 'Thursday', 4, '11:10 - 11:50', 'Civic Education'),
  (2, 'Thursday', 5, '11:50 - 12:30', 'Computer Studies'),
  (2, 'Friday', 0, '08:00 - 08:40', 'Mathematics'),
  (2, 'Friday', 1, '08:40 - 09:20', 'English Language'),
  (2, 'Friday', 2, '09:20 - 10:00', 'Basic Science'),
  (2, 'Friday', 3, '10:30 - 11:10', 'Civic Education'),
  (2, 'Friday', 4, '11:10 - 11:50', 'Computer Studies'),
  (2, 'Friday', 5, '11:50 - 12:30', 'Social Studies'),
  (3, 'Monday', 0, '08:00 - 08:40', 'Computer Studies'),
  (3, 'Monday', 1, '08:40 - 09:20', 'Social Studies'),
  (3, 'Monday', 2, '09:20 - 10:00', 'Mathematics'),
  (3, 'Monday', 3, '10:30 - 11:10', 'English Language'),
  (3, 'Monday', 4, '11:10 - 11:50', 'Basic Science'),
  (3, 'Monday', 5, '11:50 - 12:30', 'Civic Education'),
  (3, 'Tuesday', 0, '08:00 - 08:40', 'Social Studies'),
  (3, 'Tuesday', 1, '08:40 - 09:20', 'Mathematics'),
  (3, 'Tuesday', 2, '09:20 - 10:00', 'English Language'),
  (3, 'Tuesday', 3, '10:30 - 11:10', 'Basic Science'),
  (3, 'Tuesday', 4, '11:10 - 11:50', 'Civic Education'),
  (3, 'Tuesday', 5, '11:50 - 12:30', 'Computer Studies'),
  (3, 'Wednesday', 0, '08:00 - 08:40', 'Mathematics'),
  (3, 'Wednesday', 1, '08:40 - 09:20', 'English Language'),
  (3, 'Wednesday', 2, '09:20 - 10:00', 'Basic Science'),
  (3, 'Wednesday', 3, '10:30 - 11:10', 'Civic Education'),
  (3, 'Wednesday', 4, '11:10 - 11:50', 'Computer Studies'),
  (3, 'Wednesday', 5, '11:50 - 12:30', 'Social Studies'),
  (3, 'Thursday', 0, '08:00 - 08:40', 'English Language'),
  (3, 'Thursday', 1, '08:40 - 09:20', 'Basic Science'),
  (3, 'Thursday', 2, '09:20 - 10:00', 'Civic Education'),
  (3, 'Thursday', 3, '10:30 - 11:10', 'Computer Studies'),
  (3, 'Thursday', 4, '11:10 - 11:50', 'Social Studies'),
  (3, 'Thursday', 5, '11:50 - 12:30', 'Mathematics'),
  (3, 'Friday', 0, '08:00 - 08:40', 'Basic Science'),
  (3, 'Friday', 1, '08:40 - 09:20', 'Civic Education'),
  (3, 'Friday', 2, '09:20 - 10:00', 'Computer Studies'),
  (3, 'Friday', 3, '10:30 - 11:10', 'Social Studies'),
  (3, 'Friday', 4, '11:10 - 11:50', 'Mathematics'),
  (3, 'Friday', 5, '11:50 - 12:30', 'English Language');

-- Fee items for this term
INSERT INTO fees (id, title, amount, term, session) VALUES
  (1, 'Tuition fee', 85000.00, 'First Term', '2026/2027'),
  (2, 'PTA levy', 5000.00, 'First Term', '2026/2027'),
  (3, 'Books and materials', 15000.00, 'First Term', '2026/2027'),
  (4, 'Sports and clubs', 3000.00, 'First Term', '2026/2027');

-- Sample payments
INSERT INTO payments (id, student_id, fee_id, amount, method, status, reference, receipt_no, term, session, date) VALUES
  (1, 5, 1, 85000.00, 'Card', 'success', 'CVC-SEED0001', 'RCT-00001', 'First Term', '2026/2027', NOW() - INTERVAL 6 DAY),
  (2, 5, 2, 5000.00, 'Card', 'success', 'CVC-SEED0002', 'RCT-00002', 'First Term', '2026/2027', NOW() - INTERVAL 6 DAY),
  (3, 6, 1, 40000.00, 'Bank transfer', 'success', 'CVC-SEED0003', 'RCT-00003', 'First Term', '2026/2027', NOW() - INTERVAL 5 DAY),
  (4, 7, 3, 15000.00, 'Bank transfer', 'success', 'CVC-SEED0004', 'RCT-00004', 'First Term', '2026/2027', NOW() - INTERVAL 4 DAY),
  (5, 8, 1, 85000.00, 'Card', 'success', 'CVC-SEED0005', 'RCT-00005', 'First Term', '2026/2027', NOW() - INTERVAL 3 DAY),
  (6, 8, 2, 5000.00, 'Card', 'success', 'CVC-SEED0006', 'RCT-00006', 'First Term', '2026/2027', NOW() - INTERVAL 3 DAY),
  (7, 8, 3, 15000.00, 'Card', 'success', 'CVC-SEED0007', 'RCT-00007', 'First Term', '2026/2027', NOW() - INTERVAL 3 DAY),
  (8, 8, 4, 3000.00, 'Card', 'success', 'CVC-SEED0008', 'RCT-00008', 'First Term', '2026/2027', NOW() - INTERVAL 3 DAY),
  (9, 9, 1, 60000.00, 'Bank transfer', 'success', 'CVC-SEED0009', 'RCT-00009', 'First Term', '2026/2027', NOW() - INTERVAL 2 DAY),
  (10, 11, 1, 85000.00, 'Card', 'success', 'CVC-SEED0010', 'RCT-00010', 'First Term', '2026/2027', NOW() - INTERVAL 1 DAY),
  (11, 12, 2, 5000.00, 'Card', 'success', 'CVC-SEED0011', 'RCT-00011', 'First Term', '2026/2027', NOW() - INTERVAL 1 DAY);

-- Results for last term, generated with the same pseudo-random formula seed.js uses,
-- so the numbers match a fresh `npm run seed` exactly.
INSERT INTO results (student_id, class_id, subject, term, session, ca, exam, total, teacher_id) VALUES
  (5, 1, 'Mathematics', 'Third Term', '2025/2026', 31, 55, 86, 2),
  (5, 1, 'English Language', 'Third Term', '2025/2026', 24, 29, 53, 3),
  (5, 1, 'Basic Science', 'Third Term', '2025/2026', 23, 50, 73, 4),
  (5, 1, 'Civic Education', 'Third Term', '2025/2026', 22, 36, 58, 3),
  (5, 1, 'Computer Studies', 'Third Term', '2025/2026', 34, 37, 71, 2),
  (5, 1, 'Social Studies', 'Third Term', '2025/2026', 30, 53, 83, 4),
  (6, 1, 'Mathematics', 'Third Term', '2025/2026', 37, 43, 80, 2),
  (6, 1, 'English Language', 'Third Term', '2025/2026', 24, 41, 65, 3),
  (6, 1, 'Basic Science', 'Third Term', '2025/2026', 27, 45, 72, 4),
  (6, 1, 'Civic Education', 'Third Term', '2025/2026', 23, 52, 75, 3),
  (6, 1, 'Computer Studies', 'Third Term', '2025/2026', 20, 51, 71, 2),
  (6, 1, 'Social Studies', 'Third Term', '2025/2026', 19, 36, 55, 4),
  (7, 1, 'Mathematics', 'Third Term', '2025/2026', 27, 43, 70, 2),
  (7, 1, 'English Language', 'Third Term', '2025/2026', 30, 47, 77, 3),
  (7, 1, 'Basic Science', 'Third Term', '2025/2026', 33, 38, 71, 4),
  (7, 1, 'Civic Education', 'Third Term', '2025/2026', 35, 27, 62, 3),
  (7, 1, 'Computer Studies', 'Third Term', '2025/2026', 19, 39, 58, 2),
  (7, 1, 'Social Studies', 'Third Term', '2025/2026', 35, 29, 64, 4),
  (8, 2, 'Mathematics', 'Third Term', '2025/2026', 34, 46, 80, 2),
  (8, 2, 'English Language', 'Third Term', '2025/2026', 35, 38, 73, 3),
  (8, 2, 'Basic Science', 'Third Term', '2025/2026', 33, 51, 84, 4),
  (8, 2, 'Civic Education', 'Third Term', '2025/2026', 30, 47, 77, 3),
  (8, 2, 'Computer Studies', 'Third Term', '2025/2026', 24, 54, 78, 2),
  (8, 2, 'Social Studies', 'Third Term', '2025/2026', 33, 52, 85, 4),
  (9, 2, 'Mathematics', 'Third Term', '2025/2026', 31, 41, 72, 2),
  (9, 2, 'English Language', 'Third Term', '2025/2026', 33, 35, 68, 3),
  (9, 2, 'Basic Science', 'Third Term', '2025/2026', 22, 42, 64, 4),
  (9, 2, 'Civic Education', 'Third Term', '2025/2026', 22, 38, 60, 3),
  (9, 2, 'Computer Studies', 'Third Term', '2025/2026', 28, 54, 82, 2),
  (9, 2, 'Social Studies', 'Third Term', '2025/2026', 26, 32, 58, 4),
  (10, 2, 'Mathematics', 'Third Term', '2025/2026', 32, 49, 81, 2),
  (10, 2, 'English Language', 'Third Term', '2025/2026', 37, 27, 64, 3),
  (10, 2, 'Basic Science', 'Third Term', '2025/2026', 32, 32, 64, 4),
  (10, 2, 'Civic Education', 'Third Term', '2025/2026', 25, 52, 77, 3),
  (10, 2, 'Computer Studies', 'Third Term', '2025/2026', 25, 28, 53, 2),
  (10, 2, 'Social Studies', 'Third Term', '2025/2026', 27, 53, 80, 4),
  (11, 3, 'Mathematics', 'Third Term', '2025/2026', 30, 27, 57, 2),
  (11, 3, 'English Language', 'Third Term', '2025/2026', 20, 36, 56, 3),
  (11, 3, 'Basic Science', 'Third Term', '2025/2026', 37, 41, 78, 4),
  (11, 3, 'Civic Education', 'Third Term', '2025/2026', 32, 48, 80, 3),
  (11, 3, 'Computer Studies', 'Third Term', '2025/2026', 27, 29, 56, 2),
  (11, 3, 'Social Studies', 'Third Term', '2025/2026', 30, 41, 71, 4),
  (12, 3, 'Mathematics', 'Third Term', '2025/2026', 38, 29, 67, 2),
  (12, 3, 'English Language', 'Third Term', '2025/2026', 35, 51, 86, 3),
  (12, 3, 'Basic Science', 'Third Term', '2025/2026', 31, 29, 60, 4),
  (12, 3, 'Civic Education', 'Third Term', '2025/2026', 35, 46, 81, 3),
  (12, 3, 'Computer Studies', 'Third Term', '2025/2026', 29, 47, 76, 2),
  (12, 3, 'Social Studies', 'Third Term', '2025/2026', 27, 49, 76, 4),
  (13, 3, 'Mathematics', 'Third Term', '2025/2026', 30, 44, 74, 2),
  (13, 3, 'English Language', 'Third Term', '2025/2026', 37, 29, 66, 3),
  (13, 3, 'Basic Science', 'Third Term', '2025/2026', 25, 47, 72, 4),
  (13, 3, 'Civic Education', 'Third Term', '2025/2026', 29, 35, 64, 3),
  (13, 3, 'Computer Studies', 'Third Term', '2025/2026', 24, 39, 63, 2),
  (13, 3, 'Social Studies', 'Third Term', '2025/2026', 32, 34, 66, 4);

-- Quizzes and tests
INSERT INTO quizzes (id, title, subject, class_id, teacher_id, type, duration_mins, due_date, created_at) VALUES
  (1, 'Algebra basics quiz', 'Mathematics', 1, 2, 'Quiz', 15, CURDATE() + INTERVAL 10 DAY, NOW() - INTERVAL 3 DAY),
  (2, 'Grammar and comprehension test', 'English Language', 1, 3, 'Test', 20, CURDATE() + INTERVAL 7 DAY, NOW() - INTERVAL 2 DAY),
  (3, 'Introduction to computers', 'Computer Studies', 3, 2, 'Quiz', 10, CURDATE() + INTERVAL 14 DAY, NOW() - INTERVAL 1 DAY);

INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, answer_index) VALUES
  (1, 'Solve: 2x + 6 = 14', 'x = 2', 'x = 4', 'x = 6', 'x = 10', 1),
  (1, 'What is the value of 3² + 4²?', '7', '12', '25', '49', 2),
  (1, 'Simplify: 5a + 3a - 2a', '6a', '8a', '10a', '4a', 0),
  (1, 'What is 25% of 240?', '50', '60', '75', '80', 1),
  (1, 'Which of these numbers is prime?', '21', '27', '29', '33', 2),
  (2, 'Choose the correct sentence.', 'She go to school daily.', 'She goes to school daily.', 'She going to school daily.', 'She gone to school daily.', 1),
  (2, 'A word that describes a noun is called…', 'a verb', 'an adverb', 'an adjective', 'a pronoun', 2),
  (2, 'What is the plural of "child"?', 'childs', 'childes', 'children', 'childrens', 2),
  (2, 'Choose the word opposite in meaning to "generous".', 'Kind', 'Stingy', 'Rich', 'Happy', 1),
  (3, 'Which device is used to type text into a computer?', 'Monitor', 'Keyboard', 'Speaker', 'Printer', 1),
  (3, 'What does CPU stand for?', 'Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility', 0),
  (3, 'Which of these is an output device?', 'Mouse', 'Scanner', 'Monitor', 'Microphone', 2),
  (3, 'Software used to browse the internet is called a…', 'browser', 'compiler', 'router', 'firewall', 0);

-- One sample submission, so the LMS pages have something to show
INSERT INTO submissions (quiz_id, student_id, answers, score, total, submitted_at) VALUES
  (1, 5, '[1, 2, 0, 0, 2]', 4, 5, NOW() - INTERVAL 1 DAY);

-- Notice board
INSERT INTO announcements (title, body, author, posted_by, date) VALUES
  ('Welcome back to the new session', 'Classes are in full swing. Students should be in full school uniform every day.', 'Dr. Adaeze Okonkwo', 1, NOW() - INTERVAL 6 DAY),
  ('First-term fees', 'Please complete first-term fee payments before the end of October. Receipts can be downloaded from the portal.', 'Dr. Adaeze Okonkwo', 1, NOW() - INTERVAL 4 DAY),
  ('Inter-house sports trials', 'Trials hold next week. See your sports teacher to register.', 'Dr. Adaeze Okonkwo', 1, NOW() - INTERVAL 1 DAY);

SET FOREIGN_KEY_CHECKS = 1;

-- Demo logins (all use the school's normal sign-in form):
--   Principal : principal@crestview.edu / admin123
--   Teacher   : tunde@crestview.edu     / teacher123
--   Student   : CVC/26/001              / student123
--   Parent    : parent@crestview.edu    / parent123
