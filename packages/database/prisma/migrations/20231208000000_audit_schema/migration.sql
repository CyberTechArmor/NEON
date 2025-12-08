-- CreateSchema for audit logs (HIPAA/GDPR compliance)
CREATE SCHEMA IF NOT EXISTS "audit";

-- Create audit.logs table with hash chaining for tamper evidence
CREATE TABLE "audit"."logs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" UUID,
    "actor_id" UUID,
    "actor_type" TEXT NOT NULL DEFAULT 'user',
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "details" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" UUID,
    "partition_key" DATE NOT NULL DEFAULT CURRENT_DATE,
    "previous_hash" TEXT,
    "entry_hash" TEXT,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id", "partition_key")
) PARTITION BY RANGE ("partition_key");

-- Create default partition for current year
CREATE TABLE "audit"."logs_default" PARTITION OF "audit"."logs" DEFAULT;

-- Create index for common queries
CREATE INDEX "logs_org_id_idx" ON "audit"."logs"("org_id");
CREATE INDEX "logs_actor_id_idx" ON "audit"."logs"("actor_id");
CREATE INDEX "logs_action_idx" ON "audit"."logs"("action");
CREATE INDEX "logs_resource_type_idx" ON "audit"."logs"("resource_type");
CREATE INDEX "logs_created_at_idx" ON "audit"."logs"("created_at");
CREATE INDEX "logs_partition_key_idx" ON "audit"."logs"("partition_key");

-- Function to calculate entry hash for integrity verification
CREATE OR REPLACE FUNCTION audit.calculate_entry_hash(
    p_created_at TIMESTAMP,
    p_org_id UUID,
    p_actor_id UUID,
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id UUID,
    p_details JSONB,
    p_previous_hash TEXT
) RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        sha256(
            (COALESCE(p_created_at::TEXT, '') ||
             COALESCE(p_org_id::TEXT, '') ||
             COALESCE(p_actor_id::TEXT, '') ||
             COALESCE(p_action, '') ||
             COALESCE(p_resource_type, '') ||
             COALESCE(p_resource_id::TEXT, '') ||
             COALESCE(p_details::TEXT, '') ||
             COALESCE(p_previous_hash, ''))::bytea
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to set hash chain on insert
CREATE OR REPLACE FUNCTION audit.set_entry_hash() RETURNS TRIGGER AS $$
DECLARE
    v_previous_hash TEXT;
BEGIN
    -- Get the hash of the previous entry
    SELECT entry_hash INTO v_previous_hash
    FROM audit.logs
    ORDER BY id DESC
    LIMIT 1;

    -- Set the previous hash
    NEW.previous_hash := v_previous_hash;

    -- Calculate and set the entry hash
    NEW.entry_hash := audit.calculate_entry_hash(
        NEW.created_at,
        NEW.org_id,
        NEW.actor_id,
        NEW.action,
        NEW.resource_type,
        NEW.resource_id,
        NEW.details,
        NEW.previous_hash
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on the parent table (fires for all partitions)
CREATE TRIGGER audit_logs_hash_chain
    BEFORE INSERT ON audit.logs
    FOR EACH ROW
    EXECUTE FUNCTION audit.set_entry_hash();

-- Revoke update and delete permissions for immutability
-- In production, this should be managed at the role level
COMMENT ON TABLE audit.logs IS 'Immutable audit log for HIPAA/GDPR compliance. This table should never have UPDATE or DELETE operations.';
