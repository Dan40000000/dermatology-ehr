# Real-Time WebSocket Implementation - Dermatology EHR

## Overview

This implementation provides comprehensive real-time updates across all views in the Dermatology EHR using WebSocket technology (Socket.IO). When data changes anywhere in the system, all connected clients see updates immediately.

## Architecture

### Backend Components

1. **WebSocket Server** (`backend/src/websocket/index.ts`)
   - Socket.IO server with authentication
   - Tenant isolation via rooms
   - Auto-reconnection support
   - Ping/pong for connection health

2. **Event Types** (`backend/src/websocket/types.ts`)
   - Strongly typed event definitions
   - Full TypeScript support
   - Events for appointments, patients, encounters, biopsies, claims, payments, prior auth

3. **Event Emitter Service** (`backend/src/websocket/emitter.ts`)
   - Centralized event emission
   - Tenant-scoped broadcasts
   - User-specific notifications
   - Automatic error handling

### Frontend Components

1. **WebSocket Context** (`frontend/src/contexts/WebSocketContext.tsx`)
   - React Context for WebSocket connection
   - Connection state management
   - Auto-reconnection logic
   - Event subscription helpers

2. **Real-Time Hooks** (`frontend/src/hooks/realtime/`)
   - `useAppointmentUpdates` - Schedule and appointment updates
   - `usePatientUpdates` - Patient data changes
   - `useEncounterUpdates` - Clinical encounter updates
   - `useBillingUpdates` - Claims, payments, prior auth
   - `useBiopsyUpdates` - Biopsy results (critical safety feature)

3. **UI Components** (`frontend/src/components/realtime/`)
   - `UpdateHighlight` - Visual feedback for updates
   - `RealtimeIndicator` - Connection status indicator
   - `RealtimeWrapper` - Drop-in wrapper for lists

## Events Reference

### Appointment Events

- `appointment:created` - New appointment booked
- `appointment:updated` - Appointment modified (time, provider, etc.)
- `appointment:cancelled` - Appointment cancelled
- `appointment:checkedin` - Patient checked in

### Patient Events

- `patient:updated` - Patient demographics/info changed
- `patient:insurance_verified` - Insurance verification completed
- `patient:balance_changed` - Patient balance updated

### Clinical Events

- `encounter:created` - New encounter/visit started
- `encounter:updated` - Encounter documentation updated
- `encounter:completed` - Encounter marked complete
- `encounter:signed` - Provider signed encounter

### Biopsy Events (Critical Safety Feature)

- `biopsy:created` - New biopsy ordered
- `biopsy:updated` - Biopsy status changed
- `biopsy:result_received` - **CRITICAL** - Pathology result received
- `biopsy:reviewed` - Provider reviewed result

### Billing Events

- `claim:created` - New claim created
- `claim:updated` - Claim data modified
- `claim:status_changed` - Claim status changed
- `claim:submitted` - Claim submitted to payer
- `claim:denied` - **ALERT** - Claim denied
- `claim:paid` - Claim paid
- `payment:received` - Payment posted
- `prior_auth:status_changed` - Prior authorization status changed
- `prior_auth:approved` - Prior auth approved
- `prior_auth:denied` - Prior auth denied

## Backend Integration

### Adding WebSocket Emissions to Routes

Events are emitted automatically in the updated routes:

**Appointments** (`backend/src/routes/appointments.ts`):
- ✅ POST `/appointments` - Emits `appointment:created`
- ✅ POST `/appointments/:id/reschedule` - Emits `appointment:updated`
- ✅ POST `/appointments/:id/status` - Emits status-specific events

**Patients** (`backend/src/routes/patients.ts`):
- ✅ PUT `/patients/:id` - Emits `patient:updated`

**Encounters** (`backend/src/routes/encounters.ts`):
- ✅ POST `/encounters` - Emits `encounter:created`
- Note: Other encounter routes need similar integration

**Biopsies** (`backend/src/routes/biopsy.ts`):
- Ready for integration with emitter functions imported

**Claims** (`backend/src/routes/claims.ts`):
- Ready for integration with emitter functions imported

### Example Backend Emission

```typescript
import { emitAppointmentCreated } from '../websocket/emitter';

// After creating appointment in database
emitAppointmentCreated(tenantId, {
  id: appointment.id,
  patientId: appointment.patient_id,
  patientName: appointment.patient_name,
  providerId: appointment.provider_id,
  providerName: appointment.provider_name,
  scheduledStart: appointment.scheduled_start,
  scheduledEnd: appointment.scheduled_end,
  status: appointment.status,
  // ... other fields
});
```

## Frontend Integration

### Quick Start with Hooks

```typescript
import { useAppointmentUpdates } from '../hooks/realtime';

function SchedulePage() {
  const [appointments, setAppointments] = useState([]);

  useAppointmentUpdates({
    onAppointmentCreated: (appointment) => {
      setAppointments(prev => [...prev, appointment]);
    },
    onAppointmentUpdated: (appointment) => {
      setAppointments(prev =>
        prev.map(appt => appt.id === appointment.id ? appointment : appt)
      );
    },
    showToasts: true,
  });

  return <div>/* Your UI */</div>;
}
```

### Using RealtimeWrapper (Easiest Integration)

```typescript
import { RealtimeWrapper } from '../components/realtime/RealtimeWrapper';

function AppointmentList() {
  const [appointments, setAppointments] = useState([]);

  return (
    <RealtimeWrapper
      items={appointments}
      setItems={setAppointments}
      eventType="appointment"
      renderItem={(appt) => <AppointmentCard appointment={appt} />}
      showIndicator={true}
      showToasts={true}
    />
  );
}
```

## Key Features

### 1. Tenant Isolation
All events are scoped to tenants. Users only see updates for their organization.

### 2. Auto-Reconnection
If connection drops, the client automatically reconnects. Developers should refetch data on reconnect:

```typescript
const { status } = useWebSocketContext();

useEffect(() => {
  if (status === 'connected') {
    refetchData(); // Fetch missed updates
  }
}, [status]);
```

### 3. Visual Feedback
- Toast notifications for important events
- Highlighted items that just updated
- Connection status indicator
- "Live" indicator with pulse animation

### 4. Critical Alerts
Special handling for important events:
- Biopsy results (especially concerning diagnoses)
- Claim denials
- Prior auth denials

These show prominent, attention-grabbing alerts.

### 5. Performance
- Tenant-scoped rooms reduce unnecessary broadcasts
- Efficient event filtering on client side
- Debounced highlights prevent flashing

## Testing

### Manual Testing

1. Open two browser windows logged into the same tenant
2. In Window 1: Create an appointment
3. In Window 2: See the appointment appear immediately
4. Verify toast notification appears
5. Check item highlights briefly
6. Confirm connection indicator shows "Live"

### Test Scenarios

- [ ] Create appointment → appears in schedule
- [ ] Update appointment time → updates immediately
- [ ] Cancel appointment → status changes
- [ ] Check in patient → front desk sees update
- [ ] Update patient demographics → reflects in patient detail
- [ ] Post payment → balance updates
- [ ] Submit claim → status changes
- [ ] Claim denial → prominent alert shown
- [ ] Biopsy result received → critical alert if concerning
- [ ] Disconnect/reconnect → connection restored

## Security

- Authentication required for WebSocket connection
- JWT token validated on connection
- Tenant ID verified
- All events scoped to tenant rooms
- No cross-tenant data leakage

## Performance Considerations

- Events only sent to connected clients in the same tenant
- Client-side filtering for specific IDs (e.g., filter by patientId)
- Highlights auto-clear after 2-3 seconds
- Toast notifications have durations to prevent spam

## Troubleshooting

### Connection Issues

**Problem**: WebSocket not connecting

**Solution**:
1. Check VITE_API_URL in `.env`
2. Verify backend WebSocket server is running
3. Check browser console for errors
4. Ensure JWT token is valid

### Events Not Received

**Problem**: Updates not appearing in UI

**Solution**:
1. Check tenant ID matches
2. Verify event handlers are registered
3. Check browser console for WebSocket events
4. Ensure callbacks are updating state correctly

### Duplicate Events

**Problem**: Seeing multiple notifications for same event

**Solution**:
1. Check for duplicate hook subscriptions
2. Ensure proper cleanup in useEffect
3. Verify event handlers aren't registered multiple times

## Future Enhancements

- [ ] Offline queue for events missed during disconnection
- [ ] Presence indicators (who's viewing what)
- [ ] Collaborative editing indicators
- [ ] Event replay for debugging
- [ ] Analytics on event patterns
- [ ] Rate limiting for high-frequency updates

## Files Modified/Created

### Backend
- ✅ `backend/src/websocket/types.ts` - Extended with all event types
- ✅ `backend/src/websocket/emitter.ts` - **NEW** - Centralized emitter service
- ✅ `backend/src/routes/appointments.ts` - Added WebSocket emissions
- ✅ `backend/src/routes/patients.ts` - Added WebSocket emissions
- ✅ `backend/src/routes/encounters.ts` - Added imports (needs emissions)
- ✅ `backend/src/routes/biopsy.ts` - Added imports (needs emissions)
- ✅ `backend/src/routes/claims.ts` - Added imports (needs emissions)

### Frontend
- ✅ `frontend/src/hooks/realtime/useAppointmentUpdates.ts` - **NEW**
- ✅ `frontend/src/hooks/realtime/usePatientUpdates.ts` - **NEW**
- ✅ `frontend/src/hooks/realtime/useEncounterUpdates.ts` - **NEW**
- ✅ `frontend/src/hooks/realtime/useBillingUpdates.ts` - **NEW**
- ✅ `frontend/src/hooks/realtime/useBiopsyUpdates.ts` - **NEW**
- ✅ `frontend/src/hooks/realtime/index.ts` - **NEW** - Exports
- ✅ `frontend/src/components/realtime/UpdateHighlight.tsx` - **NEW**
- ✅ `frontend/src/components/realtime/RealtimeIndicator.tsx` - **NEW**
- ✅ `frontend/src/components/realtime/RealtimeWrapper.tsx` - **NEW**

### Documentation
- ✅ `REALTIME_INTEGRATION_GUIDE.md` - **NEW** - Integration examples
- ✅ `REALTIME_WEBSOCKET_IMPLEMENTATION.md` - **NEW** - This file

## Support

For issues or questions about real-time features:
1. Check this documentation
2. Review integration examples in `REALTIME_INTEGRATION_GUIDE.md`
3. Check WebSocket server logs
4. Inspect browser WebSocket frames in DevTools

## License

Same as main application.
