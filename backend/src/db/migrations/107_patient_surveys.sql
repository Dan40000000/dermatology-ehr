-- Patient Surveys and NPS Tracking System
-- Comprehensive post-visit feedback collection with NPS scoring and review management
-- Enables patient experience monitoring and online reputation management

-- Survey Templates table
-- Stores reusable survey configurations
CREATE TABLE IF NOT EXISTS survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  survey_type VARCHAR(50) NOT NULL, -- post_visit, nps, feedback, satisfaction

  -- Questions configuration (JSONB array)
  -- Each question: { id, type, text, required, options?, category?, order }
  -- Types: nps, rating, stars, text, multiple_choice, checkbox
  questions JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Template settings
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Timing configuration
  send_delay_hours INTEGER DEFAULT 2, -- Hours after checkout to send
  reminder_delay_hours INTEGER DEFAULT 48, -- Hours after initial send for reminder
  expiration_hours INTEGER DEFAULT 168, -- 7 days default

  -- Display settings
  thank_you_message TEXT DEFAULT 'Thank you for your feedback!',
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#8b5cf6',

  -- Review redirect settings
  enable_review_prompt BOOLEAN DEFAULT true,
  review_prompt_threshold INTEGER DEFAULT 9, -- NPS score threshold for review prompt
  google_review_url TEXT,
  healthgrades_url TEXT,
  yelp_url TEXT,

  -- Audit fields
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Survey Invitations table
-- Tracks individual survey invitations sent to patients
CREATE TABLE IF NOT EXISTS survey_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Linkages
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,

  -- Unique access token for public survey link
  access_token VARCHAR(64) UNIQUE NOT NULL,

  -- Timing
  sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, opened, started, completed, expired, cancelled
  opened_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,

  -- Delivery tracking
  delivery_method VARCHAR(50) DEFAULT 'email', -- email, sms, both
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  delivery_error TEXT,

  -- Attribution
  checkout_user_id UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Survey Responses table
-- Stores completed survey submissions
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Linkage
  invitation_id UUID NOT NULL REFERENCES survey_invitations(id) ON DELETE CASCADE,

  -- Response data
  -- Array of: { question_id, question_text, answer, answer_type }
  question_responses JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- NPS specific fields (extracted for analytics)
  nps_score INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
  nps_category VARCHAR(20), -- promoter, passive, detractor

  -- Satisfaction scores (extracted for analytics)
  wait_time_rating INTEGER CHECK (wait_time_rating >= 1 AND wait_time_rating <= 5),
  staff_friendliness_rating INTEGER CHECK (staff_friendliness_rating >= 1 AND staff_friendliness_rating <= 5),
  provider_communication_rating INTEGER CHECK (provider_communication_rating >= 1 AND provider_communication_rating <= 5),
  facility_cleanliness_rating INTEGER CHECK (facility_cleanliness_rating >= 1 AND facility_cleanliness_rating <= 5),
  overall_satisfaction_rating INTEGER CHECK (overall_satisfaction_rating >= 1 AND overall_satisfaction_rating <= 5),

  -- Open-ended feedback
  comments TEXT,
  improvement_suggestions TEXT,

  -- Sentiment analysis (can be populated by AI)
  sentiment_score DECIMAL(3,2), -- -1 to 1
  sentiment_label VARCHAR(20), -- positive, neutral, negative
  key_themes TEXT[], -- Extracted themes from comments

  -- Response metadata
  response_time_seconds INTEGER, -- How long it took to complete
  device_type VARCHAR(50), -- mobile, tablet, desktop
  browser VARCHAR(100),
  ip_address INET,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NPS Scores table
-- Denormalized NPS data for fast analytics queries
CREATE TABLE IF NOT EXISTS nps_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Linkages
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  response_id UUID REFERENCES survey_responses(id) ON DELETE CASCADE,

  -- NPS data
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  category VARCHAR(20) NOT NULL, -- promoter (9-10), passive (7-8), detractor (0-6)

  -- Context
  visit_type VARCHAR(100),
  appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE SET NULL,

  -- Timing
  response_date DATE NOT NULL,
  response_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review Requests table
-- Tracks requests for online reviews from promoters
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Linkages
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  response_id UUID REFERENCES survey_responses(id) ON DELETE SET NULL,

  -- Platform
  platform VARCHAR(50) NOT NULL, -- google, healthgrades, yelp, facebook, zocdoc
  review_url TEXT NOT NULL,

  -- Timing
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clicked_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'sent', -- sent, clicked, completed, expired

  -- Tracking
  click_count INTEGER DEFAULT 0,
  last_click_at TIMESTAMPTZ,

  -- Attribution
  nps_score INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Survey feedback alerts table
-- Tracks negative feedback for immediate follow-up
CREATE TABLE IF NOT EXISTS survey_feedback_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Linkages
  response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),

  -- Alert details
  alert_type VARCHAR(50) NOT NULL, -- negative_nps, low_satisfaction, negative_comment
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical

  -- Content
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  nps_score INTEGER,
  key_issues TEXT[],

  -- Status tracking
  status VARCHAR(50) DEFAULT 'new', -- new, acknowledged, in_progress, resolved, dismissed
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,

  -- Follow-up tracking
  follow_up_required BOOLEAN DEFAULT true,
  follow_up_completed BOOLEAN DEFAULT false,
  follow_up_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Survey automation jobs table
-- Tracks scheduled survey sends and reminders
CREATE TABLE IF NOT EXISTS survey_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Job type
  job_type VARCHAR(50) NOT NULL, -- send_survey, send_reminder, expire_survey

  -- Linkages
  invitation_id UUID REFERENCES survey_invitations(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_survey_templates_tenant ON survey_templates(tenant_id);
CREATE INDEX idx_survey_templates_active ON survey_templates(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_survey_templates_type ON survey_templates(tenant_id, survey_type);

CREATE INDEX idx_survey_invitations_tenant ON survey_invitations(tenant_id);
CREATE INDEX idx_survey_invitations_patient ON survey_invitations(patient_id);
CREATE INDEX idx_survey_invitations_encounter ON survey_invitations(encounter_id);
CREATE INDEX idx_survey_invitations_token ON survey_invitations(access_token);
CREATE INDEX idx_survey_invitations_status ON survey_invitations(tenant_id, status);
CREATE INDEX idx_survey_invitations_pending ON survey_invitations(scheduled_send_at)
  WHERE status = 'pending';
CREATE INDEX idx_survey_invitations_expiring ON survey_invitations(expires_at)
  WHERE status NOT IN ('completed', 'expired', 'cancelled');

CREATE INDEX idx_survey_responses_tenant ON survey_responses(tenant_id);
CREATE INDEX idx_survey_responses_invitation ON survey_responses(invitation_id);
CREATE INDEX idx_survey_responses_nps ON survey_responses(tenant_id, nps_score) WHERE nps_score IS NOT NULL;
CREATE INDEX idx_survey_responses_submitted ON survey_responses(submitted_at DESC);

CREATE INDEX idx_nps_scores_tenant ON nps_scores(tenant_id);
CREATE INDEX idx_nps_scores_patient ON nps_scores(patient_id);
CREATE INDEX idx_nps_scores_provider ON nps_scores(provider_id);
CREATE INDEX idx_nps_scores_date ON nps_scores(tenant_id, response_date DESC);
CREATE INDEX idx_nps_scores_category ON nps_scores(tenant_id, category);
CREATE INDEX idx_nps_scores_analytics ON nps_scores(tenant_id, response_date, provider_id, category);

CREATE INDEX idx_review_requests_tenant ON review_requests(tenant_id);
CREATE INDEX idx_review_requests_patient ON review_requests(patient_id);
CREATE INDEX idx_review_requests_platform ON review_requests(tenant_id, platform);
CREATE INDEX idx_review_requests_status ON review_requests(tenant_id, status);

CREATE INDEX idx_survey_feedback_alerts_tenant ON survey_feedback_alerts(tenant_id);
CREATE INDEX idx_survey_feedback_alerts_status ON survey_feedback_alerts(tenant_id, status)
  WHERE status NOT IN ('resolved', 'dismissed');
CREATE INDEX idx_survey_feedback_alerts_provider ON survey_feedback_alerts(provider_id);

CREATE INDEX idx_survey_jobs_scheduled ON survey_jobs(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_survey_jobs_status ON survey_jobs(tenant_id, status);

-- Trigger: Update timestamps
CREATE OR REPLACE FUNCTION update_survey_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_templates_updated
  BEFORE UPDATE ON survey_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_survey_timestamp();

CREATE TRIGGER survey_invitations_updated
  BEFORE UPDATE ON survey_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_survey_timestamp();

CREATE TRIGGER review_requests_updated
  BEFORE UPDATE ON review_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_survey_timestamp();

CREATE TRIGGER survey_feedback_alerts_updated
  BEFORE UPDATE ON survey_feedback_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_survey_timestamp();

-- Trigger: Calculate NPS category
CREATE OR REPLACE FUNCTION calculate_nps_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nps_score IS NOT NULL THEN
    NEW.nps_category := CASE
      WHEN NEW.nps_score >= 9 THEN 'promoter'
      WHEN NEW.nps_score >= 7 THEN 'passive'
      ELSE 'detractor'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_responses_nps_category
  BEFORE INSERT OR UPDATE ON survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION calculate_nps_category();

-- Trigger: Auto-create feedback alert for negative NPS
CREATE OR REPLACE FUNCTION create_negative_feedback_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation survey_invitations%ROWTYPE;
  v_severity VARCHAR(20);
  v_alert_exists BOOLEAN;
BEGIN
  -- Only create alert for detractors (NPS < 7)
  IF NEW.nps_score IS NOT NULL AND NEW.nps_score < 7 THEN
    -- Get invitation details
    SELECT * INTO v_invitation FROM survey_invitations WHERE id = NEW.invitation_id;

    -- Check if alert already exists
    SELECT EXISTS(
      SELECT 1 FROM survey_feedback_alerts
      WHERE response_id = NEW.id AND alert_type = 'negative_nps'
    ) INTO v_alert_exists;

    IF NOT v_alert_exists THEN
      -- Determine severity based on score
      v_severity := CASE
        WHEN NEW.nps_score <= 3 THEN 'critical'
        WHEN NEW.nps_score <= 5 THEN 'high'
        ELSE 'medium'
      END;

      INSERT INTO survey_feedback_alerts (
        tenant_id,
        response_id,
        patient_id,
        provider_id,
        alert_type,
        severity,
        title,
        message,
        nps_score
      ) VALUES (
        NEW.tenant_id,
        NEW.id,
        v_invitation.patient_id,
        v_invitation.provider_id,
        'negative_nps',
        v_severity,
        'Negative Patient Feedback (NPS: ' || NEW.nps_score || ')',
        COALESCE(NEW.comments, 'Patient provided a low NPS score. Review and follow-up recommended.'),
        NEW.nps_score
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_responses_negative_alert
  AFTER INSERT OR UPDATE ON survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION create_negative_feedback_alert();

-- Trigger: Create NPS score record
CREATE OR REPLACE FUNCTION create_nps_score_record()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation survey_invitations%ROWTYPE;
  v_encounter encounters%ROWTYPE;
BEGIN
  IF NEW.nps_score IS NOT NULL THEN
    -- Get invitation details
    SELECT * INTO v_invitation FROM survey_invitations WHERE id = NEW.invitation_id;

    -- Get encounter details if available
    IF v_invitation.encounter_id IS NOT NULL THEN
      SELECT * INTO v_encounter FROM encounters WHERE id = v_invitation.encounter_id;
    END IF;

    -- Insert NPS score record
    INSERT INTO nps_scores (
      tenant_id,
      patient_id,
      encounter_id,
      provider_id,
      location_id,
      response_id,
      score,
      category,
      visit_type,
      appointment_type_id,
      response_date,
      response_timestamp
    ) VALUES (
      NEW.tenant_id,
      v_invitation.patient_id,
      v_invitation.encounter_id,
      v_invitation.provider_id,
      v_encounter.location_id,
      NEW.id,
      NEW.nps_score,
      NEW.nps_category,
      v_encounter.encounter_type,
      NULL, -- Would need to join to appointment
      CURRENT_DATE,
      NEW.submitted_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER survey_responses_nps_record
  AFTER INSERT ON survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION create_nps_score_record();

-- View: NPS Analytics Dashboard
CREATE OR REPLACE VIEW nps_analytics AS
SELECT
  tenant_id,
  response_date,
  provider_id,
  COUNT(*) as total_responses,
  COUNT(*) FILTER (WHERE category = 'promoter') as promoters,
  COUNT(*) FILTER (WHERE category = 'passive') as passives,
  COUNT(*) FILTER (WHERE category = 'detractor') as detractors,
  ROUND(AVG(score)::NUMERIC, 2) as avg_score,
  ROUND(
    (
      (COUNT(*) FILTER (WHERE category = 'promoter')::NUMERIC / NULLIF(COUNT(*), 0) * 100) -
      (COUNT(*) FILTER (WHERE category = 'detractor')::NUMERIC / NULLIF(COUNT(*), 0) * 100)
    )::NUMERIC,
    1
  ) as nps_score
FROM nps_scores
GROUP BY tenant_id, response_date, provider_id;

-- View: Survey Response Summary
CREATE OR REPLACE VIEW survey_response_summary AS
SELECT
  sr.tenant_id,
  DATE(sr.submitted_at) as response_date,
  si.provider_id,
  COUNT(*) as total_responses,
  ROUND(AVG(sr.nps_score)::NUMERIC, 2) as avg_nps,
  ROUND(AVG(sr.wait_time_rating)::NUMERIC, 2) as avg_wait_time,
  ROUND(AVG(sr.staff_friendliness_rating)::NUMERIC, 2) as avg_staff_friendliness,
  ROUND(AVG(sr.provider_communication_rating)::NUMERIC, 2) as avg_provider_communication,
  ROUND(AVG(sr.facility_cleanliness_rating)::NUMERIC, 2) as avg_facility_cleanliness,
  ROUND(AVG(sr.overall_satisfaction_rating)::NUMERIC, 2) as avg_overall_satisfaction,
  COUNT(*) FILTER (WHERE sr.comments IS NOT NULL AND sr.comments != '') as responses_with_comments
FROM survey_responses sr
JOIN survey_invitations si ON sr.invitation_id = si.id
GROUP BY sr.tenant_id, DATE(sr.submitted_at), si.provider_id;

-- Insert default post-visit survey template
INSERT INTO survey_templates (
  id,
  tenant_id,
  name,
  description,
  survey_type,
  questions,
  is_active,
  is_default
) VALUES (
  gen_random_uuid(),
  'default',
  'Post-Visit Patient Survey',
  'Standard post-visit satisfaction survey with NPS and quality metrics',
  'post_visit',
  '[
    {
      "id": "nps",
      "type": "nps",
      "text": "How likely are you to recommend our practice to friends and family?",
      "required": true,
      "order": 1
    },
    {
      "id": "wait_time",
      "type": "stars",
      "text": "How would you rate your wait time?",
      "required": true,
      "category": "satisfaction",
      "order": 2
    },
    {
      "id": "staff_friendliness",
      "type": "stars",
      "text": "How would you rate the friendliness of our staff?",
      "required": true,
      "category": "satisfaction",
      "order": 3
    },
    {
      "id": "provider_communication",
      "type": "stars",
      "text": "How would you rate your provider''s communication?",
      "required": true,
      "category": "satisfaction",
      "order": 4
    },
    {
      "id": "facility_cleanliness",
      "type": "stars",
      "text": "How would you rate the cleanliness of our facility?",
      "required": true,
      "category": "satisfaction",
      "order": 5
    },
    {
      "id": "overall_satisfaction",
      "type": "stars",
      "text": "Overall, how satisfied are you with your visit?",
      "required": true,
      "category": "satisfaction",
      "order": 6
    },
    {
      "id": "comments",
      "type": "text",
      "text": "Is there anything else you would like to share about your experience?",
      "required": false,
      "order": 7
    }
  ]'::JSONB,
  true,
  true
) ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE survey_templates IS 'Reusable survey configurations with questions and settings';
COMMENT ON TABLE survey_invitations IS 'Individual survey invitations sent to patients after visits';
COMMENT ON TABLE survey_responses IS 'Completed survey submissions with all response data';
COMMENT ON TABLE nps_scores IS 'Denormalized NPS data for fast analytics queries';
COMMENT ON TABLE review_requests IS 'Tracks online review requests sent to promoters';
COMMENT ON TABLE survey_feedback_alerts IS 'Alerts for negative feedback requiring follow-up';
COMMENT ON COLUMN survey_templates.questions IS 'JSONB array of question objects with id, type, text, required, options, category, order';
COMMENT ON COLUMN survey_responses.nps_category IS 'Calculated: promoter (9-10), passive (7-8), detractor (0-6)';
