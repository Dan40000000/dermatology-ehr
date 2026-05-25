import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'provider-1', role: 'provider' },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchPostVisitCodingReview: vi.fn(),
  fetchProviders: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { PostVisitCodingReviewPage } from '../PostVisitCodingReviewPage';

const renderPage = (initialEntry = '/coding-review') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PostVisitCodingReviewPage />
    </MemoryRouter>,
  );

describe('PostVisitCodingReviewPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    apiMocks.fetchProviders.mockResolvedValue({
      providers: [{ id: 'provider-1', fullName: 'Dr Demo', name: 'Dr Demo', tenantId: 'tenant-1', createdAt: '2026-05-24' }],
    });
    apiMocks.fetchPostVisitCodingReview.mockResolvedValue({
      startDate: '2026-05-24',
      endDate: '2026-05-24',
      includeCleared: false,
      summary: {
        total: 2,
        cleared: 0,
        issueCounts: {
          missing_diagnosis: 1,
          missing_charge: 1,
          diagnosis_link_needed: 1,
          note_unsigned: 2,
        },
      },
      items: [
        {
          encounterId: 'enc-1',
          appointmentId: 'appt-1',
          patientId: 'patient-1',
          patientName: 'Ava Jones',
          providerId: 'provider-1',
          providerName: 'Dr Demo',
          serviceAt: '2026-05-24T15:00:00.000Z',
          appointmentStatus: 'completed',
          encounterStatus: 'draft',
          chiefComplaint: 'Rash',
          diagnosisCount: 0,
          primaryDiagnosisCount: 0,
          diagnosisCodes: [],
          chargeCount: 1,
          missingCptCount: 0,
          unlinkedChargeCount: 1,
          totalChargeCents: 17500,
          cptCodes: ['99213'],
          superbillId: 'sb-1',
          superbillStatus: 'draft',
          claimId: 'claim-1',
          claimStatus: 'coding_review',
          issues: ['missing_diagnosis', 'diagnosis_link_needed', 'note_unsigned'],
          recommendedOwner: 'provider',
          severity: 'high',
          reviewRoute: '/patients/patient-1/encounter/enc-1',
          claimRoute: '/claims/claim-1',
        },
        {
          encounterId: 'enc-2',
          appointmentId: 'appt-2',
          patientId: 'patient-2',
          patientName: 'Ben Skin',
          providerId: 'provider-1',
          providerName: 'Dr Demo',
          serviceAt: '2026-05-24T16:00:00.000Z',
          appointmentStatus: 'completed',
          encounterStatus: 'draft',
          chiefComplaint: 'Acne',
          diagnosisCount: 1,
          primaryDiagnosisCount: 1,
          diagnosisCodes: ['L70.0'],
          chargeCount: 0,
          missingCptCount: 0,
          unlinkedChargeCount: 0,
          totalChargeCents: 0,
          cptCodes: [],
          superbillId: null,
          superbillStatus: null,
          claimId: null,
          claimStatus: null,
          issues: ['missing_charge', 'note_unsigned'],
          recommendedOwner: 'clinical_coding',
          severity: 'high',
          reviewRoute: '/patients/patient-2/encounter/enc-2',
          claimRoute: null,
        },
      ],
    });
  });

  afterEach(() => cleanup());

  it('loads the post-visit coding queue and defaults to today', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /post-visit coding review/i })).toBeInTheDocument();
    expect(apiMocks.fetchPostVisitCodingReview).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        limit: 300,
      }),
    );
    expect(screen.getByText('Ava Jones')).toBeInTheDocument();
    expect(screen.getByText('Ben Skin')).toBeInTheDocument();
    expect(screen.getAllByText('$175')).toHaveLength(2);
  });

  it('filters by issue buttons and opens encounter and claim routes', async () => {
    renderPage('/coding-review?issue=missing_charge');

    expect(await screen.findByText('Ben Skin')).toBeInTheDocument();
    expect(screen.queryByText('Ava Jones')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open visits/i }));
    expect(await screen.findByText('Ava Jones')).toBeInTheDocument();

    const avaRow = screen.getByText('Ava Jones').closest('tr');
    expect(avaRow).toBeTruthy();
    fireEvent.click(within(avaRow as HTMLTableRowElement).getByRole('button', { name: /open visit/i }));
    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/enc-1');
    fireEvent.click(within(avaRow as HTMLTableRowElement).getByRole('button', { name: /^claim$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/claims/claim-1');
  });

  it('reloads when filters change', async () => {
    renderPage();
    await screen.findByText('Ava Jones');

    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'provider-1' } });

    await waitFor(() => {
      expect(apiMocks.fetchPostVisitCodingReview).toHaveBeenLastCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({ providerId: 'provider-1' }),
      );
    });
  });
});
