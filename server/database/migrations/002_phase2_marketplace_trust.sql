-- NithyaSeva Phase 2 additive migration
-- Safe to re-run. Preserves existing users, profiles, jobs, assignments, payments and reviews.
-- Apply to the existing nithyaseva database with psql; see server/database/README.md.

BEGIN;

CREATE TABLE IF NOT EXISTS service_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(110) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(trim(name)) > 0),
    CHECK (length(trim(slug)) > 0)
);

-- Preserve existing free-text categories while introducing a normalized category catalog.
INSERT INTO service_categories (name, slug)
SELECT DISTINCT trim(category),
       trim(both '-' FROM regexp_replace(lower(trim(category)), '[^a-z0-9]+', '-', 'g'))
FROM jobs
WHERE category IS NOT NULL AND trim(category) <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category_id BIGINT;
UPDATE jobs j
SET category_id = sc.id
FROM service_categories sc
WHERE j.category_id IS NULL
  AND lower(trim(j.category)) = lower(trim(sc.name));
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_category_id_fkey') THEN
        ALTER TABLE jobs ADD CONSTRAINT jobs_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_jobs_category_id ON jobs(category_id);

CREATE TABLE IF NOT EXISTS job_media (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(20) NOT NULL DEFAULT 'image'
        CHECK (media_type IN ('image', 'video', 'document')),
    alt_text VARCHAR(250),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(trim(media_url)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_job_media_job_sort ON job_media(job_id, sort_order);

CREATE TABLE IF NOT EXISTS job_applications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    worker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    proposed_price NUMERIC(10,2) CHECK (proposed_price IS NULL OR proposed_price >= 0),
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (job_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_status ON job_applications(job_id, status);
CREATE INDEX IF NOT EXISTS idx_job_applications_worker_created ON job_applications(worker_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_agreements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
    customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    worker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agreed_price NUMERIC(10,2) NOT NULL CHECK (agreed_price >= 0),
    scope_of_work TEXT NOT NULL,
    terms TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'accepted', 'completed', 'cancelled')),
    proposed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (customer_id <> worker_id),
    CHECK (length(trim(scope_of_work)) > 0),
    CHECK (completed_at IS NULL OR status = 'completed')
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT REFERENCES payments(id) ON DELETE RESTRICT,
    job_id BIGINT REFERENCES jobs(id) ON DELETE RESTRICT,
    account_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    entry_type VARCHAR(30) NOT NULL
        CHECK (entry_type IN ('charge', 'payout', 'refund', 'fee', 'adjustment')),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    description TEXT,
    idempotency_key VARCHAR(160) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (payment_id IS NOT NULL OR job_id IS NOT NULL OR account_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger_entries(account_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_payment ON ledger_entries(payment_id);

CREATE TABLE IF NOT EXISTS disputes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    payment_id BIGINT REFERENCES payments(id) ON DELETE RESTRICT,
    raised_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    against_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    reason VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved', 'rejected', 'closed')),
    resolution TEXT,
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CHECK (against_user_id IS NULL OR against_user_id <> raised_by),
    CHECK (length(trim(reason)) > 0),
    CHECK (length(trim(description)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_disputes_status_created ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_job ON disputes(job_id);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(60) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    related_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(trim(title)) > 0),
    CHECK (length(trim(message)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    request_id VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(trim(action)) > 0),
    CHECK (length(trim(entity_type)) > 0),
    CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(80) PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES ('002_phase2_marketplace_trust', 'Add service categories, marketplace records, trust/finance tables and indexes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
