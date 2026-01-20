import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProviders } from '../useProviders';
import type { ReactNode } from 'react';

const mockSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-123',
  refreshToken: 'refresh-123',
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'provider' as const,
  },
};

const mockProviders = [
  {
    id: 'provider-1',
    fullName: 'Dr. John Smith',
    specialty: 'Dermatology',
    npi: '1234567890',
    email: 'dr.smith@example.com',
    isActive: true,
  },
  {
    id: 'provider-2',
    fullName: 'Dr. Jane Doe',
    specialty: 'Dermatology',
    npi: '0987654321',
    email: 'dr.doe@example.com',
    isActive: true,
  },
];

const authMock = vi.hoisted(() => ({
  session: mockSession,
  user: mockSession.user,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchProviders: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMock,
}));

vi.mock('../../api', () => apiMocks);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.fetchProviders.mockResolvedValue({ providers: mockProviders });
  });

  it('should fetch and return providers when authenticated', async () => {
    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockProviders);
    expect(apiMocks.fetchProviders).toHaveBeenCalledWith('tenant-1', 'token-123');
  });

  it('should not fetch when session is null', () => {
    authMock.session = null;

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(apiMocks.fetchProviders).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.fetchProviders.mockRejectedValue(new Error('Not authenticated'));

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });

  it('should handle empty providers array', async () => {
    apiMocks.fetchProviders.mockResolvedValue({ providers: [] });

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should handle missing providers property', async () => {
    apiMocks.fetchProviders.mockResolvedValue({});

    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should cache providers with staleTime', async () => {
    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.fetchProviders).toHaveBeenCalledTimes(1);

    // Re-render should use cached data within staleTime
    const { result: result2 } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result2.current.isSuccess).toBe(true);
    });

    // Should still be called only once due to caching
    expect(apiMocks.fetchProviders).toHaveBeenCalledTimes(1);
  });

  it('should return providers in the expected format', async () => {
    const { result } = renderHook(() => useProviders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeInstanceOf(Array);
    expect(result.current.data![0]).toHaveProperty('id');
    expect(result.current.data![0]).toHaveProperty('fullName');
    expect(result.current.data![0]).toHaveProperty('specialty');
    expect(result.current.data![0]).toHaveProperty('npi');
    expect(result.current.data![0]).toHaveProperty('email');
    expect(result.current.data![0]).toHaveProperty('isActive');
  });

  it('should refetch when query is invalidated', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useProviders(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.fetchProviders).toHaveBeenCalledTimes(1);

    // Invalidate the query
    await queryClient.invalidateQueries({ queryKey: ['providers', 'list'] });

    await waitFor(() => {
      expect(apiMocks.fetchProviders).toHaveBeenCalledTimes(2);
    });
  });
});
