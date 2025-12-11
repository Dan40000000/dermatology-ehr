-- ================================================
-- DATABASE PERFORMANCE OPTIMIZATIONS
-- ================================================
-- This file contains indexes and optimizations for common query patterns
-- Run this after initial schema creation to improve query performance
-- ================================================

-- ================================================
-- PATIENTS TABLE OPTIMIZATIONS
-- ================================================

-- Index for patient search by name (common in search functionality)
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(tenant_id, last_name, first_name);

-- Index for patient search by date of birth (common in verification)
CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(tenant_id, date_of_birth);

-- Index for patient search by email (common for login and communication)
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(tenant_id, email);

-- Composite index for patient list queries with sorting
CREATE INDEX IF NOT EXISTS idx_patients_list ON patients(tenant_id, last_name, first_name, date_of_birth)
WHERE deleted_at IS NULL;

-- ================================================
-- APPOINTMENTS TABLE OPTIMIZATIONS
-- ================================================

-- Index for appointments by patient (used in patient detail view)
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, scheduled_start DESC)
WHERE deleted_at IS NULL;

-- Index for appointments by provider and date (schedule view)
CREATE INDEX IF NOT EXISTS idx_appointments_provider_date ON appointments(provider_id, scheduled_start, scheduled_end)
WHERE deleted_at IS NULL;

-- Index for appointments by date and status (daily schedule)
CREATE INDEX IF NOT EXISTS idx_appointments_date_status ON appointments(tenant_id, scheduled_start, status)
WHERE deleted_at IS NULL;

-- Index for appointment conflict detection
CREATE INDEX IF NOT EXISTS idx_appointments_conflicts ON appointments(provider_id, scheduled_start, scheduled_end)
WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show');

-- Index for location-based appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_location ON appointments(location_id, scheduled_start)
WHERE deleted_at IS NULL;

-- ================================================
-- ENCOUNTERS TABLE OPTIMIZATIONS
-- ================================================

-- Index for encounters by patient (patient chart view)
CREATE INDEX IF NOT EXISTS idx_encounters_patient_date ON encounters(patient_id, created_at DESC);

-- Index for encounters by provider (provider productivity)
CREATE INDEX IF NOT EXISTS idx_encounters_provider ON encounters(provider_id, created_at DESC);

-- Index for unsigned encounters (workflow queues)
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(tenant_id, status, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for billing queries (encounters with charges)
CREATE INDEX IF NOT EXISTS idx_encounters_billing ON encounters(tenant_id, created_at)
WHERE status = 'signed' AND deleted_at IS NULL;

-- ================================================
-- TASKS TABLE OPTIMIZATIONS
-- ================================================

-- Index for tasks by status and due date (task dashboard)
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(tenant_id, status, due_at)
WHERE deleted_at IS NULL;

-- Index for tasks by assignee (my tasks view)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to_id, status, due_at)
WHERE deleted_at IS NULL;

-- Index for patient-related tasks
CREATE INDEX IF NOT EXISTS idx_tasks_patient ON tasks(patient_id, status, due_at)
WHERE deleted_at IS NULL AND patient_id IS NOT NULL;

-- Index for overdue tasks
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(tenant_id, due_at, status)
WHERE deleted_at IS NULL AND status != 'completed';

-- ================================================
-- MESSAGES TABLE OPTIMIZATIONS
-- ================================================

-- Index for patient message threads
CREATE INDEX IF NOT EXISTS idx_messages_patient ON messages(patient_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for unread messages
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(tenant_id, read_at, created_at DESC)
WHERE deleted_at IS NULL AND read_at IS NULL;

-- Index for message search
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages(tenant_id, subject, created_at DESC)
WHERE deleted_at IS NULL;

-- ================================================
-- DOCUMENTS TABLE OPTIMIZATIONS
-- ================================================

-- Index for documents by patient
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id, uploaded_at DESC)
WHERE deleted_at IS NULL;

-- Index for documents by type (filtering)
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(tenant_id, type, uploaded_at DESC)
WHERE deleted_at IS NULL;

-- ================================================
-- PHOTOS TABLE OPTIMIZATIONS
-- ================================================

-- Index for photos by patient
CREATE INDEX IF NOT EXISTS idx_photos_patient ON photos(patient_id, captured_at DESC)
WHERE deleted_at IS NULL;

-- Index for photos by body location (comparison views)
CREATE INDEX IF NOT EXISTS idx_photos_location ON photos(patient_id, body_location, captured_at DESC)
WHERE deleted_at IS NULL;

-- Index for recent photos
CREATE INDEX IF NOT EXISTS idx_photos_recent ON photos(tenant_id, captured_at DESC)
WHERE deleted_at IS NULL;

-- ================================================
-- CHARGES TABLE OPTIMIZATIONS
-- ================================================

-- Index for charges by encounter (billing page)
CREATE INDEX IF NOT EXISTS idx_charges_encounter ON charges(encounter_id, created_at);

-- Index for charges by patient (patient billing history)
CREATE INDEX IF NOT EXISTS idx_charges_patient ON charges(patient_id, created_at DESC);

-- Index for unbilled charges
CREATE INDEX IF NOT EXISTS idx_charges_unbilled ON charges(tenant_id, billed_at, created_at)
WHERE deleted_at IS NULL AND billed_at IS NULL;

-- Index for revenue reporting
CREATE INDEX IF NOT EXISTS idx_charges_revenue ON charges(tenant_id, service_date, amount_cents)
WHERE deleted_at IS NULL;

-- ================================================
-- VITALS TABLE OPTIMIZATIONS
-- ================================================

-- Index for vitals by encounter
CREATE INDEX IF NOT EXISTS idx_vitals_encounter ON vitals(encounter_id, created_at DESC);

-- Index for patient vitals history
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id, created_at DESC);

-- ================================================
-- ORDERS TABLE OPTIMIZATIONS
-- ================================================

-- Index for orders by patient
CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders(patient_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for orders by status
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status, created_at DESC)
WHERE deleted_at IS NULL;

-- Index for orders by type (lab, imaging, etc)
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(tenant_id, type, created_at DESC)
WHERE deleted_at IS NULL;

-- ================================================
-- AUDIT LOG TABLE OPTIMIZATIONS
-- ================================================

-- Index for audit log by user
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);

-- Index for audit log by entity (track changes to specific records)
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(tenant_id, entity_type, entity_id, created_at DESC);

-- Index for recent audit entries
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_log(tenant_id, created_at DESC);

-- ================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ================================================
-- Update statistics for the query planner to make better decisions

ANALYZE patients;
ANALYZE appointments;
ANALYZE encounters;
ANALYZE tasks;
ANALYZE messages;
ANALYZE documents;
ANALYZE photos;
ANALYZE charges;
ANALYZE vitals;
ANALYZE orders;
ANALYZE audit_log;
ANALYZE providers;
ANALYZE locations;
ANALYZE appointment_types;

-- ================================================
-- VACUUM TABLES (Optional - Run periodically)
-- ================================================
-- Uncomment and run periodically to reclaim space and update statistics

-- VACUUM ANALYZE patients;
-- VACUUM ANALYZE appointments;
-- VACUUM ANALYZE encounters;
-- VACUUM ANALYZE tasks;
-- VACUUM ANALYZE messages;
-- VACUUM ANALYZE documents;
-- VACUUM ANALYZE photos;
-- VACUUM ANALYZE charges;
-- VACUUM ANALYZE vitals;
-- VACUUM ANALYZE orders;
-- VACUUM ANALYZE audit_log;

-- ================================================
-- QUERY PERFORMANCE MONITORING
-- ================================================
-- Use these queries to monitor slow queries (PostgreSQL specific)

-- View slow queries (requires pg_stat_statements extension)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- SELECT
--   calls,
--   total_exec_time,
--   mean_exec_time,
--   max_exec_time,
--   query
-- FROM pg_stat_statements
-- ORDER BY mean_exec_time DESC
-- LIMIT 20;

-- ================================================
-- INDEX USAGE STATISTICS
-- ================================================
-- Check if indexes are being used (run after application has been running)

-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan,
--   idx_tup_read,
--   idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- ================================================
-- TABLE STATISTICS
-- ================================================
-- View table sizes and row counts

-- SELECT
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
--   pg_stat_get_live_tuples(schemaname||'.'||tablename::regclass) AS row_count
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
