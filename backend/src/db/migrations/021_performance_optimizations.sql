-- ================================================
-- MIGRATION 021: COMPREHENSIVE PERFORMANCE OPTIMIZATIONS
-- ================================================
-- Created: 2026-01-16
-- Purpose: Add additional indexes and optimizations based on query patterns
-- ================================================

-- ================================================
-- APPOINTMENTS TABLE - Additional Optimizations
-- ================================================

-- Composite index for appointment list queries with joins
CREATE INDEX IF NOT EXISTS idx_appointments_list_query
ON appointments(tenant_id, scheduled_start DESC)
INCLUDE (patient_id, provider_id, location_id, appointment_type_id, status)
WHERE deleted_at IS NULL;

-- Index for appointment search by patient name (via join)
-- This helps with filtered appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_date_range
ON appointments(tenant_id, scheduled_start, scheduled_end)
WHERE deleted_at IS NULL;

-- Index for status history queries
CREATE INDEX IF NOT EXISTS idx_appointment_status_history_lookup
ON appointment_status_history(appointment_id, changed_at DESC);

-- ================================================
-- PATIENTS TABLE - Search Optimizations
-- ================================================

-- Composite index for patient list with common filters
CREATE INDEX IF NOT EXISTS idx_patients_active_list
ON patients(tenant_id, created_at DESC)
INCLUDE (first_name, last_name, dob, phone, email)
WHERE deleted_at IS NULL;

-- Text search index for patient name search
CREATE INDEX IF NOT EXISTS idx_patients_name_search
ON patients USING gin((
  to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
))
WHERE deleted_at IS NULL;

-- Index for patient phone lookup (for quick verification)
CREATE INDEX IF NOT EXISTS idx_patients_phone_lookup
ON patients(tenant_id, phone)
WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- ================================================
-- ENCOUNTERS TABLE - Performance Enhancements
-- ================================================

-- Index for encounter superbill generation (common join pattern)
CREATE INDEX IF NOT EXISTS idx_encounters_superbill
ON encounters(tenant_id, id)
INCLUDE (patient_id, provider_id, created_at, status)
WHERE deleted_at IS NULL;

-- Index for encounter diagnoses lookup
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_lookup
ON encounter_diagnoses(encounter_id, is_primary DESC, created_at)
WHERE deleted_at IS NULL;

-- ================================================
-- PROVIDERS TABLE - Caching Support
-- ================================================

-- Index for provider lookups (frequently cached)
CREATE INDEX IF NOT EXISTS idx_providers_tenant_active
ON providers(tenant_id, full_name)
WHERE deleted_at IS NULL;

-- ================================================
-- LOCATIONS TABLE - Caching Support
-- ================================================

-- Index for location lookups (frequently cached)
CREATE INDEX IF NOT EXISTS idx_locations_tenant_active
ON locations(tenant_id, name)
WHERE deleted_at IS NULL;

-- ================================================
-- APPOINTMENT TYPES TABLE - Caching Support
-- ================================================

-- Index for appointment type lookups (frequently cached)
CREATE INDEX IF NOT EXISTS idx_appointment_types_tenant_active
ON appointment_types(tenant_id, name)
WHERE deleted_at IS NULL;

-- ================================================
-- ICD10 CODES TABLE - Search Performance
-- ================================================

-- Text search index for ICD10 code search
CREATE INDEX IF NOT EXISTS idx_icd10_codes_search
ON icd10_codes USING gin((
  to_tsvector('english', code || ' ' || description)
));

-- Index for code prefix search (common pattern)
CREATE INDEX IF NOT EXISTS idx_icd10_codes_prefix
ON icd10_codes(code varchar_pattern_ops);

-- ================================================
-- CPT CODES TABLE - Search Performance
-- ================================================

-- Text search index for CPT code search
CREATE INDEX IF NOT EXISTS idx_cpt_codes_search
ON cpt_codes USING gin((
  to_tsvector('english', code || ' ' || description)
));

-- Index for code prefix search
CREATE INDEX IF NOT EXISTS idx_cpt_codes_prefix
ON cpt_codes(code varchar_pattern_ops);

-- ================================================
-- MEDICATIONS TABLE - Search Performance
-- ================================================

-- Text search index for medication search (if medications table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medications') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_medications_search ON medications USING gin((to_tsvector(''english'', name || '' '' || coalesce(generic_name, ''''))))';
  END IF;
END
$$;

-- ================================================
-- TASKS TABLE - Additional Optimizations
-- ================================================

-- Index for task list with patient info
CREATE INDEX IF NOT EXISTS idx_tasks_with_context
ON tasks(tenant_id, status, due_at DESC)
INCLUDE (patient_id, assigned_to_id, title, priority)
WHERE deleted_at IS NULL;

-- Index for high priority tasks
CREATE INDEX IF NOT EXISTS idx_tasks_high_priority
ON tasks(tenant_id, priority, due_at)
WHERE deleted_at IS NULL AND priority = 'high' AND status != 'completed';

-- ================================================
-- MESSAGES TABLE - Additional Optimizations
-- ================================================

-- Index for message threads with patient
CREATE INDEX IF NOT EXISTS idx_messages_thread
ON messages(patient_id, created_at DESC, read_at)
WHERE deleted_at IS NULL;

-- Index for urgent unread messages
CREATE INDEX IF NOT EXISTS idx_messages_urgent_unread
ON messages(tenant_id, priority, created_at DESC)
WHERE deleted_at IS NULL AND read_at IS NULL AND priority = 'high';

-- ================================================
-- DOCUMENTS TABLE - Additional Optimizations
-- ================================================

-- Index for document list with type filter
CREATE INDEX IF NOT EXISTS idx_documents_patient_type
ON documents(patient_id, type, uploaded_at DESC)
WHERE deleted_at IS NULL;

-- ================================================
-- PHOTOS TABLE - Comparison View Optimization
-- ================================================

-- Index for photo comparison queries
CREATE INDEX IF NOT EXISTS idx_photos_comparison
ON photos(patient_id, body_location, captured_at DESC)
INCLUDE (s3_key, thumbnail_s3_key)
WHERE deleted_at IS NULL;

-- ================================================
-- CHARGES TABLE - Billing Optimizations
-- ================================================

-- Index for charge status queries
CREATE INDEX IF NOT EXISTS idx_charges_billing_status
ON charges(tenant_id, status, service_date DESC)
WHERE deleted_at IS NULL;

-- Index for patient balance calculations
CREATE INDEX IF NOT EXISTS idx_charges_patient_balance
ON charges(patient_id, status, service_date)
WHERE deleted_at IS NULL;

-- ================================================
-- AUDIT LOG - Query Performance
-- ================================================

-- Index for audit trail by date range
CREATE INDEX IF NOT EXISTS idx_audit_date_range
ON audit_log(tenant_id, created_at DESC)
INCLUDE (actor_id, action, entity_type, entity_id);

-- Index for entity audit history
CREATE INDEX IF NOT EXISTS idx_audit_entity_history
ON audit_log(entity_type, entity_id, created_at DESC);

-- ================================================
-- USER SESSIONS - Performance
-- ================================================

-- Index for active user sessions (if users table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_active_sessions ON users(tenant_id, last_login_at DESC) WHERE deleted_at IS NULL';
  END IF;
END
$$;

-- ================================================
-- CLAIMS TABLE - Processing Optimizations
-- ================================================

-- Index for claims by status and submission date
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claims') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_claims_processing ON claims(tenant_id, status, submission_date DESC) WHERE deleted_at IS NULL';
  END IF;
END
$$;

-- ================================================
-- LABS/ORDERS - Result Tracking
-- ================================================

-- Index for pending lab results
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_results') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lab_results_pending ON lab_results(tenant_id, status, created_at DESC) WHERE status = ''pending''';
  END IF;
END
$$;

-- ================================================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- ================================================

-- Partial index for scheduled (upcoming) appointments only
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
ON appointments(tenant_id, provider_id, scheduled_start)
WHERE status = 'scheduled' AND scheduled_start > CURRENT_TIMESTAMP AND deleted_at IS NULL;

-- Partial index for draft encounters only
CREATE INDEX IF NOT EXISTS idx_encounters_draft
ON encounters(tenant_id, provider_id, created_at DESC)
WHERE status = 'draft' AND deleted_at IS NULL;

-- Partial index for overdue tasks
CREATE INDEX IF NOT EXISTS idx_tasks_overdue_detailed
ON tasks(tenant_id, assigned_to_id, due_at)
WHERE status NOT IN ('completed', 'cancelled') AND due_at < CURRENT_TIMESTAMP AND deleted_at IS NULL;

-- ================================================
-- COVERING INDEXES (INCLUDE columns)
-- ================================================
-- These indexes include commonly selected columns to avoid table lookups

-- Provider schedule covering index
CREATE INDEX IF NOT EXISTS idx_appointments_provider_schedule_covering
ON appointments(provider_id, scheduled_start, scheduled_end)
INCLUDE (patient_id, location_id, appointment_type_id, status)
WHERE deleted_at IS NULL;

-- Patient chart covering index
CREATE INDEX IF NOT EXISTS idx_encounters_patient_chart_covering
ON encounters(patient_id, created_at DESC)
INCLUDE (provider_id, status, chief_complaint)
WHERE deleted_at IS NULL;

-- ================================================
-- UPDATE TABLE STATISTICS
-- ================================================
-- Ensure query planner has accurate statistics

ANALYZE appointments;
ANALYZE patients;
ANALYZE encounters;
ANALYZE providers;
ANALYZE locations;
ANALYZE appointment_types;
ANALYZE tasks;
ANALYZE messages;
ANALYZE documents;
ANALYZE photos;
ANALYZE charges;
ANALYZE audit_log;
ANALYZE icd10_codes;
ANALYZE cpt_codes;
ANALYZE encounter_diagnoses;

-- ================================================
-- SET TABLE AUTOVACUUM SETTINGS
-- ================================================
-- Optimize autovacuum for high-traffic tables

ALTER TABLE appointments SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE patients SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE encounters SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE audit_log SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- ================================================
-- MIGRATION COMPLETE
-- ================================================

-- Record migration
DO $$
BEGIN
  -- This is just a log entry, actual migration tracking happens in migrate.ts
  RAISE NOTICE 'Migration 021: Performance optimizations completed successfully';
END
$$;
