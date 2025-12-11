-- Note Templates Table
-- Stores reusable clinical note templates for dermatology encounters
CREATE TABLE IF NOT EXISTS note_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_shared BOOLEAN DEFAULT false,
  template_content JSONB NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_note_template_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_note_template_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

-- Provider Template Favorites (many-to-many relationship)
CREATE TABLE IF NOT EXISTS provider_template_favorites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_favorite_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorite_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorite_template FOREIGN KEY (template_id) REFERENCES note_templates(id) ON DELETE CASCADE,
  CONSTRAINT unique_provider_template_favorite UNIQUE (provider_id, template_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_note_templates_tenant ON note_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_note_templates_provider ON note_templates(provider_id);
CREATE INDEX IF NOT EXISTS idx_note_templates_category ON note_templates(category);
CREATE INDEX IF NOT EXISTS idx_note_templates_shared ON note_templates(tenant_id, is_shared);
CREATE INDEX IF NOT EXISTS idx_note_templates_usage ON note_templates(tenant_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_provider_favorites_provider ON provider_template_favorites(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_favorites_template ON provider_template_favorites(template_id);

-- Comments for documentation
COMMENT ON TABLE note_templates IS 'Reusable clinical note templates for dermatology encounters';
COMMENT ON COLUMN note_templates.template_content IS 'JSONB structure: {chiefComplaint, hpi, ros, exam, assessmentPlan} with {{variable}} placeholders';
COMMENT ON COLUMN note_templates.category IS 'Template category: Initial Visit, Follow-up Visit, Procedure Note, Biopsy, Excision, Cosmetic Consultation';
COMMENT ON COLUMN note_templates.is_shared IS 'If true, template is visible to all users in tenant; if false, only to creating provider';
COMMENT ON COLUMN note_templates.usage_count IS 'Tracks how many times template has been applied to encounters';
COMMENT ON TABLE provider_template_favorites IS 'Tracks provider favorite templates for quick access';
