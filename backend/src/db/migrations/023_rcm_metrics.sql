-- Revenue Cycle Management (RCM) Metrics Tables
-- Daily snapshot of RCM metrics for trending and performance tracking

-- RCM Daily Metrics - snapshot of key metrics by day
create table if not exists rcm_daily_metrics (
  id text primary key,
  tenant_id text not null references tenants(id),
  metric_date date not null,

  -- Charges
  total_charges_cents bigint not null default 0,
  medical_charges_cents bigint not null default 0,
  cosmetic_charges_cents bigint not null default 0,

  -- Collections
  total_collections_cents bigint not null default 0,
  insurance_payments_cents bigint not null default 0,
  patient_payments_cents bigint not null default 0,

  -- Accounts Receivable (A/R)
  total_ar_cents bigint not null default 0,
  ar_current_cents bigint not null default 0,
  ar_31_60_cents bigint not null default 0,
  ar_61_90_cents bigint not null default 0,
  ar_91_120_cents bigint not null default 0,
  ar_over_120_cents bigint not null default 0,

  -- Claims
  claims_submitted integer not null default 0,
  claims_accepted integer not null default 0,
  claims_paid integer not null default 0,
  claims_denied integer not null default 0,
  claims_pending integer not null default 0,
  clean_claim_count integer not null default 0,

  -- Calculated Metrics
  collection_rate decimal(5,2),
  denial_rate decimal(5,2),
  clean_claim_rate decimal(5,2),
  days_in_ar decimal(8,2),
  net_collection_rate decimal(5,2),

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(tenant_id, metric_date)
);

create index if not exists idx_rcm_daily_metrics_tenant on rcm_daily_metrics(tenant_id);
create index if not exists idx_rcm_daily_metrics_date on rcm_daily_metrics(metric_date);
create index if not exists idx_rcm_daily_metrics_tenant_date on rcm_daily_metrics(tenant_id, metric_date desc);

-- RCM Payer Metrics - track performance by insurance payer
create table if not exists rcm_payer_metrics (
  id text primary key,
  tenant_id text not null references tenants(id),
  payer_id text,
  payer_name text not null,
  metric_month date not null,

  -- Volume
  charges_cents bigint not null default 0,
  payments_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,

  -- Claims Performance
  claims_submitted integer not null default 0,
  claims_paid integer not null default 0,
  claims_denied integer not null default 0,
  denials_overturned integer not null default 0,

  -- Timing
  avg_days_to_pay decimal(8,2),
  median_days_to_pay integer,

  -- Rates
  denial_rate decimal(5,2),
  collection_rate decimal(5,2),
  overturn_rate decimal(5,2),

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(tenant_id, payer_name, metric_month)
);

create index if not exists idx_rcm_payer_metrics_tenant on rcm_payer_metrics(tenant_id);
create index if not exists idx_rcm_payer_metrics_month on rcm_payer_metrics(metric_month);
create index if not exists idx_rcm_payer_metrics_payer on rcm_payer_metrics(payer_name);

-- RCM Provider Metrics - track productivity and revenue by provider
create table if not exists rcm_provider_metrics (
  id text primary key,
  tenant_id text not null references tenants(id),
  provider_id text not null references providers(id),
  metric_month date not null,

  -- Volume
  encounters_count integer not null default 0,
  patients_count integer not null default 0,
  charges_cents bigint not null default 0,
  collections_cents bigint not null default 0,

  -- Productivity
  charges_per_patient_cents integer,
  charges_per_encounter_cents integer,
  avg_encounter_minutes integer,
  wrvus decimal(10,2),

  -- Quality
  collection_rate decimal(5,2),
  denial_rate decimal(5,2),

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(tenant_id, provider_id, metric_month)
);

create index if not exists idx_rcm_provider_metrics_tenant on rcm_provider_metrics(tenant_id);
create index if not exists idx_rcm_provider_metrics_provider on rcm_provider_metrics(provider_id);
create index if not exists idx_rcm_provider_metrics_month on rcm_provider_metrics(metric_month);

-- RCM Denial Reasons - track why claims are denied
create table if not exists rcm_denial_reasons (
  id text primary key,
  tenant_id text not null references tenants(id),
  reason_code text not null,
  reason_description text not null,
  denial_count integer not null default 0,
  denial_amount_cents bigint not null default 0,
  appealed_count integer not null default 0,
  overturned_count integer not null default 0,
  metric_month date not null,

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(tenant_id, reason_code, metric_month)
);

create index if not exists idx_rcm_denial_reasons_tenant on rcm_denial_reasons(tenant_id);
create index if not exists idx_rcm_denial_reasons_month on rcm_denial_reasons(metric_month);
create index if not exists idx_rcm_denial_reasons_code on rcm_denial_reasons(reason_code);

-- RCM Action Items - items requiring attention
create table if not exists rcm_action_items (
  id text primary key,
  tenant_id text not null references tenants(id),
  item_type text not null check (item_type in ('denial_appeal', 'claim_review', 'patient_collection', 'prior_auth_expiring', 'insurance_verification', 'claim_scrub', 'aging_balance', 'other')),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  title text not null,
  description text,

  -- References
  patient_id text references patients(id),
  claim_id text references claims(id),
  bill_id text references bills(id),
  prior_auth_id text references prior_authorizations(id),

  -- Status
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  assigned_to text references users(id),

  -- Amounts
  amount_cents bigint,
  potential_recovery_cents bigint,

  -- Timing
  due_date date,
  resolved_at timestamptz,
  resolved_by text references users(id),

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rcm_action_items_tenant on rcm_action_items(tenant_id);
create index if not exists idx_rcm_action_items_type on rcm_action_items(item_type);
create index if not exists idx_rcm_action_items_status on rcm_action_items(status);
create index if not exists idx_rcm_action_items_priority on rcm_action_items(priority);
create index if not exists idx_rcm_action_items_patient on rcm_action_items(patient_id);
create index if not exists idx_rcm_action_items_claim on rcm_action_items(claim_id);
create index if not exists idx_rcm_action_items_assigned on rcm_action_items(assigned_to);
create index if not exists idx_rcm_action_items_due_date on rcm_action_items(due_date);

-- RCM Benchmarks - store industry benchmarks for comparison
create table if not exists rcm_benchmarks (
  id text primary key,
  specialty text not null,
  metric_name text not null,
  benchmark_value decimal(10,2) not null,
  percentile_25 decimal(10,2),
  percentile_50 decimal(10,2),
  percentile_75 decimal(10,2),
  percentile_90 decimal(10,2),
  source text,
  year integer not null,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(specialty, metric_name, year)
);

create index if not exists idx_rcm_benchmarks_specialty on rcm_benchmarks(specialty);
create index if not exists idx_rcm_benchmarks_metric on rcm_benchmarks(metric_name);

-- Insert default benchmarks for dermatology
insert into rcm_benchmarks (id, specialty, metric_name, benchmark_value, percentile_25, percentile_50, percentile_75, percentile_90, source, year)
values
  ('bench-derm-collection-rate-2025', 'Dermatology', 'collection_rate', 95.0, 92.0, 95.0, 97.0, 98.5, 'MGMA', 2025),
  ('bench-derm-denial-rate-2025', 'Dermatology', 'denial_rate', 5.0, 2.0, 5.0, 8.0, 12.0, 'MGMA', 2025),
  ('bench-derm-days-in-ar-2025', 'Dermatology', 'days_in_ar', 35.0, 25.0, 35.0, 45.0, 60.0, 'MGMA', 2025),
  ('bench-derm-clean-claim-rate-2025', 'Dermatology', 'clean_claim_rate', 95.0, 90.0, 95.0, 97.0, 99.0, 'MGMA', 2025),
  ('bench-derm-net-collection-2025', 'Dermatology', 'net_collection_rate', 96.0, 93.0, 96.0, 98.0, 99.0, 'MGMA', 2025),
  ('bench-derm-charges-per-patient-2025', 'Dermatology', 'charges_per_patient', 35000, 25000, 35000, 45000, 55000, 'MGMA', 2025)
on conflict do nothing;

-- Function to calculate and update daily RCM metrics
create or replace function calculate_rcm_daily_metrics(p_tenant_id text, p_metric_date date)
returns void as $$
declare
  v_metric_id text;
  v_total_charges bigint;
  v_total_collections bigint;
  v_insurance_collections bigint;
  v_patient_collections bigint;
  v_total_ar bigint;
  v_ar_current bigint;
  v_ar_31_60 bigint;
  v_ar_61_90 bigint;
  v_ar_91_120 bigint;
  v_ar_120_plus bigint;
  v_claims_submitted int;
  v_claims_accepted int;
  v_claims_paid int;
  v_claims_denied int;
  v_clean_claims int;
  v_collection_rate decimal;
  v_denial_rate decimal;
  v_clean_claim_rate decimal;
begin
  v_metric_id := 'rcm-' || p_tenant_id || '-' || p_metric_date;

  -- Calculate charges for the day
  select coalesce(sum(total_charges_cents), 0)
  into v_total_charges
  from bills
  where tenant_id = p_tenant_id
    and bill_date = p_metric_date;

  -- Calculate collections for the day
  select coalesce(sum(applied_amount_cents), 0)
  into v_insurance_collections
  from payer_payments
  where tenant_id = p_tenant_id
    and payment_date = p_metric_date;

  select coalesce(sum(amount_cents), 0)
  into v_patient_collections
  from patient_payments
  where tenant_id = p_tenant_id
    and payment_date = p_metric_date
    and status = 'posted';

  v_total_collections := v_insurance_collections + v_patient_collections;

  -- Calculate A/R aging as of this date
  select
    coalesce(sum(balance_cents), 0),
    coalesce(sum(case when bill_date >= p_metric_date - interval '30 days' then balance_cents else 0 end), 0),
    coalesce(sum(case when bill_date < p_metric_date - interval '30 days' and bill_date >= p_metric_date - interval '60 days' then balance_cents else 0 end), 0),
    coalesce(sum(case when bill_date < p_metric_date - interval '60 days' and bill_date >= p_metric_date - interval '90 days' then balance_cents else 0 end), 0),
    coalesce(sum(case when bill_date < p_metric_date - interval '90 days' and bill_date >= p_metric_date - interval '120 days' then balance_cents else 0 end), 0),
    coalesce(sum(case when bill_date < p_metric_date - interval '120 days' then balance_cents else 0 end), 0)
  into v_total_ar, v_ar_current, v_ar_31_60, v_ar_61_90, v_ar_91_120, v_ar_120_plus
  from bills
  where tenant_id = p_tenant_id
    and balance_cents > 0
    and status not in ('paid', 'written_off', 'cancelled');

  -- Calculate claims metrics
  select
    count(*),
    count(*) filter (where status in ('accepted', 'paid')),
    count(*) filter (where status = 'paid'),
    count(*) filter (where status = 'rejected'),
    count(*) filter (where status in ('accepted', 'paid') and not exists (
      select 1 from claim_status_history csh
      where csh.claim_id = claims.id and csh.status = 'rejected'
    ))
  into v_claims_submitted, v_claims_accepted, v_claims_paid, v_claims_denied, v_clean_claims
  from claims
  where tenant_id = p_tenant_id
    and submitted_at::date = p_metric_date;

  -- Calculate rates
  v_collection_rate := case when v_total_charges > 0 then (v_total_collections::decimal / v_total_charges * 100) else 0 end;
  v_denial_rate := case when v_claims_submitted > 0 then (v_claims_denied::decimal / v_claims_submitted * 100) else 0 end;
  v_clean_claim_rate := case when v_claims_submitted > 0 then (v_clean_claims::decimal / v_claims_submitted * 100) else 0 end;

  -- Insert or update the metrics
  insert into rcm_daily_metrics (
    id, tenant_id, metric_date,
    total_charges_cents, total_collections_cents,
    insurance_payments_cents, patient_payments_cents,
    total_ar_cents, ar_current_cents, ar_31_60_cents, ar_61_90_cents, ar_91_120_cents, ar_over_120_cents,
    claims_submitted, claims_accepted, claims_paid, claims_denied, clean_claim_count,
    collection_rate, denial_rate, clean_claim_rate
  )
  values (
    v_metric_id, p_tenant_id, p_metric_date,
    v_total_charges, v_total_collections,
    v_insurance_collections, v_patient_collections,
    v_total_ar, v_ar_current, v_ar_31_60, v_ar_61_90, v_ar_91_120, v_ar_120_plus,
    v_claims_submitted, v_claims_accepted, v_claims_paid, v_claims_denied, v_clean_claims,
    v_collection_rate, v_denial_rate, v_clean_claim_rate
  )
  on conflict (tenant_id, metric_date)
  do update set
    total_charges_cents = excluded.total_charges_cents,
    total_collections_cents = excluded.total_collections_cents,
    insurance_payments_cents = excluded.insurance_payments_cents,
    patient_payments_cents = excluded.patient_payments_cents,
    total_ar_cents = excluded.total_ar_cents,
    ar_current_cents = excluded.ar_current_cents,
    ar_31_60_cents = excluded.ar_31_60_cents,
    ar_61_90_cents = excluded.ar_61_90_cents,
    ar_91_120_cents = excluded.ar_91_120_cents,
    ar_over_120_cents = excluded.ar_over_120_cents,
    claims_submitted = excluded.claims_submitted,
    claims_accepted = excluded.claims_accepted,
    claims_paid = excluded.claims_paid,
    claims_denied = excluded.claims_denied,
    clean_claim_count = excluded.clean_claim_count,
    collection_rate = excluded.collection_rate,
    denial_rate = excluded.denial_rate,
    clean_claim_rate = excluded.clean_claim_rate,
    updated_at = now();
end;
$$ language plpgsql;
