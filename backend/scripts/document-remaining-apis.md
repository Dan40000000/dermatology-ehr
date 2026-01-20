# Script to Document Remaining API Endpoints

## Automated Documentation Template

This guide helps systematically add Swagger documentation to remaining route files.

## Standard Template for GET Endpoints

```typescript
/**
 * @swagger
 * /api/resource:
 *   get:
 *     summary: List/Get [resource name]
 *     description: [Detailed description of what this endpoint returns]
 *     tags:
 *       - [Resource Tag]
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: [paramName]
 *         schema:
 *           type: [string|integer|boolean]
 *         description: [Parameter description]
 *     responses:
 *       200:
 *         description: [Success description]
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 [dataKey]:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: [Failure description]
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
```

## Standard Template for POST Endpoints

```typescript
/**
 * @swagger
 * /api/resource:
 *   post:
 *     summary: Create [resource name]
 *     description: [What this creates and any special behavior]
 *     tags:
 *       - [Resource Tag]
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - [requiredField]
 *             properties:
 *               [field]:
 *                 type: [string|integer|boolean|object]
 *     responses:
 *       201:
 *         description: [Resource] created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to create [resource]
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
```

## Quick Reference - Route File Endpoints

### batches.ts
- GET /api/batches - List billing batches
- GET /api/batches/:id - Get batch details
- POST /api/batches - Create batch
- PUT /api/batches/:id - Update batch
- POST /api/batches/:id/close - Close batch
- POST /api/batches/:id/submit - Submit batch

### bills.ts
- GET /api/bills - List bills
- GET /api/bills/:id - Get bill
- POST /api/bills - Create bill
- PUT /api/bills/:id - Update bill
- DELETE /api/bills/:id - Delete bill

### bodyDiagram.ts
- GET /api/body-diagram/:patientId - Get annotations
- POST /api/body-diagram - Create annotation
- PUT /api/body-diagram/:id - Update annotation
- DELETE /api/body-diagram/:id - Delete annotation

### claims.ts
- GET /api/claims - List claims
- GET /api/claims/:id - Get claim
- POST /api/claims - Submit claim
- POST /api/claims/:id/resubmit - Resubmit claim
- GET /api/claims/:id/status - Check claim status

### clearinghouse.ts
- POST /api/clearinghouse/submit - Submit to clearinghouse
- GET /api/clearinghouse/status/:transactionId - Check status
- POST /api/clearinghouse/eligibility - Check eligibility
- GET /api/clearinghouse/reports - Get reports

### consentForms.ts
- GET /api/consent-forms - List forms
- GET /api/consent-forms/:id - Get form
- POST /api/consent-forms - Create form
- POST /api/consent-forms/:id/sign - Sign form

### dermPath.ts
- GET /api/dermpath/cases - List pathology cases
- GET /api/dermpath/cases/:id - Get case
- POST /api/dermpath/cases - Submit case
- GET /api/dermpath/cases/:id/results - Get results

### diagnoses.ts
- GET /api/diagnoses - Search diagnosis codes
- GET /api/diagnoses/:code - Get diagnosis details

### documents.ts
- GET /api/documents - List documents
- GET /api/documents/:id - Get document
- POST /api/documents - Upload document
- DELETE /api/documents/:id - Delete document
- POST /api/documents/:id/share - Share document

### erx.ts
- POST /api/erx/prescribe - Send prescription
- GET /api/erx/status/:prescriptionId - Check status
- POST /api/erx/cancel - Cancel prescription
- GET /api/erx/history - Get prescription history

### fax.ts
- POST /api/fax/send - Send fax
- GET /api/fax/inbox - List received faxes
- GET /api/fax/:id - Get fax details
- POST /api/fax/:id/forward - Forward fax

### fhir.ts
- GET /api/fhir/Patient/:id - Get FHIR patient
- GET /api/fhir/Encounter/:id - Get FHIR encounter
- POST /api/fhir/DocumentReference - Create document reference
- (Many more FHIR resources)

### hl7.ts
- POST /api/hl7/message - Process HL7 message
- GET /api/hl7/messages - List messages
- GET /api/hl7/messages/:id - Get message details

### kiosk.ts
- GET /api/kiosk/session/:token - Get kiosk session
- POST /api/kiosk/checkin - Patient check-in
- POST /api/kiosk/update-info - Update patient info
- POST /api/kiosk/complete - Complete kiosk session

### labOrders.ts
- GET /api/lab-orders - List orders
- GET /api/lab-orders/:id - Get order
- POST /api/lab-orders - Create order
- POST /api/lab-orders/:id/results - Submit results

### messaging.ts
- GET /api/messaging/threads - List message threads
- GET /api/messaging/threads/:id - Get thread
- POST /api/messaging/send - Send message
- POST /api/messaging/threads/:id/read - Mark as read

### notes.ts
- GET /api/notes - List clinical notes
- GET /api/notes/:id - Get note
- POST /api/notes - Create note
- PUT /api/notes/:id - Update note
- POST /api/notes/:id/sign - Sign note

### patientPortal.ts
- POST /api/patient-portal/register - Register patient
- POST /api/patient-portal/login - Portal login
- GET /api/patient-portal/profile - Get profile
- PUT /api/patient-portal/profile - Update profile

### patientPortalData.ts
- GET /api/patient-portal-data/appointments - Get appointments
- GET /api/patient-portal-data/medications - Get medications
- GET /api/patient-portal-data/labs - Get lab results
- GET /api/patient-portal-data/documents - Get documents

### patientPortalMessages.ts
- GET /api/patient-portal/messages - List messages
- POST /api/patient-portal/messages - Send message
- GET /api/patient-portal/messages/:id - Get message
- POST /api/patient-portal/messages/:id/reply - Reply to message

### pharmacies.ts
- GET /api/pharmacies/search - Search pharmacies
- GET /api/pharmacies/:id - Get pharmacy details
- GET /api/pharmacies/favorite - Get favorite pharmacies

### photos.ts
- GET /api/photos - List photos
- POST /api/photos - Upload photo
- GET /api/photos/:id - Get photo
- DELETE /api/photos/:id - Delete photo
- PUT /api/photos/:id - Update photo metadata

### portalBilling.ts
- GET /api/patient-portal/billing/statements - Get statements
- GET /api/patient-portal/billing/balance - Get balance
- POST /api/patient-portal/billing/pay - Make payment

### priorAuth.ts
- GET /api/prior-auth - List authorizations
- POST /api/prior-auth - Submit authorization request
- GET /api/prior-auth/:id - Get authorization
- POST /api/prior-auth/:id/appeal - Appeal denial

### priorAuthRequests.ts
- GET /api/prior-auth-requests - List requests
- POST /api/prior-auth-requests - Create request
- PUT /api/prior-auth-requests/:id - Update request
- GET /api/prior-auth-requests/:id/status - Check status

### qualityMeasures.ts
- GET /api/quality/measures - List measures
- GET /api/quality/measures/:id - Get measure details
- POST /api/quality/calculate - Calculate measures
- GET /api/quality/reports - Get quality reports

### recalls.ts
- GET /api/recalls - List recalls
- POST /api/recalls - Create recall
- POST /api/recalls/:id/send - Send recall notification
- PUT /api/recalls/:id - Update recall

### referrals.ts
- GET /api/referrals - List referrals
- POST /api/referrals - Create referral
- GET /api/referrals/:id - Get referral
- PUT /api/referrals/:id/status - Update status

### reports.ts
- GET /api/reports/financial - Financial report
- GET /api/reports/clinical - Clinical report
- GET /api/reports/productivity - Productivity report
- POST /api/reports/custom - Generate custom report

### sms.ts
- POST /api/sms/send - Send SMS
- GET /api/sms/inbox - List received SMS
- POST /api/sms/appointment-reminder - Send appointment reminder
- GET /api/sms/campaigns - List SMS campaigns

### statements.ts
- GET /api/statements - List statements
- GET /api/statements/:id - Get statement
- POST /api/statements - Generate statement
- POST /api/statements/:id/send - Send statement

### tasks.ts
- GET /api/tasks - List tasks
- POST /api/tasks - Create task
- GET /api/tasks/:id - Get task
- PUT /api/tasks/:id - Update task
- POST /api/tasks/:id/complete - Complete task

### waitlist.ts
- GET /api/waitlist - List waitlist entries
- POST /api/waitlist - Add to waitlist
- DELETE /api/waitlist/:id - Remove from waitlist
- POST /api/waitlist/:id/notify - Notify patient

## Process for Each File

1. Open the route file
2. Identify all router methods (get, post, put, delete, patch)
3. For each route, add the @swagger comment above it
4. Include appropriate tags, parameters, requestBody, and responses
5. Ensure security requirements are specified
6. Test by building and viewing /api/docs

## Common Tags to Use

- Adaptive Learning
- AI Agent Configs
- AI Analysis
- Appointments
- Audit
- Authentication
- Billing
- Body Diagram
- Claims
- Clearinghouse
- Clinical Decision Support
- Consent Forms
- Dermatopathology
- Diagnoses
- Documents
- E-Prescribing
- Encounters
- Fax
- FHIR
- HL7
- Immunizations
- Insurance
- Inventory
- Kiosk
- Lab Orders
- Locations
- Medications
- Messaging
- Notes
- Patient Education
- Patient Portal
- Patients
- Pharmacies
- Photos
- Prior Authorization
- Procedures
- Providers
- Quality Measures
- Recalls
- Referrals
- Reports
- Review of Systems
- Scheduling
- Settings
- SMS
- Statements
- Tasks
- Treatment Plans
- Vitals
- Waitlist

## Regenerating OpenAPI Spec

After documenting routes, regenerate the OpenAPI spec:

```bash
cd backend
npm run build
node -e "const { swaggerSpec } = require('./dist/config/swagger'); const fs = require('fs'); fs.writeFileSync('openapi.json', JSON.stringify(swaggerSpec, null, 2));"
```

Or visit http://localhost:3000/api/openapi.json to get the dynamically generated spec.
