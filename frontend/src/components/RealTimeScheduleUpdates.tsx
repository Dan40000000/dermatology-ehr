import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppointmentEvents } from '../hooks/useWebSocket';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';

/**
 * Example component demonstrating real-time schedule updates
 * Drop this component into your schedule view to enable real-time updates
 */
export function RealTimeScheduleUpdates() {
  const queryClient = useQueryClient();

  // Subscribe to appointment events and invalidate queries to refetch data
  useAppointmentEvents({
    onCreated: (data) => {
      console.log('Appointment created:', data);
      // Invalidate appointments query to refetch
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onUpdated: (data) => {
      console.log('Appointment updated:', data);
      // Invalidate appointments query to refetch
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onCancelled: (data) => {
      console.log('Appointment cancelled:', data);
      // Invalidate appointments query to refetch
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onPatientCheckIn: (data) => {
      console.log('Patient checked in:', data);
      // Invalidate appointments query to refetch
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <>
      {/* Show connection status indicator */}
      <ConnectionStatusIndicator />
    </>
  );
}

/**
 * Example usage in your schedule component:
 *
 * import { RealTimeScheduleUpdates } from './components/RealTimeScheduleUpdates';
 *
 * function SchedulePage() {
 *   return (
 *     <div>
 *       <RealTimeScheduleUpdates />
 *       {/* Your schedule UI here *\/}
 *     </div>
 *   );
 * }
 */
