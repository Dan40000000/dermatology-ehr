import type { AmbientGeneratedNote, AmbientNoteEdit, ClinicalNoteSection } from '../api';

export type NoteSectionReviewStatus = 'missing' | 'needs_review' | 'ready' | 'clinician_edited';

export interface NoteSectionReviewSignal {
  section: ClinicalNoteSection;
  label: string;
  status: NoteSectionReviewStatus;
  confidence: number;
  sourceLabel: string;
}

const sectionDefinitions: Array<{ section: ClinicalNoteSection; label: string; editKey: string }> = [
  { section: 'chiefComplaint', label: 'Chief Complaint', editKey: 'chief_complaint' },
  { section: 'hpi', label: 'History of Present Illness', editKey: 'hpi' },
  { section: 'ros', label: 'Review of Systems', editKey: 'ros' },
  { section: 'physicalExam', label: 'Physical Exam', editKey: 'physical_exam' },
  { section: 'assessment', label: 'Assessment', editKey: 'assessment' },
  { section: 'plan', label: 'Plan', editKey: 'plan' },
];

function isMissingContent(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  return /^(?:not documented|none documented|no content generated)[.!]?$/i.test(value.trim());
}

function normalizeConfidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

export function buildNoteSectionReviewSignals(
  note: AmbientGeneratedNote,
  edits: AmbientNoteEdit[]
): NoteSectionReviewSignal[] {
  const editedSections = new Set(
    edits
      .filter((edit) => edit.changeType === 'update')
      .map((edit) => edit.section)
  );

  return sectionDefinitions.map(({ section, label, editKey }) => {
    const confidence = normalizeConfidence(note.sectionConfidence?.[section]);
    if (isMissingContent(note[section])) {
      return { section, label, status: 'missing', confidence, sourceLabel: 'Not documented' };
    }
    if (editedSections.has(editKey)) {
      return { section, label, status: 'clinician_edited', confidence, sourceLabel: 'Clinician edited' };
    }
    if (confidence < 0.75) {
      return { section, label, status: 'needs_review', confidence, sourceLabel: 'AI draft · verify' };
    }
    return { section, label, status: 'ready', confidence, sourceLabel: 'AI draft · transcript available' };
  });
}
