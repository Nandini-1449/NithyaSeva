-- Coordinates for opt-in nearby job discovery.
BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_latitude_range_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_latitude_range_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_longitude_range_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_profiles_latitude_range_check') THEN
    ALTER TABLE worker_profiles ADD CONSTRAINT worker_profiles_latitude_range_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worker_profiles_longitude_range_check') THEN
    ALTER TABLE worker_profiles ADD CONSTRAINT worker_profiles_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
END $;

INSERT INTO schema_migrations (version, description)
VALUES ('007_location_coordinates', 'Add optional coordinates for nearby job discovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
