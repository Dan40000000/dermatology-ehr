# HL7 v2.x Integration Guide

## Overview

This document provides a comprehensive guide to the HL7 v2.x message handling system implemented in the Dermatology EHR. The system enables seamless integration with external healthcare systems (labs, hospitals, scheduling systems) through standardized HL7 messaging.

## Table of Contents

1. [Architecture](#architecture)
2. [Supported Message Types](#supported-message-types)
3. [Message Processing Flow](#message-processing-flow)
4. [API Endpoints](#api-endpoints)
5. [Message Format Examples](#message-format-examples)
6. [Error Handling](#error-handling)
7. [Security & Compliance](#security--compliance)
8. [Integration Instructions](#integration-instructions)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Architecture

### Components

The HL7 integration system consists of four main components:

1. **HL7 Parser Service** (`/src/services/hl7Parser.ts`)
   - Parses HL7 pipe-delimited messages into structured data
   - Validates message structure and required segments
   - Generates ACK/NACK responses
   - Handles HL7 encoding characters (`|^~\&`)

2. **HL7 Processor Service** (`/src/services/hl7Processor.ts`)
   - Processes parsed messages based on message type
   - Updates database records (patients, appointments, observations)
   - Executes business logic for each message type
   - Maintains data integrity with transactions

3. **HL7 Queue Service** (`/src/services/hl7Queue.ts`)
   - Background processing queue with FIFO ordering
   - Automatic retry with exponential backoff
   - Message status tracking (pending, processing, processed, failed)
   - Queue statistics and monitoring

4. **HL7 REST API** (`/src/routes/hl7.ts`)
   - RESTful endpoints for receiving and managing messages
   - Authentication and tenant isolation
   - Audit logging for all HL7 operations
   - Both synchronous and asynchronous processing modes

### Database Schema

```sql
-- HL7 message queue
CREATE TABLE hl7_messages (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  message_control_id VARCHAR(100),
  sending_application VARCHAR(255),
  sending_facility VARCHAR(255),
  raw_message TEXT NOT NULL,
  parsed_data JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient observations (lab results)
CREATE TABLE patient_observations (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  patient_id UUID NOT NULL,
  document_id UUID,
  observation_code VARCHAR(100) NOT NULL,
  observation_name VARCHAR(255),
  observation_value TEXT,
  value_type VARCHAR(50),
  units VARCHAR(100),
  reference_range VARCHAR(255),
  abnormal_flag VARCHAR(50),
  observation_date TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'final'
);
```

---

## Supported Message Types

### ADT^A04 - Register Patient
**Purpose:** Register a new patient or update demographics if patient exists

**Required Segments:**
- MSH (Message Header)
- PID (Patient Identification)

**Optional Segments:**
- PV1 (Patient Visit)

**Processing:**
- Creates new patient record if MRN/external_id doesn't exist
- Updates existing patient if found
- Maps HL7 fields to patient table

**Example:**
```
MSH|^~\&|LAB|HOSPITAL|EHR|CLINIC|20250108120000||ADT^A04|12345|P|2.5
PID|1||PAT001^^^MRN||DOE^JOHN^M||19800101|M|||123 MAIN ST^^CITY^ST^12345||555-1234
```

---

### ADT^A08 - Update Patient Information
**Purpose:** Update existing patient demographics

**Required Segments:**
- MSH, PID

**Processing:**
- Finds patient by external_id or MRN
- Updates patient demographics
- Returns error if patient not found

**Example:**
```
MSH|^~\&|LAB|HOSPITAL|EHR|CLINIC|20250108120000||ADT^A08|12346|P|2.5
PID|1||PAT001^^^MRN||DOE^JOHN^M||19800101|M|||456 ELM ST^^CITY^ST^12345||555-9999
```

---

### SIU^S12 - New Appointment Notification
**Purpose:** Create a new appointment in the EHR

**Required Segments:**
- MSH (Message Header)
- SCH (Schedule Activity Information)
- PID (Patient Identification)

**Optional Segments:**
- AIL (Appointment Information - Location)
- AIP (Appointment Information - Personnel/Provider)

**Processing:**
- Ensures patient exists (creates if needed)
- Matches provider and location by external_id if provided
- Creates appointment with scheduled status
- Links to patient, provider, and location

**Example:**
```
MSH|^~\&|SCHEDULE|HOSPITAL|EHR|CLINIC|20250108120000||SIU^S12|12347|P|2.5
SCH|APT123|APT123||||ROUTINE|Follow-up|DERM|30|MIN
PID|1||PAT001^^^MRN||DOE^JOHN^M||19800101|M
AIL|1|ADD|ROOM101|||20250115100000
AIP|1|ADD|DR001^SMITH^JAMES|ATTENDING||20250115100000
```

---

### SIU^S13 - Reschedule Appointment
**Purpose:** Update appointment date/time

**Required Segments:**
- MSH, SCH
- Must include appointment ID in SCH-1 or SCH-2

**Processing:**
- Finds appointment by external_id
- Updates appointment date/time and duration
- Preserves other appointment details

**Example:**
```
MSH|^~\&|SCHEDULE|HOSPITAL|EHR|CLINIC|20250108120000||SIU^S13|12348|P|2.5
SCH|APT123|APT123||||ROUTINE|Rescheduled|DERM|30|MIN
AIL|1|ADD|ROOM102|||20250116140000
```

---

### SIU^S15 - Cancel Appointment
**Purpose:** Cancel an existing appointment

**Required Segments:**
- MSH, SCH
- SCH-6 should contain cancellation reason

**Processing:**
- Finds appointment by external_id
- Sets status to 'cancelled'
- Records cancellation reason

**Example:**
```
MSH|^~\&|SCHEDULE|HOSPITAL|EHR|CLINIC|20250108120000||SIU^S15|12349|P|2.5
SCH|APT123|APT123||||ROUTINE|Patient cancelled|DERM|30|MIN
```

---

### ORU^R01 - Observation Result (Lab Results)
**Purpose:** Deliver lab/observation results

**Required Segments:**
- MSH (Message Header)
- PID (Patient Identification)
- OBX (Observation/Result) - at least one

**Optional Segments:**
- OBR (Observation Request)

**Processing:**
- Ensures patient exists
- Creates document record for lab results
- Stores individual observations in patient_observations table
- Supports LOINC codes for observation identifiers

**Example:**
```
MSH|^~\&|LAB|HOSPITAL|EHR|CLINIC|20250108120000||ORU^R01|12350|P|2.5
PID|1||PAT001^^^MRN||DOE^JOHN^M||19800101|M
OBR|1|LAB123|LAB123|1558-6^GLUCOSE^LN|||20250108080000
OBX|1|NM|1558-6^Glucose^LN||95|mg/dL|70-100|N|||F|||20250108100000
OBX|2|NM|2093-3^Cholesterol^LN||185|mg/dL|<200|N|||F|||20250108100000
```

---

## Message Processing Flow

### Asynchronous Processing (Default)

1. **Receive:** Client POSTs HL7 message to `/api/hl7/inbound`
2. **Parse:** Message is parsed and validated
3. **Enqueue:** Message is stored in `hl7_messages` table with status='pending'
4. **ACK:** Immediate ACK response returned to sender
5. **Background:** Queue processor picks up pending messages (FIFO)
6. **Process:** Message is processed, database updated
7. **Status:** Message status updated to 'processed' or 'failed'
8. **Retry:** Failed messages auto-retry with exponential backoff (1min, 2min, 4min)

### Synchronous Processing

1. **Receive:** Client POSTs to `/api/hl7/inbound/sync`
2. **Parse:** Message is parsed and validated
3. **Process:** Message is immediately processed
4. **Response:** ACK/NACK with processing result returned

### Queue Processor

The background queue processor runs every 30 seconds and:
- Fetches pending messages in FIFO order
- Processes up to 10 messages per batch
- Uses `FOR UPDATE SKIP LOCKED` to prevent race conditions
- Implements exponential backoff for retries (max 3 attempts)

---

## API Endpoints

### POST /api/hl7/inbound
**Description:** Receive HL7 message for asynchronous processing

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "message": "MSH|^~\\&|LAB|HOSPITAL|EHR|CLINIC|20250108120000||ADT^A04|12345|P|2.5\rPID|..."
}
```
Or raw text:
```
MSH|^~\&|LAB|HOSPITAL...
PID|1||...
```

**Response (200 OK):**
```json
{
  "success": true,
  "messageId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "messageType": "ADT^A04",
  "messageControlId": "12345",
  "status": "queued",
  "ack": "MSH|^~\\&|EHR|CLINIC|LAB|HOSPITAL|20250108120005||ACK^ADT|98765|P|2.5\rMSA|AA|12345"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid HL7 message format",
  "details": "MSH segment is required",
  "ack": "MSH|^~\\&|EHR|CLINIC|...\rMSA|AR|12345|Invalid format"
}
```

---

### POST /api/hl7/inbound/sync
**Description:** Receive and immediately process HL7 message

**Authentication:** Required

**Request:** Same as `/inbound`

**Response (200 OK):**
```json
{
  "success": true,
  "messageType": "ADT^A04",
  "messageControlId": "12345",
  "resourceId": "patient-uuid",
  "ack": "MSH|^~\\&|...\rMSA|AA|12345"
}
```

**Response (500 Error):**
```json
{
  "success": false,
  "error": "Patient identifier is required",
  "ack": "MSH|^~\\&|...\rMSA|AE|12345"
}
```

---

### GET /api/hl7/messages
**Description:** List HL7 messages with filtering

**Authentication:** Required

**Query Parameters:**
- `status` - Filter by status (pending, processing, processed, failed)
- `messageType` - Filter by message type (e.g., ADT^A04)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "tenantId": "tenant-001",
      "messageType": "ADT^A04",
      "messageControlId": "12345",
      "sendingApplication": "LAB",
      "sendingFacility": "HOSPITAL",
      "status": "processed",
      "processedAt": "2025-01-08T12:00:05Z",
      "createdAt": "2025-01-08T12:00:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

---

### GET /api/hl7/messages/:id
**Description:** Get details of specific message

**Authentication:** Required

**Response:**
```json
{
  "id": "msg-uuid",
  "tenantId": "tenant-001",
  "messageType": "ADT^A04",
  "messageControlId": "12345",
  "rawMessage": "MSH|^~\\&|...",
  "parsedData": { /* parsed HL7 structure */ },
  "status": "processed",
  "processedAt": "2025-01-08T12:00:05Z"
}
```

---

### POST /api/hl7/messages/:id/reprocess
**Description:** Retry processing a failed message

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Message queued for reprocessing"
}
```

---

### GET /api/hl7/statistics
**Description:** Get queue statistics for tenant

**Authentication:** Required

**Response:**
```json
{
  "pending": 5,
  "processing": 2,
  "processed": 1523,
  "failed": 8,
  "total": 1538
}
```

---

## Message Format Examples

### Segment Breakdown

#### MSH - Message Header
```
MSH|^~\&|LAB|HOSPITAL|EHR|CLINIC|20250108120000||ADT^A04|12345|P|2.5
```
- Field 1: `|` (field separator)
- Field 2: `^~\&` (encoding characters)
- Field 3: `LAB` (sending application)
- Field 4: `HOSPITAL` (sending facility)
- Field 5: `EHR` (receiving application)
- Field 6: `CLINIC` (receiving facility)
- Field 7: `20250108120000` (timestamp YYYYMMDDHHmmss)
- Field 9: `ADT^A04` (message type^trigger event)
- Field 10: `12345` (message control ID)
- Field 11: `P` (processing ID - P=production, T=test)
- Field 12: `2.5` (HL7 version)

#### PID - Patient Identification
```
PID|1||PAT001^^^MRN||DOE^JOHN^M||19800101|M|||123 MAIN ST^^CITY^ST^12345||555-1234
```
- Field 1: `1` (set ID)
- Field 3: `PAT001^^^MRN` (patient identifier)
- Field 5: `DOE^JOHN^M` (last^first^middle)
- Field 7: `19800101` (date of birth YYYYMMDD)
- Field 8: `M` (sex - M/F)
- Field 11: `123 MAIN ST^^CITY^ST^12345` (address)
- Field 13: `555-1234` (phone number)

#### OBX - Observation Result
```
OBX|1|NM|1558-6^Glucose^LN||95|mg/dL|70-100|N|||F|||20250108100000
```
- Field 1: `1` (set ID)
- Field 2: `NM` (value type - NM=numeric, ST=string, TX=text)
- Field 3: `1558-6^Glucose^LN` (observation ID - LOINC code)
- Field 5: `95` (observation value)
- Field 6: `mg/dL` (units)
- Field 7: `70-100` (reference range)
- Field 8: `N` (abnormal flags - N=normal, H=high, L=low)
- Field 11: `F` (observation status - F=final)
- Field 14: `20250108100000` (observation date/time)

---

## Error Handling

### Message Validation Errors

**Issue:** Missing required segments
**HL7 Response:** ACK with MSA|AR (Application Reject)
**API Response:** 400 Bad Request
```json
{
  "error": "HL7 message validation failed",
  "validationErrors": ["PID segment is required for ADT messages"],
  "ack": "MSH|...\rMSA|AR|12345"
}
```

### Processing Errors

**Issue:** Database constraint violation, patient not found, etc.
**HL7 Response:** ACK with MSA|AE (Application Error)
**Database:** Message status set to 'failed', error message recorded
**Retry:** Automatic retry with exponential backoff (max 3 attempts)

### Retry Logic

1. **Attempt 1:** Immediate processing
2. **Attempt 2:** Retry after 1 minute
3. **Attempt 3:** Retry after 2 minutes (cumulative: 3 min)
4. **Attempt 4:** Retry after 4 minutes (cumulative: 7 min)
5. **Failed:** Marked as permanently failed after 3 retries

### Manual Reprocessing

Failed messages can be manually retried:
```bash
POST /api/hl7/messages/{message-id}/reprocess
```

---

## Security & Compliance

### HIPAA Compliance

1. **Audit Logging:** All HL7 operations logged to audit_log table
   - Message receipt
   - Processing success/failure
   - Manual reprocessing
   - Includes user ID, timestamp, IP address

2. **Data Encryption:**
   - HL7 messages stored in database (encrypted at rest)
   - TLS required for all API communication

3. **Access Control:**
   - Authentication required for all endpoints
   - Tenant isolation enforced
   - User can only access their tenant's messages

4. **Message Retention:**
   - All messages retained for audit trail (including duplicates)
   - Raw message content preserved in database

### Authentication

All HL7 endpoints require JWT authentication:
```bash
curl -X POST https://api.example.com/api/hl7/inbound \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "MSH|..."}'
```

---

## Integration Instructions

### For External Systems Sending to This EHR

#### Step 1: Obtain API Credentials
Contact your EHR administrator to obtain:
- API endpoint URL
- JWT authentication token
- Tenant ID

#### Step 2: Configure Your System
Point your HL7 interface to:
```
POST https://your-ehr-domain.com/api/hl7/inbound
```

#### Step 3: Format Messages
Ensure messages conform to HL7 v2.5 standard:
- Use pipe delimiter (`|`)
- Include required MSH segment
- Use `\r` (carriage return) as segment separator
- Include message control ID for tracking

#### Step 4: Send Test Message
```bash
curl -X POST https://your-ehr-domain.com/api/hl7/inbound \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MSH|^~\\&|YOUR_APP|YOUR_FACILITY|DERM_EHR|DERM_CLINIC|20250108120000||ADT^A04|TEST001|P|2.5\rPID|1||TEST001^^^MRN||TEST^PATIENT||19900101|M"
  }'
```

#### Step 5: Monitor Response
Check for ACK response:
- `MSA|AA` = Success
- `MSA|AE` = Processing error (check error details)
- `MSA|AR` = Message rejected (validation error)

#### Step 6: Production Rollout
- Start with ADT messages (patient demographics)
- Add SIU messages (scheduling)
- Add ORU messages (lab results)
- Monitor queue statistics endpoint

### Recommended Message Flow

1. **Patient Registration:** Send ADT^A04 when patient first registers
2. **Demographics Update:** Send ADT^A08 when patient info changes
3. **Appointment Scheduling:** Send SIU^S12 when appointment created
4. **Appointment Changes:** Send SIU^S13 for reschedules, SIU^S15 for cancellations
5. **Lab Results:** Send ORU^R01 when results are available

---

## Testing

### Sample Messages

Sample HL7 messages are available in:
```
/backend/src/services/__tests__/hl7.samples.ts
```

### Test in Postman

1. Import endpoint: `POST {{baseUrl}}/api/hl7/inbound`
2. Set Authorization header with JWT token
3. Use raw body type with sample message
4. Send and verify ACK response

### Integration Testing

```typescript
import { ADT_A04_REGISTER_PATIENT } from './hl7.samples';

// Test patient registration
const response = await fetch('http://localhost:4000/api/hl7/inbound', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: ADT_A04_REGISTER_PATIENT })
});

const result = await response.json();
console.log('ACK:', result.ack);
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid HL7 message format"
**Cause:** Malformed HL7 message, missing MSH segment
**Solution:**
- Verify MSH segment is first line
- Check field delimiters are correct (`|`)
- Ensure encoding characters are `^~\&`

#### 2. "PID segment is required"
**Cause:** Message missing required segment for message type
**Solution:** Add required segment based on message type

#### 3. "Patient not found"
**Cause:** SIU message references non-existent patient
**Solution:** Send ADT^A04 to register patient first

#### 4. "Message stuck in pending status"
**Cause:** Queue processor not running or crashed
**Solution:**
- Check server logs for errors
- Verify queue processor is running
- Restart application if needed

#### 5. "Appointment not found for reschedule"
**Cause:** external_id in SCH segment doesn't match existing appointment
**Solution:** Verify appointment was created with matching external_id

### Monitoring

Check queue statistics regularly:
```bash
GET /api/hl7/statistics
```

Monitor for:
- High number of failed messages
- Pending messages not processing
- Processing time anomalies

### Debug Mode

Enable detailed logging by setting environment variable:
```bash
HL7_DEBUG=true
```

---

## Support

For integration support, contact:
- Technical Support: support@your-ehr.com
- Documentation: https://docs.your-ehr.com/hl7
- HL7 v2.5 Specification: http://www.hl7.org/

---

## Appendix

### HL7 Data Types

- **NM** - Numeric
- **ST** - String (up to 200 chars)
- **TX** - Text (longer than ST)
- **DT** - Date (YYYYMMDD)
- **TM** - Time (HHmmss)
- **TS** - Timestamp (YYYYMMDDHHmmss)

### Common Abnormal Flags

- **N** - Normal
- **H** - High
- **L** - Low
- **HH** - Critical High
- **LL** - Critical Low
- **A** - Abnormal

### Message Processing Codes

- **AA** - Application Accept
- **AE** - Application Error
- **AR** - Application Reject

---

**Document Version:** 1.0
**Last Updated:** January 8, 2025
**HL7 Version:** 2.5
