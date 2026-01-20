import { render, screen, waitFor, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import type { ReactNode } from 'react';

const mockLoginResponse = {
  tenantId: 'tenant-1',
  tokens: {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
  },
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'provider',
  },
};

const mockMeResponse = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Updated Name',
    role: 'provider',
  },
};

const apiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  fetchMe: vi.fn(),
}));

vi.mock('../../api', () => apiMocks);

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiMocks.login.mockResolvedValue(mockLoginResponse);
    apiMocks.fetchMe.mockResolvedValue(mockMeResponse);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should throw error when useAuth is used outside AuthProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleErrorSpy.mockRestore();
  });

  it('should provide initial state with no session', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should restore session from localStorage', () => {
    const storedSession = {
      tenantId: 'tenant-1',
      accessToken: 'stored-token',
      refreshToken: 'stored-refresh',
      user: {
        id: 'user-1',
        email: 'stored@example.com',
        fullName: 'Stored User',
        role: 'provider',
      },
    };

    localStorage.setItem('derm_session', JSON.stringify(storedSession));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.session).toEqual(storedSession);
    expect(result.current.user).toEqual(storedSession.user);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should handle invalid localStorage data', () => {
    localStorage.setItem('derm_session', 'invalid-json');

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should login successfully', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    expect(apiMocks.login).toHaveBeenCalledWith('tenant-1', 'test@example.com', 'password123');

    expect(result.current.session).toEqual({
      tenantId: 'tenant-1',
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-123',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'provider',
      },
    });

    expect(result.current.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'provider',
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should persist session to localStorage on login', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    const storedSession = JSON.parse(localStorage.getItem('derm_session')!);

    expect(storedSession).toEqual({
      tenantId: 'tenant-1',
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-123',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'provider',
      },
    });
  });

  it('should handle login errors', async () => {
    apiMocks.login.mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await expect(
      act(async () => {
        await result.current.login('tenant-1', 'test@example.com', 'wrong-password');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should set isLoading during login', async () => {
    let resolveLogin: (value: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    apiMocks.login.mockReturnValue(loginPromise);

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveLogin!(mockLoginResponse);
      await loginPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should logout successfully', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('derm_session')).toBeNull();
  });

  it('should refresh user data', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    expect(result.current.user?.fullName).toBe('Test User');

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(apiMocks.fetchMe).toHaveBeenCalledWith('tenant-1', 'access-token-123');
    expect(result.current.user?.fullName).toBe('Updated Name');
  });

  it('should not refresh user when no session', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(apiMocks.fetchMe).not.toHaveBeenCalled();
  });

  it('should set isLoading during refreshUser', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    let resolveRefresh: (value: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    apiMocks.fetchMe.mockReturnValue(refreshPromise);

    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.refreshUser();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveRefresh!(mockMeResponse);
      await refreshPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should handle refreshUser errors gracefully', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-1', 'test@example.com', 'password123');
    });

    apiMocks.fetchMe.mockRejectedValue(new Error('Fetch failed'));

    await act(async () => {
      await result.current.refreshUser();
    });

    // Should not crash, just fail silently
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should provide all context values', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    expect(result.current).toHaveProperty('session');
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('refreshUser');

    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.refreshUser).toBe('function');
  });

  it('should render children', () => {
    render(
      <AuthProvider>
        <div>Test Child</div>
      </AuthProvider>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });
});
