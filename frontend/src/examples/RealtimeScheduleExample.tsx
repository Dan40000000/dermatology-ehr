/**
 * EXAMPLE: Real-Time Schedule Integration
 *
 * This shows how to add real-time updates to the SchedulePage.
 * Copy this pattern to integrate real-time updates into your actual schedule view.
 */

import { useState, useEffect } from 'react';
import { useAppointmentUpdates } from '../hooks/realtime';
import { UpdateHighlight } from '../components/realtime/UpdateHighlight';
import { RealtimeIndicator } from '../components/realtime/RealtimeIndicator';

interface Appointment {
  id: string;
  patientId: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
}

export function RealtimeScheduleExample() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial appointments
  useEffect(() => {
    async function fetchAppointments() {
      try {
        const response = await fetch('/api/appointments?date=2024-01-20');
        const data = await response.json();
        setAppointments(data.appointments);
      } catch (error) {
        console.error('Failed to fetch appointments:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAppointments();
  }, []);

  // Setup real-time updates
  const { lastUpdate, highlightedAppointmentId, isConnected } = useAppointmentUpdates({
    onAppointmentCreated: (appointment) => {
      console.log('New appointment created:', appointment);

      // Add to list if it matches our current date filter
      const appointmentDate = new Date(appointment.scheduledStart).toISOString().split('T')[0];
      const currentDate = '2024-01-20'; // In real app, use current filter

      if (appointmentDate === currentDate) {
        setAppointments((prev) => {
          // Avoid duplicates
          if (prev.some((appt) => appt.id === appointment.id)) {
            return prev;
          }
          // Insert in chronological order
          const newList = [...prev, appointment];
          newList.sort((a, b) =>
            new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
          );
          return newList;
        });
      }
    },

    onAppointmentUpdated: (appointment) => {
      console.log('Appointment updated:', appointment);

      setAppointments((prev) =>
        prev.map((appt) => (appt.id === appointment.id ? appointment : appt))
      );
    },

    onAppointmentCancelled: (appointmentId, reason) => {
      console.log('Appointment cancelled:', appointmentId, reason);

      setAppointments((prev) =>
        prev.map((appt) =>
          appt.id === appointmentId
            ? { ...appt, status: 'cancelled' }
            : appt
        )
      );
    },

    onAppointmentCheckedIn: (appointmentId, patientId, patientName) => {
      console.log('Patient checked in:', patientName);

      setAppointments((prev) =>
        prev.map((appt) =>
          appt.id === appointmentId
            ? { ...appt, status: 'checked_in' }
            : appt
        )
      );
    },

    showToasts: true, // Show toast notifications
  });

  if (loading) {
    return <div>Loading appointments...</div>;
  }

  return (
    <div className="p-6">
      {/* Header with real-time indicator */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Schedule - January 20, 2024</h1>
        <RealtimeIndicator lastUpdate={lastUpdate} />
      </div>

      {/* Connection status alert */}
      {!isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4">
          Real-time updates are currently disconnected. Reconnecting...
        </div>
      )}

      {/* Appointments list */}
      <div className="space-y-2">
        {appointments.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No appointments scheduled for this day
          </div>
        ) : (
          appointments.map((appointment) => (
            <UpdateHighlight
              key={appointment.id}
              isHighlighted={highlightedAppointmentId === appointment.id}
              highlightColor="bg-blue-100"
            >
              <AppointmentCard appointment={appointment} />
            </UpdateHighlight>
          ))
        )}
      </div>
    </div>
  );
}

// Example appointment card component
function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-gray-100 text-gray-700';
      case 'checked_in':
        return 'bg-green-100 text-green-700';
      case 'in_room':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-purple-100 text-purple-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold">
              {appointment.patientName || 'Unknown Patient'}
            </h3>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                appointment.status
              )}`}
            >
              {appointment.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            <div>
              <strong>Time:</strong> {formatTime(appointment.scheduledStart)} -{' '}
              {formatTime(appointment.scheduledEnd)}
            </div>
            <div>
              <strong>Provider:</strong> {appointment.providerName || 'N/A'}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {appointment.status === 'scheduled' && (
            <button className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
              Check In
            </button>
          )}
          <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            View
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * INTEGRATION NOTES:
 *
 * 1. Add the useAppointmentUpdates hook to your existing SchedulePage
 * 2. Update your setAppointments calls in the callbacks
 * 3. Wrap appointment cards with UpdateHighlight for visual feedback
 * 4. Add RealtimeIndicator to your header
 * 5. Test by opening two browser tabs and creating/updating appointments
 *
 * The hook handles all WebSocket subscription/cleanup automatically.
 * Toast notifications will appear when appointments change.
 * Highlighted appointments will pulse briefly when updated.
 */
