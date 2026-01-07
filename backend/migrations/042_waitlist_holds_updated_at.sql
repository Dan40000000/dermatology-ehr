-- Migration: Add updated_at column to waitlist_holds
-- Description: Add tracking for when holds are updated (accepted, expired, cancelled)

-- Add updated_at column if it doesn't exist
ALTER TABLE waitlist_holds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for updated_at
CREATE INDEX IF NOT EXISTS idx_waitlist_holds_updated_at ON waitlist_holds(updated_at DESC);

-- Update existing records to have updated_at = created_at
UPDATE waitlist_holds SET updated_at = created_at WHERE updated_at IS NULL;
