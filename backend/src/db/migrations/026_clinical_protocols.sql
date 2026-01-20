-- Clinical Protocols System for Dermatology Practice
-- Supports treatment algorithms, procedure protocols, and cosmetic guidelines

create table if not exists protocols (
  id text primary key,
  tenant_id text not null references tenants(id),
  name text not null,
  category text not null check (category in ('medical', 'procedure', 'cosmetic', 'administrative')),
  type text not null, -- e.g., 'acne_treatment', 'psoriasis_algorithm', 'botox_guide'
  description text,
  indication text, -- When to use this protocol
  contraindications text, -- When NOT to use this protocol
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

-- Protocol steps define the sequential or decision-tree based steps
create table if not exists protocol_steps (
  id text primary key,
  tenant_id text not null references tenants(id),
  protocol_id text not null references protocols(id) on delete cascade,
  step_number int not null,
  title text not null,
  description text,
  action_type text not null check (action_type in ('assessment', 'treatment', 'medication', 'procedure', 'lab_order', 'imaging', 'referral', 'patient_instruction', 'decision_point', 'observation')),

  -- For medication steps
  medication_name text,
  medication_dosage text,
  medication_frequency text,
  medication_duration text,

  -- For procedure steps
  procedure_code text, -- CPT code
  procedure_instructions text,

  -- For lab/imaging steps
  order_codes text[], -- Array of order codes

  -- For decision points
  decision_criteria text, -- JSON or text describing the decision logic

  -- Navigation
  next_step_id text references protocol_steps(id), -- Linear progression
  conditional_next_steps jsonb, -- For decision trees: [{"condition": "...", "next_step_id": "..."}]

  -- Timing
  timing text, -- e.g., "Week 0", "Week 4-8", "After assessment"
  duration_days int,

  -- Safety and monitoring
  monitoring_required text,
  side_effects text,
  warnings text,

  created_at timestamptz default now()
);

create index if not exists idx_protocol_steps_protocol on protocol_steps(protocol_id, step_number);

-- Protocol order sets - pre-configured orders that can be applied
create table if not exists protocol_order_sets (
  id text primary key,
  tenant_id text not null references tenants(id),
  protocol_id text not null references protocols(id) on delete cascade,
  name text not null,
  description text,
  order_type text not null check (order_type in ('medication', 'lab', 'imaging', 'procedure', 'referral', 'dme')),
  order_details jsonb not null, -- Structured order details
  auto_apply boolean default false, -- Auto-apply when protocol is selected
  created_at timestamptz default now()
);

create index if not exists idx_protocol_order_sets_protocol on protocol_order_sets(protocol_id);

-- Protocol handouts - patient education materials linked to protocols
create table if not exists protocol_handouts (
  id text primary key,
  tenant_id text not null references tenants(id),
  protocol_id text not null references protocols(id) on delete cascade,
  title text not null,
  content text not null,
  content_type text default 'markdown' check (content_type in ('markdown', 'html', 'pdf_url')),
  language text default 'en',
  auto_provide boolean default false, -- Auto-provide to patient when protocol is applied
  created_at timestamptz default now()
);

create index if not exists idx_protocol_handouts_protocol on protocol_handouts(protocol_id);

-- Protocol applications - track when protocols are applied to patients
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

-- Protocol step completions - track progression through protocol steps
create table if not exists protocol_step_completions (
  id text primary key,
  tenant_id text not null references tenants(id),
  application_id text not null references protocol_applications(id) on delete cascade,
  step_id text not null references protocol_steps(id),
  completed_by text not null references users(id),
  outcome text, -- 'completed', 'skipped', 'modified', 'failed'
  outcome_notes text,
  actual_timing text,
  orders_generated text[], -- Array of order IDs created from this step
  completed_at timestamptz default now()
);

create index if not exists idx_protocol_step_completions_application on protocol_step_completions(application_id);
create index if not exists idx_protocol_step_completions_step on protocol_step_completions(step_id);

-- Protocol effectiveness tracking - measure outcomes
create table if not exists protocol_outcomes (
  id text primary key,
  tenant_id text not null references tenants(id),
  application_id text not null references protocol_applications(id) on delete cascade,
  outcome_type text not null, -- 'clinical_improvement', 'adverse_event', 'patient_satisfaction', 'adherence'
  outcome_value text not null,
  outcome_date date not null,
  documented_by text references users(id),
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_protocol_outcomes_application on protocol_outcomes(application_id);
create index if not exists idx_protocol_outcomes_type on protocol_outcomes(outcome_type);

-- Comments and quick reference data for protocols
comment on table protocols is 'Clinical protocols and treatment algorithms for dermatology practice';
comment on table protocol_steps is 'Sequential or decision-tree steps within a protocol';
comment on table protocol_order_sets is 'Pre-configured order sets that can be applied with protocols';
comment on table protocol_handouts is 'Patient education materials linked to protocols';
comment on table protocol_applications is 'Tracking of protocols applied to specific patients';
comment on table protocol_step_completions is 'Progress tracking through protocol steps';
comment on table protocol_outcomes is 'Clinical outcomes and effectiveness tracking';
