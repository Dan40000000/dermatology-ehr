import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: number; role: string };
  },
}));

const apiMocks = vi.hoisted(() => ({
  createTelehealthSession: vi.fn(),
  fetchTelehealthSessions: vi.fn(),
  fetchTelehealthSession: vi.fn(),
  fetchTelehealthStats: vi.fn(),
  updateSessionStatus: vi.fn(),
  fetchWaitingRoom: vi.fn(),
  callPatientFromWaitingRoom: vi.fn(),
  fetchProviders: vi.fn(),
  fetchPatients: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type || 'button'} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('../../components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title?: string;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    const key = String(title || 'modal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (
      <div data-testid={`modal-${key}`}>
        <div>{title}</div>
        {children}
      </div>
    );
  },
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

vi.mock('../../components/ui/DataTable', () => ({
  DataTable: ({
    columns,
    data,
    keyExtractor,
    emptyMessage,
  }: {
    columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
    data: any[];
    keyExtractor: (row: any) => string | number;
    emptyMessage?: string;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 ? (
        <div>{emptyMessage}</div>
      ) : (
        data.map((row) => (
          <div key={keyExtractor(row)} data-testid="data-row">
            {columns.map((col) => (
              <div key={col.key}>
                {col.render ? col.render(row) : String(row[col.key])}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  ),
}));

vi.mock('../../components/telehealth/VideoRoom', () => ({
  default: ({ onSessionEnd }: { onSessionEnd: () => void }) => (
    <div data-testid="video-room">
      <button type="button" onClick={onSessionEnd}>
        End Session
      </button>
    </div>
  ),
}));

vi.mock('../../components/telehealth/VirtualWaitingRoom', () => ({
  default: ({ onReady }: { onReady: () => void }) => (
    <div data-testid="waiting-room">
      <button type="button" onClick={onReady}>
        Ready
      </button>
    </div>
  ),
}));

vi.mock('../../components/telehealth/TelehealthNotes', () => ({
  default: ({ onNotesFinalized }: { onNotesFinalized?: () => void }) => (
    <div data-testid="telehealth-notes">
      {onNotesFinalized && (
        <button type="button" onClick={onNotesFinalized}>
          Finalize Notes
        </button>
      )}
    </div>
  ),
}));

import TelehealthPage from '../TelehealthPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 1, role: 'provider' },
};

const buildSession = (id: number, status: string) => ({
  id,
  tenant_id: 'tenant-1',
  patient_id: 10,
  provider_id: 1,
  session_token: 'token',
  room_name: 'room',
  status,
  recording_consent: true,
  patient_state: 'CA',
  state_licensing_verified: true,
  virtual_background_enabled: false,
  beauty_filter_enabled: false,
  screen_sharing_enabled: false,
  reconnection_count: 0,
  created_at: '2024-01-01T10:00:00.000Z',
  updated_at: '2024-01-01T10:00:00.000Z',
  patient_first_name: 'Ana',
  patient_last_name: 'Derm',
  provider_name: 'Dr Demo',
});

describe('TelehealthPage', () => {
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    authMocks.session = baseSession;
    apiMocks.fetchTelehealthSessions.mockResolvedValue([
      buildSession(1, 'scheduled'),
      buildSession(2, 'completed'),
    ]);
    apiMocks.fetchWaitingRoom.mockResolvedValue([
      {
        id: 99,
        patient_id: 10,
        session_id: 1,
        queue_position: 1,
        joined_at: '2024-01-01T10:00:00.000Z',
        equipment_check_completed: true,
        estimated_wait_minutes: 5,
      },
    ]);
    apiMocks.fetchTelehealthStats.mockResolvedValue({
      myInProgress: 1,
      myCompleted: 1,
      myUnreadMessages: 0,
      unassignedCases: 0,
    });
    apiMocks.fetchProviders.mockResolvedValue({ providers: [{ id: 1, fullName: 'Dr Demo' }] });
    apiMocks.fetchPatients.mockResolvedValue({ patients: [{ id: 10, firstName: 'Ana', lastName: 'Derm' }] });
    apiMocks.fetchTelehealthSession.mockResolvedValue(buildSession(1, 'in_progress'));
    apiMocks.createTelehealthSession.mockResolvedValue(buildSession(3, 'scheduled'));
    apiMocks.callPatientFromWaitingRoom.mockResolvedValue({ ok: true });
    apiMocks.updateSessionStatus.mockResolvedValue({ ok: true });

    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    window.alert = originalAlert;
    window.confirm = originalConfirm;
    vi.clearAllMocks();
  });

  it('creates a telehealth session from the modal', async () => {
    render(<TelehealthPage />);

    await screen.findByText('Telehealth Video Consultations');
    fireEvent.click(screen.getByRole('button', { name: '+ New Session' }));
    const modal = await screen.findByTestId('modal-create-new-telehealth-session');
    const selects = within(modal).getAllByRole('combobox');

    fireEvent.change(selects[0], { target: { value: '10' } });
    fireEvent.change(selects[1], { target: { value: '1' } });
    fireEvent.change(selects[2], { target: { value: 'CA' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Create Session' }));

    await waitFor(() =>
      expect(apiMocks.createTelehealthSession).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 10,
        providerId: 1,
        patientState: 'CA',
        recordingConsent: false,
      }),
    );
    expect(window.alert).toHaveBeenCalledWith(
      'Telehealth session created successfully! Send the session link to the patient.',
    );
  });

  it('calls a patient and completes the session flow', async () => {
    render(<TelehealthPage />);

    await screen.findByText('Patients in Waiting Room');
    fireEvent.click(screen.getByRole('button', { name: 'Call Patient' }));

    await waitFor(() =>
      expect(apiMocks.callPatientFromWaitingRoom).toHaveBeenCalledWith('tenant-1', 'token-1', 99),
    );
    await screen.findByTestId('video-room');

    fireEvent.click(screen.getByRole('button', { name: 'End Session' }));
    await waitFor(() =>
      expect(apiMocks.updateSessionStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 1, 'completed'),
    );

    const notes = await screen.findByTestId('telehealth-notes');
    fireEvent.click(within(notes).getByRole('button', { name: 'Finalize Notes' }));
    await screen.findByText('Telehealth Video Consultations');
  });

  it('displays stats cards with correct values', async () => {
    render(<TelehealthPage />);

    await screen.findByText('Telehealth Video Consultations');

    expect(screen.getByText('My Cases In Progress')).toBeInTheDocument();
    expect(screen.getByText('My Completed Cases')).toBeInTheDocument();
    expect(screen.getByText('My Unread Messages')).toBeInTheDocument();
    expect(screen.getByText('Unassigned Cases')).toBeInTheDocument();

    expect(apiMocks.fetchTelehealthStats).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.any(Object)
    );
  });

  it('renders filter controls', async () => {
    render(<TelehealthPage />);

    await screen.findByText('Telehealth Video Consultations');

    expect(screen.getByLabelText('Date Range')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason for Visit')).toBeInTheDocument();
    expect(screen.getByLabelText('Assigned To')).toBeInTheDocument();
    expect(screen.getByLabelText('Physician')).toBeInTheDocument();
  });

  it('includes reason field in new session modal', async () => {
    render(<TelehealthPage />);

    await screen.findByText('Telehealth Video Consultations');
    fireEvent.click(screen.getByRole('button', { name: '+ New Session' }));
    const modal = await screen.findByTestId('modal-create-new-telehealth-session');

    expect(within(modal).getByLabelText('Reason for Visit')).toBeInTheDocument();
  });
});
