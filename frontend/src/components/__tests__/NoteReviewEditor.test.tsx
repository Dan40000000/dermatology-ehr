import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchAmbientNote: vi.fn(),
  fetchAmbientTranscript: vi.fn(),
  fetchAmbientNoteEdits: vi.fn(),
  updateAmbientNote: vi.fn(),
  reviewAmbientNote: vi.fn(),
  generatePatientSummary: vi.fn(),
  applyAmbientNoteToEncounter: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'user-1', role: 'provider' },
    },
  }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../ScribeSummaryCard', () => ({
  ScribeSummaryCard: () => <div data-testid="scribe-summary-card" />,
}));

import { NoteReviewEditor } from '../NoteReviewEditor';

describe('NoteReviewEditor accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchAmbientNote.mockResolvedValue({
      note: {
        id: 'note-1',
        transcriptId: 'transcript-1',
        encounterId: 'encounter-1',
        reviewStatus: 'draft',
        overallConfidence: 0.82,
        chiefComplaint: 'Itchy rash',
        hpi: 'Started last week',
        ros: '',
        physicalExam: '',
        assessment: '',
        plan: '',
        suggestedIcd10Codes: [],
        suggestedCptCodes: [],
        mentionedMedications: [],
        followUpTasks: [],
      },
    });
    apiMocks.fetchAmbientNoteEdits.mockResolvedValue({
      edits: [{
        id: 'edit-1',
        section: 'hpi',
        changeType: 'edit',
        editReason: 'Clarified onset',
        createdAt: '2026-09-02T12:00:00.000Z',
      }],
    });
    apiMocks.fetchAmbientTranscript.mockResolvedValue({
      transcript: {
        id: 'transcript-1',
        transcriptSegments: [{ speaker: 'provider', start: 0, end: 2, text: 'Tell me about the rash.' }],
      },
    });
  });

  it('announces loading and exposes disclosure state and keyboard-scrollable regions', async () => {
    render(<NoteReviewEditor noteId="note-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading clinical note.');
    await screen.findByRole('heading', { level: 2, name: 'AI-Generated Clinical Note' });

    const transcriptToggle = screen.getByRole('button', { name: 'Hide Transcript' });
    const suggestionsToggle = screen.getByRole('button', { name: 'Hide Suggestions' });
    expect(transcriptToggle).toHaveAttribute('aria-expanded', 'true');
    expect(transcriptToggle).toHaveAttribute('aria-controls', 'ambient-transcript-panel');
    expect(suggestionsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(suggestionsToggle).toHaveAttribute('aria-controls', 'ambient-suggestions-panel');

    expect(screen.getByRole('region', { name: 'Transcript' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('region', { name: 'Edit History' })).toHaveAttribute('tabindex', '0');

    fireEvent.click(transcriptToggle);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Transcript' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Show Transcript' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('ambient-suggestions-panel')).toBeInTheDocument();

    fireEvent.click(suggestionsToggle);
    expect(screen.getByRole('button', { name: 'Show Suggestions' })).toHaveAttribute('aria-expanded', 'false');
  });
});
