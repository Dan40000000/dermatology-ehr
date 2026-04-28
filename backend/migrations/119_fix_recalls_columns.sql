-- Migration to add missing columns to patient_recalls table
-- Safe to run multiple times (uses IF NOT EXISTS pattern)

-- Add campaign_id column if missing
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES recall_campaigns(id) ON DELETE SET NULL;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS recall_date DATE;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS recall_type TEXT;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS notified_on TIMESTAMPTZ;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS notification_count INTEGER DEFAULT 0;
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

UPDATE patient_recalls
SET recall_date = COALESCE(recall_date, due_date),
    recall_type = COALESCE(recall_type, 'Manual Recall')
WHERE recall_date IS NULL OR recall_type IS NULL;

-- Add index on campaign_id if missing
CREATE INDEX IF NOT EXISTS idx_patient_recalls_campaign ON patient_recalls(campaign_id);

-- Ensure recall_campaigns table exists with all needed columns
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS recall_type TEXT;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS interval_months INTEGER;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS criteria JSONB DEFAULT '{}'::jsonb;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS message_template TEXT;

-- Create indexes if missing
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_tenant ON recall_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_active ON recall_campaigns(is_active);
