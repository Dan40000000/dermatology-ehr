import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RecallsPage } from '../RecallsPage';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  bulkNotifyRecalls: vi.fn(),
  createRecallCampaign: vi.fn(),
  deleteRecallCampaign: vi.fn(),
  exportRecalls: vi.fn(),
  fetchAcneRegistry: vi.fn(),
  fetchChronicTherapyRegistry: vi.fn(),
  fetchDueRecalls: vi.fn(),
  fetchMelanomaRegistry: vi.fn(),
  fetchPasiHistory: vi.fn(),
  fetchPatients: vi.fn(),
  fetchRecallCampaigns: vi.fn(),
  fetchRecallHistory: vi.fn(),
  fetchRecallStats: vi.fn(),
  fetchRegistryAlerts: vi.fn(),
  fetchRegistryDashboard: vi.fn(),
  fetchPsoriasisRegistry: vi.fn(),
  generateRecalls: vi.fn(),
  generateAllRecalls: vi.fn(),
  recordRecallContact: vi.fn(),
  updateRecallCampaign: vi.fn(),
  updateRecallStatus: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

describe('RecallsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.fetchRecallCampaigns.mockResolvedValue({
      campaigns: [
        {
          id: 'campaign-melanoma',
          name: 'Melanoma Surveillance',
          description: 'High-risk melanoma follow-up',
          recallType: 'Melanoma Surveillance',
          intervalMonths: 3,
          isActive: true,
        },
        {
          id: 'campaign-annual',
          name: 'Annual Skin Check',
          description: 'Annual screening',
          recallType: 'Annual Skin Check',
          intervalMonths: 12,
          isActive: true,
        },
      ],
    });

    apiMocks.fetchRecallStats.mockResolvedValue({
      overall: {
        total_pending: 2,
        total_contacted: 0,
        total_scheduled: 0,
        total_completed: 1,
        total_dismissed: 1,
        total_recalls: 4,
        contactRate: 25,
        conversionRate: 25,
      },
      byCampaign: [
        {
          id: 'campaign-melanoma',
          name: 'Melanoma Surveillance',
          recallType: 'Melanoma Surveillance',
          total_recalls: 3,
          pending: 1,
          contacted: 0,
          scheduled: 0,
          completed: 1,
          dismissed: 1,
        },
        {
          id: 'campaign-annual',
          name: 'Annual Skin Check',
          recallType: 'Annual Skin Check',
          total_recalls: 1,
          pending: 1,
          contacted: 0,
          scheduled: 0,
          completed: 0,
          dismissed: 0,
        },
      ],
    });
    apiMocks.fetchPatients.mockResolvedValue({ patients: [] });
    apiMocks.fetchRecallHistory.mockResolvedValue({ history: [] });
    apiMocks.fetchRegistryDashboard.mockResolvedValue(null);
    apiMocks.fetchMelanomaRegistry.mockResolvedValue({ data: [] });
    apiMocks.fetchPsoriasisRegistry.mockResolvedValue({ data: [] });
    apiMocks.fetchAcneRegistry.mockResolvedValue({ data: [] });
    apiMocks.fetchChronicTherapyRegistry.mockResolvedValue({ data: [] });
    apiMocks.fetchRegistryAlerts.mockResolvedValue({ alerts: [] });
    apiMocks.fetchPasiHistory.mockResolvedValue({ data: [] });

    apiMocks.fetchDueRecalls.mockImplementation((_tenantId: string, _accessToken: string, filters?: { campaignId?: string }) => {
      if (filters?.campaignId === 'campaign-melanoma') {
        return Promise.resolve({
          recalls: [
            {
              id: 'recall-pending',
              patientId: 'patient-1',
              firstName: 'Mila',
              lastName: 'Mole',
              phone: '555-0101',
              campaignId: 'campaign-melanoma',
              campaignName: 'Melanoma Surveillance',
              recallType: 'Melanoma Surveillance',
              dueDate: '2026-05-01',
              status: 'pending',
              contactAttempts: 0,
            },
            {
              id: 'recall-completed',
              patientId: 'patient-2',
              firstName: 'Cal',
              lastName: 'Clear',
              phone: '555-0102',
              campaignId: 'campaign-melanoma',
              campaignName: 'Melanoma Surveillance',
              recallType: 'Melanoma Surveillance',
              dueDate: '2026-03-01',
              status: 'completed',
              contactAttempts: 2,
            },
            {
              id: 'recall-dismissed',
              patientId: 'patient-3',
              firstName: 'Dina',
              lastName: 'Dismissed',
              campaignId: 'campaign-melanoma',
              campaignName: 'Melanoma Surveillance',
              recallType: 'Melanoma Surveillance',
              dueDate: '2026-04-01',
              status: 'dismissed',
              contactAttempts: 1,
            },
          ],
        });
      }

      return Promise.resolve({
        recalls: [
          {
            id: 'recall-annual',
            patientId: 'patient-4',
            firstName: 'Ana',
            lastName: 'Annual',
            phone: '555-0104',
            campaignId: 'campaign-annual',
            campaignName: 'Annual Skin Check',
            recallType: 'Annual Skin Check',
            dueDate: '2026-06-01',
            status: 'pending',
            contactAttempts: 0,
          },
        ],
      });
    });
  });

  it('drills into a recall campaign and shows every enrolled patient status', async () => {
    render(
      <MemoryRouter>
        <RecallsPage />
      </MemoryRouter>,
    );

    const melanomaCard = await screen.findByRole('button', { name: /Melanoma Surveillance/i });
    fireEvent.click(melanomaCard);

    await waitFor(() =>
      expect(apiMocks.fetchDueRecalls).toHaveBeenLastCalledWith('tenant-1', 'token-1', {
        campaignId: 'campaign-melanoma',
        status: '',
        startDate: '',
        endDate: '',
      }),
    );

    expect(await screen.findByText('Melanoma Surveillance Patients (3)')).toBeInTheDocument();
    expect(screen.getByText(/Showing the patient list for/i)).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Mole, Mila')).toBeInTheDocument();
    expect(within(table).getByText('Clear, Cal')).toBeInTheDocument();
    expect(within(table).getByText('Dismissed, Dina')).toBeInTheDocument();
    expect(within(table).getByText('pending')).toBeInTheDocument();
    expect(within(table).getByText('completed')).toBeInTheDocument();
    expect(within(table).getByText('dismissed')).toBeInTheDocument();
  });
});
