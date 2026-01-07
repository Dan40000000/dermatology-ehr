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
  fetchPatients: vi.fn(),
  fetchAppointments: vi.fn(),
  fetchEncounters: vi.fn(),
  fetchTasks: vi.fn(),
  fetchAnalytics: vi.fn(),
  updateEncounterStatus: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../utils/export', () => ({
  exportToCSV: vi.fn(),
  exportToPDF: vi.fn(),
  printPage: vi.fn(),
  formatDate: (value: string | Date | null | undefined) => String(value ?? ''),
}));

import { HomePage } from '../HomePage';
import { exportToCSV } from '../../utils/export';

const buildFixtures = () => {
  const now = new Date();
  const today = new Date(now);
  const todayMorning = new Date(now);
  todayMorning.setHours(9, 0, 0, 0);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(11, 0, 0, 0);

  return {
    patients: [
      { id: 'patient-1', firstName: 'Amy', lastName: 'Derm', mrn: 'MRN-1' },
      { id: 'patient-2', firstName: 'Bob', lastName: 'Skin', mrn: 'MRN-2' },
    ],
    providers: [
      { id: 'provider-1', fullName: 'Dr One' },
      { id: 'provider-2', fullName: 'Dr Two' },
    ],
    encounters: [
      {
        id: 'enc-1',
        patientId: 'patient-1',
        providerId: 'provider-1',
        status: 'draft',
        chiefComplaint: 'Rash',
        createdAt: todayMorning.toISOString(),
        updatedAt: todayMorning.toISOString(),
      },
      {
        id: 'enc-2',
        patientId: 'patient-2',
        providerId: 'provider-1',
        status: 'finalized',
        chiefComplaint: 'Checkup',
        createdAt: yesterday.toISOString(),
        updatedAt: today.toISOString(),
      },
      {
        id: 'enc-3',
        patientId: 'patient-3',
        providerId: 'provider-2',
        status: 'locked',
        chiefComplaint: '',
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
      },
    ],
    appointments: [
      { id: 'appt-1', status: 'scheduled' },
      { id: 'appt-2', status: 'checked_in' },
      { id: 'appt-3', status: 'completed' },
    ],
    tasks: [
      { id: 'task-1', status: 'open' },
      { id: 'task-2', status: 'closed' },
    ],
    analytics: { counts: { patients: 42 } },
  };
};

describe('HomePage', () => {
  let printSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1' },
    };

    const fixtures = buildFixtures();
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: fixtures.encounters });
    apiMocks.fetchTasks.mockResolvedValue({ tasks: fixtures.tasks });
    apiMocks.fetchAnalytics.mockResolvedValue(fixtures.analytics);
    apiMocks.updateEncounterStatus.mockResolvedValue({});

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ providers: fixtures.providers }),
    }));

    if (!window.print) {
      Object.defineProperty(window, 'print', { value: () => undefined, writable: true });
    }
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  });

  afterEach(() => {
    printSpy?.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads dashboard data, filters, tabs, and bulk actions', async () => {
    render(<HomePage />);

    await screen.findByText('Derm, Amy');

    expect(apiMocks.fetchPatients).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchAppointments).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchEncounters).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchTasks).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchAnalytics).toHaveBeenCalledWith('tenant-1', 'token-1');

    fireEvent.click(screen.getByRole('button', { name: /New Patient/i }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/new');

    fireEvent.click(screen.getByRole('button', { name: /Regulatory Reporting/i }));
    fireEvent.click(screen.getByRole('button', { name: 'MIPS Report' }));
    expect(navigateMock).toHaveBeenCalledWith('/quality/mips');
    expect(screen.queryByText('MIPS Report')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const filterSelects = screen.getAllByRole('combobox');
    fireEvent.change(filterSelects[0], { target: { value: 'patient-1' } });
    fireEvent.change(filterSelects[1], { target: { value: 'consultation' } });
    fireEvent.change(filterSelects[7], { target: { value: 'provider-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Filters applied');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect((filterSelects[0] as HTMLSelectElement).value).toBe('');
    expect((filterSelects[7] as HTMLSelectElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Hide Filters/i }));
    expect(screen.queryByText('Assigned To')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /My Preliminary Notes for Today/i }));
    expect(screen.getByText('Derm, Amy')).toBeInTheDocument();
    expect(screen.queryByText('Skin, Bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All Notes' }));
    expect(screen.getByText('Skin, Bob')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);

    const amyRow = screen.getByText('Derm, Amy').closest('tr') as HTMLElement;
    fireEvent.click(within(amyRow).getByRole('checkbox'));

    const finalizeButton = screen.getByRole('button', { name: /Finalize Selected Notes/ });
    const downloadButton = screen.getByRole('button', { name: /Download Notes/ });

    expect(finalizeButton).toBeEnabled();
    expect(downloadButton).toBeEnabled();

    fireEvent.click(downloadButton);
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Download feature coming soon');

    fireEvent.click(within(amyRow).getByRole('button', { name: 'View' }));
    expect(navigateMock).toHaveBeenCalledWith('/encounters/enc-1');

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export as CSV' }));
    expect(exportToCSV).toHaveBeenCalled();
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Exported 3 encounters as CSV');

    apiMocks.updateEncounterStatus.mockRejectedValueOnce(new Error('finalize failed'));
    fireEvent.click(finalizeButton);
    await waitFor(() =>
      expect(apiMocks.updateEncounterStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'enc-1', 'finalized')
    );
    expect(toastMocks.showError).toHaveBeenCalledWith('finalize failed');

    fireEvent.click(screen.getByRole('button', { name: /Print Table/i }));
    expect(printSpy).toHaveBeenCalled();
  }, 20000);

  it('validates and submits reminder modal', async () => {
    render(<HomePage />);

    await screen.findByText('Derm, Amy');

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

    render(<HomePage />);

    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();

    authMocks.session = {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1' },
    };
    apiMocks.fetchPatients.mockRejectedValueOnce(new Error('load failed'));

    render(<HomePage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('load failed'));
  });
});
