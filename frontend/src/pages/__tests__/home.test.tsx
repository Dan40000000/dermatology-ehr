import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string; user: { id: string } },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchAppointments: vi.fn(),
  fetchEncounters: vi.fn(),
  fetchTasks: vi.fn(),
  fetchOrders: vi.fn(),
  fetchUnreadCount: vi.fn(),
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
    localStorage.clear();

    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1' },
    };

    const fixtures = buildFixtures();
    searchParamsMocks.value = new URLSearchParams();
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: fixtures.encounters });
    apiMocks.fetchTasks.mockResolvedValue({ tasks: fixtures.tasks });
    apiMocks.fetchOrders.mockResolvedValue({ orders: fixtures.orders });
    apiMocks.fetchUnreadCount.mockResolvedValue({ count: fixtures.unreadCount });
  });

  afterEach(() => {
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
    expect(apiMocks.fetchEncounters).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchTasks).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchOrders).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchUnreadCount).toHaveBeenCalledWith('tenant-1', 'token-1');

    const appointmentsCard = screen.getByText(/Appointments\s*Today/i).closest('.stat-card-teal') as HTMLElement;
    expect(within(appointmentsCard).getByText('3')).toBeInTheDocument();

    const checkedInCard = screen.getByText(/Checked In\s*Patients/i).closest('.stat-card-teal') as HTMLElement;
    expect(within(checkedInCard).getByText('1')).toBeInTheDocument();

    const inRoomsCard = screen.getByText(/Patients\s*In Rooms/i).closest('.stat-card-teal') as HTMLElement;
    expect(within(inRoomsCard).getByText('0')).toBeInTheDocument();

    const pendingLabCard = screen.getByText(/Pending Lab\/Path\s*Orders/i).closest('.stat-card-teal') as HTMLElement;
    expect(within(pendingLabCard).getByText('2')).toBeInTheDocument();

    const unreadMessageCard = screen.getByText(/Unread Message\s*Threads/i).closest('.stat-card-teal') as HTMLElement;
    expect(within(unreadMessageCard).getByText('3')).toBeInTheDocument();

    const pendingTasksPanel = screen.getByText('Pending Tasks').closest('.panel') as HTMLElement;
    expect(within(pendingTasksPanel).getByText('2')).toBeInTheDocument();

    const notesPanel = screen.getByText('Notes Needing Attention').closest('.panel') as HTMLElement;
    expect(within(notesPanel).getByText('My notes needing work:')).toBeInTheDocument();
    expect(within(notesPanel).getByText('Unsigned notes updated today:')).toBeInTheDocument();

    const locationSelect = screen.getByLabelText('Location');
    fireEvent.change(locationSelect, { target: { value: 'loc-2' } });
    await waitFor(() => {
      const refreshedAppointmentsCard = screen.getByText(/Appointments\s*Today/i).closest('.stat-card-teal') as HTMLElement;
      expect(within(refreshedAppointmentsCard).getByText('1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /New Patient/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith('/patients/new');

    fireEvent.click(screen.getByRole('button', { name: /Open Notes Queue/i }));
    expect(navigateMock).toHaveBeenCalledWith('/notes');

    fireEvent.click(screen.getByRole('button', { name: /Open Notes Page/i }));
    expect(navigateMock).toHaveBeenCalledWith('/notes');

    fireEvent.click(screen.getByRole('button', { name: /Regulatory Reporting/i }));
    fireEvent.click(screen.getByRole('button', { name: 'MIPS Report' }));
    expect(navigateMock).toHaveBeenCalledWith('/reports?type=regulatory');
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

    const { unmount } = render(<HomePage />);
    expect(apiMocks.fetchAppointments).not.toHaveBeenCalled();
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();
    unmount();

    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1' },
    };
    searchParamsMocks.value = new URLSearchParams();
    apiMocks.fetchAppointments.mockRejectedValueOnce(new Error('load failed'));

    render(<HomePage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('load failed'));
  });
});
