# Body Map - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Run Database Migration

```bash
cd backend
npm run migrate
```

This creates the `patient_lesions` and `lesion_observations` tables.

### Step 2: Import the Component

```typescript
import { BodyMap } from '@/components/BodyMap/BodyMap';

function PatientChart({ patientId }: { patientId: string }) {
  return (
    <div>
      <h1>Patient Lesion Tracking</h1>
      <BodyMap
        patientId={patientId}
        editable={true}
        showSidebar={true}
      />
    </div>
  );
}
```

### Step 3: Start Using It!

That's it! The body map is now fully functional.

## 📝 Common Tasks

### Adding a Lesion

1. Click anywhere on the body diagram
2. A modal will open
3. Fill in the details:
   - Location (auto-detected from click)
   - Type (nevus, cyst, melanoma, etc.)
   - Status (monitoring, suspicious, benign, malignant)
   - Size in mm
   - Color, border characteristics
   - Clinical notes
4. Click Save

### Viewing Lesion Details

1. Click on any existing marker
2. Detail modal opens with tabs:
   - **Details**: All lesion properties
   - **History**: Observation timeline
   - **Photos**: Photo comparison
   - **Biopsy**: Pathology results

### Adding an Observation

1. Click on a lesion marker
2. Go to "History" tab
3. Fill in observation form:
   - Date
   - Current size
   - Notes
4. Click "Add Observation"

### Filtering Lesions

Use the sidebar to:
- **Search**: Type location, type, or notes
- **Filter by Status**: Show only suspicious lesions
- **Filter by Date**: This week, month, year
- **Quick Stats**: See counts at a glance

## 🎨 Color Code Reference

- **Blue** 🔵: Monitoring (routine follow-up)
- **Yellow** 🟡: Suspicious (needs closer watch)
- **Green** 🟢: Benign (confirmed safe)
- **Red** 🔴: Malignant (requires treatment)
- **Purple** 🟣: Treated (post-procedure)
- **Gray** ⚫: Resolved (no longer present)

Suspicious and malignant lesions **pulse** to grab attention!

## ⌨️ Keyboard Shortcuts

- **Arrow Left/Right**: Switch between body views
- **+/-**: Zoom in/out
- **0**: Reset zoom to 100%
- **Shift + Click**: Pan the view
- **Esc**: Close modal

## 📱 Touch Gestures (Tablets)

- **Tap**: Select lesion or add new
- **Pinch**: Zoom in/out
- **Two-finger drag**: Pan view
- **Long press**: Show tooltip

## 🔍 Advanced Search

Search supports:
- Location names (e.g., "right arm")
- Lesion types (e.g., "melanoma")
- Status (e.g., "suspicious")
- Notes content (e.g., "irregular border")
- Lesion ID

## 📊 API Usage

### Get All Lesions

```typescript
const response = await fetch(`/api/patients/${patientId}/lesions`, {
  credentials: 'include',
});
const { lesions } = await response.json();
```

### Add New Lesion

```typescript
const response = await fetch(`/api/patients/${patientId}/lesions`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    patient_id: patientId,
    anatomical_location: 'Right Forearm',
    x_coordinate: 85,
    y_coordinate: 40,
    body_view: 'front',
    lesion_type: 'nevus',
    status: 'monitoring',
    size_mm: 4.5,
    color: 'brown',
    border: 'well-defined',
    notes: 'Regular borders, homogeneous color',
  }),
});
const { id } = await response.json();
```

### Update Lesion

```typescript
await fetch(`/api/patients/${patientId}/lesions/${lesionId}`, {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'suspicious',
    size_mm: 5.2,
    notes: 'Lesion has grown 0.7mm since last visit',
  }),
});
```

### Add Observation

```typescript
await fetch(`/api/patients/${patientId}/lesions/${lesionId}/observations`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    observed_date: '2024-01-20',
    size_mm: 5.2,
    notes: 'Border becoming irregular',
  }),
});
```

## 🎯 Best Practices

### Clinical Documentation

1. **Always measure lesions** - Use a ruler or dermoscope measurement
2. **Document thoroughly** - Include color, border, texture
3. **Add photos** - Visual documentation is critical
4. **Track changes** - Add observations at each visit
5. **Update status** - Keep status current based on findings

### Workflow Tips

1. **Start with body map** - Review all lesions at visit start
2. **Mark examined areas** - Use "examined" marker type
3. **Flag concerns** - Change status to "suspicious" for follow-up
4. **Use filters** - Quickly find lesions needing attention
5. **Print summary** - Export for referrals (coming soon)

### Organization

1. **Consistent naming** - Use standard anatomical terms
2. **Standardize types** - Stick to common lesion type names
3. **Regular review** - Check all "monitoring" lesions periodically
4. **Archive resolved** - Mark as "resolved" when removed

## 🐛 Troubleshooting

### Lesions not showing up?

- Check that you've run the database migration
- Verify patient_id matches URL parameter
- Look for errors in browser console (F12)
- Ensure backend server is running

### Can't add lesions?

- Verify you have provider, MA, or admin role
- Check that patient exists in database
- Ensure coordinates are 0-100 range

### Markers in wrong place?

- Coordinates are percentages (0-100) not pixels
- Different views have different coordinate systems
- Verify body_view matches current view

### Performance issues?

- Consider limiting observations history to last 12 months
- Enable pagination for patients with 100+ lesions
- Use filters to reduce visible markers

## 📖 Further Reading

- Full documentation: `/BODY_MAP_IMPLEMENTATION.md`
- Anatomical locations reference: `/frontend/src/components/BodyMap/anatomicalLocations.ts`
- API reference: `/backend/src/routes/bodyMap.ts`

## 💡 Pro Tips

1. **Zoom for precision** - Zoom in 200-300% when marking small lesions
2. **Use templates** - Create note templates for common findings
3. **Batch updates** - Update multiple lesions from sidebar
4. **Export data** - Use for research or quality improvement
5. **Train staff** - Ensure MAs know how to use the tool

## 🎓 Training Checklist

For new users, ensure they can:

- [ ] Navigate between body views
- [ ] Add a new lesion with all details
- [ ] Edit an existing lesion
- [ ] Add an observation to track changes
- [ ] Use search and filters
- [ ] Understand the color coding system
- [ ] Use zoom and pan effectively
- [ ] Interpret the observation history

## 📞 Support

Questions? Issues? Ideas?

- File an issue in the repo
- Contact dev team
- Check documentation at `/docs/`

---

**Happy Lesion Tracking!** 🎯
