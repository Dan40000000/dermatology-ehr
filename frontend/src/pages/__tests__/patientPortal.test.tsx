import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { PortalLoginPage } from '../patient-portal/PortalLoginPage';
import { PortalRegisterPage } from '../patient-portal/PortalRegisterPage';
import { PortalDashboardPage } from '../patient-portal/PortalDashboardPage';
import { PortalAppointmentsPage } from '../patient-portal/PortalAppointmentsPage';
import { PortalDocumentsPage } from '../patient-portal/PortalDocumentsPage';
import { PortalHealthRecordPage } from '../patient-portal/PortalHealthRecordPage';
import { PortalProfilePage } from '../patient-portal/PortalProfilePage';
import { PortalVisitSummariesPage } from '../patient-portal/PortalVisitSummariesPage';
import { PatientPortalMessagesPage } from '../patient-portal/MessagesPage';

const navigateMock = vi.hoisted(() => vi.fn());
const patientPortalFetchMock = vi.hoisted(() => vi.fn());

const portalAuthMocks = vi.hoisted(() => ({
  patient: {
    id: 'patient-1',
    firstName: 'Jamie',
    lastName: 'Lee',
    email: 'jamie@example.com',
  },
  sessionToken: 'token',
  tenantId: 'tenant-demo',
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  toasts: [],
  showToast: vi.fn(() => 1),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  dismissToast: vi.fn(),
  dismissAll: vi.fn(),
}));

const portalApiMocks = vi.hoisted(() => ({
  fetchPortalProfile: vi.fn(),
  updatePortalProfile: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../contexts/PatientPortalAuthContext', () => ({
  usePatientPortalAuth: () => portalAuthMocks,
  patientPortalFetch: patientPortalFetchMock,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../portalApi', () => portalApiMocks);

const renderWithRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  navigateMock.mockReset();
  patientPortalFetchMock.mockReset();
  portalAuthMocks.isAuthenticated = false;
  portalAuthMocks.isLoading = false;
  portalAuthMocks.patient = {
    id: 'patient-1',
    firstName: 'Jamie',
    lastName: 'Lee',
    email: 'jamie@example.com',
  };
  portalAuthMocks.sessionToken = 'token';
  portalAuthMocks.tenantId = 'tenant-demo';
  portalAuthMocks.login.mockReset().mockResolvedValue(undefined);
  portalAuthMocks.logout.mockReset().mockResolvedValue(undefined);
  portalAuthMocks.register.mockReset().mockResolvedValue(undefined);
  portalApiMocks.fetchPortalProfile.mockReset();
  portalApiMocks.updatePortalProfile.mockReset();
  toastMocks.showSuccess.mockReset();
  toastMocks.showError.mockReset();
});

describe('Patient portal pages', () => {
  it('submits login and navigates to dashboard', async () => {
    renderWithRouter(<PortalLoginPage />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'patient@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() =>
      expect(portalAuthMocks.login).toHaveBeenCalledWith('tenant-demo', 'patient@example.com', 'secret')
    );
    expect(navigateMock).toHaveBeenCalledWith('/portal/dashboard');
  }, 15000);

  it('shows a login error when credentials fail', async () => {
    portalAuthMocks.login.mockRejectedValueOnce(new Error('Bad credentials'));
    renderWithRouter(<PortalLoginPage />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'patient@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByText('Bad credentials')).toBeInTheDocument();
  });

  it('renders the registration page', () => {
    renderWithRouter(<PortalRegisterPage />);
    expect(screen.getByRole('heading', { name: /verify your identity/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
  });

  it('loads and renders the portal dashboard', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/patient-portal-data/dashboard') {
        return Promise.resolve({
          dashboard: {
            upcomingAppointments: 2,
            newDocuments: 1,
            newVisits: 3,
            activePrescriptions: 4,
            nextAppointment: {
              appointmentDate: '2025-02-01',
              appointmentTime: '14:30',
              providerName: 'Dr. Rivera',
            },
          },
        });
      }
      return Promise.resolve({});
    });

    renderWithRouter(<PortalDashboardPage />);

    expect(await screen.findByText('Upcoming Appointments')).toBeInTheDocument();
    expect(screen.getByText('Next Appointment')).toBeInTheDocument();
    expect(screen.getByText('Dr. Rivera')).toBeInTheDocument();
    expect(patientPortalFetchMock).toHaveBeenCalledWith('/api/patient-portal-data/dashboard');
  });

  it('loads appointments and handles check-in actions', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/patient-portal-data/appointments')) {
        return Promise.resolve({
          appointments: [
            {
              id: 'apt-1',
              appointmentDate: '2025-02-10',
              appointmentTime: '09:30',
              status: 'scheduled',
              appointmentType: 'Consultation',
              providerName: 'Dr. Vega',
              locationName: 'Main Clinic',
            },
          ],
        });
      }
      if (endpoint === '/api/patient-portal-data/checkin/start') {
        return Promise.resolve({ sessionId: 'session-1' });
      }
      if (endpoint === '/api/patient-portal-data/checkin/session-1/complete') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    renderWithRouter(<PortalAppointmentsPage />);

    expect(await screen.findByText('Consultation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start Pre-Check-In/i }));
    await screen.findByRole('button', { name: /Complete Check-In/i });

    expect(patientPortalFetchMock).toHaveBeenCalledWith(
      '/api/patient-portal-data/checkin/start',
      expect.objectContaining({ method: 'POST' })
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringContaining('Pre-check-in started'));

    fireEvent.click(screen.getByRole('button', { name: /Complete Check-In/i }));

    await waitFor(() =>
      expect(patientPortalFetchMock).toHaveBeenCalledWith(
        '/api/patient-portal-data/checkin/session-1/complete',
        expect.objectContaining({ method: 'PUT' })
      )
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringContaining('Check-in completed'));

    fireEvent.click(screen.getByRole('button', { name: /Past History/i }));
    await waitFor(() =>
      expect(patientPortalFetchMock).toHaveBeenCalledWith('/api/patient-portal-data/appointments?status=past')
    );
  });

  it('renders patient portal messages and modals', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const threads = [
      {
        id: 'thread-1',
        subject: 'Prescription Question',
        category: 'general',
        priority: 'normal',
        status: 'open',
        lastMessageAt: new Date().toISOString(),
        lastMessageBy: 'Dr. White',
        lastMessagePreview: 'Hello there',
        isReadByPatient: false,
        messageCount: 2,
        unreadCount: 1,
      },
    ];

    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ threads }),
    } as Response);

    render(<PatientPortalMessagesPage />);

    expect(await screen.findByText('Prescription Question')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New Message/i }));
    expect(screen.getByRole('heading', { name: 'New Message' })).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', { name: /Close/i });
    fireEvent.click(closeButtons[0]);

    fireEvent.click(screen.getByText('Prescription Question'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Prescription Question' })).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('loads portal documents', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/patient-portal-data/documents') {
        return Promise.resolve({ documents: [] });
      }
      return Promise.resolve({});
    });
    renderWithRouter(<PortalDocumentsPage />);
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument();
  });

  it('loads portal health record', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/patient-portal-data/allergies') {
        return Promise.resolve({ allergies: [] });
      }
      if (endpoint === '/api/patient-portal-data/medications') {
        return Promise.resolve({ medications: [] });
      }
      if (endpoint === '/api/patient-portal-data/vitals') {
        return Promise.resolve({ vitals: [] });
      }
      if (endpoint === '/api/patient-portal-data/lab-results') {
        return Promise.resolve({ labResults: [] });
      }
      return Promise.resolve({});
    });

    renderWithRouter(<PortalHealthRecordPage />);
    expect(await screen.findByRole('heading', { name: 'Health Record' })).toBeInTheDocument();
  });

  it('loads portal profile', async () => {
    portalApiMocks.fetchPortalProfile.mockResolvedValueOnce({
      patient: {
        id: 'patient-1',
        firstName: 'Jamie',
        lastName: 'Lee',
        email: 'jamie@example.com',
      },
    });

    renderWithRouter(<PortalProfilePage />);
    expect(await screen.findByText('Jamie Lee')).toBeInTheDocument();
  });

  it('loads visit summaries', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/patient-portal-data/visit-summaries') {
        return Promise.resolve({ summaries: [] });
      }
      return Promise.resolve({});
    });
    renderWithRouter(<PortalVisitSummariesPage />);
    expect(await screen.findByText('Your Visit Summaries')).toBeInTheDocument();
  });
});
