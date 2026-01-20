# Body Map → Biopsies → Photos Integration

## Overview

This integration creates a seamless clinical data chain for dermatology practice, connecting lesion tracking on body maps with biopsies and clinical photography. The system ensures that all clinical data flows together, providing a complete picture of each lesion's lifecycle.

## Clinical Workflow

### 1. Lesion Identification
- Provider marks lesion on interactive body map
- Lesion automatically assigned unique ID
- Initial documentation captured (location, type, concern level)

### 2. Clinical Documentation
- Photos can be captured/uploaded directly linked to the lesion
- Measurements tracked over time
- ABCDE scoring for melanoma risk assessment
- Complete timeline of all interactions

### 3. Biopsy Workflow
When a biopsy is needed:
- Order biopsy directly from lesion detail modal
- Location and clinical description pre-filled from lesion
- Biopsy automatically linked to lesion_id
- Unique specimen ID generated for tracking

### 4. Results Integration
When pathology results arrive:
- Results entered into biopsy record
- **Database trigger automatically updates linked lesion:**
  - Updates lesion diagnosis
  - Sets malignancy type if applicable
  - Changes lesion status (benign/malignant/treated)
  - Records biopsy date and result
- Lesion event created documenting the result
- Notifications sent to ordering provider

### 5. Follow-up Tracking
- Based on diagnosis, follow-up recommendations generated
- Photos provide before/after comparison for treatment efficacy
- Complete timeline shows progression from identification → diagnosis → treatment

## Database Architecture

### Tables and Relationships

```sql
lesions
  ├── id (PRIMARY KEY)
  ├── patient_id (FK → patients)
  ├── body_location
  ├── lesion_type
  ├── status (monitoring, suspicious, benign, malignant, treated, resolved)
  ├── latest_biopsy_id (FK → biopsies)
  ├── pathology_diagnosis
  └── malignancy_type

biopsies
  ├── id (PRIMARY KEY)
  ├── patient_id (FK → patients)
  ├── lesion_id (FK → lesions) -- CRITICAL LINK
  ├── specimen_id (UNIQUE)
  ├── pathology_diagnosis
  ├── malignancy_type
  └── status

photos
  ├── id (PRIMARY KEY)
  ├── patient_id (FK → patients)
  ├── lesion_id (FK → lesions) -- CRITICAL LINK
  ├── body_location
  ├── photo_type
  └── url/file_path
```

### Database Trigger (Automatic Updates)

The `update_lesion_on_biopsy_result()` trigger automatically:
1. Updates lesion when biopsy gets pathology diagnosis
2. Sets lesion status based on result (benign/malignant)
3. Links latest biopsy to lesion
4. Records diagnosis and malignancy type

```sql
-- Trigger fires when biopsy gets a diagnosis
CREATE TRIGGER trigger_update_lesion_on_biopsy_result
  AFTER UPDATE ON biopsies
  FOR EACH ROW
  WHEN (NEW.pathology_diagnosis IS NOT NULL AND OLD.pathology_diagnosis IS NULL)
  EXECUTE FUNCTION update_lesion_on_biopsy_result();
```

## API Endpoints

### Lesion Endpoints
- `GET /api/lesions/:id` - Get lesion details
- `GET /api/lesions/:id/biopsies` - Get all biopsies for lesion
- `GET /api/lesions/:id/photos` - Get all photos for lesion
- `GET /api/lesions/:id/timeline` - Get complete chronological timeline
- `PUT /api/lesions/:id/biopsy` - Record biopsy result (legacy)

### Biopsy Endpoints
- `POST /api/biopsies` - Create biopsy order (accepts lesion_id)
- `POST /api/biopsies/:id/result` - Add pathology result (triggers lesion update)
- `GET /api/biopsies?lesion_id=xxx` - Get biopsies by lesion

### Photo Endpoints
- `POST /api/patients/:patientId/photos` - Upload photos (accepts lesion_id in metadata)
- `GET /api/patients/:patientId/photos?lesion_id=xxx` - Get photos by lesion

## Frontend Components

### Core Components

#### 1. EnhancedLesionDetailModal
**Location:** `/frontend/src/components/BodyMap/EnhancedLesionDetailModal.tsx`

**Features:**
- Tabbed interface: Info | Biopsies | Photos | Comparison | Timeline
- Quick actions for ordering biopsy and taking photos
- Real-time display of pathology results
- Edit lesion details inline
- Delete lesion with confirmation

**Tabs:**
- **Info:** Basic lesion details, clinical notes, pathology results
- **Biopsies:** List of all biopsies with status, order new biopsy
- **Photos:** Photo gallery, add new photos
- **Comparison:** Before/after photo slider for tracking progression
- **Timeline:** Chronological history of all lesion events

#### 2. BiopsyFromLesion
**Location:** `/frontend/src/components/BodyMap/BiopsyFromLesion.tsx`

**Features:**
- Pre-filled with lesion location and description
- Automatic linking to lesion_id
- Complete biopsy order form
- Differential diagnosis management
- Provider and pathology lab selection

#### 3. PhotoFromLesion
**Location:** `/frontend/src/components/BodyMap/PhotoFromLesion.tsx`

**Features:**
- Camera capture or file upload
- Automatic linking to lesion_id
- Pre-filled body region from lesion
- Lighting and angle documentation

#### 4. LesionTimeline
**Location:** `/frontend/src/components/BodyMap/LesionTimeline.tsx`

**Features:**
- Chronological display of all events
- Icons and color coding by event type
- Shows: lesion creation, measurements, photos, biopsies, results
- Provider attribution for each event
- Summary statistics

#### 5. LesionPhotoComparison
**Location:** `/frontend/src/components/BodyMap/LesionPhotoComparison.tsx`

**Features:**
- Interactive slider for before/after comparison
- Side-by-side view
- Photo selection from timeline
- Days between photos calculated
- Useful for tracking treatment efficacy

## Usage Examples

### Example 1: Complete Lesion Workflow

```typescript
// 1. Provider clicks body map to create lesion
<BodyMap patientId={patientId} editable={true} />

// 2. Lesion modal opens automatically
// User fills in: location, type, description

// 3. Take baseline photo
// Click "Take Photo" → PhotoFromLesion component
// Photo automatically linked to lesion

// 4. Order biopsy
// Click "Order Biopsy" → BiopsyFromLesion component
// Location pre-filled, lesion_id automatically linked

// 5. When results arrive, enter into biopsy record
// POST /api/biopsies/:id/result
// Trigger automatically updates lesion status

// 6. View complete timeline
// Switch to Timeline tab
// See: creation → photo → biopsy → result
```

### Example 2: Updating Biopsy to use EnhancedModal

```typescript
// In BodyMap.tsx, replace LesionDetailModal with EnhancedLesionDetailModal

import { EnhancedLesionDetailModal } from './EnhancedLesionDetailModal';

// Then use it:
{showDetailModal && selectedLesion && (
  <EnhancedLesionDetailModal
    lesion={selectedLesion}
    onClose={() => {
      setShowDetailModal(false);
      setSelectedLesion(null);
    }}
    onUpdate={updateLesion}
    onDelete={deleteLesion}
  />
)}
```

## Database Migration

Run the migration to add necessary columns and triggers:

```bash
# Migration file: backend/migrations/058_lesion_integration.sql
# This adds:
# - lesion_id columns to biopsies and photos (if missing)
# - Automatic update trigger
# - Timeline function
# - Indexes for performance
```

## Key Features

### 1. Automatic Data Linking
- When biopsy created from lesion → lesion_id auto-populated
- When photo captured from lesion → lesion_id auto-populated
- No manual linking required

### 2. Bidirectional Updates
- Biopsy result → automatically updates lesion
- Lesion view → shows all linked biopsies and photos
- Complete clinical picture in one place

### 3. Timeline Integration
- Database function `get_lesion_timeline()` aggregates:
  - Lesion creation and updates
  - All measurements
  - All photos
  - All biopsies (ordered and resulted)
  - All lesion events
- Sorted chronologically
- Provider attribution

### 4. Photo Comparison
- Select any two photos for comparison
- Interactive slider to compare
- Useful for:
  - Treatment efficacy
  - Growth assessment
  - Documentation for insurance

### 5. Clinical Decision Support
- ABCDE scoring
- Concern level tracking
- Automatic status updates based on pathology
- Follow-up recommendations

## Patient Safety Features

1. **Specimen Tracking:** Every biopsy has unique specimen_id
2. **Chain of Custody:** Complete tracking via biopsy_specimen_tracking table
3. **Automatic Alerts:** Malignancy triggers immediate notification
4. **Overdue Tracking:** System identifies overdue results
5. **Complete Audit Trail:** All actions logged with timestamps and users

## Best Practices

### For Providers
1. Always document lesions on body map when identified
2. Take baseline photo before biopsy
3. Link biopsy to lesion for automatic tracking
4. Review pathology results promptly
5. Take follow-up photos for comparison

### For Staff
1. Ensure biopsy orders include lesion_id
2. Upload photos to correct lesion
3. Enter pathology results completely
4. Document patient notifications

### For Administrators
1. Monitor overdue biopsies dashboard
2. Review quality metrics regularly
3. Ensure providers are using body map feature
4. Train staff on photo documentation standards

## Future Enhancements

Potential additions:
- AI-assisted lesion classification from photos
- Automatic ABCDE scoring from images
- Dermoscopy integration
- Teledermatology consult requests
- Patient portal access to lesion tracking
- Automated follow-up scheduling based on diagnosis
- Integration with cancer registry for malignancies

## Technical Notes

### Performance
- Database views for efficient queries
- Indexes on lesion_id foreign keys
- Lazy loading of photos/biopsies in modal
- Thumbnail generation for faster display

### Security
- All endpoints require authentication
- Tenant isolation enforced
- Photo access logged (HIPAA compliance)
- Role-based access control for sensitive operations

### Data Integrity
- Foreign key constraints prevent orphaned records
- Triggers ensure data consistency
- Soft deletes preserve audit trail
- Transaction management for complex operations

## Support

For questions or issues:
1. Check this documentation
2. Review component source code
3. Check API endpoint documentation
4. Contact development team

## Version History

- v1.0 (2026-01-19): Initial integration
  - Body map to biopsy linking
  - Photo to lesion linking
  - Automatic pathology result updates
  - Timeline view
  - Photo comparison feature
