import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAppointments,
  useAppointmentsByDate,
  useCreateAppointment,
  useUpdateAppointmentStatus,
  useRescheduleAppointment,
} from '../useAppointments';
import type { ReactNode } from 'react';

const mockSession = vi.hoisted(() => ({
  tenantId: 'tenant-1',
  accessToken: 'token-123',
  refreshToken: 'refresh-123',
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'provider' as const,
  },
}));

const mockAppointments = [
  {
    id: 'appt-1',
    patientId: 'patient-1',
    providerId: 'provider-1',
    scheduledStart: '2024-01-15T09:00:00Z',
    scheduledEnd: '2024-01-15T09:30:00Z',
    status: 'scheduled',
  },
  {
    id: 'appt-2',
    patientId: 'patient-2',
    providerId: 'provider-1',
    scheduledStart: '2024-01-15T10:00:00Z',
    scheduledEnd: '2024-01-15T10:30:00Z',
    status: 'checked_in',
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
  fetchAppointments: vi.fn(),
  createAppointment: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  rescheduleAppointment: vi.fn(),
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

describe('useAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: mockAppointments });
  });

  it('should fetch and return appointments when authenticated', async () => {
    const { result } = renderHook(() => useAppointments(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAppointments);
    expect(apiMocks.fetchAppointments).toHaveBeenCalledWith('tenant-1', 'token-123');
  });

  it('should not fetch when session is null', () => {
    authMock.session = null;

    const { result } = renderHook(() => useAppointments(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(apiMocks.fetchAppointments).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.fetchAppointments.mockRejectedValue(new Error('Not authenticated'));

    const { result } = renderHook(() => useAppointments(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });

  it('should handle empty appointments array', async () => {
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: [] });

    const { result } = renderHook(() => useAppointments(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe('useAppointmentsByDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: mockAppointments });
  });

  it('should fetch appointments for specific date', async () => {
    const date = new Date('2024-01-15');
    const { result } = renderHook(() => useAppointmentsByDate(date), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.fetchAppointments).toHaveBeenCalledWith('tenant-1', 'token-123', {
      date: '2024-01-15',
    });
    expect(result.current.data).toEqual(mockAppointments);
  });

  it('should not fetch when session is null', () => {
    authMock.session = null;
    const date = new Date('2024-01-15');

    const { result } = renderHook(() => useAppointmentsByDate(date), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(apiMocks.fetchAppointments).not.toHaveBeenCalled();
  });
});

describe('useCreateAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.createAppointment.mockResolvedValue({
      appointment: { id: 'new-appt', status: 'scheduled' },
    });
  });

  it('should create an appointment successfully', async () => {
    const { result } = renderHook(() => useCreateAppointment(), {
      wrapper: createWrapper(),
    });

    const appointmentData = {
      patientId: 'patient-1',
      providerId: 'provider-1',
      locationId: 'location-1',
      appointmentTypeId: 'type-1',
      scheduledStart: '2024-01-20T09:00:00Z',
      scheduledEnd: '2024-01-20T09:30:00Z',
      notes: 'Annual checkup',
    };

    await waitFor(() => {
      result.current.mutate(appointmentData);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.createAppointment).toHaveBeenCalledWith(
      'tenant-1',
      'token-123',
      appointmentData
    );
  });

  it('should handle create errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.createAppointment.mockRejectedValue(new Error('Failed to create appointment'));

    const { result } = renderHook(() => useCreateAppointment(), {
      wrapper: createWrapper(),
    });

    const appointmentData = {
      patientId: 'patient-1',
      providerId: 'provider-1',
      locationId: 'location-1',
      appointmentTypeId: 'type-1',
      scheduledStart: '2024-01-20T09:00:00Z',
      scheduledEnd: '2024-01-20T09:30:00Z',
    };

    await waitFor(() => {
      result.current.mutate(appointmentData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Failed to create appointment'));

    consoleErrorSpy.mockRestore();
  });

  it('should throw error when not authenticated', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.session = null;

    const { result } = renderHook(() => useCreateAppointment(), {
      wrapper: createWrapper(),
    });

    const appointmentData = {
      patientId: 'patient-1',
      providerId: 'provider-1',
      locationId: 'location-1',
      appointmentTypeId: 'type-1',
      scheduledStart: '2024-01-20T09:00:00Z',
      scheduledEnd: '2024-01-20T09:30:00Z',
    };

    await waitFor(() => {
      result.current.mutate(appointmentData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });
});

describe('useUpdateAppointmentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.updateAppointmentStatus.mockResolvedValue({ success: true });
  });

  it('should update appointment status successfully', async () => {
    const { result } = renderHook(() => useUpdateAppointmentStatus(), {
      wrapper: createWrapper(),
    });

    const updateData = {
      appointmentId: 'appt-1',
      status: 'completed',
    };

    await waitFor(() => {
      result.current.mutate(updateData);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.updateAppointmentStatus).toHaveBeenCalledWith(
      'tenant-1',
      'token-123',
      'appt-1',
      'completed'
    );
  });

  it('should handle update errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.updateAppointmentStatus.mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useUpdateAppointmentStatus(), {
      wrapper: createWrapper(),
    });

    const updateData = {
      appointmentId: 'appt-1',
      status: 'completed',
    };

    await waitFor(() => {
      result.current.mutate(updateData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Update failed'));

    consoleErrorSpy.mockRestore();
  });
});

describe('useRescheduleAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.rescheduleAppointment.mockResolvedValue({ success: true });
  });

  it('should reschedule appointment successfully', async () => {
    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: createWrapper(),
    });

    const rescheduleData = {
      appointmentId: 'appt-1',
      scheduledStart: '2024-01-22T10:00:00Z',
      scheduledEnd: '2024-01-22T10:30:00Z',
    };

    await waitFor(() => {
      result.current.mutate(rescheduleData);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(apiMocks.rescheduleAppointment).toHaveBeenCalledWith(
      'tenant-1',
      'token-123',
      'appt-1',
      '2024-01-22T10:00:00Z',
      '2024-01-22T10:30:00Z'
    );
  });

  it('should handle reschedule errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    apiMocks.rescheduleAppointment.mockRejectedValue(new Error('Reschedule failed'));

    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: createWrapper(),
    });

    const rescheduleData = {
      appointmentId: 'appt-1',
      scheduledStart: '2024-01-22T10:00:00Z',
      scheduledEnd: '2024-01-22T10:30:00Z',
    };

    await waitFor(() => {
      result.current.mutate(rescheduleData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Reschedule failed'));

    consoleErrorSpy.mockRestore();
  });

  it('should throw error when not authenticated', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.session = null;

    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: createWrapper(),
    });

    const rescheduleData = {
      appointmentId: 'appt-1',
      scheduledStart: '2024-01-22T10:00:00Z',
      scheduledEnd: '2024-01-22T10:30:00Z',
    };

    await waitFor(() => {
      result.current.mutate(rescheduleData);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));

    consoleErrorSpy.mockRestore();
  });
});
