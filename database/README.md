# Broad-Mind (BMS) portal — MySQL database

Two files here, meant to be imported in order:

1. `schema.sql` — creates the `broadmind_college` database and all 14 tables
   (users, classes, fees, payments, results, the LMS tables, announcements,
   notifications, and so on), with the foreign keys between them.
   `portal_extensions` persists additional CBT collections used by the API.
2. `seed_data.sql` — fills the core school and LMS tables with the SQL demo
   records: 1 principal, 3 teachers, 9 students, 1 parent,
   3 classes with timetables, 4 fee items, sample payments, one term of
   results, 3 quizzes/tests, and 3 notice-board posts.

## Importing into WAMP

> **Warning:** `schema.sql` drops and recreates the portal tables. Back up an
> existing database before importing it. `npm run seed` also replaces the
> current portal records with the project's sample dataset.

1. Start WAMP and make sure its MySQL service is running.
2. Open phpMyAdmin from the WAMP menu (usually `http://localhost/phpmyadmin`).
3. Click **Import** in the top menu (you don't need to create the database
   first — `schema.sql` does that with `CREATE DATABASE IF NOT EXISTS`).
4. Choose `schema.sql`, leave the format as SQL, click **Go**.
5. Once that finishes, click **Import** again, choose `seed_data.sql`, and
   click **Go**.
6. Open the `broadmind_college` database in the left sidebar — you should see
   14 tables, with `users` holding 14 rows and `classes` holding 3.

If you'd rather use the command line instead of the phpMyAdmin UI:

```
mysql -u root -p < schema.sql
mysql -u root -p < seed_data.sql
```

For a fresh local setup, you can run `npm run seed` from `backend` without
creating the database first. The command creates `DB_NAME` if needed and
installs the schema only when the database has no tables; then it seeds the
complete project dataset, including additional CBT classes, students,
question bank, and exams. The MySQL user must have permission to create a
database and tables. Alternatively, import `schema.sql` first and then run
`npm run seed`. Do not import `seed_data.sql` as well if you ran the Node
seed command.

## Connecting the API

Copy `backend/.env.example` to `backend/.env`. The defaults use WAMP's common
local settings (`127.0.0.1:3306`, user `root`, no password, database
`broadmind_college`); update them if your MySQL credentials differ. Install
backend packages with `npm install`, then start the API with `npm run dev`.
In a second terminal, install the frontend packages in `frontend` and run
its `npm run dev` command.
The API now reads and writes MySQL; it no longer auto-creates or uses
`backend/data/db.json` as its runtime database. Each API request loads its
data from MySQL, and successful changes are committed before the response is
sent. The API fails at startup if it cannot connect to MySQL, and returns a
clear setup error if the schema has no settings row.

The SQL seed includes the sample records already supplied with the project;
it is demonstration data, not real student records. Replace it with
school-approved data before production use.

For Korapay checkout, add your Korapay **secret** API key as
`KORAPAY_SECRET_KEY` in `backend/.env`. Keep it server-side; never add it to
the frontend. The fee checkout redirects customers to Korapay and verifies
the returned transaction with Korapay's API before recording payment.
Payments are in NGN. Create test keys in Korapay's merchant dashboard for
testing, and switch to live keys only after your merchant account is
approved and ready for production.

## Demo logins

The seeded passwords are real bcrypt hashes for these plain-text passwords,
matching what the Node app's own seed script generates:

| Role      | Login              | Password    |
|-----------|--------------------|-------------|
| Principal | principal@broadmindcollege.edu | admin123    |
| Teacher   | tunde@broadmindcollege.edu     | teacher123  |
| Student   | BMS/26/001                     | student123  |
| Parent    | parent@broadmindcollege.edu    | parent123   |

## About the schema

It maps the portal's application data model into normalized tables:

- `settings` — one row, the school's name/motto/current term.
- `classes` / `class_subjects` / `timetable_slots` — a class, the
  subject-teacher pairing for it, and its weekly timetable.
- `users` — every person who can log in (principal, teachers, students,
  parents), distinguished by the `role` column. A student's `class_id`
  points at `classes`, and `parent_id` points at the parent's own row in
  this same table.
- `fees` / `payments` — fee items for a term, and payments made towards
  them.
- `results` — one row per student, per subject, per term. Grades (A1, B2,
  C4, ...) aren't stored; they're calculated from the score whenever a
  result is shown, exactly like the app already does, so the grading scale
  can change later without rewriting old rows.
- `quizzes` / `quiz_questions` / `submissions` — the LMS.
- `announcements` — the notice board.
- `notifications` — the bell-icon notifications, one row per person per
  notification.

`backend/data/db.js` maps the API data model to these relational
tables, with CBT-specific extension fields stored in the `portal_extensions`
JSON column so no CBT data is discarded. The provided SQL and seed account
passwords are for local development only; change them before deployment.
