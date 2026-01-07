# Quick Integration Guide: Adding Inventory to EncounterPage

This guide shows exactly how to add inventory usage tracking to the EncounterPage.

## Step 1: Import Components

Add to the imports at the top of `EncounterPage.tsx`:

```typescript
import { InventoryUsageModal, InventoryUsageList } from '../components/inventory';
```

## Step 2: Add State

Add this state variable with the other useState declarations:

```typescript
const [showInventoryModal, setShowInventoryModal] = useState(false);
```

## Step 3: Add Inventory Section to the UI

Find the appropriate section in the encounter page (suggested: in the "orders" or "billing" section) and add:

```typescript
{/* Inventory Usage Section */}
<section className="encounter-section">
  <InventoryUsageList
    encounterId={encounter.id || encounterId!}
    onOpenUsageModal={() => setShowInventoryModal(true)}
  />
</section>
```

## Step 4: Add the Modal

At the end of the component JSX (before the closing tag), add:

```typescript
{/* Inventory Usage Modal */}
<InventoryUsageModal
  isOpen={showInventoryModal}
  onClose={() => setShowInventoryModal(false)}
  encounterId={encounter.id || encounterId}
  patientId={patient?.id || patientId!}
  providerId={session?.user?.id || encounter.providerId || ''}
  onSuccess={() => {
    // Refresh the inventory usage list
    if ((window as any).__refreshInventoryUsage) {
      (window as any).__refreshInventoryUsage();
    }
  }}
/>
```

## Step 5: Optional - Add to Encounter Sections

If you have a tabbed interface or section navigation, add "Inventory" to the sections:

```typescript
type EncounterSection = 'note' | 'exam' | 'orders' | 'billing' | 'inventory';

// In your section navigation:
<button
  type="button"
  className={activeSection === 'inventory' ? 'active' : ''}
  onClick={() => setActiveSection('inventory')}
>
  Inventory
</button>

// In your section rendering:
{activeSection === 'inventory' && (
  <div className="section-content">
    <InventoryUsageList
      encounterId={encounter.id || encounterId!}
      onOpenUsageModal={() => setShowInventoryModal(true)}
    />
  </div>
)}
```

## Complete Example

Here's a complete example of how it might look in context:

```typescript
export function EncounterPage() {
  // ... existing state ...
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [activeSection, setActiveSection] = useState<EncounterSection>('note');

  // ... existing code ...

  return (
    <div className="encounter-page">
      {/* ... existing header and patient banner ... */}

      {/* Section Navigation */}
      <div className="section-tabs">
        <button
          type="button"
          className={activeSection === 'note' ? 'active' : ''}
          onClick={() => setActiveSection('note')}
        >
          Note
        </button>
        <button
          type="button"
          className={activeSection === 'exam' ? 'active' : ''}
          onClick={() => setActiveSection('exam')}
        >
          Exam
        </button>
        <button
          type="button"
          className={activeSection === 'orders' ? 'active' : ''}
          onClick={() => setActiveSection('orders')}
        >
          Orders
        </button>
        <button
          type="button"
          className={activeSection === 'billing' ? 'active' : ''}
          onClick={() => setActiveSection('billing')}
        >
          Billing
        </button>
        <button
          type="button"
          className={activeSection === 'inventory' ? 'active' : ''}
          onClick={() => setActiveSection('inventory')}
        >
          Inventory
        </button>
      </div>

      {/* Section Content */}
      <div className="section-content">
        {activeSection === 'note' && (
          <div>{/* Note section content */}</div>
        )}

        {activeSection === 'exam' && (
          <div>{/* Exam section content */}</div>
        )}

        {activeSection === 'orders' && (
          <div>{/* Orders section content */}</div>
        )}

        {activeSection === 'billing' && (
          <div>{/* Billing section content */}</div>
        )}

        {activeSection === 'inventory' && (
          <div>
            <InventoryUsageList
              encounterId={encounter.id || encounterId!}
              onOpenUsageModal={() => setShowInventoryModal(true)}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <InventoryUsageModal
        isOpen={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        encounterId={encounter.id || encounterId}
        patientId={patient?.id || patientId!}
        providerId={session?.user?.id || encounter.providerId || ''}
        onSuccess={() => {
          if ((window as any).__refreshInventoryUsage) {
            (window as any).__refreshInventoryUsage();
          }
        }}
      />
      {/* ... other modals ... */}
    </div>
  );
}
```

## Alternative: Inline Integration (Without Tabs)

If you don't want to add a separate tab/section, you can add it inline in the billing or orders section:

```typescript
{/* In your billing or orders section */}
<div className="billing-section">
  {/* ... existing billing code ... */}

  {/* Add inventory section */}
  <div className="mt-6 pt-6 border-t border-gray-200">
    <InventoryUsageList
      encounterId={encounter.id || encounterId!}
      onOpenUsageModal={() => setShowInventoryModal(true)}
    />
  </div>
</div>

{/* Don't forget the modal at the end */}
<InventoryUsageModal
  isOpen={showInventoryModal}
  onClose={() => setShowInventoryModal(false)}
  encounterId={encounter.id || encounterId}
  patientId={patient?.id || patientId!}
  providerId={session?.user?.id || encounter.providerId || ''}
  onSuccess={() => {
    if ((window as any).__refreshInventoryUsage) {
      (window as any).__refreshInventoryUsage();
    }
  }}
/>
```

## Styling Tips

The components use Tailwind CSS classes and should integrate seamlessly with your existing design. However, you may want to add some custom styles:

```css
/* Optional: Add to your component styles */
.inventory-section {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 1.5rem;
}

.section-tabs button {
  padding: 0.75rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.section-tabs button.active {
  color: #7c3aed;
  border-bottom-color: #7c3aed;
}

.section-tabs button:hover {
  color: #4b5563;
}
```

## Testing Your Integration

After integration:

1. **Navigate to an encounter**
   - Open an existing encounter or create a new one

2. **Find the inventory section**
   - If using tabs, click on the "Inventory" tab
   - If inline, scroll to the inventory section

3. **Test adding inventory**
   - Click "Use Items" button
   - Search and select items
   - Set quantities
   - Add notes (optional)
   - Click "Record Usage"

4. **Verify the results**
   - Items should appear in the usage list
   - Total cost should be calculated
   - Check the inventory page - quantities should be reduced
   - Refresh the encounter - usage should persist

## Troubleshooting

### "Failed to load inventory items"
- Check that the backend is running
- Verify the migration has been applied
- Check browser console for network errors
- Verify authentication token is valid

### "Failed to record inventory usage"
- Check that you have sufficient inventory quantity
- Verify all required fields are provided (patientId, providerId, etc.)
- Check network tab for error details

### Items not appearing in list
- Refresh the encounter page
- Check that the encounter ID is valid
- Verify items were actually saved (check Network tab)

### Modal not opening
- Check state management (showInventoryModal)
- Verify the button onClick handler is connected
- Check for JavaScript errors in console

## Next Steps

After integration:
1. Test thoroughly with different scenarios
2. Add appropriate error handling
3. Consider adding inventory usage to encounter summaries
4. Add inventory costs to billing/superbill generation
5. Create reports for inventory usage trends
