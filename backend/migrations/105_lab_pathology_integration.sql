-- Lab and Pathology Integration System
-- Migration 105: Comprehensive lab and pathology integration for dermatology EHR
-- Supports HL7 v2.x, API, and SFTP integrations with LabCorp, Quest, and pathology labs

-- Lab Interfaces (external lab connections)
CREATE TABLE IF NOT EXISTS lab_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  lab_name VARCHAR(255) NOT NULL,
  interface_type VARCHAR(50) NOT NULL CHECK (interface_type IN ('HL7', 'API', 'SFTP')),
  endpoint VARCHAR(500),
  credentials_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  supported_test_types TEXT[],
  hl7_version VARCHAR(20) DEFAULT '2.5.1',
  connection_timeout_ms INTEGER DEFAULT 30000,
  retry_attempts INTEGER DEFAULT 3,
  last_connection_at TIMESTAMP,
  last_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lab Orders (replaces basic lab_orders if not exists or adds columns)
CREATE TABLE IF NOT EXISTS lab_orders_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  encounter_id UUID,
  ordering_provider_id UUID NOT NULL,
  lab_id UUID REFERENCES lab_interfaces(id),
  order_number VARCHAR(100),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'processing', 'partial', 'completed', 'reviewed', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  specimens JSONB[] DEFAULT '{}',
  clinical_indication TEXT,
  clinical_notes TEXT,
  icd10_codes TEXT[],
  is_fasting BOOLEAN DEFAULT false,
  collection_date TIMESTAMP,
  collected_by UUID,
  specimen_source VARCHAR(100),
  specimen_site VARCHAR(255),
  hl7_message_id VARCHAR(100),
  hl7_sent_at TIMESTAMP,
  hl7_ack_received BOOLEAN DEFAULT false,
  external_order_id VARCHAR(255),
  results_received_at TIMESTAMP,
  results_reviewed_at TIMESTAMP,
  results_reviewed_by UUID,
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lab_orders_v2_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_lab_orders_v2_encounter FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL,
  CONSTRAINT fk_lab_orders_v2_provider FOREIGN KEY (ordering_provider_id) REFERENCES providers(id) ON DELETE RESTRICT
);

-- Lab Results
CREATE TABLE IF NOT EXISTS lab_results_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  order_id UUID NOT NULL REFERENCES lab_orders_v2(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  result_date TIMESTAMP,
  result_status VARCHAR(50) DEFAULT 'preliminary' CHECK (result_status IN ('preliminary', 'final', 'corrected', 'amended', 'cancelled')),
  result_data JSONB NOT NULL DEFAULT '{}',
  abnormal_flags TEXT[],
  critical_flags TEXT[],
  test_code VARCHAR(50),
  test_name VARCHAR(255),
  result_value TEXT,
  result_value_numeric DECIMAL(15,5),
  result_unit VARCHAR(50),
  reference_range_low DECIMAL(15,5),
  reference_range_high DECIMAL(15,5),
  reference_range_text VARCHAR(255),
  interpretation TEXT,
  performing_lab VARCHAR(255),
  performing_lab_clia VARCHAR(50),
  hl7_message_id VARCHAR(100),
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lab_results_v2_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Pathology Orders (biopsy-focused for dermatology)
CREATE TABLE IF NOT EXISTS pathology_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  encounter_id UUID,
  procedure_doc_id UUID,
  ordering_provider_id UUID NOT NULL,
  pathology_lab_id UUID REFERENCES lab_interfaces(id),
  order_number VARCHAR(100),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  specimen_type VARCHAR(100) NOT NULL,
  specimen_site VARCHAR(255),
  specimen_laterality VARCHAR(20) CHECK (specimen_laterality IN ('left', 'right', 'bilateral', 'midline', 'not_applicable')),
  clinical_history TEXT,
  clinical_diagnosis TEXT,
  gross_description TEXT,
  specimen_count INTEGER DEFAULT 1,
  specimen_size_mm DECIMAL(8,2),
  fixative VARCHAR(100) DEFAULT 'formalin',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'processing', 'completed', 'reviewed', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  special_stains_requested TEXT[],
  immunohistochemistry_requested TEXT[],
  molecular_testing_requested TEXT[],
  icd10_codes TEXT[],
  cpt_codes TEXT[],
  collection_date TIMESTAMP,
  collected_by UUID,
  external_order_id VARCHAR(255),
  accession_number VARCHAR(100),
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pathology_orders_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pathology_orders_encounter FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL,
  CONSTRAINT fk_pathology_orders_provider FOREIGN KEY (ordering_provider_id) REFERENCES providers(id) ON DELETE RESTRICT
);

-- Pathology Results
CREATE TABLE IF NOT EXISTS pathology_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  order_id UUID NOT NULL REFERENCES pathology_orders(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  received_date TIMESTAMP,
  report_date TIMESTAMP,
  result_status VARCHAR(50) DEFAULT 'preliminary' CHECK (result_status IN ('preliminary', 'final', 'amended', 'addendum')),
  diagnosis TEXT,
  diagnosis_codes TEXT[],
  microscopic_description TEXT,
  gross_description TEXT,
  clinical_correlation TEXT,
  special_stains JSONB DEFAULT '{}',
  immunohistochemistry JSONB DEFAULT '{}',
  molecular_results JSONB DEFAULT '{}',
  synoptic_report JSONB DEFAULT '{}',
  margins_status VARCHAR(50) CHECK (margins_status IN ('clear', 'positive', 'close', 'not_applicable', 'cannot_assess')),
  margin_distance_mm DECIMAL(5,2),
  tumor_size_mm DECIMAL(8,2),
  tumor_depth_mm DECIMAL(5,2),
  mitotic_rate VARCHAR(100),
  breslow_depth_mm DECIMAL(5,2),
  clark_level VARCHAR(20),
  ulceration BOOLEAN,
  perineural_invasion BOOLEAN,
  lymphovascular_invasion BOOLEAN,
  tumor_grade VARCHAR(50),
  pathologist_name VARCHAR(255),
  pathologist_npi VARCHAR(20),
  signed_at TIMESTAMP,
  addendum_notes TEXT,
  is_malignant BOOLEAN,
  is_precancerous BOOLEAN,
  follow_up_recommended TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  external_report_url TEXT,
  pdf_report_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pathology_results_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Result Notifications
CREATE TABLE IF NOT EXISTS result_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  order_id UUID NOT NULL,
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('lab', 'pathology')),
  patient_id UUID NOT NULL,
  provider_id UUID,
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('new_result', 'abnormal', 'critical', 'pathology_complete', 'malignant', 'requires_review', 'amended')),
  notification_method VARCHAR(50) CHECK (notification_method IN ('in_app', 'email', 'sms', 'fax', 'phone')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'critical')),
  message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID,
  action_taken TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_result_notifications_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Common Dermatology Lab Tests (seed data reference)
CREATE TABLE IF NOT EXISTS derm_lab_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255),
  test_code VARCHAR(50) NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  test_category VARCHAR(100) NOT NULL,
  specimen_type VARCHAR(100),
  description TEXT,
  loinc_code VARCHAR(20),
  cpt_code VARCHAR(20),
  is_common BOOLEAN DEFAULT false,
  turnaround_days INTEGER,
  fasting_required BOOLEAN DEFAULT false,
  special_instructions TEXT,
  reference_ranges JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HL7 Message Log for Lab/Path
CREATE TABLE IF NOT EXISTS lab_hl7_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  message_type VARCHAR(20) NOT NULL,
  message_direction VARCHAR(10) NOT NULL CHECK (message_direction IN ('inbound', 'outbound')),
  message_control_id VARCHAR(100),
  order_id UUID,
  order_type VARCHAR(20) CHECK (order_type IN ('lab', 'pathology')),
  lab_interface_id UUID REFERENCES lab_interfaces(id),
  raw_message TEXT NOT NULL,
  parsed_data JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'processed', 'error', 'acknowledged')),
  error_message TEXT,
  acknowledgment TEXT,
  processed_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_interfaces_tenant_active ON lab_interfaces(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lab_interfaces_type ON lab_interfaces(interface_type);

CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_tenant ON lab_orders_v2(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_patient ON lab_orders_v2(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_encounter ON lab_orders_v2(encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_status ON lab_orders_v2(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_order_date ON lab_orders_v2(order_date);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_tenant_status ON lab_orders_v2(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_external_id ON lab_orders_v2(external_order_id);

CREATE INDEX IF NOT EXISTS idx_lab_results_v2_tenant ON lab_results_v2(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_v2_order ON lab_results_v2(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_v2_patient ON lab_results_v2(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_v2_status ON lab_results_v2(result_status);
CREATE INDEX IF NOT EXISTS idx_lab_results_v2_abnormal ON lab_results_v2(tenant_id) WHERE abnormal_flags IS NOT NULL AND array_length(abnormal_flags, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_pathology_orders_tenant ON pathology_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pathology_orders_patient ON pathology_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_pathology_orders_encounter ON pathology_orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_pathology_orders_status ON pathology_orders(status);
CREATE INDEX IF NOT EXISTS idx_pathology_orders_pending ON pathology_orders(tenant_id, status) WHERE status IN ('pending', 'in_transit', 'received', 'processing');
CREATE INDEX IF NOT EXISTS idx_pathology_orders_accession ON pathology_orders(accession_number);

CREATE INDEX IF NOT EXISTS idx_pathology_results_tenant ON pathology_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pathology_results_order ON pathology_results(order_id);
CREATE INDEX IF NOT EXISTS idx_pathology_results_patient ON pathology_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_pathology_results_malignant ON pathology_results(tenant_id) WHERE is_malignant = true;
CREATE INDEX IF NOT EXISTS idx_pathology_results_unreviewed ON pathology_results(tenant_id) WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_result_notifications_tenant ON result_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_result_notifications_order ON result_notifications(order_id, order_type);
CREATE INDEX IF NOT EXISTS idx_result_notifications_unacknowledged ON result_notifications(tenant_id) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_result_notifications_priority ON result_notifications(priority, sent_at);

CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_tenant ON lab_hl7_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_order ON lab_hl7_messages(order_id, order_type);
CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_status ON lab_hl7_messages(status);
CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_control_id ON lab_hl7_messages(message_control_id);

-- Seed common dermatology lab tests
INSERT INTO derm_lab_catalog (test_code, test_name, test_category, specimen_type, loinc_code, cpt_code, is_common, turnaround_days, description) VALUES
  -- Biopsy/Pathology
  ('PATH-SKIN', 'Skin Biopsy Pathology', 'pathology', 'tissue', '88305-8', '88305', true, 5, 'Standard skin biopsy examination'),
  ('PATH-MOHS', 'Mohs Frozen Section', 'pathology', 'tissue', '88331-7', '88331', true, 1, 'Mohs micrographic surgery frozen section'),
  ('PATH-IHC', 'Immunohistochemistry Panel', 'pathology', 'tissue', '88342-8', '88342', true, 7, 'IHC staining panel for tumor characterization'),

  -- Fungal Studies
  ('FUNGAL-KOH', 'KOH Prep', 'microbiology', 'skin scraping', '606-9', '87220', true, 1, 'Potassium hydroxide preparation for fungal elements'),
  ('FUNGAL-CULTURE', 'Fungal Culture', 'microbiology', 'skin scraping', '580-6', '87101', true, 21, 'Fungal culture with identification'),
  ('FUNGAL-DERM', 'Dermatophyte Culture', 'microbiology', 'skin/nail', '580-6', '87101', true, 14, 'Dermatophyte-specific culture'),

  -- Bacterial Studies
  ('BACT-CULTURE', 'Bacterial Culture', 'microbiology', 'wound swab', '600-2', '87070', true, 3, 'Aerobic bacterial culture'),
  ('BACT-SENSITIVITY', 'Antibiotic Sensitivity', 'microbiology', 'isolate', '29576-6', '87186', true, 4, 'Antibiotic sensitivity testing'),
  ('MRSA-SCREEN', 'MRSA Screen', 'microbiology', 'nasal swab', '42721-1', '87081', true, 2, 'MRSA screening culture'),

  -- Autoimmune Workup
  ('ANA', 'Antinuclear Antibody', 'autoimmune', 'serum', '5048-4', '86038', true, 3, 'ANA screening with titer if positive'),
  ('ANA-PATTERN', 'ANA with Pattern', 'autoimmune', 'serum', '8061-4', '86039', true, 3, 'ANA with pattern identification'),
  ('RF', 'Rheumatoid Factor', 'autoimmune', 'serum', '11572-5', '86431', true, 2, 'Rheumatoid factor quantitative'),
  ('ANTI-dsDNA', 'Anti-dsDNA Antibody', 'autoimmune', 'serum', '11580-8', '86225', true, 4, 'Double-stranded DNA antibodies'),
  ('SSA-SSB', 'SSA/SSB Antibodies', 'autoimmune', 'serum', '49892-4', '86235', true, 5, 'Anti-Ro/La antibodies'),
  ('DIF-SKIN', 'Direct Immunofluorescence', 'autoimmune', 'tissue', '88346-9', '88346', true, 5, 'Direct IF on skin biopsy'),

  -- Systemic Medication Monitoring
  ('CBC', 'Complete Blood Count', 'hematology', 'whole blood', '58410-2', '85025', true, 1, 'CBC with differential'),
  ('CMP', 'Comprehensive Metabolic Panel', 'chemistry', 'serum', '24323-8', '80053', true, 1, 'Complete metabolic panel'),
  ('LFT', 'Liver Function Tests', 'chemistry', 'serum', '24325-3', '80076', true, 1, 'Hepatic function panel'),
  ('LIPID', 'Lipid Panel', 'chemistry', 'serum', '57698-3', '80061', true, 1, 'Lipid panel with LDL'),
  ('HBA1C', 'Hemoglobin A1c', 'chemistry', 'whole blood', '4548-4', '83036', true, 1, 'Glycated hemoglobin'),
  ('TB-QUANT', 'TB Quantiferon Gold', 'infectious', 'whole blood', '64082-0', '86480', true, 3, 'TB screening blood test'),
  ('HEP-PANEL', 'Hepatitis Panel', 'infectious', 'serum', '24362-6', '80074', true, 3, 'Hepatitis B and C screening'),
  ('HIV', 'HIV 1/2 Antibody', 'infectious', 'serum', '7918-6', '86703', true, 2, 'HIV antibody screen'),

  -- Allergy Testing
  ('IGE-TOTAL', 'Total IgE', 'allergy', 'serum', '19113-0', '82785', true, 3, 'Total immunoglobulin E'),
  ('ALLERGEN-PANEL', 'Allergen Panel', 'allergy', 'serum', '90766-7', '86003', true, 5, 'Common allergen panel'),

  -- Specialized Derm Tests
  ('PORPHYRIN-URINE', 'Urine Porphyrins', 'specialty', 'urine', '2595-5', '84120', false, 7, 'Urine porphyrin screen'),
  ('G6PD', 'G6PD Level', 'hematology', 'whole blood', '2348-9', '82955', true, 3, 'G6PD enzyme activity'),
  ('THIOPURINE-MT', 'TPMT Activity', 'pharmacogenomics', 'whole blood', '17856-6', '81401', true, 7, 'Thiopurine methyltransferase')
ON CONFLICT DO NOTHING;

-- Seed lab interfaces (mock data)
INSERT INTO lab_interfaces (tenant_id, lab_name, interface_type, endpoint, is_active, supported_test_types, hl7_version) VALUES
  ('demo-tenant', 'LabCorp', 'HL7', 'mllp://labcorp-hl7.mock:2575', true, ARRAY['hematology', 'chemistry', 'microbiology', 'autoimmune'], '2.5.1'),
  ('demo-tenant', 'Quest Diagnostics', 'HL7', 'mllp://quest-hl7.mock:2575', true, ARRAY['hematology', 'chemistry', 'microbiology', 'autoimmune'], '2.5.1'),
  ('demo-tenant', 'DermPath Laboratory', 'API', 'https://dermpath.mock/api/v1', true, ARRAY['pathology'], '2.5.1'),
  ('demo-tenant', 'University Pathology', 'SFTP', 'sftp://upath.mock:22/results', true, ARRAY['pathology'], '2.5.1')
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE lab_interfaces IS 'External lab/pathology system connections with credentials and configuration';
COMMENT ON TABLE lab_orders_v2 IS 'Lab orders with HL7 integration, specimen tracking, and result linkage';
COMMENT ON TABLE lab_results_v2 IS 'Lab results with abnormal flags, reference ranges, and review tracking';
COMMENT ON TABLE pathology_orders IS 'Pathology/biopsy orders optimized for dermatology workflow';
COMMENT ON TABLE pathology_results IS 'Detailed pathology reports with synoptic data and malignancy tracking';
COMMENT ON TABLE result_notifications IS 'Notification tracking for abnormal, critical, and malignant results';
COMMENT ON TABLE derm_lab_catalog IS 'Common dermatology lab tests with codes and reference information';
COMMENT ON TABLE lab_hl7_messages IS 'HL7 message audit log for lab and pathology communications';
