# Body Diagram System - Quick Start Guide

## 🚀 Getting Started

### Step 1: Run the Database Migration
```bash
cd backend
psql -U your_user -d your_database -f migrations/026_body_diagram.sql
```

This will:
- Create `body_locations` table with 60+ anatomical locations
- Create `patient_body_markings` table for patient data
- Set up indexes and triggers

### Step 2: Restart the Backend
```bash
npm run dev
```

The new `/api/body-diagram/*` routes are now available.

### Step 3: Access the Body Diagram
Navigate to: **http://localhost:5173/body-diagram**

Or from the main navigation: **Body Diagram** link

---

## 📍 How to Use

### Add a New Marking

1. **Select Patient**: Choose patient from dropdown
2. **Click on Body**: Click anywhere on the front or back body diagram
3. **Fill Details**:
   - Marking Type (lesion, examined, biopsy, etc.)
   - Status (active, resolved, monitored, etc.)
   - Diagnosis, size, color (if applicable)
   - Clinical notes
4. **Save**: Click "Add Marking"

### Edit Existing Marking

1. Click on any colored dot on the body diagram
2. Modal opens with existing data
3. Make changes
4. Click "Update Marking"

### Delete Marking

1. Click on marking
2. Click "Delete" button
3. Confirm deletion

### Filter Markings

Use the filter controls:
- **Search**: Type location, diagnosis, or description
- **Type Filter**: Show only lesions, biopsies, etc.
- **Status Filter**: Show only active, resolved, etc.

---

## 🎨 Color Coding

### By Marking Type
- 🔴 **Red**: Lesion
- 🔵 **Blue**: Examined
- 🟣 **Purple**: Biopsy
- 🟠 **Orange**: Excision
- 🟢 **Green**: Injection

### By Status
- 🔴 **Red**: Active
- 🟢 **Green**: Resolved
- 🟡 **Yellow**: Monitored
- 🟣 **Purple**: Biopsied
- 🟠 **Orange**: Excised

---

## 🔗 Integration with Encounters

When documenting a patient encounter:

1. Go to **Patients** → Select patient → Open encounter
2. Click **Skin Exam** tab
3. Click **"Full Body Diagram"** button (purple button in top right)
4. Document findings on full body diagram
5. Return to encounter to complete other sections

The encounter ID is automatically linked to any markings created.

---

## 📊 Example Workflow: Annual Skin Exam

```
1. Open Body Diagram for patient
2. Select "Front" view
3. For each examined area:
   - Click location
   - Type: "Examined"
   - Status: "Active"
   - Examined Date: Today
   - Save
4. For any findings:
   - Click location
   - Type: "Lesion"
   - Fill in details (type, size, color, diagnosis)
   - Status: "Active" or "Monitored"
   - Save
5. Switch to "Back" view
6. Repeat for posterior areas
7. Result: Complete visual documentation of exam
```

---

## 🔒 Permissions

**Who can create/edit markings?**
- Providers ✅
- Medical Assistants ✅
- Admin ✅
- Front Desk ❌

**Who can delete markings?**
- Providers ✅
- Admin ✅
- Medical Assistants ❌

---

## 🐛 Troubleshooting

### "Location not found" error
**Cause**: Migration didn't run correctly
**Fix**: Re-run migration script

### Marking doesn't appear
**Cause**: Wrong view selected (front vs back)
**Fix**: Toggle to correct view

### Can't save marking
**Cause**: Required fields missing
**Fix**: Ensure marking type and status are selected

### Slow performance
**Cause**: 100+ markings on one patient
**Fix**: Use filters to narrow down view

---

## 📱 Mobile/Tablet Support

The body diagram is fully touch-enabled:
- Tap to add markings
- Tap to edit markings
- Pinch to zoom (use zoom controls)
- Minimum 44px touch targets

---

## 🔍 API Quick Reference

### Get All Locations
```bash
GET /api/body-diagram/locations
```

### Get Patient's Markings
```bash
GET /api/body-diagram/patient/:patientId/markings
```

### Create Marking
```bash
POST /api/body-diagram/markings
Content-Type: application/json

{
  "patientId": "uuid",
  "locationCode": "face-nose",
  "locationX": 50,
  "locationY": 16,
  "viewType": "front",
  "markingType": "lesion",
  "status": "active"
}
```

### Update Marking
```bash
PUT /api/body-diagram/markings/:id
Content-Type: application/json

{
  "status": "resolved",
  "resolvedDate": "2025-12-08"
}
```

### Delete Marking
```bash
DELETE /api/body-diagram/markings/:id
```

---

## 💡 Tips & Best Practices

### 1. Be Specific with Locations
Use the most specific location code possible. Instead of "chest", use "chest-right" or "chest-left".

### 2. Document Size Accurately
Always measure lesions in millimeters. This helps track growth over time.

### 3. Use Examined Markers
Mark areas you examined with no findings. This documents thoroughness and reduces liability.

### 4. Link to Photos
If you take photos, note the photo IDs in the marking for future reference.

### 5. Update Status Regularly
When lesions resolve or get biopsied, update the status. Don't delete - keep the history!

### 6. Use Descriptive Notes
Future you (or another provider) will thank you for detailed clinical descriptions.

---

## 📞 Support

**Questions?** Contact your system administrator or refer to the full implementation guide: `BODY_DIAGRAM_IMPLEMENTATION.md`

**Found a bug?** Report to development team with:
- What you were doing
- What you expected
- What actually happened
- Screenshots if possible

---

## ✅ Quick Checklist for First Use

- [ ] Database migration completed
- [ ] Backend server restarted
- [ ] Can access /body-diagram page
- [ ] Can see patient dropdown
- [ ] Can click on body to add marking
- [ ] Modal opens with form
- [ ] Can save marking
- [ ] Marking appears on diagram
- [ ] Can filter markings
- [ ] Can edit existing marking
- [ ] Can delete marking (with confirmation)

**If all checked, you're ready to go!** 🎉

---

**Last Updated**: December 8, 2025
**Version**: 1.0.0
