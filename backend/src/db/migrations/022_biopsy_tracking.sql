-- Biopsy Tracking System
-- Complete closed-loop system for tracking biopsies from specimen collection to pathology results
-- Critical for patient safety - no biopsy should ever be lost or forgotten

-- Main biopsies table
CREATE TABLE IF NOT EXISTS biopsies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Patient and encounter linkage
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  lesion_id UUID REFERENCES patient_body_markings(id) ON DELETE SET NULL,

  -- Specimen identification and details
  specimen_id VARCHAR(100) UNIQUE NOT NULL, -- Format: BX-YYYYMMDD-XXX
  specimen_type VARCHAR(50) NOT NULL, -- punch, shave, excisional, incisional
  specimen_size VARCHAR(100), -- e.g., "4mm punch", "0.5 x 0.3 x 0.2 cm"

  -- Anatomic location
  body_location VARCHAR(255) NOT NULL, -- Human-readable location
  body_location_code VARCHAR(50), -- Reference to body_locations.code
  location_laterality VARCHAR(20), -- left, right, bilateral, midline
  location_details TEXT, -- Additional location details (e.g., "3cm proximal to wrist")

  -- Clinical information
  clinical_description TEXT, -- Visual description of lesion
  clinical_history TEXT, -- Patient history relevant to biopsy
  differential_diagnoses TEXT[], -- Array of potential diagnoses
  indication TEXT, -- Reason for biopsy

  -- Status tracking - CRITICAL for patient safety
  status VARCHAR(50) NOT NULL DEFAULT 'ordered',
  -- Values: ordered, collected, sent, received_by_lab, processing, resulted, reviewed, closed

  -- Timestamp tracking for each status
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  received_by_lab_at TIMESTAMPTZ,
  resulted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- Provider tracking
  ordering_provider_id UUID NOT NULL REFERENCES providers(id),
  collecting_provider_id UUID REFERENCES providers(id),
  reviewing_provider_id UUID REFERENCES providers(id),

  -- Pathology lab information
  path_lab VARCHAR(255) NOT NULL, -- Lab name
  path_lab_id UUID REFERENCES lab_vendors(id), -- If integrated
  path_lab_case_number VARCHAR(100), -- Lab's accession number
  path_lab_contact TEXT, -- Contact info for lab

  -- Special handling requirements
  special_stains TEXT[], -- Requested special stains
  send_for_cultures BOOLEAN DEFAULT false,
  send_for_immunofluorescence BOOLEAN DEFAULT false,
  send_for_molecular_testing BOOLEAN DEFAULT false,
  special_instructions TEXT,

  -- Pathology results
  pathology_diagnosis TEXT, -- Primary diagnosis from pathologist
  pathology_report TEXT, -- Full pathology report
  pathology_gross_description TEXT,
  pathology_microscopic_description TEXT,
  pathology_comment TEXT,

  -- Malignancy classification
  malignancy_type VARCHAR(100), -- NULL (benign), BCC, SCC, melanoma, atypical_nevus, other
  malignancy_subtype VARCHAR(100), -- e.g., nodular_bcc, superficial_bcc, invasive_scc

  -- Margin assessment (for excisions)
  margins VARCHAR(50), -- clear, involved, close, cannot_assess
  margin_distance_mm DECIMAL(10,2), -- Closest margin in mm
  margin_details TEXT,

  -- Melanoma-specific fields (if applicable)
  breslow_depth_mm DECIMAL(10,3), -- Tumor thickness
  clark_level VARCHAR(10), -- I, II, III, IV, V
  mitotic_rate INTEGER, -- Mitoses per mm²
  ulceration BOOLEAN,
  sentinel_node_indicated BOOLEAN DEFAULT false,

  -- Diagnosis coding
  diagnosis_code VARCHAR(20), -- ICD-10 code
  diagnosis_description TEXT,
  snomed_code VARCHAR(50), -- SNOMED CT code from pathology

  -- Follow-up actions and care plan
  follow_up_action VARCHAR(100), -- none, reexcision, mohs, dermatology_followup, oncology_referral, monitoring
  follow_up_interval VARCHAR(100), -- e.g., "3 months", "6 months", "1 year"
  follow_up_notes TEXT,
  reexcision_required BOOLEAN DEFAULT false,
  reexcision_scheduled_date DATE,

  -- Patient notification
  patient_notified BOOLEAN DEFAULT false,
  patient_notified_at TIMESTAMPTZ,
  patient_notified_method VARCHAR(50), -- phone, portal, letter, email
  patient_notification_notes TEXT,

  -- Quality metrics
  turnaround_time_days INTEGER, -- Calculated: resulted_at - sent_at
  is_overdue BOOLEAN DEFAULT false, -- Flag if >7 days without result
  overdue_alert_sent_at TIMESTAMPTZ,

  -- Document attachments
  requisition_document_id UUID REFERENCES documents(id),
  pathology_report_document_id UUID REFERENCES documents(id),
  photo_ids JSONB DEFAULT '[]'::JSONB, -- Array of photo document IDs

  -- Billing integration
  procedure_code VARCHAR(20), -- CPT code for biopsy procedure
  billed BOOLEAN DEFAULT false,
  billing_date DATE,

  -- Audit trail
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

-- Biopsy status change audit log
-- Critical for patient safety - track every status change
CREATE TABLE IF NOT EXISTS biopsy_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biopsy_id UUID NOT NULL REFERENCES biopsies(id) ON DELETE CASCADE,

  -- Status change details
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID NOT NULL REFERENCES users(id),

  -- Additional context
  notes TEXT,
  system_generated BOOLEAN DEFAULT false, -- Auto vs manual change

  CONSTRAINT chk_status_change CHECK (old_status IS DISTINCT FROM new_status)
);

-- Biopsy alerts and notifications
-- Track overdue biopsies and critical findings
CREATE TABLE IF NOT EXISTS biopsy_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  biopsy_id UUID NOT NULL REFERENCES biopsies(id) ON DELETE CASCADE,

  -- Alert type and severity
  alert_type VARCHAR(50) NOT NULL, -- overdue, critical_finding, margin_involved, malignancy, followup_required
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical

  -- Alert message
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Alert status
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, acknowledged, resolved, dismissed

  -- Provider actions
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,

  -- Notification tracking
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  notification_method VARCHAR(50), -- email, sms, in_app, page

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Biopsy review checklist
-- Ensure providers complete all required review steps
CREATE TABLE IF NOT EXISTS biopsy_review_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biopsy_id UUID NOT NULL REFERENCES biopsies(id) ON DELETE CASCADE,
  reviewed_by UUID NOT NULL REFERENCES users(id),

  -- Review checklist items
  pathology_report_reviewed BOOLEAN DEFAULT false,
  diagnosis_coded BOOLEAN DEFAULT false,
  patient_notification_completed BOOLEAN DEFAULT false,
  follow_up_scheduled BOOLEAN DEFAULT false,
  documentation_complete BOOLEAN DEFAULT false,

  -- Additional items for malignancy
  staging_documented BOOLEAN,
  treatment_plan_created BOOLEAN,
  specialist_referral_made BOOLEAN,

  -- Review completion
  review_completed BOOLEAN DEFAULT false,
  review_completed_at TIMESTAMPTZ,
  review_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Specimen tracking and chain of custody
CREATE TABLE IF NOT EXISTS biopsy_specimen_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biopsy_id UUID NOT NULL REFERENCES biopsies(id) ON DELETE CASCADE,

  -- Tracking event
  event_type VARCHAR(50) NOT NULL, -- collected, labeled, stored, shipped, received_by_lab, processing, completed
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_by UUID REFERENCES users(id),

  -- Location tracking
  location VARCHAR(255), -- Where specimen currently is
  custody_person VARCHAR(255), -- Who has custody

  -- Specimen quality
  specimen_quality VARCHAR(50), -- adequate, suboptimal, insufficient
  quality_notes TEXT,

  -- Shipping details
  shipping_method VARCHAR(100), -- courier, mail, pickup
  tracking_number VARCHAR(100),
  shipped_to TEXT,

  -- Event notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance and safety queries
CREATE INDEX idx_biopsies_tenant ON biopsies(tenant_id);
CREATE INDEX idx_biopsies_patient ON biopsies(patient_id);
CREATE INDEX idx_biopsies_encounter ON biopsies(encounter_id);
CREATE INDEX idx_biopsies_lesion ON biopsies(lesion_id);
CREATE INDEX idx_biopsies_specimen_id ON biopsies(specimen_id);
CREATE INDEX idx_biopsies_status ON biopsies(status);
CREATE INDEX idx_biopsies_ordering_provider ON biopsies(ordering_provider_id);
CREATE INDEX idx_biopsies_reviewing_provider ON biopsies(reviewing_provider_id);

-- CRITICAL: Index for finding overdue biopsies
CREATE INDEX idx_biopsies_overdue ON biopsies(is_overdue, status) WHERE is_overdue = true AND status NOT IN ('reviewed', 'closed');

-- Index for pending review
CREATE INDEX idx_biopsies_pending_review ON biopsies(status, resulted_at) WHERE status = 'resulted';

-- Index for date-based queries
CREATE INDEX idx_biopsies_ordered_date ON biopsies(ordered_at DESC);
CREATE INDEX idx_biopsies_resulted_date ON biopsies(resulted_at DESC);

-- Malignancy tracking
CREATE INDEX idx_biopsies_malignancy ON biopsies(malignancy_type) WHERE malignancy_type IS NOT NULL;

-- Status history indexes
CREATE INDEX idx_biopsy_status_history_biopsy ON biopsy_status_history(biopsy_id, changed_at DESC);
CREATE INDEX idx_biopsy_status_history_changed_by ON biopsy_status_history(changed_by);

-- Alert indexes
CREATE INDEX idx_biopsy_alerts_biopsy ON biopsy_alerts(biopsy_id);
CREATE INDEX idx_biopsy_alerts_status ON biopsy_alerts(status, severity) WHERE status = 'active';
CREATE INDEX idx_biopsy_alerts_type ON biopsy_alerts(alert_type);

-- Review checklist indexes
CREATE INDEX idx_biopsy_review_checklists_biopsy ON biopsy_review_checklists(biopsy_id);
CREATE INDEX idx_biopsy_review_checklists_incomplete ON biopsy_review_checklists(review_completed) WHERE review_completed = false;

-- Specimen tracking indexes
CREATE INDEX idx_biopsy_specimen_tracking_biopsy ON biopsy_specimen_tracking(biopsy_id, event_timestamp DESC);

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_biopsy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER biopsy_updated
  BEFORE UPDATE ON biopsies
  FOR EACH ROW
  EXECUTE FUNCTION update_biopsy_timestamp();

-- Trigger: Log status changes to audit table
CREATE OR REPLACE FUNCTION log_biopsy_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO biopsy_status_history (biopsy_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.updated_at::TEXT::UUID); -- Will be set by application
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER biopsy_status_changed
  AFTER UPDATE ON biopsies
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_biopsy_status_change();

-- Trigger: Calculate turnaround time
CREATE OR REPLACE FUNCTION calculate_biopsy_turnaround_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resulted_at IS NOT NULL AND NEW.sent_at IS NOT NULL THEN
    NEW.turnaround_time_days := EXTRACT(DAY FROM (NEW.resulted_at - NEW.sent_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER biopsy_calculate_tat
  BEFORE INSERT OR UPDATE ON biopsies
  FOR EACH ROW
  EXECUTE FUNCTION calculate_biopsy_turnaround_time();

-- Trigger: Auto-flag overdue biopsies (>7 days without result)
CREATE OR REPLACE FUNCTION check_biopsy_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- If specimen sent but no result after 7 days
  IF NEW.sent_at IS NOT NULL
     AND NEW.resulted_at IS NULL
     AND NEW.status NOT IN ('resulted', 'reviewed', 'closed')
     AND EXTRACT(DAY FROM (NOW() - NEW.sent_at)) > 7 THEN
    NEW.is_overdue := true;

    -- Create alert if not already created
    INSERT INTO biopsy_alerts (
      tenant_id,
      biopsy_id,
      alert_type,
      severity,
      title,
      message
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      'overdue',
      'high',
      'Biopsy Result Overdue',
      'Biopsy specimen sent ' || EXTRACT(DAY FROM (NOW() - NEW.sent_at))::TEXT || ' days ago without result.'
    )
    ON CONFLICT DO NOTHING;
  ELSE
    NEW.is_overdue := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER biopsy_check_overdue
  BEFORE INSERT OR UPDATE ON biopsies
  FOR EACH ROW
  EXECUTE FUNCTION check_biopsy_overdue();

-- Trigger: Auto-create alerts for malignancy findings
CREATE OR REPLACE FUNCTION alert_on_malignancy()
RETURNS TRIGGER AS $$
BEGIN
  -- If malignancy detected and not previously detected
  IF NEW.malignancy_type IS NOT NULL
     AND (OLD.malignancy_type IS NULL OR OLD.malignancy_type IS DISTINCT FROM NEW.malignancy_type) THEN

    INSERT INTO biopsy_alerts (
      tenant_id,
      biopsy_id,
      alert_type,
      severity,
      title,
      message
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      'malignancy',
      CASE
        WHEN NEW.malignancy_type = 'melanoma' THEN 'critical'
        WHEN NEW.malignancy_type IN ('SCC', 'squamous_cell_carcinoma') THEN 'high'
        ELSE 'medium'
      END,
      'Malignancy Detected: ' || COALESCE(NEW.malignancy_type, 'Unknown'),
      'Pathology report shows ' || COALESCE(NEW.malignancy_type, 'malignancy') || '. Review and follow-up required.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER biopsy_alert_malignancy
  AFTER INSERT OR UPDATE ON biopsies
  FOR EACH ROW
  EXECUTE FUNCTION alert_on_malignancy();

-- View: Biopsy dashboard summary
CREATE OR REPLACE VIEW biopsy_dashboard AS
SELECT
  b.id,
  b.tenant_id,
  b.specimen_id,
  b.patient_id,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.mrn,
  p.dob as date_of_birth,
  b.body_location,
  b.specimen_type,
  b.status,
  b.ordered_at,
  b.collected_at,
  b.sent_at,
  b.resulted_at,
  b.reviewed_at,
  b.is_overdue,
  b.turnaround_time_days,
  b.malignancy_type,
  b.diagnosis_description,
  b.follow_up_action,
  b.patient_notified,
  ordering_provider.first_name || ' ' || ordering_provider.last_name AS ordering_provider_name,
  reviewing_provider.first_name || ' ' || reviewing_provider.last_name AS reviewing_provider_name,
  b.path_lab,
  b.path_lab_case_number,
  EXTRACT(DAY FROM (NOW() - b.sent_at))::INTEGER AS days_since_sent,
  (SELECT COUNT(*) FROM biopsy_alerts ba WHERE ba.biopsy_id = b.id AND ba.status = 'active') AS active_alert_count
FROM biopsies b
JOIN patients p ON b.patient_id = p.id
JOIN providers ordering_provider ON b.ordering_provider_id = ordering_provider.id
LEFT JOIN providers reviewing_provider ON b.reviewing_provider_id = reviewing_provider.id
WHERE b.deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE biopsies IS 'Complete biopsy tracking system - critical for patient safety';
COMMENT ON COLUMN biopsies.specimen_id IS 'Unique specimen identifier in format BX-YYYYMMDD-XXX';
COMMENT ON COLUMN biopsies.status IS 'Current status: ordered, collected, sent, received_by_lab, processing, resulted, reviewed, closed';
COMMENT ON COLUMN biopsies.is_overdue IS 'Auto-flagged true if >7 days since sent without result';
COMMENT ON TABLE biopsy_status_history IS 'Audit log of all status changes for regulatory compliance';
COMMENT ON TABLE biopsy_alerts IS 'Safety alerts for overdue biopsies, critical findings, and required follow-ups';
COMMENT ON TABLE biopsy_review_checklists IS 'Ensure providers complete all required review steps';
COMMENT ON TABLE biopsy_specimen_tracking IS 'Chain of custody tracking for specimens';
