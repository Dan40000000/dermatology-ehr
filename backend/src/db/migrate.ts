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
  {
    name: "068_fix_cpt_code_length",
    sql: `
    -- Increase cpt_code column size to accommodate custom procedure codes
    ALTER TABLE fee_schedule_items ALTER COLUMN cpt_code TYPE varchar(20);
    `,
  },
  {
    name: "069_clinical_protocols",
    sql: `
    -- Clinical Protocols System for Dermatology Practice
    -- Supports treatment algorithms, procedure protocols, and cosmetic guidelines

    create table if not exists protocols (
      id text primary key,
      tenant_id text not null references tenants(id),
      name text not null,
      category text not null check (category in ('medical', 'procedure', 'cosmetic', 'administrative')),
      type text not null,
      description text,
      indication text,
      contraindications text,
      version text default '1.0',
      status text not null default 'active' check (status in ('draft', 'active', 'archived')),
      created_by text references users(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_protocols_tenant on protocols(tenant_id);
    create index if not exists idx_protocols_category on protocols(category);
    create index if not exists idx_protocols_type on protocols(type);
    create index if not exists idx_protocols_status on protocols(status);

    create table if not exists protocol_steps (
      id text primary key,
      tenant_id text not null references tenants(id),
      protocol_id text not null references protocols(id) on delete cascade,
      step_number int not null,
      title text not null,
      description text,
      action_type text not null check (action_type in ('assessment', 'treatment', 'medication', 'procedure', 'lab_order', 'imaging', 'referral', 'patient_instruction', 'decision_point', 'observation')),
      medication_name text,
      medication_dosage text,
      medication_frequency text,
      medication_duration text,
      procedure_code text,
      procedure_instructions text,
      order_codes text[],
      decision_criteria text,
      next_step_id text references protocol_steps(id),
      conditional_next_steps jsonb,
      timing text,
      duration_days int,
      monitoring_required text,
      side_effects text,
      warnings text,
      created_at timestamptz default now()
    );

    create index if not exists idx_protocol_steps_protocol on protocol_steps(protocol_id, step_number);

    create table if not exists protocol_order_sets (
      id text primary key,
      tenant_id text not null references tenants(id),
      protocol_id text not null references protocols(id) on delete cascade,
      name text not null,
      description text,
      order_type text not null check (order_type in ('medication', 'lab', 'imaging', 'procedure', 'referral', 'dme')),
      order_details jsonb not null,
      auto_apply boolean default false,
      created_at timestamptz default now()
    );

    create index if not exists idx_protocol_order_sets_protocol on protocol_order_sets(protocol_id);

    create table if not exists protocol_handouts (
      id text primary key,
      tenant_id text not null references tenants(id),
      protocol_id text not null references protocols(id) on delete cascade,
      title text not null,
      content text not null,
      content_type text default 'markdown' check (content_type in ('markdown', 'html', 'pdf_url')),
      language text default 'en',
      auto_provide boolean default false,
      created_at timestamptz default now()
    );

    create index if not exists idx_protocol_handouts_protocol on protocol_handouts(protocol_id);

    create table if not exists protocol_applications (
      id text primary key,
      tenant_id text not null references tenants(id),
      protocol_id text not null references protocols(id),
      patient_id text not null references patients(id),
      encounter_id text references encounters(id),
      applied_by text not null references users(id),
      current_step_id text references protocol_steps(id),
      status text not null default 'active' check (status in ('active', 'completed', 'discontinued', 'on_hold')),
      discontinuation_reason text,
      notes text,
      started_at timestamptz default now(),
      completed_at timestamptz,
      created_at timestamptz default now()
    );

    create index if not exists idx_protocol_applications_patient on protocol_applications(patient_id);
    create index if not exists idx_protocol_applications_protocol on protocol_applications(protocol_id);
    create index if not exists idx_protocol_applications_encounter on protocol_applications(encounter_id);
    create index if not exists idx_protocol_applications_status on protocol_applications(status);

    create table if not exists protocol_step_completions (
      id text primary key,
      tenant_id text not null references tenants(id),
      application_id text not null references protocol_applications(id) on delete cascade,
      step_id text not null references protocol_steps(id),
      completed_by text not null references users(id),
      outcome text,
      outcome_notes text,
      actual_timing text,
      orders_generated text[],
      completed_at timestamptz default now()
    );

    create index if not exists idx_protocol_step_completions_application on protocol_step_completions(application_id);
    create index if not exists idx_protocol_step_completions_step on protocol_step_completions(step_id);

    create table if not exists protocol_outcomes (
      id text primary key,
      tenant_id text not null references tenants(id),
      application_id text not null references protocol_applications(id) on delete cascade,
      outcome_type text not null,
      outcome_value text not null,
      outcome_date date not null,
      documented_by text references users(id),
      notes text,
      created_at timestamptz default now()
    );

    create index if not exists idx_protocol_outcomes_application on protocol_outcomes(application_id);
    create index if not exists idx_protocol_outcomes_type on protocol_outcomes(outcome_type);
    `,
  },
  {
    name: "070_patient_portal_accounts",
    sql: `
    -- Patient portal accounts for patient authentication
    create table if not exists patient_portal_accounts (
      id text primary key,
      tenant_id text not null references tenants(id),
      patient_id text not null references patients(id),
      email text not null,
      password_hash text not null,
      is_active boolean default true,
      email_verified boolean default false,
      email_verification_token text,
      email_verification_sent_at timestamptz,
      password_reset_token text,
      password_reset_expires_at timestamptz,
      last_login_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create unique index if not exists idx_portal_accounts_email on patient_portal_accounts(tenant_id, email);
    create index if not exists idx_portal_accounts_patient on patient_portal_accounts(patient_id);
    create index if not exists idx_portal_accounts_tenant on patient_portal_accounts(tenant_id);
    `,
  },
  {
    name: "071_patient_ssn_encryption",
    sql: `
    alter table patients add column if not exists ssn_last4 text;
    alter table patients add column if not exists ssn_encrypted text;

    update patients
    set ssn_last4 = right(ssn, 4)
    where ssn is not null and (ssn_last4 is null or ssn_last4 = '');
    `,
  },
  {
    name: "072_ambient_scribe_v2_schema",
    sql: `
    -- Align ambient scribe schema with v2 routes
    create table if not exists ambient_transcripts (
      id text primary key,
      tenant_id text not null references tenants(id) on delete cascade,
      recording_id text not null references ambient_recordings(id) on delete cascade,
      encounter_id text references encounters(id) on delete cascade,
      transcript_text text,
      transcript_segments jsonb,
      language text default 'en',
      speakers jsonb,
      speaker_count integer default 2,
      confidence_score decimal(3,2),
      word_count integer default 0,
      original_text text,
      phi_entities jsonb,
      phi_masked boolean default false,
      transcription_status text not null default 'pending' check (transcription_status in ('pending','processing','completed','failed')),
      error_message text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_ambient_transcripts_tenant on ambient_transcripts(tenant_id);
    create index if not exists idx_ambient_transcripts_recording on ambient_transcripts(recording_id);
    create index if not exists idx_ambient_transcripts_encounter on ambient_transcripts(encounter_id);
    create index if not exists idx_ambient_transcripts_status on ambient_transcripts(transcription_status);
    create index if not exists idx_ambient_transcripts_created on ambient_transcripts(created_at desc);

    create table if not exists ambient_note_edits (
      id text primary key,
      tenant_id text not null references tenants(id) on delete cascade,
      generated_note_id text not null references ambient_generated_notes(id) on delete cascade,
      edited_by text not null references users(id),
      section text not null,
      previous_value text,
      new_value text,
      change_type text not null check (change_type in ('create','update','delete','approve','reject')),
      edit_reason text,
      is_significant boolean default false,
      created_at timestamptz default now()
    );

    create index if not exists idx_ambient_edits_tenant on ambient_note_edits(tenant_id);
    create index if not exists idx_ambient_edits_note on ambient_note_edits(generated_note_id);
    create index if not exists idx_ambient_edits_editor on ambient_note_edits(edited_by);
    create index if not exists idx_ambient_edits_created on ambient_note_edits(created_at desc);

    create table if not exists ambient_scribe_settings (
      id text primary key,
      tenant_id text not null references tenants(id) on delete cascade,
      provider_id text references providers(id) on delete cascade,
      auto_start_recording boolean default false,
      auto_generate_notes boolean default false,
      require_review boolean default true,
      preferred_note_style text default 'soap',
      verbosity_level text default 'standard',
      include_time_markers boolean default true,
      min_transcription_confidence decimal(3,2) default 0.70,
      min_generation_confidence decimal(3,2) default 0.75,
      auto_mask_phi boolean default true,
      phi_mask_level text default 'full',
      default_consent_method text default 'verbal',
      recording_quality text default 'standard',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create unique index if not exists idx_ambient_settings_unique on ambient_scribe_settings(tenant_id, provider_id);
    create index if not exists idx_ambient_settings_tenant on ambient_scribe_settings(tenant_id);
    create index if not exists idx_ambient_settings_provider on ambient_scribe_settings(provider_id);

    alter table ambient_recordings add column if not exists recording_status text default 'recording';
    alter table ambient_recordings add column if not exists file_path text;
    alter table ambient_recordings add column if not exists file_size_bytes bigint default 0;
    alter table ambient_recordings add column if not exists mime_type text default 'audio/webm';
    alter table ambient_recordings add column if not exists consent_obtained boolean default false;
    alter table ambient_recordings add column if not exists consent_timestamp timestamptz;
    alter table ambient_recordings add column if not exists consent_method text;
    alter table ambient_recordings add column if not exists encryption_key_id text;
    alter table ambient_recordings add column if not exists is_encrypted boolean default true;
    alter table ambient_recordings add column if not exists contains_phi boolean default true;
    alter table ambient_recordings add column if not exists phi_redacted boolean default false;
    alter table ambient_recordings add column if not exists completed_at timestamptz;
    alter table ambient_recordings add column if not exists updated_at timestamptz default now();

    update ambient_recordings
    set recording_status = coalesce(recording_status, status, 'recording')
    where recording_status is null;

    create index if not exists idx_ambient_recordings_recording_status on ambient_recordings(recording_status);
    create index if not exists idx_ambient_recordings_created_v2 on ambient_recordings(created_at desc);

    alter table ambient_generated_notes add column if not exists transcript_id text references ambient_transcripts(id) on delete cascade;
    alter table ambient_generated_notes add column if not exists chief_complaint text;
    alter table ambient_generated_notes add column if not exists hpi text;
    alter table ambient_generated_notes add column if not exists ros text;
    alter table ambient_generated_notes add column if not exists physical_exam text;
    alter table ambient_generated_notes add column if not exists assessment text;
    alter table ambient_generated_notes add column if not exists plan text;
    alter table ambient_generated_notes add column if not exists suggested_icd10_codes jsonb;
    alter table ambient_generated_notes add column if not exists suggested_cpt_codes jsonb;
    alter table ambient_generated_notes add column if not exists mentioned_medications jsonb;
    alter table ambient_generated_notes add column if not exists mentioned_allergies jsonb;
    alter table ambient_generated_notes add column if not exists follow_up_tasks jsonb;
    alter table ambient_generated_notes add column if not exists ai_model text default 'gpt-4-medical';
    alter table ambient_generated_notes add column if not exists ai_version text;
    alter table ambient_generated_notes add column if not exists generation_prompt text;
    alter table ambient_generated_notes add column if not exists overall_confidence decimal(3,2);
    alter table ambient_generated_notes add column if not exists section_confidence jsonb;
    alter table ambient_generated_notes add column if not exists differential_diagnoses jsonb;
    alter table ambient_generated_notes add column if not exists recommended_tests jsonb;
    alter table ambient_generated_notes add column if not exists review_status text default 'pending';
    alter table ambient_generated_notes add column if not exists reviewed_by text references users(id);
    alter table ambient_generated_notes add column if not exists reviewed_at timestamptz;
    alter table ambient_generated_notes add column if not exists generation_status text default 'pending';
    alter table ambient_generated_notes add column if not exists error_message text;
    alter table ambient_generated_notes add column if not exists started_at timestamptz;
    alter table ambient_generated_notes add column if not exists completed_at timestamptz;

    alter table ambient_generated_notes alter column note_content drop not null;
    alter table ambient_generated_notes alter column recording_id drop not null;

    create index if not exists idx_ambient_notes_transcript on ambient_generated_notes(transcript_id);
    create index if not exists idx_ambient_notes_review_status on ambient_generated_notes(review_status);
    create index if not exists idx_ambient_notes_created_v2 on ambient_generated_notes(created_at desc);

    insert into ambient_scribe_settings (id, tenant_id, provider_id)
    select 'settings-' || t.id || '-default', t.id, null
    from tenants t
    on conflict (tenant_id, provider_id) do nothing;
    `,
  },
  {
    name: "073_messaging_and_direct_fixes",
    sql: `
    -- Internal messaging schema fixes
    alter table message_threads add column if not exists patient_id text references patients(id);
    alter table message_threads add column if not exists created_by text references users(id);
    create index if not exists idx_message_threads_patient on message_threads(patient_id);
    create index if not exists idx_message_threads_created_by on message_threads(created_by);

    -- Direct messaging tables (provider-to-provider)
    create table if not exists direct_messages (
      id text primary key,
      tenant_id text not null references tenants(id),
      from_address text not null,
      to_address text not null,
      subject text not null,
      body text,
      attachments jsonb default '[]'::jsonb,
      status text default 'sent',
      sent_at timestamptz default now(),
      delivered_at timestamptz,
      read_at timestamptz,
      transmission_id text,
      error_message text,
      sent_by text references users(id),
      reply_to_message_id text references direct_messages(id),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create index if not exists idx_direct_messages_tenant on direct_messages(tenant_id);
    create index if not exists idx_direct_messages_from on direct_messages(from_address);
    create index if not exists idx_direct_messages_to on direct_messages(to_address);
    create index if not exists idx_direct_messages_status on direct_messages(status);
    create index if not exists idx_direct_messages_sent_at on direct_messages(sent_at desc);

    create table if not exists direct_contacts (
      id text primary key,
      tenant_id text not null references tenants(id),
      provider_name text not null,
      specialty text,
      organization text,
      direct_address text not null,
      phone text,
      fax text,
      address text,
      notes text,
      is_favorite boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text references users(id)
    );

    create index if not exists idx_direct_contacts_tenant on direct_contacts(tenant_id);
    create index if not exists idx_direct_contacts_address on direct_contacts(direct_address);
    create index if not exists idx_direct_contacts_specialty on direct_contacts(specialty);
    create index if not exists idx_direct_contacts_favorite on direct_contacts(is_favorite);
    create unique index if not exists idx_direct_contacts_tenant_address on direct_contacts(tenant_id, direct_address);
    `,
  },
  {
    name: "074_vitals_schema_fix",
    sql: `
    alter table vitals add column if not exists patient_id text references patients(id);
    alter table vitals add column if not exists recorded_by_id text references users(id);
    alter table vitals add column if not exists recorded_at timestamptz;
    alter table vitals add column if not exists respiratory_rate int;
    alter table vitals add column if not exists o2_saturation int;
    alter table vitals alter column encounter_id drop not null;

    update vitals v
    set patient_id = e.patient_id
    from encounters e
    where v.encounter_id = e.id
      and v.patient_id is null;

    update vitals
    set recorded_at = coalesce(recorded_at, created_at);

    create index if not exists idx_vitals_patient on vitals(patient_id);
    create index if not exists idx_vitals_encounter on vitals(encounter_id);
    create index if not exists idx_vitals_recorded_at on vitals(recorded_at desc);
    `,
  },
  {
    name: "094_room_status_board",
    sql: `
    -- Exam Rooms Table
    CREATE TABLE IF NOT EXISTS exam_rooms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_name TEXT NOT NULL,
      room_number TEXT NOT NULL,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      room_type TEXT NOT NULL DEFAULT 'exam',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER DEFAULT 0,
      equipment TEXT[],
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, location_id, room_number)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_rooms_tenant ON exam_rooms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_exam_rooms_location ON exam_rooms(location_id);
    CREATE INDEX IF NOT EXISTS idx_exam_rooms_active ON exam_rooms(is_active) WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_exam_rooms_type ON exam_rooms(room_type);

    -- Patient Flow Table
    CREATE TABLE IF NOT EXISTS patient_flow (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES exam_rooms(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'checked_in',
      status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checked_in_at TIMESTAMPTZ,
      rooming_at TIMESTAMPTZ,
      vitals_complete_at TIMESTAMPTZ,
      ready_for_provider_at TIMESTAMPTZ,
      with_provider_at TIMESTAMPTZ,
      checkout_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      assigned_provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
      assigned_ma_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      priority TEXT DEFAULT 'normal',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, appointment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_patient_flow_tenant ON patient_flow(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_appointment ON patient_flow(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_patient ON patient_flow(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_room ON patient_flow(room_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_status ON patient_flow(status);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_provider ON patient_flow(assigned_provider_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_ma ON patient_flow(assigned_ma_id);
    CREATE INDEX IF NOT EXISTS idx_patient_flow_date ON patient_flow(created_at);

    -- Flow Status History Table
    CREATE TABLE IF NOT EXISTS flow_status_history (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      flow_id TEXT NOT NULL REFERENCES patient_flow(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      room_id TEXT REFERENCES exam_rooms(id) ON DELETE SET NULL,
      duration_seconds INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_flow_history_tenant ON flow_status_history(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_flow_history_flow ON flow_status_history(flow_id);
    CREATE INDEX IF NOT EXISTS idx_flow_history_changed_at ON flow_status_history(changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_flow_history_status ON flow_status_history(to_status);

    -- Room Assignments Table
    CREATE TABLE IF NOT EXISTS room_assignments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES exam_rooms(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      time_slot TEXT,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      effective_date DATE,
      end_date DATE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE NULLS NOT DISTINCT (tenant_id, room_id, day_of_week, time_slot, effective_date)
    );

    CREATE INDEX IF NOT EXISTS idx_room_assignments_tenant ON room_assignments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_room_assignments_room ON room_assignments(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_assignments_provider ON room_assignments(provider_id);
    CREATE INDEX IF NOT EXISTS idx_room_assignments_day ON room_assignments(day_of_week);
    CREATE INDEX IF NOT EXISTS idx_room_assignments_active ON room_assignments(is_active) WHERE is_active = TRUE;

    -- Helper function
    CREATE OR REPLACE FUNCTION calculate_stage_wait_time(
      p_flow_id TEXT,
      p_from_status TEXT,
      p_to_status TEXT
    ) RETURNS INTEGER AS $$
    DECLARE
      v_from_time TIMESTAMPTZ;
      v_to_time TIMESTAMPTZ;
    BEGIN
      SELECT
        CASE p_from_status
          WHEN 'checked_in' THEN checked_in_at
          WHEN 'rooming' THEN rooming_at
          WHEN 'vitals_complete' THEN vitals_complete_at
          WHEN 'ready_for_provider' THEN ready_for_provider_at
          WHEN 'with_provider' THEN with_provider_at
          WHEN 'checkout' THEN checkout_at
        END,
        CASE p_to_status
          WHEN 'rooming' THEN rooming_at
          WHEN 'vitals_complete' THEN vitals_complete_at
          WHEN 'ready_for_provider' THEN ready_for_provider_at
          WHEN 'with_provider' THEN with_provider_at
          WHEN 'checkout' THEN checkout_at
          WHEN 'completed' THEN completed_at
        END
      INTO v_from_time, v_to_time
      FROM patient_flow
      WHERE id = p_flow_id;

      IF v_from_time IS NOT NULL AND v_to_time IS NOT NULL THEN
        RETURN EXTRACT(EPOCH FROM (v_to_time - v_from_time))::INTEGER;
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    -- Seed demo exam rooms
    INSERT INTO exam_rooms (id, tenant_id, room_name, room_number, location_id, room_type, display_order, equipment)
    SELECT
      'room-' || generate_series,
      'tenant-demo',
      'Exam Room ' || generate_series,
      generate_series::text,
      (SELECT id FROM locations WHERE tenant_id = 'tenant-demo' LIMIT 1),
      CASE WHEN generate_series <= 6 THEN 'exam' WHEN generate_series = 7 THEN 'procedure' ELSE 'consult' END,
      generate_series,
      CASE WHEN generate_series = 7 THEN ARRAY['surgical light', 'procedure table'] ELSE ARRAY['exam table', 'dermatoscope'] END
    FROM generate_series(1, 8)
    WHERE EXISTS (SELECT 1 FROM locations WHERE tenant_id = 'tenant-demo')
    ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: "089_eligibility_checking",
    sql: `
    -- Real-time Insurance Eligibility Checking System
    CREATE TABLE IF NOT EXISTS eligibility_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      payer_id TEXT NOT NULL,
      payer_name TEXT,
      service_type TEXT NOT NULL DEFAULT 'health_benefit_plan_coverage',
      request_date TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'completed', 'error', 'timeout')),
      subscriber_id TEXT,
      subscriber_name TEXT,
      dependent_sequence TEXT,
      provider_npi TEXT,
      service_date DATE,
      x12_270_request TEXT,
      submitted_at TIMESTAMPTZ,
      response_received_at TIMESTAMPTZ,
      error_message TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_eligibility_requests_tenant ON eligibility_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_eligibility_requests_patient ON eligibility_requests(patient_id);
    CREATE INDEX IF NOT EXISTS idx_eligibility_requests_status ON eligibility_requests(status);
    CREATE INDEX IF NOT EXISTS idx_eligibility_requests_date ON eligibility_requests(request_date);

    CREATE TABLE IF NOT EXISTS eligibility_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      request_id TEXT NOT NULL REFERENCES eligibility_requests(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      is_eligible BOOLEAN,
      coverage_active BOOLEAN,
      coverage_begin_date DATE,
      coverage_end_date DATE,
      plan_name TEXT,
      plan_number TEXT,
      group_number TEXT,
      subscriber_id TEXT,
      copay_amount DECIMAL(10,2),
      coinsurance_percent INTEGER,
      deductible_amount DECIMAL(10,2),
      deductible_met DECIMAL(10,2),
      deductible_remaining DECIMAL(10,2),
      out_of_pocket_max DECIMAL(10,2),
      out_of_pocket_met DECIMAL(10,2),
      benefits_json JSONB,
      x12_271_response TEXT,
      raw_response JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_eligibility_responses_request ON eligibility_responses(request_id);
    CREATE INDEX IF NOT EXISTS idx_eligibility_responses_patient ON eligibility_responses(patient_id);

    CREATE TABLE IF NOT EXISTS payer_configurations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      payer_id TEXT NOT NULL,
      payer_name TEXT NOT NULL,
      clearinghouse TEXT DEFAULT 'availity',
      api_endpoint TEXT,
      trading_partner_id TEXT,
      is_active BOOLEAN DEFAULT true,
      supports_realtime BOOLEAN DEFAULT true,
      timeout_seconds INTEGER DEFAULT 30,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, payer_id)
    );

    CREATE TABLE IF NOT EXISTS eligibility_cache (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      payer_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      response_id TEXT REFERENCES eligibility_responses(id),
      cached_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      UNIQUE(tenant_id, cache_key)
    );

    CREATE INDEX IF NOT EXISTS idx_eligibility_cache_lookup ON eligibility_cache(tenant_id, cache_key, expires_at);
    `,
  },
  {
    name: "090_superbill_system",
    sql: `
    -- Superbill and Auto-Charge Capture System
    CREATE TABLE IF NOT EXISTS superbills (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      service_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'submitted', 'posted', 'void')),
      total_charges DECIMAL(10,2) DEFAULT 0,
      diagnosis_codes TEXT[],
      primary_diagnosis TEXT,
      place_of_service TEXT DEFAULT '11',
      rendering_provider_npi TEXT,
      referring_provider_npi TEXT,
      authorization_number TEXT,
      notes TEXT,
      approved_by TEXT REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      posted_at TIMESTAMPTZ,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_superbills_tenant ON superbills(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_superbills_encounter ON superbills(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_superbills_patient ON superbills(patient_id);
    CREATE INDEX IF NOT EXISTS idx_superbills_status ON superbills(status);
    CREATE INDEX IF NOT EXISTS idx_superbills_date ON superbills(service_date);

    CREATE TABLE IF NOT EXISTS superbill_line_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      superbill_id TEXT NOT NULL REFERENCES superbills(id) ON DELETE CASCADE,
      cpt_code TEXT NOT NULL,
      description TEXT,
      modifier1 TEXT,
      modifier2 TEXT,
      modifier3 TEXT,
      modifier4 TEXT,
      units INTEGER DEFAULT 1,
      unit_charge DECIMAL(10,2) NOT NULL,
      total_charge DECIMAL(10,2) NOT NULL,
      diagnosis_pointers TEXT[],
      ndc_code TEXT,
      ndc_units DECIMAL(10,3),
      ndc_unit_type TEXT,
      is_auto_captured BOOLEAN DEFAULT false,
      source TEXT,
      line_number INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_superbill_items_superbill ON superbill_line_items(superbill_id);
    CREATE INDEX IF NOT EXISTS idx_superbill_items_cpt ON superbill_line_items(cpt_code);

    CREATE TABLE IF NOT EXISTS fee_schedules (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      payer_id TEXT,
      is_default BOOLEAN DEFAULT false,
      effective_date DATE NOT NULL,
      end_date DATE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fee_schedule_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fee_schedule_id TEXT NOT NULL REFERENCES fee_schedules(id) ON DELETE CASCADE,
      cpt_code TEXT NOT NULL,
      description TEXT,
      fee_amount DECIMAL(10,2) NOT NULL,
      rvu_work DECIMAL(8,4),
      rvu_pe DECIMAL(8,4),
      rvu_mp DECIMAL(8,4),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(fee_schedule_id, cpt_code)
    );

    CREATE TABLE IF NOT EXISTS common_derm_codes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT,
      code_type TEXT NOT NULL CHECK (code_type IN ('cpt', 'icd10', 'hcpcs')),
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      is_common BOOLEAN DEFAULT true,
      display_order INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "091_clearinghouse_claims",
    sql: `
    -- Clearinghouse Claims Submission System
    CREATE TABLE IF NOT EXISTS clearinghouse_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      clearinghouse_name TEXT NOT NULL,
      api_endpoint TEXT,
      sftp_host TEXT,
      sftp_port INTEGER DEFAULT 22,
      sftp_username TEXT,
      credentials_encrypted TEXT,
      submitter_id TEXT,
      is_active BOOLEAN DEFAULT true,
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, clearinghouse_name)
    );

    CREATE TABLE IF NOT EXISTS claim_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      superbill_id TEXT REFERENCES superbills(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      payer_id TEXT NOT NULL,
      clearinghouse_id TEXT REFERENCES clearinghouse_configs(id),
      claim_number TEXT,
      original_claim_id TEXT REFERENCES claim_submissions(id),
      submission_type TEXT NOT NULL DEFAULT 'original' CHECK (submission_type IN ('original', 'corrected', 'void', 'replacement')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'submitted', 'accepted', 'rejected', 'paid', 'denied', 'appealed')),
      total_charge DECIMAL(10,2) NOT NULL,
      x12_837_content TEXT,
      submitted_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      payer_claim_number TEXT,
      rejection_reasons JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_claim_submissions_tenant ON claim_submissions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_claim_submissions_patient ON claim_submissions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_claim_submissions_status ON claim_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_claim_submissions_date ON claim_submissions(submitted_at);

    CREATE TABLE IF NOT EXISTS remittance_advices (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      claim_id TEXT NOT NULL REFERENCES claim_submissions(id),
      era_date DATE,
      check_number TEXT,
      check_date DATE,
      payment_amount DECIMAL(10,2),
      patient_responsibility DECIMAL(10,2),
      adjustments JSONB,
      x12_835_content TEXT,
      auto_posted BOOLEAN DEFAULT false,
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_remittance_claim ON remittance_advices(claim_id);
    `,
  },
  {
    name: "092_drug_interactions",
    sql: `
    -- Drug Interaction Checking System
    CREATE TABLE IF NOT EXISTS drug_database (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      rxcui TEXT UNIQUE,
      ndc TEXT,
      name TEXT NOT NULL,
      generic_name TEXT,
      brand_name TEXT,
      drug_class TEXT,
      dea_schedule TEXT,
      route TEXT,
      dosage_form TEXT,
      strength TEXT,
      manufacturer TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_drug_database_rxcui ON drug_database(rxcui);
    CREATE INDEX IF NOT EXISTS idx_drug_database_name ON drug_database(name);
    CREATE INDEX IF NOT EXISTS idx_drug_database_generic ON drug_database(generic_name);

    CREATE TABLE IF NOT EXISTS drug_interactions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      drug1_rxcui TEXT NOT NULL,
      drug2_rxcui TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'contraindicated')),
      description TEXT NOT NULL,
      clinical_effects TEXT,
      management TEXT,
      documentation_level TEXT,
      source TEXT DEFAULT 'internal',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(drug1_rxcui, drug2_rxcui)
    );

    CREATE INDEX IF NOT EXISTS idx_drug_interactions_drug1 ON drug_interactions(drug1_rxcui);
    CREATE INDEX IF NOT EXISTS idx_drug_interactions_drug2 ON drug_interactions(drug2_rxcui);
    CREATE INDEX IF NOT EXISTS idx_drug_interactions_severity ON drug_interactions(severity);

    CREATE TABLE IF NOT EXISTS drug_allergy_classes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      allergy_class TEXT NOT NULL,
      drug_class TEXT NOT NULL,
      cross_reactivity_level TEXT CHECK (cross_reactivity_level IN ('high', 'moderate', 'low')),
      description TEXT,
      UNIQUE(allergy_class, drug_class)
    );

    CREATE TABLE IF NOT EXISTS patient_drug_alerts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      prescription_id TEXT,
      alert_type TEXT NOT NULL CHECK (alert_type IN ('interaction', 'allergy', 'duplicate', 'contraindication', 'dose_warning')),
      severity TEXT NOT NULL,
      drug_name TEXT,
      interacting_item TEXT,
      alert_message TEXT NOT NULL,
      clinical_significance TEXT,
      override_reason TEXT,
      overridden_by TEXT REFERENCES users(id),
      overridden_at TIMESTAMPTZ,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'overridden', 'resolved')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_patient ON patient_drug_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_drug_alerts_status ON patient_drug_alerts(status);
    `,
  },
  {
    name: "093_consent_forms",
    sql: `
    -- Digital Consent Form System with E-Signatures
    CREATE TABLE IF NOT EXISTS consent_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      form_type VARCHAR(100) NOT NULL,
      content_html TEXT NOT NULL,
      required_fields JSONB DEFAULT '[]'::jsonb,
      procedure_codes TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      version VARCHAR(50) DEFAULT '1.0',
      effective_date DATE DEFAULT CURRENT_DATE,
      expiration_date DATE,
      created_by UUID,
      updated_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_consent_templates_tenant ON consent_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_consent_templates_form_type ON consent_templates(form_type);
    CREATE INDEX IF NOT EXISTS idx_consent_templates_active ON consent_templates(tenant_id, is_active) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS patient_consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES consent_templates(id) ON DELETE RESTRICT,
      encounter_id UUID,
      signed_at TIMESTAMP,
      signature_data TEXT,
      signature_type VARCHAR(50) DEFAULT 'drawn',
      signer_name VARCHAR(255),
      signer_relationship VARCHAR(100),
      ip_address INET,
      user_agent TEXT,
      device_fingerprint VARCHAR(255),
      signature_hash VARCHAR(64),
      witness_name VARCHAR(255),
      witness_signature_data TEXT,
      witness_signed_at TIMESTAMP,
      form_content_snapshot TEXT,
      form_version VARCHAR(50),
      field_values JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(50) DEFAULT 'pending',
      revoked_at TIMESTAMP,
      revoked_by UUID,
      revocation_reason TEXT,
      pdf_url TEXT,
      pdf_generated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant ON patient_consents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_consents_status ON patient_consents(status);

    CREATE TABLE IF NOT EXISTS consent_form_fields (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES consent_templates(id) ON DELETE CASCADE,
      field_name VARCHAR(100) NOT NULL,
      field_label VARCHAR(255) NOT NULL,
      field_type VARCHAR(50) NOT NULL,
      required BOOLEAN DEFAULT false,
      position INTEGER DEFAULT 0,
      options JSONB,
      placeholder VARCHAR(255),
      help_text TEXT,
      validation_pattern VARCHAR(255),
      default_value TEXT,
      depends_on_field VARCHAR(100),
      depends_on_value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (template_id, field_name)
    );

    CREATE TABLE IF NOT EXISTS consent_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      consent_id UUID NOT NULL REFERENCES patient_consents(id) ON DELETE CASCADE,
      action VARCHAR(100) NOT NULL,
      performed_by UUID,
      performed_by_type VARCHAR(50),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      details JSONB,
      ip_address INET,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_consent_audit_consent ON consent_audit_log(consent_id);

    CREATE TABLE IF NOT EXISTS consent_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES consent_templates(id) ON DELETE RESTRICT,
      encounter_id UUID,
      session_token VARCHAR(255) NOT NULL UNIQUE,
      status VARCHAR(50) DEFAULT 'active',
      expires_at TIMESTAMP NOT NULL,
      field_values JSONB DEFAULT '{}'::jsonb,
      created_by UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_consent_sessions_token ON consent_sessions(session_token);
    `,
  },
  {
    name: "095_quickpick_coding",
    sql: `
    -- Quick-Pick Coding System
    CREATE TABLE IF NOT EXISTS quickpick_categories (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      parent_category_id TEXT REFERENCES quickpick_categories(id),
      display_order INTEGER DEFAULT 0,
      icon TEXT,
      color TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, name, parent_category_id)
    );

    CREATE INDEX IF NOT EXISTS idx_quickpick_categories_tenant ON quickpick_categories(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_quickpick_categories_parent ON quickpick_categories(parent_category_id);

    CREATE TABLE IF NOT EXISTS quickpick_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      category_id TEXT REFERENCES quickpick_categories(id),
      code_type TEXT NOT NULL CHECK (code_type IN ('cpt', 'icd10', 'hcpcs', 'modifier')),
      code TEXT NOT NULL,
      description TEXT NOT NULL,
      short_description TEXT,
      default_units INTEGER DEFAULT 1,
      default_modifiers TEXT[],
      associated_diagnoses TEXT[],
      associated_procedures TEXT[],
      fee_override DECIMAL(10,2),
      usage_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      is_favorite BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_quickpick_items_tenant ON quickpick_items(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_quickpick_items_category ON quickpick_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_quickpick_items_code_type ON quickpick_items(code_type);
    CREATE INDEX IF NOT EXISTS idx_quickpick_items_code ON quickpick_items(code);
    CREATE INDEX IF NOT EXISTS idx_quickpick_items_favorite ON quickpick_items(tenant_id, is_favorite) WHERE is_favorite = true;

    CREATE TABLE IF NOT EXISTS provider_quickpicks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      quickpick_item_id TEXT NOT NULL REFERENCES quickpick_items(id),
      is_favorite BOOLEAN DEFAULT true,
      custom_order INTEGER,
      usage_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider_id, quickpick_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_provider_quickpicks_provider ON provider_quickpicks(provider_id);

    CREATE TABLE IF NOT EXISTS quickpick_bundles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      diagnosis_codes TEXT[],
      procedure_codes TEXT[],
      is_template BOOLEAN DEFAULT false,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS encounter_codes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      code_type TEXT NOT NULL CHECK (code_type IN ('cpt', 'icd10', 'hcpcs')),
      code TEXT NOT NULL,
      description TEXT,
      modifiers TEXT[],
      units INTEGER DEFAULT 1,
      is_primary BOOLEAN DEFAULT false,
      sequence_number INTEGER,
      source TEXT DEFAULT 'manual',
      quickpick_item_id TEXT REFERENCES quickpick_items(id),
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_encounter_codes_encounter ON encounter_codes(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_encounter_codes_code ON encounter_codes(code);
    `,
  },
  {
    name: "096_severity_scores",
    sql: `
    -- Dermatology Severity Assessment Scores
    CREATE TABLE IF NOT EXISTS assessment_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      description TEXT,
      assessment_type TEXT NOT NULL,
      applicable_conditions TEXT[],
      scoring_method TEXT NOT NULL,
      min_score DECIMAL(10,2),
      max_score DECIMAL(10,2),
      score_ranges JSONB,
      fields JSONB NOT NULL,
      calculation_formula TEXT,
      is_system_template BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      version TEXT DEFAULT '1.0',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_assessment_templates_type ON assessment_templates(assessment_type);
    CREATE INDEX IF NOT EXISTS idx_assessment_templates_name ON assessment_templates(short_name);

    CREATE TABLE IF NOT EXISTS severity_assessments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      template_id TEXT NOT NULL REFERENCES assessment_templates(id),
      assessment_date TIMESTAMPTZ DEFAULT NOW(),
      field_values JSONB NOT NULL,
      total_score DECIMAL(10,2),
      severity_level TEXT,
      interpretation TEXT,
      body_regions_affected TEXT[],
      photos TEXT[],
      notes TEXT,
      assessed_by TEXT NOT NULL REFERENCES users(id),
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      previous_assessment_id TEXT REFERENCES severity_assessments(id),
      score_change DECIMAL(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_severity_assessments_patient ON severity_assessments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_severity_assessments_template ON severity_assessments(template_id);
    CREATE INDEX IF NOT EXISTS idx_severity_assessments_date ON severity_assessments(assessment_date);
    CREATE INDEX IF NOT EXISTS idx_severity_assessments_encounter ON severity_assessments(encounter_id);

    CREATE TABLE IF NOT EXISTS assessment_history (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      assessment_type TEXT NOT NULL,
      assessment_id TEXT NOT NULL REFERENCES severity_assessments(id),
      assessment_date TIMESTAMPTZ NOT NULL,
      total_score DECIMAL(10,2),
      severity_level TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_assessment_history_patient ON assessment_history(patient_id, assessment_type, assessment_date);
    `,
  },
  {
    name: "097_patient_texting",
    sql: `
    -- Patient SMS/Texting System
    CREATE TABLE IF NOT EXISTS sms_conversations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      phone_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
      last_message_at TIMESTAMPTZ,
      last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
      unread_count INTEGER DEFAULT 0,
      assigned_to TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, patient_id, phone_number)
    );

    CREATE INDEX IF NOT EXISTS idx_sms_conversations_tenant ON sms_conversations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_sms_conversations_patient ON sms_conversations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_sms_conversations_phone ON sms_conversations(phone_number);
    CREATE INDEX IF NOT EXISTS idx_sms_conversations_unread ON sms_conversations(tenant_id, unread_count) WHERE unread_count > 0;

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      conversation_id TEXT NOT NULL REFERENCES sms_conversations(id),
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'received')),
      external_id TEXT,
      error_code TEXT,
      error_message TEXT,
      sent_by TEXT REFERENCES users(id),
      read_at TIMESTAMPTZ,
      read_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation ON sms_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_external ON sms_messages(external_id);

    CREATE TABLE IF NOT EXISTS sms_opt_out (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      phone_number TEXT NOT NULL,
      opted_out_at TIMESTAMPTZ DEFAULT NOW(),
      opted_in_at TIMESTAMPTZ,
      reason TEXT,
      UNIQUE(tenant_id, phone_number)
    );

    CREATE TABLE IF NOT EXISTS sms_provider_config (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      provider TEXT NOT NULL DEFAULT 'twilio',
      from_number TEXT NOT NULL,
      credentials_encrypted TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_reminders (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      reminder_type TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'both')),
      scheduled_for TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
      message_template TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_pending ON scheduled_reminders(scheduled_for) WHERE status = 'pending';
    `,
  },
  {
    name: "098_insurance_card_ocr",
    sql: `
    -- Insurance Card OCR System
    CREATE TABLE IF NOT EXISTS insurance_card_scans (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      scan_date TIMESTAMPTZ DEFAULT NOW(),
      front_image_url TEXT,
      back_image_url TEXT,
      ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed', 'verified')),
      extracted_data JSONB,
      payer_id TEXT,
      payer_name TEXT,
      member_id TEXT,
      group_number TEXT,
      subscriber_name TEXT,
      relationship_to_subscriber TEXT,
      plan_type TEXT,
      effective_date DATE,
      copay_pcp DECIMAL(10,2),
      copay_specialist DECIMAL(10,2),
      copay_er DECIMAL(10,2),
      phone_claims TEXT,
      phone_preauth TEXT,
      confidence_score DECIMAL(5,2),
      verified_by TEXT REFERENCES users(id),
      verified_at TIMESTAMPTZ,
      applied_to_patient BOOLEAN DEFAULT false,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_patient ON insurance_card_scans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_status ON insurance_card_scans(ocr_status);
    CREATE INDEX IF NOT EXISTS idx_insurance_card_scans_date ON insurance_card_scans(scan_date);

    CREATE TABLE IF NOT EXISTS ocr_field_mappings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      payer_pattern TEXT NOT NULL,
      field_name TEXT NOT NULL,
      extraction_regex TEXT,
      extraction_area JSONB,
      confidence_threshold DECIMAL(5,2) DEFAULT 0.8,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS known_payers (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      payer_id TEXT NOT NULL UNIQUE,
      payer_name TEXT NOT NULL,
      aliases TEXT[],
      logo_url TEXT,
      card_patterns JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "099_procedure_templates",
    sql: `
    -- Procedure Documentation Templates
    CREATE TABLE IF NOT EXISTS procedure_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      name TEXT NOT NULL,
      procedure_type TEXT NOT NULL,
      cpt_codes TEXT[],
      description TEXT,
      default_consent_template_id TEXT,
      pre_procedure_checklist JSONB,
      intra_procedure_fields JSONB,
      post_procedure_fields JSONB,
      default_supplies TEXT[],
      estimated_duration_minutes INTEGER,
      is_system_template BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_procedure_templates_type ON procedure_templates(procedure_type);
    CREATE INDEX IF NOT EXISTS idx_procedure_templates_tenant ON procedure_templates(tenant_id);

    CREATE TABLE IF NOT EXISTS procedure_documentation (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      template_id TEXT REFERENCES procedure_templates(id),
      procedure_name TEXT NOT NULL,
      procedure_date TIMESTAMPTZ DEFAULT NOW(),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      assistant_id TEXT REFERENCES users(id),
      body_site TEXT,
      laterality TEXT,
      anesthesia_type TEXT,
      anesthesia_amount TEXT,
      pre_procedure_notes TEXT,
      procedure_notes TEXT,
      post_procedure_notes TEXT,
      complications TEXT,
      specimen_collected BOOLEAN DEFAULT false,
      specimen_description TEXT,
      pathology_order_id TEXT,
      supplies_used JSONB,
      time_start TIMESTAMPTZ,
      time_end TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
      cpt_codes TEXT[],
      icd10_codes TEXT[],
      consent_id TEXT,
      photos TEXT[],
      diagram_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_procedure_docs_encounter ON procedure_documentation(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_procedure_docs_patient ON procedure_documentation(patient_id);
    CREATE INDEX IF NOT EXISTS idx_procedure_docs_date ON procedure_documentation(procedure_date);

    CREATE TABLE IF NOT EXISTS procedure_supplies (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      cost DECIMAL(10,2),
      hcpcs_code TEXT,
      is_billable BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "100_mohs_surgery",
    sql: `
    -- Mohs Surgery Workflow System
    CREATE TABLE IF NOT EXISTS mohs_cases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      case_number TEXT NOT NULL,
      case_date DATE NOT NULL,
      surgeon_id TEXT NOT NULL REFERENCES providers(id),
      referring_provider_id TEXT REFERENCES providers(id),
      diagnosis TEXT NOT NULL,
      diagnosis_icd10 TEXT,
      tumor_type TEXT,
      body_site TEXT NOT NULL,
      laterality TEXT,
      pre_op_size_length_mm DECIMAL(8,2),
      pre_op_size_width_mm DECIMAL(8,2),
      anesthesia_type TEXT,
      anesthesia_amount TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('scheduled', 'in_progress', 'stages_complete', 'reconstruction', 'completed', 'cancelled')),
      total_stages INTEGER DEFAULT 0,
      final_defect_length_mm DECIMAL(8,2),
      final_defect_width_mm DECIMAL(8,2),
      final_defect_depth_mm DECIMAL(8,2),
      closure_type TEXT,
      closure_details TEXT,
      complications TEXT,
      pathology_notes TEXT,
      clinical_notes TEXT,
      post_op_instructions TEXT,
      follow_up_date DATE,
      time_start TIMESTAMPTZ,
      time_end TIMESTAMPTZ,
      photos TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, case_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mohs_cases_patient ON mohs_cases(patient_id);
    CREATE INDEX IF NOT EXISTS idx_mohs_cases_date ON mohs_cases(case_date);
    CREATE INDEX IF NOT EXISTS idx_mohs_cases_surgeon ON mohs_cases(surgeon_id);
    CREATE INDEX IF NOT EXISTS idx_mohs_cases_status ON mohs_cases(status);

    CREATE TABLE IF NOT EXISTS mohs_stages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      case_id TEXT NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
      stage_number INTEGER NOT NULL,
      time_excised TIMESTAMPTZ,
      time_processed TIMESTAMPTZ,
      time_read TIMESTAMPTZ,
      excision_notes TEXT,
      margin_status TEXT CHECK (margin_status IN ('clear', 'positive', 'pending')),
      tumor_present BOOLEAN,
      tumor_location TEXT,
      block_count INTEGER DEFAULT 1,
      processing_notes TEXT,
      pathology_findings TEXT,
      diagram_data JSONB,
      photos TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(case_id, stage_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mohs_stages_case ON mohs_stages(case_id);

    CREATE TABLE IF NOT EXISTS mohs_stage_blocks (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      stage_id TEXT NOT NULL REFERENCES mohs_stages(id) ON DELETE CASCADE,
      block_label TEXT NOT NULL,
      orientation TEXT,
      sections_cut INTEGER,
      tumor_present BOOLEAN,
      tumor_type TEXT,
      depth_involved BOOLEAN,
      margin_distance_mm DECIMAL(5,2),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mohs_closures (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      case_id TEXT NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
      closure_type TEXT NOT NULL,
      closure_method TEXT,
      flap_type TEXT,
      graft_type TEXT,
      graft_donor_site TEXT,
      suture_type TEXT,
      suture_size TEXT,
      undermining_extent TEXT,
      drain_placed BOOLEAN DEFAULT false,
      reconstruction_notes TEXT,
      performed_by TEXT REFERENCES providers(id),
      time_start TIMESTAMPTZ,
      time_end TIMESTAMPTZ,
      photos TEXT[],
      diagram_data JSONB,
      cpt_codes TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mohs_maps (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      case_id TEXT NOT NULL REFERENCES mohs_cases(id) ON DELETE CASCADE,
      stage_id TEXT REFERENCES mohs_stages(id),
      map_type TEXT NOT NULL,
      svg_data TEXT,
      annotations JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "101_cosmetic_packages",
    sql: `
    -- Cosmetic Services and Membership Packages
    CREATE TABLE IF NOT EXISTS cosmetic_services (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      base_price DECIMAL(10,2) NOT NULL,
      unit_type TEXT,
      average_duration_minutes INTEGER,
      cpt_code TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cosmetic_services_tenant ON cosmetic_services(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_cosmetic_services_category ON cosmetic_services(category);

    CREATE TABLE IF NOT EXISTS cosmetic_packages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      package_price DECIMAL(10,2) NOT NULL,
      retail_value DECIMAL(10,2),
      savings_amount DECIMAL(10,2),
      services JSONB NOT NULL,
      validity_days INTEGER DEFAULT 365,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patient_packages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      package_id TEXT NOT NULL REFERENCES cosmetic_packages(id),
      purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
      expiration_date DATE,
      purchase_price DECIMAL(10,2) NOT NULL,
      services_remaining JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed', 'cancelled')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_packages_patient ON patient_packages(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_packages_status ON patient_packages(status);

    CREATE TABLE IF NOT EXISTS package_redemptions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_package_id TEXT NOT NULL REFERENCES patient_packages(id),
      service_id TEXT NOT NULL REFERENCES cosmetic_services(id),
      encounter_id TEXT REFERENCES encounters(id),
      redemption_date TIMESTAMPTZ DEFAULT NOW(),
      quantity INTEGER DEFAULT 1,
      redeemed_by TEXT REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS membership_plans (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      tier TEXT,
      monthly_fee DECIMAL(10,2) NOT NULL,
      annual_fee DECIMAL(10,2),
      benefits JSONB NOT NULL,
      discount_percent DECIMAL(5,2),
      included_services JSONB,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patient_memberships (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      plan_id TEXT NOT NULL REFERENCES membership_plans(id),
      start_date DATE NOT NULL,
      end_date DATE,
      billing_frequency TEXT NOT NULL DEFAULT 'monthly',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
      auto_renew BOOLEAN DEFAULT true,
      payment_method_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_memberships_patient ON patient_memberships(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_memberships_status ON patient_memberships(status);

    CREATE TABLE IF NOT EXISTS loyalty_points (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      current_balance INTEGER DEFAULT 0,
      lifetime_earned INTEGER DEFAULT 0,
      lifetime_redeemed INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'standard',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, patient_id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'adjust')),
      points INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      reference_type TEXT,
      reference_id TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_patient ON loyalty_transactions(patient_id);
    `,
  },
  {
    name: "102_lesion_tracking",
    sql: `
    -- Lesion Tracking and Comparison System
    CREATE TABLE IF NOT EXISTS tracked_lesions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      lesion_identifier TEXT NOT NULL,
      body_site TEXT NOT NULL,
      body_site_specific TEXT,
      laterality TEXT,
      clock_position TEXT,
      distance_from_landmark TEXT,
      description TEXT,
      initial_diagnosis TEXT,
      current_diagnosis TEXT,
      monitoring_frequency TEXT,
      risk_level TEXT CHECK (risk_level IN ('low', 'moderate', 'high', 'very_high')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'excised', 'monitoring_complete')),
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, patient_id, lesion_identifier)
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_lesions_patient ON tracked_lesions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_tracked_lesions_status ON tracked_lesions(status);
    CREATE INDEX IF NOT EXISTS idx_tracked_lesions_risk ON tracked_lesions(risk_level);

    CREATE TABLE IF NOT EXISTS lesion_images (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      lesion_id TEXT NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
      encounter_id TEXT REFERENCES encounters(id),
      image_url TEXT NOT NULL,
      thumbnail_url TEXT,
      image_type TEXT NOT NULL DEFAULT 'clinical' CHECK (image_type IN ('clinical', 'dermoscopic', 'comparison')),
      capture_date TIMESTAMPTZ DEFAULT NOW(),
      camera_settings JSONB,
      magnification TEXT,
      lighting_conditions TEXT,
      is_baseline BOOLEAN DEFAULT false,
      notes TEXT,
      captured_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lesion_images_lesion ON lesion_images(lesion_id);
    CREATE INDEX IF NOT EXISTS idx_lesion_images_date ON lesion_images(capture_date);
    CREATE INDEX IF NOT EXISTS idx_lesion_images_type ON lesion_images(image_type);

    CREATE TABLE IF NOT EXISTS lesion_tracking_measurements (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      lesion_id TEXT NOT NULL REFERENCES tracked_lesions(id) ON DELETE CASCADE,
      image_id TEXT REFERENCES lesion_images(id),
      encounter_id TEXT REFERENCES encounters(id),
      measurement_date TIMESTAMPTZ DEFAULT NOW(),
      length_mm DECIMAL(8,2),
      width_mm DECIMAL(8,2),
      height_mm DECIMAL(8,2),
      area_mm2 DECIMAL(10,2),
      color TEXT[],
      border_regularity TEXT,
      symmetry TEXT,
      dermoscopic_features JSONB,
      measured_by TEXT REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lesion_measurements_lesion ON lesion_tracking_measurements(lesion_id);
    CREATE INDEX IF NOT EXISTS idx_lesion_measurements_date ON lesion_tracking_measurements(measurement_date);

    CREATE TABLE IF NOT EXISTS lesion_abcde_scores (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      measurement_id TEXT NOT NULL REFERENCES lesion_tracking_measurements(id) ON DELETE CASCADE,
      asymmetry_score INTEGER CHECK (asymmetry_score BETWEEN 0 AND 2),
      border_score INTEGER CHECK (border_score BETWEEN 0 AND 2),
      color_score INTEGER CHECK (color_score BETWEEN 0 AND 2),
      diameter_score INTEGER CHECK (diameter_score BETWEEN 0 AND 2),
      evolution_score INTEGER CHECK (evolution_score BETWEEN 0 AND 2),
      total_score INTEGER,
      risk_assessment TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lesion_outcomes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      lesion_id TEXT NOT NULL REFERENCES tracked_lesions(id),
      outcome_date DATE NOT NULL,
      outcome_type TEXT NOT NULL,
      pathology_id TEXT,
      diagnosis TEXT,
      diagnosis_icd10 TEXT,
      is_malignant BOOLEAN,
      treatment_provided TEXT,
      follow_up_plan TEXT,
      notes TEXT,
      documented_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lesion_change_alerts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      lesion_id TEXT NOT NULL REFERENCES tracked_lesions(id),
      alert_type TEXT NOT NULL,
      alert_message TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
      comparison_data JSONB,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed')),
      acknowledged_by TEXT REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lesion_alerts_lesion ON lesion_change_alerts(lesion_id);
    CREATE INDEX IF NOT EXISTS idx_lesion_alerts_status ON lesion_change_alerts(status);
    `,
  },
  {
    name: "103_ai_lesion_analysis",
    sql: `
    -- AI Lesion Analysis System
    CREATE TABLE IF NOT EXISTS ai_model_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      model_name TEXT NOT NULL,
      model_version TEXT NOT NULL,
      model_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_endpoint TEXT,
      is_active BOOLEAN DEFAULT true,
      confidence_threshold DECIMAL(5,4) DEFAULT 0.7,
      supported_lesion_types TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_lesion_analyses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      lesion_id TEXT REFERENCES tracked_lesions(id),
      image_id TEXT REFERENCES lesion_images(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      model_config_id TEXT REFERENCES ai_model_configs(id),
      analysis_date TIMESTAMPTZ DEFAULT NOW(),
      input_image_url TEXT NOT NULL,
      preprocessed_image_url TEXT,
      analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
      primary_classification TEXT,
      primary_confidence DECIMAL(5,4),
      differential_diagnoses JSONB,
      malignancy_risk_score DECIMAL(5,4),
      risk_level TEXT,
      detected_features JSONB,
      segmentation_mask_url TEXT,
      heatmap_url TEXT,
      recommendations TEXT[],
      raw_model_output JSONB,
      processing_time_ms INTEGER,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_analyses_lesion ON ai_lesion_analyses(lesion_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_patient ON ai_lesion_analyses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_status ON ai_lesion_analyses(analysis_status);
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_date ON ai_lesion_analyses(analysis_date);

    CREATE TABLE IF NOT EXISTS ai_analysis_feedback (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      analysis_id TEXT NOT NULL REFERENCES ai_lesion_analyses(id),
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('correct', 'incorrect', 'partially_correct', 'uncertain')),
      actual_diagnosis TEXT,
      pathology_confirmed BOOLEAN,
      pathology_id TEXT,
      feedback_notes TEXT,
      provided_by TEXT NOT NULL REFERENCES users(id),
      provided_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_feedback_analysis ON ai_analysis_feedback(analysis_id);

    CREATE TABLE IF NOT EXISTS ai_comparison_analyses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      lesion_id TEXT NOT NULL REFERENCES tracked_lesions(id),
      baseline_image_id TEXT NOT NULL REFERENCES lesion_images(id),
      comparison_image_id TEXT NOT NULL REFERENCES lesion_images(id),
      analysis_date TIMESTAMPTZ DEFAULT NOW(),
      size_change_percent DECIMAL(8,2),
      color_change_detected BOOLEAN,
      color_change_details JSONB,
      border_change_detected BOOLEAN,
      shape_change_detected BOOLEAN,
      new_features_detected TEXT[],
      overall_change_score DECIMAL(5,2),
      change_classification TEXT,
      attention_areas JSONB,
      comparison_overlay_url TEXT,
      recommendations TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_comparison_lesion ON ai_comparison_analyses(lesion_id);

    CREATE TABLE IF NOT EXISTS ai_analysis_audit_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      analysis_id TEXT NOT NULL REFERENCES ai_lesion_analyses(id),
      action TEXT NOT NULL,
      performed_by TEXT REFERENCES users(id),
      performed_at TIMESTAMPTZ DEFAULT NOW(),
      details JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "104_appointment_reminders",
    sql: `
    -- Appointment Reminders System
    CREATE TABLE IF NOT EXISTS reminder_schedules (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      appointment_type_id TEXT REFERENCES appointment_types(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL CHECK (reminder_type IN ('sms', 'email', 'both')),
      hours_before INTEGER NOT NULL CHECK (hours_before > 0),
      template_id TEXT,
      is_active BOOLEAN DEFAULT true,
      include_confirmation_request BOOLEAN DEFAULT false,
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, appointment_type_id, hours_before, reminder_type)
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_schedules_tenant ON reminder_schedules(tenant_id);

    CREATE TABLE IF NOT EXISTS reminder_queue (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      schedule_id TEXT REFERENCES reminder_schedules(id) ON DELETE SET NULL,
      reminder_type TEXT NOT NULL CHECK (reminder_type IN ('sms', 'email')),
      reminder_category TEXT NOT NULL DEFAULT 'standard',
      scheduled_for TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped')),
      delivery_status TEXT,
      message_content TEXT,
      external_message_id TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      next_retry_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_queue_tenant ON reminder_queue(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_reminder_queue_appointment ON reminder_queue(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_reminder_queue_status ON reminder_queue(status);
    CREATE INDEX IF NOT EXISTS idx_reminder_queue_scheduled ON reminder_queue(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_reminder_queue_pending ON reminder_queue(tenant_id, status, scheduled_for) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS reminder_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      reminder_id TEXT NOT NULL REFERENCES reminder_queue(id) ON DELETE CASCADE,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      response_type TEXT NOT NULL CHECK (response_type IN ('confirmed', 'cancelled', 'rescheduled', 'unknown')),
      response_channel TEXT,
      response_at TIMESTAMPTZ DEFAULT NOW(),
      raw_response TEXT,
      processed BOOLEAN DEFAULT false,
      processed_at TIMESTAMPTZ,
      processed_by TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_responses_reminder ON reminder_responses(reminder_id);
    CREATE INDEX IF NOT EXISTS idx_reminder_responses_appointment ON reminder_responses(appointment_id);

    CREATE TABLE IF NOT EXISTS patient_reminder_preferences (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      preferred_channel TEXT NOT NULL DEFAULT 'both' CHECK (preferred_channel IN ('sms', 'email', 'both', 'none')),
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      opted_out BOOLEAN DEFAULT false,
      opted_out_at TIMESTAMPTZ,
      opted_out_reason TEXT,
      preferred_language TEXT DEFAULT 'en',
      advance_notice_hours INTEGER DEFAULT 24,
      receive_no_show_followup BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, patient_id)
    );

    CREATE TABLE IF NOT EXISTS reminder_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      template_type TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
      subject TEXT,
      body TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      is_default BOOLEAN DEFAULT false,
      variables JSONB DEFAULT '[]'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reminder_statistics (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      reminder_category TEXT NOT NULL,
      channel TEXT NOT NULL,
      total_scheduled INTEGER DEFAULT 0,
      total_sent INTEGER DEFAULT 0,
      total_delivered INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      total_confirmed INTEGER DEFAULT 0,
      total_cancelled INTEGER DEFAULT 0,
      total_no_shows INTEGER DEFAULT 0,
      confirmation_rate DECIMAL(5,2),
      delivery_rate DECIMAL(5,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, date, reminder_category, channel)
    );
    `,
  },
  {
    name: "105_lab_pathology_integration",
    sql: `
    -- Lab and Pathology Integration System
    CREATE TABLE IF NOT EXISTS lab_interfaces (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_lab_interfaces_tenant_active ON lab_interfaces(tenant_id, is_active);

    CREATE TABLE IF NOT EXISTS lab_orders_v2 (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
      ordering_provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
      lab_id TEXT REFERENCES lab_interfaces(id),
      order_number VARCHAR(100),
      order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      priority VARCHAR(20) DEFAULT 'routine',
      specimens JSONB DEFAULT '[]',
      clinical_indication TEXT,
      clinical_notes TEXT,
      icd10_codes TEXT[],
      is_fasting BOOLEAN DEFAULT false,
      collection_date TIMESTAMP,
      collected_by TEXT,
      specimen_source VARCHAR(100),
      specimen_site VARCHAR(255),
      hl7_message_id VARCHAR(100),
      hl7_sent_at TIMESTAMP,
      hl7_ack_received BOOLEAN DEFAULT false,
      external_order_id VARCHAR(255),
      results_received_at TIMESTAMP,
      results_reviewed_at TIMESTAMP,
      results_reviewed_by TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_tenant ON lab_orders_v2(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_patient ON lab_orders_v2(patient_id);
    CREATE INDEX IF NOT EXISTS idx_lab_orders_v2_status ON lab_orders_v2(status);

    CREATE TABLE IF NOT EXISTS lab_results_v2 (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES lab_orders_v2(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      result_date TIMESTAMP,
      result_status VARCHAR(50) DEFAULT 'preliminary',
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
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lab_results_v2_order ON lab_results_v2(order_id);
    CREATE INDEX IF NOT EXISTS idx_lab_results_v2_patient ON lab_results_v2(patient_id);

    CREATE TABLE IF NOT EXISTS pathology_orders (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
      procedure_doc_id TEXT,
      ordering_provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
      pathology_lab_id TEXT REFERENCES lab_interfaces(id),
      order_number VARCHAR(100),
      order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      specimen_type VARCHAR(100) NOT NULL,
      specimen_site VARCHAR(255),
      specimen_laterality VARCHAR(20),
      clinical_history TEXT,
      clinical_diagnosis TEXT,
      gross_description TEXT,
      specimen_count INTEGER DEFAULT 1,
      specimen_size_mm DECIMAL(8,2),
      fixative VARCHAR(100) DEFAULT 'formalin',
      status VARCHAR(50) DEFAULT 'pending',
      priority VARCHAR(20) DEFAULT 'routine',
      special_stains_requested TEXT[],
      immunohistochemistry_requested TEXT[],
      molecular_testing_requested TEXT[],
      icd10_codes TEXT[],
      cpt_codes TEXT[],
      collection_date TIMESTAMP,
      collected_by TEXT,
      external_order_id VARCHAR(255),
      accession_number VARCHAR(100),
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pathology_orders_patient ON pathology_orders(patient_id);
    CREATE INDEX IF NOT EXISTS idx_pathology_orders_status ON pathology_orders(status);

    CREATE TABLE IF NOT EXISTS pathology_results (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES pathology_orders(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      received_date TIMESTAMP,
      report_date TIMESTAMP,
      result_status VARCHAR(50) DEFAULT 'preliminary',
      diagnosis TEXT,
      diagnosis_codes TEXT[],
      microscopic_description TEXT,
      gross_description TEXT,
      clinical_correlation TEXT,
      special_stains JSONB DEFAULT '{}',
      immunohistochemistry JSONB DEFAULT '{}',
      molecular_results JSONB DEFAULT '{}',
      synoptic_report JSONB DEFAULT '{}',
      margins_status VARCHAR(50),
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
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      external_report_url TEXT,
      pdf_report_path TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pathology_results_order ON pathology_results(order_id);
    CREATE INDEX IF NOT EXISTS idx_pathology_results_patient ON pathology_results(patient_id);
    CREATE INDEX IF NOT EXISTS idx_pathology_results_malignant ON pathology_results(tenant_id) WHERE is_malignant = true;

    CREATE TABLE IF NOT EXISTS result_notifications (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('lab', 'pathology')),
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      provider_id TEXT,
      notification_type VARCHAR(50) NOT NULL,
      notification_method VARCHAR(50),
      priority VARCHAR(20) DEFAULT 'normal',
      message TEXT,
      sent_at TIMESTAMP,
      delivered_at TIMESTAMP,
      acknowledged_at TIMESTAMP,
      acknowledged_by TEXT,
      action_taken TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_result_notifications_order ON result_notifications(order_id, order_type);
    CREATE INDEX IF NOT EXISTS idx_result_notifications_unacknowledged ON result_notifications(tenant_id) WHERE acknowledged_at IS NULL;

    CREATE TABLE IF NOT EXISTS derm_lab_catalog (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT,
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

    CREATE TABLE IF NOT EXISTS lab_hl7_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      message_type VARCHAR(20) NOT NULL,
      message_direction VARCHAR(10) NOT NULL CHECK (message_direction IN ('inbound', 'outbound')),
      message_control_id VARCHAR(100),
      order_id TEXT,
      order_type VARCHAR(20),
      lab_interface_id TEXT REFERENCES lab_interfaces(id),
      raw_message TEXT NOT NULL,
      parsed_data JSONB,
      status VARCHAR(20) DEFAULT 'pending',
      error_message TEXT,
      acknowledgment TEXT,
      processed_at TIMESTAMP,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_order ON lab_hl7_messages(order_id, order_type);
    CREATE INDEX IF NOT EXISTS idx_lab_hl7_messages_status ON lab_hl7_messages(status);
    `,
  },
  {
    name: "106_intake_forms",
    sql: `
    -- Digital Pre-Visit Intake Forms System
    CREATE TABLE IF NOT EXISTS intake_form_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      form_type TEXT NOT NULL,
      sections JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      is_default BOOLEAN DEFAULT false,
      version INTEGER DEFAULT 1,
      appointment_types TEXT[],
      required_before_checkin BOOLEAN DEFAULT false,
      expiration_days INTEGER DEFAULT 365,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_intake_templates_tenant ON intake_form_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_intake_templates_type ON intake_form_templates(form_type);
    CREATE INDEX IF NOT EXISTS idx_intake_templates_active ON intake_form_templates(tenant_id, is_active) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS intake_form_sections (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      template_id TEXT NOT NULL REFERENCES intake_form_templates(id) ON DELETE CASCADE,
      section_name TEXT NOT NULL,
      section_title TEXT NOT NULL,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      fields JSONB NOT NULL DEFAULT '[]',
      conditional_display JSONB,
      is_required BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_intake_sections_template ON intake_form_sections(template_id);

    CREATE TABLE IF NOT EXISTS intake_form_assignments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      template_id TEXT NOT NULL REFERENCES intake_form_templates(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      due_date TIMESTAMPTZ,
      sent_via TEXT[],
      access_token TEXT UNIQUE,
      token_expires_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'started', 'completed', 'expired', 'cancelled')),
      reminder_count INTEGER DEFAULT 0,
      last_reminder_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_intake_assignments_patient ON intake_form_assignments(patient_id);
    CREATE INDEX IF NOT EXISTS idx_intake_assignments_appointment ON intake_form_assignments(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_intake_assignments_status ON intake_form_assignments(status);
    CREATE INDEX IF NOT EXISTS idx_intake_assignments_token ON intake_form_assignments(access_token);

    CREATE TABLE IF NOT EXISTS intake_form_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      assignment_id TEXT NOT NULL REFERENCES intake_form_assignments(id),
      template_id TEXT NOT NULL REFERENCES intake_form_templates(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      response_data JSONB NOT NULL DEFAULT '{}',
      section_responses JSONB DEFAULT '{}',
      submission_date TIMESTAMPTZ,
      is_complete BOOLEAN DEFAULT false,
      completion_percentage INTEGER DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      signature_data TEXT,
      signed_at TIMESTAMPTZ,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      imported_to_chart BOOLEAN DEFAULT false,
      imported_at TIMESTAMPTZ,
      imported_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_intake_responses_assignment ON intake_form_responses(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_intake_responses_patient ON intake_form_responses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_intake_responses_complete ON intake_form_responses(is_complete);

    CREATE TABLE IF NOT EXISTS intake_form_imports (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      response_id TEXT NOT NULL REFERENCES intake_form_responses(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      import_type TEXT NOT NULL,
      field_mappings JSONB NOT NULL,
      imported_data JSONB NOT NULL,
      target_table TEXT NOT NULL,
      target_record_id TEXT,
      imported_by TEXT REFERENCES users(id),
      imported_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
      error_details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_intake_imports_response ON intake_form_imports(response_id);
    CREATE INDEX IF NOT EXISTS idx_intake_imports_patient ON intake_form_imports(patient_id);
    `,
  },
  {
    name: "107_patient_surveys",
    sql: `
    -- Patient Surveys and NPS System
    CREATE TABLE IF NOT EXISTS survey_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      survey_type TEXT NOT NULL,
      questions JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      is_anonymous BOOLEAN DEFAULT false,
      trigger_type TEXT,
      trigger_delay_hours INTEGER DEFAULT 24,
      appointment_types TEXT[],
      provider_ids TEXT[],
      max_responses_per_patient INTEGER,
      response_window_days INTEGER DEFAULT 30,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_survey_templates_tenant ON survey_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_survey_templates_type ON survey_templates(survey_type);
    CREATE INDEX IF NOT EXISTS idx_survey_templates_active ON survey_templates(tenant_id, is_active) WHERE is_active = true;

    CREATE TABLE IF NOT EXISTS survey_invitations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      template_id TEXT NOT NULL REFERENCES survey_templates(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      encounter_id TEXT REFERENCES encounters(id),
      provider_id TEXT REFERENCES providers(id),
      access_token TEXT UNIQUE NOT NULL,
      token_expires_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      sent_via TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'started', 'completed', 'expired', 'opted_out')),
      reminder_count INTEGER DEFAULT 0,
      last_reminder_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_survey_invitations_patient ON survey_invitations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_survey_invitations_status ON survey_invitations(status);
    CREATE INDEX IF NOT EXISTS idx_survey_invitations_token ON survey_invitations(access_token);

    CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      invitation_id TEXT NOT NULL REFERENCES survey_invitations(id),
      template_id TEXT NOT NULL REFERENCES survey_templates(id),
      patient_id TEXT REFERENCES patients(id),
      provider_id TEXT REFERENCES providers(id),
      appointment_id TEXT REFERENCES appointments(id),
      response_data JSONB NOT NULL DEFAULT '{}',
      nps_score INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
      overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
      comments TEXT,
      is_anonymous BOOLEAN DEFAULT false,
      submission_date TIMESTAMPTZ DEFAULT NOW(),
      ip_address TEXT,
      user_agent TEXT,
      response_time_seconds INTEGER,
      flagged_for_review BOOLEAN DEFAULT false,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      follow_up_required BOOLEAN DEFAULT false,
      follow_up_completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_survey_responses_invitation ON survey_responses(invitation_id);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_template ON survey_responses(template_id);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_provider ON survey_responses(provider_id);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_nps ON survey_responses(nps_score);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_flagged ON survey_responses(flagged_for_review) WHERE flagged_for_review = true;

    CREATE TABLE IF NOT EXISTS nps_scores (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      period_type TEXT NOT NULL,
      provider_id TEXT REFERENCES providers(id),
      location_id TEXT REFERENCES locations(id),
      total_responses INTEGER DEFAULT 0,
      promoters INTEGER DEFAULT 0,
      passives INTEGER DEFAULT 0,
      detractors INTEGER DEFAULT 0,
      nps_score DECIMAL(5,2),
      response_rate DECIMAL(5,2),
      average_rating DECIMAL(3,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, period_start, period_end, period_type, provider_id, location_id)
    );

    CREATE INDEX IF NOT EXISTS idx_nps_scores_tenant_period ON nps_scores(tenant_id, period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_nps_scores_provider ON nps_scores(provider_id);

    CREATE TABLE IF NOT EXISTS review_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      survey_response_id TEXT NOT NULL REFERENCES survey_responses(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      platform TEXT NOT NULL,
      review_url TEXT,
      sent_at TIMESTAMPTZ,
      sent_via TEXT,
      clicked_at TIMESTAMPTZ,
      review_posted BOOLEAN DEFAULT false,
      review_posted_at TIMESTAMPTZ,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'clicked', 'posted', 'declined')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_review_requests_survey ON review_requests(survey_response_id);
    CREATE INDEX IF NOT EXISTS idx_review_requests_patient ON review_requests(patient_id);
    `,
  },
  {
    name: "108_patient_photo_upload",
    sql: `
    -- Async Care / Patient Photo Upload System
    CREATE TABLE IF NOT EXISTS async_care_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      request_number TEXT NOT NULL,
      request_type TEXT NOT NULL,
      chief_complaint TEXT NOT NULL,
      symptom_duration TEXT,
      symptom_description TEXT,
      affected_body_areas TEXT[],
      previous_treatments TEXT,
      current_medications TEXT,
      allergies TEXT,
      medical_history_relevant TEXT,
      additional_notes TEXT,
      urgency TEXT DEFAULT 'routine',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending_photos', 'under_review', 'responded', 'completed', 'cancelled')),
      assigned_provider_id TEXT REFERENCES providers(id),
      assigned_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      access_token TEXT UNIQUE,
      token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, request_number)
    );

    CREATE INDEX IF NOT EXISTS idx_async_care_patient ON async_care_requests(patient_id);
    CREATE INDEX IF NOT EXISTS idx_async_care_status ON async_care_requests(status);
    CREATE INDEX IF NOT EXISTS idx_async_care_provider ON async_care_requests(assigned_provider_id);
    CREATE INDEX IF NOT EXISTS idx_async_care_token ON async_care_requests(access_token);

    CREATE TABLE IF NOT EXISTS patient_uploaded_photos (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      async_request_id TEXT REFERENCES async_care_requests(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      original_filename TEXT,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      file_size_bytes INTEGER,
      mime_type TEXT,
      body_site TEXT,
      body_site_description TEXT,
      photo_type TEXT DEFAULT 'clinical',
      capture_date TIMESTAMPTZ DEFAULT NOW(),
      patient_notes TEXT,
      is_approved BOOLEAN,
      approved_by TEXT REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      linked_to_chart BOOLEAN DEFAULT false,
      linked_photo_id TEXT,
      linked_at TIMESTAMPTZ,
      linked_by TEXT REFERENCES users(id),
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_photos_request ON patient_uploaded_photos(async_request_id);
    CREATE INDEX IF NOT EXISTS idx_patient_photos_patient ON patient_uploaded_photos(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_photos_approved ON patient_uploaded_photos(is_approved);

    CREATE TABLE IF NOT EXISTS async_care_responses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      request_id TEXT NOT NULL REFERENCES async_care_requests(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      response_type TEXT NOT NULL,
      assessment TEXT,
      diagnosis TEXT,
      diagnosis_codes TEXT[],
      treatment_plan TEXT,
      prescriptions_ordered TEXT[],
      follow_up_recommended TEXT,
      in_person_visit_required BOOLEAN DEFAULT false,
      urgency_level TEXT,
      patient_instructions TEXT,
      internal_notes TEXT,
      response_date TIMESTAMPTZ DEFAULT NOW(),
      sent_to_patient BOOLEAN DEFAULT false,
      sent_at TIMESTAMPTZ,
      patient_viewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_async_responses_request ON async_care_responses(request_id);
    CREATE INDEX IF NOT EXISTS idx_async_responses_provider ON async_care_responses(provider_id);

    CREATE TABLE IF NOT EXISTS async_care_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      request_type TEXT NOT NULL,
      description TEXT,
      intake_questions JSONB NOT NULL DEFAULT '[]',
      required_photos INTEGER DEFAULT 1,
      photo_instructions TEXT,
      body_site_options TEXT[],
      auto_assign_provider_id TEXT REFERENCES providers(id),
      expected_response_hours INTEGER DEFAULT 24,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_async_templates_tenant ON async_care_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_async_templates_type ON async_care_templates(request_type);
    `,
  },
  {
    name: "109_patch_testing",
    sql: `
    -- Contact Dermatitis Patch Testing System
    CREATE TABLE IF NOT EXISTS allergen_database (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      allergen_name TEXT NOT NULL,
      allergen_category TEXT NOT NULL,
      cas_number TEXT,
      concentration TEXT,
      vehicle TEXT,
      common_sources TEXT[],
      cross_reactors TEXT[],
      clinical_relevance TEXT,
      patch_test_concentration TEXT,
      is_standard_series BOOLEAN DEFAULT false,
      series_name TEXT,
      synonyms TEXT[],
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_allergen_category ON allergen_database(allergen_category);
    CREATE INDEX IF NOT EXISTS idx_allergen_series ON allergen_database(series_name);
    CREATE INDEX IF NOT EXISTS idx_allergen_standard ON allergen_database(is_standard_series) WHERE is_standard_series = true;

    CREATE TABLE IF NOT EXISTS patch_test_panels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT,
      allergen_ids TEXT[],
      is_standard BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patch_panels_tenant ON patch_test_panels(tenant_id);

    CREATE TABLE IF NOT EXISTS patch_test_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      panel_id TEXT REFERENCES patch_test_panels(id),
      custom_allergens TEXT[],
      session_number TEXT,
      indication TEXT,
      clinical_history TEXT,
      current_medications TEXT[],
      application_date TIMESTAMPTZ NOT NULL,
      application_site TEXT DEFAULT 'upper back',
      applied_by TEXT REFERENCES users(id),
      day2_reading_date TIMESTAMPTZ,
      day2_read_by TEXT REFERENCES users(id),
      day3_reading_date TIMESTAMPTZ,
      day3_read_by TEXT REFERENCES users(id),
      day7_reading_date TIMESTAMPTZ,
      day7_read_by TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('scheduled', 'applied', 'day2_read', 'day3_read', 'completed', 'cancelled')),
      overall_interpretation TEXT,
      clinical_relevance_summary TEXT,
      recommendations TEXT,
      photos TEXT[],
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patch_sessions_patient ON patch_test_sessions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patch_sessions_status ON patch_test_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_patch_sessions_dates ON patch_test_sessions(application_date);

    CREATE TABLE IF NOT EXISTS patch_test_results (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      session_id TEXT NOT NULL REFERENCES patch_test_sessions(id) ON DELETE CASCADE,
      allergen_id TEXT NOT NULL REFERENCES allergen_database(id),
      allergen_name TEXT NOT NULL,
      chamber_position TEXT,
      day2_reaction TEXT,
      day2_score INTEGER,
      day2_notes TEXT,
      day3_reaction TEXT,
      day3_score INTEGER,
      day3_notes TEXT,
      day7_reaction TEXT,
      day7_score INTEGER,
      day7_notes TEXT,
      final_interpretation TEXT,
      is_positive BOOLEAN,
      is_irritant BOOLEAN DEFAULT false,
      clinical_relevance TEXT,
      relevance_score INTEGER,
      avoidance_instructions TEXT,
      photos JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patch_results_session ON patch_test_results(session_id);
    CREATE INDEX IF NOT EXISTS idx_patch_results_allergen ON patch_test_results(allergen_id);
    CREATE INDEX IF NOT EXISTS idx_patch_results_positive ON patch_test_results(is_positive) WHERE is_positive = true;

    CREATE TABLE IF NOT EXISTS patch_test_reports (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      session_id TEXT NOT NULL REFERENCES patch_test_sessions(id),
      report_type TEXT NOT NULL DEFAULT 'standard',
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      generated_by TEXT REFERENCES users(id),
      report_content JSONB,
      pdf_path TEXT,
      sent_to_patient BOOLEAN DEFAULT false,
      sent_at TIMESTAMPTZ,
      sent_to_referring BOOLEAN DEFAULT false,
      referring_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    `,
  },
  {
    name: "110_phototherapy",
    sql: `
    -- Phototherapy (UV Light Therapy) Tracking System
    CREATE TABLE IF NOT EXISTS phototherapy_protocols (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      condition TEXT NOT NULL,
      light_type TEXT NOT NULL CHECK (light_type IN ('NB-UVB', 'BB-UVB', 'PUVA', 'UVA1')),
      wavelength_nm TEXT,
      description TEXT,
      starting_dose_type_i NUMERIC(10,2),
      starting_dose_type_ii NUMERIC(10,2),
      starting_dose_type_iii NUMERIC(10,2),
      starting_dose_type_iv NUMERIC(10,2),
      starting_dose_type_v NUMERIC(10,2),
      starting_dose_type_vi NUMERIC(10,2),
      starting_dose NUMERIC(10,2),
      increment_percent NUMERIC(5,2) DEFAULT 10.00,
      max_dose NUMERIC(10,2),
      frequency TEXT DEFAULT '3x_weekly',
      min_hours_between_treatments INTEGER DEFAULT 48,
      psoralen_type TEXT,
      psoralen_dose_mg NUMERIC(8,2),
      psoralen_timing_minutes INTEGER,
      max_cumulative_dose NUMERIC(12,2),
      high_cumulative_warning NUMERIC(12,2),
      is_template BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_tenant ON phototherapy_protocols(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_phototherapy_protocols_light_type ON phototherapy_protocols(light_type);

    CREATE TABLE IF NOT EXISTS phototherapy_cabinets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      cabinet_name TEXT NOT NULL,
      location_id TEXT REFERENCES locations(id),
      light_type TEXT NOT NULL CHECK (light_type IN ('NB-UVB', 'BB-UVB', 'PUVA', 'UVA1')),
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      bulb_type TEXT,
      number_of_bulbs INTEGER,
      bulb_hours NUMERIC(10,2) DEFAULT 0,
      bulb_max_hours NUMERIC(10,2),
      bulb_installed_date DATE,
      calibration_date DATE,
      next_calibration_due DATE,
      calibration_factor NUMERIC(6,4) DEFAULT 1.0000,
      last_service_date DATE,
      next_service_due DATE,
      service_notes TEXT,
      is_active BOOLEAN DEFAULT true,
      out_of_service_reason TEXT,
      out_of_service_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, cabinet_name)
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_cabinets_tenant ON phototherapy_cabinets(tenant_id);

    CREATE TABLE IF NOT EXISTS phototherapy_courses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      protocol_id TEXT NOT NULL REFERENCES phototherapy_protocols(id),
      prescribing_provider_id TEXT NOT NULL REFERENCES providers(id),
      diagnosis_code TEXT,
      diagnosis_description TEXT,
      indication TEXT,
      fitzpatrick_skin_type INTEGER CHECK (fitzpatrick_skin_type BETWEEN 1 AND 6),
      target_body_areas TEXT[],
      treatment_percentage_bsa NUMERIC(5,2),
      start_date DATE NOT NULL,
      end_date DATE,
      target_treatment_count INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discontinued', 'on_hold')),
      discontinuation_reason TEXT,
      discontinuation_date DATE,
      clinical_notes TEXT,
      precautions TEXT,
      total_treatments INTEGER DEFAULT 0,
      cumulative_dose_course NUMERIC(12,2) DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_patient ON phototherapy_courses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_phototherapy_courses_status ON phototherapy_courses(status);

    CREATE TABLE IF NOT EXISTS phototherapy_treatments (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      course_id TEXT NOT NULL REFERENCES phototherapy_courses(id),
      cabinet_id TEXT REFERENCES phototherapy_cabinets(id),
      treatment_number INTEGER NOT NULL,
      treatment_date DATE NOT NULL,
      treatment_time TIME,
      dose_mj NUMERIC(10,2) NOT NULL,
      duration_seconds INTEGER,
      body_areas TEXT[],
      skin_type INTEGER,
      pre_treatment_notes TEXT,
      erythema_response TEXT CHECK (erythema_response IN ('none', 'minimal', 'mild', 'moderate', 'severe', 'blistering')),
      erythema_score INTEGER CHECK (erythema_score BETWEEN 0 AND 4),
      response_notes TEXT,
      dose_adjustment_reason TEXT,
      previous_dose_mj NUMERIC(10,2),
      psoralen_taken BOOLEAN,
      psoralen_time TIMESTAMPTZ,
      psoralen_dose_mg NUMERIC(8,2),
      eye_protection_verified BOOLEAN DEFAULT true,
      administered_by TEXT REFERENCES users(id),
      supervised_by TEXT REFERENCES providers(id),
      treatment_completed BOOLEAN DEFAULT true,
      early_termination_reason TEXT,
      actual_duration_seconds INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(course_id, treatment_number)
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_course ON phototherapy_treatments(course_id);
    CREATE INDEX IF NOT EXISTS idx_phototherapy_treatments_date ON phototherapy_treatments(treatment_date DESC);

    CREATE TABLE IF NOT EXISTS phototherapy_cumulative_doses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      nb_uvb_lifetime_dose NUMERIC(12,2) DEFAULT 0,
      bb_uvb_lifetime_dose NUMERIC(12,2) DEFAULT 0,
      puva_lifetime_dose NUMERIC(12,2) DEFAULT 0,
      uva1_lifetime_dose NUMERIC(12,2) DEFAULT 0,
      nb_uvb_treatment_count INTEGER DEFAULT 0,
      bb_uvb_treatment_count INTEGER DEFAULT 0,
      puva_treatment_count INTEGER DEFAULT 0,
      uva1_treatment_count INTEGER DEFAULT 0,
      nb_uvb_last_treatment DATE,
      bb_uvb_last_treatment DATE,
      puva_last_treatment DATE,
      uva1_last_treatment DATE,
      high_exposure_alert_sent BOOLEAN DEFAULT false,
      high_exposure_alert_date TIMESTAMPTZ,
      external_nb_uvb_dose NUMERIC(12,2) DEFAULT 0,
      external_bb_uvb_dose NUMERIC(12,2) DEFAULT 0,
      external_puva_dose NUMERIC(12,2) DEFAULT 0,
      external_uva1_dose NUMERIC(12,2) DEFAULT 0,
      external_history_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, patient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_cumulative_patient ON phototherapy_cumulative_doses(patient_id);

    CREATE TABLE IF NOT EXISTS phototherapy_alerts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT REFERENCES patients(id),
      course_id TEXT REFERENCES phototherapy_courses(id),
      treatment_id TEXT REFERENCES phototherapy_treatments(id),
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
      acknowledged_by TEXT REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      resolved_by TEXT REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_phototherapy_alerts_patient ON phototherapy_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_phototherapy_alerts_status ON phototherapy_alerts(status) WHERE status = 'active';
    `,
  },
  {
    name: "111_allergy_alerts",
    sql: `
    -- Allergy Alert System - Enhancements to existing patient_allergies table
    -- Add missing columns to existing patient_allergies table
    ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS rxcui VARCHAR(20);
    ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS reaction_type VARCHAR(100);
    ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS source VARCHAR(50);
    ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
    ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id);

    CREATE INDEX IF NOT EXISTS idx_patient_allergies_rxcui ON patient_allergies(rxcui) WHERE rxcui IS NOT NULL;

    CREATE TABLE IF NOT EXISTS allergy_reactions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      allergy_id TEXT NOT NULL REFERENCES patient_allergies(id) ON DELETE CASCADE,
      reaction_description TEXT NOT NULL,
      symptoms TEXT[] DEFAULT '{}',
      onset_timing VARCHAR(50),
      duration VARCHAR(50),
      treatment_required BOOLEAN DEFAULT false,
      hospitalization_required BOOLEAN DEFAULT false,
      documented_date DATE,
      documented_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_allergy_reactions_allergy ON allergy_reactions(allergy_id);

    CREATE TABLE IF NOT EXISTS allergy_cross_reactivity (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      primary_allergen VARCHAR(255) NOT NULL,
      primary_allergen_rxcui VARCHAR(20),
      primary_drug_class VARCHAR(100),
      cross_reactive_allergens TEXT[] NOT NULL DEFAULT '{}',
      cross_reactive_rxcuis TEXT[] DEFAULT '{}',
      cross_reactivity_type VARCHAR(50) NOT NULL CHECK (cross_reactivity_type IN ('drug_class', 'chemical_structure', 'immunologic', 'unknown')),
      cross_reactivity_rate DECIMAL(5,2),
      clinical_significance VARCHAR(20) CHECK (clinical_significance IN ('high', 'moderate', 'low', 'theoretical')),
      evidence_level VARCHAR(20),
      clinical_notes TEXT,
      recommendations TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_cross_reactivity UNIQUE (primary_allergen, cross_reactivity_type)
    );

    CREATE INDEX IF NOT EXISTS idx_cross_reactivity_primary ON allergy_cross_reactivity(primary_allergen);

    CREATE TABLE IF NOT EXISTS allergy_alerts_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('drug_allergy', 'cross_reactivity', 'latex', 'adhesive', 'contact', 'food')),
      trigger_drug VARCHAR(255),
      trigger_rxcui VARCHAR(20),
      allergy_id TEXT REFERENCES patient_allergies(id) ON DELETE SET NULL,
      alert_severity VARCHAR(20) NOT NULL CHECK (alert_severity IN ('info', 'warning', 'critical', 'contraindicated')),
      alert_message TEXT,
      cross_reactive_with VARCHAR(255),
      displayed_to TEXT NOT NULL REFERENCES users(id),
      displayed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      display_context VARCHAR(50),
      action_taken VARCHAR(50) CHECK (action_taken IN ('override', 'cancelled', 'changed', 'acknowledged', 'pending')),
      action_at TIMESTAMPTZ,
      action_reason TEXT,
      override_reason TEXT,
      encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
      prescription_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_allergy_alerts_patient ON allergy_alerts_log(patient_id);
    CREATE INDEX IF NOT EXISTS idx_allergy_alerts_type ON allergy_alerts_log(alert_type);
    CREATE INDEX IF NOT EXISTS idx_allergy_alerts_severity ON allergy_alerts_log(alert_severity);
    `,
  },
  {
    name: "112_mips_reporting",
    sql: `
    -- MIPS/MACRA Quality Reporting System - Enhancements to existing tables
    -- Add missing columns to quality_measures
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS measure_type TEXT;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS domain TEXT;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS high_priority BOOLEAN DEFAULT false;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS applicable_to_derm BOOLEAN DEFAULT true;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS numerator_description TEXT;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS denominator_description TEXT;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS exclusions TEXT;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS performance_rate_threshold DECIMAL(5,2);
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS benchmark_decile_3 DECIMAL(5,2);
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS benchmark_decile_10 DECIMAL(5,2);
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS points_possible INTEGER DEFAULT 10;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS is_inverse BOOLEAN DEFAULT false;
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS collection_type TEXT[];
    ALTER TABLE quality_measures ADD COLUMN IF NOT EXISTS submission_methods TEXT[];

    -- Add missing columns to measure_performance
    ALTER TABLE measure_performance ADD COLUMN IF NOT EXISTS exception_count INTEGER DEFAULT 0;
    ALTER TABLE measure_performance ADD COLUMN IF NOT EXISTS performance_met BOOLEAN;
    ALTER TABLE measure_performance ADD COLUMN IF NOT EXISTS points_earned DECIMAL(5,2);
    ALTER TABLE measure_performance ADD COLUMN IF NOT EXISTS benchmark_comparison TEXT;

    CREATE TABLE IF NOT EXISTS patient_measure_status (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      measure_id TEXT NOT NULL REFERENCES quality_measures(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      provider_id TEXT REFERENCES providers(id),
      reporting_year INTEGER NOT NULL,
      in_denominator BOOLEAN DEFAULT false,
      in_numerator BOOLEAN DEFAULT false,
      is_excluded BOOLEAN DEFAULT false,
      is_exception BOOLEAN DEFAULT false,
      exclusion_reason TEXT,
      exception_reason TEXT,
      status TEXT DEFAULT 'pending',
      action_required TEXT,
      due_date DATE,
      completed_date DATE,
      documentation JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_measure_patient ON patient_measure_status(patient_id);
    CREATE INDEX IF NOT EXISTS idx_patient_measure_measure ON patient_measure_status(measure_id);
    CREATE INDEX IF NOT EXISTS idx_patient_measure_encounter ON patient_measure_status(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_patient_measure_year ON patient_measure_status(reporting_year);
    CREATE INDEX IF NOT EXISTS idx_patient_measure_action ON patient_measure_status(action_required) WHERE action_required IS NOT NULL;

    CREATE TABLE IF NOT EXISTS mips_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      submission_year INTEGER NOT NULL,
      submission_type TEXT NOT NULL,
      provider_id TEXT REFERENCES providers(id),
      tin TEXT,
      npi TEXT,
      submission_date TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft',
      quality_category_score DECIMAL(5,2),
      pi_category_score DECIMAL(5,2),
      ia_category_score DECIMAL(5,2),
      cost_category_score DECIMAL(5,2),
      final_score DECIMAL(5,2),
      payment_adjustment_percent DECIMAL(5,2),
      submission_data JSONB,
      confirmation_number TEXT,
      errors JSONB,
      submitted_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mips_submissions_tenant ON mips_submissions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_mips_submissions_year ON mips_submissions(submission_year);
    CREATE INDEX IF NOT EXISTS idx_mips_submissions_provider ON mips_submissions(provider_id);

    CREATE TABLE IF NOT EXISTS ia_activities (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      activity_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      subcategory TEXT,
      weight TEXT,
      is_high_weight BOOLEAN DEFAULT false,
      applicable_to_derm BOOLEAN DEFAULT true,
      documentation_requirements TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS provider_ia_attestations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      activity_id TEXT NOT NULL REFERENCES ia_activities(id),
      reporting_year INTEGER NOT NULL,
      attested BOOLEAN DEFAULT false,
      attestation_date DATE,
      documentation TEXT,
      attested_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, provider_id, activity_id, reporting_year)
    );

    CREATE TABLE IF NOT EXISTS measure_alerts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      measure_id TEXT NOT NULL REFERENCES quality_measures(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      provider_id TEXT REFERENCES providers(id),
      alert_type TEXT NOT NULL,
      alert_message TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      due_date DATE,
      acknowledged_by TEXT REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      resolved_by TEXT REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_measure_alerts_patient ON measure_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_measure_alerts_status ON measure_alerts(status) WHERE status = 'active';
    `,
  },
  {
    name: "113_telemedicine",
    sql: `
    -- Telemedicine/Virtual Visit System
    CREATE TABLE IF NOT EXISTS telemedicine_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      provider_name TEXT NOT NULL,
      api_key_encrypted TEXT,
      api_secret_encrypted TEXT,
      webhook_secret TEXT,
      is_active BOOLEAN DEFAULT true,
      default_waiting_room_enabled BOOLEAN DEFAULT true,
      recording_enabled BOOLEAN DEFAULT false,
      max_participants INTEGER DEFAULT 2,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    );

    CREATE TABLE IF NOT EXISTS virtual_visits (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      appointment_id TEXT REFERENCES appointments(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      provider_id TEXT NOT NULL REFERENCES providers(id),
      encounter_id TEXT REFERENCES encounters(id),
      visit_type TEXT NOT NULL DEFAULT 'video',
      scheduled_start TIMESTAMPTZ NOT NULL,
      scheduled_duration_minutes INTEGER DEFAULT 15,
      room_name TEXT UNIQUE,
      room_url TEXT,
      host_url TEXT,
      participant_url TEXT,
      patient_join_url TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show', 'technical_issue')),
      patient_joined_at TIMESTAMPTZ,
      provider_joined_at TIMESTAMPTZ,
      visit_started_at TIMESTAMPTZ,
      visit_ended_at TIMESTAMPTZ,
      actual_duration_minutes INTEGER,
      waiting_room_time_seconds INTEGER,
      technical_issues JSONB,
      patient_device_info JSONB,
      provider_device_info JSONB,
      connection_quality TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_virtual_visits_patient ON virtual_visits(patient_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_visits_provider ON virtual_visits(provider_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_visits_appointment ON virtual_visits(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_virtual_visits_status ON virtual_visits(status);
    CREATE INDEX IF NOT EXISTS idx_virtual_visits_scheduled ON virtual_visits(scheduled_start);

    CREATE TABLE IF NOT EXISTS telemedicine_consents (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      virtual_visit_id TEXT REFERENCES virtual_visits(id),
      consent_type TEXT NOT NULL DEFAULT 'telemedicine',
      consented BOOLEAN NOT NULL,
      consent_date TIMESTAMPTZ DEFAULT NOW(),
      consent_method TEXT,
      ip_address TEXT,
      signature_data TEXT,
      consent_text TEXT,
      valid_until DATE,
      revoked_at TIMESTAMPTZ,
      revoked_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_telemedicine_consents_patient ON telemedicine_consents(patient_id);
    CREATE INDEX IF NOT EXISTS idx_telemedicine_consents_visit ON telemedicine_consents(virtual_visit_id);

    CREATE TABLE IF NOT EXISTS telemedicine_recordings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      virtual_visit_id TEXT NOT NULL REFERENCES virtual_visits(id),
      recording_url TEXT,
      recording_path TEXT,
      duration_seconds INTEGER,
      file_size_bytes BIGINT,
      format TEXT,
      transcription_status TEXT DEFAULT 'pending',
      transcription_text TEXT,
      retention_until DATE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS telemedicine_waiting_room (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      virtual_visit_id TEXT NOT NULL REFERENCES virtual_visits(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      admitted_at TIMESTAMPTZ,
      admitted_by TEXT REFERENCES users(id),
      left_at TIMESTAMPTZ,
      status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'admitted', 'left', 'removed')),
      position_in_queue INTEGER,
      estimated_wait_minutes INTEGER,
      messages JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_waiting_room_visit ON telemedicine_waiting_room(virtual_visit_id);
    CREATE INDEX IF NOT EXISTS idx_waiting_room_status ON telemedicine_waiting_room(status) WHERE status = 'waiting';
    `,
  },
  {
    name: "114_audit_reports",
    sql: `
    -- Enhanced Audit Reports and HIPAA Compliance
    CREATE TABLE IF NOT EXISTS audit_report_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      report_type TEXT NOT NULL CHECK (report_type IN ('access', 'changes', 'phi', 'security', 'login', 'prescription', 'export')),
      filters JSONB DEFAULT '{}',
      columns TEXT[] DEFAULT ARRAY['timestamp', 'user', 'action', 'resource', 'status'],
      schedule_cron TEXT,
      schedule_enabled BOOLEAN DEFAULT false,
      recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_audit_report_templates_tenant ON audit_report_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_report_templates_type ON audit_report_templates(report_type);

    CREATE TABLE IF NOT EXISTS audit_report_runs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      template_id TEXT REFERENCES audit_report_templates(id) ON DELETE SET NULL,
      template_name TEXT,
      report_type TEXT NOT NULL,
      run_date TIMESTAMPTZ DEFAULT NOW(),
      date_range_start TIMESTAMPTZ,
      date_range_end TIMESTAMPTZ,
      filters_applied JSONB DEFAULT '{}',
      generated_by TEXT REFERENCES users(id),
      generated_by_name TEXT,
      row_count INTEGER DEFAULT 0,
      file_url TEXT,
      file_size_bytes INTEGER,
      file_format TEXT DEFAULT 'csv' CHECK (file_format IN ('csv', 'pdf', 'json', 'xlsx')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
      error_message TEXT,
      expires_at TIMESTAMPTZ,
      checksum TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_report_runs_tenant ON audit_report_runs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_report_runs_date ON audit_report_runs(run_date DESC);

    CREATE TABLE IF NOT EXISTS suspicious_activity_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      user_name TEXT,
      user_email TEXT,
      activity_type TEXT NOT NULL,
      risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 1 AND 100),
      details JSONB DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      related_audit_ids TEXT[],
      related_patient_ids TEXT[],
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      detection_method TEXT,
      reviewed BOOLEAN DEFAULT false,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      action_taken TEXT,
      requires_follow_up BOOLEAN DEFAULT false,
      follow_up_due_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_tenant ON suspicious_activity_log(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_user ON suspicious_activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_risk ON suspicious_activity_log(risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_suspicious_activity_unreviewed ON suspicious_activity_log(tenant_id, reviewed, detected_at DESC) WHERE reviewed = false;

    CREATE TABLE IF NOT EXISTS phi_access_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      audit_log_id TEXT REFERENCES audit_log(id),
      user_id TEXT REFERENCES users(id),
      patient_id TEXT NOT NULL,
      patient_name TEXT,
      access_type TEXT NOT NULL CHECK (access_type IN ('view', 'create', 'update', 'delete', 'export', 'print', 'fax', 'share')),
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      access_reason TEXT,
      is_break_glass BOOLEAN DEFAULT false,
      is_own_record BOOLEAN DEFAULT false,
      relationship_to_patient TEXT,
      ip_address TEXT,
      session_id TEXT,
      accessed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_phi_access_patient ON phi_access_log(patient_id, accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_phi_access_user ON phi_access_log(user_id, accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_phi_access_break_glass ON phi_access_log(tenant_id, is_break_glass) WHERE is_break_glass = true;

    CREATE TABLE IF NOT EXISTS login_activity_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      user_email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      browser TEXT,
      os TEXT,
      device_type TEXT,
      location_city TEXT,
      location_country TEXT,
      session_id TEXT,
      failure_reason TEXT,
      is_suspicious BOOLEAN DEFAULT false,
      risk_factors JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_activity_email ON login_activity_log(user_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_activity_suspicious ON login_activity_log(tenant_id, is_suspicious, created_at DESC) WHERE is_suspicious = true;

    CREATE TABLE IF NOT EXISTS break_glass_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT,
      patient_id TEXT NOT NULL,
      patient_name TEXT,
      reason TEXT NOT NULL,
      reason_category TEXT,
      authorized_by TEXT REFERENCES users(id),
      access_duration_minutes INTEGER,
      resources_accessed TEXT[],
      audit_log_ids TEXT[],
      accessed_at TIMESTAMPTZ DEFAULT NOW(),
      access_ended_at TIMESTAMPTZ,
      reviewed BOOLEAN DEFAULT false,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_outcome TEXT,
      review_notes TEXT,
      follow_up_required BOOLEAN DEFAULT false
    );

    CREATE INDEX IF NOT EXISTS idx_break_glass_user ON break_glass_log(user_id, accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_break_glass_patient ON break_glass_log(patient_id, accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_break_glass_unreviewed ON break_glass_log(tenant_id, reviewed, accessed_at DESC) WHERE reviewed = false;
    `,
  },
  {
    name: "115_wait_time_display",
    sql: `
    -- Wait Time Display System
    CREATE TABLE IF NOT EXISTS wait_time_displays (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      location_id TEXT REFERENCES locations(id),
      display_name TEXT NOT NULL,
      display_type TEXT NOT NULL DEFAULT 'lobby',
      is_active BOOLEAN DEFAULT true,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wait_time_snapshots (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      location_id TEXT REFERENCES locations(id),
      snapshot_time TIMESTAMPTZ DEFAULT NOW(),
      average_wait_minutes INTEGER,
      current_waiting_count INTEGER,
      longest_wait_minutes INTEGER,
      patients_seen_today INTEGER,
      provider_availability JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_wait_time_snapshots_location ON wait_time_snapshots(location_id, snapshot_time DESC);

    CREATE TABLE IF NOT EXISTS patient_wait_times (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      check_in_time TIMESTAMPTZ NOT NULL,
      called_back_time TIMESTAMPTZ,
      provider_arrival_time TIMESTAMPTZ,
      checkout_time TIMESTAMPTZ,
      wait_time_minutes INTEGER,
      total_visit_minutes INTEGER,
      provider_id TEXT REFERENCES providers(id),
      location_id TEXT REFERENCES locations(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_patient_wait_times_appointment ON patient_wait_times(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_patient_wait_times_provider ON patient_wait_times(provider_id);
    CREATE INDEX IF NOT EXISTS idx_patient_wait_times_date ON patient_wait_times(check_in_time);
    `,
  },
  {
    name: "116_copay_collection",
    sql: `
    -- Point-of-Service Copay Collection System
    CREATE TABLE IF NOT EXISTS copay_estimates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      encounter_id TEXT REFERENCES encounters(id),
      insurance_id TEXT,
      estimated_copay DECIMAL(10,2),
      estimated_coinsurance DECIMAL(10,2),
      estimated_deductible DECIMAL(10,2),
      estimated_total DECIMAL(10,2),
      estimation_method TEXT,
      estimation_date TIMESTAMPTZ DEFAULT NOW(),
      valid_until DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_copay_estimates_patient ON copay_estimates(patient_id);
    CREATE INDEX IF NOT EXISTS idx_copay_estimates_appointment ON copay_estimates(appointment_id);

    CREATE TABLE IF NOT EXISTS copay_collections (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      appointment_id TEXT REFERENCES appointments(id),
      encounter_id TEXT REFERENCES encounters(id),
      estimate_id TEXT REFERENCES copay_estimates(id),
      amount_due DECIMAL(10,2) NOT NULL,
      amount_collected DECIMAL(10,2) NOT NULL,
      collection_type TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      collected_by TEXT REFERENCES users(id),
      collected_at TIMESTAMPTZ DEFAULT NOW(),
      receipt_number TEXT,
      notes TEXT,
      voided BOOLEAN DEFAULT false,
      voided_at TIMESTAMPTZ,
      voided_by TEXT REFERENCES users(id),
      void_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_copay_collections_patient ON copay_collections(patient_id);
    CREATE INDEX IF NOT EXISTS idx_copay_collections_appointment ON copay_collections(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_copay_collections_date ON copay_collections(collected_at);

    CREATE TABLE IF NOT EXISTS payment_plans (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      total_amount DECIMAL(10,2) NOT NULL,
      down_payment DECIMAL(10,2) DEFAULT 0,
      remaining_balance DECIMAL(10,2) NOT NULL,
      monthly_payment DECIMAL(10,2) NOT NULL,
      number_of_payments INTEGER NOT NULL,
      payments_made INTEGER DEFAULT 0,
      start_date DATE NOT NULL,
      next_payment_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      auto_charge BOOLEAN DEFAULT false,
      payment_method_id TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_plans_patient ON payment_plans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON payment_plans(status);

    CREATE TABLE IF NOT EXISTS payment_plan_transactions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      plan_id TEXT NOT NULL REFERENCES payment_plans(id),
      payment_number INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_date TIMESTAMPTZ,
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      payment_method TEXT,
      payment_reference TEXT,
      failure_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_plan_transactions_plan ON payment_plan_transactions(plan_id);
    `,
  },
  {
    name: "117_product_sales",
    sql: `
    -- Skincare Product Sales System
    CREATE TABLE IF NOT EXISTS product_catalog (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      category TEXT NOT NULL,
      description TEXT,
      retail_price DECIMAL(10,2) NOT NULL,
      cost_price DECIMAL(10,2),
      tax_rate DECIMAL(5,4) DEFAULT 0,
      is_taxable BOOLEAN DEFAULT true,
      is_prescription BOOLEAN DEFAULT false,
      requires_consultation BOOLEAN DEFAULT false,
      active_ingredients TEXT[],
      skin_types TEXT[],
      conditions_treated TEXT[],
      image_url TEXT,
      barcode TEXT,
      reorder_point INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, sku)
    );

    CREATE INDEX IF NOT EXISTS idx_product_catalog_tenant ON product_catalog(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_product_catalog_category ON product_catalog(category);
    CREATE INDEX IF NOT EXISTS idx_product_catalog_sku ON product_catalog(sku);

    CREATE TABLE IF NOT EXISTS product_inventory (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      product_id TEXT NOT NULL REFERENCES product_catalog(id),
      location_id TEXT REFERENCES locations(id),
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER DEFAULT 0,
      quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
      last_count_date DATE,
      last_count_quantity INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, location_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_inventory_product ON product_inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_inventory_location ON product_inventory(location_id);

    CREATE TABLE IF NOT EXISTS product_sales (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sale_number TEXT NOT NULL,
      patient_id TEXT REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      sold_by TEXT REFERENCES users(id),
      sale_date TIMESTAMPTZ DEFAULT NOW(),
      subtotal DECIMAL(10,2) NOT NULL,
      tax_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT,
      payment_reference TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, sale_number)
    );

    CREATE INDEX IF NOT EXISTS idx_product_sales_patient ON product_sales(patient_id);
    CREATE INDEX IF NOT EXISTS idx_product_sales_date ON product_sales(sale_date);

    CREATE TABLE IF NOT EXISTS product_sale_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sale_id TEXT NOT NULL REFERENCES product_sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES product_catalog(id),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      line_total DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON product_sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON product_sale_items(product_id);

    CREATE TABLE IF NOT EXISTS product_recommendations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      provider_id TEXT REFERENCES providers(id),
      product_id TEXT NOT NULL REFERENCES product_catalog(id),
      recommendation_reason TEXT,
      usage_instructions TEXT,
      recommended_at TIMESTAMPTZ DEFAULT NOW(),
      purchased BOOLEAN DEFAULT false,
      purchased_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_recommendations_patient ON product_recommendations(patient_id);
    CREATE INDEX IF NOT EXISTS idx_recommendations_product ON product_recommendations(product_id);
    `,
  },
  {
    name: "118_referral_tracking",
    sql: `
    -- Referral Tracking System
    CREATE TABLE IF NOT EXISTS referral_sources (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      source_type TEXT NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      fax TEXT,
      email TEXT,
      address TEXT,
      npi TEXT,
      specialty TEXT,
      is_active BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_referral_sources_tenant ON referral_sources(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_referral_sources_type ON referral_sources(source_type);

    CREATE TABLE IF NOT EXISTS inbound_referrals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      referral_number TEXT NOT NULL,
      patient_id TEXT REFERENCES patients(id),
      source_id TEXT REFERENCES referral_sources(id),
      referring_provider_name TEXT,
      referring_provider_npi TEXT,
      referral_date DATE NOT NULL,
      received_date DATE DEFAULT CURRENT_DATE,
      reason_for_referral TEXT,
      diagnosis_codes TEXT[],
      urgency TEXT DEFAULT 'routine',
      authorization_number TEXT,
      authorization_valid_until DATE,
      visits_authorized INTEGER,
      visits_used INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'received',
      scheduled_appointment_id TEXT REFERENCES appointments(id),
      notes TEXT,
      documents TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, referral_number)
    );

    CREATE INDEX IF NOT EXISTS idx_inbound_referrals_patient ON inbound_referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_referrals_source ON inbound_referrals(source_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_referrals_status ON inbound_referrals(status);
    CREATE INDEX IF NOT EXISTS idx_inbound_referrals_date ON inbound_referrals(referral_date);

    CREATE TABLE IF NOT EXISTS outbound_referrals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      referral_number TEXT NOT NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      encounter_id TEXT REFERENCES encounters(id),
      referring_provider_id TEXT REFERENCES providers(id),
      referred_to_name TEXT NOT NULL,
      referred_to_npi TEXT,
      referred_to_specialty TEXT,
      referred_to_phone TEXT,
      referred_to_fax TEXT,
      referred_to_address TEXT,
      referral_date DATE DEFAULT CURRENT_DATE,
      reason_for_referral TEXT NOT NULL,
      diagnosis_codes TEXT[],
      urgency TEXT DEFAULT 'routine',
      clinical_notes TEXT,
      documents_sent TEXT[],
      status TEXT NOT NULL DEFAULT 'pending',
      sent_date DATE,
      sent_method TEXT,
      acknowledged_date DATE,
      appointment_scheduled_date DATE,
      follow_up_received BOOLEAN DEFAULT false,
      follow_up_date DATE,
      follow_up_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, referral_number)
    );

    CREATE INDEX IF NOT EXISTS idx_outbound_referrals_patient ON outbound_referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_referrals_provider ON outbound_referrals(referring_provider_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_referrals_status ON outbound_referrals(status);
    CREATE INDEX IF NOT EXISTS idx_outbound_referrals_date ON outbound_referrals(referral_date);

    CREATE TABLE IF NOT EXISTS referral_communications (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      referral_id TEXT NOT NULL,
      referral_type TEXT NOT NULL CHECK (referral_type IN ('inbound', 'outbound')),
      communication_type TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
      communication_date TIMESTAMPTZ DEFAULT NOW(),
      contact_name TEXT,
      contact_method TEXT,
      subject TEXT,
      content TEXT,
      documents TEXT[],
      sent_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_referral_comms_referral ON referral_communications(referral_id, referral_type);

    CREATE TABLE IF NOT EXISTS referral_statistics (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      source_id TEXT REFERENCES referral_sources(id),
      inbound_total INTEGER DEFAULT 0,
      inbound_converted INTEGER DEFAULT 0,
      outbound_total INTEGER DEFAULT 0,
      outbound_completed INTEGER DEFAULT 0,
      average_time_to_schedule_days DECIMAL(5,2),
      conversion_rate DECIMAL(5,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, period_start, period_end, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_referral_stats_tenant ON referral_statistics(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_referral_stats_period ON referral_statistics(period_start, period_end);
    `,
  },
  {
    name: "082_job_scheduler",
    sql: `
    -- Job Scheduler System for Dermatology CRM
    -- Comprehensive scheduled job management with locking, execution history, and retry logic

    -- ============================================
    -- SCHEDULED JOBS TABLE
    -- ============================================
    -- Stores job definitions including cron expressions and handlers

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id text REFERENCES tenants(id),  -- NULL for system-wide jobs

      -- Job identification
      job_name text NOT NULL UNIQUE,
      job_type text NOT NULL,  -- daily, weekly, monthly, quarterly, custom
      description text,

      -- Scheduling
      cron_expression text NOT NULL,  -- Standard cron format: minute hour day month weekday
      timezone text DEFAULT 'America/New_York',

      -- Handler configuration
      handler_service text NOT NULL,  -- Service class name (e.g., 'birthdayService')
      handler_method text NOT NULL,   -- Method to call (e.g., 'processBirthdays')

      -- Job configuration
      config jsonb DEFAULT '{}',
      -- Example: {"batchSize": 100, "retryAttempts": 3, "timeoutMs": 300000}

      -- State management
      is_active boolean DEFAULT true,
      is_system_job boolean DEFAULT true,  -- System jobs cannot be deleted by users

      -- Execution tracking
      last_run_at timestamptz,
      last_run_status text,  -- success, failed, timeout, skipped
      last_run_duration_ms integer,
      last_error text,
      next_run_at timestamptz,

      -- Retry configuration
      max_retries integer DEFAULT 3,
      retry_delay_ms integer DEFAULT 60000,  -- 1 minute default
      current_retry_count integer DEFAULT 0,

      -- Statistics
      total_runs integer DEFAULT 0,
      successful_runs integer DEFAULT 0,
      failed_runs integer DEFAULT 0,

      -- Metadata
      tags text[] DEFAULT '{}',
      priority integer DEFAULT 5,  -- 1 (highest) to 10 (lowest)

      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by text,
      updated_by text
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_name ON scheduled_jobs(job_name);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs(job_type);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_active ON scheduled_jobs(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tenant ON scheduled_jobs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tags ON scheduled_jobs USING gin(tags);

    -- ============================================
    -- JOB EXECUTIONS TABLE
    -- ============================================
    -- Detailed history of job executions

    CREATE TABLE IF NOT EXISTS job_executions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

      -- Execution timing
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      duration_ms integer,

      -- Status
      status text NOT NULL DEFAULT 'running',  -- running, success, failed, timeout, cancelled

      -- Results
      result jsonb DEFAULT '{}',
      -- Example: {"processedCount": 150, "sentEmails": 145, "skipped": 5}

      -- Error handling
      error_message text,
      error_stack text,
      error_code text,

      -- Execution context
      triggered_by text DEFAULT 'scheduler',  -- scheduler, manual, retry, api
      triggered_by_user text,

      -- Resource usage (optional tracking)
      memory_usage_mb numeric(10,2),

      -- Retry information
      retry_number integer DEFAULT 0,
      parent_execution_id text REFERENCES job_executions(id),

      -- Host information (for distributed environments)
      host_name text,
      process_id text,

      created_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
    CREATE INDEX IF NOT EXISTS idx_job_executions_started ON job_executions(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_executions_job_started ON job_executions(job_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_executions_running ON job_executions(status) WHERE status = 'running';

    -- ============================================
    -- JOB LOCKS TABLE
    -- ============================================
    -- Prevents concurrent execution of the same job

    CREATE TABLE IF NOT EXISTS job_locks (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      job_name text NOT NULL UNIQUE,

      -- Lock information
      locked_by text NOT NULL,  -- Instance/process identifier
      locked_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,

      -- Execution reference
      execution_id text REFERENCES job_executions(id),

      -- Heartbeat for long-running jobs
      last_heartbeat timestamptz DEFAULT now(),

      created_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_job_locks_name ON job_locks(job_name);
    CREATE INDEX IF NOT EXISTS idx_job_locks_expires ON job_locks(expires_at);

    -- ============================================
    -- JOB DEPENDENCIES TABLE
    -- ============================================
    -- Define job dependencies (job B runs after job A completes)

    CREATE TABLE IF NOT EXISTS job_dependencies (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
      depends_on_job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

      -- Dependency conditions
      require_success boolean DEFAULT true,  -- Only trigger if dependency succeeded
      delay_ms integer DEFAULT 0,  -- Delay after dependency completes

      created_at timestamptz DEFAULT now(),

      UNIQUE(job_id, depends_on_job_id),
      CHECK(job_id != depends_on_job_id)  -- Prevent self-reference
    );

    CREATE INDEX IF NOT EXISTS idx_job_dependencies_job ON job_dependencies(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_dependencies_depends ON job_dependencies(depends_on_job_id);

    -- ============================================
    -- JOB ALERTS TABLE
    -- ============================================
    -- Configure alerts for job failures or anomalies

    CREATE TABLE IF NOT EXISTS job_alerts (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      job_id text REFERENCES scheduled_jobs(id) ON DELETE CASCADE,  -- NULL for global alerts

      alert_type text NOT NULL,  -- failure, timeout, threshold, success_rate

      -- Alert configuration
      config jsonb NOT NULL DEFAULT '{}',
      -- Example for threshold: {"metric": "duration_ms", "operator": ">", "value": 300000}
      -- Example for success_rate: {"window_hours": 24, "min_success_rate": 0.9}

      -- Notification settings
      notify_email text[],
      notify_webhook text,
      notify_slack_channel text,

      -- State
      is_active boolean DEFAULT true,
      last_triggered_at timestamptz,

      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_job_alerts_job ON job_alerts(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_alerts_active ON job_alerts(is_active) WHERE is_active = true;

    -- ============================================
    -- HELPER FUNCTIONS
    -- ============================================

    -- Function to acquire a job lock
    CREATE OR REPLACE FUNCTION acquire_job_lock(
      p_job_name text,
      p_locked_by text,
      p_lock_duration_ms integer DEFAULT 300000  -- 5 minutes default
    )
    RETURNS boolean AS $$
    DECLARE
      v_acquired boolean;
    BEGIN
      -- Try to insert new lock or update expired lock
      INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
      VALUES (
        p_job_name,
        p_locked_by,
        now(),
        now() + (p_lock_duration_ms || ' milliseconds')::interval
      )
      ON CONFLICT (job_name) DO UPDATE
      SET locked_by = p_locked_by,
          locked_at = now(),
          expires_at = now() + (p_lock_duration_ms || ' milliseconds')::interval,
          last_heartbeat = now()
      WHERE job_locks.expires_at < now();  -- Only update if lock expired

      -- Check if we got the lock
      SELECT locked_by = p_locked_by INTO v_acquired
      FROM job_locks
      WHERE job_name = p_job_name;

      RETURN COALESCE(v_acquired, false);
    END;
    $$ LANGUAGE plpgsql;

    -- Function to release a job lock
    CREATE OR REPLACE FUNCTION release_job_lock(
      p_job_name text,
      p_locked_by text
    )
    RETURNS boolean AS $$
    DECLARE
      v_deleted integer;
    BEGIN
      DELETE FROM job_locks
      WHERE job_name = p_job_name
        AND locked_by = p_locked_by;

      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      RETURN v_deleted > 0;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to extend lock (heartbeat)
    CREATE OR REPLACE FUNCTION extend_job_lock(
      p_job_name text,
      p_locked_by text,
      p_extend_ms integer DEFAULT 300000
    )
    RETURNS boolean AS $$
    DECLARE
      v_updated integer;
    BEGIN
      UPDATE job_locks
      SET expires_at = now() + (p_extend_ms || ' milliseconds')::interval,
          last_heartbeat = now()
      WHERE job_name = p_job_name
        AND locked_by = p_locked_by;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      RETURN v_updated > 0;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to get due jobs
    CREATE OR REPLACE FUNCTION get_due_jobs(
      p_limit integer DEFAULT 10
    )
    RETURNS TABLE(
      id text,
      job_name text,
      job_type text,
      cron_expression text,
      handler_service text,
      handler_method text,
      config jsonb,
      next_run_at timestamptz,
      priority integer
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        sj.id,
        sj.job_name,
        sj.job_type,
        sj.cron_expression,
        sj.handler_service,
        sj.handler_method,
        sj.config,
        sj.next_run_at,
        sj.priority
      FROM scheduled_jobs sj
      LEFT JOIN job_locks jl ON sj.job_name = jl.job_name AND jl.expires_at > now()
      WHERE sj.is_active = true
        AND sj.next_run_at <= now()
        AND jl.id IS NULL  -- Not locked
      ORDER BY sj.priority ASC, sj.next_run_at ASC
      LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to get job statistics
    CREATE OR REPLACE FUNCTION get_job_statistics(
      p_job_id text DEFAULT NULL,
      p_hours integer DEFAULT 24
    )
    RETURNS TABLE(
      job_id text,
      job_name text,
      total_executions bigint,
      successful_executions bigint,
      failed_executions bigint,
      avg_duration_ms numeric,
      min_duration_ms integer,
      max_duration_ms integer,
      success_rate numeric
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        sj.id as job_id,
        sj.job_name,
        COUNT(je.id) as total_executions,
        COUNT(je.id) FILTER (WHERE je.status = 'success') as successful_executions,
        COUNT(je.id) FILTER (WHERE je.status = 'failed') as failed_executions,
        AVG(je.duration_ms)::numeric as avg_duration_ms,
        MIN(je.duration_ms) as min_duration_ms,
        MAX(je.duration_ms) as max_duration_ms,
        CASE
          WHEN COUNT(je.id) > 0 THEN
            (COUNT(je.id) FILTER (WHERE je.status = 'success')::numeric / COUNT(je.id)::numeric * 100)
          ELSE 0
        END as success_rate
      FROM scheduled_jobs sj
      LEFT JOIN job_executions je ON sj.id = je.job_id
        AND je.started_at >= now() - (p_hours || ' hours')::interval
      WHERE (p_job_id IS NULL OR sj.id = p_job_id)
      GROUP BY sj.id, sj.job_name
      ORDER BY sj.job_name;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to clean up old executions
    CREATE OR REPLACE FUNCTION cleanup_job_executions(
      p_retention_days integer DEFAULT 30
    )
    RETURNS integer AS $$
    DECLARE
      v_deleted integer;
    BEGIN
      DELETE FROM job_executions
      WHERE started_at < now() - (p_retention_days || ' days')::interval
        AND status != 'running';

      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      RETURN v_deleted;
    END;
    $$ LANGUAGE plpgsql;

    -- Function to clean up expired locks
    CREATE OR REPLACE FUNCTION cleanup_expired_locks()
    RETURNS integer AS $$
    DECLARE
      v_deleted integer;
    BEGIN
      DELETE FROM job_locks
      WHERE expires_at < now();

      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      RETURN v_deleted;
    END;
    $$ LANGUAGE plpgsql;

    -- ============================================
    -- TRIGGER FOR UPDATED_AT
    -- ============================================

    CREATE OR REPLACE FUNCTION update_scheduled_jobs_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS scheduled_jobs_updated_at ON scheduled_jobs;
    CREATE TRIGGER scheduled_jobs_updated_at
      BEFORE UPDATE ON scheduled_jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_scheduled_jobs_updated_at();

    -- ============================================
    -- SEED DEFAULT SCHEDULED JOBS
    -- ============================================

    -- Daily Jobs (6:00 AM - 11:00 AM)
    INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
    VALUES
      ('daily-birthday-processing', 'daily', 'Process and send birthday messages to patients', '0 6 * * *', 'patientEngagementService', 'processBirthdays', '{"batchSize": 100, "messageType": "birthday"}', 3, ARRAY['patient-engagement', 'messaging']),
      ('daily-anniversary-processing', 'daily', 'Process and send care anniversary messages', '0 6 * * *', 'patientEngagementService', 'processAnniversaries', '{"batchSize": 100, "messageType": "anniversary"}', 3, ARRAY['patient-engagement', 'messaging']),
      ('daily-appointment-reminders', 'daily', 'Send 24-hour appointment reminder messages', '0 7 * * *', 'appointmentReminderService', 'sendDailyReminders', '{"hoursAhead": 24, "channels": ["sms", "email"]}', 2, ARRAY['appointments', 'messaging', 'critical']),
      ('daily-credential-expiration-check', 'daily', 'Check for expiring provider credentials and certifications', '0 8 * * *', 'credentialService', 'checkExpirations', '{"daysThreshold": 30, "notifyAdmin": true}', 4, ARRAY['compliance', 'credentials']),
      ('daily-denial-processing', 'daily', 'Process and categorize claim denials for follow-up', '0 9 * * *', 'claimDenialService', 'processDenials', '{"autoCategorizе": true, "prioritizeByAmount": true}', 3, ARRAY['billing', 'claims', 'rcm']),
      ('daily-expiration-alerts', 'daily', 'Check inventory and medication expirations', '0 8 * * *', 'inventoryService', 'checkExpirations', '{"daysThreshold": 90, "notifyTypes": ["medication", "injectable", "supply"]}', 4, ARRAY['inventory', 'compliance']),
      ('daily-stalled-referral-alerts', 'daily', 'Flag referrals that have been pending for more than 5 days', '0 9 * * *', 'referralService', 'checkStalledReferrals', '{"stalledDays": 5, "notifyProvider": true}', 4, ARRAY['referrals', 'care-coordination']),
      ('daily-care-gap-identification', 'daily', 'Identify quality measure care gaps for patient outreach', '0 10 * * *', 'qualityMeasureService', 'identifyCareGaps', '{"measureTypes": ["preventive", "chronic"], "outreachEnabled": true}', 3, ARRAY['quality', 'mips', 'care-gaps']),
      ('daily-payment-plan-reminders', 'daily', 'Send reminders for upcoming payment plan installments', '0 10 * * *', 'paymentPlanService', 'sendReminders', '{"daysBeforeDue": 3, "channels": ["sms", "email"]}', 4, ARRAY['billing', 'payments', 'messaging']),
      ('daily-adherence-reminders', 'daily', 'Send treatment adherence and medication reminders', '0 9 * * *', 'adherenceService', 'sendReminders', '{"treatmentTypes": ["phototherapy", "biologic", "topical"]}', 3, ARRAY['patient-care', 'adherence', 'messaging']),
      ('daily-survey-processing', 'daily', 'Process and send scheduled patient satisfaction surveys', '0 11 * * *', 'surveyService', 'processScheduledSurveys', '{"surveyTypes": ["post_visit", "nps", "satisfaction"]}', 5, ARRAY['patient-engagement', 'surveys'])
    ON CONFLICT (job_name) DO UPDATE SET
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      handler_service = EXCLUDED.handler_service,
      handler_method = EXCLUDED.handler_method,
      config = EXCLUDED.config,
      priority = EXCLUDED.priority,
      tags = EXCLUDED.tags,
      updated_at = now();

    -- Weekly Jobs
    INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
    VALUES
      ('weekly-overtime-check', 'weekly', 'Calculate overtime risks for staff scheduling', '0 8 * * 1', 'staffSchedulingService', 'calculateOvertimeRisks', '{"thresholdHours": 35, "notifyManagers": true}', 4, ARRAY['staff', 'scheduling', 'payroll']),
      ('weekly-ar-aging-report', 'weekly', 'Generate accounts receivable aging report', '0 7 * * 1', 'arService', 'generateAgingReport', '{"agingBuckets": [30, 60, 90, 120], "includeDetails": true}', 3, ARRAY['billing', 'reports', 'rcm']),
      ('weekly-no-show-followup', 'weekly', 'Follow up with patients who no-showed last week', '0 9 * * 1', 'appointmentService', 'processNoShowFollowups', '{"lookbackDays": 7, "excludeRescheduled": true}', 4, ARRAY['appointments', 'patient-engagement']),
      ('weekly-recall-campaigns', 'weekly', 'Process recall outreach for overdue patients', '0 9 * * 2', 'recallService', 'processRecallCampaigns', '{"recallTypes": ["annual_exam", "skin_check", "followup"], "channels": ["sms", "email", "phone"]}', 3, ARRAY['recalls', 'patient-engagement', 'messaging']),
      ('weekly-waitlist-processing', 'daily', 'Match waitlist patients to available appointment openings', '0 18 * * *', 'waitlistService', 'processWaitlistMatches', '{"lookAheadDays": 14, "autoOffer": true}', 3, ARRAY['waitlist', 'appointments', 'scheduling'])
    ON CONFLICT (job_name) DO UPDATE SET
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      handler_service = EXCLUDED.handler_service,
      handler_method = EXCLUDED.handler_method,
      config = EXCLUDED.config,
      priority = EXCLUDED.priority,
      tags = EXCLUDED.tags,
      updated_at = now();

    -- Monthly Jobs (1st of month)
    INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
    VALUES
      ('monthly-mips-report', 'monthly', 'Generate MIPS progress and performance report', '0 8 1 * *', 'mipsService', 'generateMonthlyReport', '{"includeGapAnalysis": true, "benchmarkComparison": true}', 2, ARRAY['quality', 'mips', 'reports', 'compliance']),
      ('monthly-training-compliance', 'monthly', 'Generate staff training compliance report', '0 9 1 * *', 'trainingService', 'generateComplianceReport', '{"includeExpiring": true, "notifyNonCompliant": true}', 3, ARRAY['compliance', 'training', 'staff', 'reports']),
      ('monthly-revenue-analytics', 'monthly', 'Generate monthly revenue summary and analytics', '0 7 1 * *', 'revenueService', 'generateMonthlyAnalytics', '{"compareLastMonth": true, "compareLastYear": true}', 2, ARRAY['billing', 'revenue', 'reports', 'analytics']),
      ('monthly-patient-engagement-report', 'monthly', 'Generate patient engagement metrics report', '0 10 1 * *', 'engagementService', 'generateMonthlyReport', '{"metrics": ["portal_usage", "message_response", "survey_completion"]}', 4, ARRAY['patient-engagement', 'reports', 'analytics']),
      ('monthly-loyalty-tier-evaluation', 'monthly', 'Evaluate and update patient loyalty program tiers', '0 6 1 * *', 'loyaltyService', 'evaluateTiers', '{"autoUpgrade": true, "notifyChanges": true}', 5, ARRAY['patient-engagement', 'loyalty', 'cosmetic'])
    ON CONFLICT (job_name) DO UPDATE SET
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      handler_service = EXCLUDED.handler_service,
      handler_method = EXCLUDED.handler_method,
      config = EXCLUDED.config,
      priority = EXCLUDED.priority,
      tags = EXCLUDED.tags,
      updated_at = now();

    -- Quarterly Jobs (1st of quarter months: Jan, Apr, Jul, Oct)
    INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
    VALUES
      ('quarterly-mips-submission-prep', 'quarterly', 'Prepare MIPS data for quarterly submission review', '0 8 1 1,4,7,10 *', 'mipsService', 'prepareQuarterlySubmission', '{"validateData": true, "generatePreview": true}', 1, ARRAY['quality', 'mips', 'compliance', 'critical']),
      ('quarterly-contract-review', 'quarterly', 'Review payer contracts for renewal and renegotiation', '0 9 1 1,4,7,10 *', 'contractService', 'reviewContracts', '{"expiringWithinDays": 90, "notifyAdmin": true}', 3, ARRAY['billing', 'contracts', 'payers'])
    ON CONFLICT (job_name) DO UPDATE SET
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      handler_service = EXCLUDED.handler_service,
      handler_method = EXCLUDED.handler_method,
      config = EXCLUDED.config,
      priority = EXCLUDED.priority,
      tags = EXCLUDED.tags,
      updated_at = now();

    -- System Maintenance Jobs
    INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
    VALUES
      ('system-cleanup-executions', 'daily', 'Clean up old job execution records', '0 2 * * *', 'jobSchedulerService', 'cleanupExecutions', '{"retentionDays": 30}', 8, ARRAY['system', 'maintenance']),
      ('system-cleanup-locks', 'custom', 'Clean up expired job locks', '*/15 * * * *', 'jobSchedulerService', 'cleanupExpiredLocks', '{}', 9, ARRAY['system', 'maintenance']),
      ('system-health-check', 'custom', 'System health check and monitoring', '*/5 * * * *', 'healthService', 'performHealthCheck', '{"checkDatabase": true, "checkServices": true}', 1, ARRAY['system', 'monitoring', 'critical'])
    ON CONFLICT (job_name) DO UPDATE SET
      description = EXCLUDED.description,
      cron_expression = EXCLUDED.cron_expression,
      handler_service = EXCLUDED.handler_service,
      handler_method = EXCLUDED.handler_method,
      config = EXCLUDED.config,
      priority = EXCLUDED.priority,
      tags = EXCLUDED.tags,
      updated_at = now();

    -- ============================================
    -- VIEWS FOR REPORTING
    -- ============================================

    -- Job dashboard view
    CREATE OR REPLACE VIEW v_job_dashboard AS
    SELECT
      sj.id,
      sj.job_name,
      sj.job_type,
      sj.description,
      sj.is_active,
      sj.priority,
      sj.tags,
      sj.last_run_at,
      sj.last_run_status,
      sj.last_run_duration_ms,
      sj.next_run_at,
      sj.total_runs,
      sj.successful_runs,
      sj.failed_runs,
      CASE
        WHEN sj.total_runs > 0 THEN
          ROUND((sj.successful_runs::numeric / sj.total_runs::numeric) * 100, 2)
        ELSE 0
      END as success_rate,
      jl.locked_by IS NOT NULL as is_locked,
      jl.locked_at,
      jl.expires_at as lock_expires_at
    FROM scheduled_jobs sj
    LEFT JOIN job_locks jl ON sj.job_name = jl.job_name AND jl.expires_at > now()
    ORDER BY sj.priority ASC, sj.next_run_at ASC;

    -- Recent executions view
    CREATE OR REPLACE VIEW v_recent_job_executions AS
    SELECT
      je.id,
      je.job_id,
      sj.job_name,
      sj.job_type,
      je.started_at,
      je.completed_at,
      je.duration_ms,
      je.status,
      je.error_message,
      je.triggered_by,
      je.triggered_by_user,
      je.result
    FROM job_executions je
    JOIN scheduled_jobs sj ON je.job_id = sj.id
    WHERE je.started_at >= now() - interval '7 days'
    ORDER BY je.started_at DESC;

    -- ============================================
    -- COMMENTS
    -- ============================================

    COMMENT ON TABLE scheduled_jobs IS 'Stores scheduled job definitions with cron expressions and handler configuration';
    COMMENT ON TABLE job_executions IS 'Detailed execution history for all scheduled jobs';
    COMMENT ON TABLE job_locks IS 'Distributed locking mechanism to prevent concurrent job execution';
    COMMENT ON TABLE job_dependencies IS 'Defines execution dependencies between jobs';
    COMMENT ON TABLE job_alerts IS 'Alert configuration for job failures and anomalies';

    COMMENT ON FUNCTION acquire_job_lock IS 'Attempts to acquire a distributed lock for a job, returns true if successful';
    COMMENT ON FUNCTION release_job_lock IS 'Releases a previously acquired job lock';
    COMMENT ON FUNCTION extend_job_lock IS 'Extends the expiration time of an existing lock (heartbeat)';
    COMMENT ON FUNCTION get_due_jobs IS 'Returns jobs that are due for execution and not currently locked';
    COMMENT ON FUNCTION get_job_statistics IS 'Returns execution statistics for jobs within a time window';
    `,
  },
  {
    name: "119_recalls_tables",
    sql: `
    -- Recall Campaigns Table
    CREATE TABLE IF NOT EXISTS recall_campaigns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      recall_type TEXT,
      interval_months INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add missing columns to recall_campaigns if table existed
    ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS recall_type TEXT;
    ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS interval_months INTEGER;
    ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

    -- Patient Recalls Table
    CREATE TABLE IF NOT EXISTS patient_recalls (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      campaign_id TEXT REFERENCES recall_campaigns(id) ON DELETE SET NULL,
      due_date DATE,
      status TEXT DEFAULT 'pending',
      last_contact_date DATE,
      contact_method TEXT,
      notes TEXT,
      appointment_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add missing columns to patient_recalls if table existed
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS campaign_id TEXT;
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS last_contact_date DATE;
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS contact_method TEXT;
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS appointment_id TEXT;

    -- Reminder Log Table (HIPAA audit trail)
    CREATE TABLE IF NOT EXISTS reminder_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      recall_id TEXT,
      reminder_type TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      delivery_status TEXT DEFAULT 'pending',
      message_content TEXT,
      sent_by TEXT,
      error_message TEXT
    );

    -- Patient Communication Preferences
    CREATE TABLE IF NOT EXISTS patient_communication_preferences (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      allow_email BOOLEAN DEFAULT true,
      allow_sms BOOLEAN DEFAULT true,
      allow_phone BOOLEAN DEFAULT true,
      allow_mail BOOLEAN DEFAULT true,
      preferred_method TEXT DEFAULT 'email',
      opted_out BOOLEAN DEFAULT false,
      opted_out_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes for performance (only on columns that exist)
    CREATE INDEX IF NOT EXISTS idx_recall_campaigns_tenant ON recall_campaigns(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_patient_recalls_tenant ON patient_recalls(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_reminder_log_tenant ON reminder_log(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_patient_comm_prefs_tenant ON patient_communication_preferences(tenant_id);
    `,
  },
  {
    name: "120_analytics_cache",
    sql: `
    -- Analytics Cache Table for dermatology metrics, no-show risk, YoY comparison
    CREATE TABLE IF NOT EXISTS analytics_cache (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      cache_key TEXT NOT NULL,
      data JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Index for cache lookup
    CREATE INDEX IF NOT EXISTS idx_analytics_cache_tenant_key ON analytics_cache(tenant_id, cache_key);
    CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires ON analytics_cache(expires_at);

    -- Unique constraint to prevent duplicate cache entries
    CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_cache_unique ON analytics_cache(tenant_id, cache_key);
    `,
  },
  {
    name: "121_procedures_lesion_tracking",
    sql: `
    -- Procedures table for dermatology analytics
    CREATE TABLE IF NOT EXISTS procedures (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      encounter_id TEXT,
      procedure_type TEXT,
      procedure_code TEXT,
      description TEXT,
      category TEXT DEFAULT 'medical',
      pathology_result TEXT,
      performed_by TEXT,
      performed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_procedures_tenant ON procedures(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_procedures_patient ON procedures(patient_id);
    CREATE INDEX IF NOT EXISTS idx_procedures_type ON procedures(procedure_type);

    -- Lesion tracking table for dermatology
    CREATE TABLE IF NOT EXISTS lesion_tracking (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
      body_location TEXT,
      description TEXT,
      status TEXT DEFAULT 'new',
      risk_level TEXT,
      first_observed_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_lesion_tracking_tenant ON lesion_tracking(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_lesion_tracking_patient ON lesion_tracking(patient_id);
    CREATE INDEX IF NOT EXISTS idx_lesion_tracking_status ON lesion_tracking(status);

    -- Add icd_code to encounter_diagnoses if missing
    ALTER TABLE encounter_diagnoses ADD COLUMN IF NOT EXISTS icd_code TEXT;
    `,
  },
  {
    name: "122_ssn_plaintext_lockdown",
    sql: `
    -- Ensure SSN data is stored only as encrypted + last4 fields.
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_last4 TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_encrypted TEXT;

    -- Backfill last4 from legacy plaintext SSN (if any), then wipe plaintext values.
    UPDATE patients
    SET ssn_last4 = COALESCE(
      NULLIF(ssn_last4, ''),
      NULLIF(RIGHT(REGEXP_REPLACE(ssn, '\\D', '', 'g'), 4), '')
    ),
    ssn = NULL
    WHERE ssn IS NOT NULL AND ssn <> '';

    -- Block future plaintext writes to patients.ssn.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'patients_ssn_plaintext_forbidden'
          AND conrelid = 'patients'::regclass
      ) THEN
        ALTER TABLE patients
          ADD CONSTRAINT patients_ssn_plaintext_forbidden
          CHECK (ssn IS NULL);
      END IF;
    END $$;
    `,
  },
  {
    name: "123_dual_role_access",
    sql: `
    -- Support primary + secondary roles for tighter least-privilege and owner dual-role accounts.
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS secondary_roles TEXT[] NOT NULL DEFAULT '{}'::text[];

    -- Ensure primary role is never duplicated in secondary role list.
    UPDATE users
    SET secondary_roles = COALESCE(
      (
        SELECT ARRAY_AGG(DISTINCT sr)
        FROM UNNEST(COALESCE(secondary_roles, '{}'::text[])) AS sr
        WHERE sr IS NOT NULL
          AND BTRIM(sr) <> ''
          AND sr <> role
      ),
      '{}'::text[]
    );
    `,
  },
  {
    name: "124_visit_summaries_schema",
    sql: `
    -- Canonical schema for provider + ambient generated visit summaries.
    CREATE TABLE IF NOT EXISTS visit_summaries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
      ambient_note_id TEXT REFERENCES ambient_generated_notes(id) ON DELETE SET NULL,
      visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      provider_name TEXT,
      summary_text TEXT,
      symptoms_discussed TEXT,
      diagnosis_shared TEXT,
      treatment_plan TEXT,
      next_steps TEXT,
      follow_up_date TIMESTAMPTZ,
      chief_complaint TEXT,
      diagnoses JSONB,
      procedures JSONB,
      medications JSONB,
      follow_up_instructions TEXT,
      next_appointment_date TIMESTAMPTZ,
      generated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_released BOOLEAN NOT NULL DEFAULT FALSE,
      released_at TIMESTAMPTZ,
      released_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      shared_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Backfill/repair columns for environments where table existed with partial schema.
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS ambient_note_id TEXT REFERENCES ambient_generated_notes(id) ON DELETE SET NULL;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS visit_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS provider_name TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS summary_text TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS symptoms_discussed TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS diagnosis_shared TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS treatment_plan TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS next_steps TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMPTZ;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS chief_complaint TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS diagnoses JSONB;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS procedures JSONB;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS medications JSONB;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS follow_up_instructions TEXT;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS next_appointment_date TIMESTAMPTZ;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS generated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS released_by TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE visit_summaries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_visit_date
      ON visit_summaries(tenant_id, visit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_patient
      ON visit_summaries(tenant_id, patient_id, visit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_encounter
      ON visit_summaries(tenant_id, encounter_id);
    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_provider
      ON visit_summaries(tenant_id, provider_id);
    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_released
      ON visit_summaries(tenant_id, is_released);
    CREATE INDEX IF NOT EXISTS idx_visit_summaries_tenant_ambient_note
      ON visit_summaries(tenant_id, ambient_note_id);
    `,
  },
  {
    name: "125_appointment_lifecycle_timestamps",
    sql: `
    -- Front desk and office flow lifecycle fields for appointment progression.
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS roomed_at TIMESTAMPTZ;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_arrived_at
      ON appointments(tenant_id, arrived_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_roomed_at
      ON appointments(tenant_id, roomed_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_completed_at
      ON appointments(tenant_id, completed_at);
    `,
  },
  {
    name: "126_handout_template_metadata",
    sql: `
    ALTER TABLE patient_handouts
      ADD COLUMN IF NOT EXISTS instruction_type TEXT NOT NULL DEFAULT 'general';

    ALTER TABLE patient_handouts
      ADD COLUMN IF NOT EXISTS template_key TEXT;

    ALTER TABLE patient_handouts
      ADD COLUMN IF NOT EXISTS print_disclaimer TEXT;

    ALTER TABLE patient_handouts
      ADD COLUMN IF NOT EXISTS is_system_template BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE INDEX IF NOT EXISTS idx_handouts_instruction_type
      ON patient_handouts(tenant_id, instruction_type);

    CREATE INDEX IF NOT EXISTS idx_handouts_template_key
      ON patient_handouts(tenant_id, template_key);
    `,
  },
  {
    name: "127_inventory_usage_pricing_and_derm_topicals",
    sql: `
    ALTER TABLE IF EXISTS inventory_usage
      ADD COLUMN IF NOT EXISTS sell_price_cents INTEGER;

    ALTER TABLE IF EXISTS inventory_usage
      ADD COLUMN IF NOT EXISTS given_as_sample BOOLEAN NOT NULL DEFAULT FALSE;

    DO $$
    BEGIN
      IF to_regclass('public.inventory_usage') IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'inventory_usage_sell_price_nonnegative'
            AND conrelid = 'inventory_usage'::regclass
        ) THEN
          ALTER TABLE inventory_usage
            ADD CONSTRAINT inventory_usage_sell_price_nonnegative
            CHECK (sell_price_cents IS NULL OR sell_price_cents >= 0);
        END IF;

        CREATE INDEX IF NOT EXISTS idx_inventory_usage_tenant_sample
          ON inventory_usage(tenant_id, given_as_sample);

        CREATE INDEX IF NOT EXISTS idx_inventory_usage_tenant_encounter_used_at
          ON inventory_usage(tenant_id, encounter_id, used_at DESC);
      END IF;
    END $$;

    DO $$
    DECLARE
      v_tenant_id TEXT;
      v_created_by TEXT;
      seed_row RECORD;
    BEGIN
      IF to_regclass('public.inventory_items') IS NULL THEN
        RETURN;
      END IF;

      FOR v_tenant_id IN SELECT id FROM tenants LOOP
        SELECT id
        INTO v_created_by
        FROM users
        WHERE tenant_id = v_tenant_id
        ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at
        LIMIT 1;

        IF v_created_by IS NULL THEN
          CONTINUE;
        END IF;

        FOR seed_row IN
          SELECT *
          FROM (
            VALUES
              ('DERM-SMP-CLOB-005', 'Clobetasol 0.05% Cream (Sample)', 'medication', 'High-potency topical corticosteroid sample', 140, 40, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-TRIAM-01', 'Triamcinolone 0.1% Ointment (Sample)', 'medication', 'Mid-potency corticosteroid ointment sample', 160, 50, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-HC-025', 'Hydrocortisone 2.5% Cream (Sample)', 'medication', 'Low-potency corticosteroid for sensitive areas', 120, 35, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-DESON-005', 'Desonide 0.05% Cream (Sample)', 'medication', 'Low-potency steroid sample for face/folds', 120, 35, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-TACRO-01', 'Tacrolimus 0.1% Ointment (Sample)', 'medication', 'Topical calcineurin inhibitor sample', 110, 30, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-PIMEC-1', 'Pimecrolimus 1% Cream (Sample)', 'medication', 'Topical calcineurin inhibitor cream sample', 110, 30, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-TRET-025', 'Tretinoin 0.025% Cream (Sample)', 'medication', 'Topical retinoid acne/photodamage sample', 140, 40, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-TRET-05', 'Tretinoin 0.05% Cream (Sample)', 'medication', 'Topical retinoid higher-strength sample', 120, 35, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-ADAP-03', 'Adapalene 0.3% Gel (Sample)', 'medication', 'Topical retinoid gel sample', 120, 35, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-BPO-5W', 'Benzoyl Peroxide 5% Wash (Sample)', 'medication', 'Acne antibacterial wash sample', 150, 45, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-CLIND-1L', 'Clindamycin 1% Lotion (Sample)', 'medication', 'Topical antibiotic lotion sample', 130, 40, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-KETO-2C', 'Ketoconazole 2% Cream (Sample)', 'medication', 'Topical antifungal cream sample', 130, 40, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-CICLO-077', 'Ciclopirox 0.77% Gel (Sample)', 'medication', 'Topical antifungal gel sample', 110, 30, 0, 'Derm Rep Program', 'Sample Closet'),
              ('DERM-SMP-CERAVE-CRM', 'CeraVe Moisturizing Cream (Sample)', 'supply', 'Barrier-repair moisturizer sample', 220, 60, 65, 'L''Oreal Dermatological', 'Sample Closet'),
              ('DERM-SMP-VANI-LOTION', 'Vanicream Moisturizing Lotion (Sample)', 'supply', 'Fragrance-free emollient lotion sample', 200, 55, 60, 'Pharmaceutical Specialties', 'Sample Closet'),
              ('DERM-SMP-ELTA-UV46', 'EltaMD UV Clear SPF 46 (Sample)', 'supply', 'Dermatology sunscreen sample', 180, 50, 80, 'EltaMD', 'Sample Closet'),
              ('DERM-SMP-MIN-SPF50', 'Mineral Sunscreen SPF 50 (Sample)', 'supply', 'Broad-spectrum mineral sunscreen sample', 180, 50, 85, 'Derm Rep Program', 'Sample Closet')
          ) AS seeded(
            sku,
            name,
            category,
            description,
            quantity,
            reorder_level,
            unit_cost_cents,
            supplier,
            location
          )
        LOOP
          UPDATE inventory_items
          SET
            name = seed_row.name,
            category = seed_row.category,
            sku = COALESCE(NULLIF(inventory_items.sku, ''), seed_row.sku),
            description = seed_row.description,
            quantity = GREATEST(inventory_items.quantity, seed_row.quantity),
            reorder_level = GREATEST(inventory_items.reorder_level, seed_row.reorder_level),
            unit_cost_cents = seed_row.unit_cost_cents,
            supplier = COALESCE(NULLIF(inventory_items.supplier, ''), seed_row.supplier),
            location = COALESCE(NULLIF(inventory_items.location, ''), seed_row.location),
            updated_at = NOW()
          WHERE inventory_items.tenant_id = v_tenant_id
            AND (
              inventory_items.sku = seed_row.sku OR
              (LOWER(inventory_items.name) = LOWER(seed_row.name) AND inventory_items.category = seed_row.category)
            );

          IF NOT FOUND THEN
            INSERT INTO inventory_items (
              tenant_id,
              name,
              category,
              sku,
              description,
              quantity,
              reorder_level,
              unit_cost_cents,
              supplier,
              location,
              created_by
            )
            VALUES (
              v_tenant_id,
              seed_row.name,
              seed_row.category,
              seed_row.sku,
              seed_row.description,
              seed_row.quantity,
              seed_row.reorder_level,
              seed_row.unit_cost_cents,
              seed_row.supplier,
              seed_row.location,
              v_created_by
            );
          END IF;
        END LOOP;
      END LOOP;
    END $$;
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
