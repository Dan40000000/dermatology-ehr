# Patient-Provider Messaging System - Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PATIENT-PROVIDER MESSAGING SYSTEM                │
│                              (HIPAA Compliant)                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐         ┌──────────────────────────────┐
│       PATIENT PORTAL         │         │        STAFF EHR UI          │
│      (Patient Frontend)      │         │      (Staff Frontend)        │
└──────────────────────────────┘         └──────────────────────────────┘
│                                         │
│  Components:                            │  Components:
│  • MessagesPage.tsx                     │  • PatientMessageThreadList
│  • MessageComposer                      │  • PatientMessageThread
│  • MessageThreadView                    │  • CannedResponseSelector
│  • AttachmentUpload                     │  • MessageAttachmentUpload
│                                         │
└───────────────┬─────────────────────────┴────────────────┐
                │                                          │
                │              HTTPS/TLS                   │
                │                                          │
                ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          EXPRESS.JS SERVER                            │
│                         (Node.js Backend)                             │
│  Port: 4000                                                           │
└───────────────────────────────────────────────────────────────────────┘
│
│  Routes & Middleware:
│  ┌─────────────────────────────────────────────────────────────────┐
│  │ /api/patient-portal/messages                                    │
│  │  • requirePatientAuth middleware                                │
│  │  • GET /threads - List patient's threads                        │
│  │  • POST /threads - Create new thread                            │
│  │  • POST /threads/:id/messages - Send message                    │
│  │  • GET /unread-count - Unread count                            │
│  │  • POST /attachments - Upload file                              │
│  └─────────────────────────────────────────────────────────────────┘
│
│  ┌─────────────────────────────────────────────────────────────────┐
│  │ /api/patient-messages                                           │
│  │  • requireAuth middleware (staff)                               │
│  │  • GET /threads - List all patient messages                     │
│  │  • PUT /threads/:id - Update (assign/status/priority)           │
│  │  • POST /threads/:id/messages - Staff response                  │
│  │  • POST /threads/:id/close - Close thread                       │
│  │  • GET /unread-count - Staff unread count                       │
│  └─────────────────────────────────────────────────────────────────┘
│
│  ┌─────────────────────────────────────────────────────────────────┐
│  │ /api/canned-responses                                           │
│  │  • requireAuth middleware                                        │
│  │  • GET / - List templates                                       │
│  │  • POST / - Create template                                     │
│  │  • PUT /:id - Update template                                   │
│  └─────────────────────────────────────────────────────────────────┘
│
└───────────────┬───────────────────────┬──────────────────────────────┘
                │                       │
                ▼                       ▼
┌───────────────────────────┐  ┌──────────────────────────────────┐
│  NOTIFICATION SERVICE     │  │      FILE STORAGE                │
│                           │  │                                  │
│  messageNotificationSvc   │  │  uploads/message-attachments/    │
│                           │  │                                  │
│  • Patient notifications  │  │  • File validation               │
│  • Staff notifications    │  │  • 10MB size limit              │
│  • Digest emails          │  │  • Type whitelist               │
│  • NO PHI in emails       │  │  • Secure download              │
│                           │  │                                  │
│  Ready for:               │  │  Multer + Express               │
│  • SendGrid               │  │                                  │
│  • AWS SES                │  │                                  │
│  • SMTP                   │  │                                  │
└───────────────────────────┘  └──────────────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │  EMAIL SMTP   │
        │   (External)  │
        └───────────────┘

                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       POSTGRESQL DATABASE                            │
│                        (Multi-Tenant)                                │
└─────────────────────────────────────────────────────────────────────┘
│
│  Tables:
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ patient_message_threads                                       │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • tenant_id (multi-tenant isolation)                         │
│  │ • patient_id (FK → patients)                                 │
│  │ • subject, category, priority, status                        │
│  │ • assigned_to (FK → users)                                   │
│  │ • is_read_by_staff, is_read_by_patient                       │
│  │ • last_message_at, last_message_by                           │
│  │ • created_at, updated_at                                     │
│  │                                                               │
│  │ Indexes: tenant_id, patient_id, assigned_to, status,        │
│  │          unread flags                                         │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ patient_messages                                              │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • thread_id (FK → patient_message_threads)                   │
│  │ • sender_type ('patient' | 'staff')                          │
│  │ • sender_patient_id, sender_user_id                          │
│  │ • message_text (encrypted at rest)                           │
│  │ • is_internal_note (staff-only flag)                         │
│  │ • has_attachments, attachment_count                          │
│  │ • read_by_patient, read_by_patient_at                        │
│  │ • sent_at, created_at                                        │
│  │                                                               │
│  │ Indexes: thread_id, sender_type, sent_at                     │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ patient_message_attachments                                   │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • message_id (FK → patient_messages)                         │
│  │ • filename, original_filename                                │
│  │ • file_size, mime_type                                       │
│  │ • file_path (secure storage)                                 │
│  │ • uploaded_by_patient                                        │
│  │                                                               │
│  │ Indexes: message_id                                          │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ message_auto_replies                                          │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • tenant_id                                                   │
│  │ • category (prescription, appointment, medical, etc.)        │
│  │ • auto_reply_text                                            │
│  │ • is_active                                                   │
│  │                                                               │
│  │ Default auto-replies for common categories included          │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ message_canned_responses                                      │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • tenant_id                                                   │
│  │ • title, category                                            │
│  │ • response_text                                              │
│  │ • is_active                                                   │
│  │ • created_by (FK → users)                                    │
│  │                                                               │
│  │ Staff quick response templates                               │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ patient_portal_accounts                                       │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • patient_id (FK → patients) UNIQUE                          │
│  │ • tenant_id                                                   │
│  │ • email, password_hash                                       │
│  │ • is_active, email_verified                                  │
│  │ • email_verification_token                                   │
│  │ • password_reset_token, password_reset_expires_at           │
│  │                                                               │
│  │ Patient authentication for portal access                     │
│  └──────────────────────────────────────────────────────────────┘
│
│  ┌──────────────────────────────────────────────────────────────┐
│  │ patient_message_preferences                                   │
│  │ ────────────────────────────────────────────────────────────│
│  │ • id (UUID)                                                   │
│  │ • patient_id UNIQUE                                          │
│  │ • email_notifications_enabled                                │
│  │ • sms_notifications_enabled                                  │
│  │ • notification_email, notification_phone                     │
│  │                                                               │
│  │ Per-patient notification settings                            │
│  └──────────────────────────────────────────────────────────────┘
│
│  Existing Tables (Referenced):
│  • patients - Patient demographics
│  • users - Staff users
│  • tenants - Multi-tenant isolation
│  • audit_log - HIPAA compliance audit trail
│
└─────────────────────────────────────────────────────────────────────┘

                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AUDIT & COMPLIANCE                           │
└─────────────────────────────────────────────────────────────────────┘
│
│  Every action logged:
│  • Message sent/received
│  • Thread viewed
│  • Attachment uploaded/downloaded
│  • Status changed
│  • Assignment changed
│  • Read receipts
│
│  Logged to: audit_log table
│  • tenant_id
│  • user_id
│  • action
│  • entity_type
│  • entity_id
│  • metadata (JSON)
│  • timestamp
│  • ip_address
│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Message Flow Diagrams

### Patient Creates New Message

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│ Patient │                    │   API   │                    │ Database │
│ Portal  │                    │ Server  │                    │          │
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                              │                              │
     │ 1. POST /threads             │                              │
     │  {subject, category,         │                              │
     │   messageText}               │                              │
     ├─────────────────────────────▶│                              │
     │                              │                              │
     │                              │ 2. Verify patient auth       │
     │                              │    Check tenant ID           │
     │                              │                              │
     │                              │ 3. INSERT thread             │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 4. INSERT first message      │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 5. Check for auto-reply      │
     │                              ├─────────────────────────────▶│
     │                              │◀─────────────────────────────┤
     │                              │  auto_reply_text             │
     │                              │                              │
     │                              │ 6. INSERT auto-reply message │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 7. Log to audit_log          │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │ 8. {threadId, messageId}     │                              │
     │◀─────────────────────────────┤                              │
     │                              │                              │
     │                              │ 9. Send email to staff       │
     │                              │    (background)              │
     │                              │                              │
     │ 10. Patient sees auto-reply  │                              │
     │     immediately              │                              │
     │                              │                              │
```

### Staff Responds to Patient Message

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│  Staff  │                    │   API   │                    │ Database │
│   UI    │                    │ Server  │                    │          │
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                              │                              │
     │ 1. View thread               │                              │
     │    GET /threads/:id          │                              │
     ├─────────────────────────────▶│                              │
     │                              │                              │
     │                              │ 2. SELECT thread + messages  │
     │                              ├─────────────────────────────▶│
     │                              │◀─────────────────────────────┤
     │                              │  thread data + messages      │
     │                              │                              │
     │ 3. Thread + messages         │                              │
     │◀─────────────────────────────┤                              │
     │                              │                              │
     │ 4. Staff selects canned      │                              │
     │    response (optional)       │                              │
     │                              │                              │
     │ 5. POST /threads/:id/messages│                              │
     │    {messageText,             │                              │
     │     isInternalNote: false}   │                              │
     ├─────────────────────────────▶│                              │
     │                              │                              │
     │                              │ 6. INSERT message            │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 7. UPDATE thread             │
     │                              │    (last_message_at,         │
     │                              │     is_read_by_patient=false)│
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 8. Log to audit_log          │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │ 9. {messageId}               │                              │
     │◀─────────────────────────────┤                              │
     │                              │                              │
     │                              │ 10. Send email to patient    │
     │                              │     (background)             │
     │                              │     "You have a new message" │
     │                              │                              │
```

### Internal Staff Note (Patient Cannot See)

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│  Staff  │                    │   API   │                    │ Database │
│   UI    │                    │ Server  │                    │          │
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                              │                              │
     │ 1. Toggle "Internal Note"    │                              │
     │    checkbox ON               │                              │
     │                              │                              │
     │ 2. POST /threads/:id/messages│                              │
     │    {messageText,             │                              │
     │     isInternalNote: true} ◀──┼──────────────────────────────│
     ├─────────────────────────────▶│  Important: isInternalNote   │
     │                              │                              │
     │                              │ 3. INSERT message            │
     │                              │    is_internal_note = true   │
     │                              ├─────────────────────────────▶│
     │                              │                              │
     │                              │ 4. thread NOT updated        │
     │                              │    (internal notes don't     │
     │                              │     count as last message)   │
     │                              │                              │
     │                              │ 5. NO email to patient       │
     │                              │    (internal only)           │
     │                              │                              │
     │ 6. Note visible to staff     │                              │
     │    with yellow highlight     │                              │
     │    "Patient Cannot See"      │                              │
     │                              │                              │
     │ Patient API filters out:     │                              │
     │ WHERE is_internal_note=false │                              │
     │                              │                              │
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                       SECURITY LAYERS                            │
└─────────────────────────────────────────────────────────────────┘

Layer 1: NETWORK
├─ HTTPS/TLS encryption in transit
├─ CORS policy enforcement
└─ Rate limiting on API endpoints

Layer 2: AUTHENTICATION
├─ JWT tokens (access + refresh)
├─ Token expiration (configurable)
├─ Separate patient/staff auth
└─ X-Tenant-ID header validation

Layer 3: AUTHORIZATION
├─ requireAuth middleware (staff)
├─ requirePatientAuth middleware (patients)
├─ Role-based access control
└─ Tenant isolation checks

Layer 4: DATA ACCESS
├─ Multi-tenant WHERE clauses
├─ Patient can only see own messages
├─ Staff limited to their tenant
└─ Internal notes filtered for patients

Layer 5: DATA PROTECTION
├─ PostgreSQL encryption at rest
├─ Password hashing (bcrypt)
├─ Sensitive data redaction in logs
└─ File storage outside web root

Layer 6: FILE SECURITY
├─ File type whitelist validation
├─ File size limits (10MB)
├─ Virus scanning ready
└─ Authenticated download only

Layer 7: AUDIT & COMPLIANCE
├─ Every action logged
├─ User ID + timestamp + IP
├─ Immutable audit trail
└─ HIPAA compliance reporting

Layer 8: EMAIL SECURITY
├─ NO PHI in email notifications
├─ Generic alerts only
├─ Secure links to portal
└─ Opt-out preferences honored
```

---

## Data Flow: Categories & Priority

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESSAGE CATEGORIZATION                        │
└─────────────────────────────────────────────────────────────────┘

Patient selects category when creating message:

┌─────────────────────┬──────────────────┬────────────────────────┐
│     CATEGORY        │   AUTO-PRIORITY  │    AUTO-REPLY          │
├─────────────────────┼──────────────────┼────────────────────────┤
│ General Question    │      Low         │  No                    │
│ Prescription Refill │     Normal       │  Yes (1-2 days)       │
│ Appointment Request │     Normal       │  Yes (24 hours)       │
│ Billing Question    │      Low         │  No                    │
│ Medical Question    │      High        │  Yes (urgent warning) │
│ Other              │     Normal       │  No                    │
└─────────────────────┴──────────────────┴────────────────────────┘

                              │
                              ▼
                    ┌──────────────────┐
                    │  Message Created │
                    └──────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              ┌─────▼─────┐      ┌─────▼──────┐
              │ Auto-Reply│      │   Routing  │
              │  Sent     │      │  (Future)  │
              └───────────┘      └────────────┘
                                       │
                         ┌─────────────┼─────────────┐
                         │             │             │
                    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
                    │ Triage  │  │ Medical │  │ Billing │
                    │  Nurse  │  │  Staff  │  │  Dept   │
                    └─────────┘  └─────────┘  └─────────┘
```

---

## Status Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                      MESSAGE STATUS FLOW                         │
└─────────────────────────────────────────────────────────────────┘

        Patient Creates Message
                  │
                  ▼
        ┌──────────────────┐
        │      OPEN        │ ◀── Default status
        │  (Unassigned)    │
        └──────────────────┘
                  │
                  │ Staff assigns to self
                  │ or team member
                  ▼
        ┌──────────────────┐
        │   IN-PROGRESS    │
        │  (Staff working) │
        └──────────────────┘
                  │
                  │ Staff sends response
                  │
                  ▼
        ┌──────────────────┐
        │ WAITING-PATIENT  │
        │ (Awaiting reply) │
        └──────────────────┘
                  │
                  ├─────────────────┐
                  │                 │
        Patient   │                 │ Staff closes
        replies   │                 │ (resolved)
                  │                 │
                  ▼                 ▼
        ┌──────────────────┐  ┌──────────────────┐
        │   IN-PROGRESS    │  │     CLOSED       │
        │  (Staff review)  │  │   (Resolved)     │
        └──────────────────┘  └──────────────────┘
                  │
                  │ Staff sends final
                  │ response
                  ▼
        ┌──────────────────┐
        │     CLOSED       │
        │   (Resolved)     │
        └──────────────────┘
                  │
                  │ Patient reopens
                  │ (rare)
                  ▼
        ┌──────────────────┐
        │      OPEN        │
        │  (Re-opened)     │
        └──────────────────┘

Alternative path for complex cases:

        IN-PROGRESS
              │
              │ Needs provider review
              ▼
        ┌──────────────────┐
        │ WAITING-PROVIDER │
        │ (Provider review)│
        └──────────────────┘
              │
              │ Provider approves
              ▼
        WAITING-PATIENT
              │
              ▼
        CLOSED
```

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                       TECHNOLOGY STACK                           │
└─────────────────────────────────────────────────────────────────┘

Frontend (Staff)
├─ React 18
├─ TypeScript
├─ Tailwind CSS (ModMed purple theme)
├─ date-fns (date formatting)
└─ Fetch API (HTTP requests)

Frontend (Patient Portal)
├─ React 18
├─ TypeScript
├─ Tailwind CSS
├─ Responsive design
└─ Accessible (WCAG 2.1)

Backend
├─ Node.js 18+
├─ Express.js
├─ TypeScript
├─ JWT (jsonwebtoken)
├─ Multer (file uploads)
├─ bcrypt (password hashing)
└─ Zod (validation)

Database
├─ PostgreSQL 14+
├─ Multi-tenant architecture
├─ UUID primary keys
├─ Indexes optimized
└─ Encryption at rest

Email (Ready for Integration)
├─ SendGrid
├─ AWS SES
├─ SMTP (generic)
└─ Nodemailer

Security
├─ HTTPS/TLS
├─ JWT tokens
├─ bcrypt password hashing
├─ SQL injection prevention
├─ XSS protection
├─ CSRF protection
└─ Rate limiting

File Storage
├─ Local filesystem
├─ Multer streaming
├─ Type validation
├─ Size limits
└─ CDN ready

Monitoring & Logging
├─ PostgreSQL logs
├─ Application logs (console)
├─ Audit trail (database)
└─ Error tracking (ready)

Development Tools
├─ ESLint
├─ Prettier
├─ TypeScript compiler
└─ Git version control
```

---

## Deployment Architecture (Production)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION DEPLOYMENT                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│  CloudFlare  │  ◀── CDN, DDoS protection, SSL
│   or AWS     │
│  CloudFront  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Load Balancer│  ◀── NGINX or AWS ALB
└──────┬───────┘
       │
       ├────────────┬────────────┬────────────┐
       ▼            ▼            ▼            ▼
   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
   │ API  │    │ API  │    │ API  │    │ API  │
   │Server│    │Server│    │Server│    │Server│
   │  1   │    │  2   │    │  3   │    │  4   │
   └───┬──┘    └───┬──┘    └───┬──┘    └───┬──┘
       │           │           │           │
       └───────────┴───────────┴───────────┘
                       │
                       ▼
              ┌────────────────┐
              │   PostgreSQL   │
              │   Primary DB   │
              └────────┬───────┘
                       │
                ┌──────┴──────┐
                ▼             ▼
         ┌──────────┐  ┌──────────┐
         │ Read     │  │ Read     │
         │ Replica  │  │ Replica  │
         │    1     │  │    2     │
         └──────────┘  └──────────┘

       ┌────────────────┐
       │  File Storage  │
       │  (S3 or Azure) │  ◀── Attachments
       └────────────────┘

       ┌────────────────┐
       │ Email Service  │
       │   (SendGrid)   │  ◀── Notifications
       └────────────────┘

       ┌────────────────┐
       │  Redis Cache   │  ◀── Session data,
       │   (Optional)   │      thread lists
       └────────────────┘

       ┌────────────────┐
       │   Monitoring   │
       │  (DataDog or   │  ◀── Metrics, logs,
       │   New Relic)   │      alerts
       └────────────────┘
```

---

**Architecture Version**: 1.0
**Last Updated**: December 8, 2024
**System**: Dermatology EHR - Patient-Provider Messaging
