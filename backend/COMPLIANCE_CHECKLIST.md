# Compliance and Monitoring Implementation Checklist

Use this checklist to ensure proper implementation of all compliance and monitoring features.

## Phase 1: Core Setup (5-10 minutes)

### Request ID Middleware

- [ ] Import `requestIdMiddleware` in main app file
- [ ] Add `app.use(requestIdMiddleware)` near top of middleware stack
- [ ] Verify request IDs appear in response headers (`X-Request-ID`)
- [ ] Test with: `curl -I http://localhost:3000/api/health`

### Winston Logger Configuration

- [ ] Verify PHI redaction is applied (already in `src/lib/logger.ts`)
- [ ] Test logging with PHI data
- [ ] Confirm PHI is redacted in log files
- [ ] Check `/logs` directory exists and is writable

### Sentry Configuration

- [ ] Verify Sentry DSN is configured in environment
- [ ] Confirm PHI redaction in `beforeSend` hook (already in `src/lib/sentry.ts`)
- [ ] Test error capture with PHI data
- [ ] Verify no PHI appears in Sentry dashboard

## Phase 2: Rate Limiting (10-15 minutes)

### SMS Endpoints

- [ ] Identify all SMS sending endpoints
- [ ] Add `smsRateLimiter` middleware to each endpoint
  ```typescript
  router.post('/api/sms/send', requireAuth, smsRateLimiter, handler);
  ```
- [ ] Test with 101+ SMS requests to same patient
- [ ] Verify 429 response after 100 requests
- [ ] Check rate limit headers in responses

### Email Endpoints

- [ ] Identify all email sending endpoints
- [ ] Add `emailRateLimiter` middleware to each endpoint
  ```typescript
  router.post('/api/email/send', requireAuth, emailRateLimiter, handler);
  ```
- [ ] Test with 101+ email requests to same patient
- [ ] Verify 429 response after 100 requests
- [ ] Check rate limit headers in responses

### Bulk Operations

- [ ] Identify bulk SMS/email endpoints
- [ ] Add `bulkNotificationLimiter` middleware
  ```typescript
  router.post('/api/sms/send-bulk', requireAuth, bulkNotificationLimiter, handler);
  ```
- [ ] Test with 11+ bulk requests
- [ ] Verify 429 response after 10 requests
- [ ] Check audit log for rate limit violations

## Phase 3: Audit Logging (20-30 minutes)

### Database Verification

- [ ] Verify `audit_log` table exists
- [ ] Check table has correct columns (id, tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, changes, metadata, severity, status, created_at)
- [ ] Verify indexes on tenant_id, user_id, created_at, action
- [ ] Test database connection

### Schedule Block Creation

- [ ] Find schedule block creation endpoints
- [ ] Add `auditBlockCreate` call after creation
  ```typescript
  await auditBlockCreate({
    tenantId, userId, blockId, blockData, requestId: getRequestId(req)
  });
  ```
- [ ] Test block creation
- [ ] Verify audit log entry created
- [ ] Check metadata contains requestId

### Prior Authorization Submission

- [ ] Find prior auth submission endpoints
- [ ] Add `auditPriorAuthSubmit` call after submission
  ```typescript
  await auditPriorAuthSubmit({
    tenantId, userId, priorAuthId, patientId, requestId: getRequestId(req), ipAddress: req.ip
  });
  ```
- [ ] Test prior auth submission
- [ ] Verify audit log entry created
- [ ] Check severity is 'warning'

### Fax Transmission

- [ ] Find fax sending endpoints
- [ ] Add `auditFaxSend` call after sending
  ```typescript
  await auditFaxSend({
    tenantId, userId, faxId, recipientNumber, patientId, requestId: getRequestId(req), ipAddress: req.ip
  });
  ```
- [ ] Test fax sending
- [ ] Verify audit log entry created
- [ ] Check recipient number only shows last 4 digits in metadata

### Patient Data Access

- [ ] Find all patient data access endpoints (GET /api/patients/:id, etc.)
- [ ] Add `auditPatientDataAccess` with accessType: 'view'
  ```typescript
  await auditPatientDataAccess({
    tenantId, userId, patientId, accessType: 'view',
    requestId: getRequestId(req), ipAddress: req.ip, userAgent: req.headers['user-agent']
  });
  ```
- [ ] Find patient creation endpoints (POST /api/patients)
- [ ] Add audit with accessType: 'create'
- [ ] Find patient update endpoints (PUT /api/patients/:id)
- [ ] Add audit with accessType: 'update'
- [ ] Find patient delete endpoints (DELETE /api/patients/:id)
- [ ] Add audit with accessType: 'delete'
- [ ] Find patient export endpoints
- [ ] Add audit with accessType: 'export'
- [ ] Test each operation
- [ ] Verify audit log entries created
- [ ] Check metadata contains phi_access: true

## Phase 4: PHI Redaction Testing (15-20 minutes)

### Application Logs

- [ ] Test logging patient data
  ```typescript
  logger.info('Test', { firstName: 'John', ssn: '123-45-6789', email: 'test@example.com' });
  ```
- [ ] Check log files - verify PHI is redacted
- [ ] Test with nested objects
- [ ] Test with arrays
- [ ] Verify correlation hashes work (same value = same hash)

### Sentry Error Reports

- [ ] Trigger test error with PHI data
  ```typescript
  captureException(new Error('Test'), { patientData: { firstName: 'John' } });
  ```
- [ ] Check Sentry dashboard
- [ ] Verify no PHI in error message
- [ ] Verify no PHI in context data
- [ ] Verify no PHI in breadcrumbs

### Audit Log Metadata

- [ ] Create audit log with PHI in metadata
  ```typescript
  await createAuditLog({
    tenantId, userId, action: 'test', resourceType: 'test',
    metadata: { firstName: 'John', email: 'test@example.com' },
    requestId: getRequestId(req)
  });
  ```
- [ ] Query audit_log table
- [ ] Verify PHI is redacted in metadata field
- [ ] Verify requestId is preserved

## Phase 5: Integration Testing (20-30 minutes)

### End-to-End Workflows

- [ ] Test complete patient access workflow
  - View patient → Check audit log
  - Update patient → Check audit log
  - Export patient data → Check audit log
- [ ] Test complete notification workflow
  - Send SMS → Check rate limit headers
  - Send 100+ SMS → Verify rate limit
  - Check audit log for rate limit violation
- [ ] Test complete document workflow
  - Upload document → Check audit log
  - View document → Check audit log
  - Delete document → Check audit log

### Request Correlation

- [ ] Make request with multiple audit events
- [ ] Get X-Request-ID from response header
- [ ] Query audit_log for that requestId
- [ ] Verify all related events have same requestId

### Error Scenarios

- [ ] Trigger error during patient access
- [ ] Check error is logged with PHI redaction
- [ ] Check Sentry report (if configured)
- [ ] Verify no PHI in any error tracking

## Phase 6: Security Verification (15-20 minutes)

### PHI Protection

- [ ] Review all log files in `/logs` directory
- [ ] Search for email patterns: `grep -r "@" logs/` (should only find `[EMAIL-REDACTED]`)
- [ ] Search for phone patterns: `grep -r "\d{3}-\d{3}-\d{4}" logs/` (should find none)
- [ ] Search for SSN patterns: `grep -r "\d{3}-\d{2}-\d{4}" logs/` (should find none)
- [ ] Verify patient names don't appear in logs

### Audit Log Queries

- [ ] Query all patient access events
  ```sql
  SELECT * FROM audit_log WHERE action LIKE 'patient_data_%' LIMIT 100;
  ```
- [ ] Query rate limit violations
  ```sql
  SELECT * FROM audit_log WHERE action = 'notification_rate_limit_exceeded';
  ```
- [ ] Query by request ID
  ```sql
  SELECT * FROM audit_log WHERE metadata->>'requestId' = 'REQUEST_ID_HERE';
  ```
- [ ] Verify PHI is redacted in changes and metadata columns

### Rate Limiting

- [ ] Verify in-memory cleanup is working (wait 5 minutes, check memory)
- [ ] Test rate limit reset (wait 1 hour)
- [ ] Verify rate limit headers are accurate
- [ ] Check audit log for all violations

## Phase 7: Performance Testing (15-20 minutes)

### Load Testing

- [ ] Test audit logging with 100 concurrent requests
- [ ] Measure response time impact (should be < 5ms)
- [ ] Test rate limiting with high request volume
- [ ] Verify PHI redaction performance (< 1ms per log)

### Database Optimization

- [ ] Check audit_log table size
- [ ] Verify indexes are being used
  ```sql
  EXPLAIN SELECT * FROM audit_log WHERE tenant_id = 'XXX' AND created_at > NOW() - INTERVAL '1 day';
  ```
- [ ] Consider partitioning for large deployments
- [ ] Set up log rotation if needed

## Phase 8: Documentation (10 minutes)

### Team Documentation

- [ ] Share COMPLIANCE_QUICK_REFERENCE.md with team
- [ ] Review IMPLEMENTATION_GUIDE.md
- [ ] Document any custom audit events
- [ ] Document any custom PHI fields added

### Production Checklist

- [ ] Configure Sentry DSN in production environment
- [ ] Set up log rotation schedule
- [ ] Configure log retention policy (recommend 1 year for audit logs)
- [ ] Set up monitoring for rate limit violations
- [ ] Document escalation procedures

## Phase 9: Compliance Review (30 minutes)

### HIPAA Audit Requirements

- [ ] Verify all patient data access is logged
- [ ] Verify user actions are tracked with timestamps
- [ ] Verify IP addresses are captured
- [ ] Verify failed access attempts are logged
- [ ] Verify data exports are audited
- [ ] Verify PHI transmissions (fax, SMS) are logged

### PHI Protection

- [ ] Confirm no PHI in application logs
- [ ] Confirm no PHI in error monitoring
- [ ] Confirm sensitive fields are redacted
- [ ] Confirm IDs are hashed for correlation
- [ ] Confirm stack traces are sanitized

### Rate Limiting

- [ ] Confirm SMS rate limits are enforced
- [ ] Confirm email rate limits are enforced
- [ ] Confirm bulk operation limits are enforced
- [ ] Confirm violations are logged
- [ ] Confirm headers are provided to clients

### Error Monitoring

- [ ] Confirm Sentry is configured
- [ ] Confirm PHI redaction in Sentry
- [ ] Confirm error categorization
- [ ] Confirm no PHI in exception messages

## Phase 10: Production Deployment

### Pre-Deployment

- [ ] Review all checklist items above
- [ ] Test in staging environment
- [ ] Verify database migrations are ready
- [ ] Review environment variables
- [ ] Backup existing audit logs

### Deployment

- [ ] Deploy code to production
- [ ] Verify request ID middleware is active
- [ ] Verify rate limiting is working
- [ ] Verify audit logging is working
- [ ] Monitor error rates

### Post-Deployment

- [ ] Monitor audit log creation
- [ ] Monitor rate limit violations
- [ ] Check log files for PHI (should find none)
- [ ] Verify Sentry errors (should have no PHI)
- [ ] Set up ongoing monitoring alerts

## Ongoing Maintenance

### Daily

- [ ] Monitor rate limit violations
- [ ] Review error logs for patterns
- [ ] Check Sentry for critical errors

### Weekly

- [ ] Review audit log growth
- [ ] Check log disk space
- [ ] Review PHI redaction effectiveness

### Monthly

- [ ] Audit log compliance review
- [ ] Generate compliance reports
- [ ] Review rate limit thresholds
- [ ] Update documentation as needed

## Success Criteria

All items must be checked before considering implementation complete:

- [x] Request ID middleware installed
- [x] Rate limiting applied to all notification endpoints
- [x] Audit logging added to all HIPAA-relevant actions
- [x] PHI redaction verified in all logs
- [x] Sentry configured with PHI protection
- [x] All tests passing
- [x] Documentation reviewed by team
- [x] Production deployment successful

## Notes

Use this space to track any issues or custom implementations:

```
Date: ___________
Issues found:




Resolutions:




Custom implementations:




```

---

**Completion Date:** ___________
**Reviewed By:** ___________
**Approved By:** ___________
