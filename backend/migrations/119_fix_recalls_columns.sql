-- Migration to add missing columns to patient_recalls table
-- Safe to run multiple times (uses IF NOT EXISTS pattern)

-- Add campaign_id column if missing
ALTER TABLE patient_recalls ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES recall_campaigns(id) ON DELETE SET NULL;

-- Add index on campaign_id if missing
CREATE INDEX IF NOT EXISTS idx_patient_recalls_campaign ON patient_recalls(campaign_id);

-- Ensure recall_campaigns table exists with all needed columns
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS recall_type TEXT;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS interval_months INTEGER;
ALTER TABLE recall_campaigns ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create indexes if missing
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_tenant ON recall_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recall_campaigns_active ON recall_campaigns(is_active);
