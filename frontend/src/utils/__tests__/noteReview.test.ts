import { expect, it } from 'vitest';
import type { AmbientGeneratedNote, AmbientNoteEdit } from '../../api';
import { buildNoteSectionReviewSignals } from '../noteReview';

const note: AmbientGeneratedNote = {
  id: 'note-1',
  transcriptId: 'transcript-1',
  chiefComplaint: 'Changing lesion',
  hpi: 'Not documented',
  ros: 'No fever or chills.',
  physicalExam: 'Irregular brown papule on the upper back.',
  assessment: 'Neoplasm of uncertain behavior.',
  plan: 'Shave biopsy discussed.',
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

it('identifies missing and low-confidence sections without calling them evidence-supported', () => {
  const signals = buildNoteSectionReviewSignals(note, []);

  expect(signals.find((signal) => signal.section === 'hpi')).toMatchObject({
    status: 'missing',
    sourceLabel: 'Not documented',
  });
  expect(signals.find((signal) => signal.section === 'ros')).toMatchObject({
    status: 'needs_review',
    sourceLabel: 'AI draft · verify',
  });
  expect(signals.find((signal) => signal.section === 'physicalExam')).toMatchObject({
    status: 'ready',
    sourceLabel: 'AI draft · transcript available',
  });
});

it('shows an audited manual update as clinician edited', () => {
  const edits: AmbientNoteEdit[] = [{
    id: 'edit-1',
    generatedNoteId: 'note-1',
    editedBy: 'provider-1',
    section: 'assessment',
    previousValue: 'Old assessment',
    newValue: 'Updated assessment',
    changeType: 'update',
    isSignificant: true,
    createdAt: '2026-09-03T12:05:00.000Z',
  }];

  const signals = buildNoteSectionReviewSignals(note, edits);
  expect(signals.find((signal) => signal.section === 'assessment')).toMatchObject({
    status: 'clinician_edited',
    sourceLabel: 'Clinician edited',
  });
});
