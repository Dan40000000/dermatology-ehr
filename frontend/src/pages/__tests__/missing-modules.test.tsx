import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RegistryPage } from '../RegistryPage';
import { ReferralsPage } from '../ReferralsPage';
import { ProtocolsPage } from '../ProtocolsPage';
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
  tenantId: mockSession.tenantId,
  accessToken: mockSession.accessToken,
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
  fetchRegistryDashboard: vi.fn().mockResolvedValue(null),
  fetchMelanomaRegistry: vi.fn().mockResolvedValue({ data: [] }),
  fetchPsoriasisRegistry: vi.fn().mockResolvedValue({ data: [] }),
  fetchAcneRegistry: vi.fn().mockResolvedValue({ data: [] }),
  fetchChronicTherapyRegistry: vi.fn().mockResolvedValue({ data: [] }),
  fetchRegistryAlerts: vi.fn().mockResolvedValue({ alerts: [] }),
  fetchPasiHistory: vi.fn().mockResolvedValue({ data: [] }),
  fetchProtocols: vi.fn().mockResolvedValue({ data: [] }),
  fetchProtocolStats: vi.fn().mockResolvedValue({
    active_protocols: 0,
    total_applications: 0,
    active_applications: 0,
    completed_applications: 0,
  }),
  deleteProtocol: vi.fn(),
  fetchPatients: vi.fn().mockResolvedValue({ patients: [] }),
  fetchReferrals: vi.fn().mockResolvedValue({ referrals: [] }),
  createReferral: vi.fn(),
  updateReferral: vi.fn(),
  fetchDueRecalls: vi.fn().mockResolvedValue({ recalls: [] }),
  fetchRecallCampaigns: vi.fn().mockResolvedValue({ campaigns: [] }),
  createRecallCampaign: vi.fn(),
  updateRecallCampaign: vi.fn(),
  deleteRecallCampaign: vi.fn(),
  generateRecalls: vi.fn(),
  fetchRecallHistory: vi.fn().mockResolvedValue({ history: [] }),
  fetchRecallStats: vi.fn().mockResolvedValue({
    overall: {
      total_recalls: 0,
      total_pending: 0,
      total_contacted: 0,
      total_scheduled: 0,
      total_completed: 0,
      total_dismissed: 0,
      contactRate: 0,
      conversionRate: 0,
    },
    byCampaign: [],
  }),
  generateAllRecalls: vi.fn(),
  bulkNotifyRecalls: vi.fn(),
  recordRecallContact: vi.fn(),
  updateRecallStatus: vi.fn(),
  exportRecalls: vi.fn(),
}));

describe('Missing module placeholder pages', () => {
  const cases = [
    { Component: RegistryPage, heading: 'Patient Registries', emptyTitle: 'No data available' },
    { Component: ReferralsPage, heading: 'Referrals', emptyTitle: 'No referrals yet' },
    { Component: FormsPage, heading: 'Forms', emptyTitle: 'No forms configured' },
    { Component: ProtocolsPage, heading: 'Treatment Protocols', emptyTitle: 'No protocols found' },
    { Component: HelpPage, heading: 'Role-Based Training Center', emptyTitle: 'First-time user onboarding with role-specific workflows, visual snapshots, and step-by-step checklists.' },
    { Component: RecallsPage, heading: 'Registry, Reminders & Recalls', emptyTitle: 'No campaigns yet' },
  ];

  cases.forEach(({ Component, heading, emptyTitle }) => {
    it(`renders ${heading} placeholder`, async () => {
      render(
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      );
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(await screen.findByText(emptyTitle)).toBeInTheDocument();
    });
  });
});
