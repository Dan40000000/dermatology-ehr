import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAccessMipsReportingWithSettings,
  canAccessModuleWithSettings,
  type ModuleKey,
  type Role,
} from '../../../config/moduleAccess';

const mocks = vi.hoisted(() => ({
  role: 'provider',
  qualityRoles: ['admin', 'provider', 'manager', 'compliance_officer'],
  fetchUnreadCount: vi.fn(),
  fetchPatients: vi.fn(),
  canAccessModule: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    passwordResetRequired: false,
    session: {
      tenantId: 'tenant-a',
      accessToken: 'test-token',
      user: { id: 'user-a', role: mocks.role, fullName: 'Test User' },
    },
    user: { id: 'user-a', role: mocks.role, fullName: 'Test User' },
  }),
}));

vi.mock('../../../contexts/AccessControlContext', () => ({
  useAccessControl: () => ({ canAccessModule: mocks.canAccessModule }),
}));

vi.mock('../../../api', () => ({
  fetchUnreadCount: mocks.fetchUnreadCount,
  fetchPatients: mocks.fetchPatients,
}));

vi.mock('../TopBar', () => ({ TopBar: () => <div data-testid="top-bar" /> }));
vi.mock('../DemoIntegrationBanner', () => ({ DemoIntegrationBanner: () => null }));
vi.mock('../Footer', () => ({ Footer: () => <footer /> }));

import { AppLayout } from '../AppLayout';
import { MainNav } from '../MainNav';

const DEFAULT_QUALITY_ROLES = ['admin', 'provider', 'manager', 'compliance_officer'];

function configureAccess() {
  mocks.canAccessModule.mockImplementation((moduleKey: ModuleKey, roles?: Role | Role[]) => {
    const effectiveRoles = roles || mocks.role;
    if (moduleKey === 'quality') {
      return canAccessMipsReportingWithSettings(effectiveRoles, { quality: mocks.qualityRoles });
    }
    return canAccessModuleWithSettings(effectiveRoles, moduleKey);
  });
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <MainNav />
    </MemoryRouter>,
  );
}

function renderRoute(initialEntry = '/mips-readiness') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/home" element={<h1>Home</h1>} />
          <Route path="/mips-readiness" element={<h1>MIPS Readiness</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('MIPS reporting frontend access intersection', () => {
  beforeEach(() => {
    mocks.role = 'provider';
    mocks.qualityRoles = [...DEFAULT_QUALITY_ROLES];
    mocks.fetchUnreadCount.mockResolvedValue({ count: 0 });
    mocks.fetchPatients.mockResolvedValue({ data: [] });
    configureAccess();
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('hides the MIPS nav and redirects the direct route when provider quality access is removed', () => {
    mocks.qualityRoles = ['admin', 'manager', 'compliance_officer'];

    renderNav();
    expect(screen.queryByRole('link', { name: /MIPS Readiness/i })).not.toBeInTheDocument();

    renderRoute();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MIPS Readiness' })).not.toBeInTheDocument();
  });

  it('does not grant MIPS nav or direct-route access to MA when tenant quality includes MA', () => {
    mocks.role = 'ma';
    mocks.qualityRoles = ['admin', 'ma'];

    renderNav();
    expect(screen.queryByRole('link', { name: /MIPS Readiness/i })).not.toBeInTheDocument();

    renderRoute();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MIPS Readiness' })).not.toBeInTheDocument();
  });

  it.each(DEFAULT_QUALITY_ROLES)('keeps default MIPS nav and direct-route access for %s', (role) => {
    mocks.role = role;

    renderNav();
    expect(screen.getByRole('link', { name: /MIPS Readiness/i })).toBeInTheDocument();

    renderRoute();
    expect(screen.getByRole('heading', { name: 'MIPS Readiness' })).toBeInTheDocument();
  });

  it.each(['nurse', 'billing', 'front_desk', 'staff'])('keeps unauthorized role %s out of MIPS nav and route', (role) => {
    mocks.role = role;
    mocks.qualityRoles = ['admin', role];

    renderNav();
    expect(screen.queryByRole('link', { name: /MIPS Readiness/i })).not.toBeInTheDocument();

    renderRoute();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });
});
