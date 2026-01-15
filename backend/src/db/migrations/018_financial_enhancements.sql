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
