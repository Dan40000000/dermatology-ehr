-- Result Flags for Lab Orders and Radiology/Imaging
-- Add result_flag field to track pathology and lab result interpretations

-- Result flag enum type
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

-- Add result_flag column to lab_orders table
alter table lab_orders
  add column if not exists result_flag result_flag_type default 'none',
  add column if not exists result_flag_updated_at timestamp,
  add column if not exists result_flag_updated_by uuid references providers(id);

-- Add result_flag column to orders table (for imaging/radiology)
alter table orders
  add column if not exists result_flag result_flag_type default 'none',
  add column if not exists result_flag_updated_at timestamp,
  add column if not exists result_flag_updated_by uuid references providers(id);

-- Add result_flag column to dermpath_reports table
alter table dermpath_reports
  add column if not exists result_flag result_flag_type default 'none',
  add column if not exists result_flag_updated_at timestamp,
  add column if not exists result_flag_updated_by uuid references providers(id);

-- Create audit table for result flag changes
create table if not exists result_flag_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(255) not null,

  -- Reference to the order/result
  order_id uuid,
  lab_order_id uuid references lab_orders(id),
  dermpath_report_id uuid references dermpath_reports(id),

  -- Flag change details
  old_flag result_flag_type,
  new_flag result_flag_type not null,

  -- Change metadata
  changed_by uuid not null references providers(id),
  change_reason text,

  created_at timestamp default current_timestamp
);

-- Indexes for performance
create index if not exists idx_lab_orders_result_flag on lab_orders(result_flag) where result_flag != 'none';
create index if not exists idx_orders_result_flag on orders(result_flag) where result_flag != 'none';
create index if not exists idx_dermpath_reports_result_flag on dermpath_reports(result_flag) where result_flag != 'none';

create index if not exists idx_result_flag_audit_lab_order on result_flag_audit(lab_order_id);
create index if not exists idx_result_flag_audit_order on result_flag_audit(order_id);
create index if not exists idx_result_flag_audit_dermpath on result_flag_audit(dermpath_report_id);
create index if not exists idx_result_flag_audit_tenant on result_flag_audit(tenant_id);
create index if not exists idx_result_flag_audit_created on result_flag_audit(created_at desc);

-- Comments
comment on column lab_orders.result_flag is 'Clinical interpretation flag for lab results (benign, cancerous, normal, abnormal, etc.)';
comment on column orders.result_flag is 'Clinical interpretation flag for imaging/radiology results';
comment on column dermpath_reports.result_flag is 'Clinical interpretation flag for dermatopathology reports';
comment on table result_flag_audit is 'Audit trail for result flag changes';
