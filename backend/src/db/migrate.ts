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
