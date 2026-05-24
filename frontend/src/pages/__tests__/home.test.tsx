import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string; user: { id: string; role?: string; roles?: string[] } },
  user: null as null | { id: string; role: string; roles?: string[] },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  fetchAppointments: vi.fn(),
  fetchAppointmentTypes: vi.fn(),
  fetchAvailability: vi.fn(),
  fetchBiopsyCommandCenter: vi.fn(),
  fetchCommandCenterSummary: vi.fn(),
  fetchEncounters: vi.fn(),
  fetchFrontDeskSchedule: vi.fn(),
  fetchLocations: vi.fn(),
  fetchTasks: vi.fn(),
  fetchOrders: vi.fn(),
  fetchPatients: vi.fn(),
  fetchProviders: vi.fn(),
  fetchTimeBlocks: vi.fn(),
  fetchUnreadCount: vi.fn(),
}));

const financialApiMocks = vi.hoisted(() => ({
  fetchARAging: vi.fn(),
  fetchClaims: vi.fn(),
  fetchCollectionsTrend: vi.fn(),
  fetchFinancialWorkQueue: vi.fn(),
  fetchPaymentsSummary: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());
const searchParamsMocks = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [searchParamsMocks.value, vi.fn()],
}));

vi.mock('../../api', () => apiMocks);
vi.mock('../../api/financials', () => financialApiMocks);

import { HomePage } from '../HomePage';

const buildFixtures = () => {
  const now = new Date();
  const todayMorning = new Date(now);
  todayMorning.setHours(9, 0, 0, 0);
  const todayAfternoon = new Date(now);
  todayAfternoon.setHours(14, 0, 0, 0);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(11, 0, 0, 0);

  return {
    encounters: [
      {
        id: 'enc-1',
        patientId: 'patient-1',
        providerId: 'provider-1',
        status: 'draft',
        createdAt: todayMorning.toISOString(),
        updatedAt: todayMorning.toISOString(),
      },
      {
        id: 'enc-2',
        patientId: 'patient-2',
        providerId: 'provider-1',
        status: 'finalized',
        createdAt: yesterday.toISOString(),
        updatedAt: todayAfternoon.toISOString(),
      },
      {
        id: 'enc-3',
        patientId: 'patient-3',
        providerId: 'provider-2',
        status: 'locked',
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
      },
    ],
    appointments: [
      {
        id: 'appt-1',
        patientId: 'patient-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'scheduled',
        scheduledStart: todayMorning.toISOString(),
      },
      {
        id: 'appt-2',
        patientId: 'patient-2',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'checked_in',
        scheduledStart: todayMorning.toISOString(),
      },
      {
        id: 'appt-3',
        patientId: 'patient-2',
        locationId: 'loc-2',
        locationName: 'East Wing',
        status: 'completed',
        scheduledStart: todayAfternoon.toISOString(),
      },
      {
        id: 'appt-4',
        patientId: 'patient-4',
        locationId: 'loc-2',
        locationName: 'East Wing',
        status: 'cancelled',
        scheduledStart: todayAfternoon.toISOString(),
      },
      {
        id: 'appt-5',
        patientId: 'patient-5',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'scheduled',
        scheduledStart: yesterday.toISOString(),
      },
    ],
    tasks: [
      { id: 'task-1', status: 'todo' },
      { id: 'task-2', status: 'in_progress' },
      { id: 'task-3', status: 'completed' },
    ],
    orders: [
      { id: 'order-1', type: 'lab', status: 'pending' },
      { id: 'order-2', type: 'pathology', status: 'in-progress' },
      { id: 'order-3', type: 'rx', status: 'pending' },
    ],
    unreadCount: 3,
  };
};

describe('HomePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();

    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1', role: 'provider', roles: ['provider'] },
    };
    authMocks.user = { id: 'provider-1', role: 'provider', roles: ['provider'] };

    const fixtures = buildFixtures();
    searchParamsMocks.value = new URLSearchParams();
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchFrontDeskSchedule.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: fixtures.encounters });
    apiMocks.fetchTasks.mockResolvedValue({ tasks: fixtures.tasks });
    apiMocks.fetchOrders.mockResolvedValue({ orders: fixtures.orders });
    apiMocks.fetchUnreadCount.mockResolvedValue({ count: fixtures.unreadCount });
    apiMocks.fetchBiopsyCommandCenter.mockResolvedValue({
      summary: {
        total_open_loops: 0,
        pending_review: 0,
        needs_patient_notification: 0,
        needs_treatment_scheduling: 0,
      },
      queues: { critical: [] },
    });
    apiMocks.fetchCommandCenterSummary.mockResolvedValue(null);
    apiMocks.fetchPatients.mockResolvedValue({ patients: [] });
    apiMocks.fetchProviders.mockResolvedValue({ providers: [] });
    apiMocks.fetchLocations.mockResolvedValue({ locations: [] });
    apiMocks.fetchAppointmentTypes.mockResolvedValue({ appointmentTypes: [] });
    apiMocks.fetchAvailability.mockResolvedValue({ availability: [] });
    apiMocks.fetchTimeBlocks.mockResolvedValue([]);
    apiMocks.createAppointment.mockResolvedValue({ appointment: { id: 'appt-new' } });
    financialApiMocks.fetchClaims.mockResolvedValue({ claims: [] });
    financialApiMocks.fetchCollectionsTrend.mockResolvedValue({
      summary: {
        totalRevenueEarnedCents: 0,
        totalPatientPaymentsCents: 0,
        totalPayerPaymentsCents: 0,
        totalStorePaymentsCents: 0,
        collectionRate: 0,
      },
    });
    financialApiMocks.fetchFinancialWorkQueue.mockResolvedValue({ items: [] });
    financialApiMocks.fetchPaymentsSummary.mockResolvedValue({
      calculated: {
        postedPatientPaymentsCents: 0,
        payerAppliedCents: 0,
        netCollectionsCents: 0,
      },
    });
    financialApiMocks.fetchARAging.mockResolvedValue({
      totals: {
        totalBalanceCents: 0,
        over90BalanceCents: 0,
      },
      buckets: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads top overview/snapshot and routes to operational pages', async () => {
    localStorage.setItem('sched:location', 'loc-2');
    localStorage.setItem('sched:viewMode', 'day');

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    expect(apiMocks.fetchAppointments).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String),
      })
    );
    expect(apiMocks.fetchFrontDeskSchedule).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({ date: expect.any(String) })
    );
    expect(apiMocks.fetchEncounters).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchTasks).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchOrders).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchUnreadCount).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchCommandCenterSummary).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({ date: expect.any(String) })
    );

    const appointmentsCard = screen.getByText("Today's schedule").closest('.command-metric-card') as HTMLElement;
    expect(within(appointmentsCard).getByText('1')).toBeInTheDocument();

    const flowPanel = screen.getByText("Today's Patients").closest('.command-panel') as HTMLElement;
    const waitingTile = within(flowPanel).getAllByText('Waiting')[0].closest('.command-flow-tile') as HTMLElement;
    expect(within(waitingTile).getByText('0')).toBeInTheDocument();

    const inRoomsTile = within(flowPanel).getByText('In Rooms').closest('.command-flow-tile') as HTMLElement;
    expect(within(inRoomsTile).getByText('0')).toBeInTheDocument();

    const pendingLabRow = screen
      .getAllByText('Open Lab/Path Orders')
      .map((node) => node.closest('.command-work-row'))
      .find(Boolean) as HTMLElement;
    expect(within(pendingLabRow).getByText('2')).toBeInTheDocument();

    const unreadMessageCard = screen
      .getAllByText('Clinical Inbox')
      .map((node) => node.closest('.command-metric-card'))
      .find(Boolean) as HTMLElement;
    expect(within(unreadMessageCard).getByText('3')).toBeInTheDocument();

    expect(within(unreadMessageCard).getByText(/2 open tasks/i)).toBeInTheDocument();

    const notesPanel = screen.getByText('Notes Needing Attention').closest('.command-work-row') as HTMLElement;
    expect(within(notesPanel).getByText(/My notes: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Open order queue across all dates/i)).toBeInTheDocument();

    const locationSelect = screen.getByLabelText('Location');
    fireEvent.change(locationSelect, { target: { value: 'loc-2' } });
    await waitFor(() => {
      const refreshedAppointmentsCard = screen.getByText("Today's schedule").closest('.command-metric-card') as HTMLElement;
      expect(within(refreshedAppointmentsCard).getByText('1')).toBeInTheDocument();
    });

    const businessDateInput = screen.getByLabelText('Business date') as HTMLInputElement;
    fireEvent.change(businessDateInput, { target: { value: '2026-05-18' } });
    await waitFor(() => {
      expect(localStorage.getItem('clinic:businessDate')).toBe('2026-05-18');
      expect(screen.getByText('Selected day schedule')).toBeInTheDocument();
      expect(apiMocks.fetchCommandCenterSummary.mock.calls.some((call) => call[2]?.date === '2026-05-18')).toBe(true);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /New Patient/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith('/patients/new');

    fireEvent.click(screen.getByRole('button', { name: /Open Notes Queue/i }));
    expect(navigateMock).toHaveBeenCalledWith('/notes');

    fireEvent.click(screen.getByRole('button', { name: /Regulatory Reporting/i }));
    fireEvent.click(screen.getByRole('button', { name: 'MIPS Report' }));
    expect(navigateMock).toHaveBeenCalledWith('/reports?type=regulatory');
  }, 20000);

  it('prefers backend command center summary metrics when available', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'admin-1', role: 'admin', roles: ['admin'] },
    };
    authMocks.user = { id: 'admin-1', role: 'admin', roles: ['admin'] };
    apiMocks.fetchCommandCenterSummary.mockResolvedValue({
      businessDate: '2026-05-18',
      practiceTimeZone: 'America/Denver',
      generatedAt: '2026-05-18T16:00:00.000Z',
      dataHealth: { failedSources: [] },
      schedule: {
        appointmentsCount: 12,
        activeAppointmentsCount: 4,
        checkedInCount: 2,
        completedCount: 8,
        waitingCount: 2,
        inRoomsCount: 1,
        checkoutCount: 8,
        staleScheduledCount: 1,
        noShowCount: 1,
        cancelledCount: 0,
        needsInsuranceVerification: 3,
        balanceDueAppointments: 2,
        copayDueCents: 7000,
      },
      claims: {
        claimsInQueue: 6,
        claimsDeniedRejected: 2,
      },
      financials: {
        revenueTodayCents: 410000,
        netCollectionsCents: 330000,
        patientCollectionsCents: 90000,
        payerCollectionsCents: 240000,
        storeCollectionsCents: 35000,
        collectionRateToday: 89,
        financialWorkQueueCount: 5,
        claimWorkQueueCount: 3,
        billingWorkQueueCount: 2,
        arTotalCents: 1200000,
        arOver90Cents: 250000,
      },
    });

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchCommandCenterSummary).toHaveBeenCalled());

    const appointmentsCard = screen.getByText("Today's schedule").closest('.command-metric-card') as HTMLElement;
    expect(within(appointmentsCard).getByText('12')).toBeInTheDocument();

    const revenueCard = screen
      .getAllByText('Revenue today')
      .map((node) => node.closest('.command-metric-card'))
      .find(Boolean) as HTMLElement;
    expect(within(revenueCard).getByText('$4,100')).toBeInTheDocument();

    const claimsCard = screen.getByText('Revenue cycle').closest('.command-metric-card') as HTMLElement;
    expect(within(claimsCard).getByText(/6 active, 2 urgent, 2 backlog/i)).toBeInTheDocument();
  }, 20000);

  it('renders command action queues and routes each work item to its owning page', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'admin-1', role: 'admin', roles: ['admin'] },
    };
    authMocks.user = { id: 'admin-1', role: 'admin', roles: ['admin'] };

    const now = new Date();
    const checkedInAt = new Date(now.getTime() - 45 * 60 * 1000);
    const roomedAt = new Date(now.getTime() - 50 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    const commandAppointments = [
      {
        id: 'cmd-appt-1',
        patientId: 'patient-1',
        providerId: 'provider-1',
        providerName: 'Dr. Test Provider',
        appointmentTypeId: 'type-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'checked_in',
        scheduledStart: checkedInAt.toISOString(),
        checkedInAt: checkedInAt.toISOString(),
        waitTimeMinutes: 45,
        insuranceVerified: false,
        copayAmount: 35,
        outstandingBalance: 120,
        intakeComplete: false,
      },
      {
        id: 'cmd-appt-2',
        patientId: 'patient-2',
        providerId: 'provider-1',
        providerName: 'Dr. Test Provider',
        appointmentTypeId: 'type-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'in_room',
        scheduledStart: roomedAt.toISOString(),
        roomedAt: roomedAt.toISOString(),
      },
      {
        id: 'cmd-appt-3',
        patientId: 'patient-3',
        providerId: 'provider-2',
        providerName: 'Dr. Backup Provider',
        appointmentTypeId: 'type-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'scheduled',
        scheduledStart: tenMinutesFromNow.toISOString(),
      },
      {
        id: 'cmd-appt-4',
        patientId: 'patient-4',
        providerId: 'provider-2',
        providerName: 'Dr. Backup Provider',
        appointmentTypeId: 'type-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'scheduled',
        scheduledStart: oneHourAgo.toISOString(),
        scheduledEnd: oneHourAgo.toISOString(),
      },
      {
        id: 'cmd-appt-5',
        patientId: 'patient-5',
        providerId: 'provider-1',
        providerName: 'Dr. Test Provider',
        appointmentTypeId: 'type-1',
        locationId: 'loc-1',
        locationName: 'Main Clinic',
        status: 'completed',
        scheduledStart: now.toISOString(),
      },
    ];

    apiMocks.fetchAppointments.mockResolvedValue({ appointments: commandAppointments });
    apiMocks.fetchFrontDeskSchedule.mockResolvedValue({ appointments: commandAppointments });
    apiMocks.fetchBiopsyCommandCenter.mockResolvedValue({
      summary: {
        total_open_loops: 1,
        pending_review: 1,
        needs_patient_notification: 0,
        needs_treatment_scheduling: 0,
      },
      queues: {
        critical: [
          {
            id: 'path-1',
            patientId: 'patient-1',
            patientName: 'Patient One',
            providerName: 'Dr. Test Provider',
            stage: 'pending_review',
            severity: 'critical',
          },
        ],
      },
    });
    financialApiMocks.fetchClaims.mockResolvedValue({
      claims: [
        { id: 'claim-1', status: 'denied', balanceCents: 15000, serviceDate: now.toISOString() },
      ],
    });
    financialApiMocks.fetchCollectionsTrend.mockResolvedValue({
      summary: {
        totalRevenueEarnedCents: 100000,
        totalPatientPaymentsCents: 15000,
        totalPayerPaymentsCents: 25000,
        totalStorePaymentsCents: 5000,
        collectionRate: 45,
      },
    });
    financialApiMocks.fetchPaymentsSummary.mockResolvedValue({
      calculated: {
        postedPatientPaymentsCents: 15000,
        payerAppliedCents: 25000,
        netCollectionsCents: 40000,
        chargesInPeriodCents: 100000,
      },
    });
    financialApiMocks.fetchFinancialWorkQueue.mockResolvedValue({
      items: [
        { id: 'work-1', status: 'open', claimId: 'claim-1' },
        { id: 'work-2', status: 'open', billId: 'bill-1' },
      ],
    });
    financialApiMocks.fetchARAging.mockResolvedValue({
      totals: { totalBalanceCents: 300000, over90BalanceCents: 75000 },
      buckets: [],
    });

    render(<HomePage />);

    await waitFor(() => expect(screen.getByText(/Risk Queue/i)).toBeInTheDocument());

    expect(screen.getByText('Revenue Pulse')).toBeInTheDocument();
    expect(screen.getByText('Front Desk Command')).toBeInTheDocument();
    expect(screen.getByText('Provider Throughput')).toBeInTheDocument();
    expect(screen.getByText('End-of-Day Readiness')).toBeInTheDocument();

    const riskPanel = screen.getByText(/Risk Queue/i).closest('.command-insight-panel') as HTMLElement;
    const revenuePanel = screen.getByText('Revenue Pulse').closest('.command-insight-panel') as HTMLElement;
    const frontDeskPanel = screen.getByText('Front Desk Command').closest('.command-insight-panel') as HTMLElement;
    const providerPanel = screen.getByText('Provider Throughput').closest('.command-insight-panel') as HTMLElement;
    const readinessPanel = screen.getByText('End-of-Day Readiness').closest('.command-insight-panel') as HTMLElement;

    expect(within(riskPanel).getByText('Waiting 30+ min')).toBeInTheDocument();
    expect(within(riskPanel).getByText('Claim exceptions')).toBeInTheDocument();
    expect(within(revenuePanel).getByText('Collected so far')).toBeInTheDocument();
    expect(within(frontDeskPanel).getByText('Forms incomplete')).toBeInTheDocument();
    expect(within(providerPanel).getByText('Dr. Test Provider')).toBeInTheDocument();
    expect(within(readinessPanel).getByText('Safety closeout')).toBeInTheDocument();

    navigateMock.mockClear();
    fireEvent.click(within(riskPanel).getByRole('button', { name: /Waiting 30\+ min/i }));
    expect(navigateMock).toHaveBeenCalledWith(expect.stringMatching(/^\/office-flow\?date=\d{4}-\d{2}-\d{2}&status=checked_in$/));

    fireEvent.click(within(riskPanel).getByRole('button', { name: /Claim exceptions/i }));
    expect(navigateMock).toHaveBeenLastCalledWith('/claims?queue=exceptions');

    fireEvent.click(within(revenuePanel).getByRole('button', { name: /Collected so far/i }));
    expect(navigateMock).toHaveBeenCalledWith(expect.stringMatching(/^\/financials\?tab=payments&startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/));

    fireEvent.click(within(frontDeskPanel).getByRole('button', { name: /Forms incomplete/i }));
    expect(navigateMock).toHaveBeenCalledWith('/documents?section=forms');

    fireEvent.click(within(readinessPanel).getByRole('button', { name: /Safety closeout/i }));
    expect(navigateMock).toHaveBeenCalledWith('/biopsies');

    fireEvent.click(within(providerPanel).getByRole('button', { name: /Dr\. Test Provider/i }));
    expect(localStorage.getItem('sched:provider')).toBe('provider-1');
    expect(localStorage.getItem('sched:viewMode')).toBe('day');
    expect(navigateMock).toHaveBeenCalledWith(expect.stringMatching(/^\/schedule\?view=day&date=\d{4}-\d{2}-\d{2}$/));
  }, 20000);

  it('validates and submits reminder modal', async () => {
    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /General Reminder/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(toastMocks.showError).toHaveBeenCalledWith('Please fill in all required fields');

    const reminderText = screen.getByPlaceholderText('Enter the reminder message to send to the patient...');
    fireEvent.change(reminderText, { target: { value: 'Follow up in 6 months.' } });

    const modal = screen.getByRole('dialog');
    const dateInput = modal.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2024-06-01' } });

    const contactSelect = within(modal).getByRole('combobox');
    fireEvent.change(contactSelect, { target: { value: 'SMS' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('General reminder created successfully');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /General Reminder/i }));
    expect((screen.getByPlaceholderText('Enter the reminder message to send to the patient...') as HTMLTextAreaElement).value).toBe('');

    const reopenedModal = screen.getByRole('dialog');
    const reopenedDate = reopenedModal.querySelector('input[type="date"]') as HTMLInputElement;
    expect(reopenedDate.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 15000);

  it('skips loading without a session and handles load errors', async () => {
    authMocks.session = null;
    authMocks.user = null;

    const { unmount } = render(<HomePage />);
    expect(apiMocks.fetchAppointments).not.toHaveBeenCalled();
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();
    unmount();

    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1', role: 'provider', roles: ['provider'] },
    };
    authMocks.user = { id: 'provider-1', role: 'provider', roles: ['provider'] };
    searchParamsMocks.value = new URLSearchParams();
    apiMocks.fetchAppointments.mockRejectedValueOnce(new Error('load failed'));

    render(<HomePage />);

    await waitFor(() => expect(screen.getByText(/Data unavailable for schedule/i)).toBeInTheDocument());
    expect(toastMocks.showError).not.toHaveBeenCalledWith('load failed');
  });

  it('does not request clinical dashboard data for non-clinical roles', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'front-desk-1', role: 'front_desk', roles: ['front_desk'] },
    };
    authMocks.user = { id: 'front-desk-1', role: 'front_desk', roles: ['front_desk'] };

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    expect(apiMocks.fetchTasks).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchUnreadCount).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();
    expect(apiMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it('does not request front desk timing data for billing command center users', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'billing-1', role: 'billing', roles: ['billing'] },
    };
    authMocks.user = { id: 'billing-1', role: 'billing', roles: ['billing'] };

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    expect(apiMocks.fetchFrontDeskSchedule).not.toHaveBeenCalled();
    expect(apiMocks.fetchCommandCenterSummary).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({ date: expect.any(String) })
    );
  });

  it('does not request patient schedule or mail dashboard data for workforce-only roles', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'staff-1', role: 'staff', roles: ['staff'] },
    };
    authMocks.user = { id: 'staff-1', role: 'staff', roles: ['staff'] };

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchTasks).toHaveBeenCalled());

    expect(apiMocks.fetchAppointments).not.toHaveBeenCalled();
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();
    expect(apiMocks.fetchOrders).not.toHaveBeenCalled();
    expect(apiMocks.fetchUnreadCount).not.toHaveBeenCalled();
  });

  it('filters command center actions by role access', async () => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'front-desk-1', role: 'front_desk', roles: ['front_desk'] },
    };
    authMocks.user = { id: 'front-desk-1', role: 'front_desk', roles: ['front_desk'] };

    render(<HomePage />);

    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    expect(screen.queryByText('Revenue today')).not.toBeInTheDocument();
    expect(screen.queryByText('Clinical work')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Financials$/i })).not.toBeInTheDocument();
    expect(screen.getByText('Patient access')).toBeInTheDocument();
    expect(screen.getByText('Front Desk Command')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Revenue cycle/i })).not.toBeInTheDocument();
  });
});
