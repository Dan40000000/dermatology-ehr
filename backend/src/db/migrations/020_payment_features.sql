-- Advanced Payment Features
-- Payment Plans, Text-to-Pay, Saved Payment Methods, Quick Pay Links

-- Payment Plans
create table if not exists payment_plans (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  total_amount_cents int not null,
  installment_amount_cents int not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  start_date date not null,
  next_payment_date date not null,
  paid_amount_cents int not null default 0,
  remaining_amount_cents int not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'defaulted')),
  notes text,
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payment_plans_tenant on payment_plans(tenant_id);
create index if not exists idx_payment_plans_patient on payment_plans(patient_id);
create index if not exists idx_payment_plans_status on payment_plans(status);
create index if not exists idx_payment_plans_next_payment on payment_plans(next_payment_date);

-- Payment Plan Payments (tracks individual payments against a plan)
create table if not exists payment_plan_payments (
  id text primary key,
  tenant_id text not null references tenants(id),
  payment_plan_id text not null references payment_plans(id) on delete cascade,
  patient_payment_id text references patient_payments(id),
  amount_cents int not null,
  payment_date date not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz default now()
);

create index if not exists idx_plan_payments_plan on payment_plan_payments(payment_plan_id);
create index if not exists idx_plan_payments_patient_payment on payment_plan_payments(patient_payment_id);

-- Text-to-Pay Links
create table if not exists text_to_pay_links (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  amount_cents int not null,
  link_code text unique not null,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'opened', 'paid', 'expired', 'cancelled')),
  message text,
  sent_at timestamptz,
  opened_at timestamptz,
  paid_at timestamptz,
  patient_payment_id text references patient_payments(id),
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_text_to_pay_tenant on text_to_pay_links(tenant_id);
create index if not exists idx_text_to_pay_patient on text_to_pay_links(patient_id);
create index if not exists idx_text_to_pay_code on text_to_pay_links(link_code);
create index if not exists idx_text_to_pay_status on text_to_pay_links(status);
create index if not exists idx_text_to_pay_expires on text_to_pay_links(expires_at);

-- Quick Pay Links (longer-lived payment links)
create table if not exists quick_pay_links (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  amount_cents int not null,
  link_code text unique not null,
  description text,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paid', 'expired', 'cancelled')),
  paid_at timestamptz,
  patient_payment_id text references patient_payments(id),
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quick_pay_tenant on quick_pay_links(tenant_id);
create index if not exists idx_quick_pay_patient on quick_pay_links(patient_id);
create index if not exists idx_quick_pay_code on quick_pay_links(link_code);
create index if not exists idx_quick_pay_status on quick_pay_links(status);

-- Saved Payment Methods (for autopay and recurring payments)
create table if not exists saved_payment_methods (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  method_type text not null check (method_type in ('card', 'bank_account')),
  last_four text not null,
  card_brand text, -- visa, mastercard, amex, discover, etc
  expiry_month int,
  expiry_year int,
  bank_name text,
  account_type text check (account_type in ('checking', 'savings')),
  is_default boolean default false,
  is_autopay_enabled boolean default false,
  autopay_day_of_month int check (autopay_day_of_month >= 1 and autopay_day_of_month <= 28),
  nickname text,
  -- In production, this would store a token from payment processor
  payment_token text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_saved_methods_tenant on saved_payment_methods(tenant_id);
create index if not exists idx_saved_methods_patient on saved_payment_methods(patient_id);
create index if not exists idx_saved_methods_active on saved_payment_methods(is_active);
create index if not exists idx_saved_methods_autopay on saved_payment_methods(is_autopay_enabled) where is_autopay_enabled = true;

-- Autopay Schedules (for recurring autopay processing)
create table if not exists autopay_schedules (
  id text primary key,
  tenant_id text not null references tenants(id),
  patient_id text not null references patients(id),
  saved_payment_method_id text not null references saved_payment_methods(id),
  amount_type text not null check (amount_type in ('full_balance', 'fixed_amount', 'minimum')),
  fixed_amount_cents int,
  minimum_amount_cents int,
  day_of_month int not null check (day_of_month >= 1 and day_of_month <= 28),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  last_run_date date,
  next_run_date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_autopay_schedules_tenant on autopay_schedules(tenant_id);
create index if not exists idx_autopay_schedules_patient on autopay_schedules(patient_id);
create index if not exists idx_autopay_schedules_next_run on autopay_schedules(next_run_date);
create index if not exists idx_autopay_schedules_status on autopay_schedules(status);

-- Autopay Run Log (audit trail for autopay processing)
create table if not exists autopay_run_log (
  id text primary key,
  tenant_id text not null references tenants(id),
  autopay_schedule_id text not null references autopay_schedules(id),
  patient_id text not null references patients(id),
  saved_payment_method_id text not null,
  amount_cents int not null,
  status text not null check (status in ('success', 'failed', 'insufficient_funds', 'card_declined', 'expired_card')),
  patient_payment_id text references patient_payments(id),
  error_message text,
  run_date date not null,
  created_at timestamptz default now()
);

create index if not exists idx_autopay_log_schedule on autopay_run_log(autopay_schedule_id);
create index if not exists idx_autopay_log_patient on autopay_run_log(patient_id);
create index if not exists idx_autopay_log_date on autopay_run_log(run_date);
create index if not exists idx_autopay_log_status on autopay_run_log(status);

-- Payer Contracts (for fee schedule management)
create table if not exists payer_contracts (
  id text primary key,
  tenant_id text not null references tenants(id),
  payer_name text not null,
  payer_id text,
  contract_number text,
  fee_schedule_id text references fee_schedules(id),
  effective_date date not null,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'pending', 'expired', 'terminated')),
  reimbursement_type text check (reimbursement_type in ('fee_schedule', 'percentage_of_charges', 'medicare_based')),
  reimbursement_percentage decimal(5,2),
  medicare_percentage decimal(5,2),
  timely_filing_days int default 90,
  notes text,
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payer_contracts_tenant on payer_contracts(tenant_id);
create index if not exists idx_payer_contracts_payer on payer_contracts(payer_name);
create index if not exists idx_payer_contracts_status on payer_contracts(status);
create index if not exists idx_payer_contracts_effective on payer_contracts(effective_date);

-- Service Packages (bundled pricing for cosmetic procedures, etc)
create table if not exists service_packages (
  id text primary key,
  tenant_id text not null references tenants(id),
  name text not null,
  description text,
  package_price_cents int not null,
  regular_price_cents int not null,
  savings_cents int generated always as (regular_price_cents - package_price_cents) stored,
  is_active boolean default true,
  valid_from date,
  valid_until date,
  max_uses int,
  current_uses int default 0,
  created_by text not null references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_service_packages_tenant on service_packages(tenant_id);
create index if not exists idx_service_packages_active on service_packages(is_active);

-- Service Package Items (CPT codes included in a package)
create table if not exists service_package_items (
  id text primary key,
  service_package_id text not null references service_packages(id) on delete cascade,
  cpt_code text not null,
  description text,
  quantity int not null default 1,
  individual_price_cents int not null,
  created_at timestamptz default now()
);

create index if not exists idx_package_items_package on service_package_items(service_package_id);
create index if not exists idx_package_items_cpt on service_package_items(cpt_code);

-- Add fee_schedules table if it doesn't exist
create table if not exists fee_schedules (
  id text primary key,
  tenant_id text not null references tenants(id),
  name text not null,
  description text,
  is_default boolean default false,
  effective_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_fee_schedules_tenant on fee_schedules(tenant_id);
create index if not exists idx_fee_schedules_default on fee_schedules(is_default) where is_default = true;

-- Fee Schedule Items
create table if not exists fee_schedule_items (
  id text primary key,
  fee_schedule_id text not null references fee_schedules(id) on delete cascade,
  cpt_code text not null,
  cpt_description text,
  fee_cents int not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(fee_schedule_id, cpt_code)
);

create index if not exists idx_fee_schedule_items_schedule on fee_schedule_items(fee_schedule_id);
create index if not exists idx_fee_schedule_items_cpt on fee_schedule_items(cpt_code);
