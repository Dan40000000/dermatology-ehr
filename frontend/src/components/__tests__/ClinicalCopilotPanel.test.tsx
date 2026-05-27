import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-1',
    accessToken: 'token-1',
    user: { id: 'provider-1', role: 'provider', roles: ['provider'] },
  },
}));

const toastMocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  askClinicalCopilot: vi.fn(),
  applyClinicalCopilotResponse: vi.fn(),
  saveClinicalCopilotVisitSummary: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

import { ClinicalCopilotPanel } from '../ClinicalCopilotPanel';

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ClinicalCopilotPanel patientId="patient-1" encounterId="encounter-1" title="Encounter AI Assistant" />
    </MemoryRouter>,
  );

describe('ClinicalCopilotPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('shows a full-screen HIPAA warning when the assistant blocks patient identifiers', async () => {
    const blockedError = Object.assign(
      new Error('Potential protected health information detected in the assistant prompt.'),
      {
        code: 'AI_PHI_BLOCKED',
        blockedTypes: ['known_patient_name'],
      },
    );
    apiMocks.askClinicalCopilot.mockRejectedValueOnce(blockedError);

    renderPanel();

    const prompt = screen.getByPlaceholderText(/ask about visit summary/i);
    fireEvent.change(prompt, { target: { value: 'Dominic Lopez has acne. What code should I use?' } });
    fireEvent.click(screen.getByRole('button', { name: /ask ai assistant/i }));

    const warning = await screen.findByRole('alertdialog', { name: /possible hipaa violation blocked/i });
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent('Your message was not sent to the AI model');
    expect(warning).toHaveTextContent('Detected: known patient name');
    expect(warning).toHaveTextContent('Do not type');
    expect(warning).toHaveTextContent('Use instead');
    expect(toastMocks.showError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /i understand - edit message/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Dominic Lopez has acne. What code should I use?')).toBeInTheDocument();
  });
});
