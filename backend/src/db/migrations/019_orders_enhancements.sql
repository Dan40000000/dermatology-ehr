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
