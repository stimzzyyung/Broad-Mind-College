# Broad Mind Private School MySQL schema

`schema.sql` creates the `broad-mind-private-school` database and its portal
tables. It initializes standard school-section and CBT lookup options, but
does not insert demo users, payments, exams, results, or drop existing tables.
The schema includes users, classes, fees, payments, results, LMS, CBT,
proctoring metadata, notifications, and live-class signaling.

## Upload with phpMyAdmin

1. Select **Import** in phpMyAdmin.
2. Choose `schema.sql` and click **Go**.
3. Confirm that `broad-mind-private-school` and its 30 tables were created.
4. Import your real school records and current school settings into the tables.

You can also run it from a terminal:

```sh
mysql -u YOUR_MYSQL_USER -p < schema.sql
```

The script uses `CREATE TABLE IF NOT EXISTS`; it will not erase rows from
existing tables. It will not automatically alter a table that already exists
with a different structure. Back up the database before applying future
schema changes.

## Connect the backend

From the `backend` directory, copy `.env.example` to `.env`, then set the
MySQL host, port, username, password, and database name for your server:

```powershell
Copy-Item .env.example .env
```

Set `DB_NAME=broad-mind-private-school`. Keep the real password in `.env`, not
in source control. Then start the API with `npm start`. It checks that MySQL
is reachable and that all required tables exist before listening. Check
`/api/health` for database readiness.

The API uses the records stored in these MySQL tables. It does not create a
default administrator, school settings, or sample accounts; import your real
users and the current `settings` row before expecting portal logins and
term-specific pages to work. The imported schema and existing data must match
the columns in `schema.sql`; `IF NOT EXISTS` does not upgrade older tables.

## Important

No demo user, password, payment, result, or assessment data is included.
Only standard lookup options are initialized by the schema.

Exam video files are stored outside MySQL. The schema stores only recording
metadata; configure `PROCTORING_DIR` to a persistent storage path on the
backend server.