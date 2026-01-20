# Photo-to-Body-Map Linking Feature

## Overview

This feature enables linking clinical photos to specific body map locations, lesions, and markers for comprehensive visual tracking of dermatological conditions over time.

## Database Changes

### Migration: `025_photo_body_map_linking.sql`

#### Changes to `patient_photos` Table

New columns added:
- `body_map_marker_id` (TEXT): Reference to body map marker ID
- `x_position` (NUMERIC 0-100): X coordinate on body diagram view
- `y_position` (NUMERIC 0-100): Y coordinate on body diagram view
- `body_view` (TEXT): Which view of body diagram (front, back, head-front, head-back, left-side, right-side)

The existing `lesion_id` column now has a proper foreign key constraint to `patient_lesions` table.

#### Changes to `photo_comparisons` Table

New columns added:
- `body_region` (TEXT): Anatomical region being compared (auto-populated from before photo)
- `time_between_days` (INTEGER): Number of days between photos (auto-calculated)
- `comparison_category` (TEXT): Clinical purpose of comparison
  - Values: `treatment_progress`, `lesion_evolution`, `cosmetic_result`, `post_procedure`, `side_effect_monitoring`

#### Triggers

**`calculate_photo_comparison_time()`**: Automatically calculates:
- `time_between_days` from photo timestamps
- `days_between` for backwards compatibility
- `body_region` from before photo if not specified

## API Endpoints

### 1. Link Photo to Body Map

**POST** `/api/patients/:patientId/photos/:photoId/link-to-body-map`

Links a photo to a specific location on the body map with coordinates.

**Request Body:**
```json
{
  "bodyMapMarkerId": "marker-123",  // Optional
  "lesionId": "lesion-456",          // Optional
  "xPosition": 45.5,                 // Required: 0-100
  "yPosition": 30.2,                 // Required: 0-100
  "bodyView": "front"                // Required: front|back|head-front|head-back|left-side|right-side
}
```

**Response:**
```json
{
  "id": "photo-789",
  "patient_id": "patient-123",
  "body_map_marker_id": "marker-123",
  "lesion_id": "lesion-456",
  "x_position": 45.5,
  "y_position": 30.2,
  "body_view": "front",
  "body_region": "chest",
  ...
}
```

**Authorization:** Provider, Admin, Nurse roles required

---

### 2. Get Photos by Body Region

**GET** `/api/patients/:patientId/photos/by-body-region/:bodyRegion`

Retrieves all photos for a specific body region with optional filtering.

**Query Parameters:**
- `bodyMapMarkerId` (string, optional): Filter by specific marker
- `lesionId` (string, optional): Filter by specific lesion
- `bodyView` (string, optional): Filter by view (front/back/etc.)
- `limit` (number, default: 50): Number of results
- `offset` (number, default: 0): Pagination offset

**Response:**
```json
{
  "bodyRegion": "chest",
  "photos": [
    {
      "id": "photo-789",
      "patient_id": "patient-123",
      "body_region": "chest",
      "body_view": "front",
      "x_position": 45.5,
      "y_position": 30.2,
      "taken_at": "2024-01-15T10:30:00Z",
      "lesion_location": "Upper Chest",
      "lesion_type": "nevus",
      "lesion_status": "monitoring",
      ...
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

---

### 3. Get Photo Timeline for Marker/Lesion

**GET** `/api/patients/:patientId/photos/by-marker/:markerId/timeline`

Retrieves chronological timeline of photos for a specific body map marker or lesion.

**Response:**
```json
{
  "markerId": "lesion-456",
  "patientId": "patient-123",
  "timeline": [
    {
      "id": "photo-001",
      "taken_at": "2024-01-15T10:30:00Z",
      "anatomical_location": "Upper Chest",
      "lesion_type": "nevus",
      "lesion_status": "monitoring",
      "current_lesion_size": 4.5,
      "progression_metrics": {
        "sequence_number": 1,
        "days_since_baseline": 0
      },
      ...
    },
    {
      "id": "photo-002",
      "taken_at": "2024-02-15T11:00:00Z",
      "progression_metrics": {
        "sequence_number": 2,
        "days_since_baseline": 31
      },
      ...
    }
  ],
  "count": 2,
  "baseline_photo": { ... },
  "latest_photo": { ... }
}
```

---

### 4. Create Before/After Comparison

**POST** `/api/patients/:patientId/photos/comparisons/create`

Creates a before/after comparison with body map context.

**Request Body:**
```json
{
  "beforePhotoId": "photo-001",
  "afterPhotoId": "photo-002",
  "comparisonType": "side_by_side",  // side_by_side|slider|overlay
  "comparisonCategory": "treatment_progress",  // Optional
  "bodyRegion": "chest",  // Optional (auto-populated from before photo)
  "treatmentDescription": "Topical retinoid treatment",  // Optional
  "treatmentStartDate": "2024-01-15",  // Optional
  "treatmentEndDate": "2024-02-15",  // Optional
  "improvementScore": 7,  // Optional: 0-10
  "improvementNotes": "Significant improvement in texture",  // Optional
  "notes": "Patient reports reduced irritation"  // Optional
}
```

**Response:**
```json
{
  "id": "comparison-123",
  "tenant_id": "tenant-1",
  "patient_id": "patient-123",
  "before_photo_id": "photo-001",
  "after_photo_id": "photo-002",
  "comparison_image_path": "/path/to/comparison.jpg",
  "comparison_type": "side_by_side",
  "comparison_category": "treatment_progress",
  "body_region": "chest",
  "time_between_days": 31,
  "days_between": 31,
  "treatment_description": "Topical retinoid treatment",
  "improvement_score": 7,
  "created_at": "2024-02-15T12:00:00Z",
  ...
}
```

**Authorization:** Provider, Admin, Nurse roles required

---

### 5. Upload Photo with Body Map Data (Enhanced)

**POST** `/api/patients/:patientId/photos`

The existing upload endpoint now supports body map linking fields in metadata.

**Form Data:**
- `photos`: File(s) to upload (max 10)
- `metadata`: JSON string with photo metadata

**Metadata JSON (new fields):**
```json
{
  "patientId": "patient-123",
  "bodyRegion": "chest",
  "photoType": "clinical",
  "bodyMapMarkerId": "marker-123",  // NEW
  "lesionId": "lesion-456",         // NEW
  "xPosition": 45.5,                // NEW
  "yPosition": 30.2,                // NEW
  "bodyView": "front",              // NEW
  "notes": "Baseline photo",
  "isBaseline": true,
  ...
}
```

---

## Usage Examples

### Example 1: Upload Photo and Link to Lesion

```javascript
// Step 1: Upload photo with body map data
const formData = new FormData();
formData.append('photos', photoFile);
formData.append('metadata', JSON.stringify({
  patientId: 'patient-123',
  lesionId: 'lesion-456',
  bodyRegion: 'chest',
  bodyView: 'front',
  xPosition: 45.5,
  yPosition: 30.2,
  photoType: 'clinical',
  isBaseline: true,
  notes: 'Baseline photo of suspicious nevus'
}));

const response = await fetch('/api/patients/patient-123/photos', {
  method: 'POST',
  body: formData,
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Example 2: Get Timeline for Lesion Monitoring

```javascript
// Get all photos for a specific lesion over time
const timeline = await fetch(
  '/api/patients/patient-123/photos/by-marker/lesion-456/timeline',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const data = await timeline.json();
// data.timeline contains chronological photos with progression metrics
```

### Example 3: Create Treatment Progress Comparison

```javascript
// Create before/after comparison for treatment tracking
const comparison = await fetch(
  '/api/patients/patient-123/photos/comparisons/create',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      beforePhotoId: 'baseline-photo-id',
      afterPhotoId: 'followup-photo-id',
      comparisonType: 'side_by_side',
      comparisonCategory: 'treatment_progress',
      treatmentDescription: 'Laser therapy for acne scars',
      improvementScore: 8,
      improvementNotes: 'Significant reduction in scarring'
    })
  }
);
```

### Example 4: Get All Photos for Body Region

```javascript
// Get all chest photos for a patient
const photos = await fetch(
  '/api/patients/patient-123/photos/by-body-region/chest?bodyView=front&limit=20',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const data = await photos.json();
// data.photos contains all chest photos with lesion info
```

## Data Flow

```
1. Photo Upload
   └─> Patient Photo Created
       └─> Linked to Lesion (if lesionId provided)
       └─> Positioned on Body Map (x, y coordinates)
       └─> Associated with Body View (front/back/etc.)

2. Timeline Tracking
   └─> Query photos by marker/lesion
       └─> Returns chronological sequence
       └─> Includes progression metrics
       └─> Shows days since baseline

3. Comparison Creation
   └─> Select Before/After Photos
       └─> Auto-calculate time between
       └─> Auto-populate body region
       └─> Generate comparison image
       └─> Track improvement score
```

## Clinical Workflows

### Workflow 1: Lesion Monitoring
1. Mark lesion on body map → Get lesion ID
2. Take initial photo → Link to lesion with coordinates
3. Follow-up visits → Take additional photos linked to same lesion
4. View timeline → See progression over time
5. Create comparisons → Document changes

### Workflow 2: Treatment Progress
1. Take baseline photo → Mark as `isBaseline: true`
2. Begin treatment → Record treatment details
3. Follow-up photos → Link to same body region/marker
4. Create comparison → Track improvement with score
5. Generate report → Include timeline and comparisons

### Workflow 3: Cosmetic Procedures
1. Pre-procedure photo → Link to treatment area
2. Immediate post-procedure → Same coordinates
3. Healing progression → Regular photos at same location
4. Final result → Compare with baseline
5. Patient sharing → Mark photos for portal access

## HIPAA Compliance

All photo access is logged in `photo_access_log` table:
- User ID and action (uploaded, viewed, linked_to_body_map, etc.)
- IP address and user agent
- Timestamp

When linking photos to body map:
- Action logged as `linked_to_body_map`
- Maintains full audit trail

## Performance Considerations

### Indexes Created
- `idx_patient_photos_body_map_marker`: Fast lookup by marker
- `idx_patient_photos_body_view`: Filter by view
- `idx_patient_photos_coordinates`: Spatial queries by position
- `idx_photo_comparisons_body_region`: Filter comparisons by region
- `idx_photo_comparisons_category`: Filter by comparison type

### Query Optimization
- Timeline queries use ASC sort for chronological display
- Joins with lesion data only when needed
- Pagination supported on all list endpoints

## Migration Instructions

1. **Backup Database:**
   ```bash
   pg_dump -h localhost -U postgres derm_db > backup_before_photo_linking.sql
   ```

2. **Run Migration:**
   ```bash
   psql -h localhost -U postgres -d derm_db -f backend/src/db/migrations/025_photo_body_map_linking.sql
   ```

3. **Verify Migration:**
   ```sql
   -- Check new columns exist
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'patient_photos'
   AND column_name IN ('body_map_marker_id', 'x_position', 'y_position', 'body_view');

   -- Check trigger exists
   SELECT trigger_name FROM information_schema.triggers
   WHERE event_object_table = 'photo_comparisons'
   AND trigger_name = 'calculate_photo_comparison_time_trigger';
   ```

4. **Deploy Updated API:**
   ```bash
   cd backend
   npm run build
   pm2 restart derm-api
   ```

## Backwards Compatibility

- Existing photos work without body map linking (all new fields nullable)
- Legacy `/photos/compare` endpoint still works, forwards to new endpoint
- Old comparison records still queryable with new fields as NULL
- No data migration required for existing photos

## Future Enhancements

- AI-powered lesion size tracking from photos
- Automatic lesion detection and coordinate suggestion
- 3D body map visualization with photo overlays
- Dermoscopy image integration
- Photo quality scoring and recommendations
- Batch photo upload with auto-linking
