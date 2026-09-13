import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreVisitBriefPanel } from '../PreVisitBriefPanel';
import type { Order } from '../../types';

const baseOrder: Order = {
  id: 'order-1',
  tenantId: 'tenant-1',
  patientId: 'patient-1',
  providerId: 'provider-1',
  type: 'pathology',
  status: 'received',
  priority: 'urgent',
  details: 'Biopsy pathology',
  resultFlag: 'abnormal',
  createdAt: '2026-08-30T12:00:00.000Z',
};

describe('PreVisitBriefPanel', () => {
  it('surfaces chart context, safety data, open loops, and chart-derived questions', () => {
    render(
      <PreVisitBriefPanel
        patient={{ allergies: ['Latex'], medications: 'Doxycycline 100 mg' }}
        encounter={{ chiefComplaint: 'Changing lesion' }}
        diagnosisHistory={[{
          id: 'dx-1',
          encounterId: 'enc-old',
          icd10Code: 'L40.0',
          description: 'Plaque psoriasis',
          encounterDate: '2026-08-01T12:00:00.000Z',
        }]}
        orders={[baseOrder]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Pre-visit brief' })).toBeInTheDocument();
    expect(screen.getByText('Changing lesion')).toBeInTheDocument();
    expect(screen.getByText('Plaque psoriasis')).toBeInTheDocument();
    expect(screen.getByText('Latex')).toBeInTheDocument();
    expect(screen.getByText('Doxycycline 100 mg')).toBeInTheDocument();
    expect(screen.getByText('Biopsy pathology')).toBeInTheDocument();

    const confirm = screen.getByRole('heading', { name: 'Confirm before the visit' }).closest('section');
    expect(confirm).not.toBeNull();
    expect(within(confirm!).getByText(/abnormal result flag/i)).toBeInTheDocument();
    expect(within(confirm!).getByText(/urgent priority/i)).toBeInTheDocument();
    expect(screen.getByText(/what has changed about changing lesion/i)).toBeInTheDocument();
  });

  it('makes missing chart data explicit instead of guessing', () => {
    render(
      <PreVisitBriefPanel
        patient={{}}
        encounter={{}}
        diagnosisHistory={[]}
        orders={[]}
      />,
    );

    expect(screen.getByText('Reason for visit not recorded')).toBeInTheDocument();
    expect(screen.getAllByText('Not documented')).toHaveLength(2);
    expect(screen.getByText(/allergies are not documented/i)).toBeInTheDocument();
    expect(screen.getByText(/complete medication reconciliation/i)).toBeInTheDocument();
    expect(screen.getByText('No open orders for this encounter.')).toBeInTheDocument();
  });
});
