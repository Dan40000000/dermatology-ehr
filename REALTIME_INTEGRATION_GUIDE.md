# Real-Time WebSocket Integration Guide

This guide shows how to integrate real-time WebSocket updates into your EHR views.

## 1. Schedule Page Integration

Add real-time appointment updates to the schedule view:

```typescript
// In SchedulePage.tsx
import { useAppointmentUpdates } from '../hooks/realtime';
import { UpdateHighlight } from '../components/realtime/UpdateHighlight';
import { RealtimeIndicator } from '../components/realtime/RealtimeIndicator';

export function SchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Add real-time updates
  const { lastUpdate, highlightedAppointmentId, isConnected } = useAppointmentUpdates({
    onAppointmentCreated: (appointment) => {
      // Add new appointment to state
      setAppointments(prev => [...prev, appointment]);
    },
    onAppointmentUpdated: (appointment) => {
      // Update existing appointment
      setAppointments(prev =>
        prev.map(appt => appt.id === appointment.id ? appointment : appt)
      );
    },
    onAppointmentCancelled: (appointmentId) => {
      // Remove or mark cancelled
      setAppointments(prev =>
        prev.map(appt =>
          appt.id === appointmentId
            ? { ...appt, status: 'cancelled' }
            : appt
        )
      );
    },
    onAppointmentCheckedIn: (appointmentId) => {
      // Update to checked-in status
      setAppointments(prev =>
        prev.map(appt =>
          appt.id === appointmentId
            ? { ...appt, status: 'checked_in' }
            : appt
        )
      );
    },
    showToasts: true, // Show toast notifications
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1>Schedule</h1>
        <RealtimeIndicator lastUpdate={lastUpdate} />
      </div>

      <div className="appointments-list">
        {appointments.map(appt => (
          <UpdateHighlight
            key={appt.id}
            isHighlighted={highlightedAppointmentId === appt.id}
            highlightColor="bg-blue-100"
          >
            <AppointmentCard appointment={appt} />
          </UpdateHighlight>
        ))}
      </div>
    </div>
  );
}
```

## 2. Patient Detail Page Integration

Add real-time patient data updates:

```typescript
// In PatientDetailPage.tsx
import { usePatientUpdates } from '../hooks/realtime';

export function PatientDetailPage({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);

  const { lastUpdate, isUpdating } = usePatientUpdates({
    patientId, // Filter to this patient only
    onPatientUpdated: (updatedPatient) => {
      setPatient(updatedPatient);
    },
    onInsuranceVerified: (patientId, insuranceInfo) => {
      // Update insurance section
      setPatient(prev => prev ? {
        ...prev,
        insurance: insuranceInfo
      } : null);
    },
    onBalanceChanged: (patientId, oldBalance, newBalance) => {
      // Update balance display
      setPatient(prev => prev ? {
        ...prev,
        balance: newBalance
      } : null);
    },
    showToasts: true,
  });

  return (
    <div className={`patient-detail ${isUpdating ? 'opacity-75' : ''}`}>
      <div className="flex justify-between items-center">
        <h1>{patient?.firstName} {patient?.lastName}</h1>
        <RealtimeIndicator lastUpdate={lastUpdate} />
      </div>

      {/* Patient demographics, insurance, balance, etc. */}
    </div>
  );
}
```

## 3. Front Desk Dashboard Integration

Add real-time check-in updates:

```typescript
// In FrontDeskDashboard.tsx
import { useAppointmentUpdates } from '../hooks/realtime';

export function FrontDeskDashboard() {
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [checkIns, setCheckIns] = useState<string[]>([]);

  const { highlightedAppointmentId } = useAppointmentUpdates({
    onAppointmentCheckedIn: (appointmentId, patientId, patientName) => {
      // Add to check-ins list
      setCheckIns(prev => [...prev, appointmentId]);

      // Update appointment status
      setTodaysAppointments(prev =>
        prev.map(appt =>
          appt.id === appointmentId
            ? { ...appt, status: 'checked_in' }
            : appt
        )
      );
    },
    onAppointmentCreated: (appointment) => {
      // Add new appointment if it's for today
      const isToday = /* check if appointment is today */;
      if (isToday) {
        setTodaysAppointments(prev => [...prev, appointment]);
      }
    },
    showToasts: true,
  });

  return (
    <div className="front-desk-dashboard">
      <h1>Today's Appointments</h1>

      <div className="appointments-grid">
        {todaysAppointments.map(appt => (
          <UpdateHighlight
            key={appt.id}
            isHighlighted={highlightedAppointmentId === appt.id}
          >
            <AppointmentCard
              appointment={appt}
              showCheckInButton={appt.status === 'scheduled'}
            />
          </UpdateHighlight>
        ))}
      </div>
    </div>
  );
}
```

## 4. Claims Dashboard Integration

Add real-time billing updates:

```typescript
// In ClaimsDashboard.tsx
import { useBillingUpdates } from '../hooks/realtime';

export function ClaimsDashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);

  const { highlightedClaimId, lastUpdate } = useBillingUpdates({
    onClaimCreated: (claim) => {
      setClaims(prev => [claim, ...prev]);
    },
    onClaimUpdated: (claim) => {
      setClaims(prev =>
        prev.map(c => c.id === claim.id ? claim : c)
      );
    },
    onClaimStatusChanged: (claimId, oldStatus, newStatus) => {
      setClaims(prev =>
        prev.map(c =>
          c.id === claimId ? { ...c, status: newStatus } : c
        )
      );
    },
    onClaimDenied: (claimId, reason) => {
      // Update claim and add to denial review queue
      setClaims(prev =>
        prev.map(c =>
          c.id === claimId
            ? { ...c, status: 'denied', denialReason: reason }
            : c
        )
      );
    },
    onClaimPaid: (claimId, amount) => {
      setClaims(prev =>
        prev.map(c =>
          c.id === claimId
            ? { ...c, status: 'paid', paidAmount: amount }
            : c
        )
      );
    },
    onPaymentReceived: (payment) => {
      setRecentPayments(prev => [payment, ...prev].slice(0, 10));
    },
    showToasts: true,
    showDenialAlerts: true, // Show prominent alerts for denials
  });

  return (
    <div className="claims-dashboard">
      <div className="flex justify-between items-center mb-4">
        <h1>Claims & Billing</h1>
        <RealtimeIndicator lastUpdate={lastUpdate} />
      </div>

      <div className="claims-list">
        {claims.map(claim => (
          <UpdateHighlight
            key={claim.id}
            isHighlighted={highlightedClaimId === claim.id}
            highlightColor={
              claim.status === 'denied' ? 'bg-red-100' :
              claim.status === 'paid' ? 'bg-green-100' :
              'bg-blue-100'
            }
          >
            <ClaimCard claim={claim} />
          </UpdateHighlight>
        ))}
      </div>

      <div className="recent-payments">
        <h2>Recent Payments</h2>
        {recentPayments.map(payment => (
          <PaymentCard key={payment.id} payment={payment} />
        ))}
      </div>
    </div>
  );
}
```

## 5. Biopsy Log Page Integration

Add real-time biopsy result alerts (CRITICAL for patient safety):

```typescript
// In BiopsyLogPage.tsx
import { useBiopsyUpdates } from '../hooks/realtime';

export function BiopsyLogPage() {
  const [biopsies, setBiopsies] = useState<Biopsy[]>([]);
  const [unreviewedResults, setUnreviewedResults] = useState<string[]>([]);

  const { pendingResultsCount, lastUpdate } = useBiopsyUpdates({
    onBiopsyCreated: (biopsy) => {
      setBiopsies(prev => [biopsy, ...prev]);
    },
    onBiopsyResultReceived: (biopsyId, patientId, diagnosis) => {
      // Update biopsy with result
      setBiopsies(prev =>
        prev.map(b =>
          b.id === biopsyId
            ? { ...b, status: 'resulted', diagnosis }
            : b
        )
      );

      // Add to unreviewed results queue
      setUnreviewedResults(prev => [...prev, biopsyId]);
    },
    onBiopsyReviewed: (biopsyId) => {
      // Remove from unreviewed queue
      setUnreviewedResults(prev => prev.filter(id => id !== biopsyId));

      // Update status
      setBiopsies(prev =>
        prev.map(b =>
          b.id === biopsyId ? { ...b, status: 'reviewed' } : b
        )
      );
    },
    showToasts: true,
    showCriticalAlerts: true, // IMPORTANT: Show prominent alerts for concerning results
  });

  return (
    <div className="biopsy-log">
      <div className="flex justify-between items-center mb-4">
        <h1>Biopsy Log</h1>
        <div className="flex gap-4">
          {unreviewedResults.length > 0 && (
            <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full font-semibold">
              {unreviewedResults.length} Unreviewed Results
            </div>
          )}
          <RealtimeIndicator lastUpdate={lastUpdate} />
        </div>
      </div>

      {/* Biopsy list with real-time updates */}
    </div>
  );
}
```

## 6. Encounter/Visit Page Integration

Add real-time encounter updates:

```typescript
// In EncounterPage.tsx
import { useEncounterUpdates } from '../hooks/realtime';

export function EncounterPage({ encounterId }: { encounterId: string }) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);

  const { isUpdating } = useEncounterUpdates({
    encounterId,
    onEncounterUpdated: (updatedEncounter) => {
      setEncounter(updatedEncounter);
    },
    onEncounterCompleted: () => {
      setEncounter(prev => prev ? { ...prev, status: 'completed' } : null);
    },
    onEncounterSigned: () => {
      setEncounter(prev => prev ? { ...prev, status: 'signed' } : null);
    },
    showToasts: true,
  });

  return (
    <div className={`encounter-page ${isUpdating ? 'border-2 border-blue-300' : ''}`}>
      {/* Encounter documentation */}
    </div>
  );
}
```

## Auto-reconnection and Missed Updates

The WebSocket context already handles reconnection automatically. To fetch missed updates on reconnect:

```typescript
const { socket, status } = useWebSocketContext();

useEffect(() => {
  if (status === 'connected') {
    // Refetch data when reconnected to catch any missed updates
    refetchAppointments();
  }
}, [status]);
```

## Benefits

1. **Immediate Updates**: All connected clients see changes instantly
2. **Multi-user Coordination**: No stale data when multiple users work simultaneously
3. **Patient Safety**: Critical alerts (biopsy results, denials) appear immediately
4. **Better UX**: Visual feedback shows what's updating
5. **Reduced Errors**: No more booking conflicts or missed updates
6. **Audit Trail**: All changes logged and visible to the team

## Testing Real-Time Updates

1. Open two browser windows
2. Make a change in one (e.g., create appointment)
3. See it appear instantly in the other window
4. Check toast notifications appear correctly
5. Verify highlighting works on updated items
