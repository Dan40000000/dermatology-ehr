import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogPage } from '../AuditLogPage';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'user-1', role: 'admin' },
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

const buildResponse = (payload: any, ok = true) =>
  Promise.resolve({
    ok,
    json: async () => payload,
    blob: async () => new Blob(['data']),
  } as Response);

describe('AuditLogPage', () => {
  beforeEach(() => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'user-1', role: 'admin' },
    };
  });

  it('loads audit data, expands rows, and opens user activity modal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/auth/users')) {
        return buildResponse({ users: [{ id: 'user-1', fullName: 'Admin User', email: 'admin@example.com' }] });
      }
      if (url.includes('/api/audit/summary')) {
        return buildResponse({
          totalEvents: 1,
          uniqueUsers: 1,
          failedLogins: 0,
          resourceAccesses: 1,
          actionBreakdown: [{ action: 'login', count: '1' }],
          resourceBreakdown: [{ resourceType: 'auth', count: '1' }],
        });
      }
      if (url.includes('/api/audit/user/')) {
        return buildResponse({
          logs: [
            {
              id: 'activity-1',
              action: 'login',
              resourceType: 'auth',
              resourceId: 'token-1',
              createdAt: new Date().toISOString(),
              ipAddress: '10.0.0.1',
            },
          ],
        });
      }
      return buildResponse({
        logs: [
          {
            id: 'log-1',
            userId: 'user-1',
            userName: 'Admin User',
            userEmail: 'admin@example.com',
            action: 'login',
            resourceType: 'auth',
            resourceId: 'token-1',
            ipAddress: '10.0.0.1',
            userAgent: 'Agent',
            changes: { ok: true },
            metadata: {},
            severity: 'low',
            status: 'success',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      });
    });

    render(<AuditLogPage />);

    expect(await screen.findByText('Audit Log Viewer')).toBeInTheDocument();
    expect(screen.getByText('Total Events (Today)')).toBeInTheDocument();
    expect(screen.getAllByText('Admin User').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('login'));
    expect(await screen.findByText('USER AGENT')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Activity' }));
    expect(await screen.findByText('User Activity Timeline')).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('applies filters and clears them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/audit/summary')) {
        return buildResponse({
          totalEvents: 0,
          uniqueUsers: 0,
          failedLogins: 0,
          resourceAccesses: 0,
          actionBreakdown: [],
          resourceBreakdown: [],
        });
      }
      if (url.includes('/api/auth/users')) {
        return buildResponse({ users: [] });
      }
      return buildResponse({ logs: [], total: 0 });
    });

    render(<AuditLogPage />);

    await screen.findByText('Audit Log Viewer');
    fireEvent.change(screen.getByPlaceholderText('Search all fields...'), { target: { value: 'token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByPlaceholderText('Search all fields...')).toHaveValue('');

    fetchSpy.mockRestore();
  });
});
