import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

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
  showInfo: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchFeeSchedules: vi.fn(),
  fetchFeeSchedule: vi.fn(),
  createFeeSchedule: vi.fn(),
  updateFeeSchedule: vi.fn(),
  deleteFeeSchedule: vi.fn(),
  updateFeeScheduleItem: vi.fn(),
  deleteFeeScheduleItem: vi.fn(),
  importFeeScheduleItems: vi.fn(),
  exportFeeSchedule: vi.fn(),
  fetchPriorAuths: vi.fn(),
  createPriorAuth: vi.fn(),
  updatePriorAuth: vi.fn(),
  submitPriorAuth: vi.fn(),
  uploadPriorAuthDocument: vi.fn(),
  checkPriorAuthStatus: vi.fn(),
  fetchPatients: vi.fn(),
  fetchClaims: vi.fn(),
  submitClaimToClearinghouse: vi.fn(),
  fetchClaimStatus: vi.fn(),
  fetchRemittanceAdvice: vi.fn(),
  fetchERADetails: vi.fn(),
  postERA: vi.fn(),
  fetchEFTTransactions: vi.fn(),
  reconcilePayments: vi.fn(),
  fetchClosingReport: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="panel">{children}</div>,
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
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

import { FeeSchedulePage } from '../FeeSchedulePage';
import { PriorAuthPage } from '../PriorAuthPage';
import { QuotesPage } from '../QuotesPage';
import { ClearinghousePage } from '../ClearinghousePage';

const confirmSpy = vi.spyOn(window, 'confirm');

afterAll(() => {
  confirmSpy.mockRestore();
});

const adminSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
};

const basicSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-2', email: 'staff@example.com', role: 'staff', fullName: 'Staff User' },
};

describe('FeeSchedulePage', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    authMocks.session = adminSession;
    confirmSpy.mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();

    apiMocks.fetchFeeSchedules.mockResolvedValue([
      { id: 'sched-1', name: 'Default Schedule', isDefault: true, description: '' },
      { id: 'sched-2', name: 'Cash Pay', isDefault: false, description: '' },
    ]);
    apiMocks.fetchFeeSchedule.mockResolvedValue({
      items: [
        { id: 'item-1', cptCode: '99213', cptDescription: 'Office visit', feeCents: 12500 },
      ],
    });
    apiMocks.createFeeSchedule.mockResolvedValue({ id: 'sched-3' });
    apiMocks.updateFeeSchedule.mockResolvedValue({ ok: true });
    apiMocks.updateFeeScheduleItem.mockResolvedValue({ ok: true });
    apiMocks.deleteFeeScheduleItem.mockResolvedValue({ ok: true });
    apiMocks.importFeeScheduleItems.mockResolvedValue({ imported: 1, total: 1 });
    apiMocks.exportFeeSchedule.mockResolvedValue(new Blob(['fee,csv']));
  });

  afterEach(() => {
    confirmSpy.mockReset();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    vi.clearAllMocks();
  });

  it('shows permission message for non-admins', () => {
    authMocks.session = null;
    render(<FeeSchedulePage />);
    expect(screen.getByText('You do not have permission to access fee schedules.')).toBeInTheDocument();
  });

  it('loads schedules, edits fees, deletes items, and exports', async () => {
    render(<FeeSchedulePage />);

    await screen.findByText('Default Schedule');
    await screen.findByText('99213');

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() =>
      expect(apiMocks.exportFeeSchedule).toHaveBeenCalledWith('tenant-1', 'token-1', 'sched-1'),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Fee schedule exported');

    fireEvent.click(screen.getByRole('button', { name: '+ Add Fee' }));
    await screen.findByTestId('modal-add-fee');

    fireEvent.change(screen.getByPlaceholderText('e.g., 99213'), { target: { value: '99214' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., Office visit, established patient'), {
      target: { value: 'Extended visit' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fee' }));

    await waitFor(() =>
      expect(apiMocks.updateFeeScheduleItem).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'sched-1',
        '99214',
        { feeCents: 15050, cptDescription: 'Extended visit' },
      ),
    );

    const itemRow = screen.getByText('99213').closest('tr');
    expect(itemRow).toBeTruthy();
    fireEvent.click(within(itemRow as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiMocks.deleteFeeScheduleItem).toHaveBeenCalledWith('tenant-1', 'token-1', 'sched-1', '99213'),
    );
  });

  it('creates schedules and imports CSV fees', async () => {
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText(file: Blob) {
        const rawText = (file as { __text?: string }).__text;
        if (typeof rawText === 'string') {
          if (this.onload) this.onload({ target: { result: rawText } });
          return;
        }
        if (typeof (file as Blob & { text?: () => Promise<string> }).text === 'function') {
          (file as Blob & { text: () => Promise<string> }).text().then((text) => {
            if (this.onload) this.onload({ target: { result: text } });
          });
          return;
        }
        if (typeof (file as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
          (file as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer().then((buffer) => {
            const text = new TextDecoder().decode(buffer);
            if (this.onload) this.onload({ target: { result: text } });
          });
        }
      }
    }

    const originalFileReader = globalThis.FileReader;
    globalThis.FileReader = MockFileReader as typeof FileReader;

    try {
      render(<FeeSchedulePage />);
      await screen.findByText('Default Schedule');

      fireEvent.click(screen.getByRole('button', { name: '+ Create Fee Schedule' }));
      await screen.findByTestId('modal-create-fee-schedule');
      fireEvent.change(screen.getByPlaceholderText('e.g., Commercial Insurance, Medicare, Cash Pay'), {
        target: { value: 'Medicare' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }));

      await waitFor(() =>
        expect(apiMocks.createFeeSchedule).toHaveBeenCalledWith('tenant-1', 'token-1', {
          name: 'Medicare',
          isDefault: false,
          description: undefined,
          cloneFromId: undefined,
        }),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
      await screen.findByTestId('modal-import-fees-from-csv');

      const csvText = 'CPT Code,Description,Fee\n99220,Consult,200.00\n';
      const file = { __text: csvText, name: 'fees.csv' } as File;
      const fileInput = screen.getByText('CSV File').parentElement?.querySelector('input[type="file"]');
      if (!fileInput) {
        throw new Error('CSV file input not found');
      }
      fireEvent.change(fileInput, { target: { files: [file] } });

      await screen.findByText('99220');
      fireEvent.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() =>
        expect(apiMocks.importFeeScheduleItems).toHaveBeenCalledWith('tenant-1', 'token-1', 'sched-1', [
          { cptCode: '99220', description: 'Consult', fee: 200 },
        ]),
      );
    } finally {
      globalThis.FileReader = originalFileReader;
    }
  });
});

describe('PriorAuthPage', () => {
  beforeEach(() => {
    authMocks.session = adminSession;
    confirmSpy.mockReturnValue(true);
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    toastMocks.showInfo.mockClear();

    apiMocks.fetchPriorAuths.mockResolvedValue([
      {
        id: 'pa-1',
        auth_number: 'PA-001',
        patient_id: 'patient-1',
        first_name: 'Ana',
        last_name: 'Derm',
        medication_name: 'Dupixent',
        diagnosis_code: 'L20.9',
        insurance_name: 'Aetna',
        status: 'pending',
        urgency: 'urgent',
        created_at: '2024-01-01',
        submitted_at: '2024-01-02',
        approved_at: null,
        denied_at: null,
        insurance_auth_number: null,
        denial_reason: null,
        provider_name: 'Dr Doe',
        notes: null,
        clinical_justification: 'Severe case requiring biologic',
        provider_npi: '1234567890',
      },
      {
        id: 'pa-2',
        auth_number: 'PA-002',
        patient_id: 'patient-2',
        first_name: 'Ben',
        last_name: 'Skin',
        medication_name: 'Humira',
        diagnosis_code: 'L40.0',
        insurance_name: 'Cigna',
        status: 'more_info_needed',
        urgency: 'routine',
        created_at: '2024-01-05',
        submitted_at: null,
        approved_at: null,
        denied_at: null,
        insurance_auth_number: null,
        denial_reason: null,
        provider_name: 'Dr Lee',
        notes: 'Needs photos',
        clinical_justification: 'Psoriasis flare',
        provider_npi: '2223334444',
      },
    ]);

    apiMocks.fetchPatients.mockResolvedValue({
      patients: [
        {
          id: 'patient-1',
          firstName: 'Ana',
          lastName: 'Derm',
          dateOfBirth: '1990-01-01',
          insurance: 'Aetna',
        },
      ],
    });
    apiMocks.submitPriorAuth.mockResolvedValue({ ok: true });
    apiMocks.updatePriorAuth.mockResolvedValue({ ok: true });
    apiMocks.createPriorAuth.mockResolvedValue({ id: 'pa-3' });
  });

  afterEach(() => {
    confirmSpy.mockReset();
    vi.clearAllMocks();
  });

  it('renders attention banner, submits quick actions, and updates detail status', async () => {
    render(
      <MemoryRouter>
        <PriorAuthPage />
      </MemoryRouter>
    );

    await screen.findByText('Electronic Prior Authorization');
    expect(screen.getByText(/need attention/i)).toBeInTheDocument();

    const pendingRow = screen.getByText('PA-001').closest('tr');
    expect(pendingRow).toBeTruthy();
    fireEvent.click(within(pendingRow as HTMLElement).getByTitle('Submit to Payer'));
    await waitFor(() =>
      expect(apiMocks.submitPriorAuth).toHaveBeenCalledWith('tenant-1', 'token-1', 'pa-1'),
    );

    fireEvent.click(screen.getByText('PA-001'));
    const detailHeader = await screen.findByText('PA #PA-001');
    const detailScope = within(detailHeader.closest('.epa-modal') as HTMLElement);
    fireEvent.click(detailScope.getByRole('button', { name: 'History & Actions' }));

    fireEvent.change(detailScope.getByRole('combobox'), { target: { value: 'approved' } });
    fireEvent.change(detailScope.getByPlaceholderText('Enter auth number from insurance'), {
      target: { value: 'AUTH-123' },
    });
    fireEvent.click(detailScope.getByRole('button', { name: 'Update Status' }));

    await waitFor(() =>
      expect(apiMocks.updatePriorAuth).toHaveBeenCalledWith('tenant-1', 'token-1', 'pa-1', {
        status: 'approved',
        insuranceAuthNumber: 'AUTH-123',
        denialReason: '',
        notes: '',
      }),
    );
  });

  it('creates a new prior authorization request', async () => {
    render(
      <MemoryRouter>
        <PriorAuthPage />
      </MemoryRouter>
    );
    await screen.findByText('Electronic Prior Authorization');

    fireEvent.click(screen.getByRole('button', { name: 'New PA Request' }));
    const modalHeader = await screen.findByText('New Prior Authorization Request');
    const modalScope = within(modalHeader.closest('.epa-modal') as HTMLElement);

    fireEvent.change(modalScope.getByRole('combobox'), { target: { value: 'patient-1' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., Dupixent, Humira, Accutane'), {
      target: { value: 'Dupixent' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g., L20.9, L40.0'), { target: { value: 'L20.9' } });
    fireEvent.click(modalScope.getByRole('button', { name: 'Continue' }));

    fireEvent.change(modalScope.getByPlaceholderText('e.g., United Healthcare, Cigna, Aetna'), {
      target: { value: 'Aetna' },
    });
    fireEvent.change(modalScope.getByPlaceholderText('10-digit NPI number'), { target: { value: '1234567890' } });
    fireEvent.click(modalScope.getByRole('button', { name: 'Continue' }));

    fireEvent.change(modalScope.getByPlaceholderText(/Explain medical necessity/i), {
      target: { value: 'Failed topical therapy and severe symptoms.' },
    });
    fireEvent.click(modalScope.getByRole('button', { name: 'Create PA Request' }));

    await waitFor(() =>
      expect(apiMocks.createPriorAuth).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 'patient-1',
        medicationName: 'Dupixent',
        diagnosisCode: 'L20.9',
        insuranceName: 'Aetna',
        providerNpi: '1234567890',
        clinicalJustification: 'Failed topical therapy and severe symptoms.',
        urgency: 'routine',
      }),
    );
  });

  it('handles wrapped prior auth payloads and appealed status safely', async () => {
    apiMocks.fetchPriorAuths.mockResolvedValueOnce({
      data: [
        {
          id: 'pa-appeal-1',
          auth_number: 'PA-APPEAL-1',
          patient_id: 'patient-9',
          first_name: 'Chris',
          last_name: 'Case',
          medication_name: 'Skyrizi',
          diagnosis_code: 'L40.0',
          insurance_name: 'Blue Shield',
          status: 'appealed',
          urgency: 'routine',
          created_at: '2024-01-10',
          submitted_at: null,
          approved_at: null,
          denied_at: null,
          insurance_auth_number: null,
          denial_reason: null,
          provider_name: 'Dr Appeal',
          notes: null,
          clinical_justification: 'Appeal in progress after denial.',
          provider_npi: '1112223334',
        },
      ],
    });

    render(
      <MemoryRouter>
        <PriorAuthPage />
      </MemoryRouter>
    );

    await screen.findByText('Electronic Prior Authorization');
    expect(screen.getByText('PA-APPEAL-1')).toBeInTheDocument();
    expect(screen.getAllByText('Appealed').length).toBeGreaterThan(0);
  });
});

describe('QuotesPage', () => {
  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    apiMocks.fetchPatients.mockResolvedValue({
      patients: [
        { id: '1', firstName: 'Ana', lastName: 'Derm' },
        { id: '2', firstName: 'Ben', lastName: 'Skin' },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates and sends a cosmetic quote', async () => {
    render(<QuotesPage />);
    await screen.findByText('Cosmetic Quotes');

    fireEvent.click(screen.getByRole('button', { name: '+ New Quote' }));
    const modalHeader = await screen.findByText('Create Cosmetic Quote');
    const modalScope = within(modalHeader.closest('[data-testid^="modal-"]') as HTMLElement);

    fireEvent.change(modalScope.getAllByRole('combobox')[0], { target: { value: '1' } });
    fireEvent.change(modalScope.getByDisplayValue('Select procedure...'), { target: { value: 'BOT-001' } });
    fireEvent.change(modalScope.getByDisplayValue('1'), { target: { value: '2' } });
    fireEvent.click(modalScope.getByRole('button', { name: 'Add' }));

    fireEvent.click(modalScope.getByRole('button', { name: 'Create Quote' }));
    await screen.findByText('Q-2025-003');
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Quote created');

    const quoteRow = screen.getByText('Q-2025-003').closest('tr');
    expect(quoteRow).toBeTruthy();
    fireEvent.click(within(quoteRow as HTMLElement).getByRole('button', { name: 'Send' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Quote sent to patient');
  });
});

describe('ClearinghousePage', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalPrint = window.print;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    confirmSpy.mockReturnValue(true);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    window.print = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();

    apiMocks.fetchClaims.mockResolvedValue({
      claims: [
        {
          id: 'claim-1',
          claimNumber: 'CLM-001',
          patientFirstName: 'Ana',
          patientLastName: 'Derm',
          payer: 'Aetna',
          totalCents: 12345,
          status: 'ready',
        },
      ],
    });
    apiMocks.submitClaimToClearinghouse.mockResolvedValue({
      status: 'accepted',
      message: 'Accepted',
      controlNumber: 'CTRL-1',
    });
    apiMocks.fetchClaimStatus.mockResolvedValue({
      status: 'accepted',
      message: 'Accepted',
      controlNumber: 'CTRL-1',
    });
    apiMocks.fetchRemittanceAdvice.mockImplementation((_tenant, _token, filters) => {
      if (filters?.status === 'posted') {
        return Promise.resolve({
          eras: [
            {
              id: 'era-2',
              eraNumber: 'ERA-002',
              payer: 'Aetna',
              paymentAmountCents: 7500,
              claimsPaid: 2,
              status: 'posted',
            },
          ],
        });
      }
      return Promise.resolve({
        eras: [
          {
            id: 'era-1',
            eraNumber: 'ERA-001',
            payer: 'Aetna',
            paymentAmountCents: 5000,
            claimsPaid: 1,
            status: 'pending',
            checkNumber: 'CHK-1',
            checkDate: '2024-01-01',
          },
        ],
      });
    });
    apiMocks.fetchERADetails.mockResolvedValue({
      claims: [
        {
          id: 'claim-1',
          claimNumber: 'CLM-001',
          chargeAmountCents: 10000,
          paidAmountCents: 5000,
          adjustmentAmountCents: 5000,
          status: 'paid',
        },
      ],
    });
    apiMocks.postERA.mockResolvedValue({ claimsPosted: 1 });
    apiMocks.fetchEFTTransactions.mockImplementation((_tenant, _token, filters) => {
      if (filters?.reconciled === false) {
        return Promise.resolve({
          efts: [
            {
              id: 'eft-1',
              eftTraceNumber: 'EFT-001',
              payer: 'Aetna',
              paymentAmountCents: 5000,
              depositDate: '2024-01-05',
              transactionType: 'ACH',
              reconciled: false,
              varianceCents: -200,
            },
          ],
        });
      }
      return Promise.resolve({
        efts: [
          {
            id: 'eft-1',
            eftTraceNumber: 'EFT-001',
            payer: 'Aetna',
            paymentAmountCents: 5000,
            depositDate: '2024-01-05',
            transactionType: 'ACH',
            reconciled: false,
            varianceCents: -200,
          },
        ],
      });
    });
    apiMocks.reconcilePayments.mockResolvedValue({ status: 'balanced', varianceCents: 0 });
    apiMocks.fetchClosingReport.mockResolvedValue({
      reportType: 'daily',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      totalChargesCents: 100000,
      totalPaymentsCents: 80000,
      totalAdjustmentsCents: 5000,
      outstandingBalanceCents: 15000,
      claimsSubmitted: 10,
      claimsPaid: 8,
      claimsDenied: 1,
      erasReceived: 2,
      eftsReceived: 2,
      reconciliationVarianceCents: 0,
    });
  });

  afterEach(() => {
    confirmSpy.mockReset();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.print = originalPrint;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    vi.clearAllMocks();
  });

  it('handles claim submission, ERA review, reconciliation, and reports', async () => {
    render(<ClearinghousePage session={adminSession} />);
    await screen.findByText('Ready to Submit (1)');

    const [headerCheckbox] = screen.getAllByRole('checkbox');
    fireEvent.click(headerCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /Submit \(1\) to Clearinghouse/i }));

    await waitFor(() =>
      expect(apiMocks.submitClaimToClearinghouse).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Check Status' }));
    await waitFor(() =>
      expect(apiMocks.fetchClaimStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'ERA' }));
    await screen.findByText('ERA #');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await screen.findByText('ERA Details');
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() =>
      expect(apiMocks.postERA).toHaveBeenCalledWith('tenant-1', 'token-1', 'era-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reconciliation' }));
    await screen.findByText('Reconcile ERA with EFT');
    fireEvent.change(screen.getByDisplayValue('-- Select ERA --'), { target: { value: 'era-2' } });
    fireEvent.change(screen.getByDisplayValue('-- Select EFT (optional) --'), { target: { value: 'eft-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile Payment' }));
    await waitFor(() =>
      expect(apiMocks.reconcilePayments).toHaveBeenCalledWith('tenant-1', 'token-1', {
        eraId: 'era-2',
        eftId: 'eft-1',
        notes: undefined,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    await screen.findByText('Generate Closing Report');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));
    await waitFor(() =>
      expect(apiMocks.fetchClosingReport).toHaveBeenCalledWith('tenant-1', 'token-1', expect.any(Object)),
    );
    expect(screen.getByText('Daily Closing Report')).toBeInTheDocument();
  });
});
