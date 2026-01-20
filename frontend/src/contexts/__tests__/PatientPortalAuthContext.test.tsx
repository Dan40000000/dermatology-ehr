import { render, screen, renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatientPortalAuthProvider, usePatientPortalAuth, patientPortalFetch } from '../PatientPortalAuthContext';
import type { ReactNode } from 'vitest';

const mockPatient = {
  id: 'patient-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
};

describe('PatientPortalAuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should throw error when used outside provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => usePatientPortalAuth());
    }).toThrow('usePatientPortalAuth must be used within PatientPortalAuthProvider');

    consoleErrorSpy.mockRestore();
  });

  it('should provide initial state with no session', async () => {
    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.patient).toBeNull();
    expect(result.current.sessionToken).toBeNull();
    expect(result.current.tenantId).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should restore session from localStorage', async () => {
    localStorage.setItem('patientPortalToken', 'stored-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');
    localStorage.setItem('patientPortalPatient', JSON.stringify(mockPatient));

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessionToken).toBe('stored-token');
    expect(result.current.tenantId).toBe('tenant-1');
    expect(result.current.patient).toEqual(mockPatient);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should login successfully', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionToken: 'new-token',
        patient: mockPatient,
      }),
    });

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login('tenant-1', 'john@example.com', 'password123');
    });

    expect(result.current.sessionToken).toBe('new-token');
    expect(result.current.tenantId).toBe('tenant-1');
    expect(result.current.patient).toEqual(mockPatient);
    expect(result.current.isAuthenticated).toBe(true);

    expect(localStorage.getItem('patientPortalToken')).toBe('new-token');
    expect(localStorage.getItem('patientPortalTenantId')).toBe('tenant-1');
    expect(localStorage.getItem('patientPortalPatient')).toBe(JSON.stringify(mockPatient));
  });

  it('should handle login errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Invalid credentials',
      }),
    });

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.login('tenant-1', 'john@example.com', 'wrong-password');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should logout successfully', async () => {
    localStorage.setItem('patientPortalToken', 'stored-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');
    localStorage.setItem('patientPortalPatient', JSON.stringify(mockPatient));

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.sessionToken).toBeNull();
    expect(result.current.tenantId).toBeNull();
    expect(result.current.patient).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    expect(localStorage.getItem('patientPortalToken')).toBeNull();
    expect(localStorage.getItem('patientPortalTenantId')).toBeNull();
    expect(localStorage.getItem('patientPortalPatient')).toBeNull();
  });

  it('should handle logout errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    localStorage.setItem('patientPortalToken', 'stored-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');
    localStorage.setItem('patientPortalPatient', JSON.stringify(mockPatient));

    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    // Should still clear local state
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('patientPortalToken')).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it('should register successfully', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'Registration successful',
      }),
    });

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const registerData = {
      email: 'newuser@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
      dob: '1990-01-01',
    };

    await act(async () => {
      await result.current.register(registerData);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/patient-portal/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(registerData),
      })
    );
  });

  it('should handle registration errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Email already exists',
      }),
    });

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const registerData = {
      email: 'existing@example.com',
      password: 'password123',
      firstName: 'Existing',
      lastName: 'User',
      dob: '1990-01-01',
    };

    await expect(
      act(async () => {
        await result.current.register(registerData);
      })
    ).rejects.toThrow('Email already exists');
  });

  it('should set isLoading during login', async () => {
    let resolveLogin: (value: any) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    (global.fetch as any).mockReturnValue(loginPromise);

    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.login('tenant-1', 'john@example.com', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveLogin!({
        ok: true,
        json: async () => ({
          sessionToken: 'new-token',
          patient: mockPatient,
        }),
      });
      await loginPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should provide all context values', async () => {
    const { result } = renderHook(() => usePatientPortalAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PatientPortalAuthProvider>{children}</PatientPortalAuthProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty('patient');
    expect(result.current).toHaveProperty('sessionToken');
    expect(result.current).toHaveProperty('tenantId');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('register');

    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.register).toBe('function');
  });

  it('should render children', () => {
    render(
      <PatientPortalAuthProvider>
        <div>Test Child</div>
      </PatientPortalAuthProvider>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });
});

describe('patientPortalFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn();
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should throw error when not authenticated', async () => {
    await expect(patientPortalFetch('/api/test')).rejects.toThrow('Not authenticated');
  });

  it('should make authenticated request successfully', async () => {
    localStorage.setItem('patientPortalToken', 'test-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const result = await patientPortalFetch('/api/test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-Tenant-ID': 'tenant-1',
        }),
      })
    );

    expect(result).toEqual({ data: 'test' });
  });

  it('should handle 401 error and redirect to login', async () => {
    localStorage.setItem('patientPortalToken', 'expired-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await expect(patientPortalFetch('/api/test')).rejects.toThrow('Session expired');

    expect(localStorage.getItem('patientPortalToken')).toBeNull();
    expect(localStorage.getItem('patientPortalTenantId')).toBeNull();
    expect(window.location.href).toBe('/portal/login');
  });

  it('should handle non-401 errors', async () => {
    localStorage.setItem('patientPortalToken', 'test-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await expect(patientPortalFetch('/api/test')).rejects.toThrow('Server error');
  });

  it('should handle fetch errors', async () => {
    localStorage.setItem('patientPortalToken', 'test-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(patientPortalFetch('/api/test')).rejects.toThrow('Request failed');
  });

  it('should merge custom options', async () => {
    localStorage.setItem('patientPortalToken', 'test-token');
    localStorage.setItem('patientPortalTenantId', 'tenant-1');

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    await patientPortalFetch('/api/test', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
      headers: {
        'Custom-Header': 'custom-value',
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-Tenant-ID': 'tenant-1',
          'Custom-Header': 'custom-value',
        }),
      })
    );
  });
});
