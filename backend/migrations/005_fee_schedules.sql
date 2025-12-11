-- Fee Schedules Table
CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_schedule_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Fee Schedule Items Table
CREATE TABLE IF NOT EXISTS fee_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_schedule_id UUID NOT NULL,
  cpt_code VARCHAR(10) NOT NULL,
  cpt_description TEXT,
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fee_schedule_item_schedule FOREIGN KEY (fee_schedule_id) REFERENCES fee_schedules(id) ON DELETE CASCADE,
  CONSTRAINT unique_schedule_cpt UNIQUE (fee_schedule_id, cpt_code)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_fee_schedules_tenant ON fee_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fee_schedules_default ON fee_schedules(tenant_id, is_default);
CREATE INDEX IF NOT EXISTS idx_fee_schedule_items_schedule ON fee_schedule_items(fee_schedule_id);
CREATE INDEX IF NOT EXISTS idx_fee_schedule_items_cpt ON fee_schedule_items(fee_schedule_id, cpt_code);

-- Ensure only one default per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_schedules_one_default_per_tenant
  ON fee_schedules(tenant_id)
  WHERE is_default = true;

-- Audit tracking trigger (if audit table exists)
-- Note: This assumes an audit table structure exists. Adjust as needed.

COMMENT ON TABLE fee_schedules IS 'Fee schedules for different payer types (Commercial, Medicare, Cash Pay, etc.)';
COMMENT ON TABLE fee_schedule_items IS 'Individual CPT code fees within a fee schedule';
COMMENT ON COLUMN fee_schedule_items.fee_cents IS 'Fee amount in cents to avoid floating point issues';
