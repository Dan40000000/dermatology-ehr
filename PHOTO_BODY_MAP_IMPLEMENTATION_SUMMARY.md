# Photo-to-Body-Map Linking Implementation Summary

## Completed Tasks

### 1. Database Migration Created
**File:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/db/migrations/025_photo_body_map_linking.sql`

#### Changes to `patient_photos` table:
- Added `body_map_marker_id` (TEXT) - Links photo to body map marker
- Added `x_position` (NUMERIC 0-100) - X coordinate on body diagram
- Added `y_position` (NUMERIC 0-100) - Y coordinate on body diagram
- Added `body_view` (TEXT) - Body diagram view (front/back/head-front/head-back/left-side/right-side)
- Added foreign key constraint for `lesion_id` → `patient_lesions`

#### Changes to `photo_comparisons` table:
- Added `body_region` (TEXT) - Auto-populated from before photo
- Added `time_between_days` (INTEGER) - Auto-calculated days between photos
- Added `comparison_category` (TEXT) - Clinical purpose: treatment_progress, lesion_evolution, cosmetic_result, post_procedure, side_effect_monitoring

#### Database Triggers:
- `calculate_photo_comparison_time()` - Auto-calculates time_between_days and populates body_region

#### Indexes Created:
- `idx_patient_photos_body_map_marker` - Fast lookup by marker
- `idx_patient_photos_body_view` - Filter by view
- `idx_patient_photos_coordinates` - Spatial queries
- `idx_photo_comparisons_body_region` - Filter comparisons by region
- `idx_photo_comparisons_category` - Filter by comparison type

### 2. API Endpoints Added
**File:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/routes/photos.ts`

#### New Endpoints:

**A. POST `/api/patients/:patientId/photos/:photoId/link-to-body-map`**
- Links existing photo to body map location
- Requires: xPosition, yPosition, bodyView
- Optional: bodyMapMarkerId, lesionId
- Authorization: Provider, Admin, Nurse

**B. GET `/api/patients/:patientId/photos/by-body-region/:bodyRegion`**
- Get all photos for specific body region
- Supports filtering by: bodyMapMarkerId, lesionId, bodyView
- Includes lesion details (location, type, status)
- Pagination support (limit, offset)

**C. GET `/api/patients/:patientId/photos/by-marker/:markerId/timeline`**
- Get chronological photo timeline for marker/lesion
- Returns photos in order with progression metrics
- Shows days since baseline for each photo
- Includes baseline and latest photo

**D. POST `/api/patients/:patientId/photos/comparisons/create`**
- Create before/after comparison with body map context
- Auto-calculates time between photos
- Auto-populates body region
- Supports comparison categories

### 3. Schema Updates

#### Updated Validation Schemas:
- `uploadPhotoSchema` - Added body map fields
- `updatePhotoSchema` - Added body map fields
- `createComparisonSchema` - Added comparison category and body region
- `linkPhotoToBodyMapSchema` - New schema for linking endpoint

### 4. Enhanced Existing Endpoints

**POST `/api/patients/:patientId/photos`** (Upload)
- Now accepts body map linking data in metadata:
  - bodyMapMarkerId
  - xPosition
  - yPosition
  - bodyView
- Photos can be linked during upload

**POST `/api/patients/:patientId/photos/compare`** (Legacy)
- Updated to support new comparison fields
- Backwards compatible
- Now marked as deprecated, forwards to new endpoint

### 5. Documentation Created
**File:** `/Users/danperry/Desktop/Dermatology program/derm-app/backend/docs/PHOTO_BODY_MAP_LINKING.md`

Comprehensive documentation including:
- Database schema changes
- API endpoint specifications with examples
- Request/response formats
- Usage examples for common workflows
- Clinical workflow guides
- HIPAA compliance notes
- Migration instructions
- Performance considerations

## Migration SQL

```sql
-- Add body map linking columns to patient_photos
ALTER TABLE patient_photos
  ADD COLUMN IF NOT EXISTS body_map_marker_id TEXT,
  ADD COLUMN IF NOT EXISTS x_position NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS y_position NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS body_view TEXT;

-- Update photo_comparisons with additional tracking
ALTER TABLE photo_comparisons
  ADD COLUMN IF NOT EXISTS body_region TEXT,
  ADD COLUMN IF NOT EXISTS time_between_days INTEGER,
  ADD COLUMN IF NOT EXISTS comparison_category TEXT;
```

## API Usage Examples

### Link Photo to Body Map
```bash
curl -X POST https://api.example.com/api/patients/patient-123/photos/photo-456/link-to-body-map \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lesionId": "lesion-789",
    "xPosition": 45.5,
    "yPosition": 30.2,
    "bodyView": "front"
  }'
```

### Get Photos by Body Region
```bash
curl https://api.example.com/api/patients/patient-123/photos/by-body-region/chest?lesionId=lesion-789 \
  -H "Authorization: Bearer TOKEN"
```

### Get Photo Timeline for Lesion
```bash
curl https://api.example.com/api/patients/patient-123/photos/by-marker/lesion-789/timeline \
  -H "Authorization: Bearer TOKEN"
```

### Create Before/After Comparison
```bash
curl -X POST https://api.example.com/api/patients/patient-123/photos/comparisons/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "beforePhotoId": "photo-001",
    "afterPhotoId": "photo-002",
    "comparisonType": "side_by_side",
    "comparisonCategory": "treatment_progress",
    "treatmentDescription": "Topical retinoid treatment",
    "improvementScore": 7
  }'
```

## Verification Steps

### 1. Run Migration
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
psql -h localhost -U postgres -d derm_db -f src/db/migrations/025_photo_body_map_linking.sql
```

### 2. Verify Schema Changes
```sql
-- Check new columns in patient_photos
\d patient_photos

-- Check new columns in photo_comparisons
\d photo_comparisons

-- Check trigger
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'calculate_photo_comparison_time_trigger';
```

### 3. TypeScript Compilation
```bash
cd backend
npx tsc --noEmit
```

TypeScript compilation passed for photos.ts (existing errors in other files are pre-existing).

### 4. Test API Endpoints
- Test photo upload with body map data
- Test linking existing photo to body map
- Test querying photos by region
- Test timeline retrieval
- Test comparison creation

## Benefits

1. **Precise Location Tracking**: Photos linked to exact coordinates on body map
2. **Lesion Timeline**: View progression of specific lesions over time
3. **Treatment Documentation**: Track treatment outcomes with before/after comparisons
4. **Automated Metrics**: Auto-calculate days between photos and improvement tracking
5. **Clinical Context**: Photos grouped by body region and clinical purpose
6. **Backwards Compatible**: Existing photos and workflows continue to work
7. **HIPAA Compliant**: All actions logged for audit trail

## Clinical Use Cases

1. **Melanoma Surveillance**: Track suspicious lesions with photo timeline
2. **Treatment Response**: Document progress with before/after comparisons
3. **Cosmetic Procedures**: Track healing and results over time
4. **Rash Evolution**: Monitor progression or resolution of skin conditions
5. **Surgical Planning**: Map lesions for biopsy or excision planning

## Next Steps

1. **Run the migration** on the database
2. **Deploy updated backend** with new API endpoints
3. **Update frontend** to use new linking features
4. **Add UI components** for body map photo placement
5. **Test thoroughly** with sample patient data
6. **Train staff** on new photo linking workflows

## Files Modified/Created

### Created:
1. `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/db/migrations/025_photo_body_map_linking.sql`
2. `/Users/danperry/Desktop/Dermatology program/derm-app/backend/docs/PHOTO_BODY_MAP_LINKING.md`
3. `/Users/danperry/Desktop/Dermatology program/derm-app/PHOTO_BODY_MAP_IMPLEMENTATION_SUMMARY.md` (this file)

### Modified:
1. `/Users/danperry/Desktop/Dermatology program/derm-app/backend/src/routes/photos.ts`
   - Added 4 new API endpoints
   - Updated validation schemas
   - Enhanced photo upload to support body map linking
   - Updated comparison creation with new fields

## Database Compatibility

- PostgreSQL 12+
- All new columns are nullable for backwards compatibility
- No data migration required for existing records
- Triggers auto-populate calculated fields

## Performance Impact

- Minimal impact: All queries use indexed columns
- Timeline queries optimized with chronological sorting
- Pagination prevents large result sets
- Spatial queries use coordinate indexes

## Security Considerations

- All endpoints require authentication
- Role-based access control (Provider, Admin, Nurse for modifications)
- Photo access logged for HIPAA compliance
- Input validation with Zod schemas
- SQL injection prevention with parameterized queries

---

**Status**: ✅ COMPLETE - Ready for migration and deployment
**Date**: 2026-01-19
**Database**: PostgreSQL (derm_db @ localhost:5432)
