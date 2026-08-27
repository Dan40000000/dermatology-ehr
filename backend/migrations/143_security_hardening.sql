-- Security hardening for workforce account lifecycle, public booking binding,
-- and tamper-evident audit records.  This migration is idempotent and contains
-- no passwords or other runtime credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_password_reset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

CREATE INDEX IF NOT EXISTS idx_users_tenant_active
  ON users(tenant_id, is_active);

-- Existing demo fixtures must not be treated as production workforce accounts.
-- They remain available only to an explicitly synthetic/demo environment after
-- an operator performs a controlled password reset.
UPDATE users
   SET is_test_data = true,
       force_password_reset = true,
       is_active = false,
       deactivated_at = COALESCE(deactivated_at, NOW()),
       deactivation_reason = COALESCE(deactivation_reason, 'seeded_fixture_requires_controlled_reset')
 WHERE tenant_id = 'tenant-demo'
   AND id IN (
     'u-admin', 'u-owner', 'u-provider', 'u-ma', 'u-front', 'u-billing',
     'u-nurse', 'u-manager', 'u-scheduler', 'u-compliance', 'u-staff', 'u-hr'
   );

-- Keep the database-side hash function available even when the historical audit
-- migration was applied to a replica in a different order.
CREATE OR REPLACE FUNCTION calculate_audit_hash(
  p_id text,
  p_tenant_id text,
  p_user_id text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_created_at timestamptz,
  p_previous_hash text
) RETURNS text AS $$
BEGIN
  RETURN encode(
    sha256(
      (COALESCE(p_id, '') || '|' ||
       COALESCE(p_tenant_id, '') || '|' ||
       COALESCE(p_user_id, '') || '|' ||
       COALESCE(p_action, '') || '|' ||
       COALESCE(p_resource_type, '') || '|' ||
       COALESCE(p_resource_id, '') || '|' ||
       COALESCE(to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || '|' ||
       COALESCE(p_previous_hash, 'genesis'))::bytea
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION set_audit_record_hash()
RETURNS trigger AS $$
BEGIN
  -- The trigger is authoritative for direct SQL writers.  Locking and
  -- overwriting caller-supplied values prevents a concurrent writer or a
  -- privileged client from forking or bypassing the tenant hash chain.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id, 0));
  SELECT record_hash
    INTO NEW.previous_hash
    FROM audit_log
   WHERE tenant_id = NEW.tenant_id
     AND record_hash IS NOT NULL
   ORDER BY created_at DESC, id DESC
   LIMIT 1;
  NEW.record_hash := calculate_audit_hash(
    NEW.id,
    NEW.tenant_id,
    NEW.user_id,
    NEW.action,
    NEW.resource_type,
    NEW.resource_id,
    COALESCE(NEW.created_at, NOW()),
    NEW.previous_hash
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_record_hash_trigger ON audit_log;
CREATE TRIGGER audit_record_hash_trigger
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_audit_record_hash();

INSERT INTO audit_retention_policy (id, tenant_id, table_name, retention_years, archive_after_years)
VALUES (gen_random_uuid()::text, 'default', 'audit_log', 6, 2)
ON CONFLICT (tenant_id, table_name)
DO UPDATE SET retention_years = GREATEST(audit_retention_policy.retention_years, 6),
              updated_at = NOW();
