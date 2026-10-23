# NithyaSeva database migrations

## Important: preserve the existing database

The original schema is in `schema.sql`. It creates the original core tables:
`users`, `worker_profiles`, `jobs`, `job_assignments`, `payments`, and `reviews`.

**For an already-running NithyaSeva database, do not drop the database and do not re-run setup as a reset.** Apply new versioned migrations only. Migration `002_phase2_marketplace_trust.sql` is additive and uses `IF NOT EXISTS`/conflict-safe statements so it can be rerun if needed.

## Apply migration 002 on Windows

1. Keep your running application windows open; the migration does not require changes to the frontend or authentication APIs.
2. Open a separate Command Prompt, or use Window 1 if no other command is running.
3. Connect to your existing database (enter the PostgreSQL password when prompted):

```bat
psql -U postgres -d nithyaseva
```

4. From the PostgreSQL prompt, run the migration using the actual path to your project. For the documented local setup:

```sql
\i 'C:/Users/HP/NithyaSeva/server/database/migrations/002_phase2_marketplace_trust.sql'
```

5. Confirm the new tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'service_categories', 'job_media', 'job_applications',
    'job_agreements', 'ledger_entries', 'disputes',
    'notifications', 'audit_logs', 'schema_migrations'
  )
ORDER BY table_name;
```

6. Check that the original core tables still exist and your user count remains intact:

```sql
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'worker_profiles', COUNT(*) FROM worker_profiles
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'job_assignments', COUNT(*) FROM job_assignments
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews;
```

Exit with `\q` when done.

## What migration 002 adds

- Service category catalog and nullable `jobs.category_id` mapping while retaining the original `jobs.category` text field.
- Job media and worker job applications.
- Job agreements.
- Ledger entries linked to existing payments/jobs/users.
- Disputes, notifications and audit logs.
- Foreign keys, validation checks, uniqueness rules and indexes.
- A `schema_migrations` record for the applied migration.

This migration does not change the login/register routes, remove existing tables, reset data, or change the homepage. It does not implement payment processing or expose new API endpoints; those are later application-layer work.

## Migration practice

- Back up the database before applying schema changes.
- Apply migrations in version order.
- Never edit an already-applied migration in a shared/deployed database; add a new numbered migration for later changes.
- Do not store passwords, JWT secrets, payment credentials, or other secrets in migration files or audit-log details.
