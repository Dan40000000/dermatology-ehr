import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchAppointments: vi.fn(),
  fetchProviders: vi.fn(),
  fetchLocations: vi.fn(),
  fetchAppointmentTypes: vi.fn(),
  fetchAvailability: vi.fn(),
  fetchPatients: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  checkInFrontDeskAppointment: vi.fn(),
  updatePatientFlowStatus: vi.fn(),
  createAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  fetchTimeBlocks: vi.fn(),
  createTimeBlock: vi.fn(),
  updateTimeBlock: vi.fn(),
  deleteTimeBlock: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());
const rescheduleProviderId = vi.hoisted(() => ({ value: 'provider-2' }));

let confirmSpy: ReturnType<typeof vi.spyOn> | null = null;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
  Modal: ({
    isOpen,
    title,
    children,
    onClose,
  }: {
    isOpen: boolean;
    title?: string;
    children: React.ReactNode;
    onClose?: () => void;
  }) => {
    if (!isOpen) return null;
    const key = String(title || 'modal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (
      <div data-testid={`modal-${key}`}>
        <div>{title}</div>
        <button type="button" onClick={onClose}>
          Close Modal
        </button>
        {children}
      </div>
    );
  },
  ExportButtons: ({ onExport, data = [], columns = [] }: { onExport?: (type: string) => void; data?: any[]; columns?: any[] }) => {
    if (data[0]) {
      columns.forEach((col: any) => {
        if (col.format) {
          col.format((data[0] as any)[col.key]);
        }
      });
    }
    return (
      <button type="button" onClick={() => onExport?.('csv')}>
        Export CSV
      </button>
    );
  },
}));

vi.mock('../../components/schedule/Calendar', () => ({
  Calendar: ({ appointments, providers, timeBlocks, onAppointmentClick, onSlotClick, onTimeBlockClick }: any) => (
    <div data-testid="calendar">
      <div data-testid="calendar-appointments">{appointments?.length ?? 0}</div>
      <div data-testid="calendar-providers">{providers?.length ?? 0}</div>
      <div data-testid="calendar-timeblocks">{timeBlocks?.length ?? 0}</div>
      <button type="button" onClick={() => appointments?.[0] && onAppointmentClick?.(appointments[0])}>
        Select Appointment
      </button>
      <button
        type="button"
        onClick={() => onSlotClick?.(providers?.[0]?.id ?? 'provider-1', new Date('2024-04-02T00:00:00Z'), 9, 30)}
      >
        Select Slot
      </button>
      <button type="button" onClick={() => onTimeBlockClick?.(timeBlocks?.[0]?.id ?? 'tb-1')}>
        Select Time Block
      </button>
    </div>
  ),
}));

vi.mock('../../components/schedule/AppointmentModal', () => ({
  AppointmentModal: ({ isOpen, onSave, onClose, initialData }: any) =>
    isOpen ? (
      <div>
        <div>Appointment Modal</div>
        <div data-testid="appointment-initial-date">{initialData?.date || ''}</div>
        <button
          type="button"
          onClick={() =>
            onSave({
              patientId: 'patient-1',
              providerId: 'provider-1',
              appointmentTypeId: 'type-1',
              locationId: '',
              date: '2024-04-10',
              time: '09:30',
              duration: 30,
              notes: 'Bring records',
            })
          }
        >
          Save Appointment
        </button>
        <button type="button" onClick={onClose}>
          Close Appointment
        </button>
      </div>
    ) : null,
}));

vi.mock('../../components/schedule/RescheduleModal', () => ({
  RescheduleModal: ({ isOpen, onSave, onClose }: any) =>
    isOpen ? (
      <div>
        <div>Reschedule Modal</div>
        <button
          type="button"
          onClick={() =>
            onSave({
              providerId: rescheduleProviderId.value,
              date: '2024-04-12',
              time: '10:00',
            })
          }
        >
          Save Reschedule
        </button>
        <button type="button" onClick={onClose}>
          Close Reschedule
        </button>
      </div>
    ) : null,
}));

vi.mock('../../components/schedule/TimeBlockModal', () => ({
  TimeBlockModal: ({ isOpen, onSave, onDelete, onClose, timeBlock }: any) =>
    isOpen ? (
      <div>
        <div>{timeBlock ? 'Edit Time Block' : 'Create Time Block'}</div>
        <button
          type="button"
          onClick={() =>
            onSave({
              providerId: timeBlock?.providerId ?? 'provider-1',
              title: 'Block',
              blockType: 'blocked',
              description: 'Admin',
              date: '2024-04-11',
              startTime: '13:00',
              endTime: '14:00',
              isRecurring: false,
            })
          }
        >
          Save Time Block
        </button>
        {timeBlock ? (
          <button type="button" onClick={() => onDelete?.(timeBlock.id)}>
            Delete Time Block
          </button>
        ) : null}
        <button type="button" onClick={onClose}>
          Close Time Block
        </button>
      </div>
    ) : null,
}));

import { SchedulePage } from '../SchedulePage';

function buildTodaySlot(hour: number, minute: number, durationMinutes: number): { start: string; end: string } {
  const start = new Date();
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

const buildFixtures = () => {
  const first = buildTodaySlot(9, 0, 60);
  const second = buildTodaySlot(9, 30, 60);
  const third = buildTodaySlot(11, 0, 30);
  const lunch = buildTodaySlot(12, 0, 30);
  const meeting = buildTodaySlot(15, 0, 60);

  return {
  appointments: [
    {
      id: 'appt-1',
      patientId: 'patient-1',
      patientName: 'Ana Derm',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      appointmentTypeId: 'type-1',
      appointmentTypeName: 'Consult',
      locationId: 'loc-1',
      locationName: 'Main Clinic',
      scheduledStart: first.start,
      scheduledEnd: first.end,
      status: 'scheduled',
    },
    {
      id: 'appt-2',
      patientId: 'patient-2',
      patientName: 'Ben Skin',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      appointmentTypeId: 'type-1',
      appointmentTypeName: 'Consult',
      locationId: 'loc-1',
      locationName: 'Main Clinic',
      scheduledStart: second.start,
      scheduledEnd: second.end,
      status: 'scheduled',
    },
    {
      id: 'appt-3',
      patientId: 'patient-3',
      patientName: 'Cara Clinic',
      providerId: 'provider-2',
      providerName: 'Dr Two',
      appointmentTypeId: 'type-2',
      appointmentTypeName: 'Follow Up',
      locationId: 'loc-2',
      locationName: 'East Wing',
      scheduledStart: third.start,
      scheduledEnd: third.end,
      status: 'scheduled',
    },
  ],
  providers: [
    { id: 'provider-1', fullName: 'Dr Demo', name: 'Dr Demo', createdAt: '2024-01-01' },
    { id: 'provider-2', fullName: 'Dr Two', name: 'Dr Two', createdAt: '2024-01-01' },
  ],
  locations: [
    { id: 'loc-1', name: 'Main Clinic', createdAt: '2024-01-01' },
    { id: 'loc-2', name: 'East Wing', createdAt: '2024-01-01' },
  ],
  appointmentTypes: [
    { id: 'type-1', name: 'Consult', durationMinutes: 60, createdAt: '2024-01-01' },
    { id: 'type-2', name: 'Follow Up', durationMinutes: 30, createdAt: '2024-01-01' },
  ],
  availability: [
    { id: 'avail-1', providerId: 'provider-1', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
  ],
  patients: [
    { id: 'patient-1', firstName: 'Ana', lastName: 'Derm', dateOfBirth: '1980-01-01', createdAt: '2024-01-01' },
    { id: 'patient-2', firstName: 'Ben', lastName: 'Skin', dateOfBirth: '1985-01-01', createdAt: '2024-01-01' },
    { id: 'patient-3', firstName: 'Cara', lastName: 'Clinic', dateOfBirth: '1990-01-01', createdAt: '2024-01-01' },
  ],
  timeBlocks: [
    {
      id: 'tb-1',
      providerId: 'provider-1',
      title: 'Lunch',
      blockType: 'lunch',
      description: 'Lunch',
      startTime: lunch.start,
      endTime: lunch.end,
      isRecurring: false,
    },
    {
      id: 'tb-2',
      providerId: 'provider-2',
      title: 'Meeting',
      blockType: 'meeting',
      description: 'Team',
      startTime: meeting.start,
      endTime: meeting.end,
      isRecurring: false,
    },
  ],
  };
};

describe('SchedulePage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    rescheduleProviderId.value = 'provider-2';
    const fixtures = buildFixtures();
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchProviders.mockResolvedValue({ providers: fixtures.providers });
    apiMocks.fetchLocations.mockResolvedValue({ locations: fixtures.locations });
    apiMocks.fetchAppointmentTypes.mockResolvedValue({ appointmentTypes: fixtures.appointmentTypes });
    apiMocks.fetchAvailability.mockResolvedValue({ availability: fixtures.availability });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchTimeBlocks.mockResolvedValue(fixtures.timeBlocks);
    apiMocks.updateAppointmentStatus.mockResolvedValue({ ok: true });
    apiMocks.checkInFrontDeskAppointment.mockResolvedValue({ ok: true });
    apiMocks.updatePatientFlowStatus.mockResolvedValue({ ok: true });
    apiMocks.createAppointment.mockResolvedValue({ ok: true });
    apiMocks.rescheduleAppointment.mockResolvedValue({ ok: true });
    apiMocks.createTimeBlock.mockResolvedValue({ ok: true });
    apiMocks.updateTimeBlock.mockResolvedValue({ ok: true });
    apiMocks.deleteTimeBlock.mockResolvedValue({ ok: true });
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    navigateMock.mockClear();
    localStorage.clear();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('loads schedule data, filters the calendar, and uses the finder', async () => {
    render(<SchedulePage />);

    await screen.findByTestId('calendar');

    expect(apiMocks.fetchAppointments).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String),
      })
    );
    await screen.findByText('Scheduling Conflicts:');
    expect(screen.getByTestId('calendar-appointments')).toHaveTextContent('3');
    expect(screen.getByTestId('calendar-providers')).toHaveTextContent('2');
    expect(screen.getByTestId('calendar-timeblocks')).toHaveTextContent('2');

    const filterSelects = screen.getAllByRole('combobox');
    const providerSelect = filterSelects[0];
    const typeSelect = filterSelects[1];
    const locationSelect = filterSelects[2];

    fireEvent.change(providerSelect, { target: { value: 'provider-1' } });
    await waitFor(() => expect(screen.getByTestId('calendar-providers')).toHaveTextContent('1'));
    expect(screen.getByTestId('calendar-timeblocks')).toHaveTextContent('1');

    fireEvent.change(providerSelect, { target: { value: 'all' } });
    await waitFor(() => expect(screen.getByTestId('calendar-providers')).toHaveTextContent('2'));

    fireEvent.change(locationSelect, { target: { value: 'loc-2' } });
    await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toHaveTextContent('1'));
    expect(screen.getByTestId('calendar-providers')).toHaveTextContent('1');
    expect(screen.getByTestId('calendar-timeblocks')).toHaveTextContent('1');

    fireEvent.change(typeSelect, { target: { value: 'type-1' } });
    await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toHaveTextContent('0'));

    fireEvent.change(locationSelect, { target: { value: 'all' } });
    await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toHaveTextContent('2'));
    expect(screen.getByTestId('calendar-providers')).toHaveTextContent('2');
    expect(screen.getByTestId('calendar-timeblocks')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: /Prev/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    fireEvent.click(screen.getByRole('button', { name: /Appointment Finder/i }));
    expect(screen.getByRole('heading', { name: 'Appointment Finder' })).toBeInTheDocument();

    const finderPanel = screen.getByRole('heading', { name: 'Appointment Finder' }).closest('div')?.parentElement as HTMLElement;
    const finderSelects = within(finderPanel).getAllByRole('combobox');
    fireEvent.change(finderSelects[1], { target: { value: 'loc-1' } });
    fireEvent.change(finderSelects[2], { target: { value: 'provider-1' } });
    fireEvent.change(finderSelects[3], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(toastMocks.showError).toHaveBeenCalledWith('Please select an appointment type');
    fireEvent.change(finderSelects[3], { target: { value: 'type-1' } });
    fireEvent.change(finderSelects[4], { target: { value: '30' } });
    fireEvent.change(finderSelects[5], { target: { value: 'Morning' } });
    fireEvent.change(finderSelects[6], { target: { value: 'Weekdays' } });
    fireEvent.change(finderSelects[7], { target: { value: 'Specific date' } });
    fireEvent.change(finderSelects[0], { target: { value: 'patient-1' } });
    fireEvent.click(within(finderPanel).getByRole('radio', { name: 'By Time Availability' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Loaded patient into New Appointment. Pick an available time.');
    fireEvent.click(within(finderPanel).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Quick Filters' }));
    const expandedModal = await screen.findByTestId('modal-expanded-appointment-finder');
    const expandedScope = within(expandedModal);

    fireEvent.click(expandedScope.getByRole('button', { name: 'Search 1st Appt' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Searching for 1st appointment...');
    fireEvent.click(expandedScope.getByRole('button', { name: 'Search 2nd Appt' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Searching for 2nd appointment...');

    fireEvent.click(expandedScope.getByRole('button', { name: 'Quick Filters' }));
    expect(navigateMock).toHaveBeenCalledWith('/appointment-finder');

    fireEvent.click(expandedScope.getByRole('button', { name: 'Search All' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Searching all appointments...');

    fireEvent.click(screen.getByRole('button', { name: 'Quick Filters' }));
    const expandedModalAgain = await screen.findByTestId('modal-expanded-appointment-finder');
    const expandedScopeAgain = within(expandedModalAgain);
    fireEvent.click(expandedScopeAgain.getByRole('button', { name: 'Close Modal' }));

    fireEvent.click(screen.getByRole('button', { name: 'Quick Filters' }));
    const expandedModalThird = await screen.findByTestId('modal-expanded-appointment-finder');
    const expandedScopeThird = within(expandedModalThird);
    fireEvent.click(expandedScopeThird.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Exported 0 appointments as CSV');
  }, 15000);

  it('handles appointment actions and time blocks', async () => {
    render(<SchedulePage />);

    await screen.findByText(/Schedule - /);

    await screen.findByTestId('calendar');

    const actionBar = document.querySelector('.ema-action-bar');
    if (!actionBar) {
      throw new Error('Action bar not found');
    }
    const actionScope = within(actionBar);

    fireEvent.click(actionScope.getByRole('button', { name: /New Appointment/i }));
    expect(screen.getByText('Appointment Modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Appointment' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select Appointment' }));

    fireEvent.click(actionScope.getByRole('button', { name: /Check In/ }));
    await waitFor(() =>
      expect(apiMocks.checkInFrontDeskAppointment).toHaveBeenCalledWith('tenant-1', 'token-1', 'appt-1'),
    );
    await waitFor(() =>
      expect(apiMocks.updatePatientFlowStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'appt-1', 'checked_in'),
    );

    fireEvent.click(actionScope.getByRole('button', { name: /Cancel Appointment/ }));
    await waitFor(() =>
      expect(apiMocks.updateAppointmentStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'appt-1', 'cancelled'),
    );

    const apptRow = screen.getByRole('row', { name: /Ana Derm/ });
    fireEvent.click(apptRow);
    fireEvent.click(within(apptRow).getByRole('radio'));
    const statusSelect = within(apptRow).getByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'completed' } });
    await waitFor(() =>
      expect(apiMocks.updateAppointmentStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'appt-1', 'completed'),
    );

    fireEvent.click(actionScope.getByRole('button', { name: /Reschedule/ }));
    expect(screen.getByText('Reschedule Modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Reschedule' }));
    fireEvent.click(actionScope.getByRole('button', { name: /Reschedule/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Reschedule' }));
    const rescheduleStart = new Date('2024-04-12T10:00:00');
    const rescheduleEnd = new Date(rescheduleStart.getTime() + 60 * 60000);
    await waitFor(() =>
      expect(apiMocks.rescheduleAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'appt-1',
        rescheduleStart.toISOString(),
        rescheduleEnd.toISOString(),
        'provider-2',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Slot' }));
    expect(screen.getByText('Appointment Modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Appointment' }));
    const createdStart = new Date('2024-04-10T09:30:00');
    const createdEnd = new Date(createdStart.getTime() + 30 * 60000);
    await waitFor(() =>
      expect(apiMocks.createAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({
          patientId: 'patient-1',
          providerId: 'provider-1',
          appointmentTypeId: 'type-1',
          locationId: 'loc-1',
          scheduledStart: createdStart.toISOString(),
          scheduledEnd: createdEnd.toISOString(),
          notes: 'Bring records',
        }),
      ),
    );

    fireEvent.click(actionScope.getByRole('button', { name: /Time Block/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Time Block' }));
    const timeBlockStart = new Date('2024-04-11T13:00:00');
    const timeBlockEnd = new Date('2024-04-11T14:00:00');
    await waitFor(() =>
      expect(apiMocks.createTimeBlock).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({
          providerId: 'provider-1',
          title: 'Block',
          blockType: 'blocked',
          description: 'Admin',
          startTime: timeBlockStart.toISOString(),
          endTime: timeBlockEnd.toISOString(),
          isRecurring: false,
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Time Block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Time Block' }));
    await waitFor(() =>
      expect(apiMocks.updateTimeBlock).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'tb-1',
        expect.objectContaining({
          providerId: 'provider-1',
          title: 'Block',
          blockType: 'blocked',
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Time Block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Time Block' }));
    await waitFor(() => expect(apiMocks.deleteTimeBlock).toHaveBeenCalledWith('tenant-1', 'token-1', 'tb-1'));

    fireEvent.click(actionScope.getByRole('button', { name: /Time Block/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Time Block' }));

    fireEvent.click(screen.getByRole('button', { name: 'Ana Derm' }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1');
  }, 15000);

  it('shows conflict warnings with fallback provider labels', async () => {
    apiMocks.fetchAppointments.mockResolvedValueOnce({
      appointments: [
        (() => {
          const slot = buildTodaySlot(9, 0, 60);
          return {
            id: 'appt-a',
            patientId: 'patient-1',
            patientName: '',
            providerId: 'provider-1',
            providerName: '',
            appointmentTypeId: 'type-1',
            appointmentTypeName: 'Consult',
            locationId: 'loc-1',
            locationName: 'Main Clinic',
            scheduledStart: slot.start,
            scheduledEnd: slot.end,
            status: 'scheduled',
          };
        })(),
        (() => {
          const slot = buildTodaySlot(9, 30, 60);
          return {
            id: 'appt-b',
            patientId: 'patient-2',
            patientName: 'Pat',
            providerId: 'provider-1',
            providerName: '',
            appointmentTypeId: 'type-1',
            appointmentTypeName: 'Consult',
            locationId: 'loc-1',
            locationName: 'Main Clinic',
            scheduledStart: slot.start,
            scheduledEnd: slot.end,
            status: 'scheduled',
          };
        })(),
      ],
    });
    apiMocks.fetchProviders.mockResolvedValueOnce({ providers: [{ id: 'provider-1', fullName: 'Dr Demo' }] });
    apiMocks.fetchLocations.mockResolvedValueOnce({ locations: [] });
    apiMocks.fetchAppointmentTypes.mockResolvedValueOnce({ appointmentTypes: [] });
    apiMocks.fetchAvailability.mockResolvedValueOnce({ availability: [] });
    apiMocks.fetchPatients.mockResolvedValueOnce({ patients: [] });
    apiMocks.fetchTimeBlocks.mockResolvedValueOnce([]);

    render(<SchedulePage />);

    await screen.findByTestId('calendar');
    await screen.findByText('Scheduling Conflicts:');
    await screen.findByText(/Provider @/);
  });

  it('handles missing data responses and ignores unknown slots', async () => {
    localStorage.setItem('sched:dayOffset', 'oops');
    apiMocks.fetchAppointments.mockResolvedValueOnce({});
    apiMocks.fetchProviders.mockResolvedValueOnce({ providers: [] });
    apiMocks.fetchLocations.mockResolvedValueOnce({});
    apiMocks.fetchAppointmentTypes.mockResolvedValueOnce({});
    apiMocks.fetchAvailability.mockResolvedValueOnce({});
    apiMocks.fetchPatients.mockResolvedValueOnce({});
    apiMocks.fetchTimeBlocks.mockResolvedValueOnce({});

    render(<SchedulePage />);

    await screen.findByTestId('calendar');
    expect(screen.getByTestId('calendar-appointments')).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'Select Slot' }));
    expect(screen.queryByText('Appointment Modal')).not.toBeInTheDocument();
  });

  it('skips create actions when session is missing', async () => {
    authMocks.session = null;

    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: /New Appointment/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Appointment' }));
    expect(apiMocks.createAppointment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Time Block/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Time Block' }));
    expect(apiMocks.createTimeBlock).not.toHaveBeenCalled();
  });

  it('skips cancel when not confirmed and reschedules without provider change', async () => {
    rescheduleProviderId.value = 'provider-1';
    confirmSpy?.mockReturnValue(false);

    render(<SchedulePage />);

    await screen.findByTestId('calendar');
    const actionBar = document.querySelector('.ema-action-bar');
    if (!actionBar) {
      throw new Error('Action bar not found');
    }
    const actionScope = within(actionBar);

    fireEvent.click(screen.getByRole('button', { name: 'Select Appointment' }));
    const cancelCalls = apiMocks.updateAppointmentStatus.mock.calls.length;
    fireEvent.click(actionScope.getByRole('button', { name: /Cancel Appointment/ }));
    expect(apiMocks.updateAppointmentStatus.mock.calls.length).toBe(cancelCalls);

    fireEvent.click(actionScope.getByRole('button', { name: /Reschedule/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Reschedule' }));
    const rescheduleStart = new Date('2024-04-12T10:00:00');
    const rescheduleEnd = new Date(rescheduleStart.getTime() + 60 * 60000);
    await waitFor(() =>
      expect(apiMocks.rescheduleAppointment).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'appt-1',
        rescheduleStart.toISOString(),
        rescheduleEnd.toISOString(),
        undefined,
      ),
    );
  });

  it('shows empty states, refreshes, and surfaces status update errors', async () => {
    apiMocks.fetchAppointments.mockResolvedValueOnce({ appointments: [] });
    apiMocks.updateAppointmentStatus.mockRejectedValueOnce(new Error('update failed'));

    render(<SchedulePage />);

    await screen.findByTestId('calendar');
    expect(screen.getByText('No appointments scheduled')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await screen.findByText('Ana Derm');

    const apptRow = screen.getByRole('row', { name: /Ana Derm/ });
    const statusSelect = within(apptRow).getByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'completed' } });
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('update failed'));

    fireEvent.click(screen.getByRole('button', { name: /Face Sheets/ }));
    expect(navigateMock).toHaveBeenCalledWith('/face-sheets');
  });

  it('requests a past date window when navigating to previous days', async () => {
    localStorage.setItem('sched:dayOffset', '-2');

    render(<SchedulePage />);

    await screen.findByTestId('calendar');
    await waitFor(() => expect(apiMocks.fetchAppointments).toHaveBeenCalled());

    const lastCall = apiMocks.fetchAppointments.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();

    const options = lastCall?.[2] as { startDate?: string; endDate?: string } | undefined;
    expect(options?.startDate).toBeTruthy();
    expect(options?.endDate).toBeTruthy();

    const selectedDate = new Date();
    selectedDate.setDate(selectedDate.getDate() - 2);
    selectedDate.setHours(0, 0, 0, 0);

    const expectedStartDate = new Date(selectedDate);
    expectedStartDate.setDate(expectedStartDate.getDate() - 60);

    const expectedEndDate = new Date(selectedDate);
    expectedEndDate.setDate(expectedEndDate.getDate() + 60);

    const toIsoDate = (date: Date) => date.toISOString().split('T')[0];
    expect(options).toMatchObject({
      startDate: toIsoDate(expectedStartDate),
      endDate: toIsoDate(expectedEndDate),
    });
  });
});
