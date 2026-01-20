# Real-Time WebSocket - Quick Start Guide

Get real-time updates working in your view in 5 minutes.

## Step 1: Import the Hook

Choose the hook that matches your view:

```typescript
import { useAppointmentUpdates } from '../hooks/realtime'; // For schedules
import { usePatientUpdates } from '../hooks/realtime';     // For patient views
import { useBillingUpdates } from '../hooks/realtime';     // For billing/claims
import { useBiopsyUpdates } from '../hooks/realtime';      // For biopsy log
import { useEncounterUpdates } from '../hooks/realtime';   // For encounters
```

## Step 2: Add Hook to Component

```typescript
function MyComponent() {
  const [data, setData] = useState([]);

  // Add this hook
  useAppointmentUpdates({
    onAppointmentCreated: (newItem) => {
      setData(prev => [...prev, newItem]);
    },
    onAppointmentUpdated: (updated) => {
      setData(prev => prev.map(item =>
        item.id === updated.id ? updated : item
      ));
    },
    showToasts: true, // Show notifications
  });

  // Rest of your component...
}
```

## Step 3: (Optional) Add Visual Feedback

```typescript
import { UpdateHighlight } from '../components/realtime/UpdateHighlight';

// In your render:
{data.map(item => (
  <UpdateHighlight key={item.id} isHighlighted={/* highlight logic */}>
    <ItemCard item={item} />
  </UpdateHighlight>
))}
```

## Step 4: Test It!

1. Open two browser tabs
2. Make a change in one tab
3. See it appear instantly in the other tab

## Done!

You now have real-time updates. See `REALTIME_INTEGRATION_GUIDE.md` for more examples.

## Common Patterns

### Filter by Specific ID

```typescript
usePatientUpdates({
  patientId: '123', // Only listen to this patient
  onPatientUpdated: (patient) => { /* ... */ },
});
```

### Disable Toast Notifications

```typescript
useAppointmentUpdates({
  showToasts: false, // Silent updates
  onAppointmentCreated: (appt) => { /* ... */ },
});
```

### Critical Alerts Only

```typescript
useBiopsyUpdates({
  showToasts: false,
  showCriticalAlerts: true, // Only show alerts for concerning results
  onBiopsyResultReceived: (id, patientId, diagnosis) => { /* ... */ },
});
```

### Show Connection Status

```typescript
import { RealtimeIndicator } from '../components/realtime/RealtimeIndicator';

function MyPage() {
  const { lastUpdate } = useAppointmentUpdates({/* ... */});

  return (
    <div>
      <h1>My Page</h1>
      <RealtimeIndicator lastUpdate={lastUpdate} />
      {/* ... */}
    </div>
  );
}
```

## All Available Events

### Appointment Hooks
- `onAppointmentCreated`
- `onAppointmentUpdated`
- `onAppointmentCancelled`
- `onAppointmentCheckedIn`

### Patient Hooks
- `onPatientUpdated`
- `onInsuranceVerified`
- `onBalanceChanged`

### Billing Hooks
- `onClaimCreated`
- `onClaimUpdated`
- `onClaimStatusChanged`
- `onClaimSubmitted`
- `onClaimDenied`
- `onClaimPaid`
- `onPaymentReceived`
- `onPriorAuthStatusChanged`

### Biopsy Hooks
- `onBiopsyCreated`
- `onBiopsyUpdated`
- `onBiopsyResultReceived` ⚠️ **Critical**
- `onBiopsyReviewed`

### Encounter Hooks
- `onEncounterCreated`
- `onEncounterUpdated`
- `onEncounterCompleted`
- `onEncounterSigned`

## Need Help?

See full documentation: `REALTIME_WEBSOCKET_IMPLEMENTATION.md`
