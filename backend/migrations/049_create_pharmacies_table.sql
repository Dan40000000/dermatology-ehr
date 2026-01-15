-- Create pharmacies table if it doesn't exist
-- This is needed by the prescriptions endpoint

CREATE TABLE IF NOT EXISTS pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ncpdp_id VARCHAR(20) UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  fax VARCHAR(20),
  email VARCHAR(255),
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(10),
  is_preferred BOOLEAN DEFAULT false,
  is_24_hour BOOLEAN DEFAULT false,
  accepts_erx BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Additional columns from 030_eprescribing.sql
  chain VARCHAR(100),
  hours JSONB DEFAULT '{}',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  surescripts_enabled BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{}'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pharmacies_tenant ON pharmacies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_ncpdp ON pharmacies(ncpdp_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_name ON pharmacies(name);
CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies(city, state, zip);
CREATE INDEX IF NOT EXISTS idx_pharmacies_chain ON pharmacies(chain);

COMMENT ON TABLE pharmacies IS 'Pharmacy directory for e-prescribing and prescription management';
