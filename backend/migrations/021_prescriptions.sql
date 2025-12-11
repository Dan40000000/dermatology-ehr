-- ePrescribing System Tables
-- This creates the foundation for Surescripts integration

-- Medications master table
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  generic_name varchar(255),
  brand_name varchar(255),
  strength varchar(100),
  dosage_form varchar(100), -- cream, ointment, tablet, capsule, injection, solution, lotion
  route varchar(100), -- topical, oral, subcutaneous, intramuscular, intravenous
  dea_schedule varchar(10), -- II, III, IV, V, or null for non-controlled
  is_controlled boolean default false,
  category varchar(100), -- dermatology category (topical-steroid, topical-retinoid, oral-antibiotic, etc)
  rxcui varchar(50), -- RxNorm Concept Unique Identifier for Surescripts
  ndc varchar(50), -- National Drug Code
  manufacturer varchar(255),
  typical_sig text, -- Typical directions for use
  created_at timestamp default current_timestamp
);

-- Pharmacies
create table if not exists pharmacies (
  id uuid primary key default gen_random_uuid(),
  ncpdp_id varchar(20), -- National Council for Prescription Drug Programs ID (required for Surescripts)
  name varchar(255) not null,
  phone varchar(20),
  fax varchar(20),
  street varchar(255),
  city varchar(100),
  state varchar(2),
  zip varchar(10),
  is_preferred boolean default false,
  is_24_hour boolean default false,
  accepts_erx boolean default true, -- Electronic prescription capable
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Prescriptions
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  patient_id uuid not null references patients(id),
  encounter_id uuid references encounters(id),
  provider_id uuid not null references providers(id),
  medication_id uuid references medications(id),

  -- Medication details (stored for history even if medication changes)
  medication_name varchar(255) not null,
  generic_name varchar(255),
  strength varchar(100),
  dosage_form varchar(100),

  -- Prescription details
  sig text not null, -- Directions for use (Signatura)
  quantity numeric(10,2) not null,
  quantity_unit varchar(20) default 'each', -- each, ml, grams, etc
  refills integer not null default 0,
  days_supply integer,

  -- Pharmacy details
  pharmacy_id uuid references pharmacies(id),
  pharmacy_name varchar(255),
  pharmacy_phone varchar(20),
  pharmacy_address text,
  pharmacy_ncpdp varchar(20), -- Stored for historical record

  -- Prescribing details
  daw boolean default false, -- Dispense As Written (no substitutions)
  is_controlled boolean default false,
  dea_schedule varchar(10),

  -- Status and workflow
  status varchar(50) not null default 'pending', -- pending, sent, transmitted, error, cancelled, discontinued

  -- Electronic prescribing (Surescripts)
  sent_at timestamp,
  transmitted_at timestamp,
  surescripts_message_id varchar(255),
  surescripts_transaction_id varchar(255),
  error_message text,
  error_code varchar(50),

  -- Fill tracking
  filled_at timestamp,
  fill_pharmacy varchar(255),

  -- Clinical notes
  indication varchar(500), -- Reason for prescription
  notes text, -- Additional notes for pharmacist

  -- Audit fields
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  created_by uuid not null,
  updated_by uuid
);

-- Prescription change log (for controlled substances compliance)
create table if not exists prescription_audit_log (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id),
  action varchar(50) not null, -- created, modified, cancelled, transmitted, filled
  changed_fields jsonb,
  user_id uuid not null,
  ip_address varchar(50),
  user_agent text,
  created_at timestamp default current_timestamp
);

-- Indexes for performance
create index if not exists idx_prescriptions_tenant on prescriptions(tenant_id);
create index if not exists idx_prescriptions_patient on prescriptions(patient_id);
create index if not exists idx_prescriptions_encounter on prescriptions(encounter_id);
create index if not exists idx_prescriptions_provider on prescriptions(provider_id);
create index if not exists idx_prescriptions_pharmacy on prescriptions(pharmacy_id);
create index if not exists idx_prescriptions_status on prescriptions(status);
create index if not exists idx_prescriptions_created_at on prescriptions(created_at desc);
create index if not exists idx_prescriptions_controlled on prescriptions(is_controlled) where is_controlled = true;

create index if not exists idx_medications_name on medications(name);
create index if not exists idx_medications_generic_name on medications(generic_name);
create index if not exists idx_medications_controlled on medications(is_controlled) where is_controlled = true;
create index if not exists idx_medications_category on medications(category);

create index if not exists idx_pharmacies_ncpdp on pharmacies(ncpdp_id);
create index if not exists idx_pharmacies_preferred on pharmacies(is_preferred) where is_preferred = true;
create index if not exists idx_pharmacies_zip on pharmacies(zip);

create index if not exists idx_prescription_audit_prescription on prescription_audit_log(prescription_id);
create index if not exists idx_prescription_audit_created_at on prescription_audit_log(created_at desc);
