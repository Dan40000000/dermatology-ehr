-- Patient Engagement System
-- Birthday/anniversary campaigns, loyalty program, surveys, reviews, and educational content

-- =====================================================
-- PATIENT ENGAGEMENT CAMPAIGNS
-- =====================================================

-- Track all engagement campaigns sent to patients
CREATE TABLE IF NOT EXISTS patient_engagement_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    campaign_type VARCHAR(50) NOT NULL, -- birthday, anniversary, seasonal, adherence, review_request, survey, educational, loyalty
    campaign_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- pending, scheduled, sent, failed, cancelled
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    response JSONB, -- Store any patient response
    response_at TIMESTAMPTZ,
    channel VARCHAR(20) DEFAULT 'sms', -- sms, email, portal
    message_id UUID, -- Reference to sms_messages if sent via SMS
    template_used VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_engagement_campaigns_patient (tenant_id, patient_id, created_at DESC),
    INDEX idx_engagement_campaigns_type (tenant_id, campaign_type, status),
    INDEX idx_engagement_campaigns_scheduled (tenant_id, status, scheduled_at)
);

-- =====================================================
-- PATIENT LOYALTY PROGRAM
-- =====================================================

-- Patient loyalty points balance and tier
CREATE TABLE IF NOT EXISTS patient_loyalty_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    points_balance INT NOT NULL DEFAULT 0,
    lifetime_points INT NOT NULL DEFAULT 0,
    tier VARCHAR(20) DEFAULT 'bronze', -- bronze, silver, gold, platinum
    tier_updated_at TIMESTAMPTZ,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, patient_id),
    INDEX idx_loyalty_points_tier (tenant_id, tier, is_active),
    INDEX idx_loyalty_points_balance (tenant_id, points_balance DESC)
);

-- Loyalty points transaction history
CREATE TABLE IF NOT EXISTS patient_loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    points INT NOT NULL, -- Positive for earned, negative for redeemed
    balance_after INT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- earned_visit, earned_referral, earned_review, earned_survey, redeemed, expired, bonus, adjustment
    description VARCHAR(255),
    reference_type VARCHAR(50), -- appointment, referral, review, survey, reward
    reference_id UUID,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_loyalty_transactions_patient (tenant_id, patient_id, created_at DESC),
    INDEX idx_loyalty_transactions_type (tenant_id, transaction_type, created_at DESC)
);

-- Loyalty tier configuration
CREATE TABLE IF NOT EXISTS loyalty_tier_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tier_name VARCHAR(20) NOT NULL, -- bronze, silver, gold, platinum
    min_points INT NOT NULL,
    max_points INT, -- NULL for highest tier
    benefits JSONB DEFAULT '{}', -- discount_percent, free_services, priority_scheduling, etc.
    color VARCHAR(20), -- For UI display
    badge_text VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, tier_name),
    INDEX idx_loyalty_tier_config (tenant_id, is_active, min_points)
);

-- Loyalty rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    points_required INT NOT NULL,
    reward_type VARCHAR(50) NOT NULL, -- discount, free_service, product, gift_card
    reward_value JSONB NOT NULL, -- { discount_percent: 10 } or { service_code: 'facial' } etc.
    quantity_available INT, -- NULL for unlimited
    quantity_redeemed INT DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    min_tier VARCHAR(20), -- Minimum tier required
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_loyalty_rewards_active (tenant_id, is_active, points_required)
);

-- Loyalty redemptions
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES loyalty_rewards(id),
    points_spent INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, used, expired, cancelled
    used_at TIMESTAMPTZ,
    used_on_appointment_id UUID REFERENCES appointments(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_loyalty_redemptions_patient (tenant_id, patient_id, status)
);

-- =====================================================
-- PATIENT SURVEYS
-- =====================================================

-- Patient survey responses
CREATE TABLE IF NOT EXISTS patient_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    survey_type VARCHAR(50) NOT NULL, -- post_visit, nps, treatment_satisfaction, product_feedback, general
    survey_template_id UUID,
    overall_score INT, -- 1-10 or 1-5 depending on survey type
    nps_score INT, -- Net Promoter Score (0-10)
    feedback TEXT,
    responses JSONB DEFAULT '{}', -- Detailed question responses
    sentiment VARCHAR(20), -- positive, neutral, negative (AI analyzed)
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_completed BOOLEAN DEFAULT FALSE,
    follow_up_notes TEXT,
    follow_up_by UUID REFERENCES users(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_patient_surveys_patient (tenant_id, patient_id, created_at DESC),
    INDEX idx_patient_surveys_appointment (tenant_id, appointment_id),
    INDEX idx_patient_surveys_provider (tenant_id, provider_id, submitted_at DESC),
    INDEX idx_patient_surveys_followup (tenant_id, follow_up_required, follow_up_completed)
);

-- Survey templates
CREATE TABLE IF NOT EXISTS survey_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    survey_type VARCHAR(50) NOT NULL,
    questions JSONB NOT NULL, -- Array of questions with type, text, options, required
    trigger_type VARCHAR(50), -- post_visit, manual, scheduled
    trigger_delay_hours INT DEFAULT 2, -- Hours after trigger to send
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_survey_templates_type (tenant_id, survey_type, is_active)
);

-- =====================================================
-- PATIENT REVIEWS
-- =====================================================

-- Patient review tracking
CREATE TABLE IF NOT EXISTS patient_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL, -- google, yelp, healthgrades, facebook, internal
    rating INT, -- 1-5 stars
    review_text TEXT,
    review_url VARCHAR(500), -- URL to the actual review
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, flagged, responded, hidden
    sentiment VARCHAR(20), -- positive, neutral, negative
    internal_notes TEXT,
    response_text TEXT, -- Practice's response to the review
    responded_at TIMESTAMPTZ,
    responded_by UUID REFERENCES users(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_patient_reviews_patient (tenant_id, patient_id, created_at DESC),
    INDEX idx_patient_reviews_platform (tenant_id, platform, rating, created_at DESC),
    INDEX idx_patient_reviews_status (tenant_id, status, created_at DESC),
    INDEX idx_patient_reviews_sentiment (tenant_id, sentiment, created_at DESC)
);

-- Review request tracking
CREATE TABLE IF NOT EXISTS review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    survey_id UUID REFERENCES patient_surveys(id), -- Link to survey that triggered request
    platform VARCHAR(50) NOT NULL, -- google, yelp, healthgrades, facebook
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, clicked, completed, declined
    sent_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    review_id UUID REFERENCES patient_reviews(id), -- Link to actual review if posted
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_review_requests_patient (tenant_id, patient_id, status),
    INDEX idx_review_requests_status (tenant_id, status, sent_at DESC)
);

-- =====================================================
-- EDUCATIONAL CONTENT
-- =====================================================

-- Educational content library
CREATE TABLE IF NOT EXISTS educational_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL, -- article, video, infographic, pdf
    category VARCHAR(100) NOT NULL, -- skin_cancer, acne, eczema, sun_protection, anti_aging, etc.
    body TEXT,
    media_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    duration_minutes INT, -- For videos
    reading_time_minutes INT, -- For articles
    tags TEXT[],
    related_diagnoses TEXT[], -- ICD-10 codes
    related_procedures TEXT[], -- CPT codes
    is_published BOOLEAN DEFAULT TRUE,
    view_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_educational_content_category (tenant_id, category, is_published),
    INDEX idx_educational_content_diagnoses (tenant_id, related_diagnoses, is_published)
);

-- Track content sent to patients
CREATE TABLE IF NOT EXISTS patient_educational_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES educational_content(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    diagnosis_code VARCHAR(20), -- ICD-10 that triggered content
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    viewed_at TIMESTAMPTZ,
    channel VARCHAR(20) DEFAULT 'portal', -- portal, email, sms
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_patient_educational_patient (tenant_id, patient_id, sent_at DESC),
    INDEX idx_patient_educational_content (tenant_id, content_id, sent_at DESC)
);

-- =====================================================
-- TREATMENT ADHERENCE
-- =====================================================

-- Treatment adherence reminders
CREATE TABLE IF NOT EXISTS treatment_adherence_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    treatment_plan_id UUID,
    prescription_id UUID,
    reminder_type VARCHAR(50) NOT NULL, -- medication, skincare_routine, follow_up_appointment, reorder
    frequency VARCHAR(50), -- daily, weekly, monthly
    scheduled_time TIME, -- Time of day to send
    next_reminder_at TIMESTAMPTZ,
    last_reminder_at TIMESTAMPTZ,
    acknowledgment_count INT DEFAULT 0,
    skip_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_adherence_reminders_next (tenant_id, is_active, next_reminder_at),
    INDEX idx_adherence_reminders_patient (tenant_id, patient_id, is_active)
);

-- Adherence acknowledgments
CREATE TABLE IF NOT EXISTS adherence_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reminder_id UUID NOT NULL REFERENCES treatment_adherence_reminders(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    response VARCHAR(20) NOT NULL, -- acknowledged, skipped, snooze
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_adherence_acks_reminder (tenant_id, reminder_id, created_at DESC)
);

-- =====================================================
-- SEASONAL CAMPAIGNS
-- =====================================================

-- Seasonal campaign configurations
CREATE TABLE IF NOT EXISTS seasonal_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(50) NOT NULL, -- sun_protection, skin_check, winter_care, back_to_school, holiday
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_audience JSONB, -- Filters: age_range, diagnoses, last_visit, tier, etc.
    message_template TEXT,
    channel VARCHAR(20) DEFAULT 'sms', -- sms, email, both
    is_active BOOLEAN DEFAULT TRUE,
    auto_enroll BOOLEAN DEFAULT TRUE, -- Automatically enroll matching patients
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_seasonal_campaigns_dates (tenant_id, start_date, end_date, is_active)
);

-- Product recommendations engine
CREATE TABLE IF NOT EXISTS product_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    product_category VARCHAR(100), -- sunscreen, moisturizer, cleanser, treatment
    product_sku VARCHAR(100),
    recommendation_reason TEXT,
    source_diagnosis VARCHAR(20), -- ICD-10 code
    source_encounter_id UUID REFERENCES encounters(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, viewed, purchased, declined
    viewed_at TIMESTAMPTZ,
    purchased_at TIMESTAMPTZ,
    reorder_due_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    INDEX idx_product_recommendations_patient (tenant_id, patient_id, status),
    INDEX idx_product_recommendations_reorder (tenant_id, status, reorder_due_date)
);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed loyalty tier configuration
INSERT INTO loyalty_tier_config (id, tenant_id, tier_name, min_points, max_points, benefits, color, badge_text, is_active)
SELECT
    gen_random_uuid(),
    t.id,
    tiers.tier_name,
    tiers.min_points,
    tiers.max_points,
    tiers.benefits,
    tiers.color,
    tiers.badge_text,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    ('bronze', 0, 499, '{"discount_percent": 5, "priority_scheduling": false}', '#CD7F32', 'Bronze Member'),
    ('silver', 500, 1499, '{"discount_percent": 10, "priority_scheduling": true}', '#C0C0C0', 'Silver Member'),
    ('gold', 1500, 2999, '{"discount_percent": 15, "priority_scheduling": true, "free_consultation": true}', '#FFD700', 'Gold Member'),
    ('platinum', 3000, NULL, '{"discount_percent": 20, "priority_scheduling": true, "free_consultation": true, "vip_access": true}', '#E5E4E2', 'Platinum VIP')
) AS tiers(tier_name, min_points, max_points, benefits, color, badge_text)
ON CONFLICT DO NOTHING;

-- Seed default survey template
INSERT INTO survey_templates (id, tenant_id, name, survey_type, questions, trigger_type, trigger_delay_hours, is_default, is_active)
SELECT
    gen_random_uuid(),
    t.id,
    'Post-Visit Satisfaction Survey',
    'post_visit',
    '[
        {"id": "overall", "type": "rating", "text": "How would you rate your overall experience?", "required": true, "scale": 5},
        {"id": "wait_time", "type": "rating", "text": "How satisfied were you with the wait time?", "required": true, "scale": 5},
        {"id": "staff", "type": "rating", "text": "How friendly and helpful was our staff?", "required": true, "scale": 5},
        {"id": "provider", "type": "rating", "text": "How satisfied were you with your provider?", "required": true, "scale": 5},
        {"id": "recommend", "type": "nps", "text": "How likely are you to recommend us to friends or family?", "required": true, "scale": 10},
        {"id": "feedback", "type": "text", "text": "Do you have any additional feedback for us?", "required": false}
    ]'::jsonb,
    'post_visit',
    3,
    TRUE,
    TRUE
FROM tenants t
ON CONFLICT DO NOTHING;

-- Seed educational content categories
INSERT INTO educational_content (id, tenant_id, title, content_type, category, body, tags, related_diagnoses, is_published)
SELECT
    gen_random_uuid(),
    t.id,
    content.title,
    content.content_type,
    content.category,
    content.body,
    content.tags,
    content.related_diagnoses,
    TRUE
FROM tenants t
CROSS JOIN (VALUES
    ('Sun Protection Basics', 'article', 'sun_protection',
     'Learn how to protect your skin from harmful UV rays. Use broad-spectrum SPF 30+ sunscreen, reapply every 2 hours, and seek shade during peak hours (10am-4pm).',
     ARRAY['sunscreen', 'uv', 'protection', 'prevention'],
     ARRAY['L57.0', 'C44.91', 'C44.92']),
    ('Understanding Your Acne Treatment', 'article', 'acne',
     'Acne treatment takes time and consistency. Most treatments take 6-8 weeks to show improvement. Follow your prescribed routine daily for best results.',
     ARRAY['acne', 'treatment', 'skincare'],
     ARRAY['L70.0', 'L70.1']),
    ('Managing Eczema Flare-Ups', 'article', 'eczema',
     'Eczema management includes moisturizing frequently, avoiding triggers, and using medications as prescribed. Identify your triggers and create a consistent skincare routine.',
     ARRAY['eczema', 'dermatitis', 'flare-up', 'moisturizer'],
     ARRAY['L20.0', 'L20.9']),
    ('Psoriasis Self-Care Guide', 'article', 'psoriasis',
     'Living with psoriasis requires a combination of medical treatment and self-care. Moisturize daily, manage stress, and follow your treatment plan consistently.',
     ARRAY['psoriasis', 'autoimmune', 'self-care'],
     ARRAY['L40.0', 'L40.9']),
    ('Skin Cancer Warning Signs', 'article', 'skin_cancer',
     'Know the ABCDEs of melanoma: Asymmetry, Border irregularity, Color variation, Diameter over 6mm, and Evolution. Report any suspicious moles to your dermatologist immediately.',
     ARRAY['melanoma', 'skin cancer', 'moles', 'ABCDE'],
     ARRAY['C43.9', 'D03.9'])
) AS content(title, content_type, category, body, tags, related_diagnoses)
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to calculate and update patient tier
CREATE OR REPLACE FUNCTION update_patient_loyalty_tier()
RETURNS TRIGGER AS $$
DECLARE
    new_tier VARCHAR(20);
    v_lifetime_points INT;
BEGIN
    -- Get lifetime points
    v_lifetime_points := NEW.lifetime_points;

    -- Determine tier based on lifetime points
    SELECT tier_name INTO new_tier
    FROM loyalty_tier_config
    WHERE tenant_id = NEW.tenant_id
      AND is_active = TRUE
      AND min_points <= v_lifetime_points
      AND (max_points IS NULL OR max_points >= v_lifetime_points)
    ORDER BY min_points DESC
    LIMIT 1;

    -- Update tier if changed
    IF new_tier IS NOT NULL AND new_tier != NEW.tier THEN
        NEW.tier := new_tier;
        NEW.tier_updated_at := NOW();
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tier updates
DROP TRIGGER IF EXISTS trigger_update_loyalty_tier ON patient_loyalty_points;
CREATE TRIGGER trigger_update_loyalty_tier
    BEFORE UPDATE ON patient_loyalty_points
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_loyalty_tier();

-- Function to add loyalty points
CREATE OR REPLACE FUNCTION add_loyalty_points(
    p_tenant_id UUID,
    p_patient_id UUID,
    p_points INT,
    p_transaction_type VARCHAR(50),
    p_description VARCHAR(255),
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_loyalty_id UUID;
    v_new_balance INT;
    v_transaction_id UUID;
BEGIN
    -- Ensure patient has loyalty record
    INSERT INTO patient_loyalty_points (tenant_id, patient_id, points_balance, lifetime_points, tier)
    VALUES (p_tenant_id, p_patient_id, 0, 0, 'bronze')
    ON CONFLICT (tenant_id, patient_id) DO NOTHING
    RETURNING id INTO v_loyalty_id;

    -- Update points balance
    UPDATE patient_loyalty_points
    SET points_balance = points_balance + p_points,
        lifetime_points = CASE WHEN p_points > 0 THEN lifetime_points + p_points ELSE lifetime_points END,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id
    RETURNING points_balance INTO v_new_balance;

    -- Create transaction record
    INSERT INTO patient_loyalty_transactions (
        tenant_id, patient_id, points, balance_after, transaction_type,
        description, reference_type, reference_id, created_by
    ) VALUES (
        p_tenant_id, p_patient_id, p_points, v_new_balance, p_transaction_type,
        p_description, p_reference_type, p_reference_id, p_created_by
    ) RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate patient engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(
    p_tenant_id UUID,
    p_patient_id UUID
) RETURNS INT AS $$
DECLARE
    v_score INT := 0;
    v_visits INT;
    v_surveys INT;
    v_reviews INT;
    v_referrals INT;
BEGIN
    -- Visits in last year (max 30 points)
    SELECT COUNT(*) INTO v_visits
    FROM appointments
    WHERE tenant_id = p_tenant_id
      AND patient_id = p_patient_id
      AND status = 'completed'
      AND start_time > NOW() - INTERVAL '1 year';
    v_score := v_score + LEAST(v_visits * 10, 30);

    -- Surveys completed (max 20 points)
    SELECT COUNT(*) INTO v_surveys
    FROM patient_surveys
    WHERE tenant_id = p_tenant_id
      AND patient_id = p_patient_id
      AND submitted_at > NOW() - INTERVAL '1 year';
    v_score := v_score + LEAST(v_surveys * 10, 20);

    -- Reviews posted (max 30 points)
    SELECT COUNT(*) INTO v_reviews
    FROM patient_reviews
    WHERE tenant_id = p_tenant_id
      AND patient_id = p_patient_id
      AND status IN ('approved', 'responded');
    v_score := v_score + LEAST(v_reviews * 15, 30);

    -- Loyalty tier bonus
    SELECT
        CASE tier
            WHEN 'platinum' THEN 20
            WHEN 'gold' THEN 15
            WHEN 'silver' THEN 10
            ELSE 5
        END INTO v_score
    FROM patient_loyalty_points
    WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;

    RETURN COALESCE(v_score, 0);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE patient_engagement_campaigns IS 'Tracks all patient engagement campaigns (birthday, anniversary, seasonal, etc.)';
COMMENT ON TABLE patient_loyalty_points IS 'Patient loyalty program points balance and tier status';
COMMENT ON TABLE patient_loyalty_transactions IS 'History of loyalty points earned and redeemed';
COMMENT ON TABLE patient_surveys IS 'Patient survey responses for satisfaction tracking';
COMMENT ON TABLE patient_reviews IS 'Patient reviews across various platforms';
COMMENT ON TABLE educational_content IS 'Library of educational content for patients';
COMMENT ON TABLE treatment_adherence_reminders IS 'Treatment adherence reminder schedules';
COMMENT ON TABLE seasonal_campaigns IS 'Seasonal marketing and health campaign configurations';
COMMENT ON TABLE product_recommendations IS 'Skincare product recommendations for patients';
