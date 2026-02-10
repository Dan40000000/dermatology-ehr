-- AI Lesion Analysis System
-- AI-powered image analysis for dermatology lesions with differential diagnosis,
-- ABCDE scoring, dermoscopy pattern recognition, and risk stratification.
-- PROVIDER-ONLY feature with audit trail and feedback loop for model improvement.

-- =====================================================
-- AI Model Configurations
-- Store configuration for AI analysis providers
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Model identification
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- claude, openai, custom

  -- API configuration
  api_endpoint TEXT,
  api_key_encrypted TEXT, -- Encrypted API key

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Capabilities
  supports_dermoscopy BOOLEAN DEFAULT true,
  supports_abcde_scoring BOOLEAN DEFAULT true,
  supports_comparison BOOLEAN DEFAULT true,

  -- Configuration settings
  config JSONB DEFAULT '{}'::JSONB, -- Additional model-specific settings

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT unique_tenant_model_version UNIQUE (tenant_id, model_name, model_version)
);

-- =====================================================
-- AI Lesion Analyses
-- Store comprehensive AI analysis results
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_lesion_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Image reference
  lesion_image_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,

  -- Analysis metadata
  analysis_date TIMESTAMPTZ DEFAULT NOW(),
  model_version VARCHAR(100) NOT NULL,
  model_config_id UUID REFERENCES ai_model_configs(id),
  analysis_type VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, dermoscopy, comparison

  -- Overall scores
  confidence_score DECIMAL(5,4), -- 0.0000 to 1.0000

  -- Primary classification
  primary_classification VARCHAR(50) NOT NULL, -- benign, suspicious, likely_malignant
  classification_confidence DECIMAL(5,4),

  -- Differential diagnoses (array of JSONB objects)
  -- Each: { diagnosis: string, confidence: number, description: string, icd10_code: string }
  differential_diagnoses JSONB[] DEFAULT ARRAY[]::JSONB[],

  -- ABCDE Feature Scores (auto-detected)
  -- Each score 0-3 scale: 0=none, 1=mild, 2=moderate, 3=severe
  feature_scores JSONB DEFAULT '{
    "asymmetry": { "score": 0, "confidence": 0, "description": "" },
    "border": { "score": 0, "confidence": 0, "description": "" },
    "color": { "score": 0, "confidence": 0, "description": "" },
    "diameter": { "score": 0, "confidence": 0, "description": "" },
    "evolution": { "score": 0, "confidence": 0, "description": "" },
    "total_score": 0
  }'::JSONB,

  -- Dermoscopy pattern recognition (if dermoscopic image)
  dermoscopy_patterns JSONB DEFAULT '{
    "is_dermoscopic": false,
    "global_pattern": null,
    "local_features": [],
    "pigment_network": null,
    "dots_globules": null,
    "streaks": null,
    "blue_white_veil": false,
    "regression_structures": false,
    "vascular_patterns": []
  }'::JSONB,

  -- Risk stratification
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low', -- low, moderate, high
  risk_factors TEXT[], -- Array of identified risk factors

  -- Recommendations
  recommendations TEXT[] DEFAULT ARRAY[]::TEXT[],
  recommended_action VARCHAR(50), -- reassure, monitor, biopsy, urgent_referral
  follow_up_interval VARCHAR(50), -- 1_week, 1_month, 3_months, 6_months, 1_year

  -- Clinical notes
  ai_summary TEXT, -- AI-generated summary
  clinical_notes TEXT, -- Provider notes

  -- Raw response from AI model (for debugging/audit)
  raw_response JSONB,

  -- Processing info
  processing_time_ms INTEGER,
  error_message TEXT,

  -- Audit trail
  analyzed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id)
);

-- =====================================================
-- AI Analysis Feedback
-- Provider feedback for continuous improvement
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_analysis_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Link to analysis
  analysis_id UUID NOT NULL REFERENCES ai_lesion_analyses(id) ON DELETE CASCADE,

  -- Provider feedback
  provider_id UUID NOT NULL REFERENCES users(id),

  -- Accuracy assessment
  was_accurate BOOLEAN NOT NULL,
  accuracy_rating INTEGER CHECK (accuracy_rating BETWEEN 1 AND 5), -- 1=poor, 5=excellent

  -- Actual diagnosis (if different from AI)
  actual_diagnosis VARCHAR(255),
  actual_icd10_code VARCHAR(20),

  -- Classification accuracy
  classification_was_correct BOOLEAN,
  correct_classification VARCHAR(50), -- If wrong, what should it have been

  -- Risk assessment accuracy
  risk_assessment_was_correct BOOLEAN,
  correct_risk_level VARCHAR(20),

  -- ABCDE scoring accuracy
  abcde_scoring_accuracy INTEGER CHECK (abcde_scoring_accuracy BETWEEN 1 AND 5),

  -- Detailed feedback
  feedback_notes TEXT,
  missed_features TEXT[], -- Features the AI should have detected
  false_positive_features TEXT[], -- Features incorrectly identified

  -- Outcome tracking
  biopsy_performed BOOLEAN DEFAULT false,
  biopsy_result TEXT,
  final_pathology VARCHAR(255),

  -- Feedback metadata
  feedback_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AI Comparison Analyses
-- Track AI-powered comparison between images
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_comparison_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Images being compared
  current_image_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  prior_image_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Time between images
  days_between INTEGER,

  -- Analysis results
  model_version VARCHAR(100) NOT NULL,
  analysis_date TIMESTAMPTZ DEFAULT NOW(),

  -- Change detection
  overall_change_score DECIMAL(5,4), -- 0 to 1 (magnitude of change)
  change_classification VARCHAR(50), -- stable, improved, progressed, significantly_changed

  -- Specific changes detected
  changes_detected JSONB DEFAULT '{
    "size_change": { "detected": false, "direction": null, "magnitude": null },
    "color_change": { "detected": false, "description": null },
    "border_change": { "detected": false, "description": null },
    "symmetry_change": { "detected": false, "description": null },
    "new_features": [],
    "resolved_features": []
  }'::JSONB,

  -- Risk assessment
  risk_level VARCHAR(20), -- low, moderate, high
  recommended_action VARCHAR(50),

  -- AI narrative
  comparison_summary TEXT,
  recommendations TEXT[],

  -- Raw response
  raw_response JSONB,

  -- Audit
  analyzed_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT different_images CHECK (current_image_id != prior_image_id)
);

-- =====================================================
-- AI Analysis Audit Log
-- Track all AI analysis activities for compliance
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_analysis_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Action details
  action_type VARCHAR(50) NOT NULL, -- analysis_requested, analysis_completed, feedback_submitted, results_viewed
  analysis_id UUID REFERENCES ai_lesion_analyses(id) ON DELETE SET NULL,
  comparison_id UUID REFERENCES ai_comparison_analyses(id) ON DELETE SET NULL,

  -- User and context
  user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID REFERENCES patients(id),

  -- Action metadata
  action_details JSONB DEFAULT '{}'::JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- AI Model Configs
CREATE INDEX idx_ai_model_configs_tenant ON ai_model_configs(tenant_id);
CREATE INDEX idx_ai_model_configs_active ON ai_model_configs(tenant_id, is_active) WHERE is_active = true;

-- AI Lesion Analyses
CREATE INDEX idx_ai_lesion_analyses_tenant ON ai_lesion_analyses(tenant_id);
CREATE INDEX idx_ai_lesion_analyses_image ON ai_lesion_analyses(lesion_image_id);
CREATE INDEX idx_ai_lesion_analyses_patient ON ai_lesion_analyses(patient_id);
CREATE INDEX idx_ai_lesion_analyses_encounter ON ai_lesion_analyses(encounter_id);
CREATE INDEX idx_ai_lesion_analyses_date ON ai_lesion_analyses(analysis_date DESC);
CREATE INDEX idx_ai_lesion_analyses_risk ON ai_lesion_analyses(risk_level) WHERE is_archived = false;
CREATE INDEX idx_ai_lesion_analyses_classification ON ai_lesion_analyses(primary_classification);

-- High-risk lesions for quick access
CREATE INDEX idx_ai_lesion_analyses_high_risk ON ai_lesion_analyses(patient_id, analysis_date DESC)
  WHERE risk_level = 'high' AND is_archived = false;

-- AI Analysis Feedback
CREATE INDEX idx_ai_analysis_feedback_analysis ON ai_analysis_feedback(analysis_id);
CREATE INDEX idx_ai_analysis_feedback_provider ON ai_analysis_feedback(provider_id);
CREATE INDEX idx_ai_analysis_feedback_date ON ai_analysis_feedback(feedback_date DESC);
CREATE INDEX idx_ai_analysis_feedback_accuracy ON ai_analysis_feedback(was_accurate);

-- AI Comparison Analyses
CREATE INDEX idx_ai_comparison_current ON ai_comparison_analyses(current_image_id);
CREATE INDEX idx_ai_comparison_prior ON ai_comparison_analyses(prior_image_id);
CREATE INDEX idx_ai_comparison_patient ON ai_comparison_analyses(patient_id);

-- Audit Log
CREATE INDEX idx_ai_analysis_audit_tenant ON ai_analysis_audit_log(tenant_id);
CREATE INDEX idx_ai_analysis_audit_user ON ai_analysis_audit_log(user_id);
CREATE INDEX idx_ai_analysis_audit_date ON ai_analysis_audit_log(created_at DESC);
CREATE INDEX idx_ai_analysis_audit_patient ON ai_analysis_audit_log(patient_id);

-- =====================================================
-- Triggers
-- =====================================================

-- Update timestamp trigger for ai_lesion_analyses
CREATE OR REPLACE FUNCTION update_ai_lesion_analysis_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_lesion_analysis_updated
  BEFORE UPDATE ON ai_lesion_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_lesion_analysis_timestamp();

-- Update timestamp trigger for ai_model_configs
CREATE TRIGGER ai_model_config_updated
  BEFORE UPDATE ON ai_model_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_lesion_analysis_timestamp();

-- Update timestamp trigger for ai_analysis_feedback
CREATE TRIGGER ai_analysis_feedback_updated
  BEFORE UPDATE ON ai_analysis_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_lesion_analysis_timestamp();

-- =====================================================
-- Views
-- =====================================================

-- High-risk lesion summary view
CREATE OR REPLACE VIEW ai_high_risk_lesions AS
SELECT
  a.id AS analysis_id,
  a.tenant_id,
  a.patient_id,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.mrn,
  a.lesion_image_id,
  ph.url AS image_url,
  a.analysis_date,
  a.primary_classification,
  a.confidence_score,
  a.risk_level,
  a.differential_diagnoses,
  a.feature_scores,
  a.recommended_action,
  a.ai_summary,
  u.first_name || ' ' || u.last_name AS analyzed_by_name
FROM ai_lesion_analyses a
JOIN patients p ON a.patient_id = p.id
JOIN photos ph ON a.lesion_image_id = ph.id
JOIN users u ON a.analyzed_by = u.id
WHERE a.risk_level = 'high'
  AND a.is_archived = false
ORDER BY a.analysis_date DESC;

-- AI Analysis accuracy metrics view
CREATE OR REPLACE VIEW ai_analysis_accuracy_metrics AS
SELECT
  a.tenant_id,
  a.model_version,
  COUNT(*) AS total_analyses,
  COUNT(f.id) AS analyses_with_feedback,
  COUNT(*) FILTER (WHERE f.was_accurate = true) AS accurate_count,
  COUNT(*) FILTER (WHERE f.was_accurate = false) AS inaccurate_count,
  ROUND(
    COUNT(*) FILTER (WHERE f.was_accurate = true)::DECIMAL / NULLIF(COUNT(f.id), 0) * 100,
    2
  ) AS accuracy_percentage,
  AVG(f.accuracy_rating) AS avg_accuracy_rating,
  AVG(f.abcde_scoring_accuracy) AS avg_abcde_accuracy
FROM ai_lesion_analyses a
LEFT JOIN ai_analysis_feedback f ON a.id = f.analysis_id
WHERE a.is_archived = false
GROUP BY a.tenant_id, a.model_version;

-- =====================================================
-- Comments for Documentation
-- =====================================================
COMMENT ON TABLE ai_model_configs IS 'Configuration for AI analysis models/providers';
COMMENT ON TABLE ai_lesion_analyses IS 'AI-powered lesion analysis results with differential diagnosis and ABCDE scoring';
COMMENT ON TABLE ai_analysis_feedback IS 'Provider feedback on AI analysis accuracy for continuous improvement';
COMMENT ON TABLE ai_comparison_analyses IS 'AI-powered comparison between lesion images over time';
COMMENT ON TABLE ai_analysis_audit_log IS 'Audit trail for all AI analysis activities';
COMMENT ON COLUMN ai_lesion_analyses.primary_classification IS 'Overall lesion classification: benign, suspicious, or likely_malignant';
COMMENT ON COLUMN ai_lesion_analyses.feature_scores IS 'ABCDE dermoscopy scoring with AI-detected values';
COMMENT ON COLUMN ai_lesion_analyses.risk_level IS 'Risk stratification: low, moderate, or high';
COMMENT ON VIEW ai_high_risk_lesions IS 'Quick access to all high-risk lesion analyses';
COMMENT ON VIEW ai_analysis_accuracy_metrics IS 'Aggregated accuracy metrics for AI model performance tracking';
