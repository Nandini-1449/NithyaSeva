-- Allow one customer and one worker account to share an email address.
-- Preserve existing user records and prevent duplicate accounts of the same type.
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users
        GROUP BY lower(trim(email)), role
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot apply migration 003: duplicate email addresses exist for the same account type after normalization. Resolve those duplicates first.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM users
        WHERE role = 'admin'
        GROUP BY lower(trim(email))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot apply migration 003: duplicate admin email addresses exist after normalization. Resolve those duplicates first.';
    END IF;
END $$;

UPDATE users
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_role_customer_worker_uidx
    ON users (lower(email), role)
    WHERE role IN ('customer', 'worker');

CREATE UNIQUE INDEX IF NOT EXISTS users_email_admin_uidx
    ON users (lower(email))
    WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(80) PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES ('003_allow_same_email_customer_worker', 'Allow one customer and one worker account to share an email address')
ON CONFLICT (version) DO NOTHING;

COMMIT;
