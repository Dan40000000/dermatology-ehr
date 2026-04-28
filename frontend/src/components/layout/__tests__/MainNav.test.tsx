import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainNav } from '../MainNav';

let mockRole = 'admin';
const mockSession = { tenantId: 'demo-tenant', accessToken: 'test-token' };
const apiMocks = vi.hoisted(() => ({
  fetchUnreadCount: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: mockSession,
    user: { role: mockRole },
  }),
}));

vi.mock('../../../api', () => apiMocks);

describe('MainNav role-based visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    apiMocks.fetchUnreadCount.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderNav = () =>
    render(
      <MemoryRouter initialEntries={['/home']}>
        <MainNav />
      </MemoryRouter>
    );

  it('shows Admin and hides removed Quality nav for admin', () => {
    mockRole = 'admin';
    renderNav();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Reminders & Recalls')).toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for provider', () => {
    mockRole = 'provider';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Reminders & Recalls')).toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for front desk', () => {
    mockRole = 'front_desk';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Financials')).not.toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Reminders & Recalls')).toBeInTheDocument();
  });

  it('shows billing revenue-cycle nav but hides analytics', () => {
    mockRole = 'billing';
    renderNav();
    expect(screen.getByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Clearinghouse')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('does not fetch unread mail count for roles without mail access', () => {
    mockRole = 'compliance_officer';
    renderNav();
    expect(screen.queryByText('Mail')).not.toBeInTheDocument();
    expect(apiMocks.fetchUnreadCount).not.toHaveBeenCalled();
  });
});
