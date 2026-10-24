-- Add requested worker headcount to jobs without changing existing records.
BEGIN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_count INTEGER NOT NULL DEFAULT 1
  CHECK (worker_count BETWEEN 1 AND 10000);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version, description)
VALUES ('004_job_worker_count', 'Add requested worker headcount to jobs')
ON CONFLICT (version) DO NOTHING;
COMMIT;
