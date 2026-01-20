import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePatients, useCreatePatient, useSearchPatients } from '../usePatients';
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

const mockPatients = [
  {
    id: 'patient-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '555-0100',
    dateOfBirth: '1990-01-01',
  },
  {
    id: 'patient-2',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '555-0200',
    dateOfBirth: '1985-05-15',
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
  fetchPatients: vi.fn(),
  createPatient: vi.fn(),
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

describe('usePatients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.fetchPatients.mockResolvedValue({ patients: mockPatients });
  });

  it('should fetch and return patients when authenticated', async () => {
    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockPatients);
    expect(apiMocks.fetchPatients).toHaveBeenCalledWith('tenant-1', 'token-123');
  });

  it('should not fetch when session is null', () => {
    authMock.session = null;

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.fetchPatients.mockRejectedValue(new Error('Not authenticated'));

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });

  it('should handle empty patients array', async () => {
    apiMocks.fetchPatients.mockResolvedValue({ patients: [] });

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should handle missing patients property', async () => {
    apiMocks.fetchPatients.mockResolvedValue({});

    const { result } = renderHook(() => usePatients(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe('useCreatePatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.createPatient.mockResolvedValue({
      patient: { id: 'new-patient', firstName: 'New', lastName: 'Patient' },
    });
  });

  it('should create a patient successfully', async () => {
    const { result } = renderHook(() => useCreatePatient(), {
      wrapper: createWrapper(),
    });

    const patientData = {
      firstName: 'New',
      lastName: 'Patient',
      email: 'new@example.com',
      phone: '555-0300',
      dateOfBirth: '1995-03-20',
    };

    await waitFor(() => {
      result.current.mutate(patientData);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.createPatient).toHaveBeenCalledWith('tenant-1', 'token-123', patientData);
  });

  it('should handle create errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.createPatient.mockRejectedValue(new Error('Failed to create patient'));

    const { result } = renderHook(() => useCreatePatient(), {
      wrapper: createWrapper(),
    });

    const patientData = {
      firstName: 'New',
      lastName: 'Patient',
    };

    await waitFor(() => {
      result.current.mutate(patientData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Failed to create patient'));

    consoleErrorSpy.mockRestore();
  });

  it('should throw error when not authenticated', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.session = null;

    const { result } = renderHook(() => useCreatePatient(), {
      wrapper: createWrapper(),
    });

    const patientData = {
      firstName: 'New',
      lastName: 'Patient',
    };

    await waitFor(() => {
      result.current.mutate(patientData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });
});

describe('useSearchPatients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.fetchPatients.mockResolvedValue({ patients: mockPatients });
  });

  it('should search patients by first name', async () => {
    const { result } = renderHook(() => useSearchPatients('john'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].firstName).toBe('John');
  });

  it('should search patients by last name', async () => {
    const { result } = renderHook(() => useSearchPatients('smith'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].lastName).toBe('Smith');
  });

  it('should search patients by email', async () => {
    const { result } = renderHook(() => useSearchPatients('jane@example'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].email).toBe('jane@example.com');
  });

  it('should search patients by phone', async () => {
    const { result } = renderHook(() => useSearchPatients('555-0100'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].phone).toBe('555-0100');
  });

  it('should return all patients when search term is empty', async () => {
    const { result } = renderHook(() => useSearchPatients(''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockPatients);
  });

  it('should not search when term is less than 2 characters', () => {
    const { result } = renderHook(() => useSearchPatients('j'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });

  it('should return empty array when no matches found', async () => {
    const { result } = renderHook(() => useSearchPatients('nomatch'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should be case insensitive', async () => {
    const { result } = renderHook(() => useSearchPatients('JOHN'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].firstName).toBe('John');
  });

  it('should not search when not authenticated', () => {
    authMock.session = null;

    const { result } = renderHook(() => useSearchPatients('john'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });
});
