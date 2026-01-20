# Quick Start Guide - Body Map Integration

## For Developers: Getting Started in 5 Minutes

### Step 1: Run Database Migration (1 minute)

```bash
cd backend
psql -d derm_app -f migrations/058_lesion_integration.sql
```

This creates:
- Foreign key relationships (lesion_id in biopsies and photos)
- Automatic update trigger
- Timeline function
- Performance indexes

### Step 2: Update BodyMap Component (2 minutes)

In your `BodyMap.tsx` file:

```typescript
// OLD:
import { LesionDetailModal } from './LesionDetailModal';

// NEW:
import { EnhancedLesionDetailModal } from './EnhancedLesionDetailModal';

// Then replace the modal:
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

### Step 3: Test (2 minutes)

1. Open body map → Click to create lesion
2. Click "Order Biopsy" → Pre-filled!
3. Click "Take Photo" → Auto-linked!
4. Check Timeline tab → Complete history!

Done! 

## Need More Help?

See `LESION_INTEGRATION.md` for full documentation.
