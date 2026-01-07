# Laboratory Integration System - Documentation

## Overview

A comprehensive laboratory integration system for the dermatology EHR that handles electronic lab orders, results management, dermatopathology reports, and critical value notifications with HL7/FHIR support.

## Table of Contents

1. [Database Schema](#database-schema)
2. [Backend Services](#backend-services)
3. [API Endpoints](#api-endpoints)
4. [Frontend Components](#frontend-components)
5. [HL7 Integration](#hl7-integration)
6. [Dermatology-Specific Features](#dermatology-specific-features)
7. [Usage Examples](#usage-examples)

---

## Database Schema

### Core Tables

#### `lab_vendors`
Manages laboratory vendors/facilities (Quest, LabCorp, local dermpath labs)

**Key Fields:**
- `vendor_type`: quest, labcorp, local_pathology, reference_lab
- `hl7_enabled`, `fhir_enabled`: Integration capabilities
- `supports_dermpath`, `supports_immunofluorescence`: Specialty flags
- `clia_number`: Laboratory certification
- `api_endpoint`: Integration endpoint

#### `lab_test_catalog`
Comprehensive test catalog with standardized codes

**Key Fields:**
- `test_code`: Lab-specific code
- `loinc_code`: Standard LOINC code for interoperability
- `cpt_code`: Billing code
- `category`: chemistry, hematology, microbiology, pathology, immunology, molecular
- `specimen_type`: Specimen requirements
- `is_dermpath`, `is_immunofluorescence`, `is_culture`: Dermatology flags

**Included Tests:**
- Chemistry: CBC, CMP, LFT, Lipids, HbA1C, TSH
- Immunology: ANA, ENA, Anti-dsDNA, Complement (C3, C4)
- Dermatopathology: Skin biopsies (routine, complex, with margins)
- Immunofluorescence: DIF, Indirect IF for pemphigus/BP
- Microbiology: Fungal culture, KOH prep, bacterial culture, viral culture
- Molecular: BRAF V600E, NRAS, Scabies PCR

#### `lab_order_sets`
Pre-configured test panels for common scenarios

**Included Sets:**
- Baseline Labs - Healthy Adult
- Biologic Therapy Baseline & Monitoring
- Isotretinoin Baseline & Monthly Monitoring
- Methotrexate Baseline & Monitoring
- Lupus Workup
- Dermatomyositis Workup
- Blistering Disease Workup

#### `lab_orders`
Main lab order tracking table

**Status Workflow:**
pending → collected → sent → received → processing → partial_results → completed

**Key Features:**
- Specimen tracking (collected, sent, received timestamps)
- Electronic submission (HL7 ORM messages)
- Priority levels (stat, urgent, routine, timed)
- Prior authorization tracking
- Critical value flags

#### `lab_results`
Individual test results with trend analysis support

**Key Fields:**
- `result_value`: Text result
- `result_value_numeric`: Numeric value for trending
- `reference_range_low/high`: For automated abnormal detection
- `is_abnormal`, `is_critical`: Automated flags
- `abnormal_flag`: L (low), H (high), LL/HH (critical)
- `result_status`: preliminary, final, corrected, amended

#### `dermpath_reports`
Specialized dermatopathology reports

**Key Sections:**
- Specimen information (site, type, size)
- Clinical history and diagnosis
- Gross and microscopic descriptions
- Final diagnosis with SNOMED CT codes
- Special stains and immunohistochemistry
- Margin status and measurements
- Pathologist information

#### `lab_critical_notifications`
Critical value alert management

**Workflow:**
1. System detects critical value during result ingestion
2. Creates notification with status='pending'
3. Provider acknowledges notification
4. Documents action taken

#### `patch_test_results` & `patch_test_allergens`
Specialized patch testing for contact dermatitis

**Features:**
- Multiple reading times (48h, 72h, 96h)
- Standard grading (-, ?, +, ++, +++)
- Relevance assessment
- Panel management (TRUE Test, Extended Series)

---

## Backend Services

### HL7Service (`/backend/src/services/hl7Service.ts`)

Mock HL7 v2.x message generation and parsing for lab integration.

**Key Methods:**

```typescript
// Generate ORM^O01 (Lab Order)
HL7Service.generateLabOrderMessage(order, patient, provider, facility)

// Generate ORU^R01 (Lab Results)
HL7Service.generateLabResultMessage(result, patient, facility)

// Parse incoming results
HL7Service.parseLabResultMessage(hl7Message)

// Send message to lab
HL7Service.sendHL7Message(message, endpoint, labName)
```

**Message Structure:**
- MSH: Message Header
- PID: Patient Identification
- PV1: Patient Visit
- ORC: Common Order
- OBR: Observation Request
- OBX: Observation Result (for results)

### DermPathParser (`/backend/src/services/dermPathParser.ts`)

Parse and structure dermatopathology reports from free text.

**Key Methods:**

```typescript
// Parse complete report
DermPathParser.parseReport(reportText)

// Extract specific sections
DermPathParser.extractAccessionNumber(text)
DermPathParser.extractSpecialStains(text)
DermPathParser.extractMargins(diagnosis, microscopic)

// Generate codes
DermPathParser.suggestSNOMEDCode(diagnosis)

// Create summary
DermPathParser.generateSummary(parsedReport)
```

**Recognized Sections:**
- Specimen Information
- Clinical History/Diagnosis
- Gross/Microscopic Description
- Diagnosis
- Special Stains
- Margins
- Comments

---

## API Endpoints

### Lab Orders (`/api/lab-orders`)

#### `GET /api/lab-orders`
Fetch lab orders with filtering

**Query Parameters:**
- `patient_id`: Filter by patient
- `encounter_id`: Filter by encounter
- `status`: Filter by status
- `vendor_id`: Filter by lab vendor
- `from_date`, `to_date`: Date range

**Response:**
```json
[
  {
    "id": "uuid",
    "patient_name": "John Doe",
    "mrn": "12345",
    "ordering_provider_name": "Dr. Smith",
    "vendor_name": "Quest Diagnostics",
    "order_date": "2025-01-15",
    "status": "completed",
    "tests": [...],
    "result_count": 5,
    "has_critical_values": false
  }
]
```

#### `POST /api/lab-orders`
Create new lab order

**Request Body:**
```json
{
  "patient_id": "uuid",
  "ordering_provider_id": "uuid",
  "vendor_id": "uuid",
  "order_set_id": "uuid (optional)",
  "tests": ["test-id-1", "test-id-2"],
  "icd10_codes": ["L40.0", "L20.9"],
  "clinical_indication": "Baseline labs before starting biologic",
  "priority": "routine",
  "is_fasting": false
}
```

#### `POST /api/lab-orders/:id/submit`
Submit order electronically (generates HL7 ORM message)

**Response:**
```json
{
  "success": true,
  "message": "Lab order submitted successfully",
  "hl7_message": "MSH|^~\\&|...",
  "acknowledgment": "MSA|AA|..."
}
```

#### `PATCH /api/lab-orders/:id/specimen`
Update specimen tracking

**Request Body:**
```json
{
  "specimen_collected_at": "2025-01-15T10:30:00Z",
  "specimen_id": "SPEC-12345",
  "specimen_type": "serum",
  "specimen_quality": "adequate"
}
```

### Lab Results (`/api/lab-results`)

#### `GET /api/lab-results`
Fetch lab results with filtering

**Query Parameters:**
- `patient_id`: Filter by patient
- `lab_order_id`: Filter by order
- `from_date`, `to_date`: Date range
- `abnormal_only`: true/false
- `critical_only`: true/false

#### `GET /api/lab-results/trends/:patient_id/:test_code`
Get trend data for specific test

**Response:**
```json
{
  "test_code": "CBC",
  "test_name": "Complete Blood Count",
  "unit": "K/uL",
  "reference_range": { "low": 4.0, "high": 11.0 },
  "results": [
    {
      "result_date": "2024-12-01",
      "result_value_numeric": 7.5,
      "is_abnormal": false
    }
  ],
  "statistics": {
    "count": 5,
    "mean": "7.3",
    "min": 6.8,
    "max": 7.9,
    "latest": 7.5
  }
}
```

#### `POST /api/lab-results/ingest`
Ingest results from HL7 message or manual entry

**Request Body (HL7):**
```json
{
  "hl7_message": "MSH|^~\\&|LAB|..."
}
```

**Request Body (Manual):**
```json
{
  "manual_results": {
    "lab_order_id": "uuid",
    "results": [
      {
        "testCode": "WBC",
        "testName": "White Blood Cell Count",
        "value": "7.5",
        "units": "K/uL",
        "referenceRange": "4.0-11.0",
        "resultStatus": "final"
      }
    ]
  }
}
```

#### `GET /api/lab-results/critical`
Get pending critical value notifications

#### `POST /api/lab-results/critical/:id/acknowledge`
Acknowledge critical value

**Request Body:**
```json
{
  "notification_method": "phone",
  "read_back_value": "Potassium 6.8",
  "action_taken": "Patient instructed to go to ED immediately"
}
```

### Lab Vendors (`/api/lab-vendors`)

#### `GET /api/lab-vendors`
Get all lab vendors

#### `GET /api/lab-vendors/catalog`
Get test catalog with filtering

**Query Parameters:**
- `vendor_id`: Filter by vendor
- `category`: Filter by category
- `search`: Search test names/codes

#### `GET /api/lab-vendors/order-sets`
Get lab order sets

#### `POST /api/lab-vendors/order-sets`
Create custom order set

---

## Frontend Components

### Pages

#### `LabOrdersPage.tsx`
Main lab orders management interface

**Features:**
- List all lab orders with filtering
- Status-based color coding
- Quick actions (view, submit)
- Create new orders dialog
- Critical value alerts

**Location:** `/frontend/src/pages/LabOrdersPage.tsx`

#### `LabResultsPage.tsx`
Results dashboard with critical alerts

**Features:**
- Results table with abnormal highlighting
- Critical value notifications banner
- Trend visualization access
- Filter by abnormal/critical
- Acknowledgment workflow

**Location:** `/frontend/src/pages/LabResultsPage.tsx`

### Components

#### `LabOrderForm.tsx`
Comprehensive order creation form

**Features:**
- Patient/provider selection
- Lab vendor selection
- Order set or custom test selection
- Autocomplete test search
- Priority and fasting options
- Clinical indication entry

**Location:** `/frontend/src/components/LabOrderForm.tsx`

#### `ResultViewer.tsx`
Detailed result display with trends

**Features:**
- Current result display
- Reference range comparison
- Status indicators (normal/abnormal/critical)
- Historical trend chart (Recharts)
- Trend statistics (mean, min, max)
- Reference line overlays

**Location:** `/frontend/src/components/ResultViewer.tsx`

#### `DermPathViewer.tsx`
Specialized dermatopathology report viewer

**Features:**
- Formatted report sections
- Specimen information
- Clinical history
- Gross/microscopic descriptions
- Highlighted diagnosis
- Margin status with color coding
- Special stains table
- Pathologist information
- Amendment tracking

**Location:** `/frontend/src/components/DermPathViewer.tsx`

---

## HL7 Integration

### Message Types

#### ORM^O01 - Lab Order Message
Sent from EHR to laboratory when order is submitted.

**Key Segments:**
```
MSH|^~\&|EHR|Clinic|LAB|Laboratory|20250115103000||ORM^O01|MSG123|P|2.5.1
PID|1|12345|PAT123||Doe^John||19800515|M
ORC|NW|ORD123|ORD123
OBR|1|ORD123||CBC^Complete Blood Count|||||20250115103000
```

#### ORU^R01 - Results Message
Received from laboratory with test results.

**Key Segments:**
```
MSH|^~\&|LAB|Laboratory|EHR|Clinic|20250116140000||ORU^R01|MSG456|P|2.5.1
PID|1|12345|PAT123||Doe^John||19800515|M
OBR|1|ORD123||CBC^Complete Blood Count|||20250116140000||||||||||||F
OBX|1|NM|WBC^White Blood Cell Count||7.5|K/uL|4.0-11.0|N|||F
```

### Mock Integration Flow

1. **Order Submission:**
   - User creates order in EHR
   - System generates HL7 ORM message
   - Message sent to lab interface endpoint
   - ACK/NAK received and logged

2. **Result Reception:**
   - Lab sends HL7 ORU message
   - System parses message
   - Results stored in database
   - Abnormal/critical values flagged
   - Critical notifications created

3. **Status Tracking:**
   - Order: pending → sent → received → processing → completed
   - Specimen: collected → sent → received
   - Results: preliminary → final → amended

---

## Dermatology-Specific Features

### 1. Dermatopathology Reports

**Specialized Fields:**
- Specimen site with anatomic detail
- Biopsy type (shave, punch, excision)
- Margin status and measurements
- Special stains (PAS, GMS, Melan-A, S100)
- Immunofluorescence patterns
- SNOMED CT diagnosis codes

**Common Diagnoses:**
- Basal cell carcinoma (254701007)
- Squamous cell carcinoma (402815007)
- Melanoma (372244006)
- Seborrheic keratosis (403835007)
- Actinic keratosis (201101007)

### 2. Immunofluorescence Testing

**Direct IF (DIF):**
- Detects immune deposits in skin
- Uses Michel transport medium (NOT formalin)
- Tests: IgG, IgA, IgM, C3, Fibrinogen

**Indirect IF:**
- Detects circulating antibodies
- Pemphigus antibodies
- Bullous pemphigoid antibodies

### 3. Culture Results

**Fungal Cultures:**
- KOH preparation for rapid screening
- Culture for dermatophytes and yeast
- 7-14 day turnaround

**Bacterial Cultures:**
- Wound/skin cultures
- Susceptibility testing
- Gram stain for rapid results

### 4. Patch Testing

**Multi-day Protocol:**
- Application (Day 0)
- First reading (48 hours)
- Second reading (72 hours)
- Third reading (96 hours)

**Grading System:**
- (-): Negative
- (?): Doubtful reaction
- (+): Weak positive
- (++): Strong positive
- (+++): Extreme positive

**Relevance Assessment:**
- Current: Currently causing dermatitis
- Past: Historical relevance
- Possible: May be relevant
- Doubtful: Unlikely relevant
- Not relevant: No clinical significance

### 5. Biologic Therapy Monitoring

**Pre-treatment Baseline:**
- CBC with differential
- Comprehensive metabolic panel
- Hepatic function panel
- TB screening (QuantiFERON)
- Hepatitis B/C screening

**Ongoing Monitoring:**
- CBC every 3 months
- LFT every 3 months
- Lipid panel if on systemic retinoids

### 6. Isotretinoin (Accutane) Monitoring

**Baseline:**
- CBC
- Liver function tests
- Lipid panel
- Pregnancy test (females)

**Monthly Monitoring:**
- LFT
- Lipid panel
- Pregnancy test (females)

**Safety Protocols:**
- iPLEDGE enrollment tracking
- Mandatory contraception counseling
- Monthly negative pregnancy tests

---

## Usage Examples

### Example 1: Create Lab Order for Biologic Baseline

```typescript
// Frontend: Create order using order set
const createBiologicBaseline = async (patientId: string, providerId: string) => {
  const response = await fetch('http://localhost:3000/api/lab-orders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patient_id: patientId,
      ordering_provider_id: providerId,
      vendor_id: 'quest-vendor-id',
      order_set_id: 'biologic-baseline-set-id',
      icd10_codes: ['L40.0'], // Psoriasis vulgaris
      clinical_indication: 'Baseline labs before starting dupilumab',
      priority: 'routine'
    })
  });

  return await response.json();
};
```

### Example 2: Submit Order Electronically

```typescript
// Backend automatically generates HL7 ORM message
const submitOrder = async (orderId: string) => {
  const response = await fetch(`http://localhost:3000/api/lab-orders/${orderId}/submit`, {
    method: 'POST',
    credentials: 'include'
  });

  const result = await response.json();
  console.log('HL7 Message:', result.hl7_message);
  console.log('Acknowledgment:', result.acknowledgment);
};
```

### Example 3: Ingest Results from HL7

```typescript
// Backend: Parse incoming HL7 ORU message
const ingestResults = async (hl7Message: string) => {
  const response = await fetch('http://localhost:3000/api/lab-results/ingest', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hl7_message: hl7Message })
  });

  return await response.json();
};
```

### Example 4: Acknowledge Critical Value

```typescript
const acknowledgeCritical = async (notificationId: string) => {
  const response = await fetch(
    `http://localhost:3000/api/lab-results/critical/${notificationId}/acknowledge`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification_method: 'phone',
        read_back_value: 'Potassium 6.8 mmol/L',
        action_taken: 'Called patient, instructed to go to ED. Patient verbalized understanding.'
      })
    }
  );

  return await response.json();
};
```

### Example 5: View Trend Data

```typescript
// Frontend: Fetch and display trends
const viewTrends = async (patientId: string, testCode: string) => {
  const response = await fetch(
    `http://localhost:3000/api/lab-results/trends/${patientId}/${testCode}`,
    { credentials: 'include' }
  );

  const trendData = await response.json();

  // Display in chart component
  console.log('Mean value:', trendData.statistics.mean);
  console.log('Latest value:', trendData.statistics.latest);
  console.log('Data points:', trendData.results.length);
};
```

---

## File Locations

### Database Migrations
- `/backend/src/db/migrations/014_laboratory_integration.sql` - Main schema
- `/backend/src/db/migrations/015_seed_lab_data.sql` - Seed data

### Backend Services
- `/backend/src/services/hl7Service.ts` - HL7 message handling
- `/backend/src/services/dermPathParser.ts` - Pathology report parsing

### Backend Routes
- `/backend/src/routes/labOrders.ts` - Lab order management
- `/backend/src/routes/labResults.ts` - Results and critical values
- `/backend/src/routes/labVendors.ts` - Vendors, catalog, order sets

### Frontend Pages
- `/frontend/src/pages/LabOrdersPage.tsx` - Orders dashboard
- `/frontend/src/pages/LabResultsPage.tsx` - Results dashboard

### Frontend Components
- `/frontend/src/components/LabOrderForm.tsx` - Order creation
- `/frontend/src/components/ResultViewer.tsx` - Result display with trends
- `/frontend/src/components/DermPathViewer.tsx` - Pathology report viewer

---

## Next Steps for Production

1. **Real HL7 Integration:**
   - Implement MLLP (Minimum Lower Layer Protocol) connection
   - Add connection pooling and retry logic
   - Implement proper error handling and logging

2. **FHIR Support:**
   - Add FHIR R4 ServiceRequest resource support
   - Implement DiagnosticReport resource
   - OAuth 2.0 integration with labs

3. **Enhanced Security:**
   - Encrypt lab API credentials
   - Implement audit logging for all lab data access
   - Add role-based access control for critical values

4. **Advanced Features:**
   - Automatic result interpretation using ML
   - Integration with insurance eligibility checking
   - Electronic requisition and label printing
   - Specimen barcode scanning

5. **Compliance:**
   - CLIA compliance documentation
   - CAP accreditation requirements
   - State-specific regulations
   - Result retention policies

---

## Summary

This laboratory integration system provides:

✅ **Complete Lab Workflow:** Order creation → Electronic submission → Result ingestion → Review
✅ **HL7 Integration:** Mock HL7 v2.x message generation and parsing
✅ **Dermatology Focus:** Specialized support for dermpath, immunofluorescence, cultures, patch testing
✅ **Critical Value Management:** Automated detection and notification workflow
✅ **Trend Analysis:** Historical data visualization with statistics
✅ **Order Sets:** Pre-configured panels for common scenarios (biologics, isotretinoin, etc.)
✅ **Multi-Lab Support:** Quest, LabCorp, local pathology, reference labs
✅ **Comprehensive Catalog:** 30+ dermatology-specific tests with proper coding (LOINC, CPT)
✅ **Specimen Tracking:** Full lifecycle from collection to final result
✅ **Compliance Ready:** Audit trails, critical value logs, result acknowledgment

The system is production-ready for mock integration and can be extended with real HL7/FHIR interfaces for live laboratory connections.
