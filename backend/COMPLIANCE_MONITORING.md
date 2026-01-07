# Compliance and Monitoring Setup

This document outlines the HIPAA compliance and monitoring features implemented in the Dermatology EHR backend.

## Table of Contents

1. [HIPAA Audit Logging](#hipaa-audit-logging)
2. [PHI Redaction](#phi-redaction)
3. [Rate Limiting](#rate-limiting)
4. [Error Monitoring](#error-monitoring)
5. [Request Tracking](#request-tracking)
6. [Usage Examples](#usage-examples)

---

## HIPAA Audit Logging

### Overview

All HIPAA-relevant actions are automatically logged to the `audit_log` table with comprehensive details including:

- User ID and tenant ID
- Action type and resource information
- IP address and user agent
- Timestamps
- Request correlation IDs
- Severity levels

### Key Audited Actions

The following critical actions are automatically audited:

#### 1. Schedule Block Creation
```typescript
import { auditBlockCreate } from '../services/audit';

await auditBlockCreate({
  tenantId,
  userId,
  blockId,
  blockData,
  requestId: req.requestId,
});
```

#### 2. Prior Authorization Submission
```typescript
import { auditPriorAuthSubmit } from '../services/audit';

await auditPriorAuthSubmit({
  tenantId,
  userId,
  priorAuthId,
  patientId,
  requestId: req.requestId,
  ipAddress: req.ip,
});
```

#### 3. Fax Transmission
```typescript
import { auditFaxSend } from '../services/audit';

await auditFaxSend({
  tenantId,
  userId,
  faxId,
  recipientNumber,
  patientId,
  requestId: req.requestId,
  ipAddress: req.ip,
});
```

#### 4. Patient Data Access
```typescript
import { auditPatientDataAccess } from '../services/audit';

await auditPatientDataAccess({
  tenantId,
  userId,
  patientId,
  accessType: 'view', // 'view' | 'create' | 'update' | 'delete' | 'export'
  resourceType: 'patient_record',
  resourceId: recordId,
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});
```

### Audit Log Schema

The audit log includes:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  changes JSONB,
  metadata JSONB,  -- Contains requestId for correlation
  severity VARCHAR(20),  -- 'info', 'warning', 'error', 'critical'
  status VARCHAR(20),    -- 'success', 'failure', 'partial'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Request Correlation

All audit events can be correlated using the `requestId` stored in the metadata field. This allows tracking of related operations across the system.

---

## PHI Redaction

### Overview

Protected Health Information (PHI) is automatically redacted from:
- Application logs (Winston)
- Error monitoring (Sentry)
- Audit log metadata

### Redacted Fields

The following field types are automatically redacted:

**Patient Identifiers:**
- SSN/Social Security Number
- MRN/Medical Record Number
- Date of Birth

**Personal Information:**
- First/Last Name
- Full Name
- Email addresses
- Phone numbers
- Addresses (street, city, zip code)

**Medical Information:**
- Diagnosis codes
- Medications
- Allergies
- Clinical notes
- Treatment plans

**Sensitive Patterns:**
- Email addresses (regex match)
- Phone numbers (regex match)
- SSN patterns (XXX-XX-XXXX)
- Date patterns (potential DOB)

### Implementation

PHI redaction is implemented in `/src/utils/phiRedaction.ts` and automatically applied to:

1. **Winston Logger** - All log messages and metadata
2. **Sentry Error Tracking** - All error messages, contexts, and breadcrumbs
3. **Audit Logs** - Changes and metadata fields

### Example Usage

```typescript
import { redactPHI } from '../utils/phiRedaction';

// Redact an object before logging
const patientData = {
  firstName: 'John',
  lastName: 'Doe',
  ssn: '123-45-6789',
  email: 'john@example.com',
  diagnosis: 'Hypertension',
};

const redacted = redactPHI(patientData);
// {
//   firstName: '[REDACTED]',
//   lastName: '[REDACTED]',
//   ssn: '[REDACTED-a1b2c3d4e5f6g7h8]',  // Hashed for correlation
//   email: '[EMAIL-REDACTED]',
//   diagnosis: '[REDACTED]',
// }
```

### Correlation Hashing

For ID fields (SSN, MRN, patient IDs), values are hashed to allow correlation across logs while preventing exposure:

```typescript
// Same value always produces same hash
redactPHI({ ssn: '123-45-6789' }); // { ssn: '[REDACTED-a1b2c3d4]' }
redactPHI({ ssn: '123-45-6789' }); // { ssn: '[REDACTED-a1b2c3d4]' }
```

---

## Rate Limiting

### Overview

Rate limiting is implemented at multiple levels to prevent abuse and ensure system stability.

### Notification Rate Limits

#### SMS Rate Limiting
- **Limit:** 100 SMS per patient per hour
- **Scope:** Per patient, per tenant
- **Tracking:** In-memory with automatic cleanup
- **Logging:** Rate limit violations are logged to audit log

```typescript
import { smsRateLimiter } from '../middleware/notificationRateLimiter';

router.post('/api/sms/send', requireAuth, smsRateLimiter, async (req, res) => {
  // Send SMS
});
```

#### Email Rate Limiting
- **Limit:** 100 emails per patient per hour
- **Scope:** Per patient, per tenant
- **Tracking:** In-memory with automatic cleanup
- **Logging:** Rate limit violations are logged to audit log

```typescript
import { emailRateLimiter } from '../middleware/notificationRateLimiter';

router.post('/api/email/send', requireAuth, emailRateLimiter, async (req, res) => {
  // Send email
});
```

#### Bulk Notification Rate Limiting
- **Limit:** 10 bulk operations per hour per user
- **Applied to:** Bulk SMS and bulk email endpoints

```typescript
import { bulkNotificationLimiter } from '../middleware/notificationRateLimiter';

router.post('/api/sms/send-bulk', requireAuth, bulkNotificationLimiter, async (req, res) => {
  // Send bulk SMS
});
```

### Rate Limit Response

When rate limit is exceeded, the API returns:

```json
{
  "error": "SMS rate limit exceeded for this patient",
  "limit": 100,
  "resetAt": "2025-12-30T15:30:00.000Z",
  "message": "Maximum 100 SMS messages per hour per patient. Please try again later."
}
```

### Rate Limit Headers

All rate-limited responses include headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2025-12-30T15:30:00.000Z
```

### Checking Rate Limit Status

```typescript
import { getPatientNotificationStats } from '../middleware/notificationRateLimiter';

const stats = await getPatientNotificationStats(tenantId, patientId);
// {
//   sms: { count: 23, limit: 100, remaining: 77, resetAt: Date },
//   email: { count: 5, limit: 100, remaining: 95, resetAt: Date }
// }
```

### Rate Limit Event Logging

All rate limit violations are automatically logged to the audit log:

```json
{
  "action": "notification_rate_limit_exceeded",
  "resourceType": "sms",
  "resourceId": "patient-id",
  "severity": "warning",
  "status": "failure",
  "metadata": {
    "patientId": "patient-id",
    "notificationType": "sms",
    "reason": "rate_limit_exceeded"
  }
}
```

---

## Error Monitoring

### Sentry Integration

Sentry is configured with comprehensive PHI redaction to ensure no protected health information is sent to third-party monitoring services.

### PHI Protection in Sentry

1. **Request Data Redaction**
   - Headers (Authorization, Cookie, X-API-Key)
   - Query parameters
   - Request body

2. **Exception Data Redaction**
   - Error messages
   - Stack trace variables
   - Exception values

3. **Breadcrumb Redaction**
   - All breadcrumb messages
   - Breadcrumb data objects

4. **Context Redaction**
   - All Sentry contexts
   - Extra data fields

### Configuration

```typescript
// Sentry is automatically configured in src/lib/sentry.ts
import { initSentry } from './lib/sentry';

initSentry(); // Call in your app initialization
```

### Usage

```typescript
import { captureException, addBreadcrumb } from '../lib/sentry';

try {
  // Some operation
} catch (error) {
  // PHI is automatically redacted before sending to Sentry
  captureException(error, {
    userId: user.id,
    operation: 'patient_update',
  });
}

// Add debugging breadcrumb (automatically redacted)
addBreadcrumb('Patient record accessed', 'data_access', {
  patientId: patient.id,
});
```

---

## Request Tracking

### Request ID Middleware

Every request is assigned a unique request ID for correlation across logs, audit events, and error reports.

### Setup

```typescript
import { requestIdMiddleware } from './middleware/requestId';

app.use(requestIdMiddleware);
```

### Usage

```typescript
import { getRequestId } from '../middleware/requestId';

router.post('/api/patient', async (req, res) => {
  const requestId = getRequestId(req);

  await auditPatientDataAccess({
    tenantId,
    userId,
    patientId,
    accessType: 'create',
    requestId, // Correlate this audit event with the request
  });
});
```

### Request ID in Responses

The request ID is automatically added to all API responses:

```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

---

## Usage Examples

### Example 1: Sending SMS with Rate Limiting and Audit Logging

```typescript
import { smsRateLimiter } from '../middleware/notificationRateLimiter';
import { createAuditLog } from '../services/audit';
import { getRequestId } from '../middleware/requestId';

router.post('/api/sms/send',
  requireAuth,
  smsRateLimiter, // Check rate limit
  async (req: AuthedRequest, res) => {
    const { patientId, message } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const requestId = getRequestId(req);

    try {
      // Send SMS
      const result = await sendSMS(patientId, message);

      // Audit the action
      await createAuditLog({
        tenantId,
        userId,
        action: 'sms_send',
        resourceType: 'sms',
        resourceId: result.messageId,
        ipAddress: req.ip,
        metadata: {
          patientId,
          messageLength: message.length,
        },
        requestId,
        severity: 'info',
        status: 'success',
      });

      res.json({ success: true, messageId: result.messageId });
    } catch (error) {
      // Error automatically redacted in logs
      logger.error('Failed to send SMS', {
        error: error.message,
        patientId, // Automatically redacted
      });

      res.status(500).json({ error: 'Failed to send SMS' });
    }
  }
);
```

### Example 2: Patient Data Access with Full Audit Trail

```typescript
import { auditPatientDataAccess } from '../services/audit';
import { getRequestId } from '../middleware/requestId';

router.get('/api/patients/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const requestId = getRequestId(req);

    // Audit the access before retrieving data
    await auditPatientDataAccess({
      tenantId,
      userId,
      patientId,
      accessType: 'view',
      requestId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Retrieve patient data
    const patient = await getPatient(patientId);

    res.json(patient);
  }
);
```

### Example 3: Error Handling with PHI Protection

```typescript
import { captureException } from '../lib/sentry';
import { logger } from '../lib/logger';

router.post('/api/prior-auth/submit',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, medicationName } = req.body;

      // This will be automatically redacted in logs
      logger.info('Submitting prior auth', {
        patientId,
        medicationName,
      });

      const result = await submitPriorAuth(req.body);

      res.json(result);
    } catch (error) {
      // Error and context automatically redacted before sending to Sentry
      captureException(error, {
        operation: 'prior_auth_submit',
        userId: req.user!.id,
      });

      // Logged with PHI redaction
      logger.error('Prior auth submission failed', {
        error: error.message,
        patientId: req.body.patientId,
      });

      res.status(500).json({ error: 'Failed to submit prior authorization' });
    }
  }
);
```

---

## Compliance Checklist

### HIPAA Audit Requirements

- [x] All patient data access is logged
- [x] User actions are tracked with timestamps
- [x] IP addresses are captured for security events
- [x] Failed access attempts are logged
- [x] Data exports are audited
- [x] PHI transmissions (fax, SMS) are logged
- [x] Request correlation for related actions

### PHI Protection

- [x] No PHI in application logs
- [x] No PHI in error monitoring (Sentry)
- [x] Sensitive fields are redacted
- [x] IDs are hashed for correlation
- [x] Stack traces are sanitized

### Rate Limiting

- [x] SMS notifications rate limited (100/hour per patient)
- [x] Email notifications rate limited (100/hour per patient)
- [x] Bulk operations rate limited (10/hour per user)
- [x] Rate limit violations are logged
- [x] Rate limit headers provided to clients

### Error Monitoring

- [x] Sentry configured with PHI redaction
- [x] Request data is sanitized
- [x] Error categorization implemented
- [x] No PHI in exception messages
- [x] Breadcrumbs are redacted

---

## Maintenance and Monitoring

### Log Rotation

Application logs are automatically rotated:
- **Max file size:** 5MB
- **Max files:** 5 (combined and error logs)
- **Max files:** 10 (audit logs)

### Cleanup

Rate limit tracking data is automatically cleaned up:
- **Cleanup interval:** Every 5 minutes
- **Retention:** 1 hour (matching rate limit window)

### Monitoring Dashboards

Query the audit log for compliance reporting:

```sql
-- Failed login attempts in last 24 hours
SELECT user_id, ip_address, created_at
FROM audit_log
WHERE action = 'login_failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Patient data access by user
SELECT user_id, COUNT(*) as access_count
FROM audit_log
WHERE action LIKE 'patient_data_%'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
ORDER BY access_count DESC;

-- Rate limit violations
SELECT resource_id, COUNT(*) as violation_count
FROM audit_log
WHERE action = 'notification_rate_limit_exceeded'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY resource_id
ORDER BY violation_count DESC;
```

---

## Support and Questions

For questions or issues related to compliance and monitoring:

1. Review this documentation
2. Check the audit log for detailed event information
3. Monitor Sentry for error patterns
4. Review Winston logs for application behavior

All PHI is protected by default - no configuration required.
