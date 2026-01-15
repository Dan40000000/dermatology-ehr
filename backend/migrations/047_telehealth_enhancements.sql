-- Telehealth Module Enhancements
-- Add reason field and assigned_to field for better case management

-- Add reason field to telehealth_sessions
ALTER TABLE telehealth_sessions
ADD COLUMN IF NOT EXISTS reason VARCHAR(100);

-- Add assigned_to field (for staff assignment)
ALTER TABLE telehealth_sessions
ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES providers(id) ON DELETE SET NULL;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_reason ON telehealth_sessions(reason);
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_assigned_to ON telehealth_sessions(assigned_to);

-- Add comment for documentation
COMMENT ON COLUMN telehealth_sessions.reason IS 'Visit reason from dermatology-specific dropdown';
COMMENT ON COLUMN telehealth_sessions.assigned_to IS 'Staff member or provider assigned to manage this case';
