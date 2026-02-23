import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainNav } from '../MainNav';

let mockRole = 'admin';
const mockSession = { tenantId: 'demo-tenant', accessToken: 'test-token' };

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: mockSession,
    user: { role: mockRole },
  }),
}));

vi.mock('../../../api', () => ({
  fetchUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
}));

describe('MainNav role-based visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Reminders & Recalls')).toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for front desk', () => {
    mockRole = 'front_desk';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Reminders & Recalls')).toBeInTheDocument();
  });
});
