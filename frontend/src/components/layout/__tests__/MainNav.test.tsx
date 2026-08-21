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

  const openMoreMenu = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /More/ }));
    });
  };

  it('shows Admin and hides removed Quality nav for admin', async () => {
    mockRole = 'admin';
    renderNav();
    await openMoreMenu();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for provider', async () => {
    mockRole = 'provider';
    renderNav();
    await openMoreMenu();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('hides Admin and removed Quality nav for front desk', async () => {
    mockRole = 'front_desk';
    renderNav();
    await openMoreMenu();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('Financials / Analytics')).not.toBeInTheDocument();
    expect(screen.getByText('Claims / Clearinghouse')).toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.getByText('Registry & Recalls')).toBeInTheDocument();
    expect(screen.queryByText('Registry')).not.toBeInTheDocument();
  });

  it('shows billing revenue-cycle nav but hides analytics', async () => {
    mockRole = 'billing';
    renderNav();
    await openMoreMenu();
    expect(screen.getByText('Financials / Analytics')).toBeInTheDocument();
    expect(screen.getByText('Claims / Clearinghouse')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('keeps revenue-cycle destinations reachable from the More menu', async () => {
    mockRole = 'billing';
    renderNav();
    await openMoreMenu();

    expect(screen.getByRole('menuitem', { name: 'Claims / Clearinghouse' })).toHaveAttribute('href', '/claims');
    expect(screen.getByRole('menuitem', { name: 'Financials / Analytics' })).toHaveAttribute('href', '/financials');
  });

  it('keeps the More dropdown inside the viewport when it opens near the right edge', async () => {
    mockRole = 'admin';
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });

    renderNav();

    const moreButton = screen.getByRole('button', { name: /More/ });
    const moreMenuItem = moreButton.closest('.ema-nav-item');
    expect(moreMenuItem).not.toBeNull();

    const rectSpy = vi.spyOn(moreMenuItem!, 'getBoundingClientRect').mockReturnValue({
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
      fireEvent.mouseEnter(moreMenuItem!);
    });

    expect(screen.getByRole('menu')).toHaveStyle({ left: '472px', top: '44px' });

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
