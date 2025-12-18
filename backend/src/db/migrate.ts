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
