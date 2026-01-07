-- ============================================================================
-- Clearinghouse / ERA / EFT Integration
-- ============================================================================

-- Table for tracking claim submissions to clearinghouse
create table if not exists clearinghouse_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  claim_id uuid not null references claims(id) on delete cascade,
  batch_id varchar(255),
  submission_number varchar(255),
  control_number varchar(255),
  submitted_at timestamptz,
  status varchar(50) not null default 'pending', -- pending, accepted, rejected, processing, completed
  clearinghouse_response jsonb,
  error_message text,
  retry_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index idx_clearinghouse_submissions_tenant on clearinghouse_submissions(tenant_id);
create index idx_clearinghouse_submissions_claim on clearinghouse_submissions(claim_id);
create index idx_clearinghouse_submissions_batch on clearinghouse_submissions(batch_id);
create index idx_clearinghouse_submissions_status on clearinghouse_submissions(status);
create index idx_clearinghouse_submissions_submitted on clearinghouse_submissions(submitted_at);

-- Table for Electronic Remittance Advice (ERA)
create table if not exists remittance_advice (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  era_number varchar(255) not null,
  payer varchar(255) not null,
  payer_id varchar(255),
  payment_amount_cents bigint not null,
  check_number varchar(100),
  check_date date,
  eft_trace_number varchar(100),
  deposit_date date,
  received_at timestamptz not null default now(),
  posted_at timestamptz,
  posted_by uuid,
  status varchar(50) not null default 'pending', -- pending, posted, reconciled, rejected
  claims_paid integer default 0,
  total_adjustments_cents bigint default 0,
  raw_era_data jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_remittance_advice_tenant on remittance_advice(tenant_id);
create index idx_remittance_advice_era_number on remittance_advice(era_number);
create index idx_remittance_advice_payer on remittance_advice(payer);
create index idx_remittance_advice_check_date on remittance_advice(check_date);
create index idx_remittance_advice_status on remittance_advice(status);
create index idx_remittance_advice_received on remittance_advice(received_at);

-- Table for ERA line-level claim details
create table if not exists era_claim_details (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  era_id uuid not null references remittance_advice(id) on delete cascade,
  claim_id uuid references claims(id) on delete set null,
  patient_control_number varchar(100),
  patient_name varchar(255),
  claim_number varchar(255),
  charge_amount_cents bigint,
  paid_amount_cents bigint,
  adjustment_amount_cents bigint,
  patient_responsibility_cents bigint,
  service_date date,
  adjustment_codes jsonb, -- array of {code, amount, description}
  remark_codes jsonb,
  status varchar(50), -- paid, denied, partial
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_era_claim_details_tenant on era_claim_details(tenant_id);
create index idx_era_claim_details_era on era_claim_details(era_id);
create index idx_era_claim_details_claim on era_claim_details(claim_id);
create index idx_era_claim_details_patient_control on era_claim_details(patient_control_number);

-- Table for Electronic Funds Transfer (EFT) transactions
create table if not exists eft_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  eft_trace_number varchar(100) not null,
  payer varchar(255) not null,
  payer_id varchar(255),
  payment_amount_cents bigint not null,
  deposit_date date not null,
  deposit_account varchar(100),
  transaction_type varchar(50), -- eft, ach, wire
  bank_trace_number varchar(100),
  era_id uuid references remittance_advice(id) on delete set null,
  reconciled boolean default false,
  reconciled_at timestamptz,
  reconciled_by uuid,
  variance_cents bigint default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_eft_transactions_tenant on eft_transactions(tenant_id);
create index idx_eft_transactions_trace on eft_transactions(eft_trace_number);
create index idx_eft_transactions_payer on eft_transactions(payer);
create index idx_eft_transactions_deposit_date on eft_transactions(deposit_date);
create index idx_eft_transactions_reconciled on eft_transactions(reconciled);
create index idx_eft_transactions_era on eft_transactions(era_id);

-- Table for payment reconciliation tracking
create table if not exists payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  era_id uuid references remittance_advice(id) on delete cascade,
  eft_id uuid references eft_transactions(id) on delete set null,
  claim_id uuid references claims(id) on delete set null,
  expected_amount_cents bigint not null,
  received_amount_cents bigint not null,
  variance_cents bigint not null,
  variance_reason varchar(50), -- adjustment, denial, underpayment, overpayment
  adjustment_codes jsonb,
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payment_reconciliation_tenant on payment_reconciliation(tenant_id);
create index idx_payment_reconciliation_era on payment_reconciliation(era_id);
create index idx_payment_reconciliation_eft on payment_reconciliation(eft_id);
create index idx_payment_reconciliation_claim on payment_reconciliation(claim_id);
create index idx_payment_reconciliation_reconciled on payment_reconciliation(reconciled_at);

-- Table for clearinghouse batch submissions
create table if not exists clearinghouse_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  batch_number varchar(255) not null,
  batch_type varchar(50) not null, -- claims, eligibility, status_check
  submission_count integer default 0,
  accepted_count integer default 0,
  rejected_count integer default 0,
  status varchar(50) not null default 'pending', -- pending, submitted, processing, completed, failed
  submitted_at timestamptz,
  completed_at timestamptz,
  clearinghouse_batch_id varchar(255),
  clearinghouse_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index idx_clearinghouse_batches_tenant on clearinghouse_batches(tenant_id);
create index idx_clearinghouse_batches_batch_number on clearinghouse_batches(batch_number);
create index idx_clearinghouse_batches_status on clearinghouse_batches(status);
create index idx_clearinghouse_batches_submitted on clearinghouse_batches(submitted_at);

-- Table for closing reports
create table if not exists closing_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,
  report_date date not null,
  report_type varchar(50) not null, -- daily, weekly, monthly
  total_charges_cents bigint default 0,
  total_payments_cents bigint default 0,
  total_adjustments_cents bigint default 0,
  outstanding_balance_cents bigint default 0,
  claims_submitted integer default 0,
  claims_paid integer default 0,
  claims_denied integer default 0,
  eras_received integer default 0,
  efts_received integer default 0,
  reconciliation_variance_cents bigint default 0,
  report_data jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid,
  created_at timestamptz not null default now()
);

create index idx_closing_reports_tenant on closing_reports(tenant_id);
create index idx_closing_reports_date on closing_reports(report_date);
create index idx_closing_reports_type on closing_reports(report_type);
create index idx_closing_reports_generated on closing_reports(generated_at);

-- Add audit triggers for tracking changes
create trigger clearinghouse_submissions_updated_at
  before update on clearinghouse_submissions
  for each row execute function update_updated_at_column();

create trigger remittance_advice_updated_at
  before update on remittance_advice
  for each row execute function update_updated_at_column();

create trigger era_claim_details_updated_at
  before update on era_claim_details
  for each row execute function update_updated_at_column();

create trigger eft_transactions_updated_at
  before update on eft_transactions
  for each row execute function update_updated_at_column();

create trigger payment_reconciliation_updated_at
  before update on payment_reconciliation
  for each row execute function update_updated_at_column();

create trigger clearinghouse_batches_updated_at
  before update on clearinghouse_batches
  for each row execute function update_updated_at_column();
