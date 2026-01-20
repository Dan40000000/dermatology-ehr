# Quick Start: Photo-to-Body-Map Linking

## 1. Run Database Migration

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
psql -h localhost -U postgres -d derm_db -f src/db/migrations/025_photo_body_map_linking.sql
```

## 2. Verify Migration

```sql
-- Connect to database
psql -h localhost -U postgres -d derm_db

-- Check new columns
\d patient_photos
\d photo_comparisons

-- Should see:
-- patient_photos: body_map_marker_id, x_position, y_position, body_view
-- photo_comparisons: body_region, time_between_days, comparison_category
```

## 3. Restart Backend (if running)

```bash
cd backend
npm run build
pm2 restart derm-api
# OR
npm run dev
```

## 4. Test New Endpoints

### A. Link Photo to Body Map
```bash
curl -X POST http://localhost:3000/api/patients/PATIENT_ID/photos/PHOTO_ID/link-to-body-map \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "xPosition": 45.5,
    "yPosition": 30.2,
    "bodyView": "front",
    "lesionId": "LESION_ID"
  }'
```

### B. Get Photos by Body Region
```bash
curl http://localhost:3000/api/patients/PATIENT_ID/photos/by-body-region/chest \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### C. Get Photo Timeline
```bash
curl http://localhost:3000/api/patients/PATIENT_ID/photos/by-marker/LESION_ID/timeline \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### D. Create Comparison
```bash
curl -X POST http://localhost:3000/api/patients/PATIENT_ID/photos/comparisons/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "beforePhotoId": "PHOTO_1_ID",
    "afterPhotoId": "PHOTO_2_ID",
    "comparisonType": "side_by_side",
    "comparisonCategory": "treatment_progress",
    "improvementScore": 7
  }'
```

## 5. New API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/patients/:patientId/photos/:photoId/link-to-body-map` | Link photo to body map |
| GET | `/api/patients/:patientId/photos/by-body-region/:bodyRegion` | Get photos by region |
| GET | `/api/patients/:patientId/photos/by-marker/:markerId/timeline` | Get photo timeline |
| POST | `/api/patients/:patientId/photos/comparisons/create` | Create comparison |

## 6. Upload Photo with Body Map Data

When uploading photos, include body map data in metadata:

```javascript
const formData = new FormData();
formData.append('photos', photoFile);
formData.append('metadata', JSON.stringify({
  patientId: 'patient-123',
  bodyRegion: 'chest',
  bodyView: 'front',
  xPosition: 45.5,
  yPosition: 30.2,
  lesionId: 'lesion-456',  // Optional
  photoType: 'clinical',
  isBaseline: true,
  notes: 'Baseline photo'
}));

await fetch('/api/patients/patient-123/photos', {
  method: 'POST',
  body: formData
});
```

## 7. Required Fields for Body Map Linking

- `xPosition`: 0-100 (percentage on body diagram)
- `yPosition`: 0-100 (percentage on body diagram)
- `bodyView`: "front" | "back" | "head-front" | "head-back" | "left-side" | "right-side"

Optional:
- `bodyMapMarkerId`: Custom marker ID
- `lesionId`: Link to patient_lesions table

## 8. Comparison Categories

- `treatment_progress`: Track treatment outcomes
- `lesion_evolution`: Monitor lesion changes
- `cosmetic_result`: Document cosmetic procedures
- `post_procedure`: Post-surgical healing
- `side_effect_monitoring`: Track medication side effects

## 9. Common Workflows

### Track Lesion Over Time
1. Mark lesion on body map → Get lesion_id
2. Upload initial photo with lesion_id and coordinates
3. Take follow-up photos with same lesion_id
4. View timeline: GET `/by-marker/:lesionId/timeline`
5. Create comparison between first and latest

### Document Treatment Progress
1. Upload baseline photo (isBaseline: true)
2. Begin treatment
3. Upload follow-up photos to same body region
4. Create comparison with category "treatment_progress"
5. Add improvement score (0-10)

## 10. Documentation

Full documentation: `/Users/danperry/Desktop/Dermatology program/derm-app/backend/docs/PHOTO_BODY_MAP_LINKING.md`

## Troubleshooting

### Migration fails
- Check PostgreSQL is running: `pg_isready -h localhost`
- Verify database exists: `psql -h localhost -U postgres -l | grep derm_db`
- Check for existing columns: `\d patient_photos`

### TypeScript errors
- Run: `cd backend && npm run build`
- Ignore pre-existing import errors (tsconfig issue)
- Check for syntax errors only in photos.ts

### API returns 404
- Verify backend is running
- Check authorization token is valid
- Ensure patient/photo IDs exist in database

### Photo not linking
- Verify lesion_id exists in patient_lesions table
- Check coordinates are 0-100 range
- Ensure bodyView is valid enum value

## Support

For questions or issues, refer to:
- Implementation summary: `PHOTO_BODY_MAP_IMPLEMENTATION_SUMMARY.md`
- Full docs: `backend/docs/PHOTO_BODY_MAP_LINKING.md`
- Migration file: `backend/src/db/migrations/025_photo_body_map_linking.sql`
- API routes: `backend/src/routes/photos.ts`
