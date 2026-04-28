import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ECheckInPage from '../Portal/ECheckInPage';

const apiMocks = vi.hoisted(() => ({
  startPortalCheckin: vi.fn(),
  fetchPortalCheckinSession: vi.fn(),
  updatePortalCheckinSession: vi.fn(),
  uploadPortalInsuranceCard: vi.fn(),
  fetchPortalRequiredConsents: vi.fn(),
  signPortalConsent: vi.fn(),
  fetchPortalProfile: vi.fn(),
  updatePortalProfile: vi.fn(),
}));

vi.mock('../../portalApi', () => apiMocks);

describe('ECheckInPage', () => {
  beforeEach(() => {
    apiMocks.startPortalCheckin.mockResolvedValue({ sessionId: 'session-1', status: 'active' });
    apiMocks.fetchPortalCheckinSession.mockResolvedValue({
      id: 'session-1',
      appointmentId: 'apt-1',
      status: 'in_progress',
      demographicsConfirmed: false,
      insuranceVerified: false,
      formsCompleted: false,
      copayCollected: false,
      copayAmount: 25,
      staffNotified: false,
      startedAt: '2024-03-01T12:00:00',
    });
    apiMocks.fetchPortalProfile.mockResolvedValue({
      patient: {
        id: 'patient-1',
        firstName: 'Test',
        lastName: 'Patient',
        address: '123 Main St',
        phone: '(555) 123-4567',
        emergencyContactName: 'Sam Contact',
        emergencyContactPhone: '(555) 987-6543',
      },
    });
    apiMocks.fetchPortalRequiredConsents.mockResolvedValue({ requiredConsents: [] });
    apiMocks.updatePortalCheckinSession.mockResolvedValue({ id: 'session-1', status: 'updated' });
    apiMocks.updatePortalProfile.mockResolvedValue({ id: 'patient-1' });
    apiMocks.signPortalConsent.mockResolvedValue({ id: 'sig-1', signedAt: '2024-03-01T12:00:00' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the full new-patient paperwork flow for first visits', async () => {
    render(
      <ECheckInPage
        tenantId="tenant-1"
        portalToken="token-1"
        appointmentId="apt-1"
        appointmentType="New Patient Dermatology"
      />
    );

    expect(await screen.findByText('New Patient Check-In')).toBeInTheDocument();
    expect(screen.getByText('Verify Your Information')).toBeInTheDocument();
    expect(apiMocks.fetchPortalProfile).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPortalRequiredConsents).toHaveBeenCalledWith('tenant-1', 'token-1');
  });

  it('renders an expanded dermatology follow-up questionnaire and persists visit details', async () => {
    render(
      <ECheckInPage
        tenantId="tenant-1"
        portalToken="token-1"
        appointmentId="apt-1"
        appointmentType="Follow Up"
      />
    );

    expect(await screen.findByText('Follow-Up Check-In')).toBeInTheDocument();
    expect(screen.getByText('Confirm Your Information')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'No, everything is the same' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm my information is up to date/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        'token-1',
        'session-1',
        { demographicsConfirmed: true }
      )
    );

    expect(await screen.findAllByText("Today's Visit")).toHaveLength(2);
    expect(screen.getByText('Type of concern')).toBeInTheDocument();
    expect(screen.getByText('Affected area(s)')).toBeInTheDocument();
    expect(screen.getByText("Skin symptoms you're noticing")).toBeInTheDocument();
    expect(screen.getByText('Mole / spot warning signs')).toBeInTheDocument();
    expect(screen.getByText('Possible triggers or exposures')).toBeInTheDocument();
    expect(screen.getByText('Treatments tried since last visit')).toBeInTheDocument();
    expect(screen.getByText('Review of systems')).toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Rash / eczema flare' }));
    fireEvent.change(screen.getByPlaceholderText(/Rash on left forearm/i), {
      target: { value: 'Worsening itchy rash on left forearm' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Arms / hands' }));
    fireEvent.click(screen.getByRole('button', { name: 'Itching' }));
    fireEvent.click(screen.getByRole('button', { name: '1–4 weeks' }));
    fireEvent.click(screen.getByRole('button', { name: '4–6 Moderate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Worse' }));
    fireEvent.click(screen.getByRole('button', { name: 'New soap / detergent' }));
    fireEvent.click(screen.getByRole('button', { name: 'OTC hydrocortisone' }));
    fireEvent.click(screen.getByRole('button', { name: 'No change' }));

    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'token-1',
        'session-1',
        {
          visitDetails: expect.objectContaining({
            intakeKind: 'follow_up',
            visitConcernType: 'Rash / eczema flare',
            chiefComplaint: 'Worsening itchy rash on left forearm',
            affectedAreas: ['Arms / hands'],
            skinSymptoms: ['Itching'],
            duration: '1–4 weeks',
            severity: '4–6 Moderate',
            trendSinceLastVisit: 'Worse',
            possibleExposures: ['New soap / detergent'],
            treatmentUse: ['OTC hydrocortisone'],
            treatmentResponse: ['No change'],
          }),
        }
      )
    );

    expect(await screen.findByText('Medications Review')).toBeInTheDocument();
  });
});
