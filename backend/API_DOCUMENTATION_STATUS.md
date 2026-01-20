# API Documentation Status

## Overview
This document tracks the progress of adding Swagger/OpenAPI annotations to all backend API endpoints.

**Total Route Files**: 95
**Target**: Document all 90+ endpoints across 50+ priority route files
**Status**: In Progress

## Completed Files (Full Documentation)

### 1. adaptiveLearning.ts ✅
- GET /api/adaptive/diagnoses/suggested - Get suggested diagnoses
- GET /api/adaptive/procedures/suggested - Get suggested procedures
- GET /api/adaptive/procedures/for-diagnosis/:icd10Code - Get paired procedures
- POST /api/adaptive/learn/diagnosis - Record diagnosis usage
- POST /api/adaptive/learn/procedure - Record procedure usage
- POST /api/adaptive/learn/pair - Record diagnosis-procedure pair
- GET /api/adaptive/stats/:providerId - Get provider statistics

### 2. aiAgentConfigs.ts ✅
- GET /api/ai-agent-configs - List configurations
- GET /api/ai-agent-configs/default - Get default configuration
- GET /api/ai-agent-configs/for-appointment/:appointmentTypeId - Get config for appointment type
- GET /api/ai-agent-configs/:id - Get configuration by ID
- POST /api/ai-agent-configs - Create configuration
- PUT /api/ai-agent-configs/:id - Update configuration
- DELETE /api/ai-agent-configs/:id - Delete configuration
- POST /api/ai-agent-configs/:id/clone - Clone configuration
- GET /api/ai-agent-configs/:id/versions - Get version history
- GET /api/ai-agent-configs/analytics/summary - Get analytics
- POST /api/ai-agent-configs/:id/test - Test configuration

### 3. aiAnalysis.ts ✅
- POST /api/ai-analysis/analyze-photo/:photoId - Analyze photo with AI
- GET /api/ai-analysis/photo/:photoId - Get analysis results
- POST /api/ai-analysis/batch-analyze/:patientId - Batch analyze patient photos
- GET /api/ai-analysis/cds-alerts - Get CDS alerts
- POST /api/ai-analysis/cds-alerts/:alertId/dismiss - Dismiss alert
- GET /api/ai-analysis/stats - Get analysis statistics

### 4. audit.ts ✅ (Partial)
- GET /api/audit/appointments - Get appointment status history
- GET /api/audit/log - Get basic audit log
- GET /api/audit - Get detailed audit log with filtering

## Previously Documented Files

### Core Routes (Already Had Documentation)
- appointments.ts - Appointment management endpoints
- auth.ts - Authentication endpoints
- patients.ts - Patient CRUD endpoints
- providers.ts - Provider listing
- locations.ts - Location management
- medications.ts - Medication search
- vitals.ts - Vital signs
- encounters.ts - Clinical encounters (partial)
- health.ts - Health check endpoints

## Priority Files Needing Documentation

### High Priority (Clinical & Patient Care)
- [ ] ambientScribe.ts - Expand existing documentation
- [ ] encounters.ts - Expand existing documentation
- [ ] notes.ts - Clinical notes
- [ ] photos.ts - Clinical photography
- [ ] bodyDiagram.ts - Body diagram annotations
- [ ] documents.ts - Document management
- [ ] consentForms.ts - Consent form management

### High Priority (Billing & Financial)
- [ ] bills.ts - Billing/invoices
- [ ] batches.ts - Batch processing
- [ ] claims.ts - Insurance claims
- [ ] statements.ts - Patient statements
- [ ] portalBilling.ts - Portal billing
- [ ] clearinghouse.ts - Clearinghouse integration

### High Priority (Prescriptions & Orders)
- [ ] erx.ts - E-prescribing
- [ ] pharmacies.ts - Pharmacy directory
- [ ] labOrders.ts - Lab orders
- [ ] priorAuth.ts - Prior authorization
- [ ] priorAuthRequests.ts - Prior auth requests

### Medium Priority (Communication)
- [ ] messaging.ts - Internal messaging
- [ ] patientPortalMessages.ts - Portal messaging
- [ ] sms.ts - SMS messaging
- [ ] fax.ts - Fax sending/receiving

### Medium Priority (Patient Portal)
- [ ] patientPortal.ts - Portal endpoints
- [ ] patientPortalData.ts - Portal data access
- [ ] kiosk.ts - Patient kiosk

### Medium Priority (Integration & Interoperability)
- [ ] fhir.ts - FHIR API
- [ ] hl7.ts - HL7 messaging
- [ ] dermPath.ts - Pathology integration

### Lower Priority (Supporting Features)
- [ ] diagnoses.ts - Diagnosis codes
- [ ] tasks.ts - Task management
- [ ] recalls.ts - Patient recalls
- [ ] referrals.ts - Referral management
- [ ] reports.ts - Reporting
- [ ] qualityMeasures.ts - Quality reporting
- [ ] waitlist.ts - Waitlist management

## Documentation Pattern

All endpoints should include:

```typescript
/**
 * @swagger
 * /api/endpoint/path:
 *   method:
 *     summary: Brief description
 *     description: Detailed description of what the endpoint does
 *     tags:
 *       - Tag Name
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path/query
 *         name: paramName
 *         required: true/false
 *         schema:
 *           type: string
 *         description: Parameter description
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
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
 *       404:
 *         description: Resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
```

## Next Steps

1. Continue systematically documenting remaining route files
2. Focus on high-priority clinical and billing endpoints first
3. Test documentation by viewing Swagger UI at /api/docs
4. Regenerate openapi.json after major additions
5. Validate all endpoints have proper:
   - Security requirements
   - Parameter definitions
   - Request/response schemas
   - Error responses (400, 401, 403, 404, 500)

## OpenAPI Spec Generation

The swagger spec is automatically generated from JSDoc comments using `swagger-jsdoc`.
Access the live documentation at: `http://localhost:3000/api/docs`

To regenerate the static openapi.json:
```bash
cd backend
npm run build
node -e "const { swaggerSpec } = require('./dist/config/swagger'); const fs = require('fs'); fs.writeFileSync('openapi.json', JSON.stringify(swaggerSpec, null, 2));"
```

## Statistics

- **Documented**: ~30 endpoints across 4 files
- **Remaining**: ~60+ endpoints across 40+ files
- **Coverage**: ~33% complete
