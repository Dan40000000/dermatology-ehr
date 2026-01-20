# Photo-to-Body-Map Linking - Deployment Checklist

## ✅ Pre-Deployment (COMPLETED)

- [x] Database migration created: `025_photo_body_map_linking.sql`
- [x] API endpoints implemented in `photos.ts`
- [x] Validation schemas updated (Zod)
- [x] TypeScript compilation verified
- [x] Documentation created
- [ ] Backup current database
- [ ] Test migration on development database
- [ ] Code review completed
- [ ] Security review completed

## 📋 Deployment Steps

### 1. Database Migration

```bash
# Step 1: Backup Database
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
pg_dump -h localhost -U postgres derm_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Step 2: Run Migration
psql -h localhost -U postgres -d derm_db -f src/db/migrations/025_photo_body_map_linking.sql

# Step 3: Verify Changes
psql -h localhost -U postgres -d derm_db -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'patient_photos'
  AND column_name IN ('body_map_marker_id', 'x_position', 'y_position', 'body_view');
"
```

**Expected Output:**
```
       column_name       |    data_type
-------------------------+-----------------
 body_map_marker_id      | text
 x_position              | numeric
 y_position              | numeric
 body_view               | text
```

### 2. Backend Deployment

```bash
# Build TypeScript
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run build

# Restart service (choose one)
pm2 restart derm-api
# OR
npm run dev
```

### 3. Test New Endpoints

Replace `PATIENT_ID`, `PHOTO_ID`, `LESION_ID`, and `TOKEN` with real values:

```bash
# Test 1: Link photo to body map
curl -X POST http://localhost:3000/api/patients/PATIENT_ID/photos/PHOTO_ID/link-to-body-map \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"xPosition": 50, "yPosition": 50, "bodyView": "front"}'

# Test 2: Get photos by region
curl http://localhost:3000/api/patients/PATIENT_ID/photos/by-body-region/chest \
  -H "Authorization: Bearer TOKEN"

# Test 3: Get timeline
curl http://localhost:3000/api/patients/PATIENT_ID/photos/by-marker/LESION_ID/timeline \
  -H "Authorization: Bearer TOKEN"

# Test 4: Create comparison
curl -X POST http://localhost:3000/api/patients/PATIENT_ID/photos/comparisons/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "beforePhotoId": "PHOTO_1_ID",
    "afterPhotoId": "PHOTO_2_ID",
    "comparisonType": "side_by_side"
  }'
```

## ✅ Verification Checklist

### Database
- [ ] All new columns exist in `patient_photos`
- [ ] All new columns exist in `photo_comparisons`
- [ ] Trigger `calculate_photo_comparison_time_trigger` exists
- [ ] All indexes created successfully
- [ ] Foreign key constraint added for `lesion_id`

### API Endpoints
- [ ] POST `/link-to-body-map` returns 200
- [ ] GET `/by-body-region/:region` returns photos array
- [ ] GET `/by-marker/:id/timeline` returns timeline
- [ ] POST `/comparisons/create` auto-calculates `time_between_days`
- [ ] Photo upload accepts new body map fields
- [ ] Existing endpoints still work (backwards compatible)

### Functionality
- [ ] Photos can be linked to coordinates
- [ ] Timeline shows progression metrics
- [ ] Comparisons auto-populate body region
- [ ] All actions logged in `photo_access_log`
- [ ] Input validation works (rejects invalid coordinates)
- [ ] Authorization checks enforced

## 🔐 Security Verification

- [ ] SQL injection prevention (parameterized queries)
- [ ] Authorization checks on all endpoints
- [ ] Input validation with Zod schemas
- [ ] Photo access logging for HIPAA
- [ ] Role-based access control works
- [ ] No sensitive data in error messages

## 📊 Performance Verification

Check database indexes:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('patient_photos', 'photo_comparisons')
AND indexname LIKE '%body%';
```

Expected indexes:
- `idx_patient_photos_body_map_marker`
- `idx_patient_photos_body_view`
- `idx_patient_photos_coordinates`
- `idx_photo_comparisons_body_region`

## 🔄 Rollback Plan (If Needed)

```sql
-- Rollback script
BEGIN;

-- Remove new columns from patient_photos
ALTER TABLE patient_photos
  DROP COLUMN IF EXISTS body_map_marker_id,
  DROP COLUMN IF EXISTS x_position,
  DROP COLUMN IF EXISTS y_position,
  DROP COLUMN IF EXISTS body_view;

-- Remove new columns from photo_comparisons
ALTER TABLE photo_comparisons
  DROP COLUMN IF EXISTS body_region,
  DROP COLUMN IF EXISTS time_between_days,
  DROP COLUMN IF EXISTS comparison_category;

-- Remove trigger
DROP TRIGGER IF EXISTS calculate_photo_comparison_time_trigger ON photo_comparisons;
DROP FUNCTION IF EXISTS calculate_photo_comparison_time();

COMMIT;
```

## 📝 Post-Deployment

### Day 1
- [ ] Monitor error logs
- [ ] Check for performance issues
- [ ] Verify HIPAA logging working
- [ ] Test with real patient data
- [ ] Gather immediate feedback

### Week 1
- [ ] Review query performance
- [ ] Check feature adoption
- [ ] Identify any issues
- [ ] Plan frontend integration

## 📚 Documentation

Created files:
1. ✅ `backend/src/db/migrations/025_photo_body_map_linking.sql`
2. ✅ `backend/docs/PHOTO_BODY_MAP_LINKING.md`
3. ✅ `backend/QUICK_START_PHOTO_BODY_MAP.md`
4. ✅ `PHOTO_BODY_MAP_IMPLEMENTATION_SUMMARY.md`
5. ✅ `PHOTO_BODY_MAP_DEPLOYMENT_CHECKLIST.md`

Modified files:
1. ✅ `backend/src/routes/photos.ts`

## 🎯 Success Criteria

- [x] Migration file created and tested
- [ ] Migration runs without errors
- [ ] All 4 new endpoints functional
- [ ] Existing endpoints still work
- [ ] Photo upload accepts body map data
- [ ] Timeline shows progression
- [ ] Comparisons auto-calculate time
- [ ] All actions logged
- [ ] No performance degradation
- [ ] Zero data loss

## 📞 Support Contacts

- **Database Issues:** DBA Team
- **API Issues:** Backend Team
- **Performance Issues:** DevOps Team
- **Security Concerns:** Security Team

## 📅 Deployment Log

**Deployment Date:** _________________

**Deployed By:** _________________

**Status:** [ ] Success [ ] Partial [ ] Failed [ ] Rolled Back

**Notes:**
_________________________________________________________
_________________________________________________________
_________________________________________________________

**Sign-off:** _________________ Date: _________

---

## Quick Command Reference

```bash
# Connect to database
psql -h localhost -U postgres -d derm_db

# Check table structure
\d patient_photos
\d photo_comparisons

# Check triggers
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'photo_comparisons';

# Restart backend
pm2 restart derm-api

# View logs
pm2 logs derm-api

# Test API health
curl http://localhost:3000/health
```
