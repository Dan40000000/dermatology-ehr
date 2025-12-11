-- Enhanced Audit Log for HIPAA Compliance
-- Comprehensive audit tracking with advanced filtering capabilities

-- Drop existing audit_log if minimal, recreate with enhanced schema
DROP TABLE IF EXISTS audit_log CASCADE;

CREATE TABLE audit_log (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip_address text,
  user_agent text,
  changes jsonb,
  metadata jsonb,
  severity text DEFAULT 'info',
  status text DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast filtering and searching
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_resource_type ON audit_log(resource_type);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_ip ON audit_log(ip_address);
CREATE INDEX idx_audit_severity ON audit_log(severity);
CREATE INDEX idx_audit_status ON audit_log(status);

-- Composite indexes for common queries
CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_tenant_user ON audit_log(tenant_id, user_id, created_at DESC);
CREATE INDEX idx_audit_tenant_action ON audit_log(tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_tenant_resource ON audit_log(tenant_id, resource_type, created_at DESC);

-- JSONB indexes for searching changes
CREATE INDEX idx_audit_changes ON audit_log USING gin(changes);
CREATE INDEX idx_audit_metadata ON audit_log USING gin(metadata);

-- Comment for documentation
COMMENT ON TABLE audit_log IS 'Comprehensive audit log for HIPAA compliance and security monitoring';
COMMENT ON COLUMN audit_log.action IS 'Action performed: login, logout, create, update, delete, view, download, export, failed_login, etc.';
COMMENT ON COLUMN audit_log.resource_type IS 'Resource type: patient, encounter, document, user, etc.';
COMMENT ON COLUMN audit_log.severity IS 'Event severity: info, warning, error, critical';
COMMENT ON COLUMN audit_log.status IS 'Operation status: success, failure, partial';
COMMENT ON COLUMN audit_log.changes IS 'JSONB field containing before/after values (no PHI)';
COMMENT ON COLUMN audit_log.metadata IS 'Additional context data (session info, device info, etc.)';
