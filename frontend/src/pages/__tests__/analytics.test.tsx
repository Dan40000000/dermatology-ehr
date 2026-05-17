import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  fetchAnalyticsOverview: vi.fn(),
  fetchAppointmentAnalytics: vi.fn(),
  fetchProviderAnalytics: vi.fn(),
  fetchDermatologyMetrics: vi.fn(),
  fetchYoYComparison: vi.fn(),
  fetchNoShowRiskAnalysis: vi.fn(),
}));

const financialApiMocks = vi.hoisted(() => ({
  fetchFinancialMetrics: vi.fn(),
  fetchCollectionsTrend: vi.fn(),
  fetchPaymentsSummary: vi.fn(),
  fetchARAging: vi.fn(),
  fetchBillsSummary: vi.fn(),
  fetchClaims: vi.fn(),
  fetchFinancialWorkQueue: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../api/financials', () => financialApiMocks);

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
    apiMocks.fetchAnalyticsOverview.mockResolvedValue({
      newPatients: { current: 14, previous: 11, trend: 27.3 },
      appointments: {
        current: 32,
        previous: 29,
        trend: 10.3,
        byStatus: [
          { status: 'completed', count: 24 },
          { status: 'scheduled', count: 4 },
          { status: 'no_show', count: 2 },
          { status: 'cancelled', count: 2 },
        ],
      },
      revenue: { current: 140000, previous: 120000, trend: 16.7 },
      collectionRate: 87.5,
    });
    apiMocks.fetchAppointmentAnalytics.mockResolvedValue({
      byStatus: [
        { status: 'completed', count: 24 },
        { status: 'scheduled', count: 4 },
        { status: 'no_show', count: 2 },
        { status: 'cancelled', count: 2 },
      ],
      byType: [{ type_name: 'New', count: 6 }],
      byProvider: [{ provider_name: 'Dr. Demo', count: 12 }],
      avgWaitTimeMinutes: 8.4,
    });
    apiMocks.fetchProviderAnalytics.mockResolvedValue({
      data: [
        {
          id: 'prov-1',
          provider_name: 'Dr. Demo',
          completed_appointments: 24,
          cancelled_appointments: 2,
          no_shows: 2,
          total_encounters: 24,
          unique_patients: 20,
          revenue_cents: 60000,
          avg_visit_duration_minutes: 18,
        },
      ],
    });
    apiMocks.fetchDermatologyMetrics.mockResolvedValue({
      biopsyStats: { total: 0, byType: { shave: 0, punch: 0, excisional: 0, incisional: 0 }, resultsBreakdown: [] },
      procedureSplit: {
        cosmetic: { count: 0, revenue: 0, percentage: 0 },
        medical: { count: 0, revenue: 0, percentage: 0 },
        surgical: { count: 0, revenue: 0, percentage: 0 },
      },
      topConditions: [],
      lesionTracking: {
        totalTracked: 0,
        byStatus: { new: 0, monitoring: 0, resolved: 0, biopsied: 0 },
        byRiskLevel: { high: 0, medium: 0, low: 0 },
        patientsWithLesions: 0,
      },
    });
    apiMocks.fetchYoYComparison.mockResolvedValue({
      metrics: {
        newPatients: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        totalAppointments: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        completedAppointments: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        noShows: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        revenue: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        encounters: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
        procedures: { current: 0, lastYear: 0, percentChange: 0, trend: 'up' },
      },
    });
    apiMocks.fetchNoShowRiskAnalysis.mockResolvedValue({
      overallNoShowRate: 0,
      totalAppointments: 0,
      totalNoShows: 0,
      riskFactors: { byDayOfWeek: [], byTimeOfDay: [], byAppointmentType: [] },
      recommendations: [],
    });
    financialApiMocks.fetchFinancialMetrics.mockResolvedValue({
      snapshots: {
        monthly: {
          key: 'monthly',
          label: 'Monthly Snapshot',
          rangeLabel: 'Month to date',
          completedAppointments: 24,
          totalRevenueCents: 140000,
          collectionsCents: 122500,
          avgRevenuePerVisitCents: 5833,
          benchmarkVisitsCount: 30,
          collectionRate: 87.5,
          standaloneRevenueCents: 20000,
          revenueCategories: [
            { key: 'office_visit', label: 'Office Visits', revenueCents: 100000, itemCount: 24 },
            { key: 'no_show_fee', label: 'No-show Fees', revenueCents: 5000, itemCount: 2 },
          ],
        },
      },
    });
    financialApiMocks.fetchCollectionsTrend.mockResolvedValue({
      data: [{ bucketStartDate: '2024-01-01', revenueEarnedCents: 140000, paymentsCollectedCents: 122500, patientPaymentsCents: 25000, payerPaymentsCents: 97500 }],
      summary: {
        totalPaymentsCollectedCents: 122500,
        totalRevenueEarnedCents: 140000,
        totalPatientPaymentsCents: 25000,
        totalPayerPaymentsCents: 97500,
        totalPaymentCount: 10,
        totalBillCount: 12,
        dayCount: 31,
        collectionRate: 87.5,
        revenueCategories: [{ key: 'no_show_fee', label: 'No-show Fees', revenueCents: 5000, itemCount: 2 }],
      },
    });
    financialApiMocks.fetchPaymentsSummary.mockResolvedValue({
      calculated: { netCollectionRate: 87.5 },
      receivables: { outstandingBalanceCents: 42000, overdueBalanceCents: 12000, overdueCount: 3 },
      payerPaymentsSummary: { appliedCents: 97500, unappliedCents: 500 },
      patientPaymentsByMethod: [{ paymentMethod: 'credit_card', count: 5, totalCents: 25000 }],
    });
    financialApiMocks.fetchARAging.mockResolvedValue({
      buckets: [
        { key: '0-30', label: '0-30 days', billCount: 4, totalBalanceCents: 30000 },
        { key: '91-120', label: '91-120 days', billCount: 1, totalBalanceCents: 12000 },
      ],
    });
    financialApiMocks.fetchBillsSummary.mockResolvedValue({
      billsByStatus: [{ status: 'partial', count: 2, totalChargesCents: 42000 }],
    });
    financialApiMocks.fetchClaims.mockResolvedValue({
      claims: [
        { id: 'claim-1', status: 'paid', totalCents: 100000, paidAmountCents: 100000 },
        { id: 'claim-2', status: 'denied', totalCents: 40000, balanceCents: 40000 },
      ],
    });
    financialApiMocks.fetchFinancialWorkQueue.mockResolvedValue({
      items: [
        {
          id: 'fwq-1',
          issueType: 'claim_rejection',
          severity: 'critical',
          status: 'open',
          message: 'Claim rejected by clearinghouse',
          patientFirstName: 'Ava',
          patientLastName: 'Jones',
        },
      ],
    });
    toastMocks.showError.mockClear();
    toastMocks.showSuccess.mockClear();
  }, 15000);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders analytics dashboard and handles interactions', async () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );

    await screen.findByText('Analytics & Reports');
    expect(screen.getByText('Total Patients')).toBeInTheDocument();
    expect(screen.getAllByText('Dr. Demo').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Clinical and Operational' }));
    expect(screen.getByText('Data Explorer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compliance' }));
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    expect(screen.getByText('Financial Reports')).toBeInTheDocument();
    expect(screen.getByText('Collections Story')).toBeInTheDocument();
    expect(screen.getByText('Claim Pipeline')).toBeInTheDocument();

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
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('boom'));
  });
});
