/**
 * NoteReviewEditor Component
 *
 * Review and edit AI-generated clinical notes
 * Features:
 * - Side-by-side transcript and note view
 * - Inline editing with track changes
 * - Confidence indicators
 * - Suggested codes and medications
 * - Approve/reject workflow
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchAmbientNote,
  fetchAmbientTranscript,
  previewAmbientNoteRevision,
  updateAmbientNote,
  reviewAmbientNote,
  generatePatientSummary,
  sharePatientSummary,
  applyAmbientNoteToEncounter,
  fetchAmbientNoteEdits,
  type AmbientGeneratedNote,
  type AmbientNoteRevisionPreview,
  type AmbientTranscript,
  type AmbientNoteEdit,
  type ClinicalNoteSection,
} from '../api';
import { ScribeSummaryCard } from './ScribeSummaryCard';
import {
  buildDiagnoses,
  buildNextSteps,
  buildSummaryText,
  buildSymptoms,
  buildTests,
  buildTreatmentPlan,
  stripStructuredNoteContent
} from '../utils/scribeSummary';
import { getScribeSpeakerLabel, getScribeSpeakerToneClass } from '../utils/scribeSpeakers';
import { buildNoteSectionReviewSignals } from '../utils/noteReview';

interface NoteReviewEditorProps {
  noteId: string;
  onApproved?: () => void;
  onRejected?: () => void;
}

type Section = ClinicalNoteSection;

const MAGIC_EDIT_PRESETS = [
  'Make the selected sections more concise without changing clinical meaning.',
  'Improve clarity and organization while preserving every documented fact.',
  'Remove repetition and keep the assessment and plan problem-oriented.',
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function NoteReviewEditor({ noteId, onApproved, onRejected }: NoteReviewEditorProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const sessionTenantId = session?.tenantId;
  const sessionAccessToken = session?.accessToken;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<AmbientGeneratedNote | null>(null);
  const [transcript, setTranscript] = useState<AmbientTranscript | null>(null);
  const [edits, setEdits] = useState<AmbientNoteEdit[]>([]);

  const [editMode, setEditMode] = useState<Section | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showTranscript, setShowTranscript] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [magicSections, setMagicSections] = useState<Section[]>(['assessment', 'plan']);
  const [magicPreview, setMagicPreview] = useState<AmbientNoteRevisionPreview | null>(null);
  const [selectedMagicUpdates, setSelectedMagicUpdates] = useState<Section[]>([]);
  const [magicStatus, setMagicStatus] = useState('');
  const [patientSummaryShared, setPatientSummaryShared] = useState(false);
  const [postActionOptions, setPostActionOptions] = useState({
    diagnoses: true,
    orders: true,
    tasks: true,
    billingReview: true,
  });
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editButtonRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
  const magicInstructionRef = useRef<HTMLTextAreaElement | null>(null);
  const magicPreviewTitleRef = useRef<HTMLHeadingElement | null>(null);

  const loadData = useCallback(async () => {
    if (!sessionTenantId || !sessionAccessToken) {
      setLoading(true);
      return;
    }

    try {
      setLoading(true);
      const [noteData, editsData] = await Promise.all([
        fetchAmbientNote(sessionTenantId, sessionAccessToken, noteId),
        fetchAmbientNoteEdits(sessionTenantId, sessionAccessToken, noteId)
      ]);

      setNote(noteData.note);
      setEdits(editsData.edits);

      // Load transcript
      if (noteData.note.transcriptId) {
        const transcriptData = await fetchAmbientTranscript(
          sessionTenantId,
          sessionAccessToken,
          noteData.note.transcriptId
        );
        setTranscript(transcriptData.transcript);
      }
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to load note'));
    } finally {
      setLoading(false);
    }
  }, [noteId, sessionAccessToken, sessionTenantId, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (editMode) {
      editTextareaRef.current?.focus();
    }
  }, [editMode]);

  const handleEdit = (section: Section) => {
    setEditMode(section);
    setEditValue(note?.[section] || '');
    setEditReason('');
  };

  const handleSaveEdit = async () => {
    if (!editMode || !note || !session) return;
    const editedSection = editMode;

    try {
      setSaving(true);
      await updateAmbientNote(
        session.tenantId,
        session.accessToken,
        noteId,
        {
          [editMode]: editValue,
          editReason
        }
      );

      setNote({ ...note, [editMode]: editValue });
      setEditMode(null);
      showSuccess('Note updated successfully');
      await loadData(); // Reload to get updated edit history
      window.setTimeout(() => editButtonRefs.current[editedSection]?.focus(), 0);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to update note'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    const editedSection = editMode;
    setEditMode(null);
    if (editedSection) {
      window.setTimeout(() => editButtonRefs.current[editedSection]?.focus(), 0);
    }
  };

  const toggleMagicSection = (section: Section) => {
    setMagicSections((current) => current.includes(section)
      ? current.filter((item) => item !== section)
      : [...current, section]);
    setMagicPreview(null);
    setSelectedMagicUpdates([]);
  };

  const handleMagicPreview = async () => {
    const instruction = magicInstruction.trim();
    if (!session || !instruction || magicSections.length === 0) return;

    try {
      setSaving(true);
      setMagicStatus('Preparing a revision preview. The chart has not been changed.');
      const preview = await previewAmbientNoteRevision(
        session.tenantId,
        session.accessToken,
        noteId,
        { instruction, sections: magicSections }
      );
      setMagicPreview(preview);
      const changedSections = Object.keys(preview.suggestedUpdates) as Section[];
      setSelectedMagicUpdates(changedSections);
      setMagicStatus(preview.available
        ? `${changedSections.length} suggested section ${changedSections.length === 1 ? 'change is' : 'changes are'} ready for review.`
        : preview.warning || 'Live AI note revision is unavailable.');
      window.setTimeout(() => magicPreviewTitleRef.current?.focus(), 0);
    } catch (error: unknown) {
      setMagicPreview(null);
      setSelectedMagicUpdates([]);
      setMagicStatus('Revision preview could not be prepared.');
      showError(getErrorMessage(error, 'Failed to prepare note revision'));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyMagicPreview = async () => {
    if (!session || !magicPreview || selectedMagicUpdates.length === 0) return;
    const updates = Object.fromEntries(
      selectedMagicUpdates
        .map((section) => [section, magicPreview.suggestedUpdates[section]])
        .filter((entry): entry is [Section, string] => typeof entry[1] === 'string')
    ) as Partial<Record<Section, string>>;
    const expectedCurrent = Object.fromEntries(
      selectedMagicUpdates.map((section) => [section, String(note?.[section] || '')])
    ) as Partial<Record<Section, string>>;

    try {
      setSaving(true);
      setMagicStatus('Applying selected suggestions to the draft note.');
      await updateAmbientNote(session.tenantId, session.accessToken, noteId, {
        ...updates,
        expectedCurrent,
        editReason: `Clinician accepted Magic Edit preview: ${magicInstruction.trim().slice(0, 500)}`,
      });
      setMagicPreview(null);
      setSelectedMagicUpdates([]);
      setMagicInstruction('');
      setMagicStatus('Selected suggestions applied to the draft. Clinician review is still required.');
      showSuccess('Selected Magic Edit suggestions applied to the draft');
      await loadData();
      window.setTimeout(() => magicInstructionRef.current?.focus(), 0);
    } catch (error: unknown) {
      setMagicStatus('Selected suggestions could not be applied.');
      showError(getErrorMessage(error, 'Failed to apply note revision'));
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (action: 'approve' | 'reject' | 'request_regeneration') => {
    if (!session) return;
    if (editMode) {
      showError('Save or cancel the current edit before reviewing the note');
      return;
    }

    try {
      setSaving(true);
      const result = await reviewAmbientNote(
        session.tenantId,
        session.accessToken,
        noteId,
        action
      );

      let successMessage = result.message;
      if (action === 'approve') {
        try {
          const summaryResult = await generatePatientSummary(
            session.tenantId,
            session.accessToken,
            noteId
          );
          successMessage = `Note approved - ${summaryResult.message}`;
        } catch (summaryError: unknown) {
          showError(getErrorMessage(summaryError, 'Note approved, but summary generation failed'));
        }
      }

      showSuccess(successMessage);

      if (action === 'approve' && onApproved) {
        onApproved();
      } else if (action === 'reject' && onRejected) {
        onRejected();
      }

      await loadData();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to review note'));
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndPostToAppointment = async () => {
    if (!note || !session) return;

    if (!note.encounterId) {
      showError('No encounter or appointment is linked to this AI note');
      return;
    }

    try {
      setSaving(true);

      if (editMode) {
        await updateAmbientNote(
          session.tenantId,
          session.accessToken,
          noteId,
          {
            [editMode]: editValue,
            editReason: editReason || 'Clinician edit before posting to appointment'
          }
        );
        setEditMode(null);
      }

      if (note.reviewStatus !== 'approved') {
        await reviewAmbientNote(session.tenantId, session.accessToken, noteId, 'approve');
      }

      const applyResult = await applyAmbientNoteToEncounter(session.tenantId, session.accessToken, noteId, {
        applyStructuredActions: Object.values(postActionOptions).some(Boolean),
        includeDiagnoses: postActionOptions.diagnoses,
        includeOrders: postActionOptions.orders,
        includeTasks: postActionOptions.tasks,
        includeBillingReview: postActionOptions.billingReview,
      });

      let summaryMessage = 'patient summary saved';
      try {
        const summaryResult = await generatePatientSummary(
          session.tenantId,
          session.accessToken,
          noteId
        );
        summaryMessage = summaryResult.existing ? 'existing patient summary kept' : 'patient summary saved';
      } catch (summaryError: unknown) {
        summaryMessage = 'patient summary needs review';
        showError(getErrorMessage(summaryError, 'Note posted, but patient summary publishing failed'));
      }

      const actions = applyResult.structuredActions;
      const actionMessage = actions
        ? `structured actions: ${actions.diagnosesCreated} diagnosis suggestions, ${actions.ordersCreated} orders, ${actions.tasksCreated} tasks, ${actions.billingReviewItemsCreated || 0} billing reviews`
        : 'structured actions reviewed';
      showSuccess(`AI note posted to appointment; ${summaryMessage}; ${actionMessage}`);
      await loadData();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post AI note to appointment'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublishSummary = async () => {
    if (!note || !session) return;
    try {
      setSaving(true);
      if (note.reviewStatus !== 'approved') {
        await reviewAmbientNote(session.tenantId, session.accessToken, noteId, 'approve');
      }
      const summaryResult = await generatePatientSummary(
        session.tenantId,
        session.accessToken,
        noteId
      );
      showSuccess(summaryResult.message || 'Patient summary saved to profile');
      await loadData();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to publish patient summary'));
    } finally {
      setSaving(false);
    }
  };

  const handleShareSummary = async () => {
    if (!note || !session || note.reviewStatus !== 'approved') return;
    try {
      setSaving(true);
      const summaryResult = await generatePatientSummary(
        session.tenantId,
        session.accessToken,
        noteId
      );
      const shareResult = await sharePatientSummary(
        session.tenantId,
        session.accessToken,
        summaryResult.summaryId
      );
      setPatientSummaryShared(true);
      showSuccess(shareResult.message || 'Summary shared to the patient portal');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to share patient summary'));
    } finally {
      setSaving(false);
    }
  };

  const getConfidenceTone = (confidence: number) => {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.75) return 'medium';
    return 'low';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.75) return 'Medium';
    return 'Low';
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '16rem' }}><div style={{ animation: 'spin 1s linear infinite', height: '2rem', width: '2rem', border: '4px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '9999px' }} /></div>;
  }

  if (!note) {
    return <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Note not found</div>;
  }

  const sections: { key: Section; label: string; field: keyof AmbientGeneratedNote }[] = [
    { key: 'chiefComplaint', label: 'Chief Complaint', field: 'chiefComplaint' },
    { key: 'hpi', label: 'History of Present Illness', field: 'hpi' },
    { key: 'ros', label: 'Review of Systems', field: 'ros' },
    { key: 'physicalExam', label: 'Physical Exam', field: 'physicalExam' },
    { key: 'assessment', label: 'Assessment', field: 'assessment' },
    { key: 'plan', label: 'Plan', field: 'plan' }
  ];

  const clinicalEditSections = new Set(['chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan']);
  const noteForPreview: AmbientGeneratedNote = editMode ? { ...note, [editMode]: editValue } : note;
  const hasClinicalEdits = Boolean(editMode) || edits.some((edit) => clinicalEditSections.has(edit.section));
  const reviewSignals = buildNoteSectionReviewSignals(noteForPreview, edits);
  const missingSignals = reviewSignals.filter((signal) => signal.status === 'missing');
  const needsReviewSignals = reviewSignals.filter((signal) => signal.status === 'needs_review');
  const reviewedSignalCount = reviewSignals.filter((signal) => ['ready', 'clinician_edited'].includes(signal.status)).length;
  const summaryNote = hasClinicalEdits ? stripStructuredNoteContent(noteForPreview) : noteForPreview;
  const summarySymptoms = buildSymptoms(summaryNote, null);
  const summaryDiagnoses = buildDiagnoses(summaryNote, null);
  const summaryTests = buildTests(summaryNote, null);
  const summaryText = buildSummaryText(summaryNote, null);
  const summaryTreatmentPlan = buildTreatmentPlan(summaryNote, null);
  const summaryNextSteps = buildNextSteps(summaryNote, null);
  const postingActionLabel = !note.encounterId
    ? 'No Linked Appointment'
    : note.reviewStatus === 'approved'
      ? 'Post to Appointment'
      : 'Approve & Post to Appointment';
  const showSidebar = showTranscript || showSuggestions || edits.length > 0;

  return (
    <div style={{ background: 'white', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #e5e7eb', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>AI-Generated Clinical Note</h2>
            <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>
              Review and edit the AI-generated documentation
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: note.reviewStatus === 'approved' ? '#d1fae5' : note.reviewStatus === 'rejected' ? '#fee2e2' : '#fef3c7',
              color: note.reviewStatus === 'approved' ? '#065f46' : note.reviewStatus === 'rejected' ? '#991b1b' : '#92400e'
            }}>
              {note.reviewStatus.charAt(0).toUpperCase() + note.reviewStatus.slice(1)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="scribe-review-controls">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="scribe-review-toggle"
            aria-expanded={showTranscript}
            aria-controls="scribe-review-transcript"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="scribe-review-toggle"
            aria-expanded={showSuggestions}
            aria-controls="scribe-review-suggestions"
          >
            {showSuggestions ? 'Hide' : 'Show'} Suggestions
          </button>
        </div>
      </div>

      <div className={`scribe-review-layout ${showSidebar ? '' : 'scribe-review-layout--single'}`}>
        {/* Main Note Content */}
        <div className="scribe-review-main">
          <div className="space-y-6">
            {/* Overall Confidence */}
            <div className={`scribe-review-confidence-card scribe-review-confidence-card--${getConfidenceTone(note.overallConfidence)}`}>
              <div className="scribe-review-confidence-row">
                <span>Overall Confidence</span>
                <span className="scribe-review-confidence-value">{(note.overallConfidence * 100).toFixed(0)}%</span>
              </div>
              <p>
                {getConfidenceLabel(note.overallConfidence)} confidence - Review carefully
              </p>
            </div>

            <section className="scribe-review-readiness" aria-labelledby="scribe-review-readiness-title">
              <div className="scribe-review-readiness__header">
                <div>
                  <h3 id="scribe-review-readiness-title">Review readiness</h3>
                  <p>Missing and low-confidence sections stay visible until a clinician reviews them.</p>
                </div>
                <strong>{reviewedSignalCount} of {reviewSignals.length} ready</strong>
              </div>
              <div className="scribe-review-readiness__summary" aria-label="Note review status summary">
                <span className="scribe-review-readiness__count scribe-review-readiness__count--missing">
                  {missingSignals.length} missing
                </span>
                <span className="scribe-review-readiness__count scribe-review-readiness__count--review">
                  {needsReviewSignals.length} needs review
                </span>
                <span className="scribe-review-readiness__count scribe-review-readiness__count--ready">
                  {reviewedSignalCount} ready or edited
                </span>
              </div>
              {(missingSignals.length > 0 || needsReviewSignals.length > 0) && (
                <ul className="scribe-review-readiness__list">
                  {[...missingSignals, ...needsReviewSignals].map((signal) => (
                    <li key={signal.section}>
                      <strong>{signal.label}:</strong>{' '}
                      {signal.status === 'missing' ? 'not documented' : `${Math.round(signal.confidence * 100)}% AI confidence; verify against the transcript`}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {note.reviewStatus !== 'approved' && note.reviewStatus !== 'rejected' && (
              <section className="scribe-magic-edit" aria-labelledby="scribe-magic-edit-title">
                <div className="scribe-magic-edit__header">
                  <div>
                    <h3 id="scribe-magic-edit-title">Magic Edit</h3>
                    <p>Describe a wording or organization change. Nothing changes until you review and apply the preview.</p>
                  </div>
                  <span className="scribe-magic-edit__safety">Preview only</span>
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleMagicPreview();
                  }}
                >
                  <label htmlFor="magic-edit-instruction" className="scribe-magic-edit__label">
                    Revision instruction
                  </label>
                  <textarea
                    id="magic-edit-instruction"
                    ref={magicInstructionRef}
                    value={magicInstruction}
                    onChange={(event) => {
                      setMagicInstruction(event.target.value);
                      setMagicPreview(null);
                      setSelectedMagicUpdates([]);
                    }}
                    rows={3}
                    maxLength={2000}
                    placeholder="For example: Make the assessment and plan concise without changing clinical meaning."
                    className="scribe-magic-edit__input"
                  />

                  <div className="scribe-magic-edit__presets" aria-label="Suggested revision instructions">
                    {MAGIC_EDIT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setMagicInstruction(preset);
                          setMagicPreview(null);
                          setSelectedMagicUpdates([]);
                        }}
                      >
                        {preset.split('.')[0]}
                      </button>
                    ))}
                  </div>

                  <fieldset className="scribe-magic-edit__sections">
                    <legend>Sections to revise</legend>
                    {sections.map(({ key, label }) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={magicSections.includes(key)}
                          onChange={() => toggleMagicSection(key)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </fieldset>

                  <button
                    type="submit"
                    className="scribe-review-action-button scribe-review-action-button--primary"
                    disabled={saving || magicInstruction.trim().length < 3 || magicSections.length === 0}
                  >
                    {saving ? 'Preparing Preview…' : 'Preview Changes'}
                  </button>
                </form>

                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {magicStatus}
                </div>

                {magicPreview && (
                  <div className="scribe-magic-edit__preview" aria-labelledby="magic-edit-preview-title">
                    <div className="scribe-magic-edit__preview-header">
                      <div>
                        <h4 id="magic-edit-preview-title" ref={magicPreviewTitleRef} tabIndex={-1}>Suggested changes</h4>
                        <p>{magicPreview.rationale}</p>
                      </div>
                      <span>{magicPreview.provider === 'mock' ? 'AI unavailable' : `${magicPreview.provider} · ${magicPreview.model}`}</span>
                    </div>

                    {magicPreview.warning && (
                      <p className="scribe-magic-edit__warning" role="alert">{magicPreview.warning}</p>
                    )}

                    {Object.keys(magicPreview.suggestedUpdates).length > 0 ? (
                      <div className="scribe-magic-edit__changes">
                        {(Object.entries(magicPreview.suggestedUpdates) as Array<[Section, string]>).map(([section, value]) => {
                          const definition = sections.find((item) => item.key === section);
                          const evidence = magicPreview.evidenceBySection[section] || [];
                          return (
                            <article key={section} className="scribe-magic-edit__change">
                              <label className="scribe-magic-edit__change-title">
                                <input
                                  type="checkbox"
                                  checked={selectedMagicUpdates.includes(section)}
                                  onChange={() => setSelectedMagicUpdates((current) => current.includes(section)
                                    ? current.filter((item) => item !== section)
                                    : [...current, section])}
                                />
                                <span>Apply {definition?.label || section}</span>
                              </label>
                              <div className="scribe-magic-edit__comparison">
                                <div>
                                  <strong>Current</strong>
                                  <p>{note[section] || 'Not documented'}</p>
                                </div>
                                <div>
                                  <strong>Suggested</strong>
                                  <p>{value}</p>
                                </div>
                              </div>
                              {evidence.length > 0 && (
                                <details>
                                  <summary>Supporting transcript excerpts</summary>
                                  <ul>{evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                                </details>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    ) : magicPreview.available ? (
                      <p className="scribe-magic-edit__empty">The AI did not propose a safe change. Adjust the instruction or edit the section manually.</p>
                    ) : null}

                    {magicPreview.missingData.length > 0 && (
                      <div className="scribe-magic-edit__missing">
                        <strong>Confirm before applying</strong>
                        <ul>{magicPreview.missingData.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                    )}

                    {Object.keys(magicPreview.suggestedUpdates).length > 0 && (
                      <div className="scribe-magic-edit__actions">
                        <button
                          type="button"
                          className="scribe-review-action-button scribe-review-action-button--primary"
                          onClick={() => void handleApplyMagicPreview()}
                          disabled={saving || selectedMagicUpdates.length === 0}
                        >
                          {saving ? 'Applying…' : `Apply ${selectedMagicUpdates.length} Selected`}
                        </button>
                        <button
                          type="button"
                          className="scribe-review-toggle"
                          onClick={() => {
                            setMagicPreview(null);
                            setSelectedMagicUpdates([]);
                            setMagicStatus('Revision preview discarded.');
                            window.setTimeout(() => magicInstructionRef.current?.focus(), 0);
                          }}
                        >
                          Discard Preview
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <ScribeSummaryCard
              title="Patient Summary Preview"
              visitDate={note.completedAt || note.createdAt}
              statusLabel={editMode ? 'Editing draft' : hasClinicalEdits ? 'Edited draft' : note.reviewStatus === 'approved' ? 'Ready to share' : 'Draft'}
              symptoms={summarySymptoms}
              potentialDiagnoses={summaryDiagnoses}
              suggestedTests={summaryTests}
              treatmentPlan={summaryTreatmentPlan}
              nextSteps={summaryNextSteps}
              summaryText={summaryText}
              showDetails
            />

            {/* Note Sections */}
            {sections.map(({ key, label, field }) => {
              const confidence = note.sectionConfidence?.[key] || 0;
              const isEditing = editMode === key;
              const confidenceTone = getConfidenceTone(confidence);
              const reviewSignal = reviewSignals.find((signal) => signal.section === key);

              return (
                <div key={key} className="scribe-note-section">
                  <div className="scribe-note-section__header">
                    <div className="scribe-note-section__title-group">
                      <span className="scribe-note-section__label">{label}</span>
                      <span className={`scribe-note-section__confidence scribe-note-section__confidence--${confidenceTone}`}>
                        {(confidence * 100).toFixed(0)}% confidence
                      </span>
                      {reviewSignal && (
                        <span className={`scribe-note-section__source scribe-note-section__source--${reviewSignal.status}`}>
                          {reviewSignal.sourceLabel}
                        </span>
                      )}
                    </div>
                    {!isEditing && note.reviewStatus !== 'approved' && (
                      <button
                        type="button"
                        ref={(element) => { editButtonRefs.current[key] = element; }}
                        onClick={() => handleEdit(key)}
                        className="scribe-summary-button"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="scribe-note-section__body">
                    {isEditing ? (
                      <div className="space-y-3 scribe-note-section__edit">
                        <label className="scribe-note-section__edit-label" htmlFor={`note-edit-${key}`}>
                          {label} note text
                        </label>
                        <textarea
                          id={`note-edit-${key}`}
                          ref={editTextareaRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={8}
                        />
                        <label className="scribe-note-section__edit-label" htmlFor={`note-edit-reason-${key}`}>
                          Reason for editing {label} <span>(optional)</span>
                        </label>
                        <input
                          id={`note-edit-reason-${key}`}
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Reason for edit (optional)"
                          className="w-full px-3 py-2 border border-gray-300 text-sm"
                        />
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="scribe-note-section__content">
                        {note[field] || <span className="scribe-note-section__empty">No content generated</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Differential Diagnoses Section */}
            {note.differentialDiagnoses && note.differentialDiagnoses.length > 0 && (
              <div className="scribe-insight-card">
                <div className="scribe-insight-card__header">
                  <div>
                    <div className="scribe-insight-card__title">Differential Diagnoses</div>
                    <div className="scribe-insight-card__subtitle">Provider reference only</div>
                  </div>
                  <span className="scribe-summary-pill">AI</span>
                </div>
                <div className="scribe-insight-card__body">
                  {note.differentialDiagnoses.map((diagnosis, idx) => {
                    const confidenceTone = getConfidenceTone(diagnosis.confidence);
                    return (
                      <div key={idx} className="scribe-insight-item">
                        <div className="scribe-insight-item__header">
                          <span className="scribe-insight-item__title">{diagnosis.condition}</span>
                          <div className="scribe-insight-pill-group">
                            {diagnosis.icd10Code && (
                              <span className="scribe-summary-pill">{diagnosis.icd10Code}</span>
                            )}
                            <span className={`scribe-insight-pill scribe-insight-pill--${confidenceTone}`}>
                              {Math.round(diagnosis.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="scribe-insight-item__body">{diagnosis.reasoning}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommended Tests Section */}
            {note.recommendedTests && note.recommendedTests.length > 0 && (
              <div className="scribe-insight-card">
                <div className="scribe-insight-card__header">
                  <div>
                    <div className="scribe-insight-card__title">Recommended Tests</div>
                    <div className="scribe-insight-card__subtitle">Provider reference only</div>
                  </div>
                  <span className="scribe-summary-pill">AI</span>
                </div>
                <div className="scribe-insight-card__body">
                  {note.recommendedTests.map((test, idx) => (
                    <div key={idx} className="scribe-insight-item">
                      <div className="scribe-insight-item__header">
                        <span className="scribe-insight-item__title">{test.testName}</span>
                        <div className="scribe-insight-pill-group">
                          <span className={`scribe-insight-pill scribe-insight-pill--${test.urgency}`}>
                            {test.urgency}
                          </span>
                          {test.cptCode && <span className="scribe-summary-pill">{test.cptCode}</span>}
                        </div>
                      </div>
                      <div className="scribe-insight-item__body">{test.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="scribe-review-workflow-card">
              <div>
                <h3 className="scribe-review-workflow-title">Doctor posting workflow</h3>
                <div className="scribe-review-workflow-copy">
                  The clinical note will post to the appointment. Choose which draft actions should also be created for review.
                </div>
                <fieldset className="scribe-review-workflow-options">
                  <legend>Draft actions to create</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={postActionOptions.diagnoses}
                      onChange={(event) => setPostActionOptions((current) => ({ ...current, diagnoses: event.target.checked }))}
                    />
                    <span>Diagnoses ({note.suggestedIcd10Codes?.length || 0})</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={postActionOptions.orders}
                      onChange={(event) => setPostActionOptions((current) => ({ ...current, orders: event.target.checked }))}
                    />
                    <span>Orders ({note.recommendedTests?.length || 0})</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={postActionOptions.tasks}
                      onChange={(event) => setPostActionOptions((current) => ({ ...current, tasks: event.target.checked }))}
                    />
                    <span>Follow-up tasks ({note.followUpTasks?.length || 0})</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={postActionOptions.billingReview}
                      onChange={(event) => setPostActionOptions((current) => ({ ...current, billingReview: event.target.checked }))}
                    />
                    <span>Billing review ({note.suggestedCptCodes?.length || 0})</span>
                  </label>
                </fieldset>
                <p className="scribe-review-workflow-safety">
                  These are review items only. Nothing is prescribed, sent, billed, or signed automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApproveAndPostToAppointment}
                disabled={saving || !note.encounterId || note.reviewStatus === 'rejected'}
                className="scribe-review-action-button scribe-review-action-button--primary"
              >
                {postingActionLabel}
              </button>
            </div>

            {note.reviewStatus === 'pending' && (
              <div className="scribe-review-action-row">
                <button
                  type="button"
                  onClick={() => handleReview('approve')}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--success"
                >
                  Approve Note Only
                </button>
                <button
                  type="button"
                  onClick={() => handleReview('request_regeneration')}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--primary"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => handleReview('reject')}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--danger"
                >
                  Reject
                </button>
              </div>
            )}

            {note.reviewStatus === 'approved' && (
              <div className="scribe-review-action-row">
                <button
                  type="button"
                  onClick={handlePublishSummary}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--success"
                >
                  Save Summary to Profile
                </button>
                <button
                  type="button"
                  onClick={handleShareSummary}
                  disabled={saving || patientSummaryShared}
                  className="scribe-review-action-button scribe-review-action-button--primary"
                >
                  {patientSummaryShared ? 'Shared to Patient Portal' : 'Review & Share to Patient Portal'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="scribe-review-sidebar">
            {/* Transcript */}
            {showTranscript && transcript && (
              <section id="scribe-review-transcript" className="scribe-review-sidebar-card" aria-labelledby="scribe-review-transcript-title">
                <h3 id="scribe-review-transcript-title" className="scribe-review-sidebar-title">Transcript</h3>
                <div className="scribe-review-transcript-list" role="region" aria-label="Visit transcript segments" tabIndex={0}>
                  {transcript.transcriptSegments.map((segment, idx) => (
                    <div key={idx} className={`scribe-review-transcript-segment ${getScribeSpeakerToneClass(segment)}`}>
                      <div className="scribe-review-transcript-meta">
                        <span>
                          {getScribeSpeakerLabel(segment, idx)}
                        </span>
                        <span>{Math.floor(segment.start)}s</span>
                      </div>
                      <p className="scribe-review-transcript-text">{segment.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Suggestions */}
            {showSuggestions && (
              <section id="scribe-review-suggestions" className="scribe-review-sidebar-group" aria-label="AI suggestions for clinician review">
                {/* ICD-10 Codes */}
                {note.suggestedIcd10Codes && note.suggestedIcd10Codes.length > 0 && (
                  <div className="scribe-review-sidebar-card">
                    <h4 className="scribe-review-sidebar-title">Suggested ICD-10 Codes</h4>
                    <div className="scribe-review-code-list">
                      {note.suggestedIcd10Codes.map((code, idx) => (
                        <div key={idx} className="scribe-review-code-row">
                          <div>
                            <span className="scribe-review-code-code">{code.code}</span>
                            <p className="scribe-review-code-description">{code.description}</p>
                          </div>
                          <span className={`scribe-review-confidence scribe-review-confidence--${getConfidenceTone(code.confidence)}`}>
                            {(code.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CPT Codes */}
                {note.suggestedCptCodes && note.suggestedCptCodes.length > 0 && (
                  <div className="scribe-insight-card">
                    <div className="scribe-insight-card__header">
                      <div className="scribe-insight-card__title">Suggested CPT Codes</div>
                    </div>
                    <div className="scribe-insight-card__body">
                      {note.suggestedCptCodes.map((code, idx) => {
                        const confidenceTone = getConfidenceTone(code.confidence);
                        return (
                          <div key={idx} className="scribe-insight-item">
                            <div className="scribe-insight-item__header">
                              <span className="scribe-insight-item__title">{code.code}</span>
                              <span className={`scribe-insight-pill scribe-insight-pill--${confidenceTone}`}>
                                {(code.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="scribe-insight-item__meta">{code.description}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Medications */}
                {note.mentionedMedications && note.mentionedMedications.length > 0 && (
                  <div className="scribe-review-sidebar-card">
                    <h4 className="scribe-review-sidebar-title">Mentioned Medications</h4>
                    <div className="scribe-review-code-list">
                      {note.mentionedMedications.map((med, idx) => (
                        <div key={idx} className="scribe-review-med-row">
                          <div className="scribe-review-med-name">{med.name}</div>
                          <div className="scribe-review-med-detail">{med.dosage} - {med.frequency}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Tasks */}
                {note.followUpTasks && note.followUpTasks.length > 0 && (
                  <div className="scribe-insight-card">
                    <div className="scribe-insight-card__header">
                      <div className="scribe-insight-card__title">Follow-up Tasks</div>
                    </div>
                    <div className="scribe-insight-card__body">
                      {note.followUpTasks.map((task, idx) => (
                        <div key={idx} className="scribe-insight-item">
                          <div className="scribe-insight-item__header">
                            <span className="scribe-insight-item__title">{task.task}</span>
                            <span className={`scribe-insight-pill scribe-insight-pill--${task.priority}`}>
                              {task.priority}
                            </span>
                          </div>
                          {task.dueDate && (
                            <div className="scribe-insight-item__meta">Due: {task.dueDate}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Edit History */}
            {edits.length > 0 && (
              <div className="scribe-review-sidebar-card">
                <h3 className="scribe-review-sidebar-title">Edit History</h3>
                <div className="scribe-review-edit-list" role="region" aria-label="Note edit history" tabIndex={0}>
                  {edits.map((edit) => (
                    <div key={edit.id} className="scribe-review-edit-row">
                      <div className="scribe-review-edit-section">{edit.section.replace(/_/g, ' ')}</div>
                      <div className="scribe-review-edit-meta">{edit.changeType}</div>
                      {edit.editReason && (
                        <div className="scribe-review-edit-meta">Reason: {edit.editReason}</div>
                      )}
                      <div className="scribe-review-edit-time">{new Date(edit.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
