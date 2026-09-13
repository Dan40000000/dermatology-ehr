import { render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScribePanel } from '../ScribePanel';

const apiMocks = vi.hoisted(() => ({
  startAmbientRecording: vi.fn(),
  stopAmbientRecording: vi.fn(),
  uploadAmbientRecording: vi.fn(),
  fetchProviders: vi.fn(),
}));

const recordingMocks = vi.hoisted(() => ({
  isRecording: false,
  recordingId: null,
  duration: 0,
  setIsRecording: vi.fn(),
  setRecordingId: vi.fn(),
  setDuration: vi.fn(),
  setPatientId: vi.fn(),
  setPatientName: vi.fn(),
  resetRecording: vi.fn(),
}));

vi.mock('../../api', () => apiMocks);
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { tenantId: 'tenant-1', accessToken: 'token-1', user: { id: 'user-1' } } }),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));
vi.mock('../../contexts/RecordingContext', () => ({
  useRecording: () => recordingMocks,
}));
vi.mock('../../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), isConnected: false }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../utils/featureFlags', () => ({ ENABLE_LIVE_DRAFT: false }));
vi.mock('../LiveScribeInsightsPanel', () => ({ LiveScribeInsightsPanel: () => null }));

describe('ScribePanel consent dialog', () => {
  it('traps focus, closes with Escape, and restores focus to the recording control', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ScribePanel
          patientId="patient-1"
          patientName="Taylor Patient"
          encounterId="encounter-1"
          providerId="provider-1"
        />
      </StrictMode>,
    );

    const launchButton = screen.getByRole('button', { name: 'Start Recording' });
    await user.click(launchButton);

    const dialog = screen.getByRole('dialog', { name: 'Confirm patient consent' });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirmButton = within(dialog).getByRole('button', { name: 'Start Recording' });
    const consentSelect = within(dialog).getByRole('combobox', { name: 'Consent method' });

    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(consentSelect).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Confirm patient consent' })).not.toBeInTheDocument();
    await waitFor(() => expect(launchButton).toHaveFocus());
    expect(apiMocks.startAmbientRecording).not.toHaveBeenCalled();
  });
});
