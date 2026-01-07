-- Migration: E-Prescribing System with Pharmacy Network Integration
-- Simulates Surescripts/NCPDP network connectivity for electronic prescriptions

-- Enhanced pharmacies table with NCPDP and chain information
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS chain VARCHAR(100);
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS hours JSONB DEFAULT '{}';
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS surescripts_enabled BOOLEAN DEFAULT true;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';

-- Create index on NCPDP for fast lookups
CREATE INDEX IF NOT EXISTS idx_pharmacies_ncpdp ON pharmacies(ncpdp_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_chain ON pharmacies(chain);
CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies(city, state, zip);

-- RX History table - stores dispensed medications from all pharmacies
CREATE TABLE IF NOT EXISTS rx_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pharmacy_id UUID REFERENCES pharmacies(id),
  pharmacy_ncpdp VARCHAR(20),
  pharmacy_name VARCHAR(255),

  -- Medication information
  medication_name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  ndc VARCHAR(20),
  strength VARCHAR(100),
  dosage_form VARCHAR(100),
  quantity DECIMAL(10, 2),
  quantity_unit VARCHAR(50) DEFAULT 'each',
  days_supply INTEGER,

  -- Prescription details
  sig TEXT,
  prescriber_name VARCHAR(255),
  prescriber_npi VARCHAR(20),
  prescribed_date TIMESTAMP,
  written_date TIMESTAMP,

  -- Fill information
  fill_number INTEGER DEFAULT 1,
  fill_date TIMESTAMP NOT NULL,
  filled_quantity DECIMAL(10, 2),
  refills_remaining INTEGER DEFAULT 0,
  last_fill_date TIMESTAMP,

  -- Source tracking
  source VARCHAR(50) DEFAULT 'surescripts', -- surescripts, manual, imported
  surescripts_message_id VARCHAR(100),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rx_history_patient ON rx_history(patient_id, fill_date DESC);
CREATE INDEX idx_rx_history_tenant ON rx_history(tenant_id);
CREATE INDEX idx_rx_history_pharmacy ON rx_history(pharmacy_id);
CREATE INDEX idx_rx_history_source ON rx_history(source);

-- Prescription transmissions table - tracks eRx sending status
CREATE TABLE IF NOT EXISTS prescription_transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  pharmacy_id UUID REFERENCES pharmacies(id),
  pharmacy_ncpdp VARCHAR(20),

  -- Transmission details
  transmission_id VARCHAR(100) UNIQUE, -- Surescripts message ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, accepted, rejected, error, cancelled
  transmission_type VARCHAR(50) DEFAULT 'new_rx', -- new_rx, refill, cancel, change

  -- NCPDP SCRIPT message
  script_message JSONB,
  request_payload JSONB,
  response_payload JSONB,

  -- Status tracking
  sent_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  error_code VARCHAR(50),

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescription_transmissions_prescription ON prescription_transmissions(prescription_id);
CREATE INDEX idx_prescription_transmissions_pharmacy ON prescription_transmissions(pharmacy_id);
CREATE INDEX idx_prescription_transmissions_status ON prescription_transmissions(status);
CREATE INDEX idx_prescription_transmissions_transmission_id ON prescription_transmissions(transmission_id);

-- Formulary information - insurance preferred drugs
CREATE TABLE IF NOT EXISTS formulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Insurance/Payer information
  payer_id VARCHAR(100),
  payer_name VARCHAR(255),
  plan_name VARCHAR(255),

  -- Medication
  medication_name VARCHAR(255) NOT NULL,
  ndc VARCHAR(20),
  tier INTEGER DEFAULT 1, -- 1-5, lower is cheaper

  -- Coverage details
  is_preferred BOOLEAN DEFAULT false,
  requires_prior_auth BOOLEAN DEFAULT false,
  requires_step_therapy BOOLEAN DEFAULT false,
  quantity_limit INTEGER,

  -- Cost information
  copay_amount DECIMAL(10, 2),
  copay_percentage DECIMAL(5, 2),

  -- Alternatives
  alternatives JSONB DEFAULT '[]',

  effective_date DATE,
  termination_date DATE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_formulary_payer ON formulary(payer_id);
CREATE INDEX idx_formulary_medication ON formulary(medication_name);
CREATE INDEX idx_formulary_tier ON formulary(tier);

-- Patient benefits - insurance coverage details
CREATE TABLE IF NOT EXISTS patient_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Insurance information
  payer_id VARCHAR(100),
  payer_name VARCHAR(255),
  plan_name VARCHAR(255),
  member_id VARCHAR(100),
  group_number VARCHAR(100),

  -- Pharmacy benefits
  pharmacy_network VARCHAR(255),
  rx_bin VARCHAR(20),
  rx_pcn VARCHAR(20),
  rx_group VARCHAR(50),

  -- Coverage tiers
  tier_1_copay DECIMAL(10, 2),
  tier_2_copay DECIMAL(10, 2),
  tier_3_copay DECIMAL(10, 2),
  tier_4_copay DECIMAL(10, 2),
  tier_5_copay DECIMAL(10, 2),

  -- Deductibles
  deductible_amount DECIMAL(10, 2),
  deductible_met DECIMAL(10, 2) DEFAULT 0,
  deductible_remaining DECIMAL(10, 2),

  -- Coverage limits
  out_of_pocket_max DECIMAL(10, 2),
  out_of_pocket_met DECIMAL(10, 2) DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_date DATE,
  termination_date DATE,

  -- Source
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id),
  source VARCHAR(50) DEFAULT 'manual', -- manual, eligibility_check, imported

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patient_benefits_patient ON patient_benefits(patient_id);
CREATE INDEX idx_patient_benefits_tenant ON patient_benefits(tenant_id);
CREATE INDEX idx_patient_benefits_payer ON patient_benefits(payer_id);

-- Medication interaction database
CREATE TABLE IF NOT EXISTS drug_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  medication_1 VARCHAR(255) NOT NULL,
  medication_2 VARCHAR(255) NOT NULL,

  severity VARCHAR(50) NOT NULL, -- severe, moderate, mild
  interaction_type VARCHAR(100),
  description TEXT,
  clinical_effects TEXT,
  management TEXT,

  source VARCHAR(100),
  last_updated DATE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drug_interactions_med1 ON drug_interactions(medication_1);
CREATE INDEX idx_drug_interactions_med2 ON drug_interactions(medication_2);
CREATE INDEX idx_drug_interactions_severity ON drug_interactions(severity);

-- Patient allergies
CREATE TABLE IF NOT EXISTS patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  allergen VARCHAR(255) NOT NULL,
  allergen_type VARCHAR(50), -- medication, food, environmental

  reaction VARCHAR(255),
  severity VARCHAR(50), -- severe, moderate, mild
  onset_date DATE,

  notes TEXT,
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, resolved

  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patient_allergies_patient ON patient_allergies(patient_id);
CREATE INDEX idx_patient_allergies_tenant ON patient_allergies(tenant_id);
CREATE INDEX idx_patient_allergies_status ON patient_allergies(status);

-- Surescripts transaction log
CREATE TABLE IF NOT EXISTS surescripts_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  transaction_type VARCHAR(50) NOT NULL, -- rx_new, rx_change, rx_cancel, rx_history, formulary_check
  direction VARCHAR(20) NOT NULL, -- inbound, outbound

  message_id VARCHAR(100) UNIQUE,
  relate_to_message_id VARCHAR(100),

  from_ncpdp VARCHAR(20),
  to_ncpdp VARCHAR(20),

  patient_id UUID REFERENCES patients(id),
  prescription_id UUID REFERENCES prescriptions(id),

  message_payload JSONB,
  response_payload JSONB,

  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,

  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_surescripts_transactions_tenant ON surescripts_transactions(tenant_id);
CREATE INDEX idx_surescripts_transactions_type ON surescripts_transactions(transaction_type);
CREATE INDEX idx_surescripts_transactions_message_id ON surescripts_transactions(message_id);
CREATE INDEX idx_surescripts_transactions_patient ON surescripts_transactions(patient_id);

COMMENT ON TABLE rx_history IS 'Complete medication history from all pharmacies (simulated Surescripts RxHistoryRequest)';
COMMENT ON TABLE prescription_transmissions IS 'Tracks electronic prescription transmissions to pharmacies via NCPDP';
COMMENT ON TABLE formulary IS 'Insurance formulary information for medication coverage';
COMMENT ON TABLE patient_benefits IS 'Patient insurance pharmacy benefits and coverage details';
COMMENT ON TABLE drug_interactions IS 'Drug-drug interaction database for safety checks';
COMMENT ON TABLE patient_allergies IS 'Patient allergy information for prescription safety';
COMMENT ON TABLE surescripts_transactions IS 'Log of all Surescripts network transactions';
