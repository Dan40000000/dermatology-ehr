-- Task Templates: Pre-defined task templates for quick task creation
-- Supports task templates with title, description, default assignee, priority

-- Task Templates Table
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  default_assignee TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Add 'urgent' priority support to tasks table (extend existing check constraint)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- Add created_by column to tasks table to track who created the task
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_templates_tenant ON task_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_name ON task_templates(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_created_by ON tasks(tenant_id, created_by);

-- Comments for documentation
COMMENT ON TABLE task_templates IS 'Pre-defined task templates for quick task creation';
COMMENT ON COLUMN task_templates.name IS 'Template name for identification';
COMMENT ON COLUMN task_templates.title IS 'Default task title when using this template';
COMMENT ON COLUMN task_templates.default_assignee IS 'Default user to assign tasks created from this template';
COMMENT ON COLUMN tasks.created_by IS 'User who created this task';
