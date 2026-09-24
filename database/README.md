# Crestview College portal — MySQL database

Two files here, meant to be imported in order:

1. `schema.sql` — creates the `crestview_portal` database and all 13 tables
   (users, classes, fees, payments, results, the LMS tables, announcements,
   notifications, and so on), with the foreign keys between them.
2. `seed_data.sql` — fills those tables with the same demo data the app's
   `npm run seed` creates: 1 principal, 3 teachers, 9 students, 1 parent,
   3 classes with timetables, 4 fee items, sample payments, one term of
   results, 3 quizzes/tests, and 3 notice-board posts.

## Importing in phpMyAdmin

1. Open phpMyAdmin.
2. Click **Import** in the top menu (you don't need to create the database
   first — `schema.sql` does that with `CREATE DATABASE IF NOT EXISTS`).
3. Choose `schema.sql`, leave the format as SQL, click **Go**.
4. Once that finishes, click **Import** again, choose `seed_data.sql`, and
   click **Go**.
5. Open the `crestview_portal` database in the left sidebar — you should see
   13 tables, with `users` holding 14 rows, `classes` holding 3, and so on.

If you'd rather use the command line instead of the phpMyAdmin UI:

```
mysql -u root -p < schema.sql
mysql -u root -p < seed_data.sql
```

## Demo logins

The seeded passwords are real bcrypt hashes for these plain-text passwords,
matching what the Node app's own seed script generates:

| Role      | Login              | Password    |
|-----------|--------------------|-------------|
| Principal | principal@crestview.edu | admin123    |
| Teacher   | tunde@crestview.edu     | teacher123  |
| Student   | CVC/26/001              | student123  |
| Parent    | parent@crestview.edu    | parent123   |

## About the schema

It mirrors the JSON shape the app currently keeps in `backend/data/db.json`,
just normalised into tables:

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

## Important: this is the database, not yet the app's data source

Right now the Node/Express backend still reads and writes
`backend/data/db.json` — it does **not** talk to this MySQL database. This
SQL gives you a real, correctly-structured database you can browse, query
and build reports against in phpMyAdmin today.

Connecting the running app to it instead of the JSON file is a separate,
bigger job: every route file (`backend/routes/*.js`) currently reads the
whole `db.json` into memory and filters it with plain JavaScript array
methods; switching to MySQL means rewriting `backend/data/db.js` to open a
real connection (with a driver such as `mysql2`) and rewriting each route to
run SQL queries instead. I can do that next if you'd like the live app
running on this database — just say the word and let me know your MySQL
host/port/username so I can wire up the connection details.
