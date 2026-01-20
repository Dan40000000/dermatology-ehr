-- Add differential_diagnoses and recommended_tests columns to ambient_generated_notes table
-- These columns store AI-generated clinical decision support information

ALTER TABLE ambient_generated_notes
ADD COLUMN IF NOT EXISTS differential_diagnoses JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS recommended_tests JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ambient_generated_notes.differential_diagnoses IS 'Array of differential diagnoses with confidence scores: [{condition, confidence, reasoning, icd10Code}]';
COMMENT ON COLUMN ambient_generated_notes.recommended_tests IS 'Array of recommended tests/procedures: [{testName, rationale, urgency, cptCode}]';

-- Create indexes for querying
CREATE INDEX IF NOT EXISTS idx_ambient_notes_differential ON ambient_generated_notes USING GIN (differential_diagnoses);
CREATE INDEX IF NOT EXISTS idx_ambient_notes_recommended_tests ON ambient_generated_notes USING GIN (recommended_tests);
