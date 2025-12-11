import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchPatients, createPatient as apiCreatePatient } from '../api';
import { queryKeys } from '../lib/queryClient';

/**
 * Fetch all patients with caching
 */
export function usePatients() {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.patients.list(),
    queryFn: async () => {
      if (!session) throw new Error('Not authenticated');
      return fetchPatients(session.tenantId, session.accessToken);
    },
    enabled: !!session,
    select: (data) => data.patients || [],
  });
}

/**
 * Create a new patient
 */
export function useCreatePatient() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientData: {
      firstName: string;
      lastName: string;
      dateOfBirth?: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }) => {
      if (!session) throw new Error('Not authenticated');
      return apiCreatePatient(session.tenantId, session.accessToken, patientData);
    },
    onSuccess: () => {
      // Invalidate patients list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.list() });
    },
  });
}

/**
 * Search patients (with debouncing recommended)
 */
export function useSearchPatients(searchTerm: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.patients.search(searchTerm),
    queryFn: async () => {
      if (!session) throw new Error('Not authenticated');
      const result = await fetchPatients(session.tenantId, session.accessToken);
      const patients = result.patients || [];

      if (!searchTerm) return patients;

      const term = searchTerm.toLowerCase();
      return patients.filter((p: any) =>
        p.firstName?.toLowerCase().includes(term) ||
        p.lastName?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.phone?.includes(searchTerm)
      );
    },
    enabled: !!session && searchTerm.length >= 2,
  });
}
