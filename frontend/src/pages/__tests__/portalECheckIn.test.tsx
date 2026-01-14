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
      staffNotified: false,
      startedAt: '2024-03-01T12:00:00',
    });
    apiMocks.fetchPortalRequiredConsents.mockResolvedValue({
      requiredConsents: [
        {
          id: 'consent-1',
          title: 'HIPAA Notice',
          consentType: 'privacy',
          content: '',
          version: 'v1',
          requiresSignature: true,
          requiresWitness: false,
          isRequired: true,
        },
        {
          id: 'consent-2',
          title: 'Financial Policy',
          consentType: 'billing',
          content: '',
          version: 'v1',
          requiresSignature: true,
          requiresWitness: false,
          isRequired: true,
        },
      ],
    });
    apiMocks.updatePortalCheckinSession.mockResolvedValue({ id: 'session-1', status: 'updated' });
    apiMocks.signPortalConsent.mockResolvedValue({ id: 'sig-1', signedAt: '2024-03-01T12:00:00' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('walks through the check-in flow and completes', async () => {
    render(
      <ECheckInPage tenantId="tenant-1" portalToken="token-1" appointmentId="apt-1" />
    );

    expect(await screen.findByText('Verify Your Information')).toBeInTheDocument();
    expect(apiMocks.startPortalCheckin).toHaveBeenCalledWith('tenant-1', 'token-1', {
      appointmentId: 'apt-1',
      sessionType: 'mobile',
    });
    expect(apiMocks.fetchPortalCheckinSession).toHaveBeenCalledWith('tenant-1', 'token-1', 'session-1');
    expect(apiMocks.fetchPortalRequiredConsents).toHaveBeenCalledWith('tenant-1', 'token-1');

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);
    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        'token-1',
        'session-1',
        { demographicsConfirmed: true }
      )
    );

    expect(await screen.findByText('Insurance Card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        2,
        'tenant-1',
        'token-1',
        'session-1',
        { insuranceVerified: true }
      )
    );

    expect(await screen.findByText('Required Consents')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const signButtons = screen.getAllByRole('button', { name: 'Sign' });
    fireEvent.click(signButtons[0]);
    await waitFor(() => expect(apiMocks.signPortalConsent).toHaveBeenCalledTimes(1), { timeout: 3000 });

    const remainingSignButtons = screen.getAllByRole('button', { name: 'Sign' });
    fireEvent.click(remainingSignButtons[0]);
    await waitFor(() => expect(apiMocks.signPortalConsent).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 3000 });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        3,
        'tenant-1',
        'token-1',
        'session-1',
        { formsCompleted: true }
      )
    );

    expect(await screen.findByText('Copay')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        4,
        'tenant-1',
        'token-1',
        'session-1',
        { copayCollected: true }
      )
    );

    expect(await screen.findByText('Review Your Check-In')).toBeInTheDocument();
    expect(screen.getByText('Copay paid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Check-In' }));
    await waitFor(() =>
      expect(apiMocks.updatePortalCheckinSession).toHaveBeenNthCalledWith(
        5,
        'tenant-1',
        'token-1',
        'session-1',
        { complete: true }
      )
    );

    expect(await screen.findByText('Check-In Complete!')).toBeInTheDocument();
  });

  it('shows an error when initialization fails', async () => {
    apiMocks.startPortalCheckin.mockRejectedValueOnce(new Error('boom'));

    render(<ECheckInPage tenantId="tenant-1" portalToken="token-1" appointmentId="apt-1" />);

    expect(await screen.findByText('Failed to initialize check-in')).toBeInTheDocument();
  });
});
