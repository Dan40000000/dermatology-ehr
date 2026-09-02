import type {
  AINoteDraft,
  AINoteSectionKey,
  AINoteSectionReview,
  AmbientGeneratedNote,
  AmbientSectionKey,
  AmbientSectionReview,
} from '../api';

/**
 * The encounter note fields are intentionally kept flat for API compatibility.
 * These helpers add a review layer without changing the persisted SOAP shape.
 */
export const AI_NOTE_SECTIONS: Array<{
  key: AINoteSectionKey;
  label: string;
  destination: 'chiefComplaint' | 'hpi' | 'ros' | 'exam' | 'assessmentPlan';
}> = [
  { key: 'chiefComplaint', label: 'Chief Complaint', destination: 'chiefComplaint' },
  { key: 'hpi', label: 'History of Present Illness (HPI)', destination: 'hpi' },
  { key: 'ros', label: 'Review of Systems (ROS)', destination: 'ros' },
  { key: 'exam', label: 'Physical Exam', destination: 'exam' },
  { key: 'assessmentPlan', label: 'Assessment & Plan', destination: 'assessmentPlan' },
];

export type DraftSectionText = Record<AINoteSectionKey, string>;
export type DraftSectionSelection = Record<AINoteSectionKey, boolean>;

export const EMPTY_DRAFT_SECTION_TEXT: DraftSectionText = {
  chiefComplaint: '',
  hpi: '',
  ros: '',
  exam: '',
  assessmentPlan: '',
};

export const EMPTY_DRAFT_SECTION_SELECTION: DraftSectionSelection = {
  chiefComplaint: false,
  hpi: false,
  ros: false,
  exam: false,
  assessmentPlan: false,
};

export function getDraftSectionText(draft: AINoteDraft): DraftSectionText {
  return {
    chiefComplaint: draft.chiefComplaint || '',
    hpi: draft.hpi || '',
    ros: draft.ros || '',
    exam: draft.exam || '',
    assessmentPlan: draft.assessmentPlan || '',
  };
}

export function getDraftSectionReview(
  draft: AINoteDraft,
  key: AINoteSectionKey,
): AINoteSectionReview {
  const content = draft[key] || '';
  const metadata = draft.sectionReview?.[key];
  if (metadata) return metadata;

  // Older API responses have no section metadata. Treat non-empty content as
  // a draft, but keep evidence empty so the UI never invents provenance.
  return {
    status: content.trim() ? 'drafted' : 'not_documented',
    confidence: Number.isFinite(draft.confidenceScore) ? draft.confidenceScore : 0,
    evidence: [],
  };
}

export function getDefaultDraftSectionSelection(
  draft: AINoteDraft,
  destinations: Partial<Record<AINoteSectionKey, string | null | undefined>>,
): DraftSectionSelection {
  return AI_NOTE_SECTIONS.reduce<DraftSectionSelection>((selection, { key }) => {
    const content = (draft[key] || '').trim();
    const review = getDraftSectionReview(draft, key);
    const metadata = draft.sectionReview?.[key];
    const hasEvidence = Boolean(metadata?.evidence?.some((item) => item.excerpt?.trim()));
    // Metadata-bearing sections must have source evidence before they are
    // selected automatically. Legacy responses have no metadata and remain
    // backward-compatible when they contain non-empty content.
    const isEligible = review.status === 'drafted' && Boolean(content) && (!metadata || hasEvidence);
    selection[key] = isEligible && !String(destinations[key] || '').trim();
    return selection;
  }, { ...EMPTY_DRAFT_SECTION_SELECTION });
}

export function getSelectedDraftSections(selection: DraftSectionSelection): AINoteSectionKey[] {
  return AI_NOTE_SECTIONS.filter(({ key }) => selection[key]).map(({ key }) => key);
}

export interface ApplyDraftResult {
  updated: Partial<Record<'chiefComplaint' | 'hpi' | 'ros' | 'exam' | 'assessmentPlan', string>>;
  appliedSections: AINoteSectionKey[];
  skippedSections: AINoteSectionKey[];
  hasExistingSelectedContent: boolean;
}

/**
 * Compute a safe, explicit apply operation. In fill_empty mode non-empty
 * destination fields are always skipped; replace mode is only enabled after
 * the caller obtains a clear confirmation from the clinician.
 */
export function buildDraftApplyResult(
  draftText: DraftSectionText,
  selection: DraftSectionSelection,
  destinations: Partial<Record<'chiefComplaint' | 'hpi' | 'ros' | 'exam' | 'assessmentPlan', string | null | undefined>>,
  mode: 'fill_empty' | 'replace',
): ApplyDraftResult {
  const updated: ApplyDraftResult['updated'] = {};
  const appliedSections: AINoteSectionKey[] = [];
  const skippedSections: AINoteSectionKey[] = [];
  let hasExistingSelectedContent = false;

  AI_NOTE_SECTIONS.forEach(({ key, destination }) => {
    if (!selection[key]) return;
    const incoming = (draftText[key] || '').trim();
    const existing = String(destinations[destination] || '').trim();
    if (!incoming) {
      skippedSections.push(key);
      return;
    }
    if (existing) {
      hasExistingSelectedContent = true;
      if (mode === 'fill_empty') {
        skippedSections.push(key);
        return;
      }
    }
    updated[destination] = draftText[key];
    appliedSections.push(key);
  });

  return { updated, appliedSections, skippedSections, hasExistingSelectedContent };
}

export type AmbientNoteSectionKey = AmbientSectionKey;

export const AMBIENT_NOTE_SECTIONS: Array<{
  key: AmbientNoteSectionKey;
  label: string;
  field: keyof AmbientGeneratedNote;
}> = [
  { key: 'chiefComplaint', label: 'Chief Complaint', field: 'chiefComplaint' },
  { key: 'hpi', label: 'History of Present Illness', field: 'hpi' },
  { key: 'ros', label: 'Review of Systems', field: 'ros' },
  { key: 'physicalExam', label: 'Physical Exam', field: 'physicalExam' },
  { key: 'assessment', label: 'Assessment', field: 'assessment' },
  { key: 'plan', label: 'Plan', field: 'plan' },
];

export type AmbientSectionSelection = Record<AmbientNoteSectionKey, boolean>;

export const EMPTY_AMBIENT_SECTION_SELECTION: AmbientSectionSelection = {
  chiefComplaint: false,
  hpi: false,
  ros: false,
  physicalExam: false,
  assessment: false,
  plan: false,
};

export function getAmbientSectionReview(
  note: AmbientGeneratedNote,
  key: AmbientNoteSectionKey,
): { review: AmbientSectionReview; legacy: boolean } {
  const metadata = note.noteContent?.sectionReview?.[key];
  if (metadata) return { review: metadata, legacy: false };

  const field = AMBIENT_NOTE_SECTIONS.find((section) => section.key === key)?.field || key;
  const content = String(note[field] || '');
  const confidence = Number(note.sectionConfidence?.[key] ?? note.overallConfidence ?? 0);
  return {
    review: {
      status: content.trim() ? 'drafted' : 'not_documented',
      confidence: Number.isFinite(confidence) ? confidence : 0,
      evidence: [],
    },
    legacy: true,
  };
}

export function getDefaultAmbientSectionSelection(note: AmbientGeneratedNote): AmbientSectionSelection {
  return AMBIENT_NOTE_SECTIONS.reduce<AmbientSectionSelection>((selection, { key, field }) => {
    const content = String(note[field] || '').trim();
    const { review, legacy } = getAmbientSectionReview(note, key);
    const hasEvidence = Boolean(review.evidence?.some((item) => item.excerpt?.trim()));
    // New metadata-bearing sections require evidence before auto-selection;
    // legacy notes retain the non-empty default for backward compatibility.
    selection[key] = Boolean(content) && review.status === 'drafted' && (legacy || hasEvidence);
    return selection;
  }, { ...EMPTY_AMBIENT_SECTION_SELECTION });
}
