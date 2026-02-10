-- Marketing Referral Source Tracking System
-- Comprehensive tracking of how patients discover the practice,
-- with analytics for marketing ROI and physician referral management.

-- =====================================================
-- Referral Sources
-- Master list of all referral source types
-- =====================================================
CREATE TABLE IF NOT EXISTS referral_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Source classification
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
    'physician', 'patient', 'marketing', 'web', 'insurance', 'other'
  )),
  source_name VARCHAR(255) NOT NULL,

  -- Additional source details (flexible JSONB for different source types)
  -- For physician: { npi, specialty, practice_name, address, phone, fax }
  -- For patient: { referring_patient_id }
  -- For marketing: { campaign_id, medium, channel }
  -- For web: { platform, search_engine, landing_page }
  -- For insurance: { insurance_name, directory_type }
  -- For other: { description }
  source_details JSONB DEFAULT '{}'::JSONB,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT unique_tenant_source UNIQUE (tenant_id, source_type, source_name)
);

-- =====================================================
-- Marketing Campaigns
-- Track specific marketing initiatives
-- =====================================================
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Campaign identification
  campaign_name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL CHECK (campaign_type IN (
    'print', 'digital', 'social', 'email', 'tv', 'radio', 'referral_program', 'event', 'other'
  )),

  -- Campaign period
  start_date DATE NOT NULL,
  end_date DATE,

  -- Budget tracking (in cents)
  budget_cents INTEGER DEFAULT 0,
  spent_cents INTEGER DEFAULT 0,

  -- Tracking
  tracking_code VARCHAR(100) UNIQUE,
  landing_page_url TEXT,

  -- Campaign details
  description TEXT,
  target_audience TEXT,
  channels JSONB DEFAULT '[]'::JSONB, -- Array of channels used

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT unique_tenant_campaign UNIQUE (tenant_id, campaign_name)
);

-- =====================================================
-- Patient Referrals
-- Track individual patient referral attribution
-- =====================================================
CREATE TABLE IF NOT EXISTS patient_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Patient being referred
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Referral source (links to referral_sources table)
  referral_source_id UUID REFERENCES referral_sources(id) ON DELETE SET NULL,

  -- For physician referrals
  referring_provider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referring_provider_name VARCHAR(255),
  referring_provider_npi VARCHAR(20),
  referring_practice_name VARCHAR(255),

  -- Referral details
  referral_date DATE DEFAULT CURRENT_DATE,
  referral_reason TEXT,

  -- Campaign tracking
  campaign_code VARCHAR(100),
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,

  -- UTM tracking for web referrals
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),

  -- Conversion tracking
  first_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  first_appointment_date DATE,
  converted BOOLEAN DEFAULT false,
  conversion_date DATE,

  -- How they heard about us (free text)
  how_heard TEXT,

  -- Additional notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- Referral Analytics
-- Aggregated analytics by source and period
-- =====================================================
CREATE TABLE IF NOT EXISTS referral_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Source reference
  source_id UUID REFERENCES referral_sources(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,

  -- Time period (monthly aggregation)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type VARCHAR(20) DEFAULT 'monthly' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),

  -- Metrics
  new_patients INTEGER DEFAULT 0,
  total_appointments INTEGER DEFAULT 0,
  revenue_attributed_cents BIGINT DEFAULT 0,
  conversion_rate DECIMAL(5,4) DEFAULT 0, -- 0.0000 to 1.0000
  avg_patient_value_cents INTEGER DEFAULT 0,

  -- Cost metrics (for campaigns)
  cost_per_acquisition_cents INTEGER DEFAULT 0,
  return_on_investment DECIMAL(10,4) DEFAULT 0, -- ROI as decimal

  -- Retention metrics
  patients_retained INTEGER DEFAULT 0,
  retention_rate DECIMAL(5,4) DEFAULT 0,

  -- Audit
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_source_period UNIQUE (tenant_id, source_id, period_start, period_end),
  CONSTRAINT unique_campaign_period UNIQUE (tenant_id, campaign_id, period_start, period_end)
);

-- =====================================================
-- Referring Physicians
-- Detailed tracking for physician referrers
-- =====================================================
CREATE TABLE IF NOT EXISTS referring_physicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Physician details
  npi VARCHAR(20),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  credentials VARCHAR(50),
  specialty VARCHAR(100),

  -- Practice information
  practice_name VARCHAR(255),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),

  -- Contact information
  phone VARCHAR(50),
  fax VARCHAR(50),
  email VARCHAR(255),

  -- Relationship status
  is_active BOOLEAN DEFAULT true,
  relationship_notes TEXT,

  -- Preferred communication
  preferred_contact_method VARCHAR(50) CHECK (preferred_contact_method IN ('phone', 'fax', 'email', 'portal')),

  -- Stats (denormalized for quick access)
  total_referrals INTEGER DEFAULT 0,
  last_referral_date DATE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT unique_tenant_npi UNIQUE (tenant_id, npi)
);

-- =====================================================
-- Referral Source Options
-- Predefined "How did you hear about us?" options
-- =====================================================
CREATE TABLE IF NOT EXISTS referral_source_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Option details
  option_text VARCHAR(255) NOT NULL,
  option_category VARCHAR(50) NOT NULL CHECK (option_category IN (
    'physician', 'patient', 'marketing', 'web', 'insurance', 'other'
  )),

  -- For auto-linking
  auto_link_source_id UUID REFERENCES referral_sources(id) ON DELETE SET NULL,

  -- Display
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requires_details BOOLEAN DEFAULT false, -- If true, show a text field for more info

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Referral Sources
CREATE INDEX idx_referral_sources_tenant ON referral_sources(tenant_id);
CREATE INDEX idx_referral_sources_type ON referral_sources(tenant_id, source_type);
CREATE INDEX idx_referral_sources_active ON referral_sources(tenant_id, is_active) WHERE is_active = true;

-- Marketing Campaigns
CREATE INDEX idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id);
CREATE INDEX idx_marketing_campaigns_active ON marketing_campaigns(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_marketing_campaigns_dates ON marketing_campaigns(tenant_id, start_date, end_date);
CREATE INDEX idx_marketing_campaigns_tracking ON marketing_campaigns(tracking_code) WHERE tracking_code IS NOT NULL;

-- Patient Referrals
CREATE INDEX idx_patient_referrals_tenant ON patient_referrals(tenant_id);
CREATE INDEX idx_patient_referrals_patient ON patient_referrals(patient_id);
CREATE INDEX idx_patient_referrals_source ON patient_referrals(referral_source_id);
CREATE INDEX idx_patient_referrals_campaign ON patient_referrals(campaign_id);
CREATE INDEX idx_patient_referrals_date ON patient_referrals(tenant_id, referral_date DESC);
CREATE INDEX idx_patient_referrals_converted ON patient_referrals(tenant_id, converted);
CREATE INDEX idx_patient_referrals_campaign_code ON patient_referrals(campaign_code) WHERE campaign_code IS NOT NULL;

-- Referral Analytics
CREATE INDEX idx_referral_analytics_tenant ON referral_analytics(tenant_id);
CREATE INDEX idx_referral_analytics_source ON referral_analytics(source_id);
CREATE INDEX idx_referral_analytics_campaign ON referral_analytics(campaign_id);
CREATE INDEX idx_referral_analytics_period ON referral_analytics(tenant_id, period_start, period_end);

-- Referring Physicians
CREATE INDEX idx_referring_physicians_tenant ON referring_physicians(tenant_id);
CREATE INDEX idx_referring_physicians_npi ON referring_physicians(npi);
CREATE INDEX idx_referring_physicians_name ON referring_physicians(tenant_id, last_name, first_name);
CREATE INDEX idx_referring_physicians_active ON referring_physicians(tenant_id, is_active) WHERE is_active = true;

-- Referral Source Options
CREATE INDEX idx_referral_source_options_tenant ON referral_source_options(tenant_id);
CREATE INDEX idx_referral_source_options_category ON referral_source_options(tenant_id, option_category);
CREATE INDEX idx_referral_source_options_order ON referral_source_options(tenant_id, display_order);

-- =====================================================
-- Triggers
-- =====================================================

-- Update timestamp trigger for referral_sources
CREATE OR REPLACE FUNCTION update_referral_tracking_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER referral_sources_updated
  BEFORE UPDATE ON referral_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_tracking_timestamp();

CREATE TRIGGER marketing_campaigns_updated
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_tracking_timestamp();

CREATE TRIGGER patient_referrals_updated
  BEFORE UPDATE ON patient_referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_tracking_timestamp();

CREATE TRIGGER referral_analytics_updated
  BEFORE UPDATE ON referral_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_tracking_timestamp();

CREATE TRIGGER referring_physicians_updated
  BEFORE UPDATE ON referring_physicians
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_tracking_timestamp();

-- =====================================================
-- Views
-- =====================================================

-- Top referral sources view
CREATE OR REPLACE VIEW top_referral_sources AS
SELECT
  rs.id AS source_id,
  rs.tenant_id,
  rs.source_type,
  rs.source_name,
  COUNT(pr.id) AS total_referrals,
  COUNT(pr.id) FILTER (WHERE pr.converted = true) AS converted_referrals,
  ROUND(
    COUNT(pr.id) FILTER (WHERE pr.converted = true)::DECIMAL / NULLIF(COUNT(pr.id), 0) * 100,
    2
  ) AS conversion_rate_pct,
  MIN(pr.referral_date) AS first_referral,
  MAX(pr.referral_date) AS last_referral
FROM referral_sources rs
LEFT JOIN patient_referrals pr ON rs.id = pr.referral_source_id
WHERE rs.is_active = true
GROUP BY rs.id, rs.tenant_id, rs.source_type, rs.source_name;

-- Campaign performance view
CREATE OR REPLACE VIEW campaign_performance AS
SELECT
  mc.id AS campaign_id,
  mc.tenant_id,
  mc.campaign_name,
  mc.campaign_type,
  mc.start_date,
  mc.end_date,
  mc.budget_cents,
  mc.spent_cents,
  COUNT(pr.id) AS total_referrals,
  COUNT(pr.id) FILTER (WHERE pr.converted = true) AS conversions,
  CASE WHEN COUNT(pr.id) > 0
    THEN ROUND(mc.spent_cents::DECIMAL / COUNT(pr.id), 2)
    ELSE 0
  END AS cost_per_lead_cents,
  CASE WHEN COUNT(pr.id) FILTER (WHERE pr.converted = true) > 0
    THEN ROUND(mc.spent_cents::DECIMAL / COUNT(pr.id) FILTER (WHERE pr.converted = true), 2)
    ELSE 0
  END AS cost_per_acquisition_cents
FROM marketing_campaigns mc
LEFT JOIN patient_referrals pr ON mc.id = pr.campaign_id
GROUP BY mc.id, mc.tenant_id, mc.campaign_name, mc.campaign_type,
         mc.start_date, mc.end_date, mc.budget_cents, mc.spent_cents;

-- Physician referral summary view
CREATE OR REPLACE VIEW physician_referral_summary AS
SELECT
  rp.id AS physician_id,
  rp.tenant_id,
  rp.first_name || ' ' || rp.last_name AS physician_name,
  rp.credentials,
  rp.specialty,
  rp.practice_name,
  rp.total_referrals,
  rp.last_referral_date,
  COUNT(pr.id) FILTER (WHERE pr.converted = true) AS converted_patients,
  COUNT(pr.id) FILTER (WHERE pr.referral_date >= CURRENT_DATE - INTERVAL '30 days') AS referrals_last_30_days,
  COUNT(pr.id) FILTER (WHERE pr.referral_date >= CURRENT_DATE - INTERVAL '90 days') AS referrals_last_90_days
FROM referring_physicians rp
LEFT JOIN patient_referrals pr ON pr.referring_provider_npi = rp.npi AND pr.tenant_id = rp.tenant_id
WHERE rp.is_active = true
GROUP BY rp.id, rp.tenant_id, rp.first_name, rp.last_name, rp.credentials,
         rp.specialty, rp.practice_name, rp.total_referrals, rp.last_referral_date;

-- =====================================================
-- Seed Default Referral Source Options
-- =====================================================
INSERT INTO referral_source_options (id, tenant_id, option_text, option_category, display_order, requires_details)
VALUES
  (gen_random_uuid(), 'default', 'Another Doctor/Physician Referral', 'physician', 1, true),
  (gen_random_uuid(), 'default', 'Friend or Family Member', 'patient', 2, false),
  (gen_random_uuid(), 'default', 'Current Patient Referral', 'patient', 3, true),
  (gen_random_uuid(), 'default', 'Google Search', 'web', 4, false),
  (gen_random_uuid(), 'default', 'Bing/Yahoo Search', 'web', 5, false),
  (gen_random_uuid(), 'default', 'Facebook', 'web', 6, false),
  (gen_random_uuid(), 'default', 'Instagram', 'web', 7, false),
  (gen_random_uuid(), 'default', 'TikTok', 'web', 8, false),
  (gen_random_uuid(), 'default', 'YouTube', 'web', 9, false),
  (gen_random_uuid(), 'default', 'Practice Website', 'web', 10, false),
  (gen_random_uuid(), 'default', 'Healthgrades', 'web', 11, false),
  (gen_random_uuid(), 'default', 'Zocdoc', 'web', 12, false),
  (gen_random_uuid(), 'default', 'Yelp', 'web', 13, false),
  (gen_random_uuid(), 'default', 'Google Maps/Reviews', 'web', 14, false),
  (gen_random_uuid(), 'default', 'Insurance Provider Directory', 'insurance', 15, true),
  (gen_random_uuid(), 'default', 'Newspaper/Magazine Ad', 'marketing', 16, true),
  (gen_random_uuid(), 'default', 'TV Commercial', 'marketing', 17, true),
  (gen_random_uuid(), 'default', 'Radio Ad', 'marketing', 18, true),
  (gen_random_uuid(), 'default', 'Billboard', 'marketing', 19, false),
  (gen_random_uuid(), 'default', 'Mailer/Postcard', 'marketing', 20, false),
  (gen_random_uuid(), 'default', 'Email Newsletter', 'marketing', 21, false),
  (gen_random_uuid(), 'default', 'Community Event', 'marketing', 22, true),
  (gen_random_uuid(), 'default', 'Hospital Referral', 'other', 23, true),
  (gen_random_uuid(), 'default', 'Walk-in / Drove By', 'other', 24, false),
  (gen_random_uuid(), 'default', 'Other', 'other', 25, true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Comments for Documentation
-- =====================================================
COMMENT ON TABLE referral_sources IS 'Master list of referral source types for patient acquisition tracking';
COMMENT ON TABLE marketing_campaigns IS 'Marketing campaign tracking with budget and ROI analytics';
COMMENT ON TABLE patient_referrals IS 'Individual patient referral attribution linking patients to their acquisition source';
COMMENT ON TABLE referral_analytics IS 'Aggregated analytics by source and time period for reporting';
COMMENT ON TABLE referring_physicians IS 'Detailed tracking of referring physician relationships';
COMMENT ON TABLE referral_source_options IS 'Predefined options for "How did you hear about us?" intake question';
COMMENT ON COLUMN patient_referrals.campaign_code IS 'Tracking code from URL or promotional material';
COMMENT ON COLUMN patient_referrals.converted IS 'Whether the patient has completed their first appointment';
COMMENT ON COLUMN referral_analytics.conversion_rate IS 'Conversion rate as decimal (0.0000 to 1.0000)';
