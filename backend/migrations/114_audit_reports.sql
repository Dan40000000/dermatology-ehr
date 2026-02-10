-- Audit Reports and Enhanced Tracking System for HIPAA Compliance
-- This migration creates comprehensive audit reporting and suspicious activity detection

-- ============================================================================
-- AUDIT REPORT TEMPLATES
-- Stores configurable report templates for recurring audit reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_report_templates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text,
  report_type text NOT NULL CHECK (report_type IN ('access', 'changes', 'phi', 'security', 'login', 'prescription', 'export')),
  filters jsonb DEFAULT '{}',
  columns text[] DEFAULT ARRAY['timestamp', 'user', 'action', 'resource', 'status'],
  schedule_cron text, -- Cron expression for scheduled reports (e.g., '0 8 * * 1' for Monday 8am)
  schedule_enabled boolean DEFAULT false,
  recipients text[] DEFAULT ARRAY[]::text[], -- Email addresses for report delivery
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by text REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE INDEX idx_audit_report_templates_tenant ON audit_report_templates(tenant_id);
CREATE INDEX idx_audit_report_templates_type ON audit_report_templates(report_type);
CREATE INDEX idx_audit_report_templates_schedule ON audit_report_templates(schedule_enabled, next_run_at) WHERE schedule_enabled = true;

COMMENT ON TABLE audit_report_templates IS 'Configurable templates for generating audit reports';
COMMENT ON COLUMN audit_report_templates.report_type IS 'Type of report: access (PHI access), changes (data modifications), phi (PHI-specific), security (security events), login (authentication), prescription (Rx activity), export (data exports)';
COMMENT ON COLUMN audit_report_templates.filters IS 'JSONB containing filter criteria like dateRange, userIds, resourceTypes, etc.';
COMMENT ON COLUMN audit_report_templates.schedule_cron IS 'Standard cron expression for scheduled report generation';

-- ============================================================================
-- AUDIT REPORT RUNS
-- Tracks each execution of an audit report
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_report_runs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  template_id text REFERENCES audit_report_templates(id) ON DELETE SET NULL,
  template_name text, -- Stored separately in case template is deleted
  report_type text NOT NULL,
  run_date timestamptz DEFAULT now(),
  date_range_start timestamptz,
  date_range_end timestamptz,
  filters_applied jsonb DEFAULT '{}',
  generated_by text REFERENCES users(id),
  generated_by_name text, -- Stored for historical reference
  row_count integer DEFAULT 0,
  file_url text, -- URL to stored report file (S3 or local)
  file_size_bytes integer,
  file_format text DEFAULT 'csv' CHECK (file_format IN ('csv', 'pdf', 'json', 'xlsx')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  error_message text,
  expires_at timestamptz, -- When the report file will be deleted (for compliance)
  checksum text, -- SHA-256 hash for integrity verification
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_report_runs_tenant ON audit_report_runs(tenant_id);
CREATE INDEX idx_audit_report_runs_template ON audit_report_runs(template_id);
CREATE INDEX idx_audit_report_runs_date ON audit_report_runs(run_date DESC);
CREATE INDEX idx_audit_report_runs_status ON audit_report_runs(status);
CREATE INDEX idx_audit_report_runs_expires ON audit_report_runs(expires_at) WHERE status = 'completed';

COMMENT ON TABLE audit_report_runs IS 'Historical record of all audit report executions';
COMMENT ON COLUMN audit_report_runs.checksum IS 'SHA-256 hash of report file for tamper detection';
COMMENT ON COLUMN audit_report_runs.expires_at IS 'When report file should be deleted per retention policy';

-- ============================================================================
-- SUSPICIOUS ACTIVITY LOG
-- Tracks potentially suspicious or anomalous user behavior
-- ============================================================================
CREATE TABLE IF NOT EXISTS suspicious_activity_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  user_id text REFERENCES users(id),
  user_name text, -- Stored for historical reference
  user_email text,
  activity_type text NOT NULL CHECK (activity_type IN (
    'excessive_access', -- Accessing more records than normal
    'after_hours_access', -- Access outside normal working hours
    'failed_login_burst', -- Multiple failed login attempts
    'unusual_ip', -- Access from unusual IP address
    'bulk_download', -- Downloading large amounts of data
    'break_glass', -- Emergency access to restricted records
    'permission_escalation', -- Attempts to access beyond permissions
    'rapid_navigation', -- Unusually fast navigation between records
    'export_spike', -- Unusual number of exports
    'vpn_bypass', -- Access without required VPN
    'concurrent_sessions', -- Multiple simultaneous sessions
    'dormant_account', -- Activity on dormant account
    'off_panel_access', -- Accessing patients not on care panel
    'mass_modification', -- Bulk data modifications
    'other'
  )),
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 1 AND 100),
  risk_level text GENERATED ALWAYS AS (
    CASE
      WHEN risk_score >= 80 THEN 'critical'
      WHEN risk_score >= 60 THEN 'high'
      WHEN risk_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  ) STORED,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  related_audit_ids text[], -- References to related audit_log entries
  related_patient_ids text[], -- Patients involved
  detected_at timestamptz DEFAULT now(),
  detection_method text, -- 'automated', 'manual', 'ml_model'
  reviewed boolean DEFAULT false,
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  action_taken text CHECK (action_taken IN (
    'dismissed', -- False positive, no action needed
    'acknowledged', -- Noted but no immediate action
    'user_notified', -- User was contacted
    'account_locked', -- User account was locked
    'session_terminated', -- Active sessions were ended
    'reported_externally', -- Reported to authorities/compliance
    'escalated', -- Escalated to management
    'under_investigation' -- Active investigation
  )),
  requires_follow_up boolean DEFAULT false,
  follow_up_due_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_suspicious_activity_tenant ON suspicious_activity_log(tenant_id);
CREATE INDEX idx_suspicious_activity_user ON suspicious_activity_log(user_id);
CREATE INDEX idx_suspicious_activity_type ON suspicious_activity_log(activity_type);
CREATE INDEX idx_suspicious_activity_risk ON suspicious_activity_log(risk_score DESC);
CREATE INDEX idx_suspicious_activity_date ON suspicious_activity_log(detected_at DESC);
CREATE INDEX idx_suspicious_activity_unreviewed ON suspicious_activity_log(tenant_id, reviewed, detected_at DESC) WHERE reviewed = false;
CREATE INDEX idx_suspicious_activity_followup ON suspicious_activity_log(follow_up_due_date) WHERE requires_follow_up = true AND action_taken IS NULL;
CREATE INDEX idx_suspicious_activity_details ON suspicious_activity_log USING gin(details);

COMMENT ON TABLE suspicious_activity_log IS 'Tracks potentially suspicious or anomalous user behavior for security monitoring';
COMMENT ON COLUMN suspicious_activity_log.risk_score IS 'Numerical risk score from 1-100, with 100 being highest risk';
COMMENT ON COLUMN suspicious_activity_log.related_audit_ids IS 'Array of audit_log.id values related to this suspicious activity';

-- ============================================================================
-- PHI ACCESS TRACKING (Enhanced view for PHI-specific access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS phi_access_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  audit_log_id text REFERENCES audit_log(id),
  user_id text REFERENCES users(id),
  patient_id text NOT NULL,
  patient_name text, -- Encrypted/hashed for logging
  access_type text NOT NULL CHECK (access_type IN ('view', 'create', 'update', 'delete', 'export', 'print', 'fax', 'share')),
  resource_type text NOT NULL, -- 'demographics', 'clinical_notes', 'diagnoses', 'medications', 'photos', etc.
  resource_id text,
  access_reason text, -- Required for break-glass access
  is_break_glass boolean DEFAULT false,
  is_own_record boolean DEFAULT false, -- User accessing their own patient record
  relationship_to_patient text, -- 'care_team', 'specialist', 'emergency', 'administrative'
  ip_address text,
  session_id text,
  accessed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_phi_access_tenant ON phi_access_log(tenant_id);
CREATE INDEX idx_phi_access_patient ON phi_access_log(patient_id, accessed_at DESC);
CREATE INDEX idx_phi_access_user ON phi_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_phi_access_date ON phi_access_log(accessed_at DESC);
CREATE INDEX idx_phi_access_break_glass ON phi_access_log(tenant_id, is_break_glass) WHERE is_break_glass = true;
CREATE INDEX idx_phi_access_type ON phi_access_log(access_type);

COMMENT ON TABLE phi_access_log IS 'Specialized log for tracking all PHI (Protected Health Information) access';
COMMENT ON COLUMN phi_access_log.is_break_glass IS 'Whether this was an emergency access that bypassed normal restrictions';

-- ============================================================================
-- PRESCRIPTION AUDIT LOG (Enhanced Rx tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS prescription_audit_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  audit_log_id text REFERENCES audit_log(id),
  prescription_id text NOT NULL,
  patient_id text NOT NULL,
  patient_name text, -- For historical reference
  provider_id text REFERENCES users(id),
  provider_name text,
  action text NOT NULL CHECK (action IN (
    'created', 'modified', 'cancelled', 'renewed', 'discontinued',
    'sent_to_pharmacy', 'refill_requested', 'refill_approved', 'refill_denied',
    'prior_auth_required', 'prior_auth_submitted', 'prior_auth_approved', 'prior_auth_denied',
    'dea_verification', 'epcs_signed', 'printed', 'faxed', 'voided'
  )),
  medication_name text NOT NULL,
  medication_ndc text,
  quantity text,
  days_supply integer,
  is_controlled boolean DEFAULT false,
  dea_schedule text, -- 'II', 'III', 'IV', 'V' for controlled substances
  changes jsonb, -- Before/after for modifications
  reason text, -- Reason for cancellation, denial, etc.
  pharmacy_id text,
  pharmacy_name text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rx_audit_tenant ON prescription_audit_log(tenant_id);
CREATE INDEX idx_rx_audit_prescription ON prescription_audit_log(prescription_id);
CREATE INDEX idx_rx_audit_patient ON prescription_audit_log(patient_id, created_at DESC);
CREATE INDEX idx_rx_audit_provider ON prescription_audit_log(provider_id, created_at DESC);
CREATE INDEX idx_rx_audit_date ON prescription_audit_log(created_at DESC);
CREATE INDEX idx_rx_audit_controlled ON prescription_audit_log(tenant_id, is_controlled, created_at DESC) WHERE is_controlled = true;
CREATE INDEX idx_rx_audit_action ON prescription_audit_log(action);

COMMENT ON TABLE prescription_audit_log IS 'Specialized audit log for prescription activity including controlled substances';

-- ============================================================================
-- LOGIN ACTIVITY LOG (Enhanced authentication tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_activity_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  user_id text REFERENCES users(id),
  user_email text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'login_success', 'login_failure', 'logout', 'session_expired',
    'password_change', 'password_reset_requested', 'password_reset_completed',
    'mfa_challenge_sent', 'mfa_success', 'mfa_failure',
    'account_locked', 'account_unlocked',
    'token_refresh', 'token_revoked'
  )),
  ip_address text,
  user_agent text,
  browser text, -- Parsed browser name
  os text, -- Parsed OS name
  device_type text, -- 'desktop', 'mobile', 'tablet'
  location_city text,
  location_country text,
  session_id text,
  failure_reason text, -- For failed logins
  is_suspicious boolean DEFAULT false,
  risk_factors jsonb, -- Details about why it might be suspicious
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_login_activity_tenant ON login_activity_log(tenant_id);
CREATE INDEX idx_login_activity_user ON login_activity_log(user_id, created_at DESC);
CREATE INDEX idx_login_activity_email ON login_activity_log(user_email, created_at DESC);
CREATE INDEX idx_login_activity_date ON login_activity_log(created_at DESC);
CREATE INDEX idx_login_activity_type ON login_activity_log(event_type);
CREATE INDEX idx_login_activity_ip ON login_activity_log(ip_address);
CREATE INDEX idx_login_activity_failures ON login_activity_log(tenant_id, event_type, created_at DESC)
  WHERE event_type IN ('login_failure', 'mfa_failure');
CREATE INDEX idx_login_activity_suspicious ON login_activity_log(tenant_id, is_suspicious, created_at DESC)
  WHERE is_suspicious = true;

COMMENT ON TABLE login_activity_log IS 'Detailed tracking of all authentication-related events';

-- ============================================================================
-- PERMISSION CHANGE LOG (Role and access modifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS permission_change_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  audit_log_id text REFERENCES audit_log(id),
  target_user_id text REFERENCES users(id),
  target_user_name text,
  target_user_email text,
  changed_by text REFERENCES users(id),
  changed_by_name text,
  change_type text NOT NULL CHECK (change_type IN (
    'role_assigned', 'role_removed', 'role_modified',
    'permission_granted', 'permission_revoked',
    'access_level_changed', 'department_changed',
    'provider_panel_modified', 'location_access_changed',
    'feature_enabled', 'feature_disabled'
  )),
  previous_value jsonb,
  new_value jsonb,
  reason text,
  effective_date timestamptz DEFAULT now(),
  expiration_date timestamptz, -- For temporary permissions
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_permission_change_tenant ON permission_change_log(tenant_id);
CREATE INDEX idx_permission_change_target ON permission_change_log(target_user_id, created_at DESC);
CREATE INDEX idx_permission_change_by ON permission_change_log(changed_by, created_at DESC);
CREATE INDEX idx_permission_change_date ON permission_change_log(created_at DESC);
CREATE INDEX idx_permission_change_type ON permission_change_log(change_type);

COMMENT ON TABLE permission_change_log IS 'Tracks all changes to user roles, permissions, and access levels';

-- ============================================================================
-- DATA EXPORT LOG (Track all data exports for compliance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_export_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  audit_log_id text REFERENCES audit_log(id),
  user_id text REFERENCES users(id),
  user_name text,
  export_type text NOT NULL CHECK (export_type IN (
    'patient_record', 'encounter_note', 'lab_results', 'medications',
    'photos', 'documents', 'billing_data', 'report', 'bulk_export',
    'fhir_export', 'hl7_export', 'custom_query', 'print'
  )),
  format text CHECK (format IN ('pdf', 'csv', 'json', 'xml', 'hl7', 'fhir', 'ccda', 'print')),
  record_count integer DEFAULT 1,
  patient_ids text[], -- Patients included in export
  resource_ids text[], -- Specific resources exported
  includes_phi boolean DEFAULT true,
  destination text, -- 'download', 'email', 'fax', 'print', 'api', 'integration'
  destination_details text, -- Email address, fax number, etc.
  file_size_bytes integer,
  file_name text,
  purpose text, -- Required reason for export
  authorization_reference text, -- Reference to authorization (e.g., patient consent ID)
  ip_address text,
  exported_at timestamptz DEFAULT now(),
  retention_expires_at timestamptz -- When audit record of this export can be purged
);

CREATE INDEX idx_data_export_tenant ON data_export_log(tenant_id);
CREATE INDEX idx_data_export_user ON data_export_log(user_id, exported_at DESC);
CREATE INDEX idx_data_export_date ON data_export_log(exported_at DESC);
CREATE INDEX idx_data_export_type ON data_export_log(export_type);
CREATE INDEX idx_data_export_patients ON data_export_log USING gin(patient_ids);

COMMENT ON TABLE data_export_log IS 'Comprehensive log of all data exports for HIPAA compliance';
COMMENT ON COLUMN data_export_log.retention_expires_at IS 'HIPAA requires 6-year retention of access logs';

-- ============================================================================
-- USER ACTIVITY METRICS (Aggregated for suspicious activity detection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_activity_metrics (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  metric_date date NOT NULL,
  total_actions integer DEFAULT 0,
  patient_records_accessed integer DEFAULT 0,
  unique_patients_accessed integer DEFAULT 0,
  documents_viewed integer DEFAULT 0,
  documents_exported integer DEFAULT 0,
  prescriptions_written integer DEFAULT 0,
  controlled_rx_written integer DEFAULT 0,
  failed_login_attempts integer DEFAULT 0,
  successful_logins integer DEFAULT 0,
  after_hours_actions integer DEFAULT 0, -- Actions outside 6am-8pm
  unique_ip_addresses integer DEFAULT 0,
  average_session_duration_minutes integer,
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, user_id, metric_date)
);

CREATE INDEX idx_user_metrics_tenant_date ON user_activity_metrics(tenant_id, metric_date DESC);
CREATE INDEX idx_user_metrics_user_date ON user_activity_metrics(user_id, metric_date DESC);
CREATE INDEX idx_user_metrics_anomaly ON user_activity_metrics(tenant_id, metric_date, patient_records_accessed DESC);

COMMENT ON TABLE user_activity_metrics IS 'Daily aggregated user activity for anomaly detection';

-- ============================================================================
-- BREAK-THE-GLASS LOG (Emergency access tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS break_glass_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  user_name text,
  patient_id text NOT NULL,
  patient_name text,
  reason text NOT NULL,
  reason_category text CHECK (reason_category IN (
    'emergency', 'supervisor_override', 'continuity_of_care',
    'public_health', 'legal_requirement', 'patient_request', 'other'
  )),
  authorized_by text REFERENCES users(id), -- If supervisor approval was required
  access_duration_minutes integer,
  resources_accessed text[], -- List of resource types accessed
  audit_log_ids text[], -- Related audit entries
  accessed_at timestamptz DEFAULT now(),
  access_ended_at timestamptz,
  reviewed boolean DEFAULT false,
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  review_outcome text CHECK (review_outcome IN ('appropriate', 'inappropriate', 'needs_training', 'policy_violation')),
  review_notes text,
  follow_up_required boolean DEFAULT false
);

CREATE INDEX idx_break_glass_tenant ON break_glass_log(tenant_id);
CREATE INDEX idx_break_glass_user ON break_glass_log(user_id, accessed_at DESC);
CREATE INDEX idx_break_glass_patient ON break_glass_log(patient_id, accessed_at DESC);
CREATE INDEX idx_break_glass_date ON break_glass_log(accessed_at DESC);
CREATE INDEX idx_break_glass_unreviewed ON break_glass_log(tenant_id, reviewed, accessed_at DESC) WHERE reviewed = false;

COMMENT ON TABLE break_glass_log IS 'Tracks emergency access that bypasses normal restrictions - requires mandatory review';

-- ============================================================================
-- HIPAA RETENTION MANAGEMENT
-- Default 6-year retention with configurable policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_retention_policy (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  table_name text NOT NULL,
  retention_years integer DEFAULT 6, -- HIPAA minimum
  archive_after_years integer DEFAULT 2, -- Move to cold storage
  last_purge_at timestamptz,
  last_archive_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, table_name)
);

COMMENT ON TABLE audit_retention_policy IS 'Configurable retention policies per audit table (HIPAA requires minimum 6 years)';

-- Insert default retention policies
INSERT INTO audit_retention_policy (id, tenant_id, table_name, retention_years, archive_after_years)
VALUES
  (gen_random_uuid()::text, 'default', 'audit_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'phi_access_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'prescription_audit_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'login_activity_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'permission_change_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'data_export_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'break_glass_log', 6, 2),
  (gen_random_uuid()::text, 'default', 'suspicious_activity_log', 6, 2)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- TAMPER-EVIDENT LOG INTEGRITY
-- Store checksums for detecting unauthorized modifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_integrity_checkpoints (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  table_name text NOT NULL,
  checkpoint_date date NOT NULL,
  record_count bigint NOT NULL,
  checksum text NOT NULL, -- SHA-256 hash of all records for that date
  first_record_id text,
  last_record_id text,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verification_status text CHECK (verification_status IN ('pending', 'verified', 'failed', 'tamper_detected')),
  UNIQUE (tenant_id, table_name, checkpoint_date)
);

CREATE INDEX idx_audit_integrity_tenant ON audit_integrity_checkpoints(tenant_id);
CREATE INDEX idx_audit_integrity_date ON audit_integrity_checkpoints(checkpoint_date DESC);
CREATE INDEX idx_audit_integrity_status ON audit_integrity_checkpoints(verification_status);

COMMENT ON TABLE audit_integrity_checkpoints IS 'Daily checksums for tamper detection in audit logs';

-- ============================================================================
-- Add hash column to audit_log for tamper detection
-- ============================================================================
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_hash text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS previous_hash text;

COMMENT ON COLUMN audit_log.record_hash IS 'SHA-256 hash of record content for tamper detection';
COMMENT ON COLUMN audit_log.previous_hash IS 'Hash of previous record, creating a chain for integrity verification';

-- Create index for hash verification
CREATE INDEX IF NOT EXISTS idx_audit_log_hash ON audit_log(record_hash);

-- ============================================================================
-- FUNCTION: Calculate record hash for tamper detection
-- ============================================================================
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
       COALESCE(p_created_at::text, '') || '|' ||
       COALESCE(p_previous_hash, 'genesis'))::bytea
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_audit_hash IS 'Calculates SHA-256 hash for tamper-evident audit logging';
