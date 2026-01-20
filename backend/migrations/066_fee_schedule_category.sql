-- Add category field to fee_schedule_items for better organization
-- This allows filtering and grouping by procedure categories

ALTER TABLE fee_schedule_items
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_fee_schedule_items_category
ON fee_schedule_items(fee_schedule_id, category);

-- Add comment for documentation
COMMENT ON COLUMN fee_schedule_items.category IS 'Procedure category for organization (e.g., Evaluation & Management, Biopsies, Excisions, etc.)';
