-- Laboratory Integration System
-- Comprehensive lab order and results management for dermatology EHR

-- Lab Vendors/Facilities
create table if not exists lab_vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  name varchar(255) not null,
  vendor_type varchar(50) not null, -- quest, labcorp, local_pathology, reference_lab
  lab_id varchar(100), -- External lab identifier
  npi varchar(10),
  clia_number varchar(20), -- Clinical Laboratory Improvement Amendments

  -- Contact information
  phone varchar(20),
  fax varchar(20),
  email varchar(255),
  website varchar(255),

  -- Address
  street varchar(255),
  city varchar(100),
  state varchar(2),
  zip varchar(10),

  -- Integration details
  hl7_enabled boolean default false,
  fhir_enabled boolean default false,
  api_endpoint varchar(500),
  api_credentials_encrypted text,

  -- Configuration
  tat_hours integer, -- Typical turnaround time in hours
  accepts_electronic_orders boolean default true,
  accepts_specimens boolean default true,
  is_preferred boolean default false,
  is_active boolean default true,

  -- Specialty flags
  supports_dermpath boolean default false,
  supports_immunofluorescence boolean default false,
  supports_molecular boolean default false,
  supports_cultures boolean default false,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Lab Test Catalog
create table if not exists lab_test_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  vendor_id uuid references lab_vendors(id),

  -- Test identification
  test_code varchar(100) not null, -- Lab-specific code
  loinc_code varchar(20), -- Logical Observation Identifiers Names and Codes
  cpt_code varchar(10), -- For billing
  test_name varchar(255) not null,
  short_name varchar(100),

  -- Test classification
  category varchar(100) not null, -- chemistry, hematology, microbiology, pathology, immunology, molecular
  subcategory varchar(100), -- dermpath, immunofluorescence, culture, serology, etc

  -- Specimen requirements
  specimen_type varchar(100), -- serum, plasma, whole_blood, skin_biopsy, swab, etc
  specimen_volume varchar(100),
  specimen_container varchar(100), -- red_top, purple_top, culture_swab, formalin, etc
  collection_instructions text,

  -- Test details
  description text,
  methodology varchar(255),
  turnaround_time varchar(100), -- "24-48 hours", "3-5 days", etc

  -- Clinical information
  clinical_indications text,
  reference_range_text text,
  interpretation_guide text,

  -- Status and configuration
  requires_fasting boolean default false,
  requires_prior_auth boolean default false,
  is_sendout boolean default false, -- Test sent to reference lab
  is_active boolean default true,

  -- Dermatology-specific flags
  is_dermpath boolean default false,
  is_immunofluorescence boolean default false,
  is_culture boolean default false,
  is_patch_test boolean default false,
  is_molecular boolean default false,

  -- Ordering
  order_priority integer default 100,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Lab Order Sets (Common test panels)
create table if not exists lab_order_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  name varchar(255) not null,
  description text,
  category varchar(100), -- baseline_screening, biologics_monitoring, autoimmune_workup, etc

  -- Clinical context
  indication varchar(500),
  frequency_recommendation varchar(100), -- "Every 3 months", "Baseline only", etc

  is_active boolean default true,
  is_default boolean default false,
  created_by uuid,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Lab Order Set Tests (Many-to-many relationship)
create table if not exists lab_order_set_tests (
  id uuid primary key default gen_random_uuid(),
  order_set_id uuid not null references lab_order_sets(id) on delete cascade,
  test_id uuid not null references lab_test_catalog(id) on delete cascade,
  is_required boolean default true,
  display_order integer default 0,

  created_at timestamp default current_timestamp,

  unique(order_set_id, test_id)
);

-- Lab Orders
create table if not exists lab_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  -- Patient and encounter
  patient_id uuid not null references patients(id),
  encounter_id uuid references encounters(id),

  -- Ordering information
  ordering_provider_id uuid not null references providers(id),
  order_date timestamp not null default current_timestamp,
  order_set_id uuid references lab_order_sets(id),

  -- Lab vendor
  vendor_id uuid not null references lab_vendors(id),
  vendor_order_number varchar(100), -- External lab's order number

  -- Clinical information
  icd10_codes text[], -- Diagnosis codes for medical necessity
  clinical_indication text,
  clinical_notes text,

  -- Priority
  priority varchar(20) default 'routine', -- stat, urgent, routine, timed

  -- Specimen information
  specimen_collected_at timestamp,
  specimen_collected_by uuid references providers(id),
  specimen_sent_at timestamp,
  specimen_received_at timestamp,

  -- Specimen tracking
  specimen_id varchar(100), -- Barcode/accession number
  specimen_type varchar(100),
  specimen_source varchar(100), -- anatomic location for biopsies
  specimen_quality varchar(50), -- adequate, suboptimal, rejected
  specimen_rejection_reason text,

  -- Status tracking
  status varchar(50) not null default 'pending',
  -- pending, collected, sent, received, processing, partial_results, completed, cancelled

  -- Results tracking
  results_received_at timestamp,
  results_reviewed_at timestamp,
  results_reviewed_by uuid references providers(id),

  -- Electronic ordering (HL7 ORM)
  hl7_message_id varchar(255),
  hl7_sent_at timestamp,
  hl7_acknowledged_at timestamp,

  -- Authorization
  prior_auth_number varchar(100),
  prior_auth_obtained boolean default false,

  -- Flags
  is_fasting boolean default false,
  is_abnormal boolean default false,
  has_critical_values boolean default false,

  -- Notes
  notes text,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  created_by uuid not null
);

-- Individual test orders within a lab order
create table if not exists lab_order_tests (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references lab_orders(id) on delete cascade,
  test_id uuid not null references lab_test_catalog(id),

  -- Test details (snapshot for history)
  test_code varchar(100) not null,
  test_name varchar(255) not null,

  -- Status
  status varchar(50) default 'pending', -- pending, in_progress, completed, cancelled

  -- Results
  has_results boolean default false,
  result_status varchar(50), -- preliminary, final, corrected, amended

  created_at timestamp default current_timestamp
);

-- Lab Results
create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  -- Links
  lab_order_id uuid not null references lab_orders(id),
  lab_order_test_id uuid references lab_order_tests(id),
  patient_id uuid not null references patients(id),

  -- Test identification
  test_id uuid references lab_test_catalog(id),
  test_code varchar(100) not null,
  test_name varchar(255) not null,

  -- Result value
  result_value text, -- Numeric or text result
  result_value_numeric numeric(15,4), -- For trending
  result_unit varchar(50),

  -- Reference range
  reference_range_low numeric(15,4),
  reference_range_high numeric(15,4),
  reference_range_text varchar(255),

  -- Status flags
  is_abnormal boolean default false,
  abnormal_flag varchar(20), -- L (low), H (high), LL (critical low), HH (critical high), A (abnormal)
  is_critical boolean default false,

  -- Result metadata
  result_status varchar(50) default 'final', -- preliminary, final, corrected, amended
  result_date timestamp not null,
  performed_by varchar(255), -- Lab technician/pathologist

  -- Notes and interpretation
  result_notes text,
  interpretation text,

  -- HL7 information
  observation_id varchar(255), -- OBR segment identifier
  hl7_message_id varchar(255),

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Dermatopathology Reports (Specialized)
create table if not exists dermpath_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  -- Links
  lab_order_id uuid not null references lab_orders(id),
  patient_id uuid not null references patients(id),

  -- Report identification
  accession_number varchar(100) not null,
  report_date timestamp not null,
  pathologist_name varchar(255),
  pathologist_npi varchar(10),

  -- Specimen information
  specimen_site varchar(255), -- "Left forearm, 3cm proximal to wrist"
  specimen_type varchar(100), -- shave, punch, excision, incisional
  specimen_size varchar(100), -- "0.5 x 0.3 x 0.2 cm"
  number_of_pieces integer,

  -- Clinical information
  clinical_history text,
  clinical_diagnosis text,

  -- Pathology findings
  gross_description text,
  microscopic_description text,

  -- Diagnosis
  diagnosis text not null,
  diagnosis_code varchar(50), -- SNOMED CT code

  -- Special stains/studies
  special_stains jsonb, -- [{name: "PAS", result: "Negative for fungal elements"}]
  immunohistochemistry jsonb,
  immunofluorescence_results jsonb,

  -- Margins (for excisions)
  margins_status varchar(50), -- clear, involved, close, cannot_assess
  margin_measurements text,

  -- Additional findings
  additional_findings text,
  comment text,

  -- Report status
  status varchar(50) default 'preliminary', -- preliminary, final, amended, addendum
  amended_at timestamp,
  amendment_reason text,

  -- Document
  report_document_id uuid references documents(id),
  report_pdf_path varchar(500),
  has_images boolean default false,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Lab Result Documents (PDFs, images, etc)
create table if not exists lab_result_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  lab_order_id uuid not null references lab_orders(id),
  lab_result_id uuid references lab_results(id),
  dermpath_report_id uuid references dermpath_reports(id),

  -- Document details
  document_type varchar(50) not null, -- report_pdf, pathology_image, requisition, other
  file_name varchar(255) not null,
  file_path varchar(500) not null,
  file_size integer,
  mime_type varchar(100),

  -- Image-specific
  is_image boolean default false,
  image_description text,
  magnification varchar(50), -- For pathology images

  uploaded_at timestamp default current_timestamp,
  uploaded_by uuid
);

-- Critical Value Notifications
create table if not exists lab_critical_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  lab_result_id uuid not null references lab_results(id),
  lab_order_id uuid not null references lab_orders(id),
  patient_id uuid not null references patients(id),

  -- Critical value details
  test_name varchar(255) not null,
  result_value text not null,
  critical_reason text, -- "Result exceeds critical high threshold"

  -- Notification
  notified_provider_id uuid references providers(id),
  notification_method varchar(50), -- phone, page, email, in_app
  notified_at timestamp,
  acknowledged_at timestamp,
  acknowledged_by uuid references providers(id),

  -- Documentation
  read_back_value text, -- Value read back for verification
  action_taken text, -- What provider did in response

  -- Status
  status varchar(50) default 'pending', -- pending, notified, acknowledged, escalated

  created_at timestamp default current_timestamp
);

-- Standing Orders (Automatic lab orders for specific conditions)
create table if not exists lab_standing_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  name varchar(255) not null,
  description text,

  -- Trigger conditions
  diagnosis_codes text[], -- ICD-10 codes that trigger this
  medication_id uuid references medications(id), -- Medication that requires monitoring

  -- Order set to use
  order_set_id uuid not null references lab_order_sets(id),

  -- Frequency
  frequency_type varchar(50), -- one_time, recurring
  frequency_interval varchar(100), -- "Every 3 months", "Every 12 weeks", etc
  frequency_days integer, -- Days between orders for recurring

  -- Auto-order configuration
  auto_order_enabled boolean default false,
  require_provider_approval boolean default true,

  is_active boolean default true,
  created_by uuid not null,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Culture Results (Fungal, bacterial)
create table if not exists lab_culture_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  lab_order_id uuid not null references lab_orders(id),
  patient_id uuid not null references patients(id),

  -- Culture details
  culture_type varchar(50) not null, -- fungal, bacterial, viral, mycobacterial
  specimen_source varchar(255),
  collection_date timestamp,

  -- Results
  organism_identified varchar(255),
  organism_count varchar(100), -- heavy, moderate, light, rare
  is_normal_flora boolean default false,

  -- Susceptibility testing
  susceptibility_results jsonb, -- [{antibiotic: "Fluconazole", result: "Sensitive", mic: "0.5"}]

  -- Status
  preliminary_result text,
  preliminary_date timestamp,
  final_result text,
  final_date timestamp,

  status varchar(50) default 'pending', -- pending, preliminary, final

  notes text,

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Patch Test Results
create table if not exists patch_test_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  patient_id uuid not null references patients(id),
  encounter_id uuid references encounters(id),
  ordering_provider_id uuid not null references providers(id),

  -- Test details
  panel_name varchar(255), -- "TRUE Test Panel 1", "Extended Series", etc
  application_date date not null,

  -- Reading schedule
  reading_48h_date date,
  reading_48h_by uuid references providers(id),
  reading_72h_date date,
  reading_72h_by uuid references providers(id),
  reading_96h_date date,
  reading_96h_by uuid references providers(id),

  -- Overall notes
  overall_interpretation text,

  status varchar(50) default 'applied', -- applied, reading_1, reading_2, completed

  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Individual patch test allergen results
create table if not exists patch_test_allergens (
  id uuid primary key default gen_random_uuid(),
  patch_test_id uuid not null references patch_test_results(id) on delete cascade,

  -- Allergen details
  allergen_name varchar(255) not null,
  position varchar(10), -- Patch location (e.g., "1A", "2C")
  concentration varchar(100),

  -- Readings (using standard grading: -, ?, +, ++, +++)
  reading_48h varchar(10),
  reading_72h varchar(10),
  reading_96h varchar(10),

  -- Interpretation
  is_positive boolean default false,
  relevance varchar(50), -- current, past, possible, doubtful, not_relevant
  clinical_notes text,

  created_at timestamp default current_timestamp
);

-- Indexes for performance
create index if not exists idx_lab_vendors_tenant on lab_vendors(tenant_id);
create index if not exists idx_lab_vendors_type on lab_vendors(vendor_type);
create index if not exists idx_lab_vendors_active on lab_vendors(is_active) where is_active = true;

create index if not exists idx_lab_test_catalog_tenant on lab_test_catalog(tenant_id);
create index if not exists idx_lab_test_catalog_vendor on lab_test_catalog(vendor_id);
create index if not exists idx_lab_test_catalog_code on lab_test_catalog(test_code);
create index if not exists idx_lab_test_catalog_category on lab_test_catalog(category);
create index if not exists idx_lab_test_catalog_active on lab_test_catalog(is_active) where is_active = true;

create index if not exists idx_lab_order_sets_tenant on lab_order_sets(tenant_id);
create index if not exists idx_lab_order_sets_category on lab_order_sets(category);
create index if not exists idx_lab_order_sets_active on lab_order_sets(is_active) where is_active = true;

create index if not exists idx_lab_orders_tenant on lab_orders(tenant_id);
create index if not exists idx_lab_orders_patient on lab_orders(patient_id);
create index if not exists idx_lab_orders_encounter on lab_orders(encounter_id);
create index if not exists idx_lab_orders_provider on lab_orders(ordering_provider_id);
create index if not exists idx_lab_orders_vendor on lab_orders(vendor_id);
create index if not exists idx_lab_orders_status on lab_orders(status);
create index if not exists idx_lab_orders_date on lab_orders(order_date desc);
create index if not exists idx_lab_orders_critical on lab_orders(has_critical_values) where has_critical_values = true;
create index if not exists idx_lab_orders_specimen_id on lab_orders(specimen_id);

create index if not exists idx_lab_order_tests_order on lab_order_tests(lab_order_id);
create index if not exists idx_lab_order_tests_test on lab_order_tests(test_id);

create index if not exists idx_lab_results_tenant on lab_results(tenant_id);
create index if not exists idx_lab_results_order on lab_results(lab_order_id);
create index if not exists idx_lab_results_patient on lab_results(patient_id);
create index if not exists idx_lab_results_test on lab_results(test_id);
create index if not exists idx_lab_results_date on lab_results(result_date desc);
create index if not exists idx_lab_results_abnormal on lab_results(is_abnormal) where is_abnormal = true;
create index if not exists idx_lab_results_critical on lab_results(is_critical) where is_critical = true;

create index if not exists idx_dermpath_reports_tenant on dermpath_reports(tenant_id);
create index if not exists idx_dermpath_reports_order on dermpath_reports(lab_order_id);
create index if not exists idx_dermpath_reports_patient on dermpath_reports(patient_id);
create index if not exists idx_dermpath_reports_accession on dermpath_reports(accession_number);
create index if not exists idx_dermpath_reports_date on dermpath_reports(report_date desc);

create index if not exists idx_lab_result_documents_order on lab_result_documents(lab_order_id);
create index if not exists idx_lab_result_documents_result on lab_result_documents(lab_result_id);

create index if not exists idx_lab_critical_notifications_result on lab_critical_notifications(lab_result_id);
create index if not exists idx_lab_critical_notifications_patient on lab_critical_notifications(patient_id);
create index if not exists idx_lab_critical_notifications_status on lab_critical_notifications(status);

create index if not exists idx_lab_standing_orders_tenant on lab_standing_orders(tenant_id);
create index if not exists idx_lab_standing_orders_active on lab_standing_orders(is_active) where is_active = true;

create index if not exists idx_lab_culture_results_order on lab_culture_results(lab_order_id);
create index if not exists idx_lab_culture_results_patient on lab_culture_results(patient_id);

create index if not exists idx_patch_test_results_patient on patch_test_results(patient_id);
create index if not exists idx_patch_test_results_encounter on patch_test_results(encounter_id);
create index if not exists idx_patch_test_allergens_test on patch_test_allergens(patch_test_id);
