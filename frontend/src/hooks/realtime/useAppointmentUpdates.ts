/**
 * Real-time Appointment Updates Hook
 * Subscribes to appointment events and updates local state
 */

import { useEffect, useCallback, useState } from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';
import toast from 'react-hot-toast';

export interface Appointment {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  locationId: string;
  locationName?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'scheduled' | 'checked_in' | 'in_room' | 'with_provider' | 'completed' | 'cancelled' | 'no_show';
  appointmentTypeId: string;
  appointmentTypeName?: string;
}

interface UseAppointmentUpdatesOptions {
  date?: string; // Filter by specific date (YYYY-MM-DD)
  onAppointmentCreated?: (appointment: Appointment) => void;
  onAppointmentUpdated?: (appointment: Appointment) => void;
  onAppointmentCancelled?: (appointmentId: string, reason?: string) => void;
  onAppointmentCheckedIn?: (appointmentId: string, patientId: string, patientName?: string) => void;
  showToasts?: boolean; // Show toast notifications for updates
}

export function useAppointmentUpdates(options: UseAppointmentUpdatesOptions = {}) {
  const { socket, isConnected, on, off } = useWebSocketContext();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [highlightedAppointmentId, setHighlightedAppointmentId] = useState<string | null>(null);

  const {
    date,
    onAppointmentCreated,
    onAppointmentUpdated,
    onAppointmentCancelled,
    onAppointmentCheckedIn,
    showToasts = true,
  } = options;

  // Helper to highlight an appointment briefly
  const highlightAppointment = useCallback((appointmentId: string) => {
    setHighlightedAppointmentId(appointmentId);
    setTimeout(() => setHighlightedAppointmentId(null), 3000); // Clear after 3 seconds
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handler for appointment created
    const handleAppointmentCreated = (data: { appointment: Appointment; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightAppointment(data.appointment.id);

      if (showToasts) {
        toast.success(
          `New appointment: ${data.appointment.patientName || 'Patient'} with ${data.appointment.providerName || 'Provider'}`,
          { duration: 4000, icon: '📅' }
        );
      }

      onAppointmentCreated?.(data.appointment);
    };

    // Handler for appointment updated
    const handleAppointmentUpdated = (data: { appointment: Appointment; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightAppointment(data.appointment.id);

      if (showToasts) {
        toast(`Appointment updated: ${data.appointment.patientName || 'Patient'}`, {
          duration: 3000,
          icon: '🔄',
        });
      }

      onAppointmentUpdated?.(data.appointment);
    };

    // Handler for appointment cancelled
    const handleAppointmentCancelled = (data: { appointmentId: string; reason?: string; timestamp: string }) => {
      setLastUpdate(new Date(data.timestamp));

      if (showToasts) {
        toast.error(`Appointment cancelled${data.reason ? `: ${data.reason}` : ''}`, {
          duration: 4000,
        });
      }

      onAppointmentCancelled?.(data.appointmentId, data.reason);
    };

    // Handler for patient check-in
    const handleAppointmentCheckedIn = (data: {
      appointmentId: string;
      patientId: string;
      patientName?: string;
      timestamp: string;
    }) => {
      setLastUpdate(new Date(data.timestamp));
      highlightAppointment(data.appointmentId);

      if (showToasts) {
        toast.success(`${data.patientName || 'Patient'} checked in`, {
          duration: 3000,
          icon: '✅',
        });
      }

      onAppointmentCheckedIn?.(data.appointmentId, data.patientId, data.patientName);
    };

    // Subscribe to events
    on('appointment:created', handleAppointmentCreated);
    on('appointment:updated', handleAppointmentUpdated);
    on('appointment:cancelled', handleAppointmentCancelled);
    on('appointment:checkedin', handleAppointmentCheckedIn);

    // Cleanup
    return () => {
      off('appointment:created', handleAppointmentCreated);
      off('appointment:updated', handleAppointmentUpdated);
      off('appointment:cancelled', handleAppointmentCancelled);
      off('appointment:checkedin', handleAppointmentCheckedIn);
    };
  }, [socket, isConnected, on, off, onAppointmentCreated, onAppointmentUpdated, onAppointmentCancelled, onAppointmentCheckedIn, showToasts, highlightAppointment]);

  return {
    lastUpdate,
    highlightedAppointmentId,
    isConnected,
  };
}
