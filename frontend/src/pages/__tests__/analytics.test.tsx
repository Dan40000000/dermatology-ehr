import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

const mockSession = vi.hoisted(() => ({
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  refreshToken: 'refresh-1',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'Test User',
    role: 'admin',
  },
}));

const authMocks = vi.hoisted(() => ({
  session: mockSession,
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchDashboardKPIs: vi.fn(),
  fetchAppointmentsTrend: vi.fn(),
  fetchRevenueTrend: vi.fn(),
  fetchTopDiagnoses: vi.fn(),
  fetchTopProcedures: vi.fn(),
  fetchProviderProductivity: vi.fn(),
  fetchPatientDemographics: vi.fn(),
  fetchAppointmentTypesAnalytics: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('recharts', () => {
  const Mock = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    LineChart: Mock,
    Line: Mock,
    AreaChart: Mock,
    Area: Mock,
    BarChart: Mock,
    Bar: Mock,
    PieChart: Mock,
    Pie: Mock,
    Cell: Mock,
    XAxis: Mock,
    YAxis: Mock,
    CartesianGrid: Mock,
    Tooltip: Mock,
    Legend: Mock,
    ResponsiveContainer: Mock,
  };
});

import { AnalyticsPage } from '../AnalyticsPage';

describe('AnalyticsPage', () => {
  beforeEach(() => {
    apiMocks.fetchDashboardKPIs.mockResolvedValue({
      totalPatients: 1200,
      todayAppointments: 12,
      monthRevenue: 450000,
      activeEncounters: 4,
    });
    apiMocks.fetchAppointmentsTrend.mockResolvedValue({
      data: [{ date: '2024-01-01', count: 5 }],
    });
    apiMocks.fetchRevenueTrend.mockResolvedValue({
      data: [{ date: '2024-01-01', revenue: 25000 }],
    });
    apiMocks.fetchTopDiagnoses.mockResolvedValue({
      data: [{ name: 'Dermatitis', count: 8 }],
    });
    apiMocks.fetchTopProcedures.mockResolvedValue({
      data: [{ name: 'Biopsy', count: 3 }],
    });
    apiMocks.fetchProviderProductivity.mockResolvedValue({
      data: [
        {
          id: 'prov-1',
          provider_name: 'Dr. Demo',
          patients_seen: 3,
          appointments: 4,
          revenue_cents: 60000,
        },
      ],
    });
    apiMocks.fetchPatientDemographics.mockResolvedValue({
      ageGroups: [{ age_group: '20-29', count: 4 }],
      gender: [{ gender: 'F', count: 4 }],
    });
    apiMocks.fetchAppointmentTypesAnalytics.mockResolvedValue({
      data: [{ type_name: 'New', count: 6 }],
    });
    toastMocks.showError.mockClear();
    toastMocks.showSuccess.mockClear();
  }, 15000);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders analytics dashboard and handles interactions', async () => {
    render(<AnalyticsPage />);

    expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();

    await screen.findByText('Analytics & Reports');
    expect(screen.getByText('Total Patients')).toBeInTheDocument();
    expect(screen.getByText('Dr. Demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clinical and Operational' }));
    expect(screen.getByText('Data Explorer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compliance' }));
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    expect(screen.getByText('Financial Reports')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Start Date'), { target: { value: '2024-01-01' } });
    await waitFor(() => {
      const start = screen.getByPlaceholderText('Start Date') as HTMLInputElement;
      expect(start.value).toBe('2024-01-01');
    });

    fireEvent.change(screen.getByPlaceholderText('End Date'), { target: { value: '2024-01-31' } });
    await waitFor(() => {
      const end = screen.getByPlaceholderText('End Date') as HTMLInputElement;
      expect(end.value).toBe('2024-01-31');
    });

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    await waitFor(() => expect(applyButton).not.toBeDisabled());
    fireEvent.click(applyButton);

    const clearButton = await screen.findByRole('button', { name: 'Clear' });
    fireEvent.click(clearButton);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Export Dashboard' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Export functionality coming soon');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Dashboard refreshed'));
  });

  it('shows error toast when load fails', async () => {
    apiMocks.fetchDashboardKPIs.mockRejectedValueOnce(new Error('boom'));
    render(<AnalyticsPage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('boom'));
  });
});
