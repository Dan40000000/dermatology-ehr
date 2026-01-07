-- AI Agent Configurations
-- Allows offices to create multiple AI agent profiles for different visit types
-- e.g., Medical Dermatology, Cosmetic Consult, Mohs Surgery, Pediatric Derm

-- Main configurations table
CREATE TABLE IF NOT EXISTS ai_agent_configurations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Configuration metadata
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Visit type association (optional)
  appointment_type_id TEXT REFERENCES appointment_types(id) ON DELETE SET NULL,
  specialty_focus TEXT, -- 'medical_derm', 'cosmetic', 'mohs', 'pediatric_derm', 'general'

  -- AI Model Configuration
  ai_model TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  temperature DECIMAL(3,2) DEFAULT 0.30,
  max_tokens INTEGER DEFAULT 4000,

  -- Prompt Templates
  system_prompt TEXT NOT NULL,
  prompt_template TEXT NOT NULL,

  -- Note Structure Configuration (JSONB)
  note_sections JSONB NOT NULL DEFAULT '["chiefComplaint", "hpi", "ros", "physicalExam", "assessment", "plan"]'::jsonb,
  section_prompts JSONB DEFAULT '{}'::jsonb,

  -- Output Formatting
  output_format TEXT DEFAULT 'soap', -- soap, narrative, procedure_note
  verbosity_level TEXT DEFAULT 'standard', -- concise, standard, detailed
  include_codes BOOLEAN DEFAULT true,

  -- Terminology & Focus (JSONB)
  terminology_set JSONB DEFAULT '{}'::jsonb,
  focus_areas JSONB DEFAULT '[]'::jsonb,

  -- Code Suggestions (JSONB)
  default_cpt_codes JSONB DEFAULT '[]'::jsonb,
  default_icd10_codes JSONB DEFAULT '[]'::jsonb,

  -- Follow-up & Tasks
  default_follow_up_interval TEXT,
  task_templates JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique names per tenant
  UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX idx_agent_configs_tenant ON ai_agent_configurations(tenant_id);
CREATE INDEX idx_agent_configs_appointment_type ON ai_agent_configurations(appointment_type_id);
CREATE INDEX idx_agent_configs_active ON ai_agent_configurations(tenant_id, is_active);
CREATE INDEX idx_agent_configs_specialty ON ai_agent_configurations(tenant_id, specialty_focus);

-- Ensure only one default per tenant
CREATE UNIQUE INDEX idx_agent_configs_one_default_per_tenant
  ON ai_agent_configurations(tenant_id)
  WHERE is_default = true;

-- Add agent configuration reference to ambient_recordings
ALTER TABLE ambient_recordings
ADD COLUMN IF NOT EXISTS agent_config_id TEXT REFERENCES ai_agent_configurations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ambient_recordings_agent_config ON ambient_recordings(agent_config_id);

-- Add agent configuration tracking to ambient_generated_notes
ALTER TABLE ambient_generated_notes
ADD COLUMN IF NOT EXISTS agent_config_id TEXT REFERENCES ai_agent_configurations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS agent_config_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_ambient_notes_agent_config ON ambient_generated_notes(agent_config_id);

-- Agent configuration version history (for audit trail)
CREATE TABLE IF NOT EXISTS ai_agent_config_versions (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL REFERENCES ai_agent_configurations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Snapshot of configuration at this version
  config_snapshot JSONB NOT NULL,

  -- Change metadata
  changed_by TEXT REFERENCES users(id),
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(config_id, version_number)
);

CREATE INDEX idx_agent_config_versions_config ON ai_agent_config_versions(config_id);

-- Usage analytics tracking
CREATE TABLE IF NOT EXISTS ai_agent_usage_analytics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_config_id TEXT NOT NULL REFERENCES ai_agent_configurations(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,

  -- Usage metrics
  notes_generated INTEGER DEFAULT 0,
  notes_approved INTEGER DEFAULT 0,
  notes_rejected INTEGER DEFAULT 0,
  avg_confidence_score DECIMAL(5,4),
  avg_edit_count DECIMAL(5,2),

  -- Time metrics
  avg_generation_time_ms INTEGER,
  avg_review_time_seconds INTEGER,

  -- Period (for aggregation)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(tenant_id, agent_config_id, provider_id, period_start)
);

CREATE INDEX idx_agent_analytics_config ON ai_agent_usage_analytics(agent_config_id);
CREATE INDEX idx_agent_analytics_period ON ai_agent_usage_analytics(period_start, period_end);
CREATE INDEX idx_agent_analytics_tenant ON ai_agent_usage_analytics(tenant_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_agent_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_agent_config_updated_at
  BEFORE UPDATE ON ai_agent_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_config_timestamp();

CREATE TRIGGER trigger_ai_agent_analytics_updated_at
  BEFORE UPDATE ON ai_agent_usage_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_agent_config_timestamp();
