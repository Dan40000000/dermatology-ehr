# Compliance and Monitoring Implementation Guide

This guide provides step-by-step instructions for integrating the compliance and monitoring features into your application.

## Quick Start

### 1. Add Request ID Middleware to Your Express App

In your main app file (e.g., `src/index.ts` or `src/app.ts`):

```typescript
import { requestIdMiddleware } from './middleware/requestId';

// Add near the top of your middleware stack
app.use(requestIdMiddleware);
```

This ensures every request has a unique ID for correlation.

### 2. Apply Rate Limiting to Notification Endpoints

#### For SMS Endpoints

```typescript
import { smsRateLimiter } from './middleware/notificationRateLimiter';

// Single SMS send
router.post('/api/sms/send', requireAuth, smsRateLimiter, smsController.send);

// Note: The middleware expects `patientId` in req.body or req.params
```

#### For Email Endpoints

```typescript
import { emailRateLimiter } from './middleware/notificationRateLimiter';

// Single email send
router.post('/api/email/send', requireAuth, emailRateLimiter, emailController.send);
```

#### For Bulk Operations

```typescript
import { bulkNotificationLimiter } from './middleware/notificationRateLimiter';

// Bulk SMS
router.post('/api/sms/send-bulk', requireAuth, bulkNotificationLimiter, smsController.sendBulk);

// Bulk email
router.post('/api/email/send-bulk', requireAuth, bulkNotificationLimiter, emailController.sendBulk);
```

### 3. Add Audit Logging to Key Operations

#### Example: Schedule Block Creation

```typescript
import { auditBlockCreate } from './services/audit';
import { getRequestId } from './middleware/requestId';

router.post('/api/schedule/blocks', requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  // Create the block
  const block = await createScheduleBlock(req.body);

  // Audit the action
  await auditBlockCreate({
    tenantId,
    userId,
    blockId: block.id,
    blockData: req.body,
    requestId,
  });

  res.json(block);
});
```

#### Example: Prior Authorization Submission

```typescript
import { auditPriorAuthSubmit } from './services/audit';
import { getRequestId } from './middleware/requestId';

router.post('/api/prior-auth/:id/submit', requireAuth, async (req: AuthedRequest, res) => {
  const { id: priorAuthId } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  // Submit the prior auth
  const result = await submitPriorAuth(priorAuthId);

  // Audit the submission
  await auditPriorAuthSubmit({
    tenantId,
    userId,
    priorAuthId,
    patientId: result.patientId,
    requestId,
    ipAddress: req.ip,
  });

  res.json(result);
});
```

#### Example: Fax Transmission

```typescript
import { auditFaxSend } from './services/audit';
import { getRequestId } from './middleware/requestId';

router.post('/api/fax/send', requireAuth, async (req: AuthedRequest, res) => {
  const { recipientNumber, patientId, documentIds } = req.body;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  // Send the fax
  const fax = await sendFax({ recipientNumber, documentIds });

  // Audit the transmission
  await auditFaxSend({
    tenantId,
    userId,
    faxId: fax.id,
    recipientNumber,
    patientId,
    requestId,
    ipAddress: req.ip,
  });

  res.json(fax);
});
```

#### Example: Patient Data Access

```typescript
import { auditPatientDataAccess } from './services/audit';
import { getRequestId } from './middleware/requestId';

// Patient view
router.get('/api/patients/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  // Audit before accessing data
  await auditPatientDataAccess({
    tenantId,
    userId,
    patientId,
    accessType: 'view',
    requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const patient = await getPatient(patientId);
  res.json(patient);
});

// Patient update
router.put('/api/patients/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  const updated = await updatePatient(patientId, req.body);

  await auditPatientDataAccess({
    tenantId,
    userId,
    patientId,
    accessType: 'update',
    requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json(updated);
});

// Patient delete
router.delete('/api/patients/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const requestId = getRequestId(req);

  await deletePatient(patientId);

  await auditPatientDataAccess({
    tenantId,
    userId,
    patientId,
    accessType: 'delete',
    requestId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true });
});
```

### 4. Error Handling with PHI Protection

The logging and Sentry integrations automatically redact PHI. No changes needed to existing error handling code:

```typescript
import { logger } from './lib/logger';
import { captureException } from './lib/sentry';

try {
  // Some operation with patient data
  const patient = await getPatient(patientId);
  logger.info('Patient retrieved', { patientId, name: patient.name });
  // Logs will show: { patientId: '[REDACTED-hash]', name: '[REDACTED]' }

} catch (error) {
  // Automatically redacted in logs
  logger.error('Failed to retrieve patient', {
    error: error.message,
    patientId,
  });

  // Automatically redacted before sending to Sentry
  captureException(error, {
    operation: 'get_patient',
    patientId,
  });

  res.status(500).json({ error: 'Failed to retrieve patient' });
}
```

## Advanced Usage

### Custom Audit Events

For actions not covered by the predefined audit functions:

```typescript
import { createAuditLog } from './services/audit';
import { getRequestId } from './middleware/requestId';

await createAuditLog({
  tenantId,
  userId,
  action: 'custom_action_name',
  resourceType: 'resource_type',
  resourceId: 'resource-id',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: {
    // Custom metadata (automatically redacted)
    customField: value,
  },
  requestId: getRequestId(req),
  severity: 'info', // 'info' | 'warning' | 'error' | 'critical'
  status: 'success', // 'success' | 'failure' | 'partial'
});
```

### Checking Rate Limit Status

To check current rate limit status for a patient:

```typescript
import { getPatientNotificationStats } from './middleware/notificationRateLimiter';

router.get('/api/patients/:patientId/notification-limits', requireAuth, async (req, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;

  const stats = await getPatientNotificationStats(tenantId, patientId);

  res.json({
    sms: {
      sent: stats.sms.count,
      remaining: stats.sms.remaining,
      limit: stats.sms.limit,
      resetAt: stats.sms.resetAt,
    },
    email: {
      sent: stats.email.count,
      remaining: stats.email.remaining,
      limit: stats.email.limit,
      resetAt: stats.email.resetAt,
    },
  });
});
```

### Manual PHI Redaction

If you need to manually redact PHI before logging or storage:

```typescript
import { redactPHI, hashValue } from './utils/phiRedaction';

const sensitiveData = {
  patientName: 'John Doe',
  ssn: '123-45-6789',
  diagnosis: 'Hypertension',
  visitDate: '2025-12-30',
};

// Redact all PHI
const redacted = redactPHI(sensitiveData);
// {
//   patientName: '[REDACTED]',
//   ssn: '[REDACTED-a1b2c3d4]',
//   diagnosis: '[REDACTED]',
//   visitDate: '[DATE-REDACTED]',
// }

// Hash a specific value for correlation
const patientIdHash = hashValue(patientId);
logger.info('Patient accessed', { patientIdHash });
```

## Integration Checklist

### Essential Integrations

- [ ] Add `requestIdMiddleware` to Express app
- [ ] Apply `smsRateLimiter` to SMS sending endpoints
- [ ] Apply `emailRateLimiter` to email sending endpoints
- [ ] Apply `bulkNotificationLimiter` to bulk send endpoints
- [ ] Add `auditBlockCreate` to schedule block creation
- [ ] Add `auditPriorAuthSubmit` to prior auth submission
- [ ] Add `auditFaxSend` to fax sending
- [ ] Add `auditPatientDataAccess` to all patient data operations

### Verification

- [ ] Check audit log entries are being created
- [ ] Verify PHI is redacted in application logs
- [ ] Test rate limiting with multiple requests
- [ ] Confirm Sentry errors don't contain PHI
- [ ] Verify request IDs appear in audit logs and responses

### Testing

```typescript
// Test PHI redaction
import { redactPHI } from './utils/phiRedaction';

const testData = {
  firstName: 'John',
  ssn: '123-45-6789',
  email: 'john@example.com',
};

const redacted = redactPHI(testData);
console.assert(redacted.firstName === '[REDACTED]', 'First name should be redacted');
console.assert(redacted.email === '[EMAIL-REDACTED]', 'Email should be redacted');
console.assert(redacted.ssn.startsWith('[REDACTED-'), 'SSN should be hashed');

// Test rate limiting
import { checkPatientNotificationLimit } from './middleware/notificationRateLimiter';

const check1 = await checkPatientNotificationLimit('tenant-1', 'patient-1', 'sms', 5);
console.assert(check1.allowed === true, 'First request should be allowed');
console.assert(check1.remaining === 5, 'Should have 5 remaining');

// Simulate 5 sends
for (let i = 0; i < 5; i++) {
  await incrementPatientNotificationCount('tenant-1', 'patient-1', 'sms');
}

const check2 = await checkPatientNotificationLimit('tenant-1', 'patient-1', 'sms', 5);
console.assert(check2.allowed === false, 'Should be rate limited');
console.assert(check2.remaining === 0, 'Should have 0 remaining');
```

## Migration Guide

### From Existing Audit System

If you have an existing audit logging system:

1. **Map existing audit calls to new functions:**
   ```typescript
   // Old
   await legacyAudit.log('block_created', blockId);

   // New
   await auditBlockCreate({
     tenantId,
     userId,
     blockId,
     blockData,
     requestId: getRequestId(req),
   });
   ```

2. **Update audit log queries:**
   - The new system uses `metadata` JSONB field for flexible data
   - Request IDs are stored in `metadata.requestId`
   - Add `severity` and `status` to your queries

3. **Review log files:**
   - PHI may be present in old logs
   - New logs will automatically redact PHI
   - Consider purging old logs according to retention policy

### Performance Considerations

1. **Rate Limiting:**
   - In-memory tracking (no database overhead)
   - Automatic cleanup every 5 minutes
   - Minimal performance impact

2. **PHI Redaction:**
   - Applied at log time (no storage overhead)
   - Regex matching may have slight CPU cost
   - Negligible impact on normal operations

3. **Audit Logging:**
   - Async database writes
   - Does not block request processing
   - Consider indexing `tenant_id`, `user_id`, `created_at`, and `action` columns

## Troubleshooting

### Rate Limiting Not Working

1. Check that patient ID is in request body or params
2. Verify middleware is applied before route handler
3. Check logs for rate limiter errors

### PHI Still Appearing in Logs

1. Verify logger import is from `./lib/logger`
2. Check if custom logging is bypassing Winston
3. Add field names to `PHI_FIELD_NAMES` in `phiRedaction.ts`

### Audit Events Not Creating

1. Check database connection
2. Verify `audit_log` table exists
3. Check for errors in application logs
4. Ensure `tenantId` and `userId` are provided

### Request IDs Not Appearing

1. Verify `requestIdMiddleware` is applied early in middleware stack
2. Check that middleware is imported correctly
3. Verify headers in response include `X-Request-ID`

## Support

For additional help:

1. See [COMPLIANCE_MONITORING.md](./COMPLIANCE_MONITORING.md) for detailed documentation
2. Review source code in:
   - `/src/services/audit.ts` - Audit logging
   - `/src/utils/phiRedaction.ts` - PHI redaction
   - `/src/middleware/notificationRateLimiter.ts` - Rate limiting
   - `/src/lib/sentry.ts` - Error monitoring
   - `/src/lib/logger.ts` - Application logging
3. Check the audit log table for event details
4. Review Winston logs in `/logs` directory
