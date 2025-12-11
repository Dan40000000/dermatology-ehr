# SMS API Examples

Complete API reference with request/response examples for all SMS endpoints.

---

## Authentication

All admin/provider endpoints require authentication via JWT token in Authorization header:

```
Authorization: Bearer <jwt_token>
x-tenant-id: <tenant_id>
```

Webhook endpoints do NOT require auth but validate Twilio signatures instead.

---

## Admin/Provider Endpoints

### Get SMS Settings

**Request:**
```http
GET /api/sms/settings
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-demo",
  "twilioPhoneNumber": "+15551234567",
  "appointmentRemindersEnabled": true,
  "reminderHoursBefore": 24,
  "allowPatientReplies": true,
  "reminderTemplate": "Hi {patientName}, this is a reminder for your appointment with {providerName} on {appointmentDate} at {appointmentTime}. Reply C to confirm, R to reschedule, or X to cancel.",
  "confirmationTemplate": "Your appointment is confirmed for {appointmentDate} at {appointmentTime} with {providerName}.",
  "cancellationTemplate": "Your appointment on {appointmentDate} at {appointmentTime} has been cancelled.",
  "rescheduleTemplate": "To reschedule, please call us at {clinicPhone} or use the patient portal.",
  "isActive": true,
  "isTestMode": false,
  "createdAt": "2024-12-01T10:00:00Z",
  "updatedAt": "2024-12-08T15:30:00Z"
}
```

---

### Update SMS Settings

**Request:**
```http
PUT /api/sms/settings
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
Content-Type: application/json

{
  "twilioAccountSid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "twilioAuthToken": "your_auth_token_here",
  "twilioPhoneNumber": "+15551234567",
  "appointmentRemindersEnabled": true,
  "reminderHoursBefore": 24,
  "isActive": true,
  "isTestMode": false
}
```

**Response:**
```json
{
  "success": true
}
```

**Validation Errors:**
```json
{
  "error": {
    "twilioPhoneNumber": {
      "_errors": ["Invalid Twilio phone number format"]
    }
  }
}
```

---

### Test Twilio Connection

**Request:**
```http
POST /api/sms/test-connection
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response (Success):**
```json
{
  "success": true,
  "accountName": "Dermatology Clinic - Main"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Unable to create record: The requested resource /2010-04-01/Accounts/AC1234.json was not found"
}
```

---

### Send SMS

**Request:**
```http
POST /api/sms/send
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
Content-Type: application/json

{
  "patientId": "550e8400-e29b-41d4-a716-446655440001",
  "messageBody": "Your lab results are ready. Please call us at (555) 123-4567 to discuss.",
  "messageType": "notification"
}
```

**Response (Success):**
```json
{
  "success": true,
  "messageId": "660e8400-e29b-41d4-a716-446655440002",
  "twilioSid": "SM1234567890abcdef1234567890abcdef",
  "status": "queued"
}
```

**Response (Patient Opted Out):**
```json
{
  "error": "Patient has opted out of SMS"
}
```

**Response (No Phone Number):**
```json
{
  "error": "Patient has no phone number"
}
```

---

### List SMS Messages

**Request:**
```http
GET /api/sms/messages?patientId=550e8400-e29b-41d4-a716-446655440001&direction=outbound&limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Query Parameters:**
- `patientId` (optional) - Filter by patient UUID
- `direction` (optional) - `outbound` or `inbound`
- `messageType` (optional) - `reminder`, `notification`, `conversation`, `auto_response`
- `status` (optional) - `queued`, `sent`, `delivered`, `failed`
- `limit` (optional) - Default 50, max 100
- `offset` (optional) - For pagination

**Response:**
```json
{
  "messages": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "twilioSid": "SM1234567890abcdef1234567890abcdef",
      "direction": "outbound",
      "fromNumber": "+15551234567",
      "toNumber": "+15559876543",
      "patientId": "550e8400-e29b-41d4-a716-446655440001",
      "patientName": "John Doe",
      "messageBody": "Hi John Doe, this is a reminder for your appointment with Dr. Smith on Monday, December 9, 2024 at 2:00 PM. Reply C to confirm.",
      "status": "delivered",
      "messageType": "reminder",
      "segmentCount": 2,
      "keywordMatched": null,
      "sentAt": "2024-12-08T10:00:00Z",
      "deliveredAt": "2024-12-08T10:00:03Z",
      "failedAt": null,
      "createdAt": "2024-12-08T10:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440003",
      "twilioSid": "SM9876543210fedcba9876543210fedcba",
      "direction": "inbound",
      "fromNumber": "+15559876543",
      "toNumber": "+15551234567",
      "patientId": "550e8400-e29b-41d4-a716-446655440001",
      "patientName": "John Doe",
      "messageBody": "C",
      "status": "received",
      "messageType": "conversation",
      "segmentCount": 1,
      "keywordMatched": "C",
      "sentAt": null,
      "deliveredAt": null,
      "failedAt": null,
      "createdAt": "2024-12-08T10:05:12Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Get Patient SMS History

**Request:**
```http
GET /api/sms/messages/patient/550e8400-e29b-41d4-a716-446655440001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response:**
```json
{
  "messages": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "direction": "outbound",
      "fromNumber": "+15551234567",
      "toNumber": "+15559876543",
      "messageBody": "Hi John, reminder for your appointment tomorrow at 2:00 PM.",
      "status": "delivered",
      "messageType": "reminder",
      "segmentCount": 1,
      "sentAt": "2024-12-08T10:00:00Z",
      "deliveredAt": "2024-12-08T10:00:03Z",
      "createdAt": "2024-12-08T10:00:00Z"
    }
  ]
}
```

---

### List Auto-Responses

**Request:**
```http
GET /api/sms/auto-responses
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response:**
```json
{
  "autoResponses": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440010",
      "keyword": "STOP",
      "responseText": "You have been unsubscribed from text messages. Text START to re-subscribe or call us if you need assistance.",
      "action": "opt_out",
      "isActive": true,
      "isSystemKeyword": true,
      "priority": 100,
      "createdAt": "2024-12-01T10:00:00Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440011",
      "keyword": "START",
      "responseText": "You are now subscribed to text messages from our practice. Reply STOP anytime to unsubscribe.",
      "action": "opt_in",
      "isActive": true,
      "isSystemKeyword": true,
      "priority": 100,
      "createdAt": "2024-12-01T10:00:00Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440012",
      "keyword": "C",
      "responseText": "Thank you! Your appointment is confirmed. We look forward to seeing you.",
      "action": "confirm_appointment",
      "isActive": true,
      "isSystemKeyword": false,
      "priority": 50,
      "createdAt": "2024-12-01T10:00:00Z"
    }
  ]
}
```

---

### Update Auto-Response

**Request:**
```http
PUT /api/sms/auto-responses/770e8400-e29b-41d4-a716-446655440012
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
Content-Type: application/json

{
  "responseText": "Thank you for confirming! Your appointment is confirmed. See you soon!",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true
}
```

**Error (System Keyword):**
```json
{
  "error": "Cannot modify response text of system keywords (STOP, START, HELP)"
}
```

---

### Get Patient SMS Preferences

**Request:**
```http
GET /api/sms/patient-preferences/550e8400-e29b-41d4-a716-446655440001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440020",
  "optedIn": true,
  "appointmentReminders": true,
  "marketingMessages": false,
  "transactionalMessages": true,
  "optedOutAt": null,
  "optedOutReason": null,
  "consentDate": "2024-11-15T09:30:00Z",
  "consentMethod": "portal"
}
```

**Response (No Preferences - Defaults):**
```json
{
  "optedIn": true,
  "appointmentReminders": true,
  "marketingMessages": false,
  "transactionalMessages": true
}
```

---

### Update Patient SMS Preferences

**Request:**
```http
PUT /api/sms/patient-preferences/550e8400-e29b-41d4-a716-446655440001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
Content-Type: application/json

{
  "optedIn": false,
  "appointmentReminders": false
}
```

**Response:**
```json
{
  "success": true
}
```

**Database Effect:**
```sql
-- Sets opted_out_at to CURRENT_TIMESTAMP
-- Sets opted_out_via to 'staff'
-- Disables appointment reminders
```

---

### Send Immediate Reminder

**Request:**
```http
POST /api/sms/send-reminder/990e8400-e29b-41d4-a716-446655440030
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-tenant-id: tenant-demo
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Patient Opted Out):**
```json
{
  "error": "Patient has opted out of SMS"
}
```

---

## Webhook Endpoints

### Incoming SMS Webhook

**Request from Twilio:**
```http
POST /api/sms/webhook/incoming
X-Twilio-Signature: ABC123def456...
Content-Type: application/x-www-form-urlencoded

MessageSid=SM1234567890abcdef1234567890abcdef
&From=%2B15559876543
&To=%2B15551234567
&Body=C
&NumMedia=0
```

**Response (TwiML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

**Internal Processing:**
1. Validate webhook signature
2. Find patient by phone number (+15559876543)
3. Extract keyword ("C")
4. Find auto-response for keyword "C"
5. Execute action (confirm_appointment)
6. Send auto-reply to patient
7. Log both messages to database

---

### Status Webhook

**Request from Twilio:**
```http
POST /api/sms/webhook/status
Content-Type: application/x-www-form-urlencoded

MessageSid=SM1234567890abcdef1234567890abcdef
&MessageStatus=delivered
&To=%2B15559876543
&From=%2B15551234567
```

**Response:**
```
OK
```

**Internal Processing:**
1. Find message by Twilio SID
2. Update status to "delivered"
3. Set delivered_at timestamp
4. Log status change

**Possible Statuses:**
- `queued` - Message accepted by Twilio
- `sent` - Message sent to carrier
- `delivered` - Message delivered to phone
- `failed` - Message failed to deliver
- `undelivered` - Message not delivered

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid phone number format: 555-1234"
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden (Webhook)

```json
{
  "error": "Invalid signature"
}
```

### 404 Not Found

```json
{
  "error": "Patient not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to send SMS"
}
```

---

## Twilio Error Codes

Common error codes from Twilio:

**21211** - Invalid "To" phone number
```json
{
  "error": "Failed to send SMS: The 'To' number 555-1234 is not a valid phone number."
}
```

**21408** - Permission to send SMS not enabled
```json
{
  "error": "Failed to send SMS: Permission to send an SMS has not been enabled for the region indicated by the 'To' number."
}
```

**21610** - Recipient opted out
```json
{
  "error": "Failed to send SMS: Attempt to send to unsubscribed recipient."
}
```

**30003** - Unreachable destination
```json
{
  "error": "Failed to send SMS: Unreachable destination handset."
}
```

**30007** - Message blocked (spam filter)
```json
{
  "error": "Failed to send SMS: Message filtered."
}
```

---

## Rate Limits

**API Endpoints:**
- Standard rate limit: 100 requests/minute
- Auth endpoints: 10 requests/minute

**Twilio Limits:**
- Free trial: 1 message/second
- Paid account: 100 messages/second (default)
- Can be increased by contacting Twilio support

---

## Webhook Testing

### Using ngrok

1. **Start ngrok:**
   ```bash
   ngrok http 4000
   ```

2. **Copy URL:**
   ```
   https://abc123.ngrok.io
   ```

3. **Configure Twilio webhook:**
   ```
   https://abc123.ngrok.io/api/sms/webhook/incoming
   ```

4. **Send test SMS to your Twilio number**

5. **View webhook in ngrok inspector:**
   ```
   http://localhost:4040
   ```

### Using Twilio Console

1. Go to **Messaging** → **Try it out** → **Send an SMS**
2. From: Your Twilio number
3. To: Your verified number
4. Body: "C"
5. Click "Make request"
6. View webhook logs in console

---

## Database Queries

### Get All SMS for Patient

```sql
SELECT
  m.direction,
  m.message_body,
  m.status,
  m.created_at
FROM sms_messages m
WHERE m.patient_id = '550e8400-e29b-41d4-a716-446655440001'
ORDER BY m.created_at DESC;
```

### Get Failed Messages

```sql
SELECT
  m.to_number,
  m.message_body,
  m.error_code,
  m.error_message,
  m.failed_at
FROM sms_messages m
WHERE m.status = 'failed'
ORDER BY m.failed_at DESC;
```

### Get Opted-Out Patients

```sql
SELECT
  p.first_name,
  p.last_name,
  p.phone,
  pref.opted_out_at,
  pref.opted_out_reason
FROM patient_sms_preferences pref
JOIN patients p ON pref.patient_id = p.id
WHERE pref.opted_in = false
ORDER BY pref.opted_out_at DESC;
```

### Calculate Monthly Costs

```sql
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as message_count,
  SUM(segment_count) as total_segments,
  SUM(segment_count) * 0.0079 as estimated_cost
FROM sms_messages
WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

---

## Postman Collection

Import this collection to test all endpoints:

```json
{
  "info": {
    "name": "SMS Messaging API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get SMS Settings",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          },
          {
            "key": "x-tenant-id",
            "value": "{{tenant_id}}"
          }
        ],
        "url": {
          "raw": "{{base_url}}/api/sms/settings",
          "host": ["{{base_url}}"],
          "path": ["api", "sms", "settings"]
        }
      }
    },
    {
      "name": "Send SMS",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          },
          {
            "key": "x-tenant-id",
            "value": "{{tenant_id}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"patientId\": \"{{patient_id}}\",\n  \"messageBody\": \"Test message\",\n  \"messageType\": \"notification\"\n}",
          "options": {
            "raw": {
              "language": "json"
            }
          }
        },
        "url": {
          "raw": "{{base_url}}/api/sms/send",
          "host": ["{{base_url}}"],
          "path": ["api", "sms", "send"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:4000"
    },
    {
      "key": "jwt_token",
      "value": ""
    },
    {
      "key": "tenant_id",
      "value": "tenant-demo"
    },
    {
      "key": "patient_id",
      "value": ""
    }
  ]
}
```

---

**Last Updated:** December 2024
