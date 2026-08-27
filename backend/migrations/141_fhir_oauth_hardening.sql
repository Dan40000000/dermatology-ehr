-- FHIR OAuth/SMART context hardening.
-- Tokens are provisioned by the deployment's authorization service; this
-- migration intentionally does not seed demo credentials or long-lived tokens.

ALTER TABLE fhir_oauth_tokens
  ADD COLUMN IF NOT EXISTS patient_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_fhir_tokens_patient
  ON fhir_oauth_tokens(patient_id);

-- Remove any credentials created by the historical demo seed if that migration
-- has already run in an existing environment.
DELETE FROM fhir_oauth_tokens
WHERE client_id ILIKE '%demo%'
   OR client_name ILIKE '%demo%';
