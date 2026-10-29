-- NithyaSeva worker availability, application history, and two-party completion.
-- Apply with the project's migration process before using the updated API.

BEGIN;

-- Preserve old applications, but prevent them from being accepted again.
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'job_applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE job_applications DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE job_applications
  ADD CONSTRAINT job_applications_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn'));

-- Completion and cancellation confirmations belong to each worker's assignment.
ALTER TABLE job_assignments
  ADD COLUMN IF NOT EXISTS worker_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_requested_by BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_job_applications_job_status
  ON job_applications(job_id, status);

CREATE INDEX IF NOT EXISTS idx_job_applications_worker_status
  ON job_applications(worker_id, status);

INSERT INTO schema_migrations (version, description)
VALUES ('006_application_availability_completion', 'Preserve withdrawn applications and track per-worker completion/cancellation confirmations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
