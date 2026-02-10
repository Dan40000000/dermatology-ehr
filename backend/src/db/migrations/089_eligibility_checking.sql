-- Migration 089: Real-time Insurance Eligibility Checking System
-- Description: Comprehensive tables for eligibility requests/responses with X12 270/271 support
-- and payer configuration management

-- =====================================================
-- Eligibility Requests Table
-- Tracks all eligibility check requests sent to payers
-- =====================================================
CREATE TABLE IF NOT EXISTS eligibility_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,

  -- Patient and Payer identifiers
  patient_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,

  -- Service information
  service_type TEXT DEFAULT '30', -- X12 service type code (30 = Health Benefit Plan Coverage)
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Request metadata
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, timeout

  -- X12 270 transaction data
  x12_transaction_id TEXT, -- Unique ID for X12 transaction tracking
  x12_request_payload TEXT, -- Raw X12 270 request if needed for debugging

  -- Subscriber/Patient info from request
  member_id TEXT,
  subscriber_id TEXT,
  subscriber_first_name TEXT,
  subscriber_last_name TEXT,
  subscriber_dob DATE,
  patient_relationship TEXT DEFAULT 'self', -- self, spouse, child, other

  -- Provider information
  provider_npi TEXT,
  provider_tax_id TEXT,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Error tracking
  error_code TEXT,
  error_message TEXT,

  -- Timing
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_duration_ms INTEGER, -- How long the request took

  -- Cache control
  cache_key TEXT, -- For deduplication and caching
  cached_response_id TEXT, -- If we returned a cached response instead

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  -- Constraints
  CONSTRAINT fk_eligibility_requests_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE
);

-- Indexes for eligibility_requests
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_tenant ON eligibility_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_patient ON eligibility_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_payer ON eligibility_requests(payer_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_status ON eligibility_requests(status);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_date ON eligibility_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_cache_key ON eligibility_requests(cache_key);
CREATE INDEX IF NOT EXISTS idx_eligibility_requests_pending ON eligibility_requests(status, next_retry_at)
  WHERE status IN ('pending', 'processing');

-- =====================================================
-- Eligibility Responses Table
-- Stores parsed responses from eligibility checks
-- =====================================================
CREATE TABLE IF NOT EXISTS eligibility_responses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,

  -- Link to request
  request_id TEXT NOT NULL,

  -- Coverage status
  coverage_active BOOLEAN NOT NULL DEFAULT false,
  coverage_status TEXT, -- active, inactive, terminated, pending
  coverage_effective_date DATE,
  coverage_termination_date DATE,

  -- Plan information
  plan_name TEXT,
  plan_type TEXT, -- PPO, HMO, EPO, POS, etc.
  group_number TEXT,
  group_name TEXT,

  -- Cost sharing details (stored in cents for precision)
  copay_amount INTEGER, -- Specialist copay in cents
  copay_pcp_amount INTEGER, -- Primary care copay in cents
  copay_urgent_care INTEGER, -- Urgent care copay in cents
  copay_er INTEGER, -- Emergency room copay in cents

  -- Deductible information (in cents)
  deductible_individual INTEGER,
  deductible_family INTEGER,
  deductible_remaining INTEGER, -- How much of deductible is left
  deductible_met INTEGER, -- How much has been paid toward deductible

  -- Coinsurance
  coinsurance_pct DECIMAL(5,2), -- Percentage patient pays after deductible
  coinsurance_in_network DECIMAL(5,2),
  coinsurance_out_of_network DECIMAL(5,2),

  -- Out of pocket maximum (in cents)
  out_of_pocket_max INTEGER,
  out_of_pocket_remaining INTEGER,
  out_of_pocket_met INTEGER,

  -- Prior authorization requirements
  prior_auth_required BOOLEAN DEFAULT false,
  prior_auth_services TEXT[], -- Array of services requiring prior auth
  prior_auth_phone TEXT,
  prior_auth_fax TEXT,

  -- Referral requirements
  referral_required BOOLEAN DEFAULT false,
  pcp_required BOOLEAN DEFAULT false,
  pcp_name TEXT,
  pcp_npi TEXT,

  -- Network status
  in_network BOOLEAN DEFAULT true,
  network_name TEXT,

  -- Subscriber information (if different from patient)
  subscriber_name TEXT,
  subscriber_relationship TEXT,
  subscriber_dob DATE,

  -- Coordination of benefits
  cob_status TEXT, -- primary, secondary, tertiary

  -- Full coverage details (for complex/custom fields)
  coverage_details JSONB DEFAULT '{}'::jsonb,

  -- X12 271 response data
  x12_transaction_id TEXT,
  x12_response_payload TEXT, -- Raw X12 271 response for debugging
  x12_error_codes TEXT[], -- Any X12 reject/error codes

  -- Messages and notes
  messages JSONB DEFAULT '[]'::jsonb, -- Array of {type, code, message}

  -- Response metadata
  response_received_at TIMESTAMPTZ DEFAULT NOW(),
  response_source TEXT, -- clearinghouse name, 'mock', 'manual', etc.

  -- Cache metadata
  cache_expires_at TIMESTAMPTZ, -- When this response expires from cache
  is_cached_response BOOLEAN DEFAULT false,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_eligibility_responses_request FOREIGN KEY (request_id)
    REFERENCES eligibility_requests(id) ON DELETE CASCADE
);

-- Indexes for eligibility_responses
CREATE INDEX IF NOT EXISTS idx_eligibility_responses_tenant ON eligibility_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_responses_request ON eligibility_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_responses_coverage ON eligibility_responses(coverage_active);
CREATE INDEX IF NOT EXISTS idx_eligibility_responses_cache_expires ON eligibility_responses(cache_expires_at);
CREATE INDEX IF NOT EXISTS idx_eligibility_responses_received ON eligibility_responses(response_received_at);

-- =====================================================
-- Payer Configurations Table
-- Stores payer-specific settings for eligibility checking
-- =====================================================
CREATE TABLE IF NOT EXISTS payer_configurations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,

  -- Payer identification
  payer_id TEXT NOT NULL, -- Unique payer identifier (e.g., BCBS, AETNA)
  payer_name TEXT NOT NULL, -- Display name
  payer_type TEXT, -- commercial, medicare, medicaid, tricare, etc.

  -- Eligibility endpoint configuration
  eligibility_endpoint TEXT, -- API endpoint URL
  eligibility_method TEXT DEFAULT 'POST', -- HTTP method
  eligibility_format TEXT DEFAULT 'X12_270', -- X12_270, FHIR, REST, etc.

  -- Authentication
  api_credentials_encrypted TEXT, -- Encrypted JSON with credentials
  auth_type TEXT DEFAULT 'bearer', -- bearer, basic, api_key, oauth2
  auth_endpoint TEXT, -- OAuth token endpoint if needed

  -- Connection settings
  timeout_ms INTEGER DEFAULT 30000, -- Request timeout in milliseconds
  max_retries INTEGER DEFAULT 3, -- Maximum retry attempts
  retry_delay_ms INTEGER DEFAULT 1000, -- Delay between retries

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Caching settings
  cache_duration_hours INTEGER DEFAULT 24, -- How long to cache responses
  cache_enabled BOOLEAN DEFAULT true,

  -- X12 specific settings
  x12_sender_id TEXT,
  x12_receiver_id TEXT,
  x12_version TEXT DEFAULT '005010X279A1', -- X12 version

  -- Service type codes supported
  supported_service_types TEXT[] DEFAULT ARRAY['30'], -- X12 service type codes

  -- Feature flags
  supports_real_time BOOLEAN DEFAULT true,
  supports_batch BOOLEAN DEFAULT false,
  supports_270_271 BOOLEAN DEFAULT true,

  -- Contact information
  support_phone TEXT,
  support_email TEXT,
  support_portal_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_successful_check TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Constraints
  UNIQUE(tenant_id, payer_id)
);

-- Indexes for payer_configurations
CREATE INDEX IF NOT EXISTS idx_payer_configurations_tenant ON payer_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payer_configurations_payer_id ON payer_configurations(payer_id);
CREATE INDEX IF NOT EXISTS idx_payer_configurations_active ON payer_configurations(is_active);
CREATE INDEX IF NOT EXISTS idx_payer_configurations_type ON payer_configurations(payer_type);

-- =====================================================
-- Eligibility Cache Table
-- Fast lookup table for cached eligibility results
-- =====================================================
CREATE TABLE IF NOT EXISTS eligibility_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id TEXT NOT NULL,

  -- Cache key components
  cache_key TEXT NOT NULL, -- Hash of patient_id + payer_id + service_type
  patient_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  service_type TEXT DEFAULT '30',

  -- Cached response reference
  response_id TEXT NOT NULL,

  -- Cache metadata
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Quick access fields (denormalized for performance)
  coverage_active BOOLEAN,
  copay_amount INTEGER,
  deductible_remaining INTEGER,
  coinsurance_pct DECIMAL(5,2),
  out_of_pocket_remaining INTEGER,

  -- Constraints
  UNIQUE(tenant_id, cache_key),
  CONSTRAINT fk_eligibility_cache_response FOREIGN KEY (response_id)
    REFERENCES eligibility_responses(id) ON DELETE CASCADE
);

-- Indexes for eligibility_cache
CREATE INDEX IF NOT EXISTS idx_eligibility_cache_tenant ON eligibility_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_cache_key ON eligibility_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_eligibility_cache_patient ON eligibility_cache(patient_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_cache_expires ON eligibility_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_eligibility_cache_lookup ON eligibility_cache(tenant_id, patient_id, payer_id)
  WHERE expires_at > NOW();

-- =====================================================
-- Seed default payer configurations
-- =====================================================
INSERT INTO payer_configurations (
  id, tenant_id, payer_id, payer_name, payer_type,
  eligibility_endpoint, eligibility_format,
  timeout_ms, max_retries, cache_duration_hours,
  supports_real_time, supports_270_271,
  support_phone
) VALUES
  (gen_random_uuid()::TEXT, 'default', 'BCBS', 'Blue Cross Blue Shield', 'commercial',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   30000, 3, 24, true, true, '1-800-262-2583'),
  (gen_random_uuid()::TEXT, 'default', 'AETNA', 'Aetna', 'commercial',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   30000, 3, 24, true, true, '1-800-872-3862'),
  (gen_random_uuid()::TEXT, 'default', 'CIGNA', 'Cigna', 'commercial',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   30000, 3, 24, true, true, '1-800-244-6224'),
  (gen_random_uuid()::TEXT, 'default', 'UNITED', 'UnitedHealthcare', 'commercial',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   30000, 3, 24, true, true, '1-800-638-3120'),
  (gen_random_uuid()::TEXT, 'default', 'HUMANA', 'Humana', 'commercial',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   30000, 3, 24, true, true, '1-800-457-4708'),
  (gen_random_uuid()::TEXT, 'default', 'MEDICARE', 'Medicare', 'medicare',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   45000, 3, 24, true, true, '1-800-633-4227'),
  (gen_random_uuid()::TEXT, 'default', 'MEDICAID', 'Medicaid', 'medicaid',
   'https://api.availity.com/eligibility/v1/coverage', 'X12_270',
   45000, 3, 24, true, true, NULL)
ON CONFLICT (tenant_id, payer_id) DO NOTHING;

-- =====================================================
-- Functions for cache management
-- =====================================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_eligibility_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM eligibility_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create cache entry
CREATE OR REPLACE FUNCTION get_eligibility_from_cache(
  p_tenant_id TEXT,
  p_patient_id TEXT,
  p_payer_id TEXT,
  p_service_type TEXT DEFAULT '30'
)
RETURNS TABLE (
  response_id TEXT,
  coverage_active BOOLEAN,
  copay_amount INTEGER,
  deductible_remaining INTEGER,
  coinsurance_pct DECIMAL(5,2),
  out_of_pocket_remaining INTEGER,
  cached_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Update hit count and last accessed
  UPDATE eligibility_cache ec
  SET hit_count = hit_count + 1,
      last_accessed_at = NOW()
  WHERE ec.tenant_id = p_tenant_id
    AND ec.patient_id = p_patient_id
    AND ec.payer_id = p_payer_id
    AND ec.service_type = p_service_type
    AND ec.expires_at > NOW();

  -- Return cached data
  RETURN QUERY
  SELECT
    ec.response_id,
    ec.coverage_active,
    ec.copay_amount,
    ec.deductible_remaining,
    ec.coinsurance_pct,
    ec.out_of_pocket_remaining,
    ec.cached_at,
    ec.expires_at
  FROM eligibility_cache ec
  WHERE ec.tenant_id = p_tenant_id
    AND ec.patient_id = p_patient_id
    AND ec.payer_id = p_payer_id
    AND ec.service_type = p_service_type
    AND ec.expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Triggers for updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_eligibility_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_eligibility_requests_updated_at ON eligibility_requests;
CREATE TRIGGER trigger_eligibility_requests_updated_at
  BEFORE UPDATE ON eligibility_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_eligibility_updated_at();

DROP TRIGGER IF EXISTS trigger_payer_configurations_updated_at ON payer_configurations;
CREATE TRIGGER trigger_payer_configurations_updated_at
  BEFORE UPDATE ON payer_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_eligibility_updated_at();

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE eligibility_requests IS 'Tracks all eligibility verification requests sent to payers, including X12 270 transactions';
COMMENT ON TABLE eligibility_responses IS 'Stores parsed responses from eligibility checks, including X12 271 data and benefit details';
COMMENT ON TABLE payer_configurations IS 'Payer-specific configuration for eligibility checking including endpoints and credentials';
COMMENT ON TABLE eligibility_cache IS 'Fast lookup cache for recently verified eligibility data with 24-hour default TTL';

COMMENT ON COLUMN eligibility_requests.service_type IS 'X12 service type code: 30=Health Benefit Plan Coverage, 33=Chiropractic, 47=Hospital, etc.';
COMMENT ON COLUMN eligibility_requests.cache_key IS 'MD5 hash of patient_id+payer_id+service_type for cache lookups';
COMMENT ON COLUMN eligibility_responses.coverage_details IS 'JSONB containing full benefit details for complex or payer-specific fields';
COMMENT ON COLUMN payer_configurations.api_credentials_encrypted IS 'AES-256 encrypted JSON containing API keys, passwords, or OAuth credentials';
