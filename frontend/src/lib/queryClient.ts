import { QueryClient } from '@tanstack/react-query';

/**
 * React Query client configuration
 * Provides caching, background refetching, and error handling
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cached data is kept for 10 minutes before garbage collection
      gcTime: 10 * 60 * 1000,
      // Don't refetch on window focus (too aggressive for medical app)
      refetchOnWindowFocus: false,
      // Retry failed requests 1 time (not 3, to fail faster)
      retry: 1,
      // Retry delay
      retryDelay: 1000,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

/**
 * Query keys factory for consistent cache key generation
 */
export const queryKeys = {
  // Patients
  patients: {
    all: ['patients'] as const,
    list: () => [...queryKeys.patients.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.patients.all, 'detail', id] as const,
    search: (query: string) => [...queryKeys.patients.all, 'search', query] as const,
  },
  // Appointments
  appointments: {
    all: ['appointments'] as const,
    list: () => [...queryKeys.appointments.all, 'list'] as const,
    byDate: (date: string) => [...queryKeys.appointments.all, 'byDate', date] as const,
    byProvider: (providerId: string) => [...queryKeys.appointments.all, 'byProvider', providerId] as const,
    detail: (id: string) => [...queryKeys.appointments.all, 'detail', id] as const,
  },
  // Providers
  providers: {
    all: ['providers'] as const,
    list: () => [...queryKeys.providers.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.providers.all, 'detail', id] as const,
  },
  // Encounters
  encounters: {
    all: ['encounters'] as const,
    list: () => [...queryKeys.encounters.all, 'list'] as const,
    byPatient: (patientId: string) => [...queryKeys.encounters.all, 'byPatient', patientId] as const,
    detail: (id: string) => [...queryKeys.encounters.all, 'detail', id] as const,
  },
  // Tasks
  tasks: {
    all: ['tasks'] as const,
    list: () => [...queryKeys.tasks.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.tasks.all, 'detail', id] as const,
  },
  // Messages
  messages: {
    all: ['messages'] as const,
    list: () => [...queryKeys.messages.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.messages.all, 'detail', id] as const,
  },
  // Documents
  documents: {
    all: ['documents'] as const,
    byPatient: (patientId: string) => [...queryKeys.documents.all, 'byPatient', patientId] as const,
  },
  // Photos
  photos: {
    all: ['photos'] as const,
    byPatient: (patientId: string) => [...queryKeys.photos.all, 'byPatient', patientId] as const,
  },
  // Analytics
  analytics: {
    all: ['analytics'] as const,
    summary: () => [...queryKeys.analytics.all, 'summary'] as const,
  },
};
