-- Migration: Time Blocks and Waitlist
-- Description: Schedule time blocking and appointment waitlist management

-- TIME BLOCKS TABLE
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Time block details
  title VARCHAR(255) NOT NULL,
  block_type VARCHAR(50) NOT NULL DEFAULT 'blocked',
  -- Types: blocked, lunch, meeting, admin, continuing_education, out_of_office
  description TEXT,

  -- Schedule
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,

  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern VARCHAR(50),
  -- Patterns: daily, weekly, biweekly, monthly
  recurrence_end_date DATE,

  -- Status
  status VARCHAR(50) DEFAULT 'active',
  -- Status: active, cancelled

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT valid_block_type CHECK (block_type IN ('blocked', 'lunch', 'meeting', 'admin', 'continuing_education', 'out_of_office')),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled'))
);

-- WAITLIST TABLE
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Waitlist details
  reason VARCHAR(255) NOT NULL,
  -- Reason: earlier_appointment, specific_provider, specific_time, cancellation
  notes TEXT,

  -- Preferred schedule
  preferred_start_date DATE,
  preferred_end_date DATE,
  preferred_time_of_day VARCHAR(50),
  -- Times: morning (6am-12pm), afternoon (12pm-5pm), evening (5pm-8pm), any
  preferred_days_of_week TEXT[],
  -- Array like: ['monday', 'wednesday', 'friday']

  -- Priority
  priority VARCHAR(20) DEFAULT 'normal',
  -- Priority: low, normal, high, urgent

  -- Status
  status VARCHAR(50) DEFAULT 'active',
  -- Status: active, contacted, scheduled, cancelled, expired

  -- Notifications
  patient_notified_at TIMESTAMP,
  notification_method VARCHAR(50),
  -- Methods: phone, email, sms, portal

  -- Resolution
  scheduled_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT valid_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT valid_status_waitlist CHECK (status IN ('active', 'contacted', 'scheduled', 'cancelled', 'expired')),
  CONSTRAINT valid_time_of_day CHECK (preferred_time_of_day IN ('morning', 'afternoon', 'evening', 'any'))
);

-- Indexes for performance
CREATE INDEX idx_time_blocks_tenant ON time_blocks(tenant_id);
CREATE INDEX idx_time_blocks_provider ON time_blocks(provider_id);
CREATE INDEX idx_time_blocks_start_time ON time_blocks(start_time);
CREATE INDEX idx_time_blocks_status ON time_blocks(status);

CREATE INDEX idx_waitlist_tenant ON waitlist(tenant_id);
CREATE INDEX idx_waitlist_patient ON waitlist(patient_id);
CREATE INDEX idx_waitlist_provider ON waitlist(provider_id);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_priority ON waitlist(priority);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at DESC);

-- Comments
COMMENT ON TABLE time_blocks IS 'Schedule time blocks for lunch, meetings, admin time, etc.';
COMMENT ON COLUMN time_blocks.block_type IS 'Type of block: blocked, lunch, meeting, admin, continuing_education, out_of_office';
COMMENT ON COLUMN time_blocks.is_recurring IS 'Whether this block repeats on a schedule';

COMMENT ON TABLE waitlist IS 'Patient waiting list for earlier or preferred appointments';
COMMENT ON COLUMN waitlist.reason IS 'Why patient is on waitlist: earlier_appointment, specific_provider, specific_time, cancellation';
COMMENT ON COLUMN waitlist.preferred_days_of_week IS 'Array of preferred days like [monday, wednesday, friday]';
COMMENT ON COLUMN waitlist.priority IS 'Priority level: low, normal, high, urgent';
COMMENT ON COLUMN waitlist.status IS 'Current status: active, contacted, scheduled, cancelled, expired';
