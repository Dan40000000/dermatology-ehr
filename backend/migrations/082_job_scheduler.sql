-- Job Scheduler System for Dermatology CRM
-- Comprehensive scheduled job management with locking, execution history, and retry logic

-- ============================================
-- SCHEDULED JOBS TABLE
-- ============================================
-- Stores job definitions including cron expressions and handlers

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text REFERENCES tenants(id),  -- NULL for system-wide jobs

  -- Job identification
  job_name text NOT NULL UNIQUE,
  job_type text NOT NULL,  -- daily, weekly, monthly, quarterly, custom
  description text,

  -- Scheduling
  cron_expression text NOT NULL,  -- Standard cron format: minute hour day month weekday
  timezone text DEFAULT 'America/New_York',

  -- Handler configuration
  handler_service text NOT NULL,  -- Service class name (e.g., 'birthdayService')
  handler_method text NOT NULL,   -- Method to call (e.g., 'processBirthdays')

  -- Job configuration
  config jsonb DEFAULT '{}',
  -- Example: {"batchSize": 100, "retryAttempts": 3, "timeoutMs": 300000}

  -- State management
  is_active boolean DEFAULT true,
  is_system_job boolean DEFAULT true,  -- System jobs cannot be deleted by users

  -- Execution tracking
  last_run_at timestamptz,
  last_run_status text,  -- success, failed, timeout, skipped
  last_run_duration_ms integer,
  last_error text,
  next_run_at timestamptz,

  -- Retry configuration
  max_retries integer DEFAULT 3,
  retry_delay_ms integer DEFAULT 60000,  -- 1 minute default
  current_retry_count integer DEFAULT 0,

  -- Statistics
  total_runs integer DEFAULT 0,
  successful_runs integer DEFAULT 0,
  failed_runs integer DEFAULT 0,

  -- Metadata
  tags text[] DEFAULT '{}',
  priority integer DEFAULT 5,  -- 1 (highest) to 10 (lowest)

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_name ON scheduled_jobs(job_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_active ON scheduled_jobs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tenant ON scheduled_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tags ON scheduled_jobs USING gin(tags);

-- ============================================
-- JOB EXECUTIONS TABLE
-- ============================================
-- Detailed history of job executions

CREATE TABLE IF NOT EXISTS job_executions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

  -- Execution timing
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,

  -- Status
  status text NOT NULL DEFAULT 'running',  -- running, success, failed, timeout, cancelled

  -- Results
  result jsonb DEFAULT '{}',
  -- Example: {"processedCount": 150, "sentEmails": 145, "skipped": 5}

  -- Error handling
  error_message text,
  error_stack text,
  error_code text,

  -- Execution context
  triggered_by text DEFAULT 'scheduler',  -- scheduler, manual, retry, api
  triggered_by_user text,

  -- Resource usage (optional tracking)
  memory_usage_mb numeric(10,2),

  -- Retry information
  retry_number integer DEFAULT 0,
  parent_execution_id text REFERENCES job_executions(id),

  -- Host information (for distributed environments)
  host_name text,
  process_id text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_job_executions_started ON job_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_job_started ON job_executions(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_running ON job_executions(status) WHERE status = 'running';

-- ============================================
-- JOB LOCKS TABLE
-- ============================================
-- Prevents concurrent execution of the same job

CREATE TABLE IF NOT EXISTS job_locks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_name text NOT NULL UNIQUE,

  -- Lock information
  locked_by text NOT NULL,  -- Instance/process identifier
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  -- Execution reference
  execution_id text REFERENCES job_executions(id),

  -- Heartbeat for long-running jobs
  last_heartbeat timestamptz DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_locks_name ON job_locks(job_name);
CREATE INDEX IF NOT EXISTS idx_job_locks_expires ON job_locks(expires_at);

-- ============================================
-- JOB DEPENDENCIES TABLE
-- ============================================
-- Define job dependencies (job B runs after job A completes)

CREATE TABLE IF NOT EXISTS job_dependencies (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  depends_on_job_id text NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

  -- Dependency conditions
  require_success boolean DEFAULT true,  -- Only trigger if dependency succeeded
  delay_ms integer DEFAULT 0,  -- Delay after dependency completes

  created_at timestamptz DEFAULT now(),

  UNIQUE(job_id, depends_on_job_id),
  CHECK(job_id != depends_on_job_id)  -- Prevent self-reference
);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_job ON job_dependencies(job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_depends ON job_dependencies(depends_on_job_id);

-- ============================================
-- JOB ALERTS TABLE
-- ============================================
-- Configure alerts for job failures or anomalies

CREATE TABLE IF NOT EXISTS job_alerts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id text REFERENCES scheduled_jobs(id) ON DELETE CASCADE,  -- NULL for global alerts

  alert_type text NOT NULL,  -- failure, timeout, threshold, success_rate

  -- Alert configuration
  config jsonb NOT NULL DEFAULT '{}',
  -- Example for threshold: {"metric": "duration_ms", "operator": ">", "value": 300000}
  -- Example for success_rate: {"window_hours": 24, "min_success_rate": 0.9}

  -- Notification settings
  notify_email text[],
  notify_webhook text,
  notify_slack_channel text,

  -- State
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_job ON job_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_active ON job_alerts(is_active) WHERE is_active = true;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to acquire a job lock
CREATE OR REPLACE FUNCTION acquire_job_lock(
  p_job_name text,
  p_locked_by text,
  p_lock_duration_ms integer DEFAULT 300000  -- 5 minutes default
)
RETURNS boolean AS $$
DECLARE
  v_acquired boolean;
BEGIN
  -- Try to insert new lock or update expired lock
  INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
  VALUES (
    p_job_name,
    p_locked_by,
    now(),
    now() + (p_lock_duration_ms || ' milliseconds')::interval
  )
  ON CONFLICT (job_name) DO UPDATE
  SET locked_by = p_locked_by,
      locked_at = now(),
      expires_at = now() + (p_lock_duration_ms || ' milliseconds')::interval,
      last_heartbeat = now()
  WHERE job_locks.expires_at < now();  -- Only update if lock expired

  -- Check if we got the lock
  SELECT locked_by = p_locked_by INTO v_acquired
  FROM job_locks
  WHERE job_name = p_job_name;

  RETURN COALESCE(v_acquired, false);
END;
$$ LANGUAGE plpgsql;

-- Function to release a job lock
CREATE OR REPLACE FUNCTION release_job_lock(
  p_job_name text,
  p_locked_by text
)
RETURNS boolean AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM job_locks
  WHERE job_name = p_job_name
    AND locked_by = p_locked_by;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to extend lock (heartbeat)
CREATE OR REPLACE FUNCTION extend_job_lock(
  p_job_name text,
  p_locked_by text,
  p_extend_ms integer DEFAULT 300000
)
RETURNS boolean AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE job_locks
  SET expires_at = now() + (p_extend_ms || ' milliseconds')::interval,
      last_heartbeat = now()
  WHERE job_name = p_job_name
    AND locked_by = p_locked_by;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get due jobs
CREATE OR REPLACE FUNCTION get_due_jobs(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id text,
  job_name text,
  job_type text,
  cron_expression text,
  handler_service text,
  handler_method text,
  config jsonb,
  next_run_at timestamptz,
  priority integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sj.id,
    sj.job_name,
    sj.job_type,
    sj.cron_expression,
    sj.handler_service,
    sj.handler_method,
    sj.config,
    sj.next_run_at,
    sj.priority
  FROM scheduled_jobs sj
  LEFT JOIN job_locks jl ON sj.job_name = jl.job_name AND jl.expires_at > now()
  WHERE sj.is_active = true
    AND sj.next_run_at <= now()
    AND jl.id IS NULL  -- Not locked
  ORDER BY sj.priority ASC, sj.next_run_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get job statistics
CREATE OR REPLACE FUNCTION get_job_statistics(
  p_job_id text DEFAULT NULL,
  p_hours integer DEFAULT 24
)
RETURNS TABLE(
  job_id text,
  job_name text,
  total_executions bigint,
  successful_executions bigint,
  failed_executions bigint,
  avg_duration_ms numeric,
  min_duration_ms integer,
  max_duration_ms integer,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sj.id as job_id,
    sj.job_name,
    COUNT(je.id) as total_executions,
    COUNT(je.id) FILTER (WHERE je.status = 'success') as successful_executions,
    COUNT(je.id) FILTER (WHERE je.status = 'failed') as failed_executions,
    AVG(je.duration_ms)::numeric as avg_duration_ms,
    MIN(je.duration_ms) as min_duration_ms,
    MAX(je.duration_ms) as max_duration_ms,
    CASE
      WHEN COUNT(je.id) > 0 THEN
        (COUNT(je.id) FILTER (WHERE je.status = 'success')::numeric / COUNT(je.id)::numeric * 100)
      ELSE 0
    END as success_rate
  FROM scheduled_jobs sj
  LEFT JOIN job_executions je ON sj.id = je.job_id
    AND je.started_at >= now() - (p_hours || ' hours')::interval
  WHERE (p_job_id IS NULL OR sj.id = p_job_id)
  GROUP BY sj.id, sj.job_name
  ORDER BY sj.job_name;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old executions
CREATE OR REPLACE FUNCTION cleanup_job_executions(
  p_retention_days integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM job_executions
  WHERE started_at < now() - (p_retention_days || ' days')::interval
    AND status != 'running';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM job_locks
  WHERE expires_at < now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_scheduled_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_jobs_updated_at ON scheduled_jobs;
CREATE TRIGGER scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_jobs_updated_at();

-- ============================================
-- SEED DEFAULT SCHEDULED JOBS
-- ============================================

-- Daily Jobs (6:00 AM - 11:00 AM)
INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
VALUES
  ('daily-birthday-processing', 'daily', 'Process and send birthday messages to patients', '0 6 * * *', 'patientEngagementService', 'processBirthdays', '{"batchSize": 100, "messageType": "birthday"}', 3, ARRAY['patient-engagement', 'messaging']),
  ('daily-anniversary-processing', 'daily', 'Process and send care anniversary messages', '0 6 * * *', 'patientEngagementService', 'processAnniversaries', '{"batchSize": 100, "messageType": "anniversary"}', 3, ARRAY['patient-engagement', 'messaging']),
  ('daily-appointment-reminders', 'daily', 'Send 24-hour appointment reminder messages', '0 7 * * *', 'appointmentReminderService', 'sendDailyReminders', '{"hoursAhead": 24, "channels": ["sms", "email"]}', 2, ARRAY['appointments', 'messaging', 'critical']),
  ('daily-credential-expiration-check', 'daily', 'Check for expiring provider credentials and certifications', '0 8 * * *', 'credentialService', 'checkExpirations', '{"daysThreshold": 30, "notifyAdmin": true}', 4, ARRAY['compliance', 'credentials']),
  ('daily-denial-processing', 'daily', 'Process and categorize claim denials for follow-up', '0 9 * * *', 'claimDenialService', 'processDenials', '{"autoCategorizе": true, "prioritizeByAmount": true}', 3, ARRAY['billing', 'claims', 'rcm']),
  ('daily-expiration-alerts', 'daily', 'Check inventory and medication expirations', '0 8 * * *', 'inventoryService', 'checkExpirations', '{"daysThreshold": 90, "notifyTypes": ["medication", "injectable", "supply"]}', 4, ARRAY['inventory', 'compliance']),
  ('daily-stalled-referral-alerts', 'daily', 'Flag referrals that have been pending for more than 5 days', '0 9 * * *', 'referralService', 'checkStalledReferrals', '{"stalledDays": 5, "notifyProvider": true}', 4, ARRAY['referrals', 'care-coordination']),
  ('daily-care-gap-identification', 'daily', 'Identify quality measure care gaps for patient outreach', '0 10 * * *', 'qualityMeasureService', 'identifyCareGaps', '{"measureTypes": ["preventive", "chronic"], "outreachEnabled": true}', 3, ARRAY['quality', 'mips', 'care-gaps']),
  ('daily-payment-plan-reminders', 'daily', 'Send reminders for upcoming payment plan installments', '0 10 * * *', 'paymentPlanService', 'sendReminders', '{"daysBeforeDue": 3, "channels": ["sms", "email"]}', 4, ARRAY['billing', 'payments', 'messaging']),
  ('daily-adherence-reminders', 'daily', 'Send treatment adherence and medication reminders', '0 9 * * *', 'adherenceService', 'sendReminders', '{"treatmentTypes": ["phototherapy", "biologic", "topical"]}', 3, ARRAY['patient-care', 'adherence', 'messaging']),
  ('daily-survey-processing', 'daily', 'Process and send scheduled patient satisfaction surveys', '0 11 * * *', 'surveyService', 'processScheduledSurveys', '{"surveyTypes": ["post_visit", "nps", "satisfaction"]}', 5, ARRAY['patient-engagement', 'surveys'])
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  handler_service = EXCLUDED.handler_service,
  handler_method = EXCLUDED.handler_method,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Weekly Jobs
INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
VALUES
  ('weekly-overtime-check', 'weekly', 'Calculate overtime risks for staff scheduling', '0 8 * * 1', 'staffSchedulingService', 'calculateOvertimeRisks', '{"thresholdHours": 35, "notifyManagers": true}', 4, ARRAY['staff', 'scheduling', 'payroll']),
  ('weekly-ar-aging-report', 'weekly', 'Generate accounts receivable aging report', '0 7 * * 1', 'arService', 'generateAgingReport', '{"agingBuckets": [30, 60, 90, 120], "includeDetails": true}', 3, ARRAY['billing', 'reports', 'rcm']),
  ('weekly-no-show-followup', 'weekly', 'Follow up with patients who no-showed last week', '0 9 * * 1', 'appointmentService', 'processNoShowFollowups', '{"lookbackDays": 7, "excludeRescheduled": true}', 4, ARRAY['appointments', 'patient-engagement']),
  ('weekly-recall-campaigns', 'weekly', 'Process recall outreach for overdue patients', '0 9 * * 2', 'recallService', 'processRecallCampaigns', '{"recallTypes": ["annual_exam", "skin_check", "followup"], "channels": ["sms", "email", "phone"]}', 3, ARRAY['recalls', 'patient-engagement', 'messaging']),
  ('weekly-waitlist-processing', 'daily', 'Match waitlist patients to available appointment openings', '0 18 * * *', 'waitlistService', 'processWaitlistMatches', '{"lookAheadDays": 14, "autoOffer": true}', 3, ARRAY['waitlist', 'appointments', 'scheduling'])
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  handler_service = EXCLUDED.handler_service,
  handler_method = EXCLUDED.handler_method,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Monthly Jobs (1st of month)
INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
VALUES
  ('monthly-mips-report', 'monthly', 'Generate MIPS progress and performance report', '0 8 1 * *', 'mipsService', 'generateMonthlyReport', '{"includeGapAnalysis": true, "benchmarkComparison": true}', 2, ARRAY['quality', 'mips', 'reports', 'compliance']),
  ('monthly-training-compliance', 'monthly', 'Generate staff training compliance report', '0 9 1 * *', 'trainingService', 'generateComplianceReport', '{"includeExpiring": true, "notifyNonCompliant": true}', 3, ARRAY['compliance', 'training', 'staff', 'reports']),
  ('monthly-revenue-analytics', 'monthly', 'Generate monthly revenue summary and analytics', '0 7 1 * *', 'revenueService', 'generateMonthlyAnalytics', '{"compareLastMonth": true, "compareLastYear": true}', 2, ARRAY['billing', 'revenue', 'reports', 'analytics']),
  ('monthly-patient-engagement-report', 'monthly', 'Generate patient engagement metrics report', '0 10 1 * *', 'engagementService', 'generateMonthlyReport', '{"metrics": ["portal_usage", "message_response", "survey_completion"]}', 4, ARRAY['patient-engagement', 'reports', 'analytics']),
  ('monthly-loyalty-tier-evaluation', 'monthly', 'Evaluate and update patient loyalty program tiers', '0 6 1 * *', 'loyaltyService', 'evaluateTiers', '{"autoUpgrade": true, "notifyChanges": true}', 5, ARRAY['patient-engagement', 'loyalty', 'cosmetic'])
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  handler_service = EXCLUDED.handler_service,
  handler_method = EXCLUDED.handler_method,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();

-- Quarterly Jobs (1st of quarter months: Jan, Apr, Jul, Oct)
INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
VALUES
  ('quarterly-mips-submission-prep', 'quarterly', 'Prepare MIPS data for quarterly submission review', '0 8 1 1,4,7,10 *', 'mipsService', 'prepareQuarterlySubmission', '{"validateData": true, "generatePreview": true}', 1, ARRAY['quality', 'mips', 'compliance', 'critical']),
  ('quarterly-contract-review', 'quarterly', 'Review payer contracts for renewal and renegotiation', '0 9 1 1,4,7,10 *', 'contractService', 'reviewContracts', '{"expiringWithinDays": 90, "notifyAdmin": true}', 3, ARRAY['billing', 'contracts', 'payers'])
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  handler_service = EXCLUDED.handler_service,
  handler_method = EXCLUDED.handler_method,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();

-- System Maintenance Jobs
INSERT INTO scheduled_jobs (job_name, job_type, description, cron_expression, handler_service, handler_method, config, priority, tags)
VALUES
  ('system-cleanup-executions', 'daily', 'Clean up old job execution records', '0 2 * * *', 'jobSchedulerService', 'cleanupExecutions', '{"retentionDays": 30}', 8, ARRAY['system', 'maintenance']),
  ('system-cleanup-locks', 'custom', 'Clean up expired job locks', '*/15 * * * *', 'jobSchedulerService', 'cleanupExpiredLocks', '{}', 9, ARRAY['system', 'maintenance']),
  ('system-health-check', 'custom', 'System health check and monitoring', '*/5 * * * *', 'healthService', 'performHealthCheck', '{"checkDatabase": true, "checkServices": true}', 1, ARRAY['system', 'monitoring', 'critical'])
ON CONFLICT (job_name) DO UPDATE SET
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  handler_service = EXCLUDED.handler_service,
  handler_method = EXCLUDED.handler_method,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  tags = EXCLUDED.tags,
  updated_at = now();

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Job dashboard view
CREATE OR REPLACE VIEW v_job_dashboard AS
SELECT
  sj.id,
  sj.job_name,
  sj.job_type,
  sj.description,
  sj.is_active,
  sj.priority,
  sj.tags,
  sj.last_run_at,
  sj.last_run_status,
  sj.last_run_duration_ms,
  sj.next_run_at,
  sj.total_runs,
  sj.successful_runs,
  sj.failed_runs,
  CASE
    WHEN sj.total_runs > 0 THEN
      ROUND((sj.successful_runs::numeric / sj.total_runs::numeric) * 100, 2)
    ELSE 0
  END as success_rate,
  jl.locked_by IS NOT NULL as is_locked,
  jl.locked_at,
  jl.expires_at as lock_expires_at
FROM scheduled_jobs sj
LEFT JOIN job_locks jl ON sj.job_name = jl.job_name AND jl.expires_at > now()
ORDER BY sj.priority ASC, sj.next_run_at ASC;

-- Recent executions view
CREATE OR REPLACE VIEW v_recent_job_executions AS
SELECT
  je.id,
  je.job_id,
  sj.job_name,
  sj.job_type,
  je.started_at,
  je.completed_at,
  je.duration_ms,
  je.status,
  je.error_message,
  je.triggered_by,
  je.triggered_by_user,
  je.result
FROM job_executions je
JOIN scheduled_jobs sj ON je.job_id = sj.id
WHERE je.started_at >= now() - interval '7 days'
ORDER BY je.started_at DESC;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE scheduled_jobs IS 'Stores scheduled job definitions with cron expressions and handler configuration';
COMMENT ON TABLE job_executions IS 'Detailed execution history for all scheduled jobs';
COMMENT ON TABLE job_locks IS 'Distributed locking mechanism to prevent concurrent job execution';
COMMENT ON TABLE job_dependencies IS 'Defines execution dependencies between jobs';
COMMENT ON TABLE job_alerts IS 'Alert configuration for job failures and anomalies';

COMMENT ON FUNCTION acquire_job_lock IS 'Attempts to acquire a distributed lock for a job, returns true if successful';
COMMENT ON FUNCTION release_job_lock IS 'Releases a previously acquired job lock';
COMMENT ON FUNCTION extend_job_lock IS 'Extends the expiration time of an existing lock (heartbeat)';
COMMENT ON FUNCTION get_due_jobs IS 'Returns jobs that are due for execution and not currently locked';
COMMENT ON FUNCTION get_job_statistics IS 'Returns execution statistics for jobs within a time window';
