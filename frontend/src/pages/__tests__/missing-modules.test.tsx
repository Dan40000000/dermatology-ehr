import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { RegistryPage } from '../RegistryPage';
import { ReferralsPage } from '../ReferralsPage';
import { ProtocolsPage } from '../ProtocolsPage';
import { PreferencesPage } from '../PreferencesPage';
import { HelpPage } from '../HelpPage';
import { RecallsPage } from '../RecallsPage';
import { FormsPage } from '../FormsPage';

const mockSession = vi.hoisted(() => ({
  tenantId: 'test-tenant',
  accessToken: 'test-token',
  refreshToken: 'test-refresh',
  user: {
    id: 'user-123',
    email: 'user@example.com',
    fullName: 'Test User',
    role: 'admin',
  },
}));

const authMocks = vi.hoisted(() => ({
  session: mockSession,
  user: mockSession.user,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  toasts: [],
  showToast: vi.fn(() => 1),
  showSuccess: vi.fn(() => 1),
  showError: vi.fn(() => 1),
  showWarning: vi.fn(() => 1),
  showInfo: vi.fn(() => 1),
  dismissToast: vi.fn(),
  dismissAll: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => ({
  fetchRegistryCohorts: vi.fn().mockResolvedValue({ cohorts: [] }),
  fetchRegistryMembers: vi.fn().mockResolvedValue({ members: [] }),
  createRegistryCohort: vi.fn(),
  addRegistryMember: vi.fn(),
  removeRegistryMember: vi.fn(),
  fetchPatients: vi.fn().mockResolvedValue({ patients: [] }),
  fetchReferrals: vi.fn().mockResolvedValue({ referrals: [] }),
  createReferral: vi.fn(),
  updateReferral: vi.fn(),
}));

describe('Missing module placeholder pages', () => {
  const cases = [
    { Component: RegistryPage, heading: 'Registry', emptyTitle: 'No registries yet' },
    { Component: ReferralsPage, heading: 'Referrals', emptyTitle: 'No referrals yet' },
    { Component: FormsPage, heading: 'Forms', emptyTitle: 'No forms configured' },
    { Component: ProtocolsPage, heading: 'Protocols', emptyTitle: 'No protocols yet' },
    { Component: PreferencesPage, heading: 'Preferences', emptyTitle: 'No preferences configured' },
    { Component: HelpPage, heading: 'Help', emptyTitle: 'Help resources coming soon' },
    { Component: RecallsPage, heading: 'Recalls', emptyTitle: 'No recall campaigns' },
  ];

  cases.forEach(({ Component, heading, emptyTitle }) => {
    it(`renders ${heading} placeholder`, async () => {
      render(<Component />);
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(await screen.findByText(emptyTitle)).toBeInTheDocument();
    });
  });
});
