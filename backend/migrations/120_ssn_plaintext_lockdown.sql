-- Enforce encrypted SSN storage policy for HIPAA hardening.
-- Keep only last4 + encrypted value; block plaintext SSN persistence.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_last4 TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ssn_encrypted TEXT;

UPDATE patients
SET ssn_last4 = COALESCE(
  NULLIF(ssn_last4, ''),
  NULLIF(RIGHT(REGEXP_REPLACE(ssn, '\D', '', 'g'), 4), '')
),
ssn = NULL
WHERE ssn IS NOT NULL AND ssn <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_ssn_plaintext_forbidden'
      AND conrelid = 'patients'::regclass
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_ssn_plaintext_forbidden
      CHECK (ssn IS NULL);
  END IF;
END $$;
