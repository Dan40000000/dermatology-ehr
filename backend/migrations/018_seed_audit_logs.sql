-- Sample Audit Log Data for Testing
-- This populates the audit_log table with realistic test data

-- Note: This assumes tenant-demo exists with users
-- Run this AFTER running the migrations

DO $$
DECLARE
  demo_tenant text := 'tenant-demo';
  admin_user text;
  provider_user text;
BEGIN
  -- Get user IDs (these should exist from initial seed)
  SELECT id INTO admin_user FROM users WHERE tenant_id = demo_tenant AND email = 'admin@demo.practice' LIMIT 1;
  SELECT id INTO provider_user FROM users WHERE tenant_id = demo_tenant AND email LIKE '%provider%' LIMIT 1;

  -- Only proceed if we have users
  IF admin_user IS NOT NULL THEN
    -- Successful logins
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'login', 'session', 'session-1', '192.168.1.100', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'info', 'success', NOW() - INTERVAL '2 hours'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'login', 'session', 'session-2', '192.168.1.100', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'info', 'success', NOW() - INTERVAL '1 hour'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'login', 'session', 'session-3', '192.168.1.100', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'info', 'success', NOW() - INTERVAL '30 minutes');

    -- Failed login attempts (security alerts)
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, NULL, 'failed_login', 'session', NULL, '203.0.113.42', 'curl/7.68.0', 'error', 'failure', NOW() - INTERVAL '3 hours'),
      (gen_random_uuid()::text, demo_tenant, NULL, 'failed_login', 'session', NULL, '203.0.113.42', 'curl/7.68.0', 'error', 'failure', NOW() - INTERVAL '2 hours 50 minutes'),
      (gen_random_uuid()::text, demo_tenant, NULL, 'failed_login', 'session', NULL, '203.0.113.42', 'curl/7.68.0', 'critical', 'failure', NOW() - INTERVAL '2 hours 40 minutes');

    -- Patient record access
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, changes, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'view', 'patient', 'patient-001', '192.168.1.100', 'Mozilla/5.0', NULL, 'info', 'success', NOW() - INTERVAL '1 hour 30 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'update', 'patient', 'patient-001', '192.168.1.100', 'Mozilla/5.0', '{"field": "phone", "old": "555-1234", "new": "555-5678"}'::jsonb, 'info', 'success', NOW() - INTERVAL '1 hour 15 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'create', 'patient', 'patient-002', '192.168.1.100', 'Mozilla/5.0', '{"firstName": "Jane", "lastName": "Smith"}'::jsonb, 'info', 'success', NOW() - INTERVAL '1 hour');

    -- Encounter access
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'create', 'encounter', 'enc-001', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '50 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'update', 'encounter', 'enc-001', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '45 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'view', 'encounter', 'enc-001', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '40 minutes');

    -- Document access (high-value events)
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'view', 'document', 'doc-001', '192.168.1.100', 'Mozilla/5.0', '{"documentType": "lab_result", "patientId": "patient-001"}'::jsonb, 'info', 'success', NOW() - INTERVAL '35 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'download', 'document', 'doc-001', '192.168.1.100', 'Mozilla/5.0', '{"documentType": "lab_result", "patientId": "patient-001"}'::jsonb, 'warning', 'success', NOW() - INTERVAL '30 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'export', 'document', 'doc-002', '192.168.1.100', 'Mozilla/5.0', '{"exportFormat": "PDF", "patientId": "patient-001"}'::jsonb, 'warning', 'success', NOW() - INTERVAL '25 minutes');

    -- User management
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, changes, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'update', 'user', admin_user, '192.168.1.100', 'Mozilla/5.0', '{"field": "role", "old": "user", "new": "admin"}'::jsonb, 'warning', 'success', NOW() - INTERVAL '20 minutes');

    -- Appointment modifications
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'create', 'appointment', 'appt-001', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '15 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'update', 'appointment', 'appt-001', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '10 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'delete', 'appointment', 'appt-002', '192.168.1.100', 'Mozilla/5.0', 'warning', 'success', NOW() - INTERVAL '5 minutes');

    -- Recent activity (last few minutes)
    INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, severity, status, created_at)
    VALUES
      (gen_random_uuid()::text, demo_tenant, admin_user, 'view', 'patient', 'patient-003', '192.168.1.100', 'Mozilla/5.0', 'info', 'success', NOW() - INTERVAL '2 minutes'),
      (gen_random_uuid()::text, demo_tenant, admin_user, 'export', 'audit_log', 'full_export', '192.168.1.100', 'Mozilla/5.0', 'warning', 'success', NOW() - INTERVAL '1 minute');

  END IF;
END $$;
