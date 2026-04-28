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

const providerUserWithRoles = {
  id: 'user-1',
  email: 'test@example.com',
  fullName: 'Test User',
  role: 'provider',
  secondaryRoles: [] as string[],
  roles: ['provider'] as string[],
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiMocks.login.mockResolvedValue(mockLoginResponse);
    apiMocks.fetchMe.mockResolvedValue(mockMeResponse);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
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

    expect(result.current.session).toEqual({
      ...storedSession,
      user: {
        ...storedSession.user,
        secondaryRoles: [],
        roles: ['provider'],
      },
    });
    expect(result.current.user).toEqual({
      ...storedSession.user,
      secondaryRoles: [],
      roles: ['provider'],
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should upgrade a stored offline demo session when the backend is available again', async () => {
    vi.stubEnv('VITE_ENABLE_LOCAL_DEMO', 'true');

    const storedSession = {
      tenantId: 'tenant-demo',
      accessToken: 'header.payload.demo',
      refreshToken: 'demo-refresh',
      user: {
        id: 'demo-provider@demo.practice',
        email: 'provider@demo.practice',
        fullName: 'Dr. James Whitfield, MD',
        role: 'provider',
      },
    };

    apiMocks.login.mockResolvedValueOnce({
      tenantId: 'tenant-demo',
      tokens: {
        accessToken: 'real-provider-token',
        refreshToken: 'real-provider-refresh',
      },
      user: {
        id: 'u-provider',
        email: 'provider@demo.practice',
        fullName: 'Derm Provider',
        role: 'provider',
      },
    });

    localStorage.setItem('derm_session', JSON.stringify(storedSession));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.session?.accessToken).toBe('real-provider-token');
    });

    expect(apiMocks.login).toHaveBeenCalledWith('tenant-demo', 'provider@demo.practice', 'Password123!');
    expect(result.current.user).toMatchObject({
      id: 'u-provider',
      email: 'provider@demo.practice',
      role: 'provider',
      roles: ['provider'],
    });
  });

  it('should keep a stored offline demo session when the backend is still unavailable', async () => {
    vi.stubEnv('VITE_ENABLE_LOCAL_DEMO', 'true');

    const storedSession = {
      tenantId: 'tenant-demo',
      accessToken: 'header.payload.demo',
      refreshToken: 'demo-refresh',
      user: {
        id: 'demo-provider@demo.practice',
        email: 'provider@demo.practice',
        fullName: 'Dr. James Whitfield, MD',
        role: 'provider',
      },
    };

    apiMocks.login.mockRejectedValueOnce(new Error('Failed to fetch'));

    localStorage.setItem('derm_session', JSON.stringify(storedSession));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await waitFor(() => {
      expect(apiMocks.login).toHaveBeenCalledWith('tenant-demo', 'provider@demo.practice', 'Password123!');
    });

    expect(result.current.session?.accessToken).toBe('header.payload.demo');
    expect(result.current.user).toMatchObject({
      email: 'provider@demo.practice',
      role: 'provider',
      roles: ['provider'],
    });
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
      user: providerUserWithRoles,
    });

    expect(result.current.user).toEqual(providerUserWithRoles);

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should use backend-issued tokens for demo provider login when the API is available', async () => {
    apiMocks.login.mockResolvedValueOnce({
      ...mockLoginResponse,
      tenantId: 'tenant-demo',
      tokens: {
        accessToken: 'real-provider-token',
        refreshToken: 'real-provider-refresh',
      },
      user: {
        id: 'u-provider',
        email: 'provider@demo.practice',
        fullName: 'Derm Provider',
        role: 'provider',
      },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-demo', 'provider@demo.practice', 'Password123!');
    });

    expect(apiMocks.login).toHaveBeenCalledWith('tenant-demo', 'provider@demo.practice', 'Password123!');
    expect(result.current.session?.accessToken).toBe('real-provider-token');
    expect(result.current.session?.refreshToken).toBe('real-provider-refresh');
    expect(result.current.user).toMatchObject({
      id: 'u-provider',
      email: 'provider@demo.practice',
      role: 'provider',
      roles: ['provider'],
    });
  });

  it('should only fall back to local demo provider login when the API is unavailable', async () => {
    vi.stubEnv('VITE_ENABLE_LOCAL_DEMO', 'true');
    apiMocks.login.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      ),
    });

    await act(async () => {
      await result.current.login('tenant-demo', 'provider@demo.practice', 'Password123!');
    });

    expect(apiMocks.login).toHaveBeenCalledWith('tenant-demo', 'provider@demo.practice', 'Password123!');
    expect(result.current.session?.accessToken).toContain('.demo');
    expect(result.current.session?.refreshToken).toBe('demo-refresh');
    expect(result.current.user).toMatchObject({
      email: 'provider@demo.practice',
      role: 'provider',
      roles: ['provider'],
    });
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
      user: providerUserWithRoles,
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
