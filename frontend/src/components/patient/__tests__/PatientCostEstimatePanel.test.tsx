import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-demo',
    accessToken: 'token',
    user: { role: 'admin' },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  checkFormulary: vi.fn(),
  createPatientProcedureCostEstimate: vi.fn(),
  fetchDefaultFeeSchedule: vi.fn(),
  fetchExternalIntegrationStatus: vi.fn(),
  getPatientBenefits: vi.fn(),
  sharePatientProcedureCostEstimate: vi.fn(),
  savePatientPrescriptionCostEstimate: vi.fn(),
  sharePatientPrescriptionCostEstimate: vi.fn(),
  revokePatientProcedureCostEstimate: vi.fn(),
  revisePatientProcedureCostEstimate: vi.fn(),
  reconcilePatientProcedureCostEstimate: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../../api', () => apiMocks);

import { PatientCostEstimatePanel } from '../PatientCostEstimatePanel';

const estimate = {
  id: 'estimate-1',
  patientId: 'patient-1',
  serviceType: 'medical',
  totalCharges: 315,
  insuranceAllowedAmount: 252,
  insurancePays: 189.6,
  patientResponsibility: 62.4,
  breakdown: {
    copay: 15,
    deductible: 0,
    coinsurance: 47.4,
    notCovered: 0,
    contractualAdjustment: 63,
  },
  isCosmetic: false,
  insuranceVerified: true,
  validUntil: '2026-09-20',
  status: 'draft',
  version: 1,
  confidenceLevel: 'planning' as const,
  confidenceScore: 40,
  confidenceFactors: ['Planning fallback'],
  pricingBasis: 'percentage_fallback' as const,
  pricingDetails: [
    {
      code: '99203',
      description: 'New patient office visit - Level 3 (30 min)',
      charge: 165,
      allowedAmount: 132,
      insurancePays: 99.32,
      patientResponsibility: 32.68,
      basis: 'percentage_fallback' as const,
    },
    {
      code: '11102',
      description: 'Tangential biopsy - single lesion',
      charge: 150,
      allowedAmount: 120,
      insurancePays: 90.28,
      patientResponsibility: 29.72,
      basis: 'percentage_fallback' as const,
    },
  ],
};

describe('PatientCostEstimatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchExternalIntegrationStatus.mockResolvedValue({
      integration: {
        isConfigured: true,
        isActive: true,
        connectionStatus: 'connected',
        provider: 'stedi',
      },
    });
    apiMocks.fetchDefaultFeeSchedule.mockResolvedValue({
      items: [
        { cptCode: '99203', cptDescription: 'New visit', feeCents: 16500 },
        { cptCode: '99213', cptDescription: 'Follow-up', feeCents: 11000 },
        { cptCode: '11102', cptDescription: 'Tangential biopsy', feeCents: 15000 },
        { cptCode: '17000', cptDescription: 'AK destruction', feeCents: 12500 },
        { cptCode: '17110', cptDescription: 'Benign lesion destruction', feeCents: 17500 },
        { cptCode: '11400', cptDescription: 'Benign excision', feeCents: 20000 },
      ],
    });
    apiMocks.createPatientProcedureCostEstimate.mockResolvedValue({ estimate });
  });

  it('labels the five buttons as examples sourced from the fee schedule', async () => {
    render(<PatientCostEstimatePanel patientId="patient-1" />);

    expect(await screen.findByText(/Common examples — quick-fill shortcuts only/)).toBeInTheDocument();
    expect(await screen.findByText(/6 available/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /17110\s*Benign lesion destruction/ })).toBeInTheDocument();
    expect(screen.queryByText('11311')).not.toBeInTheDocument();
  });

  it('shows charge, allowed, insurance, and patient estimates for every CPT line with matching totals', async () => {
    render(<PatientCostEstimatePanel patientId="patient-1" />);

    fireEvent.change(screen.getByLabelText('CPT codes'), { target: { value: '99203, 11102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate Procedure Cost' }));

    await waitFor(() => expect(apiMocks.createPatientProcedureCostEstimate).toHaveBeenCalledWith(
      'tenant-demo',
      'token',
      expect.objectContaining({ cptCodes: ['99203', '11102'] })
    ));

    const table = await screen.findByRole('table', { name: 'Estimate by CPT code' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('99203')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('$165.00')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('$132.00')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('$99.32')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('$32.68')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('11102')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Total')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('$315.00')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('$252.00')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('$189.60')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('$62.40')).toBeInTheDocument();
  });
});
