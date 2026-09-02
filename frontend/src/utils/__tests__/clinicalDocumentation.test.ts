import { describe, expect, it } from 'vitest';
import {
  getDefaultAmbientSectionSelection,
  buildDraftApplyResult,
  getDefaultDraftSectionSelection,
  getDraftSectionReview,
  getDraftSectionText,
} from '../clinicalDocumentation';
import type { AINoteDraft } from '../../api';
import type { AmbientGeneratedNote } from '../../api';

const draft: AINoteDraft = {
  chiefComplaint: 'Changing mole',
  hpi: 'Patient reports a changing mole for two weeks.',
  ros: '',
  exam: 'Left forearm 5 mm asymmetric brown papule.',
  assessmentPlan: 'Problem: Nevus. Plan: Photograph and follow up.',
  confidenceScore: 0.8,
  suggestions: [],
  sectionReview: {
    chiefComplaint: {
      status: 'drafted',
      confidence: 0.99,
      evidence: [{ source: 'chief_complaint', excerpt: 'Changing mole' }],
    },
    hpi: {
      status: 'drafted',
      confidence: 0.9,
      evidence: [{ source: 'brief_notes', excerpt: 'changing mole for two weeks' }],
    },
    ros: { status: 'not_documented', confidence: 0, evidence: [] },
    exam: {
      status: 'drafted',
      confidence: 0.85,
      evidence: [{ source: 'brief_notes', excerpt: '5 mm asymmetric brown papule' }],
    },
    assessmentPlan: {
      status: 'drafted',
      confidence: 0.75,
      evidence: [{ source: 'brief_notes', excerpt: 'photograph and follow up' }],
    },
  },
};

describe('clinical documentation review helpers', () => {
  it('keeps unsupported sections empty and derives editable section text', () => {
    expect(getDraftSectionText(draft)).toEqual({
      chiefComplaint: 'Changing mole',
      hpi: 'Patient reports a changing mole for two weeks.',
      ros: '',
      exam: 'Left forearm 5 mm asymmetric brown papule.',
      assessmentPlan: 'Problem: Nevus. Plan: Photograph and follow up.',
    });
    expect(getDraftSectionReview(draft, 'ros').status).toBe('not_documented');
  });

  it('does not select destinations that already contain manual text', () => {
    expect(getDefaultDraftSectionSelection(draft, {
      chiefComplaint: 'Existing clinician complaint',
      hpi: '',
      ros: '',
      exam: '',
      assessmentPlan: '',
    })).toEqual({
      chiefComplaint: false,
      hpi: true,
      ros: false,
      exam: true,
      assessmentPlan: true,
    });
  });

  it('does not auto-select metadata-bearing content without source evidence', () => {
    const unsupported = {
      ...draft,
      sectionReview: {
        ...draft.sectionReview,
        hpi: { status: 'drafted' as const, confidence: 0.2, evidence: [] },
      },
    };
    expect(getDefaultDraftSectionSelection(unsupported, {})).toMatchObject({
      chiefComplaint: true,
      hpi: false,
      ros: false,
      exam: true,
      assessmentPlan: true,
    });
  });

  it('applies only selected edited content and preserves existing fields in fill mode', () => {
    const result = buildDraftApplyResult(
      {
        chiefComplaint: 'Edited complaint',
        hpi: 'Edited HPI',
        ros: '',
        exam: 'Edited exam',
        assessmentPlan: 'Edited plan',
      },
      { chiefComplaint: true, hpi: true, ros: true, exam: false, assessmentPlan: false },
      { chiefComplaint: 'Manual complaint', hpi: '', ros: '', exam: 'Manual exam', assessmentPlan: '' },
      'fill_empty',
    );

    expect(result.updated).toEqual({ hpi: 'Edited HPI' });
    expect(result.appliedSections).toEqual(['hpi']);
    expect(result.skippedSections).toEqual(['chiefComplaint', 'ros']);
    expect(result.hasExistingSelectedContent).toBe(true);
  });

  it('allows explicitly confirmed replace mode to emit selected content', () => {
    const result = buildDraftApplyResult(
      { chiefComplaint: 'Edited complaint', hpi: '', ros: '', exam: '', assessmentPlan: '' },
      { chiefComplaint: true, hpi: false, ros: false, exam: false, assessmentPlan: false },
      { chiefComplaint: 'Manual complaint' },
      'replace',
    );
    expect(result.updated).toEqual({ chiefComplaint: 'Edited complaint' });
    expect(result.appliedSections).toEqual(['chiefComplaint']);
    expect(result.hasExistingSelectedContent).toBe(true);
  });

  it('selects only drafted ambient sections and supports legacy review labeling', () => {
    const note = {
      chiefComplaint: 'Rash',
      hpi: 'Two-week history',
      ros: 'Not documented',
      physicalExam: 'Erythematous patch',
      assessment: '',
      plan: 'Moisturizer',
      noteContent: {
        sectionReview: {
          chiefComplaint: { status: 'drafted', confidence: 0.9, evidence: [{ source: 'transcript', excerpt: 'rash' }] },
          hpi: { status: 'drafted', confidence: 0.8, evidence: [] },
          ros: { status: 'not_documented', confidence: 0, evidence: [] },
          physicalExam: { status: 'drafted', confidence: 0.7, evidence: [{ source: 'transcript', excerpt: 'erythematous patch' }] },
          assessment: { status: 'not_documented', confidence: 0, evidence: [] },
          plan: { status: 'drafted', confidence: 0.8, evidence: [{ source: 'transcript', excerpt: 'moisturizer' }] },
        },
      },
    } as AmbientGeneratedNote;

    expect(getDefaultAmbientSectionSelection(note)).toEqual({
      chiefComplaint: true,
      hpi: false,
      ros: false,
      physicalExam: true,
      assessment: false,
      plan: true,
    });

    const legacy = { ...note, noteContent: undefined };
    expect(getDefaultAmbientSectionSelection(legacy)).toEqual({
      chiefComplaint: true,
      hpi: true,
      ros: true,
      physicalExam: true,
      assessment: false,
      plan: true,
    });
  });
});
