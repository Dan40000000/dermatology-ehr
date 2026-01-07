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
  fetchClaims: vi.fn(),
  fetchClaimDetail: vi.fn(),
  updateClaimStatus: vi.fn(),
  postClaimPayment: vi.fn(),
  fetchPatients: vi.fn(),
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

const buildFixtures = () => {
  const claims = [
    {
      id: 'claim-1',
      tenantId: 'tenant-1',
      patientId: 'patient-1',
      claimNumber: 'CLM-001',
      totalCents: 20000,
      status: 'submitted',
      payer: 'Aetna',
      providerName: 'Dr Demo',
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
        status: 'submitted',
        changedAt: '2024-03-01T00:00:00Z',
      },
    ],
  };

  return { claims, patients, detail };
};

describe('ClaimsPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    const fixtures = buildFixtures();
    apiMocks.fetchClaims.mockResolvedValue({ claims: fixtures.claims });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchClaimDetail.mockResolvedValue(fixtures.detail);
    apiMocks.updateClaimStatus.mockResolvedValue({ ok: true });
    apiMocks.postClaimPayment.mockResolvedValue({ ok: true });
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders claims, filters, shows detail, and posts payments', async () => {
    render(<ClaimsPage />);

    await screen.findByText('Claims Management');

    expect(apiMocks.fetchClaims).toHaveBeenCalledWith('tenant-1', 'token-1', {});
    expect(screen.getByText('Total Claims')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'submitted' } });
    await waitFor(() =>
      expect(apiMocks.fetchClaims).toHaveBeenCalledWith('tenant-1', 'token-1', { status: 'submitted' }),
    );

    fireEvent.change(screen.getByPlaceholderText('Search by claim #, patient, or provider...'), { target: { value: 'Ana' } });
    expect(screen.getByText('CLM-001')).toBeInTheDocument();
    expect(screen.queryByText('CLM-002')).not.toBeInTheDocument();

    const claimRow = screen.getByText('CLM-001').closest('tr');
    expect(claimRow).toBeTruthy();
    fireEvent.click(within(claimRow as HTMLElement).getByRole('button', { name: 'View' }));
    await waitFor(() => expect(apiMocks.fetchClaimDetail).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1'));
    expect(screen.getByText('Claim Information')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'accepted' }));
    await waitFor(() => expect(apiMocks.updateClaimStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'claim-1', { status: 'accepted', notes: undefined }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Claim status updated to accepted');

    fireEvent.click(within(claimRow as HTMLElement).getByRole('button', { name: 'Post Payment' }));

    const paymentModal = await screen.findByTestId('modal-post-payment');
    const modalScope = within(paymentModal);
    const amountInput = modalScope.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '100.50' } });

    fireEvent.click(modalScope.getByRole('button', { name: 'Post Payment' }));

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
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Payment posted successfully');
  });

  it('validates payment amounts', async () => {
    render(<ClaimsPage />);

    await screen.findByText('Claims Management');

    const claimRow = screen.getByText('CLM-001').closest('tr');
    expect(claimRow).toBeTruthy();
    fireEvent.click(within(claimRow as HTMLElement).getByRole('button', { name: 'View' }));
    await screen.findByText('Claim Information');

    fireEvent.click(within(claimRow as HTMLElement).getByRole('button', { name: 'Post Payment' }));
    const paymentModal = await screen.findByTestId('modal-post-payment');
    const modalScope = within(paymentModal);
    const amountInput = modalScope.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '0' } });
    fireEvent.click(modalScope.getByRole('button', { name: 'Post Payment' }));

    expect(toastMocks.showError).toHaveBeenCalledWith('Invalid payment amount');
    expect(apiMocks.postClaimPayment).not.toHaveBeenCalled();
  });
});
