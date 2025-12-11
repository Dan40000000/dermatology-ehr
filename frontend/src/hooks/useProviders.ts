import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchProviders } from '../api';
import { queryKeys } from '../lib/queryClient';

/**
 * Fetch all providers with caching
 */
export function useProviders() {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.providers.list(),
    queryFn: async () => {
      if (!session) throw new Error('Not authenticated');
      return fetchProviders(session.tenantId, session.accessToken);
    },
    enabled: !!session,
    select: (data) => data.providers || [],
    // Providers don't change often, so we can cache longer
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}
