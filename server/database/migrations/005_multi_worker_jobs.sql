-- Support the customer-requested worker count for each job.
-- Each worker receives an individual assignment and agreement for a job.
-- Existing records are preserved. The current database was verified to have
-- no job_assignments or job_agreements rows before this migration was planned.

BEGIN;

ALTER TABLE job_assignments
  DROP CONSTRAINT IF EXISTS job_assignments_job_id_key;

ALTER TABLE job_agreements
  DROP CONSTRAINT IF EXISTS job_agreements_job_id_key;

-- A worker can only be assigned once to the same job.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'job_assignments'::regclass
      AND conname = 'job_assignments_job_id_worker_id_key'
  ) THEN
    ALTER TABLE job_assignments
      ADD CONSTRAINT job_assignments_job_id_worker_id_key UNIQUE (job_id, worker_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'job_agreements'::regclass
      AND conname = 'job_agreements_job_id_worker_id_key'
  ) THEN
    ALTER TABLE job_agreements
      ADD CONSTRAINT job_agreements_job_id_worker_id_key UNIQUE (job_id, worker_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_assignments_job_status
  ON job_assignments(job_id, status);

INSERT INTO schema_migrations (version, description)
VALUES ('005_multi_worker_jobs', 'Allow multiple worker assignments and agreements up to the requested job headcount')
ON CONFLICT (version) DO NOTHING;

COMMIT;
