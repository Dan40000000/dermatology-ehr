import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: string; email: string; role: string; fullName: string };
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

const apiMocks = vi.hoisted(() => ({
  fetchFrontDeskSchedule: vi.fn(),
  updateFrontDeskStatus: vi.fn(),
  checkOutFrontDeskAppointment: vi.fn(),
  fetchExamRooms: vi.fn(),
  fetchPatientFlowActive: vi.fn(),
  updatePatientFlowStatus: vi.fn(),
  fetchPatients: vi.fn(),
  fetchProviders: vi.fn(),
  fetchPatientEncounters: vi.fn(),
  createEncounter: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Panel: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid={title ? `panel-${title.toLowerCase().replace(/\s+/g, '-')}` : 'panel'}>
      {title && <div>{title}</div>}
      {children}
    </div>
  ),
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
}));

import { OfficeFlowPage } from '../OfficeFlowPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'staff@example.com', role: 'staff', fullName: 'Staff User' },
};

const makeAppointment = (index: number, start: Date) => {
  const startTime = new Date(start.getTime() + index * 20 * 60000);
  const endTime = new Date(start.getTime() + (index * 20 + 20) * 60000);
  return {
    id: `appt-${index + 1}`,
    tenantId: 'tenant-1',
    patientId: `pat-${index + 1}`,
    patientFirstName: 'Patient',
    patientLastName: `${index + 1}`,
    providerId: 'prov-1',
    providerName: 'Dr. House',
    locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology PLLC',
    appointmentTypeId: 'type-1',
    appointmentTypeName: 'Visit',
    scheduledStart: startTime.toISOString(),
    scheduledEnd: endTime.toISOString(),
    status: 'checked_in' as const,
    arrivedAt: startTime.toISOString(),
    createdAt: new Date().toISOString(),
  };
};

beforeEach(() => {
  authMocks.session = baseSession;
  toastMocks.showSuccess.mockClear();
  toastMocks.showError.mockClear();

  const baseTime = new Date();
  baseTime.setHours(9, 0, 0, 0);
  const appointments = Array.from({ length: 6 }, (_, i) => makeAppointment(i, baseTime));

  apiMocks.fetchFrontDeskSchedule.mockResolvedValue({ appointments });
  apiMocks.updateFrontDeskStatus.mockResolvedValue({ ok: true });
  apiMocks.checkOutFrontDeskAppointment.mockResolvedValue({ ok: true });
  apiMocks.fetchExamRooms.mockResolvedValue({
    rooms: [
      { id: 'room-1', roomNumber: 'Exam 1', roomName: '', roomType: 'exam' },
      { id: 'room-2', roomNumber: 'Exam 2', roomName: '', roomType: 'exam' },
    ],
  });
  apiMocks.fetchPatientFlowActive.mockResolvedValue({ flows: [] });
  apiMocks.updatePatientFlowStatus.mockResolvedValue({ ok: true });
  apiMocks.fetchPatientEncounters.mockResolvedValue({ encounters: [] });
  apiMocks.createEncounter.mockResolvedValue({ id: 'enc-1' });
  apiMocks.fetchPatients.mockResolvedValue({
    patients: appointments.map((appt) => ({
      id: appt.patientId,
      tenantId: 'tenant-1',
      firstName: appt.patientFirstName,
      lastName: appt.patientLastName,
      createdAt: new Date().toISOString(),
    })),
  });
  apiMocks.fetchProviders.mockResolvedValue({
    providers: [
      { id: 'prov-1', tenantId: 'tenant-1', fullName: 'Dr. House', name: 'Dr. House', createdAt: new Date().toISOString() },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('OfficeFlowPage', () => {
  it('rooms patients and updates statuses through completion', async () => {
    render(<OfficeFlowPage />);

    await screen.findByText('Office Flow');
    await screen.findByText('Waiting Room');

    const roomSelects = screen.getAllByRole('combobox');
    const roomSelect = roomSelects.find((select) =>
      within(select).queryByRole('option', { name: 'Room patient...' })
    ) as HTMLSelectElement;

    fireEvent.change(roomSelect, { target: { value: 'room-2' } });
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringMatching(/roomed in/i))
    );

    const startButtons = await screen.findAllByRole('button', { name: 'Start Visit' });
    fireEvent.click(startButtons[0]);
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith('Visit started')
    );
    expect(apiMocks.fetchPatientEncounters).toHaveBeenCalledWith('tenant-1', 'token-1', 'pat-1');
    expect(apiMocks.createEncounter).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({
        patientId: 'pat-1',
        providerId: 'prov-1',
        appointmentId: 'appt-1',
      })
    );
    expect(navigateMock).toHaveBeenCalledWith(
      '/patients/pat-1/encounter/enc-1',
      expect.objectContaining({
        state: expect.objectContaining({
          startedEncounterFrom: 'office_flow',
          undoAppointmentStatus: 'in_room',
          returnPath: '/office-flow',
        }),
      })
    );

    const checkoutButtons = await screen.findAllByRole('button', { name: 'Check Out' });
    fireEvent.click(checkoutButtons[0]);
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith('Status updated to completed')
    );
  });

  it('calculates avg wait and avg appointment time from timestamp data', async () => {
    const now = new Date();

    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();
    const appointments = [
      {
        id: 'appt-waiting',
        tenantId: 'tenant-1',
        patientId: 'pat-waiting',
        patientFirstName: 'Waiting',
        patientLastName: 'Patient',
        providerId: 'prov-1',
        providerName: 'Dr. House',
        locationId: 'loc-1',
        locationName: 'Mountain Pine Dermatology PLLC',
        appointmentTypeId: 'type-1',
        appointmentTypeName: 'Visit',
        scheduledStart: minutesAgo(30),
        scheduledEnd: minutesAgo(10),
        status: 'checked_in',
        arrivedAt: minutesAgo(14),
        waitTimeMinutes: 14,
        createdAt: minutesAgo(35),
      },
      {
        id: 'appt-roomed',
        tenantId: 'tenant-1',
        patientId: 'pat-roomed',
        patientFirstName: 'Roomed',
        patientLastName: 'Patient',
        providerId: 'prov-1',
        providerName: 'Dr. House',
        locationId: 'loc-1',
        locationName: 'Mountain Pine Dermatology PLLC',
        appointmentTypeId: 'type-1',
        appointmentTypeName: 'Visit',
        scheduledStart: minutesAgo(60),
        scheduledEnd: minutesAgo(40),
        status: 'in_room',
        arrivedAt: minutesAgo(40),
        roomedAt: minutesAgo(20),
        createdAt: minutesAgo(65),
      },
      {
        id: 'appt-completed',
        tenantId: 'tenant-1',
        patientId: 'pat-completed',
        patientFirstName: 'Completed',
        patientLastName: 'Patient',
        providerId: 'prov-1',
        providerName: 'Dr. House',
        locationId: 'loc-1',
        locationName: 'Mountain Pine Dermatology PLLC',
        appointmentTypeId: 'type-1',
        appointmentTypeName: 'Visit',
        scheduledStart: minutesAgo(90),
        scheduledEnd: minutesAgo(60),
        status: 'completed',
        arrivedAt: minutesAgo(70),
        roomedAt: minutesAgo(50),
        completedAt: minutesAgo(20),
        createdAt: minutesAgo(95),
      },
    ];

    apiMocks.fetchFrontDeskSchedule.mockResolvedValue({ appointments });
    apiMocks.fetchPatients.mockResolvedValue({
      patients: appointments.map((appt) => ({
        id: appt.patientId,
        tenantId: 'tenant-1',
        firstName: appt.patientFirstName,
        lastName: appt.patientLastName,
        createdAt: new Date().toISOString(),
      })),
    });

    render(<OfficeFlowPage />);

    await screen.findByText('Office Flow');
    const avgWaitStat = await screen.findByTestId('avg-wait-stat');
    const avgApptTimeStat = await screen.findByTestId('avg-appt-time-stat');

    expect(within(avgWaitStat).getByText('18')).toBeInTheDocument();
    expect(within(avgApptTimeStat).getByText('30')).toBeInTheDocument();
  });

  it('moves an accidentally roomed patient back to waiting room', async () => {
    render(<OfficeFlowPage />);

    await screen.findByText('Office Flow');
    await screen.findByText('Waiting Room');

    const roomSelects = screen.getAllByRole('combobox');
    const roomSelect = roomSelects.find((select) =>
      within(select).queryByRole('option', { name: 'Room patient...' })
    ) as HTMLSelectElement;

    fireEvent.change(roomSelect, { target: { value: 'room-1' } });
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringMatching(/roomed in/i))
    );

    const moveBackButton = await screen.findByRole('button', { name: 'Move to Waiting' });
    fireEvent.click(moveBackButton);

    await waitFor(() =>
      expect(apiMocks.updatePatientFlowStatus).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'appt-1',
        'checked_in'
      )
    );
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringMatching(/moved back to waiting room/i))
    );
    expect(screen.queryByRole('button', { name: 'Move to Waiting' })).not.toBeInTheDocument();
  });
});
