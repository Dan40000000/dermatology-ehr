-- Migration: 096_severity_scores.sql
-- Dermatology severity score calculators (IGA, PASI, BSA, DLQI)
-- Enables standardized tracking of disease severity for treatment planning

-- ============================================================================
-- Assessment Templates Table
-- Stores definitions for each assessment type
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'IGA', 'PASI', 'BSA', 'DLQI'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    min_score DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_score DECIMAL(10,2) NOT NULL,
    interpretation_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Example: [{"min": 0, "max": 0, "label": "Clear", "severity": "none"}]
    component_definitions JSONB DEFAULT NULL,
    -- For PASI: body regions, factors, area percentages
    -- For DLQI: question definitions
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,

    CONSTRAINT assessment_templates_unique_type_tenant UNIQUE (tenant_id, type, version)
);

-- ============================================================================
-- Severity Assessments Table
-- Stores individual assessment records
-- ============================================================================
CREATE TABLE IF NOT EXISTS severity_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    encounter_id UUID,
    assessment_type VARCHAR(50) NOT NULL, -- 'IGA', 'PASI', 'BSA', 'DLQI'
    template_id UUID REFERENCES assessment_templates(id),

    -- Calculated score
    score_value DECIMAL(10,2) NOT NULL,
    score_interpretation VARCHAR(100), -- e.g., "Moderate", "Severe"
    severity_level VARCHAR(50), -- normalized: none, mild, moderate, severe

    -- Component scores as JSONB for flexibility
    component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- IGA: {"selection": 3, "description": "Moderate"}
    -- PASI: {"head": {...}, "trunk": {...}, "upper_extremities": {...}, "lower_extremities": {...}}
    -- BSA: {"affected_areas": [...], "method": "palm"|"rule_of_9s"}
    -- DLQI: {"q1": 2, "q2": 1, ...}

    -- Audit trail
    assessed_by UUID NOT NULL,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Optional notes
    clinical_notes TEXT,

    -- Photo references for visual documentation
    photo_ids UUID[] DEFAULT ARRAY[]::UUID[],

    -- Metadata
    is_baseline BOOLEAN DEFAULT FALSE,
    comparison_assessment_id UUID REFERENCES severity_assessments(id),
    change_from_baseline DECIMAL(10,2),
    percent_change DECIMAL(10,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT severity_assessments_patient_fk FOREIGN KEY (patient_id)
        REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT severity_assessments_encounter_fk FOREIGN KEY (encounter_id)
        REFERENCES encounters(id) ON DELETE SET NULL,
    CONSTRAINT severity_assessments_assessor_fk FOREIGN KEY (assessed_by)
        REFERENCES providers(id) ON DELETE SET NULL
);

-- ============================================================================
-- Assessment History Table
-- Aggregated view of patient's score history by type
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    assessment_type VARCHAR(50) NOT NULL,

    -- Array of score snapshots over time
    scores_over_time JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[],
    -- Each element: {"date": "2024-01-15", "score": 15.5, "interpretation": "Moderate", "assessment_id": "uuid"}

    -- Statistics
    total_assessments INTEGER NOT NULL DEFAULT 0,
    baseline_score DECIMAL(10,2),
    baseline_date TIMESTAMPTZ,
    latest_score DECIMAL(10,2),
    latest_date TIMESTAMPTZ,
    best_score DECIMAL(10,2),
    worst_score DECIMAL(10,2),
    average_score DECIMAL(10,2),
    trend VARCHAR(20), -- 'improving', 'worsening', 'stable', 'fluctuating'

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT assessment_history_patient_fk FOREIGN KEY (patient_id)
        REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT assessment_history_unique UNIQUE (tenant_id, patient_id, assessment_type)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_severity_assessments_patient
    ON severity_assessments(patient_id, assessment_type, assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_severity_assessments_encounter
    ON severity_assessments(encounter_id) WHERE encounter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_severity_assessments_type_date
    ON severity_assessments(tenant_id, assessment_type, assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_severity_assessments_baseline
    ON severity_assessments(patient_id, assessment_type, is_baseline)
    WHERE is_baseline = true;

CREATE INDEX IF NOT EXISTS idx_assessment_history_patient
    ON assessment_history(patient_id, assessment_type);

CREATE INDEX IF NOT EXISTS idx_assessment_templates_type
    ON assessment_templates(tenant_id, type) WHERE is_active = true;

-- ============================================================================
-- Seed Default Assessment Templates
-- ============================================================================
INSERT INTO assessment_templates (tenant_id, type, name, description, min_score, max_score, interpretation_ranges, component_definitions)
VALUES
-- IGA (Investigator Global Assessment)
(
    '00000000-0000-0000-0000-000000000000',
    'IGA',
    'Investigator Global Assessment',
    'Global assessment of disease severity on a 0-4 scale',
    0,
    4,
    '[
        {"min": 0, "max": 0, "label": "Clear", "severity": "none", "description": "No inflammatory signs of disease"},
        {"min": 1, "max": 1, "label": "Almost Clear", "severity": "minimal", "description": "Just perceptible erythema and just perceptible induration/papulation"},
        {"min": 2, "max": 2, "label": "Mild", "severity": "mild", "description": "Clearly perceptible erythema and clearly perceptible induration/papulation"},
        {"min": 3, "max": 3, "label": "Moderate", "severity": "moderate", "description": "Marked erythema and marked induration/papulation"},
        {"min": 4, "max": 4, "label": "Severe", "severity": "severe", "description": "Severe erythema and severe induration/papulation"}
    ]'::jsonb,
    '{
        "options": [
            {"value": 0, "label": "Clear", "description": "No inflammatory signs of disease"},
            {"value": 1, "label": "Almost Clear", "description": "Just perceptible erythema and just perceptible induration/papulation"},
            {"value": 2, "label": "Mild", "description": "Clearly perceptible erythema and clearly perceptible induration/papulation"},
            {"value": 3, "label": "Moderate", "description": "Marked erythema and marked induration/papulation"},
            {"value": 4, "label": "Severe", "description": "Severe erythema and severe induration/papulation"}
        ]
    }'::jsonb
),

-- PASI (Psoriasis Area Severity Index)
(
    '00000000-0000-0000-0000-000000000000',
    'PASI',
    'Psoriasis Area Severity Index',
    'Comprehensive psoriasis severity assessment combining area and intensity',
    0,
    72,
    '[
        {"min": 0, "max": 0, "label": "Clear", "severity": "none"},
        {"min": 0.1, "max": 4.9, "label": "Mild", "severity": "mild"},
        {"min": 5, "max": 9.9, "label": "Moderate", "severity": "moderate"},
        {"min": 10, "max": 19.9, "label": "Severe", "severity": "severe"},
        {"min": 20, "max": 72, "label": "Very Severe", "severity": "very_severe"}
    ]'::jsonb,
    '{
        "body_regions": [
            {"id": "head", "name": "Head", "weight": 0.1, "body_surface_percent": 10},
            {"id": "trunk", "name": "Trunk", "weight": 0.2, "body_surface_percent": 30},
            {"id": "upper_extremities", "name": "Upper Extremities", "weight": 0.2, "body_surface_percent": 20},
            {"id": "lower_extremities", "name": "Lower Extremities", "weight": 0.4, "body_surface_percent": 40}
        ],
        "severity_factors": [
            {"id": "erythema", "name": "Erythema (Redness)", "min": 0, "max": 4},
            {"id": "induration", "name": "Induration (Thickness)", "min": 0, "max": 4},
            {"id": "scaling", "name": "Scaling (Desquamation)", "min": 0, "max": 4}
        ],
        "area_scores": [
            {"value": 0, "label": "None", "range": "0%"},
            {"value": 1, "label": "1-9%", "range": "1-9%"},
            {"value": 2, "label": "10-29%", "range": "10-29%"},
            {"value": 3, "label": "30-49%", "range": "30-49%"},
            {"value": 4, "label": "50-69%", "range": "50-69%"},
            {"value": 5, "label": "70-89%", "range": "70-89%"},
            {"value": 6, "label": "90-100%", "range": "90-100%"}
        ],
        "formula": "0.1*(Eh+Ih+Sh)*Ah + 0.2*(Et+It+St)*At + 0.2*(Eu+Iu+Su)*Au + 0.4*(El+Il+Sl)*Al"
    }'::jsonb
),

-- BSA (Body Surface Area)
(
    '00000000-0000-0000-0000-000000000000',
    'BSA',
    'Body Surface Area',
    'Percentage of body surface area affected by condition',
    0,
    100,
    '[
        {"min": 0, "max": 0, "label": "Clear", "severity": "none"},
        {"min": 0.1, "max": 2.9, "label": "Mild", "severity": "mild"},
        {"min": 3, "max": 9.9, "label": "Moderate", "severity": "moderate"},
        {"min": 10, "max": 100, "label": "Severe", "severity": "severe"}
    ]'::jsonb,
    '{
        "methods": ["palm", "rule_of_9s"],
        "palm_description": "Patients palm (including fingers) = 1% BSA",
        "rule_of_9s": {
            "adult": {
                "head_neck": 9,
                "anterior_trunk": 18,
                "posterior_trunk": 18,
                "each_arm": 9,
                "each_leg": 18,
                "perineum": 1
            },
            "child": {
                "head_neck": 18,
                "anterior_trunk": 18,
                "posterior_trunk": 18,
                "each_arm": 9,
                "each_leg": 14,
                "perineum": 1
            }
        },
        "body_regions": [
            {"id": "head_neck", "name": "Head & Neck", "adult_percent": 9, "child_percent": 18},
            {"id": "anterior_trunk", "name": "Anterior Trunk", "adult_percent": 18, "child_percent": 18},
            {"id": "posterior_trunk", "name": "Posterior Trunk", "adult_percent": 18, "child_percent": 18},
            {"id": "right_arm", "name": "Right Arm", "adult_percent": 9, "child_percent": 9},
            {"id": "left_arm", "name": "Left Arm", "adult_percent": 9, "child_percent": 9},
            {"id": "right_leg", "name": "Right Leg", "adult_percent": 18, "child_percent": 14},
            {"id": "left_leg", "name": "Left Leg", "adult_percent": 18, "child_percent": 14},
            {"id": "perineum", "name": "Perineum/Genitalia", "adult_percent": 1, "child_percent": 1}
        ]
    }'::jsonb
),

-- DLQI (Dermatology Life Quality Index)
(
    '00000000-0000-0000-0000-000000000000',
    'DLQI',
    'Dermatology Life Quality Index',
    'Patient-reported quality of life questionnaire',
    0,
    30,
    '[
        {"min": 0, "max": 1, "label": "No Effect", "severity": "none", "description": "No effect on patients life"},
        {"min": 2, "max": 5, "label": "Small Effect", "severity": "mild", "description": "Small effect on patients life"},
        {"min": 6, "max": 10, "label": "Moderate Effect", "severity": "moderate", "description": "Moderate effect on patients life"},
        {"min": 11, "max": 20, "label": "Large Effect", "severity": "severe", "description": "Very large effect on patients life"},
        {"min": 21, "max": 30, "label": "Extremely Large Effect", "severity": "very_severe", "description": "Extremely large effect on patients life"}
    ]'::jsonb,
    '{
        "time_frame": "Over the last week",
        "response_options": [
            {"value": 3, "label": "Very much"},
            {"value": 2, "label": "A lot"},
            {"value": 1, "label": "A little"},
            {"value": 0, "label": "Not at all"},
            {"value": 0, "label": "Not relevant"}
        ],
        "questions": [
            {"id": "q1", "number": 1, "text": "How itchy, sore, painful or stinging has your skin been?", "domain": "symptoms_feelings"},
            {"id": "q2", "number": 2, "text": "How embarrassed or self conscious have you been because of your skin?", "domain": "symptoms_feelings"},
            {"id": "q3", "number": 3, "text": "How much has your skin interfered with you going shopping or looking after your home or garden?", "domain": "daily_activities"},
            {"id": "q4", "number": 4, "text": "How much has your skin influenced the clothes you wear?", "domain": "daily_activities"},
            {"id": "q5", "number": 5, "text": "How much has your skin affected any social or leisure activities?", "domain": "leisure"},
            {"id": "q6", "number": 6, "text": "How much has your skin made it difficult for you to do any sport?", "domain": "leisure"},
            {"id": "q7", "number": 7, "text": "Has your skin prevented you from working or studying? If No, how much has your skin been a problem at work or studying?", "domain": "work_school"},
            {"id": "q8", "number": 8, "text": "How much has your skin created problems with your partner or any of your close friends or relatives?", "domain": "personal_relationships"},
            {"id": "q9", "number": 9, "text": "How much has your skin caused any sexual difficulties?", "domain": "personal_relationships"},
            {"id": "q10", "number": 10, "text": "How much of a problem has the treatment for your skin been, for example by making your home messy, or by taking up time?", "domain": "treatment"}
        ],
        "domains": [
            {"id": "symptoms_feelings", "name": "Symptoms and Feelings", "questions": ["q1", "q2"]},
            {"id": "daily_activities", "name": "Daily Activities", "questions": ["q3", "q4"]},
            {"id": "leisure", "name": "Leisure", "questions": ["q5", "q6"]},
            {"id": "work_school", "name": "Work and School", "questions": ["q7"]},
            {"id": "personal_relationships", "name": "Personal Relationships", "questions": ["q8", "q9"]},
            {"id": "treatment", "name": "Treatment", "questions": ["q10"]}
        ]
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Function to update assessment history
-- ============================================================================
CREATE OR REPLACE FUNCTION update_assessment_history()
RETURNS TRIGGER AS $$
DECLARE
    history_record assessment_history%ROWTYPE;
    score_snapshot JSONB;
    all_scores DECIMAL(10,2)[];
BEGIN
    -- Create score snapshot
    score_snapshot := jsonb_build_object(
        'date', NEW.assessed_at,
        'score', NEW.score_value,
        'interpretation', NEW.score_interpretation,
        'assessment_id', NEW.id
    );

    -- Check if history record exists
    SELECT * INTO history_record
    FROM assessment_history
    WHERE tenant_id = NEW.tenant_id
      AND patient_id = NEW.patient_id
      AND assessment_type = NEW.assessment_type;

    IF history_record.id IS NULL THEN
        -- Create new history record
        INSERT INTO assessment_history (
            tenant_id, patient_id, assessment_type,
            scores_over_time, total_assessments,
            baseline_score, baseline_date,
            latest_score, latest_date,
            best_score, worst_score, average_score
        )
        VALUES (
            NEW.tenant_id, NEW.patient_id, NEW.assessment_type,
            ARRAY[score_snapshot],
            1,
            CASE WHEN NEW.is_baseline THEN NEW.score_value ELSE NULL END,
            CASE WHEN NEW.is_baseline THEN NEW.assessed_at ELSE NULL END,
            NEW.score_value,
            NEW.assessed_at,
            NEW.score_value,
            NEW.score_value,
            NEW.score_value
        );
    ELSE
        -- Update existing history record
        -- Get all scores for statistics
        SELECT ARRAY_AGG((elem->>'score')::DECIMAL(10,2))
        INTO all_scores
        FROM (
            SELECT unnest(history_record.scores_over_time || ARRAY[score_snapshot]) AS elem
        ) scores;

        UPDATE assessment_history
        SET scores_over_time = scores_over_time || ARRAY[score_snapshot],
            total_assessments = total_assessments + 1,
            baseline_score = COALESCE(
                CASE WHEN NEW.is_baseline THEN NEW.score_value ELSE baseline_score END,
                baseline_score
            ),
            baseline_date = COALESCE(
                CASE WHEN NEW.is_baseline THEN NEW.assessed_at ELSE baseline_date END,
                baseline_date
            ),
            latest_score = NEW.score_value,
            latest_date = NEW.assessed_at,
            best_score = LEAST(COALESCE(best_score, NEW.score_value), NEW.score_value),
            worst_score = GREATEST(COALESCE(worst_score, NEW.score_value), NEW.score_value),
            average_score = (SELECT AVG(s) FROM unnest(all_scores) s),
            updated_at = NOW()
        WHERE id = history_record.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS tr_update_assessment_history ON severity_assessments;
CREATE TRIGGER tr_update_assessment_history
    AFTER INSERT ON severity_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_assessment_history();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON TABLE severity_assessments IS 'Stores dermatology severity score assessments (IGA, PASI, BSA, DLQI)';
COMMENT ON TABLE assessment_templates IS 'Defines assessment types with scoring ranges and interpretation';
COMMENT ON TABLE assessment_history IS 'Aggregated history of patient assessments for trend analysis';
COMMENT ON COLUMN severity_assessments.component_scores IS 'JSONB storing breakdown of score by component (body regions for PASI, questions for DLQI)';
COMMENT ON COLUMN assessment_templates.interpretation_ranges IS 'JSONB array defining score ranges and their clinical interpretations';
