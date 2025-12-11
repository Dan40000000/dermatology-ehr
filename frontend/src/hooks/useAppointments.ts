import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAppointments,
  createAppointment as apiCreateAppointment,
  updateAppointmentStatus as apiUpdateStatus,
  rescheduleAppointment as apiReschedule,
} from '../api';
import { queryKeys } from '../lib/queryClient';

/**
 * Fetch all appointments with caching
 */
export function useAppointments() {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.appointments.list(),
    queryFn: async () => {
      if (!session) throw new Error('Not authenticated');
      return fetchAppointments(session.tenantId, session.accessToken);
    },
    enabled: !!session,
    select: (data) => data.appointments || [],
  });
}

/**
 * Fetch appointments for a specific date
 */
export function useAppointmentsByDate(date: Date) {
  const { session } = useAuth();
  const dateString = date.toISOString().split('T')[0];

  return useQuery({
    queryKey: queryKeys.appointments.byDate(dateString),
    queryFn: async () => {
      if (!session) throw new Error('Not authenticated');
      const result = await fetchAppointments(session.tenantId, session.accessToken);
      const appointments = result.appointments || [];

      // Filter by date
      return appointments.filter((appt: any) => {
        const apptDate = new Date(appt.scheduledStart).toISOString().split('T')[0];
        return apptDate === dateString;
      });
    },
    enabled: !!session,
  });
}

/**
 * Create a new appointment
 */
export function useCreateAppointment() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (appointmentData: {
      patientId: string;
      providerId: string;
      locationId: string;
      appointmentTypeId: string;
      scheduledStart: string;
      scheduledEnd: string;
      notes?: string;
    }) => {
      if (!session) throw new Error('Not authenticated');
      return apiCreateAppointment(session.tenantId, session.accessToken, appointmentData);
    },
    onSuccess: () => {
      // Invalidate all appointment queries
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

/**
 * Update appointment status
 */
export function useUpdateAppointmentStatus() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ appointmentId, status }: { appointmentId: string; status: string }) => {
      if (!session) throw new Error('Not authenticated');
      return apiUpdateStatus(session.tenantId, session.accessToken, appointmentId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}

/**
 * Reschedule an appointment
 */
export function useRescheduleAppointment() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      appointmentId,
      scheduledStart,
      scheduledEnd,
    }: {
      appointmentId: string;
      scheduledStart: string;
      scheduledEnd: string;
    }) => {
      if (!session) throw new Error('Not authenticated');
      return apiReschedule(session.tenantId, session.accessToken, appointmentId, scheduledStart, scheduledEnd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
  });
}
