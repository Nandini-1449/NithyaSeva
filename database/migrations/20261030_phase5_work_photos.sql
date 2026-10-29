-- NithyaSeva Phase 5.1: work photo evidence metadata.
-- Photo files are stored locally for development; configure persistent/cloud storage before deployment.
CREATE TABLE IF NOT EXISTS job_work_photos (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase VARCHAR(10) NOT NULL CHECK (phase IN ('before', 'after')),
  storage_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_work_photos_job_phase ON job_work_photos(job_id, phase, created_at);
