-- NithyaSeva Phase 4: private job address and customer-controlled sharing.
-- Run once against the NithyaSeva PostgreSQL database before restarting the backend.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS exact_address TEXT,
  ADD COLUMN IF NOT EXISTS contact_sharing_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_sharing_approved_by BIGINT REFERENCES users(id);

-- Existing jobs predate the private address field. Keep them blank until the customer
-- edits/reposts them; never copy public service_location into the private field.
