# Compliance & Monitoring Quick Reference

Quick reference for developers implementing HIPAA compliance features.

## Setup (One Time)

```typescript
// In your main app file (index.ts or app.ts)
import { requestIdMiddleware } from './middleware/requestId';

app.use(requestIdMiddleware); // Add near top of middleware stack
```

## Common Imports

```typescript
// Audit logging
import {
  auditBlockCreate,
  auditPriorAuthSubmit,
  auditFaxSend,
  auditPatientDataAccess,
  createAuditLog
} from './services/audit';

// Rate limiting
import {
  smsRateLimiter,
  emailRateLimiter,
  bulkNotificationLimiter
} from './middleware/notificationRateLimiter';

// Request tracking
import { getRequestId } from './middleware/requestId';

// PHI redaction (usually not needed - automatic)
import { redactPHI } from './utils/phiRedaction';
```

## Quick Snippets

### 1. Rate-Limited SMS Endpoint

```typescript
router.post('/api/sms/send',
  requireAuth,
  smsRateLimiter, // Add this middleware
  async (req, res) => {
    // Your SMS sending logic
  }
);
```

### 2. Rate-Limited Email Endpoint

```typescript
router.post('/api/email/send',
  requireAuth,
  emailRateLimiter, // Add this middleware
  async (req, res) => {
    // Your email sending logic
  }
);
```

### 3. Bulk Operation Rate Limiting

```typescript
router.post('/api/sms/send-bulk',
  requireAuth,
  bulkNotificationLimiter, // Add this middleware
  async (req, res) => {
    // Your bulk send logic
  }
);
```

### 4. Audit Patient Data Access

```typescript
router.get('/api/patients/:patientId', requireAuth, async (req, res) => {
  await auditPatientDataAccess({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    patientId: req.params.patientId,
    accessType: 'view', // 'view' | 'create' | 'update' | 'delete' | 'export'
    requestId: getRequestId(req),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const patient = await getPatient(req.params.patientId);
  res.json(patient);
});
```

### 5. Audit Schedule Block Creation

```typescript
router.post('/api/schedule/blocks', requireAuth, async (req, res) => {
  const block = await createScheduleBlock(req.body);

  await auditBlockCreate({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    blockId: block.id,
    blockData: req.body,
    requestId: getRequestId(req),
  });

  res.json(block);
});
```

### 6. Audit Prior Auth Submission

```typescript
router.post('/api/prior-auth/:id/submit', requireAuth, async (req, res) => {
  const result = await submitPriorAuth(req.params.id);

  await auditPriorAuthSubmit({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    priorAuthId: req.params.id,
    patientId: result.patientId,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });

  res.json(result);
});
```

### 7. Audit Fax Transmission

```typescript
router.post('/api/fax/send', requireAuth, async (req, res) => {
  const fax = await sendFax(req.body);

  await auditFaxSend({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    faxId: fax.id,
    recipientNumber: req.body.recipientNumber,
    patientId: req.body.patientId,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });

  res.json(fax);
});
```

### 8. Custom Audit Event

```typescript
await createAuditLog({
  tenantId: req.user.tenantId,
  userId: req.user.id,
  action: 'custom_action_name',
  resourceType: 'resource_type',
  resourceId: 'resource-id',
  ipAddress: req.ip,
  metadata: { customField: value }, // Auto-redacted
  requestId: getRequestId(req),
  severity: 'info', // 'info' | 'warning' | 'error' | 'critical'
  status: 'success', // 'success' | 'failure' | 'partial'
});
```

## Access Types for Patient Data

```typescript
accessType: 'view'    // Reading patient data
accessType: 'create'  // Creating new patient record
accessType: 'update'  // Modifying patient data
accessType: 'delete'  // Deleting patient data
accessType: 'export'  // Exporting patient data
```

## Rate Limits

- **SMS:** 100 per patient per hour
- **Email:** 100 per patient per hour
- **Bulk:** 10 per user per hour

## Rate Limit Response

```json
{
  "error": "SMS rate limit exceeded for this patient",
  "limit": 100,
  "resetAt": "2025-12-30T15:30:00.000Z",
  "message": "Maximum 100 SMS messages per hour per patient. Please try again later."
}
```

## Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2025-12-30T15:30:00.000Z
```

## Checking Rate Limit Status

```typescript
import { getPatientNotificationStats } from './middleware/notificationRateLimiter';

const stats = await getPatientNotificationStats(tenantId, patientId);
// {
//   sms: { count: 23, limit: 100, remaining: 77, resetAt: Date },
//   email: { count: 5, limit: 100, remaining: 95, resetAt: Date }
// }
```

## PHI Protection (Automatic)

PHI is **automatically** redacted from:
- All Winston logs (logger.info, logger.error, etc.)
- All Sentry error reports
- Audit log metadata

**You don't need to do anything** - just log normally:

```typescript
import { logger } from './lib/logger';

logger.info('Patient accessed', {
  patientId: 'patient-123',
  firstName: 'John', // Auto-redacted
  email: 'john@example.com', // Auto-redacted
});
// Logs: { patientId: 'patient-123', firstName: '[REDACTED]', email: '[EMAIL-REDACTED]' }
```

## Error Handling (Automatic PHI Protection)

```typescript
import { captureException } from './lib/sentry';

try {
  await processPatient(patientData);
} catch (error) {
  // PHI automatically redacted before sending to Sentry
  captureException(error, {
    operation: 'process_patient',
    patientData, // Auto-redacted
  });

  logger.error('Failed to process patient', {
    error: error.message,
    patientData, // Auto-redacted
  });
}
```

## Request Correlation

Every request has a unique ID accessible via:

```typescript
import { getRequestId } from './middleware/requestId';

const requestId = getRequestId(req);
// Use in audit logs for correlation
```

Request ID is also in response headers:
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

## Common Patterns

### Pattern 1: CRUD with Audit

```typescript
// Create
router.post('/api/resource', requireAuth, async (req, res) => {
  const resource = await createResource(req.body);
  await auditPatientDataAccess({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    patientId: req.body.patientId,
    accessType: 'create',
    resourceType: 'resource_name',
    resourceId: resource.id,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });
  res.json(resource);
});

// Read
router.get('/api/resource/:id', requireAuth, async (req, res) => {
  await auditPatientDataAccess({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    patientId: resource.patientId,
    accessType: 'view',
    resourceType: 'resource_name',
    resourceId: req.params.id,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });
  const resource = await getResource(req.params.id);
  res.json(resource);
});

// Update
router.put('/api/resource/:id', requireAuth, async (req, res) => {
  const updated = await updateResource(req.params.id, req.body);
  await auditPatientDataAccess({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    patientId: updated.patientId,
    accessType: 'update',
    resourceType: 'resource_name',
    resourceId: req.params.id,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });
  res.json(updated);
});

// Delete
router.delete('/api/resource/:id', requireAuth, async (req, res) => {
  await auditPatientDataAccess({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    patientId: resource.patientId,
    accessType: 'delete',
    resourceType: 'resource_name',
    resourceId: req.params.id,
    requestId: getRequestId(req),
    ipAddress: req.ip,
  });
  await deleteResource(req.params.id);
  res.json({ success: true });
});
```

### Pattern 2: Rate-Limited Notification with Audit

```typescript
router.post('/api/notifications/send',
  requireAuth,
  smsRateLimiter, // or emailRateLimiter
  async (req, res) => {
    const { patientId, message } = req.body;

    // Send notification
    const result = await sendNotification(patientId, message);

    // Audit the send
    await createAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'notification_send',
      resourceType: 'notification',
      resourceId: result.id,
      metadata: { patientId, type: 'sms' },
      requestId: getRequestId(req),
      severity: 'info',
    });

    res.json(result);
  }
);
```

## Troubleshooting

### Rate Limit Not Working
- Check `patientId` is in `req.body` or `req.params`
- Verify middleware is before route handler
- Check logs for errors

### PHI Still in Logs
- Verify using `import { logger } from './lib/logger'`
- Check field names match PHI_FIELD_NAMES
- Add custom fields to `/src/utils/phiRedaction.ts`

### Audit Events Not Creating
- Check database connection
- Verify audit_log table exists
- Check for async errors (use try/catch)

### Request ID Missing
- Verify `requestIdMiddleware` is applied
- Check middleware order
- Verify early in middleware stack

## Documentation

- **Full Documentation:** [COMPLIANCE_MONITORING.md](./COMPLIANCE_MONITORING.md)
- **Implementation Guide:** [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
- **Summary:** [COMPLIANCE_SUMMARY.md](./COMPLIANCE_SUMMARY.md)

## Need Help?

1. Check the documentation files above
2. Review test file: `/src/utils/__tests__/phiRedaction.test.ts`
3. Check audit_log table for event details
4. Review Winston logs in `/logs` directory
