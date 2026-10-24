-- NithyaSeva database schema
-- PostgreSQL 18+
-- Apply to the nithyaseva database after connecting to it.
-- This file creates tables only; it does not create database users or store secrets.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    phone VARCHAR(25),
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'worker', 'admin')),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_role_customer_worker_uidx
    ON users (lower(email), role) WHERE role IN ('customer', 'worker');
CREATE UNIQUE INDEX IF NOT EXISTS users_email_admin_uidx
    ON users (lower(email)) WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS worker_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    skills TEXT[] NOT NULL DEFAULT '{}',
    experience_years SMALLINT NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
    service_area VARCHAR(160),
    hourly_rate NUMERIC(10,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
    availability_status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (availability_status IN ('available', 'busy', 'unavailable')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    service_location TEXT NOT NULL,
    budget NUMERIC(10,2) CHECK (budget IS NULL OR budget >= 0),
    scheduled_for TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE RESTRICT,
    worker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agreed_price NUMERIC(10,2) CHECK (agreed_price IS NULL OR agreed_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'accepted'
        CHECK (status IN ('accepted', 'in_progress', 'completed', 'cancelled')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CHECK (completed_at IS NULL OR status = 'completed')
);

CREATE TABLE IF NOT EXISTS payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    payer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    payment_method VARCHAR(30),
    provider_reference VARCHAR(255) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (payer_id <> payee_id)
);

CREATE TABLE IF NOT EXISTS reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    reviewer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, reviewer_id),
    CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, account_status);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_service_area ON worker_profiles(service_area);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_created ON jobs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_category ON jobs(status, category);
CREATE INDEX IF NOT EXISTS idx_assignments_worker_status ON job_assignments(worker_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_job_status ON payments(job_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_created ON reviews(reviewee_id, created_at DESC);

COMMIT;
