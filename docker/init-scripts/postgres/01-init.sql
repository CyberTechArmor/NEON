-- =============================================================================
-- NEON Platform - PostgreSQL Initialization
-- =============================================================================
-- This script runs on first database creation
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search

-- Create schemas for logical separation
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS federation;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA public TO neon;
GRANT ALL PRIVILEGES ON SCHEMA audit TO neon;
GRANT ALL PRIVILEGES ON SCHEMA federation TO neon;

-- Create audit log table (append-only, hash-chained)
-- This is created here rather than in Prisma to ensure it exists from the start
-- Note: PRIMARY KEY must include partition_key for partitioned tables
CREATE TABLE IF NOT EXISTS audit.logs (
    id BIGSERIAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id UUID,
    actor_id UUID,
    actor_type VARCHAR(50) NOT NULL, -- user, system, federation, api_key
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    -- Hash chain for tamper evidence
    previous_hash VARCHAR(64),
    entry_hash VARCHAR(64) NOT NULL,
    -- Partition key for efficient retention management
    partition_key DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Primary key must include partition column for partitioned tables
    PRIMARY KEY (id, partition_key)
) PARTITION BY RANGE (partition_key);

-- Create initial partition (current year)
CREATE TABLE IF NOT EXISTS audit.logs_2024 PARTITION OF audit.logs
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS audit.logs_2025 PARTITION OF audit.logs
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit.logs (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit.logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit.logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit.logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit.logs (resource_type, resource_id);

-- Function to calculate hash for audit entries
CREATE OR REPLACE FUNCTION audit.calculate_entry_hash(
    p_created_at TIMESTAMPTZ,
    p_org_id UUID,
    p_actor_id UUID,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_details JSONB,
    p_previous_hash VARCHAR
) RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(
        digest(
            COALESCE(p_previous_hash, '') ||
            p_created_at::TEXT ||
            COALESCE(p_org_id::TEXT, '') ||
            COALESCE(p_actor_id::TEXT, '') ||
            p_action ||
            p_resource_type ||
            COALESCE(p_resource_id::TEXT, '') ||
            COALESCE(p_details::TEXT, ''),
            'sha256'
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically set hash on insert
CREATE OR REPLACE FUNCTION audit.set_entry_hash() RETURNS TRIGGER AS $$
DECLARE
    v_previous_hash VARCHAR(64);
BEGIN
    -- Get the hash of the previous entry
    SELECT entry_hash INTO v_previous_hash
    FROM audit.logs
    ORDER BY id DESC
    LIMIT 1;

    NEW.previous_hash := v_previous_hash;
    NEW.entry_hash := audit.calculate_entry_hash(
        NEW.created_at,
        NEW.org_id,
        NEW.actor_id,
        NEW.action,
        NEW.resource_type,
        NEW.resource_id,
        NEW.details,
        v_previous_hash
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_hash_trigger
    BEFORE INSERT ON audit.logs
    FOR EACH ROW
    EXECUTE FUNCTION audit.set_entry_hash();

-- Make audit table append-only (revoke UPDATE and DELETE)
REVOKE UPDATE, DELETE ON audit.logs FROM neon;
REVOKE UPDATE, DELETE ON audit.logs_2024 FROM neon;
REVOKE UPDATE, DELETE ON audit.logs_2025 FROM neon;

-- Comment for documentation
COMMENT ON TABLE audit.logs IS 'Immutable, hash-chained audit log for compliance (HIPAA/GDPR)';
COMMENT ON COLUMN audit.logs.entry_hash IS 'SHA-256 hash of entry including previous hash for tamper evidence';
