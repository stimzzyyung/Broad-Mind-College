"""
Generates seed_data.sql — INSERT statements that mirror backend/data/seed.js
exactly (same people, classes, timetable pattern, fees, deterministic sample
scores, quizzes and announcements), so importing this gives you the same demo
data the Node app seeds into data/db.json on first run.

Run with: python3 generate_seed.py > seed_data_inserts.sql
"""
import crypt

def bcrypt_hash(password, cost=8):
    salt = crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=2 ** cost)
    return crypt.crypt(password, salt)

def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

out = []
def emit(line=''):
    out.append(line)

SUBJECTS = ['Mathematics', 'English Language', 'Basic Science', 'Civic Education', 'Computer Studies', 'Social Studies']
TEACHER_FOR = {
    'Mathematics': 2, 'Computer Studies': 2,
    'English Language': 3, 'Civic Education': 3,
    'Basic Science': 4, 'Social Studies': 4,
}

# ---------- Passwords (bcrypt, cost 8 — same convention as bcrypt.hashSync(plain, 8)) ----------
PW = {
    'admin123': bcrypt_hash('admin123'),
    'teacher123': bcrypt_hash('teacher123'),
    'student123': bcrypt_hash('student123'),
    'parent123': bcrypt_hash('parent123'),
}

emit("-- ==========================================================")
emit("-- Seed data for the Crestview College portal")
emit("-- Generated to match backend/data/seed.js exactly (same demo")
emit("-- people, classes, timetable pattern and sample scores).")
emit("-- ==========================================================")
emit()
emit("SET FOREIGN_KEY_CHECKS = 0;")
emit()

# ---------- settings ----------
emit("-- Settings (single row)")
emit("INSERT INTO settings (id, school_name, motto, session, term, address, phone, email) VALUES")
emit(f"  (1, {esc('Crestview College')}, {esc('Knowledge with character')}, {esc('2026/2027')}, {esc('First Term')}, {esc('12 Unity Road')}, {esc('0801 234 5678')}, {esc('info@crestview.edu')});")
emit()

# ---------- classes (form_teacher_id filled in later, after users exist) ----------
emit("-- Classes (form_teacher_id is set further down, once the teachers exist)")
emit("INSERT INTO classes (id, name, level) VALUES")
emit("  (1, 'JSS 1A', 'Junior'),")
emit("  (2, 'JSS 2A', 'Junior'),")
emit("  (3, 'SS 1A', 'Senior');")
emit()

# ---------- users ----------
emit("-- Users: 1 principal, 3 teachers, 9 students, 1 parent")
emit("INSERT INTO users (id, role, school_id, name, email, password, phone, gender, dob, class_id, parent_id, guardian_name, guardian_phone, address, bio, qualification, status, created_at) VALUES")

rows = []
# admin
rows.append(f"(1, 'admin', 'CVC/ADM/001', {esc('Dr. Adaeze Okonkwo')}, {esc('principal@crestview.edu')}, {esc(PW['admin123'])}, {esc('0803 555 0101')}, NULL, NULL, NULL, NULL, NULL, NULL, {esc('Staff quarters, Block A')}, {esc('Principal since 2019.')}, NULL, 'active', NOW() - INTERVAL 400 DAY)")

teachers = [
    (2, 'Mr. Tunde Bakare', 'tunde@crestview.edu', '0803 555 0102', 'B.Sc Mathematics, PGDE'),
    (3, 'Mrs. Ngozi Eze', 'ngozi@crestview.edu', '0803 555 0103', 'B.A English, PGDE'),
    (4, 'Mr. Ibrahim Musa', 'ibrahim@crestview.edu', '0803 555 0104', 'B.Sc Integrated Science'),
]
for i, (tid, name, email, phone, qual) in enumerate(teachers):
    school_id = f"CVC/TCH/00{i + 1}"
    rows.append(f"({tid}, 'teacher', {esc(school_id)}, {esc(name)}, {esc(email)}, {esc(PW['teacher123'])}, {esc(phone)}, NULL, NULL, NULL, NULL, NULL, NULL, '', '', {esc(qual)}, 'active', NOW() - INTERVAL 300 DAY)")

students = [
    ('Chinedu Okafor', 'Male', 1), ('Aisha Bello', 'Female', 1), ('Tobi Adeyemi', 'Male', 1),
    ('Ifeoma Nwosu', 'Female', 2), ('Emeka Obi', 'Male', 2), ('Fatima Yusuf', 'Female', 2),
    ('Seun Ogunleye', 'Male', 3), ('Blessing Udoh', 'Female', 3), ('Kelechi Anyanwu', 'Male', 3),
]
birth_year = [0, 2014, 2013, 2011]
for i, (name, gender, class_id) in enumerate(students):
    sid = 5 + i
    school_id = f"CVC/26/{str(i + 1).zfill(3)}"
    dob = f"{birth_year[class_id]}-0{(i % 9) + 1}-15"
    parent_id = 14 if name == 'Chinedu Okafor' else None
    guardian_name = f"Mr/Mrs {name.split(' ')[1]}"
    guardian_phone = f"0805 555 01{10 + i}"
    address = f"{i + 3} Palm Avenue"
    days_ago = 40 - i * 4
    rows.append(
        f"({sid}, 'student', {esc(school_id)}, {esc(name)}, NULL, {esc(PW['student123'])}, '', {esc(gender)}, {esc(dob)}, "
        f"{class_id}, {parent_id if parent_id else 'NULL'}, {esc(guardian_name)}, {esc(guardian_phone)}, {esc(address)}, NULL, NULL, 'active', NOW() - INTERVAL {days_ago} DAY)"
    )

# parent (id 14)
rows.append(f"(14, 'parent', NULL, {esc('Grace Okafor')}, {esc('parent@crestview.edu')}, {esc(PW['parent123'])}, {esc('0805 555 0110')}, NULL, NULL, NULL, NULL, NULL, NULL, {esc('3 Palm Avenue')}, NULL, NULL, 'active', NOW() - INTERVAL 40 DAY)")

emit(",\n".join("  " + r for r in rows) + ";")
emit()

emit("-- Now that the teachers exist, assign each class its form teacher")
emit("UPDATE classes SET form_teacher_id = 2 WHERE id = 1;")
emit("UPDATE classes SET form_teacher_id = 3 WHERE id = 2;")
emit("UPDATE classes SET form_teacher_id = 4 WHERE id = 3;")
emit()

# ---------- class_subjects ----------
emit("-- Subject-teacher assignment (same 6 subjects taught the same way in every class)")
emit("INSERT INTO class_subjects (class_id, subject, teacher_id) VALUES")
cs_rows = []
for class_id in (1, 2, 3):
    for subj in SUBJECTS:
        cs_rows.append(f"  ({class_id}, {esc(subj)}, {TEACHER_FOR[subj]})")
emit(",\n".join(cs_rows) + ";")
emit()

# ---------- timetable_slots ----------
PERIODS = ['08:00 - 08:40', '08:40 - 09:20', '09:20 - 10:00', '10:30 - 11:10', '11:10 - 11:50', '11:50 - 12:30']
WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

emit("-- Timetable (built the same way the app builds it: subject = SUBJECTS[(period + day + offset) % 6])")
emit("INSERT INTO timetable_slots (class_id, day, period_index, time_slot, subject) VALUES")
tt_rows = []
for class_index, class_id in enumerate((1, 2, 3)):
    offset = class_index * 2
    for day_index, day in enumerate(WEEKDAYS):
        for period_index, time_slot in enumerate(PERIODS):
            subject = SUBJECTS[(period_index + day_index + offset) % len(SUBJECTS)]
            tt_rows.append(f"  ({class_id}, {esc(day)}, {period_index}, {esc(time_slot)}, {esc(subject)})")
emit(",\n".join(tt_rows) + ";")
emit()

# ---------- fees ----------
emit("-- Fee items for this term")
emit("INSERT INTO fees (id, title, amount, term, session) VALUES")
emit("  (1, 'Tuition fee', 85000.00, 'First Term', '2026/2027'),")
emit("  (2, 'PTA levy', 5000.00, 'First Term', '2026/2027'),")
emit("  (3, 'Books and materials', 15000.00, 'First Term', '2026/2027'),")
emit("  (4, 'Sports and clubs', 3000.00, 'First Term', '2026/2027');")
emit()

# ---------- payments ----------
emit("-- Sample payments")
emit("INSERT INTO payments (id, student_id, fee_id, amount, method, status, reference, receipt_no, term, session, date) VALUES")
payment_defs = [
    (5, 1, 85000, 'Card', 6), (5, 2, 5000, 'Card', 6),
    (6, 1, 40000, 'Bank transfer', 5),
    (7, 3, 15000, 'Bank transfer', 4),
    (8, 1, 85000, 'Card', 3), (8, 2, 5000, 'Card', 3), (8, 3, 15000, 'Card', 3), (8, 4, 3000, 'Card', 3),
    (9, 1, 60000, 'Bank transfer', 2),
    (11, 1, 85000, 'Card', 1),
    (12, 2, 5000, 'Card', 1),
]
p_rows = []
for i, (student_id, fee_id, amount, method, days) in enumerate(payment_defs, start=1):
    ref = f"CVC-SEED{str(i).zfill(4)}"
    receipt = f"RCT-{str(i).zfill(5)}"
    p_rows.append(f"  ({i}, {student_id}, {fee_id}, {amount}.00, {esc(method)}, 'success', {esc(ref)}, {esc(receipt)}, 'First Term', '2026/2027', NOW() - INTERVAL {days} DAY)")
emit(",\n".join(p_rows) + ";")
emit()

# ---------- results (deterministic LCG, identical to seed.js) ----------
emit("-- Results for last term, generated with the same pseudo-random formula seed.js uses,")
emit("-- so the numbers match a fresh `npm run seed` exactly.")
emit("INSERT INTO results (student_id, class_id, subject, term, session, ca, exam, total, teacher_id) VALUES")

seed_num = 11
def rnd():
    global seed_num
    seed_num = (seed_num * 9301 + 49297) % 233280
    return seed_num / 233280

def js_round(x):
    import math
    return math.floor(x + 0.5)

student_class = {5: 1, 6: 1, 7: 1, 8: 2, 9: 2, 10: 2, 11: 3, 12: 3, 13: 3}
r_rows = []
for sid in range(5, 14):
    class_id = student_class[sid]
    for subj in SUBJECTS:
        ca = js_round(18 + rnd() * 20)
        exam = js_round(26 + rnd() * 32)
        total = ca + exam
        teacher_id = TEACHER_FOR[subj]
        r_rows.append(f"  ({sid}, {class_id}, {esc(subj)}, 'Third Term', '2025/2026', {ca}, {exam}, {total}, {teacher_id})")
emit(",\n".join(r_rows) + ";")
emit()

# ---------- quizzes + questions ----------
emit("-- Quizzes and tests")
emit("INSERT INTO quizzes (id, title, subject, class_id, teacher_id, type, duration_mins, due_date, created_at) VALUES")
emit("  (1, 'Algebra basics quiz', 'Mathematics', 1, 2, 'Quiz', 15, CURDATE() + INTERVAL 10 DAY, NOW() - INTERVAL 3 DAY),")
emit("  (2, 'Grammar and comprehension test', 'English Language', 1, 3, 'Test', 20, CURDATE() + INTERVAL 7 DAY, NOW() - INTERVAL 2 DAY),")
emit("  (3, 'Introduction to computers', 'Computer Studies', 3, 2, 'Quiz', 10, CURDATE() + INTERVAL 14 DAY, NOW() - INTERVAL 1 DAY);")
emit()

emit("INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, answer_index) VALUES")
questions = [
    (1, 'Solve: 2x + 6 = 14', ['x = 2', 'x = 4', 'x = 6', 'x = 10'], 1),
    (1, 'What is the value of 3\u00b2 + 4\u00b2?', ['7', '12', '25', '49'], 2),
    (1, 'Simplify: 5a + 3a - 2a', ['6a', '8a', '10a', '4a'], 0),
    (1, 'What is 25% of 240?', ['50', '60', '75', '80'], 1),
    (1, 'Which of these numbers is prime?', ['21', '27', '29', '33'], 2),
    (2, 'Choose the correct sentence.', ['She go to school daily.', 'She goes to school daily.', 'She going to school daily.', 'She gone to school daily.'], 1),
    (2, 'A word that describes a noun is called\u2026', ['a verb', 'an adverb', 'an adjective', 'a pronoun'], 2),
    (2, 'What is the plural of "child"?', ['childs', 'childes', 'children', 'childrens'], 2),
    (2, 'Choose the word opposite in meaning to "generous".', ['Kind', 'Stingy', 'Rich', 'Happy'], 1),
    (3, 'Which device is used to type text into a computer?', ['Monitor', 'Keyboard', 'Speaker', 'Printer'], 1),
    (3, 'What does CPU stand for?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'], 0),
    (3, 'Which of these is an output device?', ['Mouse', 'Scanner', 'Monitor', 'Microphone'], 2),
    (3, 'Software used to browse the internet is called a\u2026', ['browser', 'compiler', 'router', 'firewall'], 0),
]
q_rows = []
for quiz_id, question, options, answer_index in questions:
    a, b, c, d = options
    q_rows.append(f"  ({quiz_id}, {esc(question)}, {esc(a)}, {esc(b)}, {esc(c)}, {esc(d)}, {answer_index})")
emit(",\n".join(q_rows) + ";")
emit()

emit("-- One sample submission, so the LMS pages have something to show")
emit("INSERT INTO submissions (quiz_id, student_id, answers, score, total, submitted_at) VALUES")
emit("  (1, 5, '[1, 2, 0, 0, 2]', 4, 5, NOW() - INTERVAL 1 DAY);")
emit()

# ---------- announcements ----------
emit("-- Notice board")
emit("INSERT INTO announcements (title, body, author, posted_by, date) VALUES")
emit(f"  ({esc('Welcome back to the new session')}, {esc('Classes are in full swing. Students should be in full school uniform every day.')}, {esc('Dr. Adaeze Okonkwo')}, 1, NOW() - INTERVAL 6 DAY),")
emit(f"  ({esc('First-term fees')}, {esc('Please complete first-term fee payments before the end of October. Receipts can be downloaded from the portal.')}, {esc('Dr. Adaeze Okonkwo')}, 1, NOW() - INTERVAL 4 DAY),")
emit(f"  ({esc('Inter-house sports trials')}, {esc('Trials hold next week. See your sports teacher to register.')}, {esc('Dr. Adaeze Okonkwo')}, 1, NOW() - INTERVAL 1 DAY);")
emit()

emit("SET FOREIGN_KEY_CHECKS = 1;")
emit()
emit("-- Demo logins (all use the school's normal sign-in form):")
emit("--   Principal : principal@crestview.edu / admin123")
emit("--   Teacher   : tunde@crestview.edu     / teacher123")
emit("--   Student   : CVC/26/001              / student123")
emit("--   Parent    : parent@crestview.edu    / parent123")

print("\n".join(out))
