import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePAStatusPolling } from '../usePAStatusPolling';

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
  checkPARequestStatus: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMock,
}));

vi.mock('../../api', () => apiMocks);

describe('usePAStatusPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    authMock.session = mockSession;
    apiMocks.checkPARequestStatus.mockResolvedValue({ status: 'pending' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should poll PA status at regular intervals', async () => {
    apiMocks.checkPARequestStatus.mockResolvedValue({ status: 'pending' });

    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    // Initial check
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    // First interval
    vi.advanceTimersByTime(5000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
    });

    // Second interval
    vi.advanceTimersByTime(5000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(3);
    });

    expect(apiMocks.checkPARequestStatus).toHaveBeenCalledWith('tenant-1', 'token-123', 'pa-request-1');
  });

  it('should not poll when disabled', async () => {
    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: false,
        interval: 5000,
      })
    );

    vi.advanceTimersByTime(10000);

    expect(apiMocks.checkPARequestStatus).not.toHaveBeenCalled();
  });

  it('should not poll when paRequestId is null', async () => {
    renderHook(() =>
      usePAStatusPolling({
        paRequestId: null,
        enabled: true,
        interval: 5000,
      })
    );

    vi.advanceTimersByTime(10000);

    expect(apiMocks.checkPARequestStatus).not.toHaveBeenCalled();
  });

  it('should not poll when session is null', async () => {
    authMock.session = null;

    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    vi.advanceTimersByTime(10000);

    expect(apiMocks.checkPARequestStatus).not.toHaveBeenCalled();
  });

  it('should call onStatusChange when status changes', async () => {
    const onStatusChange = vi.fn();

    apiMocks.checkPARequestStatus
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'approved' });

    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
        onStatusChange,
      })
    );

    // Initial check
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    expect(onStatusChange).toHaveBeenCalledWith({ status: 'pending' });

    // Status changes on next poll
    vi.advanceTimersByTime(5000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
    });

    expect(onStatusChange).toHaveBeenCalledWith({ status: 'approved' });
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it('should not call onStatusChange when status is unchanged', async () => {
    const onStatusChange = vi.fn();

    apiMocks.checkPARequestStatus.mockResolvedValue({ status: 'pending' });

    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
        onStatusChange,
      })
    );

    // Initial check
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    expect(onStatusChange).toHaveBeenCalledTimes(1);

    // Status unchanged on next poll
    vi.advanceTimersByTime(5000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
    });

    // Should not call onStatusChange again
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('should handle API errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    apiMocks.checkPARequestStatus.mockRejectedValue(new Error('API error'));

    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalled();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to poll PA status:', expect.any(Error));

    // Should continue polling even after error
    vi.advanceTimersByTime(5000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
    });

    consoleErrorSpy.mockRestore();
  });

  it('should use default interval of 30 seconds', async () => {
    renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    // Should not poll before 30 seconds
    vi.advanceTimersByTime(20000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    // Should poll after 30 seconds
    vi.advanceTimersByTime(10000);
    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('should clear interval on unmount', async () => {
    const { unmount } = renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Should not poll after unmount
    vi.advanceTimersByTime(10000);
    expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
  });

  it('should restart polling when paRequestId changes', async () => {
    const { rerender } = renderHook(
      ({ paRequestId }) =>
        usePAStatusPolling({
          paRequestId,
          enabled: true,
          interval: 5000,
        }),
      {
        initialProps: { paRequestId: 'pa-request-1' },
      }
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledWith('tenant-1', 'token-123', 'pa-request-1');
    });

    // Change paRequestId
    rerender({ paRequestId: 'pa-request-2' });

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledWith('tenant-1', 'token-123', 'pa-request-2');
    });
  });

  it('should return checkStatus function', () => {
    const { result } = renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    expect(result.current.checkStatus).toBeDefined();
    expect(typeof result.current.checkStatus).toBe('function');
  });

  it('should allow manual status check with checkStatus', async () => {
    const { result } = renderHook(() =>
      usePAStatusPolling({
        paRequestId: 'pa-request-1',
        enabled: true,
        interval: 5000,
      })
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    // Manual check
    await result.current.checkStatus();

    expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(2);
  });

  it('should stop polling when enabled is set to false', async () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        usePAStatusPolling({
          paRequestId: 'pa-request-1',
          enabled,
          interval: 5000,
        }),
      {
        initialProps: { enabled: true },
      }
    );

    await waitFor(() => {
      expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
    });

    // Disable polling
    rerender({ enabled: false });

    // Should not poll after disabling
    vi.advanceTimersByTime(10000);
    expect(apiMocks.checkPARequestStatus).toHaveBeenCalledTimes(1);
  });
});
