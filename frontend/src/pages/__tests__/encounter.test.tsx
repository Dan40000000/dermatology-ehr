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

const routerMocks = vi.hoisted(() => ({
  params: { patientId: 'patient-1', encounterId: 'enc-1' } as {
    patientId?: string;
    encounterId?: string;
  },
}));

const autosaveMocks = vi.hoisted(() => ({
  saveNow: vi.fn().mockResolvedValue(undefined),
  status: 'idle' as const,
  lastSaved: null as Date | null,
  error: null as string | null,
}));

const apiMocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
  fetchEncounters: vi.fn(),
  createEncounter: vi.fn(),
  updateEncounter: vi.fn(),
  updateEncounterStatus: vi.fn(),
  fetchVitals: vi.fn(),
  createVitals: vi.fn(),
  fetchOrders: vi.fn(),
  createOrder: vi.fn(),
  fetchDiagnosesByEncounter: vi.fn(),
  createDiagnosis: vi.fn(),
  updateDiagnosis: vi.fn(),
  deleteDiagnosis: vi.fn(),
  fetchChargesByEncounter: vi.fn(),
  createCharge: vi.fn(),
  deleteCharge: vi.fn(),
  getSuperbillUrl: vi.fn(),
  generateAiNoteDraft: vi.fn(),
  fetchNoteTemplates: vi.fn(),
  fetchProviders: vi.fn(),
  fetchEncounterAmbientNotes: vi.fn(),
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
}));

vi.mock('../../hooks/useAutosave', () => ({
  useAutosave: () => autosaveMocks,
}));

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
}));

vi.mock('../../components/clinical', () => ({
  PatientBanner: ({ patient }: { patient: { firstName: string; lastName: string } }) => (
    <div data-testid="patient-banner">{patient.firstName} {patient.lastName}</div>
  ),
  BodyMap: ({
    view,
    onAddLesion,
    onLesionClick,
  }: {
    view: string;
    onAddLesion: (regionId: string, x: number, y: number) => void;
    onLesionClick: (lesion: { id: string }) => void;
  }) => (
    <div data-testid="body-map">
      <span>{view}</span>
      <button type="button" onClick={() => onAddLesion('left-arm', 10, 20)}>
        Add Lesion
      </button>
      <button type="button" onClick={() => onLesionClick({ id: 'lesion-1' })}>
        Select Lesion
      </button>
    </div>
  ),
  TemplateSelector: ({
    isOpen,
    onClose,
    onApply,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onApply: (template: {
      chiefComplaint?: string;
      hpi?: string;
      ros?: string;
      exam?: string;
      assessmentPlan?: string;
    }) => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="template-selector">
        <button type="button" onClick={onClose}>
          Close Template
        </button>
        <button
          type="button"
          onClick={() =>
            onApply({
              chiefComplaint: 'Template chief complaint for {{patientName}}',
              hpi: 'Template HPI',
              ros: 'Template ROS',
              exam: 'Template exam',
              assessmentPlan: 'Template plan',
            })
          }
        >
          Apply Template
        </button>
      </div>
    );
  },
}));

vi.mock('../../components/billing', () => ({
  DiagnosisSearchModal: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (code: { code: string; description: string }, isPrimary: boolean) => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="diagnosis-modal">
        <button type="button" onClick={onClose}>
          Close Diagnosis
        </button>
        <button type="button" onClick={() => onSelect({ code: 'L40.0', description: 'Psoriasis' }, true)}>
          Select Diagnosis
        </button>
      </div>
    );
  },
  ProcedureSearchModal: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (procedure: {
      code: string;
      description: string;
      quantity: number;
      feeCents: number;
      linkedDiagnosisIds: string[];
    }) => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="procedure-modal">
        <button type="button" onClick={onClose}>
          Close Procedure
        </button>
        <button
          type="button"
          onClick={() =>
            onSelect({
              code: '11100',
              description: 'Skin biopsy',
              quantity: 1,
              feeCents: 5000,
              linkedDiagnosisIds: ['dx-1'],
            })
          }
        >
          Select Procedure
        </button>
      </div>
    );
  },
}));

vi.mock('../../components/ScribePanel', () => ({
  ScribePanel: () => <div data-testid="scribe-panel" />,
}));

import { EncounterPage } from '../EncounterPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'dr@example.com', role: 'provider', fullName: 'Dr Demo' },
};

const buildFixtures = () => ({
  patient: {
    id: 'patient-1',
    firstName: 'Ana',
    lastName: 'Derm',
    dob: '1980-01-01',
  },
  encounter: {
    id: 'enc-1',
    patientId: 'patient-1',
    status: 'draft',
    createdAt: '2024-03-01T10:00:00.000Z',
    chiefComplaint: 'Itchy rash',
    hpi: 'Started last week',
    ros: 'No fever',
    exam: 'Initial exam',
    assessmentPlan: 'Plan',
  },
  vitals: {
    id: 'vitals-1',
    encounterId: 'enc-1',
    bpSystolic: 120,
    bpDiastolic: 80,
    pulse: 72,
    tempC: 37.0,
    weightKg: 70,
    heightCm: 175,
  },
  orders: [
    {
      id: 'order-1',
      encounterId: 'enc-1',
      type: 'lab',
      details: 'CBC',
    },
  ],
  diagnoses: [
    {
      id: 'dx-1',
      icd10Code: 'L40.0',
      description: 'Psoriasis',
      isPrimary: false,
    },
  ],
  charges: [
    {
      id: 'charge-1',
      cptCode: '11100',
      description: 'Biopsy',
      quantity: 1,
      feeCents: 5000,
      linkedDiagnosisIds: ['dx-1'],
    },
  ],
});

describe('EncounterPage', () => {
  let originalConfirm: typeof window.confirm | undefined;
  let originalOpen: typeof window.open | undefined;

  beforeEach(() => {
    authMocks.session = baseSession;
    routerMocks.params = { patientId: 'patient-1', encounterId: 'enc-1' };
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    autosaveMocks.saveNow.mockClear();
    navigateMock.mockClear();
    apiMocks.getSuperbillUrl.mockReturnValue('http://example.com/superbill');

    const fixtures = buildFixtures();
    apiMocks.fetchPatients.mockResolvedValue({ patients: [fixtures.patient] });
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: [fixtures.encounter] });
    apiMocks.fetchVitals.mockResolvedValue({ vitals: [fixtures.vitals] });
    apiMocks.fetchProviders.mockResolvedValue({ providers: [{ id: 'user-1', fullName: 'Dr Demo' }] });
    apiMocks.fetchOrders.mockResolvedValue({ orders: fixtures.orders });
    apiMocks.fetchDiagnosesByEncounter.mockResolvedValue({ diagnoses: fixtures.diagnoses });
    apiMocks.fetchChargesByEncounter.mockResolvedValue({ charges: fixtures.charges });
    apiMocks.createVitals.mockResolvedValue({ id: 'vitals-2' });
    apiMocks.createOrder.mockResolvedValue({ id: 'order-2' });
    apiMocks.createDiagnosis.mockResolvedValue({ id: 'dx-2' });
    apiMocks.updateDiagnosis.mockResolvedValue({ ok: true });
    apiMocks.deleteDiagnosis.mockResolvedValue({ ok: true });
    apiMocks.createCharge.mockResolvedValue({ id: 'charge-2' });
    apiMocks.deleteCharge.mockResolvedValue({ ok: true });
    apiMocks.updateEncounter.mockResolvedValue({ ok: true });
    apiMocks.updateEncounterStatus.mockResolvedValue({ ok: true });
    apiMocks.fetchNoteTemplates.mockResolvedValue({ templates: [] });
    apiMocks.fetchEncounterAmbientNotes.mockResolvedValue({ notes: [] });
    apiMocks.generateAiNoteDraft.mockResolvedValue({
      draft: {
        chiefComplaint: '',
        hpi: '',
        ros: '',
        exam: '',
        assessmentPlan: '',
        confidenceScore: 0,
        suggestions: [],
      },
    });

    const windowRef = globalThis.window as Window | undefined;
    if (windowRef) {
      originalConfirm = windowRef.confirm;
      originalOpen = windowRef.open;
      windowRef.confirm = vi.fn(() => false) as typeof window.confirm;
      windowRef.open = vi.fn() as typeof window.open;
    }
  });

  afterEach(() => {
    const windowRef = globalThis.window as Window | undefined;
    if (windowRef) {
      if (originalConfirm) windowRef.confirm = originalConfirm;
      if (originalOpen) windowRef.open = originalOpen;
    }
    vi.clearAllMocks();
  });

  it('handles vitals, orders, billing actions, and signing', async () => {
    render(<EncounterPage />);

    await screen.findByTestId('patient-banner');
    expect(screen.getByText('Encounter')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vitals' }));
    const vitalsModal = await screen.findByTestId('modal-record-vitals');
    fireEvent.change(within(vitalsModal).getByPlaceholderText('120'), { target: { value: '118' } });
    fireEvent.change(within(vitalsModal).getByPlaceholderText('80'), { target: { value: '76' } });
    fireEvent.change(within(vitalsModal).getByPlaceholderText('72'), { target: { value: '70' } });
    fireEvent.change(within(vitalsModal).getByPlaceholderText('37.0'), { target: { value: '36.8' } });
    fireEvent.change(within(vitalsModal).getByPlaceholderText('175'), { target: { value: '180' } });
    fireEvent.change(within(vitalsModal).getByPlaceholderText('70'), { target: { value: '75.5' } });
    fireEvent.click(within(vitalsModal).getByRole('button', { name: 'Save Vitals' }));

    await waitFor(() =>
      expect(apiMocks.createVitals).toHaveBeenCalledWith('tenant-1', 'token-1', {
        encounterId: 'enc-1',
        heightCm: 180,
        weightKg: 75.5,
        bpSystolic: 118,
        bpDiastolic: 76,
        pulse: 70,
        tempC: 36.8,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Order/ }));
    const orderModal = await screen.findByTestId('modal-add-order');
    fireEvent.change(within(orderModal).getByPlaceholderText('Order details...'), {
      target: { value: 'CBC and CMP' },
    });
    fireEvent.click(within(orderModal).getByRole('button', { name: 'Add Order' }));

    await waitFor(() =>
      expect(apiMocks.createOrder).toHaveBeenCalledWith('tenant-1', 'token-1', {
        encounterId: 'enc-1',
        patientId: 'patient-1',
        providerId: 'user-1',
        type: 'lab',
        details: 'CBC and CMP',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Diagnosis' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Diagnosis' }));

    await waitFor(() =>
      expect(apiMocks.createDiagnosis).toHaveBeenCalledWith('tenant-1', 'token-1', {
        encounterId: 'enc-1',
        icd10Code: 'L40.0',
        description: 'Psoriasis',
        isPrimary: true,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set Primary' }));
    await waitFor(() =>
      expect(apiMocks.updateDiagnosis).toHaveBeenCalledWith('tenant-1', 'token-1', 'dx-1', { isPrimary: true }),
    );

    const diagnosisCell = screen.getAllByText('L40.0').find((node) => node.tagName === 'TD');
    const diagnosisRow = diagnosisCell?.closest('tr');
    expect(diagnosisRow).toBeTruthy();
    fireEvent.click(within(diagnosisRow as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiMocks.deleteDiagnosis).toHaveBeenCalledWith('tenant-1', 'token-1', 'dx-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Add Procedure' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Procedure' }));

    await waitFor(() =>
      expect(apiMocks.createCharge).toHaveBeenCalledWith('tenant-1', 'token-1', {
        encounterId: 'enc-1',
        cptCode: '11100',
        description: 'Skin biopsy',
        quantity: 1,
        feeCents: 5000,
        linkedDiagnosisIds: ['dx-1'],
        amountCents: 5000,
      }),
    );

    const chargeRow = screen.getByText('11100').closest('tr');
    expect(chargeRow).toBeTruthy();
    fireEvent.click(within(chargeRow as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiMocks.deleteCharge).toHaveBeenCalledWith('tenant-1', 'token-1', 'charge-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply Template' }));
    const templateSelector = await screen.findByTestId('template-selector');
    fireEvent.click(within(templateSelector).getByRole('button', { name: 'Apply Template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clinical Note' }));
    const chiefComplaintInput = screen.getByPlaceholderText('e.g., Skin check, suspicious mole, rash on arms');
    expect((chiefComplaintInput as HTMLInputElement).value).toContain('Template chief complaint');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(autosaveMocks.saveNow).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Generate Superbill' }));
    expect(window.open).toHaveBeenCalledWith('http://example.com/superbill', '_blank');

    fireEvent.click(screen.getByRole('button', { name: 'Sign & Lock' }));
    const signModal = await screen.findByTestId('modal-sign-lock-encounter');
    fireEvent.click(within(signModal).getByRole('button', { name: 'Sign & Lock Encounter' }));

    await waitFor(() => {
      expect(apiMocks.updateEncounter).toHaveBeenCalled();
      expect(apiMocks.updateEncounterStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'enc-1', 'signed');
      expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1');
    });
  }, 15000);

  it('generates and applies an AI draft to the encounter', async () => {
    apiMocks.fetchNoteTemplates.mockResolvedValueOnce({
      templates: [
        {
          id: 'tmpl-1',
          name: 'Derm Follow-up',
          category: 'Follow-up Visit',
          templateContent: {},
        },
      ],
    });
    apiMocks.generateAiNoteDraft.mockResolvedValueOnce({
      draft: {
        chiefComplaint: 'AI Chief Complaint',
        hpi: 'AI HPI summary',
        ros: 'AI ROS',
        exam: 'AI exam findings',
        assessmentPlan: 'AI assessment and plan',
        confidenceScore: 0.9,
        suggestions: [],
      },
    });

    render(<EncounterPage />);

    await screen.findByTestId('patient-banner');
    fireEvent.click(screen.getByRole('button', { name: 'AI Draft' }));

    const aiModal = await screen.findByTestId('modal-ai-note-draft');
    await within(aiModal).findByRole('option', { name: 'Derm Follow-up (Follow-up Visit)' });
    const templateSelect = within(aiModal).getByLabelText('Template (optional)');
    fireEvent.change(templateSelect, { target: { value: 'tmpl-1' } });
    fireEvent.change(
      within(aiModal).getByPlaceholderText('Key symptoms, onset, treatments tried, exam highlights...'),
      { target: { value: 'Patient reports new lesion' } },
    );
    fireEvent.click(within(aiModal).getByRole('button', { name: 'Generate Draft' }));

    await waitFor(() =>
      expect(apiMocks.generateAiNoteDraft).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 'patient-1',
        encounterId: 'enc-1',
        chiefComplaint: 'Itchy rash',
        briefNotes: 'Patient reports new lesion',
        templateId: 'tmpl-1',
      }),
    );

    const applyButton = await within(aiModal).findByRole('button', { name: 'Apply Draft' });
    fireEvent.click(applyButton);

    await waitFor(() =>
      expect(apiMocks.updateEncounter).toHaveBeenCalledWith('tenant-1', 'token-1', 'enc-1', {
        chiefComplaint: 'AI Chief Complaint',
        hpi: 'AI HPI summary',
        ros: 'AI ROS',
        exam: 'AI exam findings',
        assessmentPlan: 'AI assessment and plan',
      }),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('AI draft applied');
  });

  it('creates a new encounter and documents a lesion', async () => {
    routerMocks.params = { patientId: 'patient-1', encounterId: 'new' };
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: [] });
    apiMocks.createEncounter.mockResolvedValue({ encounter: { id: 'enc-99' } });

    render(<EncounterPage />);

    await screen.findByTestId('patient-banner');
    fireEvent.change(
      screen.getByPlaceholderText('e.g., Skin check, suspicious mole, rash on arms'),
      { target: { value: 'Itchy rash' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skin Exam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Lesion' }));

    const lesionModal = await screen.findByTestId('modal-document-lesion');
    fireEvent.change(within(lesionModal).getByPlaceholderText('e.g., 5mm x 3mm'), {
      target: { value: '4mm x 2mm' },
    });
    fireEvent.change(within(lesionModal).getByPlaceholderText('e.g., pink, brown, erythematous'), {
      target: { value: 'brown' },
    });
    fireEvent.change(within(lesionModal).getByPlaceholderText('Additional clinical details...'), {
      target: { value: 'Raised edge' },
    });
    fireEvent.click(within(lesionModal).getByRole('button', { name: 'Add Lesion' }));

    const examNotes = screen.getByPlaceholderText(/General: Well-appearing/i);
    expect((examNotes as HTMLTextAreaElement).value).toContain('left arm');
    expect((examNotes as HTMLTextAreaElement).value).toContain('Raised edge');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(apiMocks.createEncounter).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({
          patientId: 'patient-1',
          providerId: 'user-1',
          chiefComplaint: 'Itchy rash',
          exam: expect.stringContaining('left arm'),
        }),
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/enc-99', { replace: true });
  });
});
