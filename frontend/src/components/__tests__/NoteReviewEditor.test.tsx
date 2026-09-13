import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteReviewEditor } from '../NoteReviewEditor';
import type { AmbientGeneratedNote } from '../../api';

const apiMocks = vi.hoisted(() => ({
  fetchAmbientNote: vi.fn(),
  fetchAmbientTranscript: vi.fn(),
  fetchAmbientNoteEdits: vi.fn(),
  previewAmbientNoteRevision: vi.fn(),
  updateAmbientNote: vi.fn(),
  reviewAmbientNote: vi.fn(),
  generatePatientSummary: vi.fn(),
  sharePatientSummary: vi.fn(),
  applyAmbientNoteToEncounter: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('../../api', () => apiMocks);
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: {
      tenantId: 'tenant-1',
      accessToken: 'token-1',
      user: { id: 'provider-1', role: 'provider', fullName: 'Dr. Test' },
    },
  }),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

const baseNote: AmbientGeneratedNote = {
  id: 'note-1',
  transcriptId: 'transcript-1',
  encounterId: 'encounter-1',
  chiefComplaint: 'Changing lesion',
  hpi: 'Not documented',
  ros: 'No fever or chills.',
  physicalExam: 'Irregular brown papule on the upper back.',
  assessment: 'Neoplasm of uncertain behavior.',
  plan: 'Shave biopsy performed today.',
  suggestedIcd10Codes: [],
  suggestedCptCodes: [],
  mentionedMedications: [],
  mentionedAllergies: [],
  followUpTasks: [],
  overallConfidence: 0.82,
  sectionConfidence: {
    chiefComplaint: 0.94,
    hpi: 0.1,
    ros: 0.7,
    physicalExam: 0.88,
    assessment: 0.83,
    plan: 0.81,
  },
  reviewStatus: 'pending',
  generationStatus: 'completed',
  createdAt: '2026-09-03T12:00:00.000Z',
};

function prepareNote(note: AmbientGeneratedNote = baseNote) {
  apiMocks.fetchAmbientNote.mockResolvedValue({ note });
  apiMocks.fetchAmbientNoteEdits.mockResolvedValue({ edits: [] });
  apiMocks.fetchAmbientTranscript.mockResolvedValue({
    transcript: {
      id: 'transcript-1',
      recordingId: 'recording-1',
      transcriptText: 'The lesion has changed. We will do a shave biopsy today.',
      transcriptSegments: [
        { speaker: 0, start: 0, end: 3, text: 'The lesion has changed.', confidence: 0.95 },
        { speaker: 1, start: 3, end: 6, text: 'We will do a shave biopsy today.', confidence: 0.96 },
      ],
      speakers: {},
      speakerCount: 2,
      confidence: 0.95,
      wordCount: 12,
      phiEntities: [],
      phiMasked: true,
      transcriptionStatus: 'completed',
      createdAt: '2026-09-03T11:55:00.000Z',
    },
  });
}

describe('NoteReviewEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareNote();
    apiMocks.previewAmbientNoteRevision.mockResolvedValue({
      available: true,
      noteId: 'note-1',
      suggestedUpdates: {
        assessment: 'Neoplasm of uncertain behavior of skin.',
        plan: 'Shave biopsy performed; await pathology.',
      },
      rationale: 'Removed repetition without adding facts.',
      evidenceBySection: {
        plan: ['We will do a shave biopsy today.'],
      },
      missingData: ['Confirm lesion size.'],
      provider: 'openai',
      model: 'test-model',
    });
    apiMocks.updateAmbientNote.mockResolvedValue({ success: true, message: 'Updated' });
    apiMocks.reviewAmbientNote.mockResolvedValue({ success: true, status: 'approved', message: 'Approved' });
    apiMocks.generatePatientSummary.mockResolvedValue({ summaryId: 'summary-1', message: 'Saved' });
    apiMocks.sharePatientSummary.mockResolvedValue({ success: true, message: 'Shared to patient portal' });
    apiMocks.applyAmbientNoteToEncounter.mockResolvedValue({
      success: true,
      encounterId: 'encounter-1',
      message: 'Posted',
      structuredActions: { diagnosesCreated: 0, ordersCreated: 0, tasksCreated: 0, billingReviewItemsCreated: 0 },
    });
  });

  it('makes missing and low-confidence documentation prominent', async () => {
    render(<NoteReviewEditor noteId="note-1" />);

    expect(await screen.findByRole('heading', { name: 'Review readiness' })).toBeInTheDocument();
    expect(screen.getByText('1 missing')).toBeInTheDocument();
    expect(screen.getByText('1 needs review')).toBeInTheDocument();
    expect(screen.getByText(/History of Present Illness:/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Magic Edit' })).toBeInTheDocument();
  });

  it('previews and applies only clinician-selected Magic Edit changes', async () => {
    const user = userEvent.setup();
    render(<NoteReviewEditor noteId="note-1" />);

    const instruction = await screen.findByLabelText('Revision instruction');
    await user.type(instruction, 'Make the assessment and plan concise');
    await user.click(screen.getByRole('button', { name: 'Preview Changes' }));

    expect(await screen.findByRole('heading', { name: 'Suggested changes' })).toBeInTheDocument();
    expect(screen.getByText('Shave biopsy performed; await pathology.')).toBeInTheDocument();
    expect(screen.getByText('Confirm lesion size.')).toBeInTheDocument();
    expect(apiMocks.updateAmbientNote).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'Apply Assessment' }));
    await user.click(screen.getByRole('button', { name: 'Apply 1 Selected' }));

    await waitFor(() => expect(apiMocks.updateAmbientNote).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      'note-1',
      expect.objectContaining({
        plan: 'Shave biopsy performed; await pathology.',
        expectedCurrent: { plan: 'Shave biopsy performed today.' },
        editReason: expect.stringContaining('Clinician accepted Magic Edit preview'),
      })
    ));
    expect(apiMocks.updateAmbientNote.mock.calls[0][3]).not.toHaveProperty('assessment');
  });

  it('shares only an approved summary through the explicit patient action', async () => {
    prepareNote({ ...baseNote, reviewStatus: 'approved' });
    const user = userEvent.setup();
    render(<NoteReviewEditor noteId="note-1" />);

    await user.click(await screen.findByRole('button', { name: 'Review & Share to Patient Portal' }));

    await waitFor(() => expect(apiMocks.sharePatientSummary).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      'summary-1'
    ));
    expect(screen.getByRole('button', { name: 'Shared to Patient Portal' })).toBeDisabled();
  });

  it('lets the clinician choose which review actions are created when posting', async () => {
    const user = userEvent.setup();
    render(<NoteReviewEditor noteId="note-1" />);

    await user.click(await screen.findByRole('checkbox', { name: 'Orders (0)' }));
    await user.click(screen.getByRole('button', { name: 'Approve & Post to Appointment' }));

    await waitFor(() => expect(apiMocks.applyAmbientNoteToEncounter).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      'note-1',
      {
        applyStructuredActions: true,
        includeDiagnoses: true,
        includeOrders: false,
        includeTasks: true,
        includeBillingReview: true,
      },
    ));
    expect(screen.getByText(/Nothing is prescribed, sent, billed, or signed automatically/i)).toBeInTheDocument();
  });
});
