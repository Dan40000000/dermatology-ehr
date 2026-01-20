# Migration Guide: Patient Profile Integration

## Quick Start (5 Minutes)

### Option 1: Use New Page Alongside Old One (Recommended for Testing)

1. **Update your router** to add the new enhanced page:

```typescript
// In frontend/src/App.tsx or your router configuration
import { PatientDetailPageEnhanced } from './pages/PatientDetailPageEnhanced';

// Add new route (keep old one for comparison)
<Route path="/patients/:patientId/enhanced" element={<PatientDetailPageEnhanced />} />
```

2. **Test the new page**:
   - Navigate to `/patients/[any-patient-id]/enhanced`
   - Test all tabs and functionality
   - Compare with original page

3. **Once satisfied, replace the old route**:

```typescript
// Replace old route
<Route path="/patients/:patientId" element={<PatientDetailPageEnhanced />} />
```

### Option 2: Direct Replacement

**⚠️ Warning**: This replaces your existing patient detail page immediately.

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/frontend/src/pages

# Backup original
cp PatientDetailPage.tsx PatientDetailPage.tsx.backup

# Replace with new version
cp PatientDetailPageEnhanced.tsx PatientDetailPage.tsx
```

Then update any imports in your router if needed.

## Backend Changes

**✅ No action needed!**

The backend endpoints have been added to the existing `patients.ts` router and are automatically available. The new endpoints don't conflict with existing ones.

## Verification Steps

### 1. Backend Verification

Start your backend server and check these endpoints work:

```bash
# Test with curl (replace with actual values)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     http://localhost:3000/api/patients/PATIENT_ID/appointments

curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     http://localhost:3000/api/patients/PATIENT_ID/prescriptions

# etc.
```

Expected: JSON responses with patient data

### 2. Frontend Verification

1. **Check imports compile**:
```bash
cd frontend
npm run build
```

2. **Start dev server**:
```bash
npm run dev
```

3. **Navigate to patient profile**:
   - Go to `/patients`
   - Click on any patient
   - You should see the new enhanced layout

4. **Test each tab**:
   - Overview ✓
   - Appointments ✓
   - Encounters ✓
   - Insurance ✓
   - Medications ✓
   - Balance ✓
   - Prior Auths ✓
   - Biopsies ✓
   - Photos ✓
   - Body Map ✓

### 3. Browser Console Check

Open DevTools → Console. You should see:
- ✅ No red errors
- ✅ Successful API calls (200 status)
- ✅ React Query cache entries

## Common Issues & Solutions

### Issue: "Cannot find module '@tanstack/react-query'"

**Solution**: Install React Query (should already be in package.json)
```bash
cd frontend
npm install @tanstack/react-query
```

### Issue: 404 on API endpoints

**Solution**: Restart backend server to load new routes
```bash
cd backend
npm run dev
```

### Issue: Components not loading

**Solution**: Check component exports
```typescript
// In frontend/src/components/patient/index.ts
// Ensure all exports are present
```

### Issue: "Patient not found" on all patients

**Solutions**:
1. Check authentication token is valid
2. Verify tenant ID header is being sent
3. Check patient ID is valid UUID format
4. Verify database has patient records

### Issue: Photos/Images not displaying

**Solutions**:
1. Check photo URLs are absolute (not relative)
2. Verify image files exist in upload directory
3. Check CORS settings if images on different domain
4. Verify presigned URLs haven't expired (if using S3)

### Issue: Blank tab content

**Solutions**:
1. Check browser console for errors
2. Verify patient ID is being passed correctly
3. Check React Query DevTools for failed queries
4. Ensure backend endpoints return valid JSON

## Rollback Procedure

If you need to revert to the old page:

### If using Option 1 (Side-by-side):
Just remove the new route from your router.

### If using Option 2 (Direct replacement):

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/frontend/src/pages

# Restore backup
cp PatientDetailPage.tsx.backup PatientDetailPage.tsx

# Restart dev server
```

## Database Migrations

**✅ No migrations needed!**

All new endpoints use existing database tables:
- `appointments`
- `encounters`
- `prescriptions`
- `prior_auths`
- `biopsies`
- `patient_payments`
- `photos`
- `lesions`
- `insurance_eligibility`

## Performance Monitoring

### Before Migration:
Note these metrics for comparison:
- Page load time
- Number of API calls on page load
- Memory usage

### After Migration:
Monitor:
- Initial load should be similar or faster (React Query caching)
- Subsequent tab switches should be instant (cached)
- Total API calls may increase but spread over time (lazy loading)

### React Query DevTools

Add DevTools for monitoring (dev only):

```typescript
// In frontend/src/main.tsx or App.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Add inside QueryClientProvider
<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Tested all tabs with real patient data
- [ ] Verified navigation works to all linked pages
- [ ] Checked error states display properly
- [ ] Tested with slow network (throttle in DevTools)
- [ ] Verified empty states show correctly
- [ ] Tested with patients having:
  - [ ] No appointments
  - [ ] No encounters
  - [ ] No prescriptions
  - [ ] No photos
  - [ ] No biopsies
- [ ] Checked mobile responsiveness
- [ ] Verified print layout (if needed)
- [ ] Tested with different user roles/permissions
- [ ] Cleared browser cache and retested
- [ ] Load tested backend endpoints
- [ ] Checked query performance on large datasets

## Post-Deployment Monitoring

Watch for:
1. **API Errors**: Monitor error rates on new endpoints
2. **Performance**: Track response times
3. **User Feedback**: Gather feedback on new layout
4. **Database Load**: Monitor query performance
5. **Cache Hit Rates**: Check React Query cache effectiveness

## Support & Troubleshooting

### Enable Debug Mode

Add to your component for detailed logging:

```typescript
const { data, isLoading, error, isFetching } = useQuery({
  queryKey: ['patient-appointments', patientId],
  queryFn: () => fetchPatientAppointments(session!.tenantId, session!.accessToken, patientId),
  enabled: !!session && !!patientId,
  // Add these for debugging:
  onSuccess: (data) => console.log('Appointments loaded:', data),
  onError: (err) => console.error('Failed to load appointments:', err),
});
```

### Check Backend Logs

```bash
cd backend
# Check for errors in terminal where server is running
# Look for 500 errors or database query failures
```

### Network Tab Inspection

In Chrome DevTools → Network:
1. Filter by "Fetch/XHR"
2. Look for red (failed) requests
3. Check request headers (Auth token, Tenant ID)
4. Verify response format

## Getting Help

If you encounter issues:

1. **Check this guide** for common solutions
2. **Review browser console** for error messages
3. **Check backend logs** for API errors
4. **Verify data exists** in database tables
5. **Test with sample patient** that has complete data

## Timeline Estimate

- **Setup & Testing**: 30 minutes
- **User Acceptance Testing**: 1-2 hours
- **Production Deployment**: 15 minutes
- **Post-deployment Monitoring**: 24 hours

**Total**: Plan for half-day rollout with monitoring

---

**Questions?** Review PATIENT_PROFILE_INTEGRATION.md for detailed implementation docs.
