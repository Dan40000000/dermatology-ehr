-- Add encrypted SSN storage and last-4 helper column
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_last4 TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_encrypted TEXT;

-- Backfill last-4 where plaintext exists
UPDATE patients
SET ssn_last4 = RIGHT(ssn, 4)
WHERE ssn IS NOT NULL AND (ssn_last4 IS NULL OR ssn_last4 = '');
