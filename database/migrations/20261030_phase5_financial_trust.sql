BEGIN;

-- One agreed price per worker assignment. The column already exists in the
-- base schema; this migration is safe for databases created from older schemas.
ALTER TABLE job_assignments
  ADD COLUMN IF NOT EXISTS agreed_price NUMERIC(10,2)
  CHECK (agreed_price IS NULL OR agreed_price >= 0);

CREATE TABLE IF NOT EXISTS job_disputes (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  opened_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  against_user BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason VARCHAR(80) NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 5000),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved','closed')),
  resolution TEXT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (opened_by <> against_user)
);

CREATE INDEX IF NOT EXISTS idx_disputes_job_created ON job_disputes(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_status_created ON job_disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_payer_created ON payments(payer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_payee_created ON payments(payee_id, created_at DESC);

COMMIT;
