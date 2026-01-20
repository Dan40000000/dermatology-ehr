-- ================================================
-- MIGRATION 022: METRICS TRACKING SYSTEM
-- ================================================
-- Created: 2026-01-19
-- Purpose: Track user efficiency metrics - clicks, time, navigation patterns
--          To prove "60-90 seconds per patient" efficiency claims
-- ================================================

-- ================================================
-- METRIC EVENTS TABLE
-- ================================================
-- Tracks individual user interaction events (clicks, navigation, task timing)

CREATE TABLE IF NOT EXISTS metric_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT, -- Browser session ID for grouping

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'navigation', 'task_start', 'task_end', 'page_load')),
  event_target TEXT, -- button ID, page name, task name
  event_value TEXT, -- additional context (JSON)
  event_metadata JSONB, -- flexible metadata storage

  -- Timing
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER, -- for task_end events, page load times

  -- Context
  page TEXT, -- current page/route
  patient_id TEXT,
  encounter_id TEXT,

  -- Performance tracking
  device_type TEXT, -- desktop, mobile, tablet
  browser TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_metric_events_user
ON metric_events(tenant_id, user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metric_events_session
ON metric_events(session_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metric_events_encounter
ON metric_events(encounter_id, timestamp)
WHERE encounter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_metric_events_patient
ON metric_events(patient_id, timestamp DESC)
WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_metric_events_type
ON metric_events(tenant_id, event_type, timestamp DESC);

-- Partial index for recent events (last 90 days) - most common query
CREATE INDEX IF NOT EXISTS idx_metric_events_recent
ON metric_events(tenant_id, timestamp DESC)
WHERE timestamp > NOW() - INTERVAL '90 days';

-- ================================================
-- ENCOUNTER METRICS TABLE
-- ================================================
-- Aggregated metrics per encounter for quick reporting

CREATE TABLE IF NOT EXISTS encounter_metrics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,

  -- Overall metrics
  total_duration_seconds INTEGER, -- Total time from encounter start to completion
  documentation_duration_seconds INTEGER, -- Time spent actually documenting
  click_count INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  navigation_count INTEGER DEFAULT 0,

  -- Section breakdown (time in seconds)
  time_in_notes_seconds INTEGER DEFAULT 0,
  time_in_orders_seconds INTEGER DEFAULT 0,
  time_in_photos_seconds INTEGER DEFAULT 0,
  time_in_prescriptions_seconds INTEGER DEFAULT 0,
  time_in_billing_seconds INTEGER DEFAULT 0,
  time_in_procedures_seconds INTEGER DEFAULT 0,

  -- Encounter context
  encounter_type TEXT, -- follow-up, new-patient, procedure
  is_new_patient BOOLEAN DEFAULT FALSE,
  complexity_score INTEGER, -- 1-5 based on CPT codes, diagnoses count

  -- Performance indicators
  efficiency_score DECIMAL(5,2), -- Calculated score based on benchmarks
  time_saved_seconds INTEGER, -- Compared to benchmark

  -- Comparison data
  clicks_vs_average INTEGER, -- How many clicks above/below average
  time_vs_average_seconds INTEGER, -- Time difference from average

  -- Timestamps
  encounter_started_at TIMESTAMPTZ,
  encounter_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_encounter_metrics UNIQUE (encounter_id)
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_encounter_metrics_provider
ON encounter_metrics(tenant_id, provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounter_metrics_patient
ON encounter_metrics(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounter_metrics_type
ON encounter_metrics(tenant_id, encounter_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounter_metrics_efficiency
ON encounter_metrics(tenant_id, efficiency_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encounter_metrics_recent
ON encounter_metrics(tenant_id, created_at DESC)
WHERE created_at > NOW() - INTERVAL '90 days';

-- Covering index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_encounter_metrics_dashboard
ON encounter_metrics(tenant_id, created_at DESC)
INCLUDE (provider_id, encounter_type, total_duration_seconds, click_count, efficiency_score);

-- ================================================
-- USER METRICS SUMMARY TABLE
-- ================================================
-- Aggregated metrics per user for quick leaderboards and comparisons

CREATE TABLE IF NOT EXISTS user_metrics_summary (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  period_start DATE NOT NULL, -- Start of reporting period
  period_end DATE NOT NULL,   -- End of reporting period
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),

  -- Volume metrics
  encounters_completed INTEGER DEFAULT 0,
  total_patients_seen INTEGER DEFAULT 0,

  -- Time metrics (averages in seconds)
  avg_encounter_duration_seconds INTEGER,
  avg_documentation_duration_seconds INTEGER,
  total_active_time_seconds INTEGER, -- Total time in system

  -- Click metrics
  avg_clicks_per_encounter INTEGER,
  total_clicks INTEGER DEFAULT 0,

  -- Efficiency metrics
  avg_efficiency_score DECIMAL(5,2),
  total_time_saved_seconds INTEGER,
  fastest_encounter_seconds INTEGER,

  -- Feature usage
  photos_captured INTEGER DEFAULT 0,
  prescriptions_written INTEGER DEFAULT 0,
  orders_placed INTEGER DEFAULT 0,
  ai_notes_used INTEGER DEFAULT 0,

  -- Rankings (within tenant)
  efficiency_rank INTEGER,
  speed_rank INTEGER,

  -- Benchmarks
  percentile_efficiency INTEGER, -- 0-100
  percentile_speed INTEGER,      -- 0-100

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_period UNIQUE (user_id, period_start, period_type)
);

-- Indexes for leaderboards and comparisons
CREATE INDEX IF NOT EXISTS idx_user_metrics_tenant_period
ON user_metrics_summary(tenant_id, period_type, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_user_metrics_user
ON user_metrics_summary(user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_user_metrics_efficiency
ON user_metrics_summary(tenant_id, period_type, avg_efficiency_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_metrics_speed
ON user_metrics_summary(tenant_id, period_type, avg_encounter_duration_seconds ASC);

-- ================================================
-- EFFICIENCY BENCHMARKS TABLE
-- ================================================
-- Store benchmark data for different encounter types

CREATE TABLE IF NOT EXISTS efficiency_benchmarks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT, -- NULL for system-wide benchmarks
  encounter_type TEXT NOT NULL,
  is_new_patient BOOLEAN DEFAULT FALSE,

  -- Benchmark values (in seconds)
  target_duration_seconds INTEGER NOT NULL,
  excellent_duration_seconds INTEGER NOT NULL, -- Top 10%
  average_duration_seconds INTEGER NOT NULL,   -- Median

  -- Click benchmarks
  target_clicks INTEGER NOT NULL,
  excellent_clicks INTEGER NOT NULL,
  average_clicks INTEGER NOT NULL,

  -- Industry comparison (optional)
  industry_average_duration_seconds INTEGER, -- e.g., ModMed: 270 seconds
  industry_name TEXT, -- e.g., "ModMed", "eClinicalWorks"

  -- Metadata
  sample_size INTEGER, -- How many encounters used to calculate
  last_calculated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_benchmark UNIQUE (tenant_id, encounter_type, is_new_patient)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_benchmarks_tenant
ON efficiency_benchmarks(tenant_id, is_active)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_benchmarks_type
ON efficiency_benchmarks(encounter_type, is_new_patient);

-- ================================================
-- FEATURE USAGE TRACKING TABLE
-- ================================================
-- Track which features are used most/least

CREATE TABLE IF NOT EXISTS feature_usage_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  feature_name TEXT NOT NULL, -- e.g., "ai_note_generation", "body_diagram", "photo_comparison"
  feature_category TEXT, -- e.g., "documentation", "imaging", "prescribing"

  -- Usage stats
  usage_count INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  avg_time_saved_seconds INTEGER,

  -- Period
  date DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_feature_date UNIQUE (tenant_id, feature_name, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_usage_tenant_date
ON feature_usage_stats(tenant_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_feature_usage_feature
ON feature_usage_stats(feature_name, date DESC);

CREATE INDEX IF NOT EXISTS idx_feature_usage_category
ON feature_usage_stats(tenant_id, feature_category, date DESC);

-- ================================================
-- EFFICIENCY ACHIEVEMENTS TABLE
-- ================================================
-- Gamification: Track user achievements and milestones

CREATE TABLE IF NOT EXISTS efficiency_achievements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'speed_demon',        -- 10 encounters under 2 minutes
    'click_minimalist',   -- 5 encounters under 10 clicks
    'efficiency_expert',  -- Average efficiency score > 90
    'time_saver',         -- Saved 1 hour in a day
    'consistency_king',   -- 20 encounters within 10% of average
    'quick_start',        -- First click within 5 seconds
    'power_user',         -- Used 10+ features in one day
    'perfect_week'        -- All encounters above benchmark for a week
  )),

  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  achievement_icon TEXT, -- emoji or icon name
  achievement_tier TEXT CHECK (achievement_tier IN ('bronze', 'silver', 'gold', 'platinum')),

  -- Achievement data
  achievement_value INTEGER, -- The count/score that earned the achievement
  earned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  is_displayed BOOLEAN DEFAULT TRUE, -- Can be hidden by user

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_achievement UNIQUE (user_id, achievement_type, earned_at::date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_achievements_user
ON efficiency_achievements(user_id, earned_at DESC);

CREATE INDEX IF NOT EXISTS idx_achievements_tenant
ON efficiency_achievements(tenant_id, earned_at DESC);

CREATE INDEX IF NOT EXISTS idx_achievements_type
ON efficiency_achievements(achievement_type, earned_at DESC);

-- ================================================
-- FUNCTIONS AND TRIGGERS
-- ================================================

-- Function to update encounter metrics timestamps
CREATE OR REPLACE FUNCTION update_encounter_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for encounter_metrics
CREATE TRIGGER trg_update_encounter_metrics_timestamp
BEFORE UPDATE ON encounter_metrics
FOR EACH ROW
EXECUTE FUNCTION update_encounter_metrics_timestamp();

-- Function to update user metrics summary timestamps
CREATE OR REPLACE FUNCTION update_user_metrics_summary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_metrics_summary
CREATE TRIGGER trg_update_user_metrics_summary_timestamp
BEFORE UPDATE ON user_metrics_summary
FOR EACH ROW
EXECUTE FUNCTION update_user_metrics_summary_timestamp();

-- ================================================
-- SEED DEFAULT BENCHMARKS
-- ================================================
-- Industry-standard benchmarks for comparison

INSERT INTO efficiency_benchmarks (
  tenant_id,
  encounter_type,
  is_new_patient,
  target_duration_seconds,
  excellent_duration_seconds,
  average_duration_seconds,
  target_clicks,
  excellent_clicks,
  average_clicks,
  industry_average_duration_seconds,
  industry_name,
  sample_size,
  is_active
) VALUES
  -- Follow-up encounters
  (NULL, 'follow-up', FALSE, 120, 90, 180, 10, 8, 15, 270, 'Industry Average', 1000, TRUE),

  -- New patient encounters
  (NULL, 'new-patient', TRUE, 240, 180, 360, 20, 15, 30, 420, 'Industry Average', 1000, TRUE),

  -- Procedure encounters
  (NULL, 'procedure', FALSE, 180, 120, 240, 15, 10, 20, 300, 'Industry Average', 500, TRUE),

  -- Quick visits
  (NULL, 'quick-visit', FALSE, 90, 60, 120, 8, 5, 12, 180, 'Industry Average', 800, TRUE)
ON CONFLICT (tenant_id, encounter_type, is_new_patient) DO NOTHING;

-- ================================================
-- VIEWS FOR ANALYTICS
-- ================================================

-- View: Recent efficiency trends (last 30 days)
CREATE OR REPLACE VIEW v_efficiency_trends_30d AS
SELECT
  em.tenant_id,
  em.provider_id,
  DATE(em.created_at) as date,
  em.encounter_type,
  COUNT(*) as encounter_count,
  AVG(em.total_duration_seconds) as avg_duration_seconds,
  AVG(em.click_count) as avg_clicks,
  AVG(em.efficiency_score) as avg_efficiency_score,
  SUM(em.time_saved_seconds) as total_time_saved_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY em.total_duration_seconds) as median_duration_seconds
FROM encounter_metrics em
WHERE em.created_at > NOW() - INTERVAL '30 days'
  AND em.encounter_completed_at IS NOT NULL
GROUP BY em.tenant_id, em.provider_id, DATE(em.created_at), em.encounter_type;

-- View: Provider leaderboard (current month)
CREATE OR REPLACE VIEW v_provider_leaderboard_current_month AS
SELECT
  em.tenant_id,
  em.provider_id,
  COUNT(*) as encounters_completed,
  AVG(em.total_duration_seconds) as avg_duration_seconds,
  AVG(em.click_count) as avg_clicks,
  AVG(em.efficiency_score) as avg_efficiency_score,
  SUM(em.time_saved_seconds) as total_time_saved_seconds,
  RANK() OVER (PARTITION BY em.tenant_id ORDER BY AVG(em.efficiency_score) DESC) as efficiency_rank,
  RANK() OVER (PARTITION BY em.tenant_id ORDER BY AVG(em.total_duration_seconds) ASC) as speed_rank
FROM encounter_metrics em
WHERE DATE_TRUNC('month', em.created_at) = DATE_TRUNC('month', CURRENT_DATE)
  AND em.encounter_completed_at IS NOT NULL
GROUP BY em.tenant_id, em.provider_id;

-- View: Feature usage heatmap
CREATE OR REPLACE VIEW v_feature_usage_heatmap AS
SELECT
  tenant_id,
  feature_name,
  feature_category,
  DATE_TRUNC('week', date) as week,
  SUM(usage_count) as total_usage,
  AVG(unique_users) as avg_unique_users,
  AVG(avg_time_saved_seconds) as avg_time_saved
FROM feature_usage_stats
WHERE date > CURRENT_DATE - INTERVAL '90 days'
GROUP BY tenant_id, feature_name, feature_category, DATE_TRUNC('week', date);

-- ================================================
-- TABLE STATISTICS AND OPTIMIZATION
-- ================================================

-- Analyze new tables
ANALYZE metric_events;
ANALYZE encounter_metrics;
ANALYZE user_metrics_summary;
ANALYZE efficiency_benchmarks;
ANALYZE feature_usage_stats;
ANALYZE efficiency_achievements;

-- Set autovacuum for high-traffic tables
ALTER TABLE metric_events SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE encounter_metrics SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- ================================================
-- COMMENTS FOR DOCUMENTATION
-- ================================================

COMMENT ON TABLE metric_events IS 'Tracks individual user interaction events for efficiency analysis';
COMMENT ON TABLE encounter_metrics IS 'Aggregated metrics per encounter for performance reporting';
COMMENT ON TABLE user_metrics_summary IS 'Summarized user performance metrics by time period';
COMMENT ON TABLE efficiency_benchmarks IS 'Benchmark data for different encounter types';
COMMENT ON TABLE feature_usage_stats IS 'Feature usage statistics for product analytics';
COMMENT ON TABLE efficiency_achievements IS 'User achievements and gamification milestones';

-- ================================================
-- MIGRATION COMPLETE
-- ================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 022: Metrics tracking system completed successfully';
  RAISE NOTICE 'Created 6 tables, multiple indexes, views, and seeded benchmark data';
  RAISE NOTICE 'Ready to track efficiency metrics and prove "60-90 seconds per patient" claims';
END
$$;
