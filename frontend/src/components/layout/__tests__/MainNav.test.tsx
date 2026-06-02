import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
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
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for provider', () => {
    mockRole = 'provider';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for front desk', () => {
    mockRole = 'front_desk';
    renderNav();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('Financials / Analytics')).not.toBeInTheDocument();
    expect(screen.getByText('Claims / Clearinghouse')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('shows billing revenue-cycle nav but hides analytics', () => {
    mockRole = 'billing';
    renderNav();
    expect(screen.getByText('Financials / Analytics')).toBeInTheDocument();
    expect(screen.getByText('Claims / Clearinghouse')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('links clearinghouse submenu directly to ERA, EFT, and reconciliation tabs', async () => {
    mockRole = 'billing';
    renderNav();

    const claimsMenuLink = screen.getByRole('link', { name: /Claims \/ Clearinghouse/ });
    const claimsMenuItem = claimsMenuLink.closest('.ema-nav-item');
    expect(claimsMenuItem).not.toBeNull();

    await act(async () => {
      fireEvent.mouseEnter(claimsMenuItem!);
    });

    expect(screen.getByRole('menuitem', { name: 'ERA' })).toHaveAttribute('href', '/clearinghouse?tab=era');
    expect(screen.getByRole('menuitem', { name: 'EFT' })).toHaveAttribute('href', '/clearinghouse?tab=eft');
    expect(screen.getByRole('menuitem', { name: 'Reconciliation' })).toHaveAttribute(
      'href',
      '/clearinghouse?tab=reconciliation',
    );
  });

  it('keeps the Admin dropdown inside the viewport when it opens near the right edge', async () => {
    mockRole = 'admin';
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });

    renderNav();

    const adminMenuLink = screen.getByRole('link', { name: /Admin/ });
    const adminMenuItem = adminMenuLink.closest('.ema-nav-item');
    expect(adminMenuItem).not.toBeNull();

    const rectSpy = vi.spyOn(adminMenuItem!, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 930,
      right: 1000,
      top: 0,
      width: 70,
      x: 930,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      fireEvent.mouseEnter(adminMenuItem!);
    });

    expect(screen.getByRole('menu')).toHaveStyle({ left: '732px', top: '44px' });

    rectSpy.mockRestore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
  });

  it('does not fetch unread mail count for roles without mail access', () => {
    mockRole = 'compliance_officer';
    renderNav();
    expect(screen.queryByText('Mail')).not.toBeInTheDocument();
    expect(apiMocks.fetchUnreadCount).not.toHaveBeenCalled();
  });
});
