import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchClaims: vi.fn(),
  fetchClaimDetail: vi.fn(),
  updateClaimStatus: vi.fn(),
  postClaimPayment: vi.fn(),
  fetchPatients: vi.fn(),
  fetchClaimMetrics: vi.fn(),
  fetchExternalIntegrationStatus: vi.fn(),
  releaseClaimFromCodingReview: vi.fn(),
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
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) => {
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

import { ClaimsPage } from '../ClaimsPage';

const originalTz = process.env.TZ;

function renderClaimsPage(initialEntry = '/claims') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ClaimsPage />
    </MemoryRouter>,
  );
}

function getClaimsTableRow(claimNumber: string): HTMLElement {
  const row = screen
    .getAllByText(claimNumber)
    .map((element) => element.closest('tr'))
    .find((rowElement): rowElement is HTMLElement => Boolean(rowElement?.querySelector('.action-buttons')));

  if (!row) {
    throw new Error(`Could not find claims table row for ${claimNumber}`);
  }

  return row;
}

const buildFixtures = () => {
  const claims = [
    {
      id: 'claim-1',
      tenantId: 'tenant-1',
      patientId: 'patient-1',
      claimNumber: 'CLM-001',
      totalCents: 20000,
      status: 'accepted',
      payer: 'Aetna',
      providerName: 'Dr Demo',
      serviceDate: '2026-05-28T00:00:00.000Z',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    },
    {
      id: 'claim-2',
      tenantId: 'tenant-1',
      patientId: 'patient-2',
      claimNumber: 'CLM-002',
      totalCents: 15000,
      status: 'paid',
      payer: 'BCBS',
      providerName: 'Dr Demo',
      createdAt: '2024-02-01',
      updatedAt: '2024-02-02',
    },
  ];

  const patients = [
    { id: 'patient-1', tenantId: 'tenant-1', firstName: 'Ana', lastName: 'Derm', createdAt: '2024-01-01' },
    { id: 'patient-2', tenantId: 'tenant-1', firstName: 'Ben', lastName: 'Skin', createdAt: '2024-02-01' },
  ];

  const detail = {
    claim: {
      ...claims[0],
      dob: '1980-01-01',
      insurancePlanName: 'Aetna Gold',
    },
    diagnoses: [
      { id: 'dx-1', icd10Code: 'L30.9', description: 'Dermatitis', isPrimary: true },
    ],
    charges: [
      { id: 'chg-1', cptCode: '99213', description: 'Office visit', quantity: 1, feeCents: 20000 },
    ],
    payments: [
      {
        id: 'pay-1',
        tenantId: 'tenant-1',
        claimId: 'claim-1',
        amountCents: 5000,
        paymentDate: '2024-03-01',
        createdAt: '2024-03-01',
      },
    ],
    statusHistory: [
      {
        id: 'hist-1',
        tenantId: 'tenant-1',
        claimId: 'claim-1',
        status: 'accepted',
        changedAt: '2024-03-01T00:00:00Z',
      },
    ],
  };

  return { claims, patients, detail };
};

describe('ClaimsPage', () => {
  beforeEach(() => {
    process.env.TZ = 'America/Denver';
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    const fixtures = buildFixtures();
    apiMocks.fetchClaims.mockResolvedValue({ claims: fixtures.claims });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchClaimDetail.mockResolvedValue(fixtures.detail);
    apiMocks.updateClaimStatus.mockResolvedValue({ ok: true });
    apiMocks.postClaimPayment.mockResolvedValue({ ok: true });
    apiMocks.fetchClaimMetrics.mockResolvedValue({ metrics: {} });
    apiMocks.fetchExternalIntegrationStatus.mockResolvedValue({
      integration: {
        type: 'eligibility',
        provider: 'stedi',
        connectionStatus: 'connected',
        isActive: true,
      },
    });
    apiMocks.releaseClaimFromCodingReview.mockResolvedValue({ claim: fixtures.claims[0] });
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
  });

  afterEach(() => {
    process.env.TZ = originalTz;
    vi.clearAllMocks();
  });

  it('renders claim service dates as calendar dates without UTC timezone shift', async () => {
    renderClaimsPage();

    await screen.findByText('Claims Management');

    const claimRow = getClaimsTableRow('CLM-001');
    expect(within(claimRow).getByText('5/28/2026')).toBeInTheDocument();
  });

  it('renders claims, filters, shows detail, and posts payments', async () => {
    renderClaimsPage();

    await screen.findByText('Claims Management');

    expect(apiMocks.fetchClaims).toHaveBeenCalledWith('tenant-1', 'token-1', {});
    expect(screen.getByText('Total Claims')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'accepted' } });
    await waitFor(() =>
      expect(apiMocks.fetchClaims).toHaveBeenCalledWith('tenant-1', 'token-1', { status: 'accepted' }),
    );

    fireEvent.change(screen.getByPlaceholderText('Search by claim #, patient, or provider...'), { target: { value: 'Ana' } });
    expect(screen.getAllByText('CLM-001').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('CLM-002')).toHaveLength(0);

    const claimRow = getClaimsTableRow('CLM-001');
    fireEvent.click(within(claimRow).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(apiMocks.fetchClaimDetail).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1'));
    expect(screen.getByText('Claim Information')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Rejected' }));
    await waitFor(() => expect(apiMocks.updateClaimStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1', { status: 'rejected', notes: undefined }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Claim marked rejected');

    fireEvent.click(within(claimRow).getByRole('button', { name: 'Post Payer Payment' }));

    const paymentModal = await screen.findByTestId('modal-post-payer-payment');
    const modalScope = within(paymentModal);
    const amountInput = modalScope.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '100.50' } });

    fireEvent.click(modalScope.getByRole('button', { name: 'Post Payer Payment' }));

    const today = new Date().toISOString().split('T')[0];
    await waitFor(() =>
      expect(apiMocks.postClaimPayment).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1', {
        amountCents: 10050,
        paymentDate: today,
        paymentMethod: undefined,
        payer: undefined,
        checkNumber: undefined,
        notes: undefined,
      }),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Payer payment posted successfully');
  });

  it('validates payment amounts', async () => {
    renderClaimsPage();

    await screen.findByText('Claims Management');

    const claimRow = getClaimsTableRow('CLM-001');
    fireEvent.click(within(claimRow).getByRole('button', { name: 'View' }));
    await screen.findByText('Claim Information');

    fireEvent.click(within(claimRow).getByRole('button', { name: 'Post Payer Payment' }));
    const paymentModal = await screen.findByTestId('modal-post-payer-payment');
    const modalScope = within(paymentModal);
    const amountInput = modalScope.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '0' } });
    fireEvent.click(modalScope.getByRole('button', { name: 'Post Payer Payment' }));

    expect(toastMocks.showError).toHaveBeenCalledWith('Invalid payment amount');
    expect(apiMocks.postClaimPayment).not.toHaveBeenCalled();
  });

  it('does not offer payer payment posting before payer acceptance', async () => {
    const fixtures = buildFixtures();
    const submittedClaims = fixtures.claims.map((claim) =>
      claim.id === 'claim-1' ? { ...claim, status: 'submitted' } : claim,
    );
    apiMocks.fetchClaims.mockResolvedValueOnce({ claims: submittedClaims });
    apiMocks.fetchClaimDetail.mockResolvedValueOnce({
      ...fixtures.detail,
      claim: { ...fixtures.detail.claim, status: 'submitted' },
    });

    renderClaimsPage();

    await screen.findByText('Claims Management');

    const claimRow = getClaimsTableRow('CLM-001');
    expect(within(claimRow).queryByRole('button', { name: 'Post Payer Payment' })).not.toBeInTheDocument();

    fireEvent.click(within(claimRow).getByRole('button', { name: 'View' }));
    await screen.findByText('Claim Information');

    expect(screen.queryByRole('button', { name: 'Post Payer Payment' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submitted' })).toBeDisabled();
  });

  it('closes claim detail deep links without reopening the modal', async () => {
    renderClaimsPage('/claims?claimId=claim-1');

    await screen.findByText('Claim Information');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByText('Claim Information')).not.toBeInTheDocument());
  });

  it('opens the exceptions queue without forcing a same-day denied-only fetch', async () => {
    const fixtures = buildFixtures();
    apiMocks.fetchClaims.mockResolvedValueOnce({
      claims: [
        ...fixtures.claims,
        {
          id: 'claim-3',
          tenantId: 'tenant-1',
          patientId: 'patient-3',
          claimNumber: 'CLM-003',
          totalCents: 32000,
          status: 'rejected',
          payer: 'Cigna',
          providerName: 'Dr Demo',
          createdAt: '2024-03-01',
          updatedAt: '2024-03-02',
          scrubStatus: 'failed',
        },
      ],
    });

    renderClaimsPage('/claims?queue=exceptions');

    await screen.findByText('Claims Management');

    expect(apiMocks.fetchClaims).toHaveBeenCalledWith('tenant-1', 'token-1', {});
    expect(await screen.findByText('Exceptions Drilldown')).toBeInTheDocument();
    expect(screen.getAllByText('CLM-003').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('CLM-001')).toHaveLength(0);
  });
});
