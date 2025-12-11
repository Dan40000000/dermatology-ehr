# Photo Documentation Enhancement System

## Overview
Advanced photo documentation system for dermatology practice with professional-grade features including annotations, before/after comparisons, timeline tracking, and body map integration.

## Features Implemented

### 1. Database Schema Enhancements
**File:** `/backend/migrations/012_photo_enhancements.sql`

#### New Columns in `photos` table:
- `body_location` - Specific body location/region
- `lesion_id` - Reference to body map lesion
- `photo_type` - Type of photo (clinical, before, after, dermoscopy, baseline)
- `annotations` - JSONB storage for image annotations
- `comparison_group_id` - Groups photos for before/after comparisons
- `sequence_number` - Order within comparison group

#### New Table: `photo_comparison_groups`
Groups photos together for before/after timeline comparisons.

**Columns:**
- `id` - UUID primary key
- `tenant_id` - Tenant reference
- `patient_id` - Patient reference
- `name` - Group name
- `description` - Optional description
- `created_at`, `updated_at` - Timestamps

**Indexes:**
- Body location, lesion ID, photo type
- Comparison group ID
- Patient ID + date for timeline queries

### 2. Backend API Routes
**File:** `/backend/src/routes/photos.ts`

#### New Routes:

**PUT /api/photos/:id/annotate**
- Add/update annotations on photos
- Stores shapes (arrows, circles, rectangles, text) with positions and colors
- Body: `{ shapes: PhotoAnnotationShape[] }`

**PUT /api/photos/:id/body-location**
- Update photo body location
- Body: `{ bodyLocation: string }`

**POST /api/photos/comparison-group**
- Create comparison group
- Body: `{ patientId, name, description }`

**GET /api/photos/comparison-group/:id**
- Get comparison group with all photos
- Returns group metadata + photos array sorted by sequence

**GET /api/photos/patient/:patientId/timeline**
- Get all photos for patient in chronological order
- Used for timeline view

**Enhanced GET /api/photos**
- Added query parameters: `patientId`, `photoType`, `bodyLocation`
- Filter photos by multiple criteria

### 3. Frontend Components

#### PhotoAnnotator Component
**File:** `/frontend/src/components/clinical/PhotoAnnotator.tsx`

**Features:**
- Canvas-based drawing overlay
- Drawing tools: Arrow, Circle, Rectangle, Text
- Color picker for annotations
- Undo/Redo functionality
- Save/Cancel actions
- Read-only mode for historical photos
- Text annotation dialog

**Usage:**
```tsx
<PhotoAnnotator
  imageUrl={photoUrl}
  annotations={existingAnnotations}
  readOnly={false}
  onSave={(annotations) => handleSave(annotations)}
  onCancel={() => handleCancel()}
/>
```

#### PhotoComparison Component
**File:** `/frontend/src/components/clinical/PhotoComparison.tsx`

**Features:**
- Three view modes:
  1. Side-by-side comparison
  2. Slider overlay (drag to compare)
  3. Opacity overlay (adjustable transparency)
- Synchronized zoom and pan
- Timeline of all photos in series
- Before/After labels with dates

**Usage:**
```tsx
<PhotoComparison
  photos={[beforePhoto, afterPhoto]}
  getPhotoUrl={(photo) => getUrl(photo)}
/>
```

#### PhotoTimeline Component
**File:** `/frontend/src/components/clinical/PhotoTimeline.tsx`

**Features:**
- Chronological timeline view
- Group by: Date, Body Location, Photo Type
- Visual timeline with markers
- Photo cards with metadata
- Annotation indicators
- Click to view full details

**Usage:**
```tsx
<PhotoTimeline
  photos={patientPhotos}
  getPhotoUrl={(photo) => getUrl(photo)}
  onPhotoClick={(photo) => handleClick(photo)}
/>
```

### 4. Enhanced PhotosPage
**File:** `/frontend/src/pages/PhotosPage.tsx`

#### New View Modes:
- **Grid** - Traditional grid layout with checkboxes
- **List** - Detailed list view
- **Timeline** - Chronological timeline view
- **Comparison** - Side-by-side comparison mode

#### New Features:
- Photo selection for comparison (checkboxes)
- Annotate button in photo viewer
- Add to comparison action
- Photo type selector in upload form
- Annotation badges on thumbnails
- Compare counter in view toggle

#### Upload Enhancements:
- Photo type field (clinical, before, after, dermoscopy, baseline)
- Body location dropdown
- Description field
- Preview before upload

### 5. API Functions
**File:** `/frontend/src/api.ts`

#### New Functions:
```typescript
fetchPhotos(tenantId, accessToken, params?: {
  patientId?: string;
  photoType?: string;
  bodyLocation?: string;
})

fetchPhotoTimeline(tenantId, accessToken, patientId)

updatePhotoAnnotations(tenantId, accessToken, photoId, annotations)

updatePhotoBodyLocation(tenantId, accessToken, photoId, bodyLocation)

createComparisonGroup(tenantId, accessToken, data)

fetchComparisonGroup(tenantId, accessToken, groupId)
```

### 6. Type Definitions
**File:** `/frontend/src/types/index.ts`

#### New Types:
```typescript
type PhotoType = 'clinical' | 'before' | 'after' | 'dermoscopy' | 'baseline';

interface PhotoAnnotationShape {
  type: 'arrow' | 'circle' | 'rectangle' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  text?: string;
  thickness?: number;
}

interface PhotoAnnotations {
  shapes: PhotoAnnotationShape[];
}

interface PhotoComparisonGroup {
  id: string;
  tenantId: string;
  patientId: string;
  name: string;
  description?: string;
  photos?: Photo[];
}
```

### 7. Styling
**File:** `/frontend/src/styles/clinical-photos.css`

Comprehensive CSS for all new components including:
- Annotator toolbar and canvas
- Comparison view modes
- Timeline layout
- Photo selection states
- Responsive design

## Usage Guide

### Annotating Photos
1. Click on any photo to open viewer
2. Click "Annotate" button
3. Select drawing tool (Arrow, Circle, Rectangle, Text)
4. Choose color
5. Draw on image
6. Use Undo/Redo as needed
7. Click "Save Annotations"

### Creating Comparisons
1. Select multiple photos using checkboxes
2. Click "Compare (n)" button in view toggle
3. Choose view mode:
   - Side-by-side for quick comparison
   - Slider to overlay and drag
   - Overlay to adjust opacity
4. Use zoom controls for detailed examination

### Using Timeline View
1. Select "Timeline" view mode
2. Group by Date, Location, or Type
3. Click any photo to view details
4. Annotations are indicated with ✎ badge

### Before/After Documentation
1. Upload initial photo with type "Before"
2. Upload follow-up with type "After"
3. Select both photos
4. Switch to Comparison view
5. Document changes over time

## HIPAA Compliance Features

### Security Measures:
- Tenant isolation in database
- Authentication required for all photo operations
- Role-based access control (admin, provider, MA)
- Audit logging for photo access (via existing audit system)

### Data Protection:
- Photos stored with tenant ID
- Annotations stored as JSONB in database
- File storage supports both local and S3
- Object keys used for secure retrieval

### Recommendations:
1. Enable patient consent tracking for photo documentation
2. Implement watermarking with patient ID (configurable)
3. Generate thumbnails for web viewing (keep originals)
4. Compress images for performance
5. Add export controls for patient privacy
6. Implement photo access audit logs

## Database Migration

To apply the schema changes:

```bash
# Connect to database
psql -d dermatology

# Run migration
\i backend/migrations/012_photo_enhancements.sql
```

## Integration with Body Map

### Linking Photos to Lesions:
1. When creating/viewing lesion on body map
2. Attach photos via `lesion_id` field
3. Click lesion → view associated photos
4. Track lesion changes over time

### Workflow:
```
Body Map → Click Lesion → View Photos → Annotate → Compare
```

## Future Enhancements

### Potential Additions:
1. **Measurement Tools** - Calibrated distance/area measurements
2. **AI Analysis** - Automated lesion detection and classification
3. **PDF Export** - Generate comparison reports for patients
4. **Batch Upload** - Upload multiple photos with metadata
5. **EXIF Data** - Auto-extract camera metadata
6. **Dermoscopy Features** - Specialized tools for dermoscopic images
7. **3D Body Map** - Interactive 3D model integration
8. **Patient Portal** - Share photos with patients securely
9. **Teledermatology** - Remote consultation features
10. **Image Enhancement** - Auto-adjust brightness/contrast

## Performance Considerations

### Optimizations Implemented:
- Lazy loading images in grid view
- Canvas-based rendering for annotations
- Efficient JSONB queries for annotations
- Indexed searches on common filters

### Recommendations:
1. Implement thumbnail generation
2. Use CDN for photo delivery
3. Lazy load timeline groups
4. Cache comparison groups
5. Compress uploads automatically

## Support

For issues or questions regarding photo enhancements:
1. Check database migration applied correctly
2. Verify API routes are registered
3. Ensure CSS file is imported
4. Check browser console for errors
5. Review backend logs for API issues

## Version History

**Version 1.0.0** - Initial Implementation
- Photo annotations
- Before/after comparisons
- Timeline view
- Body map integration
- Enhanced upload workflow
