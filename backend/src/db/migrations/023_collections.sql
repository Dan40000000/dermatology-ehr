-- Collections Workflow System
-- Optimized for collecting at time of service

-- Patient Balances (aggregate view of what patient owes)
create table if not exists patient_balances (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),

  -- Current balance breakdown by age
  total_balance decimal(10,2) default 0,
  current_balance decimal(10,2) default 0, -- 0-30 days
  balance_31_60 decimal(10,2) default 0,
  balance_61_90 decimal(10,2) default 0,
  balance_over_90 decimal(10,2) default 0,

  -- Oldest charge date
  oldest_charge_date date,

  -- Last activity
  last_payment_date date,
  last_payment_amount decimal(10,2),
  last_statement_date date,
  last_collection_attempt_date date,

  -- Flags
  has_payment_plan boolean default false,
  has_autopay boolean default false,
  is_in_collections boolean default false,

  updated_at timestamptz default now(),

  unique(tenant_id, patient_id)
);

create index if not exists idx_patient_balances_tenant on patient_balances(tenant_id);
create index if not exists idx_patient_balances_patient on patient_balances(patient_id);
create index if not exists idx_patient_balances_total on patient_balances(total_balance) where total_balance > 0;
create index if not exists idx_patient_balances_aging on patient_balances(balance_over_90) where balance_over_90 > 0;

-- Collection Attempts (track each attempt to collect)
create table if not exists collection_attempts (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  encounter_id text references encounters(id),

  -- Attempt details
  attempt_date timestamptz default now(),
  amount_due decimal(10,2) not null,
  collection_point text not null check (collection_point in ('check_in', 'check_out', 'phone', 'statement', 'portal', 'text')),

  -- Result
  result text not null check (result in ('collected_full', 'collected_partial', 'payment_plan', 'declined', 'skipped')),
  amount_collected decimal(10,2) default 0,
  skip_reason text,

  -- Notes
  notes text,
  talking_points_used text,

  -- Who attempted
  attempted_by text references users(id),

  created_at timestamptz default now()
);

create index if not exists idx_collection_attempts_tenant on collection_attempts(tenant_id);
create index if not exists idx_collection_attempts_patient on collection_attempts(patient_id);
create index if not exists idx_collection_attempts_date on collection_attempts(attempt_date);
create index if not exists idx_collection_attempts_result on collection_attempts(result);
create index if not exists idx_collection_attempts_point on collection_attempts(collection_point);

-- Patient Statements
create table if not exists patient_statements (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),

  -- Statement details
  statement_date date not null,
  statement_number text not null,
  due_date date not null,

  -- Amounts
  previous_balance decimal(10,2) default 0,
  new_charges decimal(10,2) default 0,
  payments_received decimal(10,2) default 0,
  adjustments decimal(10,2) default 0,
  current_balance decimal(10,2) not null,

  -- Aging
  current_amount decimal(10,2) default 0,
  days_30_amount decimal(10,2) default 0,
  days_60_amount decimal(10,2) default 0,
  days_90_plus_amount decimal(10,2) default 0,

  -- Line items (charges included in this statement)
  line_items jsonb,

  -- Delivery
  delivery_method text check (delivery_method in ('mail', 'email', 'portal', 'both')),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,

  -- PDF
  pdf_url text,

  -- Status
  status text default 'draft' check (status in ('draft', 'sent', 'paid', 'partial', 'overdue')),

  created_by text references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_statements_tenant on patient_statements(tenant_id);
create index if not exists idx_statements_patient on patient_statements(patient_id);
create index if not exists idx_statements_date on patient_statements(statement_date);
create index if not exists idx_statements_status on patient_statements(status);
create index if not exists idx_statements_number on patient_statements(statement_number);

-- Cost Estimates (pre-visit estimates)
create table if not exists cost_estimates (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  appointment_id text,

  -- Service details
  service_type text,
  cpt_codes jsonb, -- Array of CPT codes to be performed

  -- Insurance calculation
  insurance_id text,
  insurance_name text,
  estimated_allowed_amount decimal(10,2),
  deductible_remaining decimal(10,2),
  coinsurance_percent decimal(5,2),
  copay_amount decimal(10,2),

  -- Patient responsibility
  estimated_patient_responsibility decimal(10,2) not null,

  -- Breakdown
  breakdown jsonb, -- Detailed calculation breakdown

  -- Flags
  is_cosmetic boolean default false, -- Cosmetic = 100% patient pay
  insurance_verified boolean default false,

  -- Communication
  shown_to_patient boolean default false,
  shown_at timestamptz,
  patient_accepted boolean default false,

  -- Validity
  valid_until date,

  created_by text references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_estimates_tenant on cost_estimates(tenant_id);
create index if not exists idx_estimates_patient on cost_estimates(patient_id);
create index if not exists idx_estimates_appointment on cost_estimates(appointment_id);
create index if not exists idx_estimates_valid on cost_estimates(valid_until);

-- Collection Statistics (for reporting)
create table if not exists collection_stats (
  id text primary key,
  tenant_id text not null references tenants(id),

  -- Period
  stat_date date not null,
  stat_period text not null check (stat_period in ('day', 'week', 'month')),

  -- Collection metrics
  total_charges_cents int not null default 0,
  collected_at_checkin_cents int not null default 0,
  collected_at_checkout_cents int not null default 0,
  collected_via_statement_cents int not null default 0,
  collected_via_portal_cents int not null default 0,
  collected_via_phone_cents int not null default 0,
  total_collected_cents int not null default 0,

  -- Rates
  collection_rate_at_service decimal(5,2), -- % collected at check-in/out
  overall_collection_rate decimal(5,2), -- % of all charges collected

  -- Attempts
  total_attempts int default 0,
  successful_attempts int default 0,
  declined_attempts int default 0,
  skipped_attempts int default 0,

  -- Payment plans
  payment_plans_created int default 0,
  payment_plans_completed int default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(tenant_id, stat_date, stat_period)
);

create index if not exists idx_collection_stats_tenant on collection_stats(tenant_id);
create index if not exists idx_collection_stats_date on collection_stats(stat_date);
create index if not exists idx_collection_stats_period on collection_stats(stat_period);

-- Extend existing patient_payments table with collection-specific fields
-- (Use ALTER TABLE if the table already exists)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'patient_payments' and column_name = 'collection_point') then
    alter table patient_payments add column collection_point text check (collection_point in ('check_in', 'check_out', 'phone', 'statement', 'portal', 'text', 'other'));
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'patient_payments' and column_name = 'encounter_id') then
    alter table patient_payments add column encounter_id text references encounters(id);
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'patient_payments' and column_name = 'applied_to') then
    alter table patient_payments add column applied_to jsonb; -- Array of {charge_id, amount}
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'patient_payments' and column_name = 'collected_by') then
    alter table patient_payments add column collected_by text references users(id);
  end if;
end$$;

-- Create indexes for new columns
create index if not exists idx_patient_payments_collection_point on patient_payments(collection_point);
create index if not exists idx_patient_payments_encounter on patient_payments(encounter_id);
create index if not exists idx_patient_payments_collected_by on patient_payments(collected_by);

-- Function to update patient balances
create or replace function update_patient_balance(p_tenant_id text, p_patient_id text)
returns void as $$
declare
  v_balance record;
  v_balance_id text;
begin
  -- Calculate current balances by aging
  select
    coalesce(sum(case when age(current_date, service_date) <= 30 then amount_cents / 100.0 else 0 end), 0) as current_balance,
    coalesce(sum(case when age(current_date, service_date) between 31 and 60 then amount_cents / 100.0 else 0 end), 0) as balance_31_60,
    coalesce(sum(case when age(current_date, service_date) between 61 and 90 then amount_cents / 100.0 else 0 end), 0) as balance_61_90,
    coalesce(sum(case when age(current_date, service_date) > 90 then amount_cents / 100.0 else 0 end), 0) as balance_over_90,
    min(service_date) as oldest_charge_date
  into v_balance
  from charges
  where tenant_id = p_tenant_id
    and patient_id = p_patient_id
    and status = 'pending'; -- Only unpaid charges

  -- Get last payment info
  select
    payment_date,
    amount_cents / 100.0 as amount
  into v_balance.last_payment_date, v_balance.last_payment_amount
  from patient_payments
  where tenant_id = p_tenant_id
    and patient_id = p_patient_id
    and status = 'posted'
  order by payment_date desc
  limit 1;

  -- Upsert balance record
  insert into patient_balances (
    id, tenant_id, patient_id,
    total_balance, current_balance, balance_31_60, balance_61_90, balance_over_90,
    oldest_charge_date, last_payment_date, last_payment_amount,
    updated_at
  ) values (
    gen_random_uuid()::text, p_tenant_id, p_patient_id,
    coalesce(v_balance.current_balance, 0) + coalesce(v_balance.balance_31_60, 0) +
      coalesce(v_balance.balance_61_90, 0) + coalesce(v_balance.balance_over_90, 0),
    coalesce(v_balance.current_balance, 0),
    coalesce(v_balance.balance_31_60, 0),
    coalesce(v_balance.balance_61_90, 0),
    coalesce(v_balance.balance_over_90, 0),
    v_balance.oldest_charge_date,
    v_balance.last_payment_date,
    v_balance.last_payment_amount,
    now()
  )
  on conflict (tenant_id, patient_id) do update set
    total_balance = excluded.total_balance,
    current_balance = excluded.current_balance,
    balance_31_60 = excluded.balance_31_60,
    balance_61_90 = excluded.balance_61_90,
    balance_over_90 = excluded.balance_over_90,
    oldest_charge_date = excluded.oldest_charge_date,
    last_payment_date = excluded.last_payment_date,
    last_payment_amount = excluded.last_payment_amount,
    updated_at = now();
end;
$$ language plpgsql;
