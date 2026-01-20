/**
 * RealtimeWrapper Component
 * Easy drop-in wrapper that adds real-time updates to any list/view
 *
 * Usage:
 * <RealtimeWrapper
 *   items={appointments}
 *   setItems={setAppointments}
 *   eventType="appointment"
 *   renderItem={(appt) => <AppointmentCard appointment={appt} />}
 * />
 */

import { ReactNode } from 'react';
import { useAppointmentUpdates } from '../../hooks/realtime';
import { usePatientUpdates } from '../../hooks/realtime';
import { useBillingUpdates } from '../../hooks/realtime';
import { UpdateHighlight } from './UpdateHighlight';
import { RealtimeIndicator } from './RealtimeIndicator';

type EventType = 'appointment' | 'patient' | 'claim' | 'biopsy' | 'encounter';

interface RealtimeWrapperProps<T extends { id: string }> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  eventType: EventType;
  renderItem: (item: T, isHighlighted: boolean) => ReactNode;
  showIndicator?: boolean;
  showToasts?: boolean;
  className?: string;
}

export function RealtimeWrapper<T extends { id: string }>({
  items,
  setItems,
  eventType,
  renderItem,
  showIndicator = true,
  showToasts = true,
  className = '',
}: RealtimeWrapperProps<T>) {
  let highlightedId: string | null = null;
  let lastUpdate: Date | null = null;

  // Setup appropriate hook based on event type
  if (eventType === 'appointment') {
    const { highlightedAppointmentId, lastUpdate: apptLastUpdate } = useAppointmentUpdates({
      onAppointmentCreated: (appointment) => {
        setItems((prev) => [...prev, appointment as unknown as T]);
      },
      onAppointmentUpdated: (appointment) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === appointment.id ? (appointment as unknown as T) : item
          )
        );
      },
      onAppointmentCancelled: (appointmentId) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === appointmentId ? { ...item, status: 'cancelled' } as T : item
          )
        );
      },
      onAppointmentCheckedIn: (appointmentId) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === appointmentId ? { ...item, status: 'checked_in' } as T : item
          )
        );
      },
      showToasts,
    });
    highlightedId = highlightedAppointmentId;
    lastUpdate = apptLastUpdate;
  } else if (eventType === 'claim') {
    const { highlightedClaimId, lastUpdate: claimLastUpdate } = useBillingUpdates({
      onClaimCreated: (claim) => {
        setItems((prev) => [claim as unknown as T, ...prev]);
      },
      onClaimUpdated: (claim) => {
        setItems((prev) =>
          prev.map((item) => (item.id === claim.id ? (claim as unknown as T) : item))
        );
      },
      onClaimStatusChanged: (claimId, oldStatus, newStatus) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === claimId ? { ...item, status: newStatus } as T : item
          )
        );
      },
      showToasts,
      showDenialAlerts: true,
    });
    highlightedId = highlightedClaimId;
    lastUpdate = claimLastUpdate;
  } else if (eventType === 'patient') {
    const { lastUpdate: patientLastUpdate } = usePatientUpdates({
      onPatientUpdated: (patient) => {
        setItems((prev) =>
          prev.map((item) => (item.id === patient.id ? (patient as unknown as T) : item))
        );
      },
      showToasts,
    });
    lastUpdate = patientLastUpdate;
  }

  return (
    <div className={className}>
      {showIndicator && (
        <div className="mb-4 flex justify-end">
          <RealtimeIndicator lastUpdate={lastUpdate} />
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <UpdateHighlight
            key={item.id}
            isHighlighted={highlightedId === item.id}
          >
            {renderItem(item, highlightedId === item.id)}
          </UpdateHighlight>
        ))}
      </div>
    </div>
  );
}
