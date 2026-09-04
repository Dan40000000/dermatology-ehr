import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

const apiMocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
}));

vi.mock('../../../api', () => apiMocks);

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    passwordResetRequired: false,
    session: {
      tenantId: 'tenant-demo',
      accessToken: 'access-token',
      user: { id: 'user-1', role: 'admin', fullName: 'Demo Admin' },
    },
    user: { id: 'user-1', role: 'admin', fullName: 'Demo Admin' },
  }),
}));

vi.mock('../../../contexts/AccessControlContext', () => ({
  useAccessControl: () => ({ canAccessModule: () => true }),
}));

vi.mock('../TopBar', () => ({ TopBar: () => <div data-testid="top-bar" /> }));
vi.mock('../MainNav', () => ({
  MainNav: () => <nav aria-label="Main navigation" />,
  MobileNav: () => <nav aria-label="Mobile navigation" />,
}));
vi.mock('../DemoIntegrationBanner', () => ({ DemoIntegrationBanner: () => null }));
vi.mock('../Footer', () => ({ Footer: () => <footer /> }));

import { AppLayout } from '../AppLayout';

function HomeRoute() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Home</h1>
      <button type="button" onClick={() => navigate('/next')}>Go to next page</button>
    </>
  );
}

function NextRoute() {
  return <h1>Next page</h1>;
}

describe('AppLayout route-change focus management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMocks.fetchPatients.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('focuses the new page heading after navigation without focusing on initial render', async () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<HomeRoute />} />
            <Route path="/next" element={<NextRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const homeHeading = screen.getByRole('heading', { name: 'Home' });
    expect(homeHeading).not.toHaveFocus();
    expect(homeHeading).not.toHaveAttribute('tabindex', '-1');

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(screen.getByRole('heading', { name: 'Next page' })).not.toHaveFocus();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const nextHeading = screen.getByRole('heading', { name: 'Next page' });
    expect(nextHeading).toHaveAttribute('tabindex', '-1');
    expect(nextHeading).toHaveFocus();
  });
});
