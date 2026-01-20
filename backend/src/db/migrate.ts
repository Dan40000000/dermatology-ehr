import { pool } from "./pool";

const migrations: { name: string; sql: string }[] = [
  {
    name: "001_init",
    sql: `
    create table if not exists tenants (
      id text primary key,
      name text not null,
      created_at timestamptz default now()
    );

    create table if not exists users (
      id text primary key,
      tenant_id text not null references tenants(id),
      email text not null,
      full_name text not null,
      role text not null,
      password_hash text not null,
      created_at timestamptz default now(),
      unique(tenant_id, email)
    );

    create table if not exists refresh_tokens (
      token text primary key,
      user_id text not null references users(id),
      tenant_id text not null references tenants(id),
      expires_at timestamptz not null,
      revoked boolean default false,
      created_at timestamptz default now()
    );

    create table if not exists patients (
      id text primary key,
      tenant_id text not null references tenants(id),
      first_name text not null,
      last_name text not null,
      dob date,
      phone text,
      email text,
      created_at timestamptz default now()
    );

    create table if not exists providers (
      id text primary key,
      tenant_id text not null references tenants(id),
      full_name text not null,
      specialty text,
      created_at timestamptz default now()
    );

    create table if not exists locations (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      address text,
      created_at timestamptz default now()
    );

    create table if not exists appointment_types (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      duration_minutes int not null,
      color text,
      category text,
      created_at timestamptz default now()
    );

    create table if not exists appointments (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      provider_id text not null references providers(id),
      location_id text not null references locations(id),
      appointment_type_id text not null references appointment_types(id),
      scheduled_start timestamptz not null,
      scheduled_end timestamptz not null,
      status text not null default 'scheduled',
      created_at timestamptz default now()
    );
    `,
  },
  {
    name: "002_practice_enhancements",
    sql: `
    alter table patients add column if not exists address text;
    alter table patients add column if not exists city text;
    alter table patients add column if not exists state text;
    alter table patients add column if not exists zip text;
    alter table patients add column if not exists insurance text;
    alter table patients add column if not exists allergies text;
    alter table patients add column if not exists medications text;

    create table if not exists provider_availability (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_id text not null references providers(id),
      day_of_week int not null check (day_of_week between 0 and 6),
      start_time time not null,
      end_time time not null,
      created_at timestamptz default now()
    );

    create table if not exists appointment_status_history (
      id text primary key,
      tenant_id text not null references tenants(id),
      appointment_id text not null references appointments(id),
      status text not null,
      changed_by text,
      changed_at timestamptz default now()
    );
    `,
  },
  {
    name: "003_clinical_billing_tasks",
    sql: `
    create table if not exists encounters (
      id text primary key,
      tenant_id text not null references tenants(id),
      appointment_id text references appointments(id),
      patient_id text not null references patients(id),
      provider_id text not null references providers(id),
      status text not null default 'draft',
      chief_complaint text,
      hpi text,
      ros text,
      exam text,
      assessment_plan text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists vitals (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text not null references encounters(id),
      height_cm numeric,
      weight_kg numeric,
      bp_systolic int,
      bp_diastolic int,
      pulse int,
      temp_c numeric,
      created_at timestamptz default now()
    );

    create table if not exists documents (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      title text not null,
      type text,
      url text,
      created_at timestamptz default now()
    );

    create table if not exists photos (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      body_location text,
      url text,
      created_at timestamptz default now()
    );

    create table if not exists charges (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      cpt_code text,
      icd_codes text[],
      amount_cents int,
      status text not null default 'pending',
      created_at timestamptz default now()
    );

    create table if not exists invoices (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      total_cents int not null,
      status text not null default 'open',
      created_at timestamptz default now()
    );

    create table if not exists payments (
      id text primary key,
      tenant_id text not null references tenants(id),
      invoice_id text not null references invoices(id),
      amount_cents int not null,
      method text,
      created_at timestamptz default now()
    );

    create table if not exists tasks (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text references patients(id),
      encounter_id text references encounters(id),
      title text not null,
      status text not null default 'open',
      due_at timestamptz,
      assigned_to text,
      created_at timestamptz default now()
    );

    create table if not exists messages (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text references patients(id),
      subject text,
      body text,
      sender text,
      created_at timestamptz default now()
    );

    create table if not exists audit_log (
      id text primary key,
      tenant_id text not null references tenants(id),
      actor_id text,
      action text not null,
      entity text,
      entity_id text,
      created_at timestamptz default now()
    );
    `,
  },
  {
    name: "004_orders",
    sql: `
    create table if not exists orders (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      patient_id text not null references patients(id),
      provider_id text not null references providers(id),
      type text not null,
      status text not null default 'draft',
      details text,
      created_at timestamptz default now()
    );
    `,
  },
  {
    name: "005_storage_security",
    sql: `
    alter table documents add column if not exists storage text default 'local';
    alter table documents add column if not exists object_key text;
    alter table photos add column if not exists storage text default 'local';
    alter table photos add column if not exists object_key text;
    `,
  },
  {
    name: "006_patient_demographics_extended",
    sql: `
    alter table patients add column if not exists sex text;
    alter table patients add column if not exists ssn text;
    alter table patients add column if not exists emergency_contact_name text;
    alter table patients add column if not exists emergency_contact_relationship text;
    alter table patients add column if not exists emergency_contact_phone text;
    alter table patients add column if not exists pharmacy_name text;
    alter table patients add column if not exists pharmacy_phone text;
    alter table patients add column if not exists pharmacy_address text;
    alter table patients add column if not exists updated_at timestamptz default now();
    `,
  },
  {
    name: "007_billing_codes",
    sql: `
    create table if not exists cpt_codes (
      id text primary key,
      code text not null unique,
      description text not null,
      category text,
      default_fee_cents int,
      is_common boolean default false,
      created_at timestamptz default now()
    );

    create table if not exists icd10_codes (
      id text primary key,
      code text not null unique,
      description text not null,
      category text,
      is_common boolean default false,
      created_at timestamptz default now()
    );

    create table if not exists fee_schedules (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      is_default boolean default false,
      created_at timestamptz default now()
    );

    create table if not exists fee_schedule_items (
      id text primary key,
      fee_schedule_id text not null references fee_schedules(id),
      cpt_code_id text not null references cpt_codes(id),
      fee_cents int not null,
      created_at timestamptz default now()
    );

    create index idx_cpt_codes_code on cpt_codes(code);
    create index idx_icd10_codes_code on icd10_codes(code);
    `,
  },
  {
    name: "008_encounter_diagnoses_charges_enhanced",
    sql: `
    create table if not exists encounter_diagnoses (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text not null references encounters(id),
      icd10_code text not null,
      description text not null,
      is_primary boolean default false,
      created_at timestamptz default now()
    );

    alter table charges add column if not exists description text;
    alter table charges add column if not exists quantity int default 1;
    alter table charges add column if not exists fee_cents int;
    alter table charges add column if not exists linked_diagnosis_ids text[];

    create index idx_encounter_diagnoses_encounter on encounter_diagnoses(encounter_id);
    create index idx_charges_encounter on charges(encounter_id);
    `,
  },
  {
    name: "009_claims_management",
    sql: `
    create table if not exists claims (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      patient_id text not null references patients(id),
      claim_number text unique,
      total_cents int not null,
      status text not null default 'draft',
      payer text,
      payer_id text,
      submitted_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists claim_payments (
      id text primary key,
      tenant_id text not null references tenants(id),
      claim_id text not null references claims(id),
      amount_cents int not null,
      payment_date date not null,
      payment_method text,
      payer text,
      check_number text,
      notes text,
      created_at timestamptz default now()
    );

    create table if not exists claim_status_history (
      id text primary key,
      tenant_id text not null references tenants(id),
      claim_id text not null references claims(id),
      status text not null,
      notes text,
      changed_by text,
      changed_at timestamptz default now()
    );

    -- Add insurance fields to patients if not exists
    alter table patients add column if not exists insurance_plan_name text;
    alter table patients add column if not exists insurance_member_id text;
    alter table patients add column if not exists insurance_group_number text;
    alter table patients add column if not exists insurance_payer_id text;

    -- Add provider fields if not exists
    alter table providers add column if not exists npi text;
    alter table providers add column if not exists tax_id text;

    -- Add practice info to tenants
    alter table tenants add column if not exists practice_name text;
    alter table tenants add column if not exists practice_address text;
    alter table tenants add column if not exists practice_city text;
    alter table tenants add column if not exists practice_state text;
    alter table tenants add column if not exists practice_zip text;
    alter table tenants add column if not exists practice_phone text;
    alter table tenants add column if not exists practice_npi text;
    alter table tenants add column if not exists practice_tax_id text;

    create index idx_claims_patient on claims(patient_id);
    create index idx_claims_encounter on claims(encounter_id);
    create index idx_claims_status on claims(status);
    create index idx_claim_payments_claim on claim_payments(claim_id);
    `,
  },
  {
    name: "010_prior_authorizations",
    sql: `
    -- Enable UUID extension if not already enabled
    create extension if not exists "uuid-ossp";
    create extension if not exists "pgcrypto";

    create table if not exists prescriptions (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      provider_id text references users(id),
      medication_name text not null,
      created_at timestamptz default now()
    );

    create table if not exists prior_authorizations (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      prescription_id text references prescriptions(id),
      provider_id text references users(id),
      auth_number text not null unique,
      medication_name text not null,
      diagnosis_code text not null,
      insurance_name text not null,
      provider_npi text not null,
      clinical_justification text not null,
      status text not null default 'pending',
      urgency text not null default 'routine',
      insurance_auth_number text,
      denial_reason text,
      notes text,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      submitted_at timestamptz,
      approved_at timestamptz,
      denied_at timestamptz,
      expires_at timestamptz,
      created_by text references users(id),
      updated_by text references users(id)
    );

    create index idx_prior_auth_tenant on prior_authorizations(tenant_id);
    create index idx_prior_auth_patient on prior_authorizations(patient_id);
    create index idx_prior_auth_provider on prior_authorizations(provider_id);
    create index idx_prior_auth_status on prior_authorizations(status);
    `,
  },
  {
    name: "011_time_blocks_and_waitlist",
    sql: `
    create table if not exists time_blocks (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_id text references users(id),
      location_id text references locations(id),
      title text not null,
      block_type text not null default 'blocked',
      description text,
      start_time timestamptz not null,
      end_time timestamptz not null,
      is_recurring boolean default false,
      recurrence_pattern text,
      recurrence_end_date date,
      status text default 'active',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    create table if not exists waitlist (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      provider_id text references users(id),
      appointment_type_id text references appointment_types(id),
      location_id text references locations(id),
      reason text not null,
      notes text,
      preferred_start_date date,
      preferred_end_date date,
      preferred_time_of_day text,
      preferred_days_of_week text[],
      priority text default 'normal',
      status text default 'active',
      patient_notified_at timestamptz,
      notification_method text,
      scheduled_appointment_id text references appointments(id),
      resolved_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    create index idx_time_blocks_tenant on time_blocks(tenant_id);
    create index idx_time_blocks_provider on time_blocks(provider_id);
    create index idx_time_blocks_start_time on time_blocks(start_time);
    create index idx_time_blocks_status on time_blocks(status);

    create index idx_waitlist_tenant on waitlist(tenant_id);
    create index idx_waitlist_patient on waitlist(patient_id);
    create index idx_waitlist_provider on waitlist(provider_id);
    create index idx_waitlist_status on waitlist(status);
    create index idx_waitlist_priority on waitlist(priority);
    create index idx_waitlist_created_at on waitlist(created_at desc);
    `,
  },
  {
    name: "012_patient_handouts",
    sql: `
    create table if not exists patient_handouts (
      id text primary key,
      tenant_id text not null references tenants(id),
      title text not null,
      category text not null,
      condition text not null,
      content text not null,
      is_active boolean default true,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    create index idx_handouts_tenant on patient_handouts(tenant_id);
    create index idx_handouts_category on patient_handouts(category);
    create index idx_handouts_condition on patient_handouts(condition);
    create index idx_handouts_active on patient_handouts(is_active);
    `,
  },
  {
    name: "013_ai_features",
    sql: `
    -- AI Image Analysis Results
    create table if not exists photo_ai_analysis (
      id text primary key,
      tenant_id text not null references tenants(id),
      photo_id text not null references photos(id),
      analysis_type text not null default 'skin_lesion',
      analysis_provider text not null default 'openai',
      confidence_score numeric,
      primary_finding text,
      differential_diagnoses jsonb,
      risk_level text,
      recommendations text,
      raw_analysis jsonb,
      analyzed_at timestamptz default now(),
      analyzed_by text references users(id)
    );

    -- Dermatology Note Templates (Master Visit templates)
    create table if not exists note_template_library (
      id text primary key,
      tenant_id text references tenants(id),
      name text not null,
      category text not null,
      condition text,
      chief_complaint_template text,
      hpi_template text,
      ros_template text,
      exam_template text,
      assessment_plan_template text,
      is_master_visit boolean default false,
      usage_count int default 0,
      is_active boolean default true,
      is_global boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    -- AI Note Suggestions (adaptive learning)
    create table if not exists ai_note_suggestions (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      provider_id text references users(id),
      suggestion_type text not null,
      section text not null,
      suggested_text text not null,
      confidence_score numeric,
      accepted boolean,
      feedback text,
      created_at timestamptz default now()
    );

    -- Voice Transcriptions
    create table if not exists voice_transcriptions (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      user_id text not null references users(id),
      audio_url text,
      transcription_text text,
      transcription_provider text default 'whisper',
      confidence_score numeric,
      duration_seconds int,
      status text default 'processing',
      created_at timestamptz default now()
    );

    -- Clinical Decision Support Alerts
    create table if not exists cds_alerts (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      alert_type text not null,
      severity text not null default 'info',
      title text not null,
      description text not null,
      action_required boolean default false,
      dismissed boolean default false,
      dismissed_by text references users(id),
      dismissed_at timestamptz,
      created_at timestamptz default now()
    );

    -- AI Chat History (for AI assistant)
    create table if not exists ai_chat_history (
      id text primary key,
      tenant_id text not null references tenants(id),
      user_id text not null references users(id),
      patient_id text references patients(id),
      encounter_id text references encounters(id),
      role text not null,
      message text not null,
      context jsonb,
      created_at timestamptz default now()
    );

    -- Add columns to existing tables for AI features
    alter table photos add column if not exists ai_analyzed boolean default false;
    alter table photos add column if not exists ai_risk_flagged boolean default false;
    alter table encounters add column if not exists ai_draft_generated boolean default false;
    alter table encounters add column if not exists voice_dictated boolean default false;

    -- Indexes for AI tables
    create index idx_photo_ai_analysis_tenant on photo_ai_analysis(tenant_id);
    create index idx_photo_ai_analysis_photo on photo_ai_analysis(photo_id);
    create index idx_note_template_library_tenant on note_template_library(tenant_id);
    create index idx_note_template_library_category on note_template_library(category);
    create index idx_ai_note_suggestions_encounter on ai_note_suggestions(encounter_id);
    create index idx_voice_transcriptions_encounter on voice_transcriptions(encounter_id);
    create index idx_cds_alerts_patient on cds_alerts(patient_id);
    create index idx_cds_alerts_dismissed on cds_alerts(dismissed);
    create index idx_ai_chat_history_user on ai_chat_history(user_id);
    `,
  },
  {
    name: "014_note_templates",
    sql: `
    -- Note Templates with Master Visit support
    create table if not exists note_templates (
      id text primary key,
      tenant_id text references tenants(id),
      provider_id text references users(id),
      name text not null,
      category text not null,
      description text,
      is_shared boolean default false,
      template_content jsonb not null,
      usage_count int default 0,
      is_master_visit boolean default false,
      condition text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Provider template favorites
    create table if not exists provider_template_favorites (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_id text not null references users(id),
      template_id text not null references note_templates(id) on delete cascade,
      created_at timestamptz default now(),
      unique(provider_id, template_id)
    );

    -- Indexes
    create index idx_note_templates_tenant on note_templates(tenant_id);
    create index idx_note_templates_provider on note_templates(provider_id);
    create index idx_note_templates_category on note_templates(category);
    create index idx_note_templates_shared on note_templates(is_shared);
    create index idx_note_templates_master_visit on note_templates(is_master_visit);
    create index idx_provider_template_favorites_provider on provider_template_favorites(provider_id);
    create index idx_provider_template_favorites_template on provider_template_favorites(template_id);
    `,
  },
  {
    name: "015_seed_dermatology_templates",
    sql: `
    -- Seed dermatology Master Visit templates (global, shared templates)
    insert into note_templates (
      id, tenant_id, provider_id, name, category, description,
      is_shared, is_master_visit, condition, template_content, usage_count
    ) values
    -- Acne Visit
    (
      gen_random_uuid()::text, null, null,
      'Acne - Initial Visit', 'Initial Visit',
      'Comprehensive acne evaluation template',
      true, true, 'Acne Vulgaris',
      '{"chiefComplaint":"Acne","hpi":"Patient presents with acne. Duration: [___]. Severity: [mild/moderate/severe]. Previous treatments: [___]. Current skincare routine: [___]. Impact on quality of life: [___].","ros":"Constitutional: No fever, weight loss\\nSkin: Acne as described, no other rashes","exam":"Skin Exam:\\n- Face: [comedones/papules/pustules/nodules/cysts]\\n- Distribution: [forehead/cheeks/chin/back/chest]\\n- Severity: [mild/moderate/severe]\\n- Scarring: [none/minimal/moderate/severe]\\n- Skin type: [I/II/III/IV/V/VI]","assessmentPlan":"Assessment:\\n1. Acne vulgaris, [mild/moderate/severe]\\n\\nPlan:\\n1. Topical treatment: [benzoyl peroxide/retinoid/antibiotic]\\n2. Oral treatment if indicated: [antibiotic/isotretinoin/hormonal]\\n3. Skincare education\\n4. Follow-up in [4-6] weeks\\n5. Monitor for side effects\\n6. Pregnancy counseling if applicable"}'::jsonb,
      0
    ),
    -- Full Body Skin Exam
    (
      gen_random_uuid()::text, null, null,
      'Full Body Skin Exam - Mole Check', 'Initial Visit',
      'Complete skin cancer screening template',
      true, true, 'Skin Cancer Screening',
      '{"chiefComplaint":"Skin check / Mole evaluation","hpi":"Patient presents for full body skin exam. Personal history of skin cancer: [yes/no]. Family history: [___]. Sun exposure history: [___]. Tanning bed use: [yes/no]. Concerning lesions: [___].","ros":"Constitutional: No fever, weight loss, night sweats\\nSkin: Moles as noted on exam","exam":"Full Body Skin Exam:\\n- Total body surface examined\\n- Number of nevi: [few/moderate/numerous]\\n- Atypical nevi: [present/absent]\\n- Concerning lesions documented with photos\\n- Dermoscopy performed on: [___]\\n\\nSpecific Lesions:\\n[Location]: [description, size, ABCDE features]","assessmentPlan":"Assessment:\\n1. [Benign nevi vs atypical nevi vs concerning for melanoma]\\n\\nPlan:\\n1. Biopsy indicated: [yes/no]\\n2. Baseline photography for monitoring\\n3. Sun protection counseling\\n4. Self-examination education\\n5. Follow-up: [6-12 months / as needed]\\n6. Dermatoscopy findings: [___]"}'::jsonb,
      0
    ),
    -- Eczema/Atopic Dermatitis
    (
      gen_random_uuid()::text, null, null,
      'Eczema - Initial Visit', 'Initial Visit',
      'Atopic dermatitis evaluation template',
      true, true, 'Atopic Dermatitis',
      '{"chiefComplaint":"Eczema / Atopic dermatitis","hpi":"Patient presents with eczema. Age of onset: [___]. Location: [___]. Triggers: [___]. Severity: [mild/moderate/severe]. Previous treatments: [___]. Impact on sleep/QOL: [___]. Personal/family history of atopy: [___].","ros":"Constitutional: No fever\\nSkin: Eczema as described\\nAllergic/Immunologic: [asthma/allergic rhinitis/food allergies]","exam":"Skin Exam:\\n- Distribution: [flexural/extensor/face/hands/generalized]\\n- Morphology: [erythema/scale/lichenification/excoriation]\\n- Severity: EASI score [___] or mild/moderate/severe\\n- Secondary infection: [present/absent]\\n- Skin dryness: [mild/moderate/severe]","assessmentPlan":"Assessment:\\n1. Atopic dermatitis, [acute flare / chronic]\\n2. Severity: [mild/moderate/severe]\\n\\nPlan:\\n1. Emollient therapy: [___]\\n2. Topical corticosteroid: [___]\\n3. Topical calcineurin inhibitor if indicated\\n4. Trigger avoidance counseling\\n5. Bathing and skincare routine\\n6. Consider phototherapy/systemic therapy if severe\\n7. Follow-up in [2-4] weeks"}'::jsonb,
      0
    ),
    -- Psoriasis
    (
      gen_random_uuid()::text, null, null,
      'Psoriasis - Initial Visit', 'Initial Visit',
      'Psoriasis evaluation and management template',
      true, true, 'Psoriasis',
      '{"chiefComplaint":"Psoriasis","hpi":"Patient presents with psoriasis. Duration: [___]. Distribution: [___]. Previous treatments: [___]. Family history: [___]. Joint symptoms: [yes/no]. Impact on QOL: [___].","ros":"Constitutional: No fever, weight loss\\nMusculoskeletal: [joint pain/swelling - details if present]\\nSkin: Psoriasis as described","exam":"Skin Exam:\\n- Distribution: [scalp/elbows/knees/trunk/palms-soles/nails/generalized]\\n- Morphology: [plaques with silvery scale]\\n- BSA involved: [___%]\\n- PASI score: [___]\\n- Nail changes: [pitting/onycholysis/oil spots]\\n- Koebner phenomenon: [present/absent]","assessmentPlan":"Assessment:\\n1. Psoriasis vulgaris\\n2. Severity: [mild <3% BSA / moderate 3-10% / severe >10%]\\n3. Psoriatic arthritis: [suspected/not present]\\n\\nPlan:\\n1. Topical therapy: [corticosteroid/vitamin D analog]\\n2. Consider phototherapy if moderate-severe\\n3. Systemic therapy if indicated: [methotrexate/biologic]\\n4. Screen for metabolic syndrome\\n5. Rheumatology referral if arthritis suspected\\n6. Follow-up in [4-8] weeks"}'::jsonb,
      0
    ),
    -- Rash Evaluation
    (
      gen_random_uuid()::text, null, null,
      'Rash - Acute Evaluation', 'Initial Visit',
      'General rash evaluation template',
      true, true, 'Rash',
      '{"chiefComplaint":"Rash","hpi":"Patient presents with rash. Onset: [___]. Duration: [___]. Location: [___]. Associated symptoms: [itch/pain/burning]. Progression: [___]. New medications: [___]. Exposures: [___]. Recent illness: [___].","ros":"Constitutional: Fever [yes/no], malaise\\nSkin: Rash as described\\nOther systems as indicated by differential","exam":"Skin Exam:\\n- Distribution: [localized/generalized] [symmetric/asymmetric]\\n- Primary lesions: [macules/papules/vesicles/bullae/pustules/wheals]\\n- Secondary changes: [scale/crust/excoriation/lichenification]\\n- Mucosal involvement: [yes/no]\\n- Configuration: [linear/annular/grouped/dermatomal]","assessmentPlan":"Assessment:\\n1. [Differential diagnosis]\\n   - Most likely: [___]\\n   - Consider: [___]\\n\\nPlan:\\n1. Treatment: [topical/systemic as indicated]\\n2. Biopsy if diagnosis unclear\\n3. Labs if indicated: [CBC, CMP, specific tests]\\n4. Medication review\\n5. Allergen/irritant avoidance\\n6. Follow-up: [as needed / 1-2 weeks]"}'::jsonb,
      0
    ),
    -- Skin Cancer Follow-up
    (
      gen_random_uuid()::text, null, null,
      'Skin Cancer - Follow-up Visit', 'Follow-up Visit',
      'Post-treatment skin cancer surveillance',
      true, true, 'Skin Cancer History',
      '{"chiefComplaint":"Skin cancer follow-up","hpi":"Patient with history of [melanoma/BCC/SCC] status post [excision/Mohs/other] on [date]. Current concerns: [___]. New lesions: [yes/no]. Lymph node symptoms: [none].","ros":"Constitutional: No weight loss, fatigue\\nLymphadenopathy: None\\nSkin: See exam","exam":"Skin Exam:\\n- Surgical site: [well-healed/keloid/other]\\n- Full body skin exam performed\\n- New/changing lesions: [none / see details]\\n- Lymph node exam: [normal/abnormal]\\n- Dermoscopy: [___]","assessmentPlan":"Assessment:\\n1. Personal history of [skin cancer type]\\n2. Current status: [NED / new lesion identified]\\n\\nPlan:\\n1. Continue surveillance exams\\n2. Biopsy if new concerning lesions\\n3. Sun protection reinforcement\\n4. Self-skin exam education\\n5. Next follow-up: [3-6-12 months based on risk]\\n6. Consider imaging if melanoma with high risk"}'::jsonb,
      0
    ),
    -- Cosmetic Consultation
    (
      gen_random_uuid()::text, null, null,
      'Cosmetic Consultation - Botox/Fillers', 'Cosmetic Consultation',
      'Aesthetic treatment consultation template',
      true, true, 'Cosmetic',
      '{"chiefComplaint":"Cosmetic consultation","hpi":"Patient interested in [botox/fillers/laser/chemical peel/other]. Concerns: [wrinkles/volume loss/pigmentation/texture]. Previous cosmetic treatments: [___]. Current skincare: [___]. Medical history: [___]. Medications: [___].","ros":"No contraindications to planned procedures","exam":"Facial Exam:\\n- Skin type: [Fitzpatrick I-VI]\\n- Static vs dynamic rhytids\\n- Volume loss: [temples/cheeks/lips/under-eyes]\\n- Skin texture and tone\\n- Facial asymmetry: [___]\\n- Photos taken: [frontal/oblique/lateral]","assessmentPlan":"Assessment:\\n1. [Facial aging / volume loss / dynamic wrinkles]\\n2. Appropriate candidate for [treatment]\\n\\nPlan:\\n1. Treatment recommended: [___]\\n2. Expected results and timeline\\n3. Potential risks/side effects discussed\\n4. Cost estimate provided\\n5. Pre-procedure instructions\\n6. Informed consent obtained\\n7. Schedule treatment / Follow-up after treatment"}'::jsonb,
      0
    ),
    -- Biopsy Procedure
    (
      gen_random_uuid()::text, null, null,
      'Skin Biopsy - Procedure Note', 'Procedure Note',
      'Skin biopsy documentation template',
      true, true, 'Biopsy',
      '{"chiefComplaint":"Skin biopsy","hpi":"Patient undergoing skin biopsy for [diagnostic purposes/concerning lesion]. Lesion location: [___]. Clinical appearance: [___].","ros":"No bleeding disorder\\nNo anticoagulation issues","exam":"Pre-procedure:\\n- Site: [anatomic location]\\n- Lesion description: [size, color, morphology]\\n- Photo documented: [yes/no]\\n\\nProcedure:\\n- Consent obtained\\n- Time out performed\\n- Site marked\\n- Sterilized with [betadine/chlorhexidine]\\n- Anesthetized with [lidocaine 1% with epi]\\n- Biopsy type: [shave/punch/excisional]\\n- Specimen size: [___ mm]\\n- Hemostasis: [aluminum chloride/electrocautery/suture]\\n- Wound care: [___]\\n- Sutures if placed: [#, type]\\n\\nPost-procedure:\\n- Patient tolerated well\\n- No complications\\n- Specimen to pathology","assessmentPlan":"Assessment:\\n1. [Clinical diagnosis/concern]\\n\\nPlan:\\n1. Await pathology results\\n2. Wound care instructions provided\\n3. Suture removal in [7-14] days if applicable\\n4. Follow-up for results and further management\\n5. Patient education on signs of infection"}'::jsonb,
      0
    ),
    -- Wart Treatment
    (
      gen_random_uuid()::text, null, null,
      'Warts - Treatment Visit', 'Procedure Note',
      'Wart treatment documentation',
      true, true, 'Verruca',
      '{"chiefComplaint":"Warts","hpi":"Patient with [common/plantar/flat] warts. Location: [___]. Duration: [___]. Previous treatments: [___]. Number of lesions: [___].","ros":"Immunosuppression: [yes/no]\\nPain: [yes/no if plantar]","exam":"Skin Exam:\\n- Location: [hands/feet/face/other]\\n- Number: [single/multiple]\\n- Size: [___ mm]\\n- Type: [common/plantar/filiform/flat]","assessmentPlan":"Assessment:\\n1. Verruca vulgaris / [type]\\n\\nPlan:\\n1. Treatment today: [cryotherapy/curettage/cantharone]\\n2. Freeze time: [___ seconds] per lesion\\n3. Home treatment: [salicylic acid]\\n4. May blister - expected\\n5. Return in [2-4] weeks for reassessment\\n6. May need multiple treatments\\n7. Patient education provided"}'::jsonb,
      0
    ),
    -- Contact Dermatitis
    (
      gen_random_uuid()::text, null, null,
      'Contact Dermatitis - Initial Visit', 'Initial Visit',
      'Contact dermatitis evaluation template',
      true, true, 'Contact Dermatitis',
      '{"chiefComplaint":"Contact dermatitis / Allergic reaction","hpi":"Patient with rash. Onset: [___]. Location: [___]. Possible exposures: [new products/jewelry/plants/chemicals]. Occupation: [___]. Hobbies: [___]. Pattern suggests: [irritant vs allergic].","ros":"Respiratory: No difficulty breathing\\nSkin: Rash as described","exam":"Skin Exam:\\n- Distribution: [hands/face/specific pattern]\\n- Morphology: [erythema/vesicles/scale/lichenification]\\n- Well-demarcated: [yes/no]\\n- Pattern: [linear/geometric/location-specific]\\n- Severity: [mild/moderate/severe]","assessmentPlan":"Assessment:\\n1. Contact dermatitis, [allergic vs irritant]\\n2. Likely trigger: [___]\\n\\nPlan:\\n1. Avoid identified triggers\\n2. Topical corticosteroid: [___]\\n3. Oral antihistamine for itch\\n4. Oral steroid if severe/widespread\\n5. Patch testing if recurrent/unclear trigger\\n6. Barrier protection recommendations\\n7. Follow-up in [1-2] weeks or PRN"}'::jsonb,
      0
    );
    `,
  },
  {
    name: "016_lesion_tracking",
    sql: `
    -- Lesions table for tracking individual lesions over time
    create table if not exists lesions (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      lesion_code text not null,
      body_location text not null,
      body_location_detail text,
      lesion_type text,
      first_noted_date date,
      status text default 'active',
      description text,
      clinical_impression text,
      concern_level text default 'low',
      requires_monitoring boolean default false,
      biopsy_performed boolean default false,
      biopsy_date date,
      biopsy_result text,
      treatment_plan text,
      notes text,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    -- Lesion measurements over time
    create table if not exists lesion_measurements (
      id text primary key,
      tenant_id text not null references tenants(id),
      lesion_id text not null references lesions(id) on delete cascade,
      photo_id text references photos(id),
      measured_at timestamptz default now(),
      measured_by text references users(id),
      measurement_type text not null default 'manual',
      length_mm numeric,
      width_mm numeric,
      area_mm2 numeric,
      depth_mm numeric,
      abcde_score jsonb,
      seven_point_checklist jsonb,
      ugly_duckling_sign boolean,
      color_variation boolean,
      border_irregularity boolean,
      diameter_change boolean,
      elevation_change boolean,
      notes text
    );

    -- Lesion dermoscopy findings
    create table if not exists lesion_dermoscopy (
      id text primary key,
      tenant_id text not null references tenants(id),
      lesion_id text not null references lesions(id) on delete cascade,
      photo_id text references photos(id),
      examined_at timestamptz default now(),
      examined_by text references users(id),
      dermoscopy_structures jsonb,
      dermoscopy_patterns jsonb,
      vascular_patterns jsonb,
      pigment_network text,
      blue_white_veil boolean,
      regression_structures boolean,
      atypical_vessels boolean,
      dermoscopy_diagnosis text,
      dermoscopy_score numeric,
      recommendation text,
      notes text
    );

    -- Lesion progression tracking
    create table if not exists lesion_events (
      id text primary key,
      tenant_id text not null references tenants(id),
      lesion_id text not null references lesions(id) on delete cascade,
      event_type text not null,
      event_date timestamptz default now(),
      provider_id text references users(id),
      description text not null,
      photos jsonb,
      related_encounter_id text references encounters(id),
      related_procedure_id text,
      outcome text,
      follow_up_needed boolean default false,
      follow_up_date date
    );

    -- Enhanced photo annotations for dermatology
    alter table photos add column if not exists calibration_mm_per_pixel numeric;
    alter table photos add column if not exists dermoscopy_mode boolean default false;
    alter table photos add column if not exists polarized boolean;
    alter table photos add column if not exists immersion boolean;
    alter table photos add column if not exists magnification text;
    alter table photos add column if not exists lighting_conditions text;

    -- Indexes
    create index idx_lesions_tenant on lesions(tenant_id);
    create index idx_lesions_patient on lesions(patient_id);
    create index idx_lesions_status on lesions(status);
    create index idx_lesions_concern_level on lesions(concern_level);
    create index idx_lesions_code on lesions(lesion_code);

    create index idx_lesion_measurements_lesion on lesion_measurements(lesion_id);
    create index idx_lesion_measurements_photo on lesion_measurements(photo_id);
    create index idx_lesion_measurements_measured_at on lesion_measurements(measured_at);

    create index idx_lesion_dermoscopy_lesion on lesion_dermoscopy(lesion_id);
    create index idx_lesion_dermoscopy_photo on lesion_dermoscopy(photo_id);

    create index idx_lesion_events_lesion on lesion_events(lesion_id);
    create index idx_lesion_events_type on lesion_events(event_type);
    create index idx_lesion_events_date on lesion_events(event_date);
    `,
  },
  {
    name: "017_quality_measures_mips",
    sql: `
    -- Quality Measures (CQM/MIPS)
    create table if not exists quality_measures (
      id text primary key,
      measure_code text not null unique,
      measure_name text not null,
      category text not null,
      description text,
      numerator_criteria jsonb not null,
      denominator_criteria jsonb not null,
      exclusion_criteria jsonb,
      specialty text default 'dermatology',
      is_active boolean default true,
      reporting_year int,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Measure Performance tracking
    create table if not exists measure_performance (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_id text references users(id),
      measure_id text not null references quality_measures(id),
      reporting_period_start date not null,
      reporting_period_end date not null,
      numerator_count int default 0,
      denominator_count int default 0,
      exclusion_count int default 0,
      performance_rate numeric,
      meets_benchmark boolean default false,
      benchmark_rate numeric,
      patient_list jsonb,
      last_calculated_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- MIPS Submissions
    create table if not exists mips_submissions (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_id text references users(id),
      submission_year int not null,
      submission_quarter int check (submission_quarter between 1 and 4),
      submission_type text default 'quality',
      submission_date timestamptz,
      status text default 'draft',
      submission_data jsonb,
      confirmation_number text,
      score numeric,
      feedback text,
      submitted_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Patient Quality Measure Attribution
    create table if not exists patient_measure_events (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      provider_id text references users(id),
      measure_id text not null references quality_measures(id),
      encounter_id text references encounters(id),
      event_date date not null,
      event_type text not null,
      numerator_met boolean default false,
      denominator_met boolean default false,
      excluded boolean default false,
      exclusion_reason text,
      supporting_data jsonb,
      created_at timestamptz default now()
    );

    -- Gap Closure Opportunities
    create table if not exists quality_gaps (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      provider_id text references users(id),
      measure_id text not null references quality_measures(id),
      gap_type text not null,
      gap_description text not null,
      priority text default 'medium',
      due_date date,
      status text default 'open',
      intervention_notes text,
      closed_date timestamptz,
      closed_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Indexes
    create index idx_quality_measures_code on quality_measures(measure_code);
    create index idx_quality_measures_category on quality_measures(category);
    create index idx_quality_measures_active on quality_measures(is_active);

    create index idx_measure_performance_tenant on measure_performance(tenant_id);
    create index idx_measure_performance_provider on measure_performance(provider_id);
    create index idx_measure_performance_measure on measure_performance(measure_id);
    create index idx_measure_performance_period on measure_performance(reporting_period_start, reporting_period_end);

    create index idx_mips_submissions_tenant on mips_submissions(tenant_id);
    create index idx_mips_submissions_provider on mips_submissions(provider_id);
    create index idx_mips_submissions_year on mips_submissions(submission_year);
    create index idx_mips_submissions_status on mips_submissions(status);

    create index idx_patient_measure_events_tenant on patient_measure_events(tenant_id);
    create index idx_patient_measure_events_patient on patient_measure_events(patient_id);
    create index idx_patient_measure_events_measure on patient_measure_events(measure_id);
    create index idx_patient_measure_events_date on patient_measure_events(event_date);

    create index idx_quality_gaps_tenant on quality_gaps(tenant_id);
    create index idx_quality_gaps_patient on quality_gaps(patient_id);
    create index idx_quality_gaps_measure on quality_gaps(measure_id);
    create index idx_quality_gaps_status on quality_gaps(status);
    create index idx_quality_gaps_priority on quality_gaps(priority);

    -- Seed common dermatology quality measures
    insert into quality_measures (
      id, measure_code, measure_name, category, description,
      numerator_criteria, denominator_criteria, exclusion_criteria,
      specialty, is_active, reporting_year
    ) values
    (
      gen_random_uuid()::text,
      'DERM-001',
      'Melanoma Screening Rate',
      'Preventive Care',
      'Percentage of patients aged 18 and older with a complete skin examination documented in the past 12 months',
      '{"criteria": "Full body skin exam documented", "code_requirement": "Skin exam CPT codes or documentation in encounter"}',
      '{"criteria": "All patients aged 18+", "age_range": "18-999"}',
      '{"criteria": "Recent melanoma diagnosis, currently undergoing cancer treatment"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'DERM-002',
      'Acne Treatment Appropriateness',
      'Clinical Quality',
      'Percentage of patients with acne who received evidence-based treatment (topical retinoid, benzoyl peroxide, or appropriate antibiotic)',
      '{"criteria": "Prescription for topical retinoid, benzoyl peroxide, or appropriate antibiotic", "icd10_codes": ["L70.0", "L70.1", "L70.8", "L70.9"]}',
      '{"criteria": "Patients with acne diagnosis", "icd10_codes": ["L70.0", "L70.1", "L70.8", "L70.9"]}',
      '{"criteria": "Contraindication to standard acne therapy documented"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'DERM-003',
      'Psoriasis Management and Treatment',
      'Clinical Quality',
      'Percentage of patients with moderate to severe psoriasis who received systemic therapy or phototherapy',
      '{"criteria": "Prescription for systemic therapy or phototherapy documented", "icd10_codes": ["L40.0", "L40.1", "L40.8", "L40.9"]}',
      '{"criteria": "Patients with psoriasis diagnosis and BSA >10% or PASI >10", "icd10_codes": ["L40.0", "L40.1", "L40.8", "L40.9"]}',
      '{"criteria": "Contraindication to systemic therapy, patient preference documented"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'PREV-001',
      'Diabetic Foot Exam',
      'Preventive Care',
      'Percentage of patients with diabetes who had a foot examination during the reporting period',
      '{"criteria": "Foot exam documented", "icd10_codes": ["E10", "E11"], "exam_requirement": "Visual inspection and sensory exam"}',
      '{"criteria": "Patients with diabetes diagnosis", "icd10_codes": ["E10", "E11"]}',
      '{"criteria": "Bilateral foot amputation"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'DERM-004',
      'Skin Cancer Biopsy Appropriateness',
      'Clinical Quality',
      'Percentage of biopsied lesions that were clinically indicated based on dermoscopy or ABCDE criteria',
      '{"criteria": "Biopsy performed with documented indication (ABCDE criteria, dermoscopy findings, or clinical concern)", "cpt_codes": ["11102", "11104", "11106"]}',
      '{"criteria": "All skin biopsies performed", "cpt_codes": ["11102", "11104", "11106"]}',
      '{"criteria": "Patient requested biopsy for cosmetic concerns"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'DERM-005',
      'Atopic Dermatitis Quality of Life Assessment',
      'Patient Experience',
      'Percentage of patients with atopic dermatitis who had quality of life impact documented using validated tool',
      '{"criteria": "DLQI or EASI score documented", "icd10_codes": ["L20.0", "L20.8", "L20.9"]}',
      '{"criteria": "Patients with atopic dermatitis diagnosis", "icd10_codes": ["L20.0", "L20.8", "L20.9"]}',
      '{"criteria": "Initial visit only, established patient"}',
      'dermatology',
      true,
      2025
    ),
    (
      gen_random_uuid()::text,
      'PREV-002',
      'Sunscreen Education for High-Risk Patients',
      'Preventive Care',
      'Percentage of high-risk patients who received sun protection counseling',
      '{"criteria": "Sun protection counseling documented", "risk_factors": ["fair skin", "history of sunburns", "family history of skin cancer", "immunosuppression"]}',
      '{"criteria": "Patients with risk factors for skin cancer", "risk_factors": ["fair skin", "history of sunburns", "family history of skin cancer", "immunosuppression"]}',
      '{}',
      'dermatology',
      true,
      2025
    );
    `,
  },
  {
    name: "018_faxes_table",
    sql: `
    -- Fax management table for inbound/outbound faxes
    create table if not exists faxes (
      id text primary key,
      tenant_id text not null references tenants(id),
      direction text not null check (direction in ('inbound', 'outbound')),
      status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'received', 'failed')),
      from_number text,
      to_number text,
      subject text,
      pages int default 1,
      document_id text,
      file_url text,
      pdf_url text,
      error_message text,
      metadata jsonb default '{}',
      patient_id text references patients(id),
      encounter_id text references encounters(id),
      read boolean default false,
      notes text,
      assigned_to text references users(id),
      sent_by text references users(id),
      transmission_id text,
      received_at timestamptz,
      sent_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index idx_faxes_tenant on faxes(tenant_id);
    create index idx_faxes_direction on faxes(direction);
    create index idx_faxes_status on faxes(status);
    create index idx_faxes_created_at on faxes(created_at desc);
    create index idx_faxes_patient on faxes(patient_id);
    create index idx_faxes_document on faxes(document_id);
    `,
  },
  {
    name: "019_prior_auth_requests",
    sql: `
    -- Enhanced prior authorization requests with adapter support
    create table if not exists prior_auth_requests (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      prescription_id text references prescriptions(id),
      medication_name text,
      medication_strength text,
      medication_quantity int,
      sig text,
      payer text not null,
      member_id text not null,
      prescriber text references users(id),
      prescriber_npi text,
      prescriber_name text,
      status text not null default 'pending' check (status in ('pending', 'submitted', 'approved', 'denied', 'needs_info', 'error')),
      status_reason text,
      request_payload jsonb,
      response_payload jsonb,
      attachments jsonb default '[]',
      history jsonb default '[]',
      external_reference_id text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index idx_prior_auth_requests_tenant on prior_auth_requests(tenant_id);
    create index idx_prior_auth_requests_patient on prior_auth_requests(patient_id);
    create index idx_prior_auth_requests_prescription on prior_auth_requests(prescription_id);
    create index idx_prior_auth_requests_status on prior_auth_requests(status);
    create index idx_prior_auth_requests_payer on prior_auth_requests(payer);
    create index idx_prior_auth_requests_created_at on prior_auth_requests(created_at desc);
    `,
  },
  {
    name: "020_time_blocks_overlap_indexes",
    sql: `
    -- Enhanced indexes for time block overlap detection
    -- Composite index for provider + time range overlap queries
    create index if not exists idx_time_blocks_provider_time_range
      on time_blocks(provider_id, status, start_time, end_time)
      where status = 'active';

    -- Composite index for location + time range overlap queries
    create index if not exists idx_time_blocks_location_time_range
      on time_blocks(location_id, status, start_time, end_time)
      where location_id is not null and status = 'active';

    -- Index on end_time for efficient range queries
    create index if not exists idx_time_blocks_end_time on time_blocks(end_time);

    -- Add location_id index if not exists
    create index if not exists idx_time_blocks_location on time_blocks(location_id) where location_id is not null;
    `,
  },
  {
    name: "021_portal_checkin_sessions",
    sql: `
    -- Portal check-in sessions for pre-appointment intake
    create table if not exists portal_checkin_sessions (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      appointment_id text not null references appointments(id),
      status text not null default 'started' check (status in ('started', 'in_progress', 'completed', 'expired', 'cancelled')),
      demographics_confirmed boolean default false,
      insurance_verified boolean default false,
      forms_completed boolean default false,
      copay_collected boolean default false,
      copay_amount numeric,
      insurance_card_front_url text,
      insurance_card_back_url text,
      ip_address text,
      user_agent text,
      started_at timestamptz default now(),
      completed_at timestamptz,
      expires_at timestamptz default (now() + interval '24 hours'),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index idx_portal_checkin_tenant on portal_checkin_sessions(tenant_id);
    create index idx_portal_checkin_patient on portal_checkin_sessions(patient_id);
    create index idx_portal_checkin_appointment on portal_checkin_sessions(appointment_id);
    create index idx_portal_checkin_status on portal_checkin_sessions(status);

    -- Waitlist holds for auto-fill feature
    create table if not exists waitlist_holds (
      id text primary key,
      tenant_id text not null references tenants(id),
      waitlist_id text not null references waitlist(id),
      appointment_slot_start timestamptz not null,
      appointment_slot_end timestamptz not null,
      provider_id text references users(id),
      location_id text references locations(id),
      hold_until timestamptz not null,
      status text default 'active' check (status in ('active', 'accepted', 'expired', 'cancelled')),
      notification_sent_at timestamptz,
      notification_method text,
      created_at timestamptz default now()
    );

    create index idx_waitlist_holds_tenant on waitlist_holds(tenant_id);
    create index idx_waitlist_holds_waitlist on waitlist_holds(waitlist_id);
    create index idx_waitlist_holds_status on waitlist_holds(status);
    create index idx_waitlist_holds_hold_until on waitlist_holds(hold_until);
    `,
  },
  {
    name: "022_message_threads_and_task_updates",
    sql: `
    -- Message threads for internal messaging
    create table if not exists message_threads (
      id text primary key,
      tenant_id text not null references tenants(id),
      subject text,
      is_archived boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index idx_message_threads_tenant on message_threads(tenant_id);

    create table if not exists message_participants (
      id text primary key,
      tenant_id text not null references tenants(id),
      thread_id text not null references message_threads(id),
      user_id text not null references users(id),
      is_archived boolean default false,
      last_read_at timestamptz,
      created_at timestamptz default now()
    );

    create index idx_message_participants_thread on message_participants(thread_id);
    create index idx_message_participants_user on message_participants(user_id);

    create table if not exists thread_messages (
      id text primary key,
      tenant_id text not null references tenants(id),
      thread_id text not null references message_threads(id),
      sender_id text not null references users(id),
      body text not null,
      created_at timestamptz default now()
    );

    create index idx_thread_messages_thread on thread_messages(thread_id);
    create index idx_thread_messages_sender on thread_messages(sender_id);

    -- Add missing columns to tasks table
    alter table tasks add column if not exists description text;
    alter table tasks add column if not exists category text;
    alter table tasks add column if not exists priority text default 'normal';
    `,
  },
  {
    name: "023_tasks_due_date",
    sql: `
    alter table tasks add column if not exists due_date timestamptz;
    `,
  },
  {
    name: "024_rooms_and_location_enhancements",
    sql: `
    -- Add phone and is_active to locations (facilities)
    alter table locations add column if not exists phone text;
    alter table locations add column if not exists is_active boolean default true;

    -- Add is_active to providers
    alter table providers add column if not exists is_active boolean default true;

    -- Create rooms table
    create table if not exists rooms (
      id text primary key,
      tenant_id text not null references tenants(id),
      facility_id text not null references locations(id),
      name text not null,
      room_type text default 'exam',
      is_active boolean default true,
      created_at timestamptz default now()
    );

    create index idx_rooms_tenant on rooms(tenant_id);
    create index idx_rooms_facility on rooms(facility_id);
    create index idx_rooms_active on rooms(is_active);
    `,
  },
  {
    name: "025_photos_lesion_id",
    sql: `
    -- Add lesion_id to photos table for linking photos to lesions
    alter table photos add column if not exists lesion_id text references lesions(id);
    create index if not exists idx_photos_lesion on photos(lesion_id) where lesion_id is not null;
    `,
  },
  {
    name: "026_photos_extended_columns",
    sql: `
    -- Add additional columns to photos table for full feature support
    alter table photos add column if not exists photo_type text;
    alter table photos add column if not exists annotations jsonb;
    alter table photos add column if not exists comparison_group_id text;
    alter table photos add column if not exists sequence_number int;
    alter table photos add column if not exists category text;
    alter table photos add column if not exists body_region text;
    alter table photos add column if not exists description text;
    alter table photos add column if not exists filename text;
    alter table photos add column if not exists mime_type text;
    alter table photos add column if not exists file_size int;
    `,
  },
  {
    name: "027_documents_extended_columns",
    sql: `
    -- Add additional columns to documents table for full feature support
    alter table documents add column if not exists category text;
    alter table documents add column if not exists subcategory text;
    alter table documents add column if not exists description text;
    alter table documents add column if not exists file_size int;
    alter table documents add column if not exists mime_type text;
    alter table documents add column if not exists thumbnail_url text;
    alter table documents add column if not exists uploaded_by text references users(id);
    alter table documents add column if not exists is_signed boolean default false;
    alter table documents add column if not exists signed_at timestamptz;
    alter table documents add column if not exists signed_by text references users(id);
    alter table documents add column if not exists ocr_text text;

    -- Create document access log table
    create table if not exists document_access_log (
      id text primary key,
      document_id text not null references documents(id) on delete cascade,
      tenant_id text not null references tenants(id),
      user_id text not null references users(id),
      action text not null,
      ip_address text,
      user_agent text,
      created_at timestamptz default now()
    );

    -- Create document signatures table
    create table if not exists document_signatures (
      id text primary key,
      document_id text not null references documents(id) on delete cascade,
      tenant_id text not null references tenants(id),
      signer_id text not null references users(id),
      signer_name text not null,
      signature_data text not null,
      signature_type text not null,
      ip_address text,
      user_agent text,
      created_at timestamptz default now()
    );

    -- Create document versions table
    create table if not exists document_versions (
      id text primary key,
      document_id text not null references documents(id) on delete cascade,
      version_number int not null,
      file_url text not null,
      file_size int,
      mime_type text,
      uploaded_by text references users(id),
      uploaded_at timestamptz default now(),
      change_description text
    );
    `,
  },
  {
    name: "028_tasks_extended_columns",
    sql: `
    -- Add additional columns to tasks table for full feature support
    alter table tasks add column if not exists due_at timestamptz;
    alter table tasks add column if not exists completed_at timestamptz;
    alter table tasks add column if not exists completed_by text references users(id);

    -- Create task comments table
    create table if not exists task_comments (
      id text primary key,
      task_id text not null references tasks(id) on delete cascade,
      tenant_id text not null references tenants(id),
      user_id text not null references users(id),
      comment text not null,
      created_at timestamptz default now()
    );

    -- Create index for task comments lookup
    create index if not exists idx_task_comments_task_id on task_comments(task_id);
    `,
  },
  {
    name: "029_audit_log_enhancements",
    sql: `
    -- Enhanced Audit Log for HIPAA Compliance
    -- Add new columns to existing audit_log table or recreate if needed

    -- Drop and recreate audit_log with enhanced schema
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
    `,
  },
  {
    name: "030_ambient_scribe_tables",
    sql: `
    -- Ambient Scribe Tables
    -- Recording sessions for ambient AI note generation
    create table if not exists ambient_recordings (
      id text primary key,
      tenant_id text not null references tenants(id),
      encounter_id text references encounters(id),
      patient_id text not null references patients(id),
      provider_id text not null references users(id),
      status text not null default 'recording' check (status in ('recording', 'processing', 'completed', 'failed')),
      audio_url text,
      duration_seconds int,
      transcript text,
      started_at timestamptz default now(),
      ended_at timestamptz,
      processed_at timestamptz,
      error_message text,
      created_at timestamptz default now()
    );

    create index idx_ambient_recordings_tenant on ambient_recordings(tenant_id);
    create index idx_ambient_recordings_encounter on ambient_recordings(encounter_id);
    create index idx_ambient_recordings_patient on ambient_recordings(patient_id);
    create index idx_ambient_recordings_provider on ambient_recordings(provider_id);
    create index idx_ambient_recordings_status on ambient_recordings(status);

    -- Generated notes from ambient recordings
    create table if not exists ambient_generated_notes (
      id text primary key,
      tenant_id text not null references tenants(id),
      recording_id text not null references ambient_recordings(id) on delete cascade,
      encounter_id text references encounters(id),
      note_content jsonb not null,
      status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'edited')),
      confidence_score numeric,
      edit_count int default 0,
      approved_by text references users(id),
      approved_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index idx_ambient_notes_tenant on ambient_generated_notes(tenant_id);
    create index idx_ambient_notes_recording on ambient_generated_notes(recording_id);
    create index idx_ambient_notes_encounter on ambient_generated_notes(encounter_id);
    create index idx_ambient_notes_status on ambient_generated_notes(status);
    `,
  },
  {
    name: "031_ai_agent_configurations",
    sql: `
    -- AI Agent Configurations
    -- Allows offices to create multiple AI agent profiles for different visit types
    -- e.g., Medical Dermatology, Cosmetic Consult, Mohs Surgery, Pediatric Derm

    -- Main configurations table
    CREATE TABLE IF NOT EXISTS ai_agent_configurations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

      -- Configuration metadata
      name TEXT NOT NULL,
      description TEXT,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,

      -- Visit type association (optional)
      appointment_type_id TEXT REFERENCES appointment_types(id) ON DELETE SET NULL,
      specialty_focus TEXT, -- 'medical_derm', 'cosmetic', 'mohs', 'pediatric_derm', 'general'

      -- AI Model Configuration
      ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
      temperature DECIMAL(3,2) DEFAULT 0.30,
      max_tokens INTEGER DEFAULT 4000,

      -- Prompt Templates
      system_prompt TEXT NOT NULL,
      prompt_template TEXT NOT NULL,

      -- Note Structure Configuration (JSONB)
      note_sections JSONB NOT NULL DEFAULT '["chiefComplaint", "hpi", "ros", "physicalExam", "assessment", "plan"]'::jsonb,
      section_prompts JSONB DEFAULT '{}'::jsonb,

      -- Output Formatting
      output_format TEXT DEFAULT 'soap', -- soap, narrative, procedure_note
      verbosity_level TEXT DEFAULT 'standard', -- concise, standard, detailed
      include_codes BOOLEAN DEFAULT true,

      -- Terminology & Focus (JSONB)
      terminology_set JSONB DEFAULT '{}'::jsonb,
      focus_areas JSONB DEFAULT '[]'::jsonb,

      -- Code Suggestions (JSONB)
      default_cpt_codes JSONB DEFAULT '[]'::jsonb,
      default_icd10_codes JSONB DEFAULT '[]'::jsonb,

      -- Follow-up & Tasks
      default_follow_up_interval TEXT,
      task_templates JSONB DEFAULT '[]'::jsonb,

      -- Metadata
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

      -- Ensure unique names per tenant
      UNIQUE(tenant_id, name)
    );

    -- Indexes
    CREATE INDEX idx_agent_configs_tenant ON ai_agent_configurations(tenant_id);
    CREATE INDEX idx_agent_configs_appointment_type ON ai_agent_configurations(appointment_type_id);
    CREATE INDEX idx_agent_configs_active ON ai_agent_configurations(tenant_id, is_active);
    CREATE INDEX idx_agent_configs_specialty ON ai_agent_configurations(tenant_id, specialty_focus);

    -- Ensure only one default per tenant
    CREATE UNIQUE INDEX idx_agent_configs_one_default_per_tenant
      ON ai_agent_configurations(tenant_id)
      WHERE is_default = true;

    -- Add agent configuration reference to ambient_recordings
    ALTER TABLE ambient_recordings
    ADD COLUMN IF NOT EXISTS agent_config_id TEXT REFERENCES ai_agent_configurations(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_ambient_recordings_agent_config ON ambient_recordings(agent_config_id);

    -- Add agent configuration tracking to ambient_generated_notes
    ALTER TABLE ambient_generated_notes
    ADD COLUMN IF NOT EXISTS agent_config_id TEXT REFERENCES ai_agent_configurations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS agent_config_snapshot JSONB;

    CREATE INDEX IF NOT EXISTS idx_ambient_notes_agent_config ON ambient_generated_notes(agent_config_id);

    -- Agent configuration version history (for audit trail)
    CREATE TABLE IF NOT EXISTS ai_agent_config_versions (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL REFERENCES ai_agent_configurations(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,

      -- Snapshot of configuration at this version
      config_snapshot JSONB NOT NULL,

      -- Change metadata
      changed_by TEXT REFERENCES users(id),
      change_reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

      UNIQUE(config_id, version_number)
    );

    CREATE INDEX idx_agent_config_versions_config ON ai_agent_config_versions(config_id);

    -- Usage analytics tracking
    CREATE TABLE IF NOT EXISTS ai_agent_usage_analytics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      agent_config_id TEXT NOT NULL REFERENCES ai_agent_configurations(id) ON DELETE CASCADE,
      provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,

      -- Usage metrics
      notes_generated INTEGER DEFAULT 0,
      notes_approved INTEGER DEFAULT 0,
      notes_rejected INTEGER DEFAULT 0,
      avg_confidence_score DECIMAL(5,4),
      avg_edit_count DECIMAL(5,2),

      -- Time metrics
      avg_generation_time_ms INTEGER,
      avg_review_time_seconds INTEGER,

      -- Period (for aggregation)
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,

      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

      UNIQUE(tenant_id, agent_config_id, provider_id, period_start)
    );

    CREATE INDEX idx_agent_analytics_config ON ai_agent_usage_analytics(agent_config_id);
    CREATE INDEX idx_agent_analytics_period ON ai_agent_usage_analytics(period_start, period_end);
    CREATE INDEX idx_agent_analytics_tenant ON ai_agent_usage_analytics(tenant_id);

    -- Trigger to update updated_at
    CREATE OR REPLACE FUNCTION update_ai_agent_config_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_ai_agent_config_updated_at ON ai_agent_configurations;
    CREATE TRIGGER trigger_ai_agent_config_updated_at
      BEFORE UPDATE ON ai_agent_configurations
      FOR EACH ROW
      EXECUTE FUNCTION update_ai_agent_config_timestamp();

    DROP TRIGGER IF EXISTS trigger_ai_agent_analytics_updated_at ON ai_agent_usage_analytics;
    CREATE TRIGGER trigger_ai_agent_analytics_updated_at
      BEFORE UPDATE ON ai_agent_usage_analytics
      FOR EACH ROW
      EXECUTE FUNCTION update_ai_agent_config_timestamp();
    `,
  },
  {
    name: "032_ai_agent_config_templates",
    sql: `
    -- System-level AI Agent Configuration Templates
    -- These are master templates that can be copied to tenant configurations

    CREATE TABLE IF NOT EXISTS ai_agent_config_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      specialty_focus TEXT NOT NULL,

      -- AI Model Configuration
      ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
      temperature DECIMAL(3,2) DEFAULT 0.30,
      max_tokens INTEGER DEFAULT 4000,

      -- Prompt Templates
      system_prompt TEXT NOT NULL,
      prompt_template TEXT NOT NULL,

      -- Note Structure Configuration
      note_sections JSONB NOT NULL,
      section_prompts JSONB DEFAULT '{}'::jsonb,

      -- Output Formatting
      output_format TEXT DEFAULT 'soap',
      verbosity_level TEXT DEFAULT 'standard',
      include_codes BOOLEAN DEFAULT true,

      -- Specialty-specific terminology
      terminology_set JSONB DEFAULT '{}'::jsonb,
      focus_areas JSONB DEFAULT '[]'::jsonb,

      -- Default billing codes
      default_cpt_codes JSONB DEFAULT '[]'::jsonb,
      default_icd10_codes JSONB DEFAULT '[]'::jsonb,

      -- Follow-up defaults
      default_follow_up_interval TEXT,
      task_templates JSONB DEFAULT '[]'::jsonb,

      -- Metadata
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX idx_agent_templates_specialty ON ai_agent_config_templates(specialty_focus);
    CREATE INDEX idx_agent_templates_active ON ai_agent_config_templates(is_active);

    -- Insert default dermatology templates
    INSERT INTO ai_agent_config_templates (
      id, name, description, specialty_focus,
      system_prompt, prompt_template, note_sections, section_prompts,
      output_format, verbosity_level, terminology_set, focus_areas,
      default_cpt_codes, default_icd10_codes, default_follow_up_interval, task_templates
    ) VALUES
    -- Medical Dermatology Template
    (
      'tpl-medical-derm',
      'Medical Dermatology',
      'General medical dermatology visits including inflammatory conditions, infections, and chronic skin diseases',
      'medical_derm',
      'You are a medical dermatology documentation assistant. Generate thorough, clinically accurate notes for medical dermatology encounters. Focus on:
- Precise lesion descriptions using dermatologic terminology
- Relevant history including duration, triggers, treatments tried
- Detailed physical exam with morphology, distribution, and clinical features
- Evidence-based assessment and treatment plans
- Appropriate ICD-10 and CPT coding suggestions

Use standard dermatologic terminology and SOAP format. Be concise but comprehensive.',
      'Based on the following transcript from a medical dermatology visit, generate a complete clinical note.

TRANSCRIPT:
{{transcript}}

PATIENT CONTEXT:
- Name: {{patientName}}
- Age: {{patientAge}}
- Chief Complaint: {{chiefComplaint}}
- Relevant History: {{relevantHistory}}

Generate the note with the following sections: {{sections}}

For each section, provide clinically appropriate content based on the transcript. If information for a section is not available in the transcript, indicate "Not documented" rather than making assumptions.',
      '["chiefComplaint", "hpi", "ros", "physicalExam", "assessment", "plan"]'::jsonb,
      '{
        "chiefComplaint": "Extract the primary reason for visit in 1-2 sentences",
        "hpi": "Include onset, duration, location, quality, severity, timing, context, modifying factors, and associated symptoms",
        "ros": "Focus on constitutional symptoms and skin-related review",
        "physicalExam": "Detail morphology, color, size, distribution, configuration, and any dermoscopic findings",
        "assessment": "List diagnoses with ICD-10 codes, include differential if applicable",
        "plan": "Include medications, procedures, patient education, and follow-up with CPT codes"
      }'::jsonb,
      'soap',
      'standard',
      '{
        "morphology": ["macule", "patch", "papule", "plaque", "nodule", "tumor", "vesicle", "bulla", "pustule", "wheal", "cyst"],
        "color": ["erythematous", "violaceous", "hyperpigmented", "hypopigmented", "flesh-colored", "yellow", "brown", "black"],
        "distribution": ["localized", "generalized", "symmetric", "asymmetric", "acral", "truncal", "flexural", "extensor"],
        "configuration": ["linear", "annular", "grouped", "scattered", "dermatomal", "follicular"]
      }'::jsonb,
      '["inflammatory skin conditions", "infections", "chronic dermatoses", "drug reactions", "autoimmune conditions"]'::jsonb,
      '[{"code": "99213", "description": "Office visit, established, level 3"}, {"code": "99214", "description": "Office visit, established, level 4"}]'::jsonb,
      '[{"code": "L30.9", "description": "Dermatitis, unspecified"}, {"code": "L70.0", "description": "Acne vulgaris"}]'::jsonb,
      '4-6 weeks',
      '[{"task": "Prior authorization if biologic prescribed", "priority": "high", "daysFromVisit": 1}, {"task": "Lab follow-up for systemic medications", "priority": "medium", "daysFromVisit": 14}]'::jsonb
    ),
    -- Cosmetic Consultation Template
    (
      'tpl-cosmetic',
      'Cosmetic Consultation',
      'Aesthetic consultations including neurotoxins, fillers, laser treatments, and cosmetic procedures',
      'cosmetic',
      'You are a cosmetic dermatology documentation assistant. Generate professional notes for aesthetic consultations. Focus on:
- Patient aesthetic concerns and goals
- Skin type assessment (Fitzpatrick scale)
- Facial analysis and anatomy
- Treatment recommendations with expected outcomes
- Informed consent documentation
- Pre and post procedure instructions

Maintain professional, patient-friendly language while being clinically accurate.',
      'Based on the following transcript from a cosmetic consultation, generate a complete consultation note.

TRANSCRIPT:
{{transcript}}

PATIENT CONTEXT:
- Name: {{patientName}}
- Age: {{patientAge}}
- Primary Concern: {{chiefComplaint}}
- Previous Cosmetic History: {{relevantHistory}}

Generate the consultation note with these sections: {{sections}}

Focus on patient goals, anatomical assessment, and treatment planning.',
      '["chiefComplaint", "cosmeticHistory", "skinAnalysis", "treatmentDiscussion", "plan", "informedConsent"]'::jsonb,
      '{
        "chiefComplaint": "Patient aesthetic concerns and goals for today visit",
        "cosmeticHistory": "Previous cosmetic treatments, reactions, satisfaction with results",
        "skinAnalysis": "Fitzpatrick skin type, facial analysis, areas of concern, skin quality assessment",
        "treatmentDiscussion": "Options discussed, expected outcomes, risks, alternatives",
        "plan": "Recommended treatments, products, timeline",
        "informedConsent": "Risks discussed, questions answered, consent obtained"
      }'::jsonb,
      'narrative',
      'detailed',
      '{
        "facial_zones": ["forehead", "glabella", "periorbital", "malar", "nasolabial", "perioral", "jawline", "neck"],
        "assessment_terms": ["rhytids", "volume loss", "skin laxity", "textural irregularities", "dyschromia", "pore size"],
        "treatments": ["neurotoxin", "dermal filler", "laser resurfacing", "chemical peel", "microneedling", "IPL"]
      }'::jsonb,
      '["facial rejuvenation", "volume restoration", "wrinkle reduction", "skin texture", "pigmentation correction"]'::jsonb,
      '[{"code": "11102", "description": "Tangential biopsy"}, {"code": "64615", "description": "Chemodenervation, muscle"}]'::jsonb,
      '[]'::jsonb,
      '2-4 weeks',
      '[{"task": "Send before photos to patient", "priority": "low", "daysFromVisit": 1}, {"task": "Follow-up call for treatment satisfaction", "priority": "medium", "daysFromVisit": 14}]'::jsonb
    ),
    -- Mohs Surgery Template
    (
      'tpl-mohs',
      'Mohs Surgery',
      'Mohs micrographic surgery documentation including pre-op, intra-op, and reconstruction',
      'mohs',
      'You are a Mohs surgery documentation assistant. Generate comprehensive surgical documentation. Focus on:
- Pre-operative tumor assessment and staging
- Detailed surgical margins and layers
- Defect size and reconstruction planning
- Pathology correlation
- Post-operative care instructions

Use precise surgical terminology and measurements. Document all stages systematically.',
      'Based on the following transcript from a Mohs surgery case, generate a complete surgical note.

TRANSCRIPT:
{{transcript}}

PATIENT CONTEXT:
- Name: {{patientName}}
- Age: {{patientAge}}
- Diagnosis: {{chiefComplaint}}
- Tumor Location: {{relevantHistory}}

Generate the surgical note with these sections: {{sections}}

Include precise measurements and staging details.',
      '["preOperative", "tumorAssessment", "mohsStages", "defectDescription", "reconstruction", "postOperativePlan"]'::jsonb,
      '{
        "preOperative": "Indication, informed consent, anesthesia plan, pre-op photos",
        "tumorAssessment": "Clinical size, borders, depth estimate, prior treatments",
        "mohsStages": "Each stage: tissue processed, margins examined, clearance status",
        "defectDescription": "Final defect size (LxWxD), location, structures involved",
        "reconstruction": "Repair type, technique, sutures used, estimated cosmetic outcome",
        "postOperativePlan": "Wound care, activity restrictions, signs of complications, follow-up"
      }'::jsonb,
      'procedure_note',
      'detailed',
      '{
        "tumor_types": ["basal cell carcinoma", "squamous cell carcinoma", "melanoma in situ", "dermatofibrosarcoma protuberans"],
        "reconstruction": ["primary closure", "adjacent tissue transfer", "flap", "graft", "secondary intention"],
        "flap_types": ["advancement", "rotation", "transposition", "interpolation", "bilobe"]
      }'::jsonb,
      '["margin assessment", "tissue processing", "reconstruction options", "wound healing"]'::jsonb,
      '[{"code": "17311", "description": "Mohs, head/neck/hands/feet/genitalia, first stage"}, {"code": "17312", "description": "Mohs, each additional stage"}]'::jsonb,
      '[{"code": "C44.31", "description": "BCC skin of face"}, {"code": "C44.41", "description": "SCC skin of scalp/neck"}]'::jsonb,
      '1-2 weeks',
      '[{"task": "Pathology report review", "priority": "high", "daysFromVisit": 3}, {"task": "Wound check appointment", "priority": "high", "daysFromVisit": 7}, {"task": "Suture removal", "priority": "high", "daysFromVisit": 10}]'::jsonb
    ),
    -- Pediatric Dermatology Template
    (
      'tpl-pediatric',
      'Pediatric Dermatology',
      'Pediatric skin conditions with age-appropriate documentation and family counseling',
      'pediatric_derm',
      'You are a pediatric dermatology documentation assistant. Generate comprehensive notes for pediatric patients. Focus on:
- Age-appropriate history taking (from parent/guardian)
- Growth and developmental considerations
- Child-friendly examination documentation
- Family impact and quality of life
- Age-appropriate treatment options
- Parent/guardian education and counseling

Use clear language suitable for family communication while maintaining clinical accuracy.',
      'Based on the following transcript from a pediatric dermatology visit, generate a complete clinical note.

TRANSCRIPT:
{{transcript}}

PATIENT CONTEXT:
- Name: {{patientName}}
- Age: {{patientAge}}
- Chief Complaint: {{chiefComplaint}}
- Relevant History: {{relevantHistory}}
- Historian: Parent/Guardian

Generate the note with these sections: {{sections}}

Consider age-appropriate treatments and include family counseling points.',
      '["chiefComplaint", "hpi", "birthHistory", "developmentalHistory", "familyHistory", "physicalExam", "assessment", "plan", "familyCounseling"]'::jsonb,
      '{
        "chiefComplaint": "Primary concern as reported by parent/guardian",
        "hpi": "Include onset, triggers, impact on sleep/school/activities, treatments tried",
        "birthHistory": "Gestational age, delivery, NICU stay if relevant",
        "developmentalHistory": "Growth, milestones, relevant to skin condition",
        "familyHistory": "Atopy, skin conditions, autoimmune disease in family",
        "physicalExam": "Child-friendly exam, cooperation level, detailed skin findings",
        "assessment": "Age-appropriate differential and diagnosis",
        "plan": "Child-safe medications, dosing by weight, vehicle preferences",
        "familyCounseling": "Education provided, expectations set, when to return"
      }'::jsonb,
      'soap',
      'detailed',
      '{
        "pediatric_conditions": ["atopic dermatitis", "molluscum", "warts", "birthmarks", "hemangioma", "port wine stain", "tinea", "impetigo"],
        "age_groups": ["neonate", "infant", "toddler", "school-age", "adolescent"],
        "considerations": ["weight-based dosing", "vehicle preference", "taste", "application ease"]
      }'::jsonb,
      '["atopic dermatitis", "birthmarks", "vascular lesions", "pediatric infections", "genetic skin disorders"]'::jsonb,
      '[{"code": "99213", "description": "Office visit, established, level 3"}, {"code": "99214", "description": "Office visit, established, level 4"}]'::jsonb,
      '[{"code": "L20.9", "description": "Atopic dermatitis, unspecified"}, {"code": "B07.9", "description": "Viral wart, unspecified"}]'::jsonb,
      '4-8 weeks',
      '[{"task": "Call family for treatment response check", "priority": "medium", "daysFromVisit": 14}, {"task": "School/daycare letter if needed", "priority": "low", "daysFromVisit": 1}]'::jsonb
    )
    ON CONFLICT (name) DO NOTHING;

    -- Function to seed AI agent configurations for a tenant from templates
    CREATE OR REPLACE FUNCTION seed_ai_agent_configs_for_tenant(p_tenant_id TEXT, p_created_by TEXT DEFAULT NULL)
    RETURNS INTEGER AS $$
    DECLARE
      v_count INTEGER := 0;
      v_template RECORD;
      v_config_id TEXT;
      v_is_first BOOLEAN := true;
    BEGIN
      -- Loop through active templates and create tenant configs
      FOR v_template IN
        SELECT * FROM ai_agent_config_templates WHERE is_active = true ORDER BY name
      LOOP
        v_config_id := 'cfg-' || gen_random_uuid()::text;

        INSERT INTO ai_agent_configurations (
          id, tenant_id, name, description, specialty_focus,
          ai_model, temperature, max_tokens,
          system_prompt, prompt_template,
          note_sections, section_prompts,
          output_format, verbosity_level, include_codes,
          terminology_set, focus_areas,
          default_cpt_codes, default_icd10_codes,
          default_follow_up_interval, task_templates,
          is_default, is_active, created_by
        ) VALUES (
          v_config_id,
          p_tenant_id,
          v_template.name,
          v_template.description,
          v_template.specialty_focus,
          v_template.ai_model,
          v_template.temperature,
          v_template.max_tokens,
          v_template.system_prompt,
          v_template.prompt_template,
          v_template.note_sections,
          v_template.section_prompts,
          v_template.output_format,
          v_template.verbosity_level,
          v_template.include_codes,
          v_template.terminology_set,
          v_template.focus_areas,
          v_template.default_cpt_codes,
          v_template.default_icd10_codes,
          v_template.default_follow_up_interval,
          v_template.task_templates,
          v_is_first, -- First template becomes the default
          true,
          p_created_by
        ) ON CONFLICT (tenant_id, name) DO NOTHING;

        IF FOUND THEN
          v_count := v_count + 1;
          v_is_first := false;
        END IF;
      END LOOP;

      RETURN v_count;
    END;
    $$ LANGUAGE plpgsql;

    -- Seed configurations for existing demo tenant
    SELECT seed_ai_agent_configs_for_tenant('tenant-demo', 'u-admin');
    `,
  },
  {
    name: "033_referrals_registry_allergies",
    sql: `
    create table if not exists patient_allergies (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      allergen text not null,
      allergen_type text,
      reaction text,
      severity text,
      onset_date date,
      notes text,
      status text default 'active',
      verified_at timestamptz,
      verified_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_patient_allergies_patient on patient_allergies(patient_id);
    create index if not exists idx_patient_allergies_tenant on patient_allergies(tenant_id);
    create index if not exists idx_patient_allergies_status on patient_allergies(status);

    create table if not exists referrals (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      direction text not null,
      status text not null default 'new',
      priority text not null default 'routine',
      referring_provider text,
      referring_organization text,
      referred_to_provider text,
      referred_to_organization text,
      appointment_id text references appointments(id),
      reason text,
      notes text,
      created_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_referrals_patient on referrals(patient_id);
    create index if not exists idx_referrals_tenant on referrals(tenant_id);
    create index if not exists idx_referrals_status on referrals(status);

    create table if not exists registry_cohorts (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      description text,
      status text not null default 'active',
      criteria jsonb,
      created_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(tenant_id, name)
    );

    create table if not exists registry_members (
      id text primary key,
      tenant_id text not null references tenants(id),
      registry_id text not null references registry_cohorts(id) on delete cascade,
      patient_id text not null references patients(id),
      status text not null default 'active',
      added_by text references users(id),
      added_at timestamptz default now(),
      unique(tenant_id, registry_id, patient_id)
    );

    create index if not exists idx_registry_members_registry on registry_members(registry_id);
    create index if not exists idx_registry_members_patient on registry_members(patient_id);
    create index if not exists idx_registry_members_tenant on registry_members(tenant_id);
    `,
  },
  {
    name: "034_financial_enhancements",
    sql: `
    -- Financial Module Enhancements
    -- Gap analysis implementation based on ModMed EMA comparison

    -- Payer Payments (Insurance Company Payments)
    create table if not exists payer_payments (
      id text primary key,
      tenant_id text not null references tenants(id),
      payment_date date not null,
      payer_name text not null,
      payer_id text,
      check_eft_number text,
      total_amount_cents int not null,
      applied_amount_cents int not null default 0,
      unapplied_amount_cents int not null default 0,
      status text not null default 'pending' check (status in ('pending', 'partially_applied', 'fully_applied', 'reconciled')),
      notes text,
      batch_id text,
      created_by text not null references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_payer_payments_tenant on payer_payments(tenant_id);
    create index if not exists idx_payer_payments_date on payer_payments(payment_date);
    create index if not exists idx_payer_payments_status on payer_payments(status);
    create index if not exists idx_payer_payments_batch on payer_payments(batch_id);

    -- Payer Payment Line Items (tracks which claims this payment applies to)
    create table if not exists payer_payment_line_items (
      id text primary key,
      tenant_id text not null references tenants(id),
      payer_payment_id text not null references payer_payments(id) on delete cascade,
      claim_id text references claims(id),
      patient_id text not null references patients(id),
      service_date date,
      amount_cents int not null,
      adjustment_cents int default 0,
      notes text,
      created_at timestamptz default now()
    );

    create index if not exists idx_payer_payment_lines_payment on payer_payment_line_items(payer_payment_id);
    create index if not exists idx_payer_payment_lines_claim on payer_payment_line_items(claim_id);

    -- Enhanced Patient Payments Table (separate from claim_payments for more flexibility)
    create table if not exists patient_payments (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      payment_date date not null,
      amount_cents int not null,
      payment_method text not null check (payment_method in ('cash', 'credit', 'debit', 'check', 'ach', 'other')),
      card_last_four text,
      check_number text,
      reference_number text,
      receipt_number text,
      applied_to_claim_id text references claims(id),
      applied_to_invoice_id text,
      status text not null default 'posted' check (status in ('pending', 'posted', 'refunded', 'voided')),
      notes text,
      batch_id text,
      processed_by text not null references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_patient_payments_tenant on patient_payments(tenant_id);
    create index if not exists idx_patient_payments_patient on patient_payments(patient_id);
    create index if not exists idx_patient_payments_date on patient_payments(payment_date);
    create index if not exists idx_patient_payments_claim on patient_payments(applied_to_claim_id);
    create index if not exists idx_patient_payments_batch on patient_payments(batch_id);

    -- Patient Statements
    create table if not exists patient_statements (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      statement_number text unique not null,
      statement_date date not null,
      balance_cents int not null,
      status text not null default 'pending' check (status in ('pending', 'sent', 'paid', 'partial', 'overdue', 'waived')),
      last_sent_date date,
      sent_via text check (sent_via in ('email', 'mail', 'portal', 'both')),
      due_date date,
      notes text,
      generated_by text not null references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_patient_statements_tenant on patient_statements(tenant_id);
    create index if not exists idx_patient_statements_patient on patient_statements(patient_id);
    create index if not exists idx_patient_statements_date on patient_statements(statement_date);
    create index if not exists idx_patient_statements_status on patient_statements(status);

    -- Statement Line Items (what charges/claims are included)
    create table if not exists statement_line_items (
      id text primary key,
      tenant_id text not null references tenants(id),
      statement_id text not null references patient_statements(id) on delete cascade,
      claim_id text references claims(id),
      service_date date not null,
      description text not null,
      amount_cents int not null,
      insurance_paid_cents int default 0,
      patient_responsibility_cents int not null,
      created_at timestamptz default now()
    );

    create index if not exists idx_statement_lines_statement on statement_line_items(statement_id);
    create index if not exists idx_statement_lines_claim on statement_line_items(claim_id);

    -- Payment Batches (for bulk payment processing and reconciliation)
    create table if not exists payment_batches (
      id text primary key,
      tenant_id text not null references tenants(id),
      batch_number text unique not null,
      batch_date date not null,
      batch_type text not null check (batch_type in ('payer', 'patient', 'mixed', 'deposit', 'eft')),
      total_amount_cents int not null,
      item_count int not null default 0,
      status text not null default 'open' check (status in ('open', 'closed', 'posted', 'reconciled', 'voided')),
      deposit_date date,
      bank_account text,
      notes text,
      created_by text not null references users(id),
      closed_by text references users(id),
      closed_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_payment_batches_tenant on payment_batches(tenant_id);
    create index if not exists idx_payment_batches_date on payment_batches(batch_date);
    create index if not exists idx_payment_batches_status on payment_batches(status);
    create index if not exists idx_payment_batches_type on payment_batches(batch_type);

    -- Add batch_id foreign key constraints
    alter table payer_payments
      add constraint fk_payer_payments_batch
      foreign key (batch_id) references payment_batches(id);

    alter table patient_payments
      add constraint fk_patient_payments_batch
      foreign key (batch_id) references payment_batches(id);

    -- Bills table (enhance existing invoices concept or create new)
    -- This table represents patient bills/invoices with more detail
    create table if not exists bills (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      bill_number text unique not null,
      bill_date date not null,
      due_date date,
      total_charges_cents int not null,
      insurance_responsibility_cents int default 0,
      patient_responsibility_cents int not null,
      paid_amount_cents int default 0,
      adjustment_amount_cents int default 0,
      balance_cents int not null,
      status text not null default 'new' check (status in ('new', 'in_progress', 'submitted', 'pending_payment', 'paid', 'partial', 'overdue', 'written_off', 'cancelled')),
      service_date_start date,
      service_date_end date,
      primary_insurance_id text,
      secondary_insurance_id text,
      notes text,
      created_by text not null references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_bills_tenant on bills(tenant_id);
    create index if not exists idx_bills_patient on bills(patient_id);
    create index if not exists idx_bills_encounter on bills(encounter_id);
    create index if not exists idx_bills_status on bills(status);
    create index if not exists idx_bills_date on bills(bill_date);
    create index if not exists idx_bills_service_date on bills(service_date_start);

    -- Bill line items
    create table if not exists bill_line_items (
      id text primary key,
      tenant_id text not null references tenants(id),
      bill_id text not null references bills(id) on delete cascade,
      charge_id text references charges(id),
      service_date date not null,
      cpt_code text not null,
      description text not null,
      quantity int not null default 1,
      unit_price_cents int not null,
      total_cents int not null,
      icd_codes text[] default array[]::text[],
      created_at timestamptz default now()
    );

    create index if not exists idx_bill_lines_bill on bill_line_items(bill_id);
    create index if not exists idx_bill_lines_charge on bill_line_items(charge_id);

    -- Financial Metrics Cache (for dashboard performance)
    create table if not exists financial_metrics_cache (
      id text primary key,
      tenant_id text not null references tenants(id),
      metric_date date not null,
      new_bills_count int default 0,
      in_progress_bills_count int default 0,
      outstanding_amount_cents int default 0,
      payments_this_month_cents int default 0,
      collections_mtd_cents int default 0,
      ar_aging_current_cents int default 0,
      ar_aging_30_cents int default 0,
      ar_aging_60_cents int default 0,
      ar_aging_90_cents int default 0,
      ar_aging_90plus_cents int default 0,
      calculated_at timestamptz default now(),
      unique(tenant_id, metric_date)
    );

    create index if not exists idx_financial_metrics_tenant on financial_metrics_cache(tenant_id);
    create index if not exists idx_financial_metrics_date on financial_metrics_cache(metric_date);

    -- User column preferences (for customize columns feature)
    create table if not exists user_column_preferences (
      id text primary key,
      tenant_id text not null references tenants(id),
      user_id text not null references users(id),
      page_name text not null,
      tab_name text,
      visible_columns jsonb not null default '[]'::jsonb,
      column_order jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(user_id, page_name, tab_name)
    );

    create index if not exists idx_user_column_prefs_user on user_column_preferences(user_id);
    create index if not exists idx_user_column_prefs_page on user_column_preferences(page_name);
    `,
  },
  {
    name: "035_result_flags",
    sql: `
    -- Result Flags for Lab Orders and Radiology/Imaging
    -- Add result_flag field to track pathology and lab result interpretations

    -- Result flag enum type
    do $$ begin
      create type result_flag_type as enum (
        'benign',
        'inconclusive',
        'precancerous',
        'cancerous',
        'normal',
        'abnormal',
        'low',
        'high',
        'out_of_range',
        'panic_value',
        'none'
      );
    exception
      when duplicate_object then null;
    end $$;

    -- Add result_flag column to orders table (for imaging/radiology)
    alter table orders
      add column if not exists result_flag result_flag_type default 'none',
      add column if not exists result_flag_updated_at timestamp,
      add column if not exists result_flag_updated_by text references users(id);

    -- Create audit table for result flag changes
    create table if not exists result_flag_audit (
      id text primary key,
      tenant_id text not null references tenants(id),

      -- Reference to the order/result
      order_id text references orders(id),

      -- Flag change details
      old_flag result_flag_type,
      new_flag result_flag_type not null,

      -- Change metadata
      changed_by text not null references users(id),
      change_reason text,

      created_at timestamptz default now()
    );

    -- Indexes for performance
    create index if not exists idx_orders_result_flag on orders(result_flag) where result_flag != 'none';

    create index if not exists idx_result_flag_audit_order on result_flag_audit(order_id);
    create index if not exists idx_result_flag_audit_tenant on result_flag_audit(tenant_id);
    create index if not exists idx_result_flag_audit_created on result_flag_audit(created_at desc);

    -- Comments
    comment on column orders.result_flag is 'Clinical interpretation flag for imaging/radiology results';
    comment on table result_flag_audit is 'Audit trail for result flag changes';
    `,
  },
  {
    name: "036_orders_enhancements",
    sql: `
    -- Add priority field to orders table
    alter table orders add column if not exists priority text default 'normal';

    -- Add notes field to orders table if it doesn't exist
    alter table orders add column if not exists notes text;

    -- Add provider_name to make queries more efficient (denormalized)
    alter table orders add column if not exists provider_name text;

    -- Create index on type for faster filtering
    create index if not exists idx_orders_type on orders(tenant_id, type);

    -- Create index on status for faster filtering
    create index if not exists idx_orders_status on orders(tenant_id, status);

    -- Create index on priority for faster filtering
    create index if not exists idx_orders_priority on orders(tenant_id, priority);

    -- Create index on patient_id for grouping
    create index if not exists idx_orders_patient_id on orders(tenant_id, patient_id);

    -- Create index on provider_id for grouping
    create index if not exists idx_orders_provider_id on orders(tenant_id, provider_id);

    -- Create composite index for common queries
    create index if not exists idx_orders_status_priority on orders(tenant_id, status, priority);

    -- Update existing orders to have normal priority if null
    update orders set priority = 'normal' where priority is null;
    `,
  },
  {
    name: "037_patient_extended_fields",
    sql: `
    -- Add missing patient demographic fields
    alter table patients add column if not exists primary_care_physician text;
    alter table patients add column if not exists referral_source text;
    alter table patients add column if not exists insurance_id text;
    alter table patients add column if not exists insurance_group_number text;
    `,
  },
  {
    name: "038_add_patient_mrn",
    sql: `
    -- Add MRN (Medical Record Number) column
    alter table patients add column if not exists mrn text;

    -- Create index for fast MRN lookups
    create index if not exists idx_patients_mrn on patients(mrn) where mrn is not null;

    -- Add also missing fields from seed data
    alter table patients add column if not exists address text;
    alter table patients add column if not exists city text;
    alter table patients add column if not exists state text;
    alter table patients add column if not exists zip text;
    alter table patients add column if not exists insurance text;
    alter table patients add column if not exists allergies text;
    alter table patients add column if not exists medications text;
    `,
  },
  {
    name: "039_appointment_types_enhancements",
    sql: `
    -- Add color column if not exists (for backward compatibility)
    alter table appointment_types add column if not exists color text default '#3B82F6';

    -- Add category column if not exists (for backward compatibility)
    alter table appointment_types add column if not exists category text default 'general';

    -- Add description column to appointment_types
    alter table appointment_types add column if not exists description text;

    -- Add is_active column to allow soft-deletion of appointment types
    alter table appointment_types add column if not exists is_active boolean default true;

    -- Create index for category lookups
    create index if not exists idx_appointment_types_category on appointment_types(category);

    -- Create index for active appointment types
    create index if not exists idx_appointment_types_active on appointment_types(is_active);
    `,
  },
  {
    name: "040_body_map_markers",
    sql: `
    -- Body Map Markers for tracking procedures, treatments, and conditions on body diagrams
    create table if not exists body_map_markers (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      marker_type text not null check (marker_type in ('lesion', 'procedure', 'condition', 'cosmetic', 'wound')),
      sub_type text,
      body_region text not null,
      x_position numeric check (x_position >= 0 and x_position <= 100),
      y_position numeric check (y_position >= 0 and y_position <= 100),
      description text,
      clinical_notes text,
      status text default 'active' check (status in ('active', 'resolved', 'healed', 'removed')),
      severity text check (severity in ('mild', 'moderate', 'severe')),
      size_mm numeric,
      date_identified date,
      date_resolved date,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    -- Indexes for body_map_markers
    create index idx_body_map_markers_tenant on body_map_markers(tenant_id);
    create index idx_body_map_markers_patient on body_map_markers(patient_id);
    create index idx_body_map_markers_encounter on body_map_markers(encounter_id);
    create index idx_body_map_markers_type on body_map_markers(marker_type);
    create index idx_body_map_markers_status on body_map_markers(status);
    create index idx_body_map_markers_region on body_map_markers(body_region);
    `,
  },
  {
    name: "041_procedure_sites",
    sql: `
    -- Procedure Sites table for detailed procedure tracking
    create table if not exists procedure_sites (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      body_map_marker_id text references body_map_markers(id) on delete set null,
      procedure_type text not null check (procedure_type in (
        'biopsy_shave', 'biopsy_punch', 'excision', 'mohs',
        'cryotherapy', 'laser', 'injection', 'other'
      )),
      body_region text not null,
      x_position numeric,
      y_position numeric,
      procedure_date date not null,
      performed_by text references users(id),
      clinical_indication text,
      procedure_notes text,
      pathology_status text default 'pending' check (pathology_status in (
        'pending', 'benign', 'malignant', 'inconclusive', 'not_sent'
      )),
      pathology_result text,
      pathology_date date,
      sutures_count int,
      suture_type text,
      follow_up_needed boolean default false,
      follow_up_date date,
      follow_up_notes text,
      complications text,
      healing_status text check (healing_status in ('normal', 'delayed', 'infected', 'dehiscence')),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    -- Indexes for procedure_sites
    create index idx_procedure_sites_tenant on procedure_sites(tenant_id);
    create index idx_procedure_sites_patient on procedure_sites(patient_id);
    create index idx_procedure_sites_encounter on procedure_sites(encounter_id);
    create index idx_procedure_sites_marker on procedure_sites(body_map_marker_id);
    create index idx_procedure_sites_type on procedure_sites(procedure_type);
    create index idx_procedure_sites_pathology_status on procedure_sites(pathology_status);
    create index idx_procedure_sites_procedure_date on procedure_sites(procedure_date);
    create index idx_procedure_sites_follow_up on procedure_sites(follow_up_needed, follow_up_date);
    `,
  },
  {
    name: "041_chronic_conditions",
    sql: `
    -- Chronic Skin Conditions Tracking System
    -- Enables tracking of chronic dermatological conditions over time with assessments and body region mapping

    -- Main chronic conditions table
    create table if not exists patient_skin_conditions (
      id text primary key,
      tenant_id text not null,
      patient_id text not null references patients(id) on delete cascade,

      -- Condition details
      condition_type text not null, -- 'psoriasis', 'eczema', 'vitiligo', 'acne', 'rosacea', 'seborrheic_dermatitis'
      body_regions text[], -- array of affected regions (e.g., ['elbow-right', 'knee-left', 'scalp'])

      -- Severity and scoring
      severity text, -- 'mild', 'moderate', 'severe'
      pasi_score numeric(5,2), -- Psoriasis Area and Severity Index (0-72)
      bsa_percentage numeric(5,2), -- Body Surface Area affected (0-100)

      -- Timeline
      onset_date date, -- When condition first started
      diagnosis_date date, -- When officially diagnosed

      -- Treatment tracking
      current_treatment text, -- Current treatment plan/medications
      treatment_response text, -- 'excellent', 'good', 'partial', 'poor', 'none'

      -- Flare management
      flare_triggers text[], -- Array of known triggers (e.g., ['stress', 'weather', 'diet'])
      last_flare_date date, -- Most recent flare-up

      -- Status
      status text default 'active', -- 'active', 'controlled', 'remission'

      -- Clinical notes
      notes text,

      -- Audit fields
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Condition assessments table for tracking progression over time
    create table if not exists condition_assessments (
      id text primary key,
      tenant_id text not null,
      condition_id text not null references patient_skin_conditions(id) on delete cascade,
      patient_id text not null references patients(id) on delete cascade,
      encounter_id text references encounters(id) on delete set null,

      -- Assessment details
      assessment_date date not null,
      severity_score numeric(5,2), -- Overall severity score for this assessment

      -- Detailed body region tracking
      affected_areas jsonb, -- { "elbow-right": {"severity": "moderate", "bsa": 5}, "knee-left": {...} }

      -- PASI scoring components (for psoriasis)
      pasi_score numeric(5,2),
      pasi_head numeric(5,2),
      pasi_trunk numeric(5,2),
      pasi_upper_extremities numeric(5,2),
      pasi_lower_extremities numeric(5,2),

      -- Documentation
      photo_ids text[], -- Array of photo IDs linked to this assessment

      -- Treatment at time of assessment
      treatment_at_time text,
      treatment_adherence text, -- 'excellent', 'good', 'fair', 'poor'

      -- Provider observations
      provider_notes text,
      clinical_impression text, -- 'improving', 'stable', 'worsening', 'flaring'

      -- Next steps
      follow_up_recommended boolean default false,
      follow_up_weeks integer, -- Recommended follow-up in X weeks

      -- Audit fields
      assessed_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Indexes for performance
    create index if not exists idx_skin_conditions_patient on patient_skin_conditions(patient_id);
    create index if not exists idx_skin_conditions_tenant on patient_skin_conditions(tenant_id);
    create index if not exists idx_skin_conditions_condition_type on patient_skin_conditions(condition_type);
    create index if not exists idx_skin_conditions_status on patient_skin_conditions(status);

    create index if not exists idx_condition_assessments_condition on condition_assessments(condition_id);
    create index if not exists idx_condition_assessments_patient on condition_assessments(patient_id);
    create index if not exists idx_condition_assessments_encounter on condition_assessments(encounter_id);
    create index if not exists idx_condition_assessments_date on condition_assessments(assessment_date);
    create index if not exists idx_condition_assessments_tenant on condition_assessments(tenant_id);

    -- Update triggers
    create or replace function update_skin_condition_timestamp()
    returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;

    create trigger skin_condition_updated
      before update on patient_skin_conditions
      for each row
      execute function update_skin_condition_timestamp();

    create trigger condition_assessment_updated
      before update on condition_assessments
      for each row
      execute function update_skin_condition_timestamp();

    -- Comments for documentation
    comment on table patient_skin_conditions is 'Tracks chronic skin conditions for patients over time';
    comment on table condition_assessments is 'Individual assessments/check-ins for chronic conditions with detailed tracking';
    comment on column patient_skin_conditions.condition_type is 'Type of chronic condition: psoriasis, eczema, vitiligo, acne, rosacea, seborrheic_dermatitis';
    comment on column patient_skin_conditions.pasi_score is 'Psoriasis Area and Severity Index (PASI) score: 0-72 scale';
    comment on column patient_skin_conditions.bsa_percentage is 'Body Surface Area affected as percentage: 0-100';
    comment on column patient_skin_conditions.status is 'Current status: active, controlled, remission';
    comment on column condition_assessments.affected_areas is 'JSON object mapping body regions to severity and BSA data';
    comment on column condition_assessments.clinical_impression is 'Provider impression: improving, stable, worsening, flaring';
    `,
  },
  {
    name: "042_fee_schedule_enhancements",
    sql: `
    -- Add missing columns to fee_schedules and fee_schedule_items for better organization

    -- Add description column to fee_schedules if it doesn't exist
    alter table fee_schedules add column if not exists description text;

    -- Modify fee_schedule_items to remove FK to cpt_codes and add direct cpt_code field
    -- First, check if cpt_code_id column exists and migrate data if needed
    do $$
    begin
      -- Add new columns if they don't exist
      if not exists (select 1 from information_schema.columns
                     where table_name = 'fee_schedule_items' and column_name = 'cpt_code') then
        alter table fee_schedule_items add column cpt_code varchar(10);
        alter table fee_schedule_items add column cpt_description text;

        -- Migrate data from old structure if cpt_code_id exists
        if exists (select 1 from information_schema.columns
                   where table_name = 'fee_schedule_items' and column_name = 'cpt_code_id') then
          update fee_schedule_items fsi
          set cpt_code = c.code,
              cpt_description = c.description
          from cpt_codes c
          where fsi.cpt_code_id = c.id;

          -- Drop old foreign key constraint if it exists
          alter table fee_schedule_items drop constraint if exists fee_schedule_items_cpt_code_id_fkey;
          alter table fee_schedule_items drop column if exists cpt_code_id;
        end if;
      end if;

      -- Add category column for organizing procedures
      if not exists (select 1 from information_schema.columns
                     where table_name = 'fee_schedule_items' and column_name = 'category') then
        alter table fee_schedule_items add column category varchar(100);
      end if;

      -- Add updated_at column if it doesn't exist
      if not exists (select 1 from information_schema.columns
                     where table_name = 'fee_schedule_items' and column_name = 'updated_at') then
        alter table fee_schedule_items add column updated_at timestamptz default now();
      end if;
    end $$;

    -- Add unique constraint on (fee_schedule_id, cpt_code) if it doesn't exist
    alter table fee_schedule_items drop constraint if exists unique_schedule_cpt;
    create unique index if not exists unique_schedule_cpt on fee_schedule_items(fee_schedule_id, cpt_code);

    -- Add indexes for better performance
    create index if not exists idx_fee_schedule_items_category on fee_schedule_items(fee_schedule_id, category);
    create index if not exists idx_fee_schedule_items_cpt on fee_schedule_items(fee_schedule_id, cpt_code);

    -- Add comments for documentation
    comment on column fee_schedules.description is 'Optional description of the fee schedule purpose';
    comment on column fee_schedule_items.category is 'Procedure category for organization (e.g., Evaluation & Management, Biopsies, Excisions)';
    comment on column fee_schedule_items.cpt_code is 'CPT procedure code';
    comment on column fee_schedule_items.cpt_description is 'Description of the procedure';
    `,
  },
  {
    name: "067_disease_registries",
    sql: `
    -- Disease Registry System for Dermatology
    -- Comprehensive tracking for melanoma, skin cancer, psoriasis, atopic dermatitis, acne, Mohs surgery, and chronic conditions

    -- Enhanced registry_cohorts with disease-specific tracking
    ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS registry_type text;
    ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS auto_populate boolean DEFAULT false;
    ALTER TABLE registry_cohorts ADD COLUMN IF NOT EXISTS inclusion_criteria jsonb;

    -- Registry member enhancements for disease tracking
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS enrollment_date timestamptz DEFAULT now();
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS last_assessment_date timestamptz;
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS next_followup_date timestamptz;
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS disease_severity text;
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS treatment_status text;
    ALTER TABLE registry_members ADD COLUMN IF NOT EXISTS metadata jsonb;

    -- Melanoma Registry specific tracking
    CREATE TABLE IF NOT EXISTS melanoma_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      -- Initial diagnosis
      diagnosis_date date,
      initial_biopsy_date date,
      primary_site text,

      -- Staging and characteristics
      breslow_depth_mm numeric(5,2),
      clark_level text,
      ulceration boolean,
      mitotic_rate integer,
      ajcc_stage text,
      ajcc_t_stage text,
      ajcc_n_stage text,
      ajcc_m_stage text,

      -- Sentinel node biopsy
      sentinel_node_biopsy_performed boolean,
      sentinel_node_biopsy_date date,
      sentinel_node_status text,
      number_positive_nodes integer,
      number_examined_nodes integer,

      -- Genetics
      braf_mutation_status text,
      nras_mutation_status text,
      kit_mutation_status text,

      -- Treatment
      surgery_date date,
      surgery_type text,
      margins_clear boolean,
      adjuvant_therapy text,
      systemic_therapy_start_date date,

      -- Follow-up surveillance
      surveillance_schedule text,
      last_full_body_exam date,
      next_scheduled_exam date,

      -- Recurrence tracking
      recurrence_status text,
      recurrence_date date,
      recurrence_location text,

      -- Quality metrics
      initial_staging_documented boolean DEFAULT false,
      surveillance_adherent boolean,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_melanoma_registry_tenant ON melanoma_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_melanoma_registry_patient ON melanoma_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_melanoma_registry_next_exam ON melanoma_registry(next_scheduled_exam) WHERE recurrence_status = 'no_recurrence';

    -- Non-melanoma Skin Cancer Registry
    CREATE TABLE IF NOT EXISTS skin_cancer_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      diagnosis_date date,
      cancer_type text,
      location text,
      histologic_subtype text,

      size_mm numeric(5,1),
      depth_mm numeric(5,1),
      perineural_invasion boolean,
      poor_differentiation boolean,
      high_risk_location boolean,

      treatment_date date,
      treatment_modality text,
      mohs_surgery_id text,
      margins_clear boolean,

      recurrence_status text,
      recurrence_date date,
      time_to_recurrence_months integer,

      last_skin_check date,
      next_skin_check date,
      surveillance_frequency text,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id, diagnosis_date, location)
    );

    CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_tenant ON skin_cancer_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_patient ON skin_cancer_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_skin_cancer_registry_next_check ON skin_cancer_registry(next_skin_check);

    -- Psoriasis Registry
    CREATE TABLE IF NOT EXISTS psoriasis_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      diagnosis_date date,
      psoriasis_type text,
      body_surface_area_percent numeric(5,2),

      current_pasi_score numeric(4,1),
      current_bsa_percent numeric(5,2),
      current_pga_score integer,

      current_dlqi_score integer,
      current_itch_severity integer,

      psoriatic_arthritis boolean,
      psa_diagnosis_date date,

      current_treatment_type text,
      current_systemic_medication text,
      biologic_name text,
      biologic_start_date date,
      treatment_start_date date,

      previous_biologics jsonb,
      previous_systemics jsonb,

      last_lab_date date,
      next_lab_due date,
      tb_screening_date date,
      hepatitis_screening_date date,

      baseline_pasi_documented boolean,
      labs_up_to_date boolean,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_tenant ON psoriasis_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_patient ON psoriasis_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_psoriasis_registry_next_labs ON psoriasis_registry(next_lab_due);

    -- PASI Score History
    CREATE TABLE IF NOT EXISTS pasi_score_history (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      psoriasis_registry_id text REFERENCES psoriasis_registry(id),

      assessment_date date NOT NULL,
      pasi_score numeric(4,1),
      bsa_percent numeric(5,2),
      pga_score integer,
      dlqi_score integer,
      itch_severity integer,

      treatment_at_time text,
      assessed_by text REFERENCES users(id),
      notes text,

      created_at timestamptz DEFAULT now(),

      UNIQUE(tenant_id, patient_id, assessment_date)
    );

    CREATE INDEX IF NOT EXISTS idx_pasi_history_patient ON pasi_score_history(patient_id, assessment_date DESC);

    -- Atopic Dermatitis Registry
    CREATE TABLE IF NOT EXISTS atopic_dermatitis_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      diagnosis_date date,
      age_at_onset integer,
      atopy_history text,

      current_easi_score numeric(5,1),
      current_scorad_score numeric(5,1),
      current_iga_score integer,
      affected_body_areas text,

      current_itch_intensity integer,
      current_sleep_disturbance integer,
      current_dlqi_score integer,

      current_treatment_ladder text,
      current_topical_regimen text,
      current_systemic_medication text,
      biologic_name text,
      biologic_start_date date,

      flares_per_year integer,
      last_flare_date date,
      typical_trigger text,

      last_lab_date date,
      next_lab_due date,
      ige_level numeric,
      eosinophil_count integer,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ad_registry_tenant ON atopic_dermatitis_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_ad_registry_patient ON atopic_dermatitis_registry(patient_id);

    -- EASI/SCORAD History
    CREATE TABLE IF NOT EXISTS ad_score_history (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      ad_registry_id text REFERENCES atopic_dermatitis_registry(id),

      assessment_date date NOT NULL,
      easi_score numeric(5,1),
      scorad_score numeric(5,1),
      iga_score integer,
      itch_intensity integer,
      sleep_disturbance integer,

      treatment_at_time text,
      assessed_by text REFERENCES users(id),
      notes text,

      created_at timestamptz DEFAULT now(),

      UNIQUE(tenant_id, patient_id, assessment_date)
    );

    CREATE INDEX IF NOT EXISTS idx_ad_history_patient ON ad_score_history(patient_id, assessment_date DESC);

    -- Acne/Isotretinoin Registry (iPLEDGE tracking)
    CREATE TABLE IF NOT EXISTS acne_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      diagnosis_date date,
      acne_type text,
      severity text,

      on_isotretinoin boolean DEFAULT false,
      isotretinoin_start_date date,
      isotretinoin_end_date date,
      ipledge_enrolled boolean DEFAULT false,
      ipledge_id text,

      pregnancy_category text,
      two_forms_contraception boolean,

      last_pregnancy_test_date date,
      next_pregnancy_test_due date,
      last_ipledge_quiz_date date,
      next_ipledge_quiz_due date,

      last_lab_date date,
      next_lab_due date,
      baseline_lipids_done boolean,
      baseline_lft_done boolean,

      cumulative_dose_mg numeric(10,2),
      target_cumulative_dose_mg numeric(10,2),
      treatment_response text,

      monthly_monitoring_adherent boolean,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_acne_registry_tenant ON acne_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_acne_registry_patient ON acne_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_acne_registry_isotretinoin ON acne_registry(on_isotretinoin) WHERE on_isotretinoin = true;
    CREATE INDEX IF NOT EXISTS idx_acne_registry_next_preg_test ON acne_registry(next_pregnancy_test_due) WHERE on_isotretinoin = true;

    -- Mohs Surgery Registry
    CREATE TABLE IF NOT EXISTS mohs_surgery_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      surgery_date date NOT NULL,
      tumor_type text,
      tumor_location text,
      histologic_subtype text,

      clinical_size_mm numeric(5,1),
      high_risk_features boolean,
      recurrent_tumor boolean,

      number_of_stages integer,
      final_defect_size_mm numeric(5,1),

      reconstruction_type text,
      reconstruction_location text,
      performing_surgeon text REFERENCES users(id),

      margins_clear boolean DEFAULT true,
      perineural_invasion boolean,

      last_followup_date date,
      next_followup_date date,

      complications text,
      complication_date date,

      recurrence_status text DEFAULT 'no_recurrence',
      recurrence_date date,
      cosmetic_outcome text,

      stages_documented boolean,
      reconstruction_documented boolean,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id, surgery_date, tumor_location)
    );

    CREATE INDEX IF NOT EXISTS idx_mohs_registry_tenant ON mohs_surgery_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_mohs_registry_patient ON mohs_surgery_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_mohs_registry_surgery_date ON mohs_surgery_registry(surgery_date DESC);

    -- Chronic Systemic Therapy Registry
    CREATE TABLE IF NOT EXISTS chronic_therapy_registry (
      id text PRIMARY KEY,
      tenant_id text NOT NULL REFERENCES tenants(id),
      patient_id text NOT NULL REFERENCES patients(id),
      registry_member_id text REFERENCES registry_members(id),

      primary_diagnosis text,

      medication_name text,
      medication_class text,
      start_date date,
      current_dose text,
      dosing_frequency text,

      monitoring_protocol text,
      required_labs text,
      lab_frequency text,

      last_lab_date date,
      next_lab_due date,
      last_cbc_date date,
      last_lft_date date,
      last_creatinine_date date,

      last_tb_screening date,
      next_tb_screening_due date,
      last_hepatitis_screening date,
      hepatitis_b_status text,
      hepatitis_c_status text,

      last_pneumovax_date date,
      last_flu_shot_date date,
      last_shingrix_date date,

      adverse_events jsonb,
      last_safety_review_date date,

      labs_up_to_date boolean,
      screening_up_to_date boolean,

      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text REFERENCES users(id),

      UNIQUE(tenant_id, patient_id, medication_name, start_date)
    );

    CREATE INDEX IF NOT EXISTS idx_chronic_therapy_tenant ON chronic_therapy_registry(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_chronic_therapy_patient ON chronic_therapy_registry(patient_id);
    CREATE INDEX IF NOT EXISTS idx_chronic_therapy_next_labs ON chronic_therapy_registry(next_lab_due);
    CREATE INDEX IF NOT EXISTS idx_chronic_therapy_overdue ON chronic_therapy_registry(next_lab_due);

    -- Create default disease registries
    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Melanoma Registry',
      'Track melanoma patients with staging, sentinel node status, and surveillance schedules per MIPS 137',
      'active',
      'melanoma',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Skin Cancer Registry',
      'BCC/SCC patients with treatment modality and recurrence tracking',
      'active',
      'skin_cancer',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Psoriasis Registry',
      'PASI scores over time, treatment history, and biologic usage per MIPS 485',
      'active',
      'psoriasis',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Atopic Dermatitis Registry',
      'EASI/SCORAD scores, treatment ladder, and flare frequency tracking',
      'active',
      'atopic_dermatitis',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Acne/Isotretinoin Registry',
      'iPLEDGE tracking, pregnancy tests, and lab monitoring',
      'active',
      'acne',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Mohs Surgery Registry',
      'Tumor type, location, stages required, and reconstruction tracking',
      'active',
      'mohs_surgery',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    INSERT INTO registry_cohorts (id, tenant_id, name, description, status, registry_type, auto_populate, created_at, updated_at)
    SELECT
      gen_random_uuid()::text,
      id,
      'Chronic Systemic Therapy Registry',
      'Patients on long-term systemic therapy (methotrexate, biologics) with lab monitoring',
      'active',
      'chronic_therapy',
      true,
      now(),
      now()
    FROM tenants
    ON CONFLICT DO NOTHING;

    COMMENT ON TABLE melanoma_registry IS 'MIPS 137: Melanoma surveillance and continuity of care tracking';
    COMMENT ON TABLE psoriasis_registry IS 'MIPS 485: Psoriasis patient-reported itch severity tracking';
    COMMENT ON TABLE acne_registry IS 'iPLEDGE compliance tracking for isotretinoin patients';
    COMMENT ON TABLE chronic_therapy_registry IS 'Lab monitoring and safety tracking for systemic therapies';
    `,
  },
];

async function ensureMigrationsTable() {
  await pool.query(`
    create table if not exists migrations (
      name text primary key,
      applied_at timestamptz default now()
    );
  `);
}

async function run() {
  await ensureMigrationsTable();
  for (const m of migrations) {
    const existing = await pool.query("select 1 from migrations where name = $1", [m.name]);
    if (existing.rowCount) {
      // eslint-disable-next-line no-console
      console.log(`Skipping ${m.name}`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`Applying ${m.name}...`);
    await pool.query("begin");
    try {
      await pool.query(m.sql);
      await pool.query("insert into migrations(name) values ($1)", [m.name]);
      await pool.query("commit");
      // eslint-disable-next-line no-console
      console.log(`Applied ${m.name}`);
    } catch (err) {
      await pool.query("rollback");
      throw err;
    }
  }
}

// Export run function for programmatic use
export { run as runMigrations };

// Run if executed directly
if (require.main === module) {
  run()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("Migrations complete");
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Migration failed", err);
      process.exit(1);
    });
}
