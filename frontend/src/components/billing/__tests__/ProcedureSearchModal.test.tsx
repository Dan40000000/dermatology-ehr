import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchDefaultFeeSchedule: vi.fn(),
  fetchSelfPayProcedureCatalog: vi.fn(),
  fetchCosmeticProcedureCatalog: vi.fn(),
  fetchFeeForCPT: vi.fn(),
  fetchProceduresForDiagnosis: vi.fn(),
  fetchSuggestedProcedures: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../../api', () => apiMocks);

vi.mock('../../ui', () => ({
  Modal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: ReactNode;
  }) => (isOpen ? <div data-testid="procedure-search-modal">{children}</div> : null),
}));

import { ProcedureSearchModal } from '../ProcedureSearchModal';

describe('ProcedureSearchModal', () => {
  beforeEach(() => {
    toastMocks.showError.mockReset();
    apiMocks.fetchFeeForCPT.mockReset();
    apiMocks.fetchProceduresForDiagnosis.mockReset();
    apiMocks.fetchSuggestedProcedures.mockReset();
    apiMocks.fetchDefaultFeeSchedule.mockResolvedValue({
      id: 'schedule-standard',
      items: [
        {
          id: 'medical-1',
          feeScheduleId: 'schedule-standard',
          cptCode: '11102',
          cptDescription: 'Tangential biopsy of skin',
          category: 'Biopsies',
          feeCents: 9500,
        },
      ],
    });
    apiMocks.fetchSelfPayProcedureCatalog.mockResolvedValue([]);
    apiMocks.fetchCosmeticProcedureCatalog.mockResolvedValue([
      {
        id: 'cosmetic-1',
        feeScheduleId: 'schedule-cosmetic',
        cptCode: 'BOTOX-20',
        cptDescription: 'Botox Forehead Lines',
        category: 'Aesthetic Injections',
        subcategory: 'Forehead',
        feeCents: 12000,
        isCosmetic: true,
      },
      {
        id: 'cosmetic-2',
        feeScheduleId: 'schedule-cosmetic',
        cptCode: 'LASER-UL',
        cptDescription: 'Laser Hair Removal Upper Lip',
        category: 'Laser Hair Removal',
        subcategory: 'Upper Lip',
        feeCents: 15000,
        isCosmetic: true,
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses fee schedule categories as collapsed section headers by default', async () => {
    render(
      <ProcedureSearchModal
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
        diagnoses={[{ id: 'dx-1', icd10Code: 'L70.0', description: 'Acne vulgaris', isPrimary: true }]}
      />
    );

    const aestheticSection = await screen.findByText('Aesthetic Injections');
    await screen.findByText('Laser Hair Removal');
    await screen.findByText('Biopsies');

    expect(screen.queryByText('Botox Forehead Lines')).not.toBeInTheDocument();
    expect(screen.queryByText('Tangential biopsy of skin')).not.toBeInTheDocument();

    fireEvent.click(aestheticSection.closest('button') as HTMLButtonElement);

    expect(await screen.findByText('Botox Forehead Lines')).toBeInTheDocument();
    expect(screen.queryByText('Tangential biopsy of skin')).not.toBeInTheDocument();
  });

  it('keeps the fee from the selected fee schedule item for catalog procedures', async () => {
    const onSelect = vi.fn();

    render(
      <ProcedureSearchModal
        isOpen
        onClose={() => {}}
        onSelect={onSelect}
        diagnoses={[]}
      />
    );

    const aestheticSection = await screen.findByText('Aesthetic Injections');
    fireEvent.click(aestheticSection.closest('button') as HTMLButtonElement);
    fireEvent.click((await screen.findByText('Botox Forehead Lines')).closest('button') as HTMLButtonElement);

    expect(apiMocks.fetchFeeForCPT).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Procedure' }));

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({
        code: 'BOTOX-20',
        codeType: 'INTERNAL',
        billingRoute: 'self_pay',
        description: 'Botox Forehead Lines',
        quantity: 1,
        feeCents: 12000,
        linkedDiagnosisIds: [],
      }),
    );
  });
});
