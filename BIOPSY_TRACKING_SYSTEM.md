# Biopsy Tracking System - Complete Implementation

## Overview

A comprehensive, closed-loop biopsy tracking system designed for dermatology practices. This system ensures **patient safety** by tracking every biopsy from specimen collection through pathology results, review, and patient notification.

## Critical Safety Features

- **Never lose track of a biopsy** - Complete audit trail from order to closure
- **Automatic overdue alerts** - Flags biopsies >7 days without results
- **Required provider sign-off** - All results must be reviewed and acknowledged
- **Patient notification tracking** - Ensures patients are informed of results
- **Malignancy alerts** - Immediate notifications for cancer diagnoses
- **Chain of custody** - Complete specimen tracking history

## Architecture

### Database Layer

**Location:** `/backend/src/db/migrations/022_biopsy_tracking.sql`

**Tables:**
- `biopsies` - Main biopsy tracking table with full specimen lifecycle
- `biopsy_status_history` - Audit log of all status changes
- `biopsy_alerts` - Safety alerts for overdue/critical findings
- `biopsy_review_checklists` - Provider review completion tracking
- `biopsy_specimen_tracking` - Chain of custody events

**Key Features:**
- Automatic specimen ID generation (format: BX-YYYYMMDD-XXX)
- Trigger-based overdue detection (>7 days)
- Automatic malignancy alerts
- Turnaround time calculation
- Comprehensive indexing for performance

### Backend Services

**Location:** `/backend/src/services/biopsyService.ts`

**Key Methods:**
- `generateSpecimenId()` - Creates unique specimen identifiers
- `getOverdueBiopsies()` - Returns biopsies requiring follow-up
- `getPendingReviewBiopsies()` - Results awaiting provider review
- `getBiopsyStats()` - Dashboard metrics
- `getQualityMetrics()` - Performance reporting
- `sendNotification()` - Alert system integration
- `trackSpecimen()` - Chain of custody tracking
- `exportBiopsyLog()` - Regulatory compliance reporting

### Backend Routes

**Location:** `/backend/src/routes/biopsy.ts`

**Endpoints:**

```
POST   /api/biopsies                - Create new biopsy order
GET    /api/biopsies                - List all biopsies (with filters)
GET    /api/biopsies/pending        - Get biopsies needing review
GET    /api/biopsies/overdue        - Get overdue biopsies (SAFETY CRITICAL)
GET    /api/biopsies/stats          - Dashboard statistics
GET    /api/biopsies/quality-metrics - Quality reporting
GET    /api/biopsies/:id            - Get single biopsy with full details
PUT    /api/biopsies/:id            - Update biopsy details
POST   /api/biopsies/:id/result     - Add pathology result
POST   /api/biopsies/:id/review     - Provider review and sign-off
POST   /api/biopsies/:id/notify-patient - Record patient notification
GET    /api/biopsies/:id/alerts     - Get all alerts for biopsy
GET    /api/biopsies/export/log     - Export to CSV for compliance
```

### Frontend Components

#### 1. BiopsyOrderForm
**Location:** `/frontend/src/components/Biopsy/BiopsyOrderForm.tsx`

**Features:**
- Links to lesions from body map
- Specimen type selection (punch, shave, excisional, incisional)
- Detailed anatomic location with laterality
- Clinical description and differential diagnoses
- Pathology lab selection
- Special study requests (stains, cultures, immunofluorescence)
- Generates unique specimen ID
- Opens print dialog for specimen label

**Usage:**
```tsx
<BiopsyOrderForm
  patientId="patient-uuid"
  encounterId="encounter-uuid"
  lesionId="lesion-uuid"  // Optional - links to body map
  onSuccess={() => refreshBiopsies()}
  onCancel={() => closeDialog()}
/>
```

#### 2. BiopsyTracker
**Location:** `/frontend/src/components/Biopsy/BiopsyTracker.tsx`

**Features:**
- Real-time dashboard with auto-refresh (5 min intervals)
- Status workflow visualization
- Color-coded status chips
- Days since sent tracking
- Critical alerts for overdue biopsies
- Malignancy highlighting
- Filter by status, overdue, provider
- Statistics cards showing key metrics

**Dashboard Views:**
- All Biopsies
- Pending (in-progress)
- Needs Review (resulted but not reviewed)
- Overdue (>7 days, SAFETY CRITICAL)

**Usage:**
```tsx
<BiopsyTracker
  providerId="provider-uuid"  // Optional - filter to specific provider
  onViewBiopsy={(id) => openBiopsyDetails(id)}
/>
```

#### 3. BiopsyResultReview
**Location:** `/frontend/src/components/Biopsy/BiopsyResultReview.tsx`

**Features:**
- Displays full pathology report
- Shows original lesion link and photo
- Patient demographics prominently displayed
- ICD-10 diagnosis code entry with autocomplete
- Follow-up action selection:
  - No action (benign)
  - Re-excision required
  - Mohs referral
  - Dermatology follow-up
  - Oncology referral
  - Monitoring/surveillance
- Malignancy details (margins, Breslow depth, Clark level)
- Patient notification template
- Review checklist completion
- Sign-off and status closure

**Auto-suggestions:**
- Melanoma → Oncology referral
- Involved margins → Re-excision
- BCC/SCC → Follow-up scheduling

**Usage:**
```tsx
<BiopsyResultReview
  biopsyId="biopsy-uuid"
  onClose={() => closeDialog()}
  onReviewComplete={() => {
    toast.success('Review complete');
    refreshDashboard();
  }}
/>
```

#### 4. BiopsyLabel
**Location:** `/frontend/src/components/Biopsy/BiopsyLabel.tsx`

**Features:**
- Printable 4" x 3" specimen label
- Patient name, DOB, MRN
- Unique specimen ID with barcode
- Anatomic location
- Collection date
- Provider name
- Pathology lab
- Special instructions highlighted
- Print-optimized layout
- Auto-print option

**Usage:**
```tsx
<BiopsyLabel
  biopsyId="biopsy-uuid"
  autoPrint={true}  // Automatically opens print dialog
/>
```

#### 5. BiopsyLogPage
**Location:** `/frontend/src/pages/BiopsyLogPage.tsx`

**Features:**
- Comprehensive searchable log (regulatory requirement)
- Advanced filters:
  - Search by specimen ID, patient name, MRN, location
  - Status filter
  - Malignancy type filter
  - Date range filter
- Quality metrics dashboard:
  - Total biopsies
  - Average turnaround time
  - % completed within 7 days
  - Malignancy statistics
- Export to Excel/CSV
- Pagination for large datasets
- Direct link to review from log

**Usage:**
```tsx
import BiopsyLogPage from './pages/BiopsyLogPage';

// In routing:
<Route path="/biopsy-log" element={<BiopsyLogPage />} />
```

## Workflow

### 1. Order Biopsy
1. Provider marks lesion on body map (optional)
2. Opens BiopsyOrderForm
3. Fills clinical details, differential diagnoses
4. Selects pathology lab
5. System generates unique specimen ID
6. Prints specimen label

### 2. Specimen Collection
1. Status updated to "collected"
2. Collected timestamp recorded
3. Specimen tracking event logged
4. Provider who collected documented

### 3. Send to Lab
1. Status updated to "sent"
2. Sent timestamp recorded
3. Shipping method and tracking documented
4. **Overdue timer starts** (7-day countdown)

### 4. Lab Processing
1. Lab updates status to "received_by_lab"
2. Case number assigned
3. Processing status tracked

### 5. Results Received
1. Status updated to "resulted"
2. Pathology report entered
3. Diagnosis, margins, special findings recorded
4. **Automatic alerts:**
   - Provider notified of result
   - Malignancy alert if cancer detected
   - Appears in "Needs Review" queue

### 6. Provider Review
1. Opens BiopsyResultReview component
2. Reviews pathology report
3. Assigns ICD-10 diagnosis code
4. Determines follow-up action
5. **Signs off** - status changes to "reviewed"
6. Review checklist completed

### 7. Patient Notification
1. Provider documents notification method
2. Patient contacted via phone/portal/email
3. Results explained
4. Follow-up scheduled if needed
5. Status updated to "closed"

## Safety Features

### Overdue Detection
- Automatic trigger checks biopsies sent >7 days ago
- Creates high-severity alert
- Appears prominently on dashboard
- Highlighted in red on BiopsyTracker
- Email notifications to ordering provider (configurable)

### Malignancy Alerts
- Automatic detection when malignancy_type is set
- Severity based on cancer type:
  - Melanoma: CRITICAL
  - SCC: HIGH
  - BCC: MEDIUM
- Creates alert requiring acknowledgment
- Cannot close review without follow-up plan

### Audit Trail
- Every status change logged with timestamp and user
- Complete chain of custody in specimen_tracking table
- All provider actions recorded
- Immutable history for regulatory compliance

### Required Completions
- Cannot close review without:
  - ICD-10 diagnosis code
  - Follow-up action selected
  - Patient notification plan
- Review checklist enforced
- Provider sign-off required

## Quality Metrics

### Dashboard Metrics
- Total biopsies by status
- Average turnaround time
- % within 7 days (quality benchmark)
- Overdue count (patient safety)
- Malignancy statistics
- Patient notification rate

### Exportable Reports
- Complete biopsy log (CSV)
- Date range filtering
- Provider-specific reports
- Malignancy registry
- Turnaround time analysis

## Database Schema Highlights

### Core Fields
```sql
-- Unique identifier
specimen_id VARCHAR(100) UNIQUE NOT NULL  -- BX-YYYYMMDD-XXX

-- Status tracking
status VARCHAR(50) DEFAULT 'ordered'
ordered_at, collected_at, sent_at, resulted_at, reviewed_at, closed_at

-- Safety flags
is_overdue BOOLEAN DEFAULT false
turnaround_time_days INTEGER

-- Malignancy tracking
malignancy_type VARCHAR(100)
breslow_depth_mm, clark_level, margins, mitotic_rate

-- Patient safety
patient_notified BOOLEAN DEFAULT false
patient_notified_at TIMESTAMPTZ
```

### Indexes for Performance
```sql
-- Safety-critical queries
CREATE INDEX idx_biopsies_overdue ON biopsies(is_overdue, status)
  WHERE is_overdue = true AND status NOT IN ('reviewed', 'closed');

CREATE INDEX idx_biopsies_pending_review ON biopsies(status, resulted_at)
  WHERE status = 'resulted';

-- Malignancy tracking
CREATE INDEX idx_biopsies_malignancy ON biopsies(malignancy_type)
  WHERE malignancy_type IS NOT NULL;
```

## Integration Points

### Body Map Integration
- Links biopsy to specific lesion
- Auto-populates location from lesion
- Updates lesion status to "biopsied"
- Associates photos with biopsy

### Lab Vendor Integration
- References lab_vendors table
- Supports HL7 result import
- Electronic order transmission (future)
- Lab-specific workflows

### Patient Portal
- Results notification
- Follow-up appointment scheduling
- Patient education materials
- Secure messaging

### Billing Integration
- CPT code tracking (88305, etc.)
- Links to encounter for billing
- Generates superbill entries
- ICD-10 codes for medical necessity

## Installation & Setup

### 1. Run Database Migration
```bash
cd backend
npm run migrate
```

### 2. Register Routes
```typescript
// In backend/src/index.ts or routes index
import biopsyRoutes from './routes/biopsy';

app.use('/api/biopsies', biopsyRoutes);
```

### 3. Add Navigation
```tsx
// In frontend navigation/menu
{
  path: '/biopsies',
  label: 'Biopsy Tracker',
  icon: <ScienceIcon />
},
{
  path: '/biopsy-log',
  label: 'Biopsy Log',
  icon: <AssignmentIcon />
}
```

### 4. Install Dependencies
```bash
# Frontend
cd frontend
npm install react-barcode date-fns

# Backend (already included)
# zod, express, pg
```

## Testing

### Critical Test Scenarios

1. **Overdue Detection**
   - Create biopsy
   - Set sent_at to 8 days ago
   - Verify is_overdue flag set
   - Verify alert created

2. **Malignancy Alert**
   - Add result with malignancy_type = 'melanoma'
   - Verify CRITICAL alert created
   - Verify cannot close without follow-up plan

3. **Specimen ID Generation**
   - Create multiple biopsies on same day
   - Verify unique sequential IDs
   - Verify format: BX-YYYYMMDD-XXX

4. **Review Workflow**
   - Submit result
   - Verify appears in pending review
   - Complete review
   - Verify status changes to reviewed
   - Verify patient notification prompt

## Regulatory Compliance

### CLIA Requirements
- Complete specimen tracking
- Lab vendor CLIA number storage
- Quality control metrics
- Turnaround time reporting

### Meaningful Use
- Electronic result delivery
- Patient portal notification
- Structured data capture (ICD-10, SNOMED)
- Audit logging

### State Reporting
- Cancer registry integration (malignancies)
- Export capabilities for state requirements
- Melanoma reporting

## Future Enhancements

### Planned Features
1. **Electronic Lab Integration**
   - HL7 2.x result import
   - FHIR DiagnosticReport resources
   - Automatic status updates

2. **AI-Powered Features**
   - Auto-suggest ICD-10 from pathology text
   - Risk stratification
   - Follow-up reminder optimization

3. **Patient Portal**
   - Secure result viewing
   - Educational materials based on diagnosis
   - Self-scheduling for follow-up

4. **Advanced Analytics**
   - Provider performance metrics
   - Lab comparison analysis
   - Predictive modeling for malignancy risk

## Support

### Common Issues

**Overdue alerts not triggering?**
- Check trigger function is enabled
- Verify sent_at timestamp is set
- Run manual update query to force check

**Specimen ID conflicts?**
- Check tenant_id isolation
- Verify sequence counter
- Check for timezone issues in date calculation

**Print label not working?**
- Verify barcode library installed
- Check print styles in browser
- Try different paper size settings

## Contributors

Built for dermatology practices prioritizing patient safety and quality care.

**Key Safety Principle:** No biopsy should ever be lost or forgotten. Every malignancy must be caught, reviewed, and acted upon.
