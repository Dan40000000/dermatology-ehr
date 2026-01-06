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

  it('shows Admin and Quality for admin', () => {
    mockRole = 'admin';
    renderNav();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
  });

  it('shows Quality and hides Admin for provider', () => {
    mockRole = 'provider';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
  });

  it('hides Admin and Quality for front desk', () => {
    mockRole = 'front_desk';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
  });
});
