-- Analytics and Dashboard System Migration
-- Creates tables for metrics tracking, dashboard widgets, saved reports, KPI targets, and caching

-- =====================================================
-- DAILY METRICS TABLE
-- Store aggregated daily metrics for fast dashboard queries
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- practice, provider, revenue, quality, operations, engagement, inventory
    metric_name VARCHAR(255) NOT NULL,
    value DECIMAL(15,4) NOT NULL DEFAULT 0,
    dimensions JSONB DEFAULT '{}'::jsonb, -- Additional dimensions like provider_id, location_id, payer_id
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT daily_metrics_unique UNIQUE(tenant_id, metric_date, metric_type, metric_name, dimensions)
);

CREATE INDEX idx_daily_metrics_tenant_date ON daily_metrics(tenant_id, metric_date DESC);
CREATE INDEX idx_daily_metrics_type ON daily_metrics(tenant_id, metric_type, metric_date DESC);
CREATE INDEX idx_daily_metrics_name ON daily_metrics(tenant_id, metric_name, metric_date DESC);
CREATE INDEX idx_daily_metrics_dimensions ON daily_metrics USING GIN(dimensions);

-- =====================================================
-- DASHBOARD WIDGETS TABLE
-- Configurable dashboard widgets per user/dashboard type
-- =====================================================
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for default widgets
    dashboard_type VARCHAR(100) NOT NULL, -- practice, provider, revenue, quality, operations, engagement, inventory
    widget_name VARCHAR(255) NOT NULL,
    widget_type VARCHAR(100) NOT NULL, -- number, chart, table, gauge, progress, list
    config JSONB DEFAULT '{}'::jsonb, -- Widget-specific configuration
    -- {
    --   "title": "...",
    --   "metric": "...",
    --   "chartType": "line|bar|pie|donut",
    --   "dateRange": "today|week|month|quarter|year|custom",
    --   "aggregation": "sum|avg|count|min|max",
    --   "filters": {},
    --   "thresholds": { "warning": 80, "critical": 60 },
    --   "refreshInterval": 300
    -- }
    position INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1, -- Grid columns (1-4)
    height INTEGER NOT NULL DEFAULT 1, -- Grid rows (1-3)
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dashboard_widgets_tenant ON dashboard_widgets(tenant_id, dashboard_type);
CREATE INDEX idx_dashboard_widgets_user ON dashboard_widgets(tenant_id, user_id, dashboard_type);
CREATE INDEX idx_dashboard_widgets_visible ON dashboard_widgets(tenant_id, dashboard_type, is_visible, position);

-- =====================================================
-- SAVED REPORTS TABLE
-- User-saved report configurations for quick access
-- =====================================================
CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    report_type VARCHAR(100) NOT NULL, -- revenue, quality, operations, provider, patient, custom
    filters JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "dateRange": { "start": "...", "end": "..." },
    --   "providers": [...],
    --   "locations": [...],
    --   "payers": [...],
    --   "measures": [...],
    --   "customFilters": {}
    -- }
    columns JSONB DEFAULT '[]'::jsonb, -- Selected columns for report
    sort_by VARCHAR(255),
    sort_order VARCHAR(4) DEFAULT 'DESC',
    group_by TEXT[], -- Grouping columns
    schedule JSONB, -- Scheduled report configuration
    -- {
    --   "enabled": true,
    --   "frequency": "daily|weekly|monthly",
    --   "dayOfWeek": 1,
    --   "dayOfMonth": 1,
    --   "time": "08:00",
    --   "recipients": ["email1", "email2"],
    --   "format": "pdf|csv|excel"
    -- }
    is_public BOOLEAN DEFAULT FALSE, -- Shared with all users in tenant
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_reports_tenant ON saved_reports(tenant_id);
CREATE INDEX idx_saved_reports_type ON saved_reports(tenant_id, report_type);
CREATE INDEX idx_saved_reports_creator ON saved_reports(tenant_id, created_by);
CREATE INDEX idx_saved_reports_public ON saved_reports(tenant_id, is_public);

-- =====================================================
-- KPI TARGETS TABLE
-- Define targets for key performance indicators
-- =====================================================
CREATE TABLE IF NOT EXISTS kpi_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kpi_name VARCHAR(255) NOT NULL,
    kpi_category VARCHAR(100) NOT NULL, -- revenue, quality, operations, engagement
    target_value DECIMAL(15,4) NOT NULL,
    target_type VARCHAR(50) DEFAULT 'minimum', -- minimum, maximum, range
    warning_threshold DECIMAL(15,4), -- Yellow zone threshold
    critical_threshold DECIMAL(15,4), -- Red zone threshold
    period_type VARCHAR(50) NOT NULL, -- daily, weekly, monthly, quarterly, yearly
    effective_date DATE NOT NULL,
    end_date DATE, -- NULL for ongoing
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE, -- NULL for practice-wide
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE, -- NULL for all locations
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT kpi_targets_unique UNIQUE(tenant_id, kpi_name, period_type, effective_date, provider_id, location_id)
);

CREATE INDEX idx_kpi_targets_tenant ON kpi_targets(tenant_id, kpi_category, is_active);
CREATE INDEX idx_kpi_targets_name ON kpi_targets(tenant_id, kpi_name, is_active);
CREATE INDEX idx_kpi_targets_provider ON kpi_targets(tenant_id, provider_id, is_active);
CREATE INDEX idx_kpi_targets_effective ON kpi_targets(tenant_id, effective_date, end_date);

-- =====================================================
-- ANALYTICS CACHE TABLE
-- Cache expensive calculations with TTL
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cache_key VARCHAR(500) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT analytics_cache_unique UNIQUE(tenant_id, cache_key)
);

CREATE INDEX idx_analytics_cache_tenant ON analytics_cache(tenant_id);
CREATE INDEX idx_analytics_cache_key ON analytics_cache(tenant_id, cache_key);
CREATE INDEX idx_analytics_cache_expires ON analytics_cache(expires_at);

-- =====================================================
-- METRIC SNAPSHOTS TABLE
-- Historical snapshots for trend analysis
-- =====================================================
CREATE TABLE IF NOT EXISTS metric_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL, -- daily, weekly, monthly, quarterly, yearly
    dashboard_type VARCHAR(100) NOT NULL,
    metrics JSONB NOT NULL,
    -- Stores all dashboard metrics at time of snapshot
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metric_snapshots_tenant ON metric_snapshots(tenant_id, dashboard_type);
CREATE INDEX idx_metric_snapshots_date ON metric_snapshots(tenant_id, snapshot_date DESC);
CREATE INDEX idx_metric_snapshots_type ON metric_snapshots(tenant_id, snapshot_type, snapshot_date DESC);

-- =====================================================
-- BENCHMARK DATA TABLE
-- Industry benchmarks for comparison
-- =====================================================
CREATE TABLE IF NOT EXISTS benchmark_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(100) DEFAULT 'dermatology',
    practice_size VARCHAR(50), -- small, medium, large
    region VARCHAR(100),
    percentile_25 DECIMAL(15,4),
    percentile_50 DECIMAL(15,4),
    percentile_75 DECIMAL(15,4),
    percentile_90 DECIMAL(15,4),
    source VARCHAR(255), -- MGMA, specialty society, etc.
    year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT benchmark_data_unique UNIQUE(metric_name, specialty, practice_size, region, year)
);

CREATE INDEX idx_benchmark_data_metric ON benchmark_data(metric_name, specialty);
CREATE INDEX idx_benchmark_data_year ON benchmark_data(year DESC);

-- =====================================================
-- ALERT RULES TABLE
-- Configurable alerts based on metric thresholds
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_name VARCHAR(255) NOT NULL,
    condition VARCHAR(50) NOT NULL, -- above, below, equals, change_percent
    threshold_value DECIMAL(15,4) NOT NULL,
    comparison_period VARCHAR(50), -- For change_percent: previous_day, previous_week, etc.
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- info, warning, critical
    notification_channels JSONB DEFAULT '["in_app"]'::jsonb, -- in_app, email, sms
    recipients JSONB DEFAULT '[]'::jsonb, -- User IDs or roles
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    cooldown_minutes INTEGER DEFAULT 60, -- Min time between alerts
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_alert_rules_tenant ON analytics_alert_rules(tenant_id, is_active);
CREATE INDEX idx_analytics_alert_rules_metric ON analytics_alert_rules(tenant_id, metric_name, is_active);

-- =====================================================
-- ALERT HISTORY TABLE
-- Track fired alerts
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES analytics_alert_rules(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    threshold_value DECIMAL(15,4) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_alerts_tenant ON analytics_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_analytics_alerts_rule ON analytics_alerts(rule_id, created_at DESC);
CREATE INDEX idx_analytics_alerts_unacknowledged ON analytics_alerts(tenant_id, acknowledged, created_at DESC);

-- =====================================================
-- SEED DEFAULT DASHBOARD WIDGETS
-- =====================================================
INSERT INTO dashboard_widgets (tenant_id, dashboard_type, widget_name, widget_type, config, position, width, height, is_visible)
SELECT
    t.id,
    widgets.dashboard_type,
    widgets.widget_name,
    widgets.widget_type,
    widgets.config,
    widgets.position,
    widgets.width,
    widgets.height,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    -- Practice Overview Dashboard
    ('practice', 'Appointments Today', 'number', '{"metric": "appointments_today", "icon": "calendar"}'::jsonb, 1, 1, 1),
    ('practice', 'Patients Waiting', 'number', '{"metric": "patients_waiting", "icon": "users"}'::jsonb, 2, 1, 1),
    ('practice', 'Revenue Today', 'number', '{"metric": "revenue_today", "icon": "dollar", "format": "currency"}'::jsonb, 3, 1, 1),
    ('practice', 'Pending Tasks', 'number', '{"metric": "pending_tasks", "icon": "tasks"}'::jsonb, 4, 1, 1),
    ('practice', 'No-Shows Today', 'number', '{"metric": "no_shows_today", "icon": "x-circle", "threshold": {"warning": 2, "critical": 5}}'::jsonb, 5, 1, 1),
    ('practice', 'Critical Alerts', 'list', '{"metric": "critical_alerts", "maxItems": 5}'::jsonb, 6, 2, 2),

    -- Revenue Dashboard
    ('revenue', 'Total Revenue MTD', 'number', '{"metric": "revenue_mtd", "format": "currency"}'::jsonb, 1, 1, 1),
    ('revenue', 'Collections MTD', 'number', '{"metric": "collections_mtd", "format": "currency"}'::jsonb, 2, 1, 1),
    ('revenue', 'A/R Total', 'number', '{"metric": "ar_total", "format": "currency"}'::jsonb, 3, 1, 1),
    ('revenue', 'Days in A/R', 'number', '{"metric": "days_in_ar"}'::jsonb, 4, 1, 1),
    ('revenue', 'A/R Aging', 'chart', '{"metric": "ar_aging", "chartType": "bar"}'::jsonb, 5, 2, 2),
    ('revenue', 'Revenue Trend', 'chart', '{"metric": "revenue_trend", "chartType": "line"}'::jsonb, 7, 2, 2),
    ('revenue', 'Payer Mix', 'chart', '{"metric": "payer_mix", "chartType": "pie"}'::jsonb, 9, 1, 2),

    -- Quality Dashboard
    ('quality', 'MIPS Score', 'gauge', '{"metric": "mips_score", "min": 0, "max": 100}'::jsonb, 1, 1, 1),
    ('quality', 'Quality Score', 'number', '{"metric": "quality_score"}'::jsonb, 2, 1, 1),
    ('quality', 'Care Gaps', 'number', '{"metric": "care_gaps_count"}'::jsonb, 3, 1, 1),
    ('quality', 'PI Compliance', 'number', '{"metric": "pi_compliance", "format": "percent"}'::jsonb, 4, 1, 1),
    ('quality', 'Measure Performance', 'table', '{"metric": "measure_performance"}'::jsonb, 5, 2, 2),

    -- Operations Dashboard
    ('operations', 'No-Show Rate', 'number', '{"metric": "no_show_rate", "format": "percent"}'::jsonb, 1, 1, 1),
    ('operations', 'Avg Wait Time', 'number', '{"metric": "avg_wait_time", "format": "minutes"}'::jsonb, 2, 1, 1),
    ('operations', 'Utilization', 'number', '{"metric": "utilization_rate", "format": "percent"}'::jsonb, 3, 1, 1),
    ('operations', 'Waitlist Size', 'number', '{"metric": "waitlist_size"}'::jsonb, 4, 1, 1),
    ('operations', 'Appointment Status', 'chart', '{"metric": "appointment_status", "chartType": "donut"}'::jsonb, 5, 1, 2),

    -- Engagement Dashboard
    ('engagement', 'NPS Score', 'gauge', '{"metric": "nps_score", "min": -100, "max": 100}'::jsonb, 1, 1, 1),
    ('engagement', 'Survey Response Rate', 'number', '{"metric": "survey_response_rate", "format": "percent"}'::jsonb, 2, 1, 1),
    ('engagement', 'Avg Review Rating', 'number', '{"metric": "avg_review_rating"}'::jsonb, 3, 1, 1),
    ('engagement', 'Portal Adoption', 'number', '{"metric": "portal_adoption_rate", "format": "percent"}'::jsonb, 4, 1, 1),

    -- Inventory Dashboard
    ('inventory', 'Low Stock Items', 'number', '{"metric": "low_stock_count"}'::jsonb, 1, 1, 1),
    ('inventory', 'Expiring Items', 'number', '{"metric": "expiring_items_count"}'::jsonb, 2, 1, 1),
    ('inventory', 'Pending Orders', 'number', '{"metric": "pending_orders_count"}'::jsonb, 3, 1, 1),
    ('inventory', 'Inventory Value', 'number', '{"metric": "inventory_value", "format": "currency"}'::jsonb, 4, 1, 1)
) AS widgets(dashboard_type, widget_name, widget_type, config, position, width, height)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DEFAULT KPI TARGETS
-- =====================================================
INSERT INTO kpi_targets (tenant_id, kpi_name, kpi_category, target_value, target_type, warning_threshold, critical_threshold, period_type, effective_date, is_active)
SELECT
    t.id,
    targets.kpi_name,
    targets.kpi_category,
    targets.target_value,
    targets.target_type,
    targets.warning_threshold,
    targets.critical_threshold,
    targets.period_type,
    CURRENT_DATE,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    -- Revenue KPIs
    ('days_in_ar', 'revenue', 35.0, 'maximum', 40.0, 50.0, 'monthly'),
    ('clean_claim_rate', 'revenue', 95.0, 'minimum', 92.0, 88.0, 'monthly'),
    ('collection_rate', 'revenue', 95.0, 'minimum', 92.0, 88.0, 'monthly'),
    ('denial_rate', 'revenue', 5.0, 'maximum', 8.0, 12.0, 'monthly'),

    -- Quality KPIs
    ('mips_final_score', 'quality', 85.0, 'minimum', 75.0, 60.0, 'yearly'),
    ('quality_measure_avg', 'quality', 80.0, 'minimum', 70.0, 60.0, 'quarterly'),

    -- Operations KPIs
    ('no_show_rate', 'operations', 5.0, 'maximum', 8.0, 12.0, 'monthly'),
    ('avg_wait_time_minutes', 'operations', 15.0, 'maximum', 20.0, 30.0, 'monthly'),
    ('provider_utilization', 'operations', 85.0, 'minimum', 75.0, 65.0, 'monthly'),

    -- Engagement KPIs
    ('nps_score', 'engagement', 50.0, 'minimum', 30.0, 10.0, 'quarterly'),
    ('survey_response_rate', 'engagement', 30.0, 'minimum', 20.0, 10.0, 'monthly'),
    ('patient_satisfaction', 'engagement', 4.5, 'minimum', 4.0, 3.5, 'monthly')
) AS targets(kpi_name, kpi_category, target_value, target_type, warning_threshold, critical_threshold, period_type)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED INDUSTRY BENCHMARKS
-- =====================================================
INSERT INTO benchmark_data (metric_name, specialty, practice_size, percentile_25, percentile_50, percentile_75, percentile_90, source, year)
VALUES
    ('days_in_ar', 'dermatology', 'medium', 28.0, 35.0, 45.0, 55.0, 'MGMA', 2024),
    ('collection_rate', 'dermatology', 'medium', 92.0, 95.0, 97.0, 98.5, 'MGMA', 2024),
    ('denial_rate', 'dermatology', 'medium', 3.0, 5.0, 8.0, 12.0, 'MGMA', 2024),
    ('no_show_rate', 'dermatology', 'medium', 3.0, 5.0, 8.0, 12.0, 'AAD', 2024),
    ('provider_utilization', 'dermatology', 'medium', 70.0, 80.0, 85.0, 90.0, 'MGMA', 2024),
    ('avg_wait_time_minutes', 'dermatology', 'medium', 10.0, 15.0, 20.0, 30.0, 'Press Ganey', 2024),
    ('patient_satisfaction', 'dermatology', 'medium', 4.0, 4.3, 4.6, 4.8, 'Press Ganey', 2024),
    ('nps_score', 'dermatology', 'medium', 20.0, 40.0, 60.0, 75.0, 'Industry Survey', 2024)
ON CONFLICT DO NOTHING;

-- =====================================================
-- CLEANUP EXPIRED CACHE FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_analytics_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- UPDATE TIMESTAMP TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_analytics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_metrics_updated_at
    BEFORE UPDATE ON daily_metrics
    FOR EACH ROW EXECUTE FUNCTION update_analytics_timestamp();

CREATE TRIGGER dashboard_widgets_updated_at
    BEFORE UPDATE ON dashboard_widgets
    FOR EACH ROW EXECUTE FUNCTION update_analytics_timestamp();

CREATE TRIGGER saved_reports_updated_at
    BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION update_analytics_timestamp();

CREATE TRIGGER kpi_targets_updated_at
    BEFORE UPDATE ON kpi_targets
    FOR EACH ROW EXECUTE FUNCTION update_analytics_timestamp();

CREATE TRIGGER analytics_alert_rules_updated_at
    BEFORE UPDATE ON analytics_alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_analytics_timestamp();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE daily_metrics IS 'Pre-aggregated daily metrics for fast dashboard rendering';
COMMENT ON TABLE dashboard_widgets IS 'Configurable dashboard widget layouts per user and dashboard type';
COMMENT ON TABLE saved_reports IS 'User-saved report configurations with optional scheduling';
COMMENT ON TABLE kpi_targets IS 'Key Performance Indicator targets with thresholds';
COMMENT ON TABLE analytics_cache IS 'Cache for expensive analytics calculations';
COMMENT ON TABLE metric_snapshots IS 'Historical snapshots for trend analysis';
COMMENT ON TABLE benchmark_data IS 'Industry benchmarks for comparison';
COMMENT ON TABLE analytics_alert_rules IS 'Configurable alert rules based on metric thresholds';
COMMENT ON TABLE analytics_alerts IS 'History of triggered alerts';
