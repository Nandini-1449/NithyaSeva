-- Two-party cost agreements, one record per assigned worker.
BEGIN;

ALTER TABLE job_agreements
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (advance_amount >= 0 AND advance_amount <= agreed_price),
  ADD COLUMN IF NOT EXISTS customer_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_accepted_at TIMESTAMPTZ;

-- Preserve already accepted legacy agreements as mutually accepted historical records.
UPDATE job_agreements
SET customer_accepted_at = COALESCE(customer_accepted_at, accepted_at, created_at),
    worker_accepted_at = COALESCE(worker_accepted_at, accepted_at, created_at)
WHERE status IN ('accepted', 'completed');

-- A job can have several workers, so each worker needs an individual agreement.
ALTER TABLE job_agreements DROP CONSTRAINT IF EXISTS job_agreements_job_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS job_agreements_job_worker_uidx
  ON job_agreements(job_id, worker_id);

INSERT INTO schema_migrations (version, description)
VALUES ('008_two_party_cost_agreements', 'Add customer and worker acceptance to per-worker cost agreements')
ON CONFLICT (version) DO NOTHING;

COMMIT;
