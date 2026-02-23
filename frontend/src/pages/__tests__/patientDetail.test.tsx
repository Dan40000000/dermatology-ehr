import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

const routerMocks = vi.hoisted(() => ({
  params: { patientId: 'patient-1' } as { patientId?: string },
}));

const apiMocks = vi.hoisted(() => ({
  fetchPatient: vi.fn(),
  fetchEncounters: vi.fn(),
  fetchAppointments: vi.fn(),
  fetchDocuments: vi.fn(),
  fetchPhotos: vi.fn(),
  fetchVitals: vi.fn(),
  fetchProviders: vi.fn(),
  fetchTasks: vi.fn(),
  fetchOrders: vi.fn(),
  fetchPrescriptionsEnhanced: vi.fn(),
  fetchEligibilityHistory: vi.fn(),
  verifyPatientEligibility: vi.fn(),
  default: {
    get: vi.fn(),
  },
  API_BASE_URL: 'http://api.test',
  TENANT_HEADER_NAME: 'x-tenant-id',
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => routerMocks.params,
  useSearchParams: () => [new URLSearchParams(), vi.fn()] as const,
}));

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
}));

vi.mock('../../components/clinical', () => ({
  PatientBanner: ({ patient, onStartEncounter }: any) => (
    <div>
      <div data-testid="patient-banner">{patient.firstName} {patient.lastName}</div>
      <button type="button" onClick={onStartEncounter}>
        Start Encounter
      </button>
    </div>
  ),
}));

vi.mock('../../components/body-diagram', () => ({
  PatientBodyDiagram: ({ patientId }: any) => (
    <div data-testid="patient-body-diagram">Body Diagram for {patientId}</div>
  ),
}));

vi.mock('../../components/ScribePanel', () => ({
  ScribePanel: () => <div data-testid="scribe-panel" />,
}));

vi.mock('../../api', () => apiMocks);

import { PatientDetailPage } from '../PatientDetailPage';

const buildFixtures = () => ({
  patient: {
    id: 'patient-1',
    firstName: 'Ana',
    lastName: 'Derm',
    dob: '1980-01-01',
    sex: 'F',
    phone: '(555) 111-2222',
    email: 'ana@example.com',
    address: '123 Main St',
    city: 'Town',
    state: 'TX',
    zip: '75001',
    insurance: {
      planName: 'Aetna Gold',
      memberId: 'MEM-1',
      groupNumber: 'GRP-1',
    },
  },
  encounters: [
    {
      id: 'enc-1',
      patientId: 'patient-1',
      status: 'draft',
      createdAt: '2024-04-01T10:00:00.000Z',
      chiefComplaint: 'Rash',
      assessmentPlan: 'Plan',
      providerName: 'Dr Demo',
    },
    {
      id: 'enc-2',
      patientId: 'patient-2',
      status: 'signed',
      createdAt: '2024-03-01T10:00:00.000Z',
    },
  ],
  appointments: [
    {
      id: 'appt-1',
      patientId: 'patient-1',
      status: 'scheduled',
      appointmentTypeName: 'Consult',
      providerName: 'Dr Demo',
      locationName: 'Main Clinic',
      scheduledStart: '2024-04-10T10:00:00.000Z',
      scheduledEnd: '2024-04-10T10:30:00.000Z',
    },
    {
      id: 'appt-2',
      patientId: 'patient-2',
      status: 'cancelled',
      scheduledStart: '2024-04-12T10:00:00.000Z',
      scheduledEnd: '2024-04-12T10:30:00.000Z',
    },
  ],
  documents: [
    {
      id: 'doc-1',
      patientId: 'patient-1',
      title: 'Lab Report',
      category: 'Lab',
      createdAt: '2024-04-02T10:00:00.000Z',
      url: 'http://files/doc1.pdf',
      filename: 'doc1.pdf',
      uploadedBy: 'Dr Demo',
    },
  ],
  photos: [
    {
      id: 'photo-1',
      patientId: 'patient-1',
      url: 'http://files/photo1.jpg',
      description: 'Left arm lesion',
      bodyLocation: 'Left arm',
      createdAt: '2024-04-03T10:00:00.000Z',
    },
  ],
});

describe('PatientDetailPage', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    routerMocks.params = { patientId: 'patient-1' };
    const fixtures = buildFixtures();
    apiMocks.fetchPatient.mockResolvedValue({ patient: fixtures.patient });
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: fixtures.encounters });
    apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
    apiMocks.fetchDocuments.mockResolvedValue({ documents: fixtures.documents });
    apiMocks.fetchPhotos.mockResolvedValue({ photos: fixtures.photos });
    apiMocks.fetchVitals.mockResolvedValue({ vitals: [] });
    apiMocks.fetchProviders.mockResolvedValue({ providers: [{ id: 'provider-1', name: 'Dr Demo' }] });
    apiMocks.fetchTasks.mockResolvedValue({ tasks: [] });
    apiMocks.fetchOrders.mockResolvedValue({ orders: [] });
    apiMocks.fetchPrescriptionsEnhanced.mockResolvedValue({ prescriptions: [] });
    apiMocks.fetchEligibilityHistory.mockResolvedValue({ history: [] });
    apiMocks.verifyPatientEligibility.mockResolvedValue({ success: true });
    apiMocks.default.get.mockResolvedValue({ data: { prescriptions: [] } });

    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: any) => {
      if (tagName === 'a') {
        return {
          click: vi.fn(),
          set href(_value: string) {},
          set download(_value: string) {},
        } as any;
      }
      return originalCreateElement(tagName);
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders patient detail data, tabs, actions, and modals', async () => {
    render(<PatientDetailPage />);

    await screen.findByText('Patient Chart - Derm, Ana');
    expect(screen.getByTestId('patient-banner')).toHaveTextContent('Ana Derm');

    fireEvent.click(screen.getAllByRole('button', { name: /New Encounter/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/new');

    fireEvent.click(screen.getByRole('button', { name: /Back to Patients/i }));
    expect(navigateMock).toHaveBeenCalledWith('/patients');

    fireEvent.click(screen.getByRole('button', { name: /Schedule Appt/i }));
    expect(navigateMock).toHaveBeenCalledWith('/schedule');

    fireEvent.click(screen.getByRole('button', { name: /Face Sheet/i }));
    const faceSheetModal = await screen.findByTestId('modal-face-sheet');
    expect(within(faceSheetModal).getByText('Aetna Gold')).toBeInTheDocument();
    fireEvent.click(within(faceSheetModal).getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalled();
    fireEvent.click(within(faceSheetModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Face Sheet/i }));
    const faceSheetModalAgain = await screen.findByTestId('modal-face-sheet');
    fireEvent.click(within(faceSheetModalAgain).getByRole('button', { name: 'Close Modal' }));

    // Body diagram is now a self-contained component with its own view controls
    expect(screen.getByTestId('patient-body-diagram')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Encounter - draft'));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/enc-1');

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(navigateMock).toHaveBeenCalledWith('/schedule');

    fireEvent.click(screen.getByRole('button', { name: 'Message' }));
    expect(navigateMock).toHaveBeenCalledWith('/mail');

    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByRole('button', { name: /Upload Document/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Photos' }));
    expect(screen.getByText('Clinical Photos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    const insuranceButtons = screen.getAllByRole('button', { name: 'Insurance' });
    fireEvent.click(insuranceButtons[insuranceButtons.length - 1]);
    expect(screen.getByText('Insurance Information')).toBeInTheDocument();
    expect(screen.getByText('Eligibility & Coverage')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Demographics' }));
    fireEvent.click(screen.getByRole('button', { name: /Edit Demographics/i }));
    const demographicsModal = await screen.findByTestId('modal-edit-demographics');
    const demoScope = within(demographicsModal);
    fireEvent.change(demoScope.getByDisplayValue('Ana'), { target: { value: 'Ann' } });
    fireEvent.click(demoScope.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
    fireEvent.click(screen.getByRole('button', { name: /Edit Insurance/i }));
    const insuranceModal = await screen.findByTestId('modal-edit-insurance');
    fireEvent.click(within(insuranceModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Medical History' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Allergy/i }));
    const allergyModal = await screen.findByTestId('modal-add-allergy');
    fireEvent.click(within(allergyModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Add Medication/i }));
    const medicationModal = await screen.findByTestId('modal-add-medication');
    fireEvent.click(within(medicationModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Add Problem/i }));
    const problemModal = await screen.findByTestId('modal-add-problem');
    fireEvent.click(within(problemModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Encounters/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/enc-1');

    fireEvent.click(screen.getByRole('button', { name: /Appointments/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+Schedule/ }));
    expect(navigateMock).toHaveBeenCalledWith('/schedule');

    fireEvent.click(screen.getByRole('button', { name: /Documents/ }));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(window.open).toHaveBeenCalledWith('http://files/doc1.pdf', '_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: /Upload Document/i }));
    expect(window.alert).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Photos/ }));
    const photoCard = screen.getByAltText('Left arm lesion').closest('div')?.parentElement as HTMLElement;
    fireEvent.mouseEnter(photoCard);
    fireEvent.mouseLeave(photoCard);
    fireEvent.click(screen.getByAltText('Left arm lesion'));
    const photoModal = await screen.findByTestId('modal-photo-viewer');
    expect(within(photoModal).getByText('Left arm lesion')).toBeInTheDocument();
    fireEvent.click(within(photoModal).getByRole('button', { name: 'Close Modal' }));
    fireEvent.click(screen.getByRole('button', { name: /Upload Photo/i }));
    expect(window.alert).toHaveBeenCalled();

    const refreshStartCalls = apiMocks.fetchPatient.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => expect(apiMocks.fetchPatient.mock.calls.length).toBeGreaterThan(refreshStartCalls));
  }, 30000);

  it('renders skeleton and skips loading when session or patient id is missing', () => {
    authMocks.session = null;
    routerMocks.params = {};

    render(<PatientDetailPage />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
    expect(apiMocks.fetchPatient).not.toHaveBeenCalled();
  });

  it('handles patient not found errors during load', async () => {
    apiMocks.fetchPatient.mockRejectedValueOnce(new Error('Patient not found'));

    render(<PatientDetailPage />);

    await screen.findByText('Patient Not Found');
    expect(toastMocks.showError).toHaveBeenCalledWith('Patient not found');
    expect(navigateMock).toHaveBeenCalledWith('/patients');
  });

  it('shows fallback error message when load fails without a message', async () => {
    apiMocks.fetchPatient.mockRejectedValueOnce({});

    render(<PatientDetailPage />);

    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('Failed to load patient data'));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders empty states when responses omit arrays', async () => {
    const fixtures = buildFixtures();
    apiMocks.fetchPatient.mockResolvedValueOnce({
      patient: {
        ...fixtures.patient,
        allergiesList: [],
        medicationsList: [],
        problemsList: [],
      } as any,
    });
    apiMocks.fetchEncounters.mockResolvedValueOnce({});
    apiMocks.fetchAppointments.mockResolvedValueOnce({});
    apiMocks.fetchDocuments.mockResolvedValueOnce({});
    apiMocks.fetchPhotos.mockResolvedValueOnce({});

    render(<PatientDetailPage />);

    await screen.findByText('No recent activity');

    fireEvent.click(screen.getByRole('button', { name: /Encounters/ }));
    expect(screen.getByText('No encounters yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Appointments/ }));
    expect(screen.getByText('No appointments')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Documents/ }));
    expect(screen.getByText('No documents')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Photos/ }));
    expect(screen.getByText('No photos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Medical History' }));
    expect(screen.getByText('No known allergies')).toBeInTheDocument();
    expect(screen.getByText('No current medications')).toBeInTheDocument();
    expect(screen.getByText('No problems recorded')).toBeInTheDocument();
  });

  it('renders encounter and appointment fallbacks and statuses', async () => {
    const fixtures = buildFixtures();
    const encounters = [
      {
        id: 'enc-signed',
        patientId: 'patient-1',
        status: 'signed',
        createdAt: '2024-04-01T10:00:00.000Z',
        chiefComplaint: '',
        assessmentPlan: '',
        providerName: '',
      },
      {
        id: 'enc-archived',
        patientId: 'patient-1',
        status: 'archived',
        createdAt: '2024-04-02T10:00:00.000Z',
        chiefComplaint: 'Follow-up',
        assessmentPlan: 'Plan',
        providerName: 'Dr Demo',
      },
    ];
    const appointments = [
      {
        id: 'appt-completed',
        patientId: 'patient-1',
        status: 'completed',
        appointmentTypeName: '',
        providerName: 'Dr Done',
        locationName: '',
        scheduledStart: '2024-04-10T10:00:00.000Z',
        scheduledEnd: '2024-04-10T10:30:00.000Z',
      },
      {
        id: 'appt-cancelled',
        patientId: 'patient-1',
        status: 'cancelled',
        appointmentTypeName: 'Follow-up',
        providerName: 'Dr Cancel',
        locationName: 'Main Clinic',
        scheduledStart: '2024-04-12T10:00:00.000Z',
        scheduledEnd: '2024-04-12T10:30:00.000Z',
      },
    ];

    apiMocks.fetchEncounters.mockResolvedValueOnce({ encounters });
    apiMocks.fetchAppointments.mockResolvedValueOnce({ appointments });

    render(<PatientDetailPage />);

    await screen.findByText('Patient Chart - Derm, Ana');
    expect(screen.getByText('Appointment')).toBeInTheDocument();
    expect(screen.getByText('completed').className).toContain('established');

    fireEvent.click(screen.getByRole('button', { name: /Encounters/ }));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('signed').className).toContain('established');
    expect(screen.getByText('archived').className).toContain('inactive');

    fireEvent.click(screen.getByRole('button', { name: /Appointments/ }));
    expect(screen.getByText('completed').className).toContain('established');
    expect(screen.getByText('cancelled').className).toContain('inactive');
  });

  it('renders face sheet and demographics fallbacks with missing patient fields', async () => {
    const patient = {
      id: 'patient-1',
      firstName: '',
      lastName: '',
      dob: '',
      sex: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      mrn: '',
      insurance: null,
      allergies: [],
      medications: '',
    } as any;

    apiMocks.fetchPatient.mockResolvedValueOnce({ patient });
    apiMocks.fetchEncounters.mockResolvedValueOnce({ encounters: [] });
    apiMocks.fetchAppointments.mockResolvedValueOnce({
      appointments: [
        {
          id: 'appt-cancelled',
          patientId: 'patient-1',
          status: 'cancelled',
          scheduledStart: '2024-04-10T10:00:00.000Z',
          scheduledEnd: '2024-04-10T10:30:00.000Z',
        },
      ],
    });
    apiMocks.fetchDocuments.mockResolvedValueOnce({ documents: [] });
    apiMocks.fetchPhotos.mockResolvedValueOnce({ photos: [] });

    render(<PatientDetailPage />);

    await screen.findByTestId('patient-banner');

    fireEvent.click(screen.getByRole('button', { name: 'Demographics' }));
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not specified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not assigned').length).toBeGreaterThan(0);

    authMocks.session = null;
    fireEvent.click(screen.getByRole('button', { name: /Edit Demographics/i }));
    const demographicsModal = await screen.findByTestId('modal-edit-demographics');
    const demoInputs = demographicsModal.querySelectorAll('input');
    expect(demoInputs[0]?.value).toBe('');
    fireEvent.click(within(demographicsModal).getByRole('button', { name: 'Save Changes' }));
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Face Sheet/i }));
    const faceSheetModal = await screen.findByTestId('modal-face-sheet');
    const faceScope = within(faceSheetModal);
    expect(faceScope.getByText(/DOB: N\/A/)).toBeInTheDocument();
    expect(faceScope.getByText(/Sex: N\/A/)).toBeInTheDocument();
    expect(faceScope.getByText(/No phone/)).toBeInTheDocument();
    expect(faceScope.getByText(/No email/)).toBeInTheDocument();
    expect(faceScope.getByText('N/A')).toBeInTheDocument();
    expect(faceScope.getByText('No insurance on file')).toBeInTheDocument();
    expect(faceScope.getByText('None reported')).toBeInTheDocument();
    expect(faceScope.getByText('None on file')).toBeInTheDocument();
    expect(faceScope.getByText('No upcoming appointment.')).toBeInTheDocument();
  });

  it('renders face sheet provider fallbacks with allergies and insurance details', async () => {
    const fixtures = buildFixtures();
    const patient = {
      ...fixtures.patient,
      email: '',
      insurance: {
        planName: 'Blue Shield',
        memberId: 'MEM-99',
      },
      allergies: ['Peanuts', 'Pollen'],
      medications: 'Spironolactone',
      insuranceDetails: {
        primaryCarrier: 'Blue Shield',
        primaryPolicyNumber: 'POL-1',
        primaryGroupNumber: 'GRP-9',
        primarySubscriberName: 'Pat Subscriber',
        primaryRelationship: 'Self',
        primaryEffectiveDate: '2024-01-15',
        secondaryCarrier: 'United',
        secondaryPolicyNumber: 'POL-2',
        secondaryGroupNumber: 'GRP-2',
        secondarySubscriberName: 'Pat Subscriber',
        secondaryRelationship: 'Spouse',
        secondaryEffectiveDate: '2023-06-01',
        cardFrontUrl: 'http://files/front.png',
        cardBackUrl: 'http://files/back.png',
      },
    } as any;
    const appointments = [
      {
        id: 'appt-next',
        patientId: 'patient-1',
        status: 'scheduled',
        appointmentTypeName: 'Checkup',
        providerName: '',
        locationName: '',
        scheduledStart: '2024-05-10T10:00:00.000Z',
        scheduledEnd: '2024-05-10T10:30:00.000Z',
      },
    ];

    apiMocks.fetchPatient.mockResolvedValueOnce({ patient });
    apiMocks.fetchAppointments.mockResolvedValueOnce({ appointments });
    apiMocks.fetchEncounters.mockResolvedValueOnce({ encounters: [] });
    apiMocks.fetchDocuments.mockResolvedValueOnce({ documents: [] });
    apiMocks.fetchPhotos.mockResolvedValueOnce({ photos: [] });

    render(<PatientDetailPage />);

    await screen.findByText('Patient Chart - Derm, Ana');

    fireEvent.click(screen.getByRole('button', { name: /Face Sheet/i }));
    const faceSheetModal = await screen.findByTestId('modal-face-sheet');
    const faceScope = within(faceSheetModal);
    expect(faceScope.getByText('Peanuts, Pollen')).toBeInTheDocument();
    expect(faceScope.getByText('Spironolactone')).toBeInTheDocument();
    expect(faceScope.getByText(/with Provider/)).toBeInTheDocument();
    expect(faceScope.queryByText(/@/)).not.toBeInTheDocument();

    const insuranceButtons = screen.getAllByRole('button', { name: 'Insurance' });
    fireEvent.click(insuranceButtons[0]);
    const primaryDate = new Date('2024-01-15').toLocaleDateString();
    const secondaryDate = new Date('2023-06-01').toLocaleDateString();
    expect(screen.getAllByText('Pat Subscriber').length).toBeGreaterThan(0);
    expect(screen.getByText(primaryDate)).toBeInTheDocument();
    expect(screen.getByText(secondaryDate)).toBeInTheDocument();
    expect(screen.getByAltText('Insurance card front')).toBeInTheDocument();
    expect(screen.getByAltText('Insurance card back')).toBeInTheDocument();
  });

  it('covers medical history severity and non-active status', async () => {
    const fixtures = buildFixtures();
    apiMocks.fetchPatient.mockResolvedValueOnce({
      patient: {
        ...fixtures.patient,
        allergiesList: [{ name: 'Dust', severity: 'mild', reaction: 'Sneezing' }],
        medicationsList: [{ name: 'Retinol', dosage: 'Nightly', prescribedDate: '2024-03-01' }],
        problemsList: [{ name: 'Rosacea', icdCode: 'L71.9', status: 'Resolved', onsetDate: '2022-01-01' }],
      } as any,
    });

    render(<PatientDetailPage />);

    await screen.findByTestId('patient-banner');

    fireEvent.click(screen.getByRole('button', { name: 'Medical History' }));
    expect(screen.getByText('mild')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('renders document and photo fallbacks', async () => {
    const fixtures = buildFixtures();
    apiMocks.fetchDocuments.mockResolvedValueOnce({
      documents: [
        {
          id: 'doc-2',
          patientId: 'patient-1',
          title: 'Scan',
          category: '',
          createdAt: '2024-04-02T10:00:00.000Z',
          url: 'http://files/doc2.pdf',
        },
      ],
    });
    apiMocks.fetchPhotos.mockResolvedValueOnce({
      photos: [
        {
          id: 'photo-2',
          patientId: 'patient-1',
          url: 'http://files/photo2.jpg',
          description: '',
          bodyLocation: '',
          createdAt: '2024-04-03T10:00:00.000Z',
        },
      ],
    });

    render(<PatientDetailPage />);

    await screen.findByText('Patient Chart - Derm, Ana');

    fireEvent.click(screen.getAllByRole('button', { name: /Documents/ })[0]);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    fireEvent.click(screen.getAllByRole('button', { name: /Photos/ })[0]);
    expect(screen.getByText('Unknown location')).toBeInTheDocument();
    const photoImg = screen.getByRole('img', { name: 'Patient photo' });
    fireEvent.click(photoImg);
    const photoModal = await screen.findByTestId('modal-photo-viewer');
    expect(within(photoModal).getByRole('img', { name: 'Patient photo' })).toBeInTheDocument();
    expect(within(photoModal).queryByText(/Location:/)).not.toBeInTheDocument();
  });

  it('handles missing patient responses', async () => {
    apiMocks.fetchPatient.mockResolvedValueOnce({ patient: null });

    render(<PatientDetailPage />);

    await screen.findByText('Patient Not Found');
    expect(toastMocks.showError).toHaveBeenCalledWith('Patient not found');
    expect(navigateMock).toHaveBeenCalledWith('/patients');
  });

  it('handles demographics save errors and missing dob', async () => {
    const fixtures = buildFixtures();
    apiMocks.fetchPatient.mockResolvedValueOnce({
      patient: { ...fixtures.patient, dob: '' },
    });
    apiMocks.fetchEncounters.mockResolvedValueOnce({ encounters: [] });
    apiMocks.fetchAppointments.mockResolvedValueOnce({ appointments: [] });
    apiMocks.fetchDocuments.mockResolvedValueOnce({ documents: [] });
    apiMocks.fetchPhotos.mockResolvedValueOnce({ photos: [] });
    (global.fetch as any).mockResolvedValueOnce({ ok: false });

    render(<PatientDetailPage />);

    await screen.findByText('Patient Chart - Derm, Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Demographics' }));
    const ageLabel = screen.getByText('Age');
    const ageRow = ageLabel.parentElement as HTMLElement;
    expect(within(ageRow).getByText('N/A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit Demographics/i }));
    const demographicsModal = await screen.findByTestId('modal-edit-demographics');
    const inputs = demographicsModal.querySelectorAll('input');
    const select = demographicsModal.querySelector('select') as HTMLSelectElement;
    expect(inputs.length).toBeGreaterThanOrEqual(9);

    const [
      firstNameInput,
      lastNameInput,
      dobInput,
      phoneInput,
      emailInput,
      addressInput,
      cityInput,
      stateInput,
      zipInput,
    ] = Array.from(inputs) as HTMLInputElement[];

    fireEvent.change(firstNameInput, { target: { value: 'Ann' } });
    fireEvent.change(lastNameInput, { target: { value: 'Demo' } });
    fireEvent.change(dobInput, { target: { value: '1982-02-02' } });
    fireEvent.change(select, { target: { value: 'O' } });
    fireEvent.change(phoneInput, { target: { value: '(555) 111-9999' } });
    fireEvent.change(emailInput, { target: { value: 'ann@example.com' } });
    fireEvent.change(addressInput, { target: { value: '42 Oak St' } });
    fireEvent.change(cityInput, { target: { value: 'Plano' } });
    fireEvent.change(stateInput, { target: { value: 'TX' } });
    fireEvent.change(zipInput, { target: { value: '75000' } });

    fireEvent.click(within(demographicsModal).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to update patient demographics'));
  });
});
