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

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  fetchAmbientNote,
  fetchAmbientTranscript,
  updateAmbientNote,
  reviewAmbientNote,
  generatePatientSummary,
  applyAmbientNoteToEncounter,
  fetchAmbientNoteEdits,
  type AmbientGeneratedNote,
  type AmbientTranscript,
  type AmbientNoteEdit,
  type AmbientSectionKey,
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
import {
  AMBIENT_NOTE_SECTIONS,
  EMPTY_AMBIENT_SECTION_SELECTION,
  getAmbientSectionReview,
  getDefaultAmbientSectionSelection,
  type AmbientSectionSelection,
} from '../utils/clinicalDocumentation';

interface NoteReviewEditorProps {
  noteId: string;
  onApproved?: () => void;
  onRejected?: () => void;
}

type Section = 'chiefComplaint' | 'hpi' | 'ros' | 'physicalExam' | 'assessment' | 'plan';

export function NoteReviewEditor({ noteId, onApproved, onRejected }: NoteReviewEditorProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

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
  const [selectedSections, setSelectedSections] = useState<AmbientSectionSelection>({
    ...EMPTY_AMBIENT_SECTION_SELECTION,
  });
  const [postStatus, setPostStatus] = useState('Review the sections below, then choose which reviewed content to post.');
  const [postError, setPostError] = useState<string | null>(null);

  const loadData = async () => {
    if (!session) {
      setLoading(true);
      return;
    }

    try {
      setLoading(true);
      const [noteData, editsData] = await Promise.all([
        fetchAmbientNote(session.tenantId, session.accessToken, noteId),
        fetchAmbientNoteEdits(session.tenantId, session.accessToken, noteId)
      ]);

      setNote(noteData.note);
      setSelectedSections(getDefaultAmbientSectionSelection(noteData.note));
      setPostError(null);
      setEdits(editsData.edits);

      // Load transcript
      if (noteData.note.transcriptId) {
        const transcriptData = await fetchAmbientTranscript(
          session.tenantId,
          session.accessToken,
          noteData.note.transcriptId
        );
        setTranscript(transcriptData.transcript);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load note');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [noteId, session?.tenantId, session?.accessToken]);

  const handleEdit = (section: Section) => {
    setEditMode(section);
    setEditValue(note?.[section] || '');
    setEditReason('');
  };

  const handleSaveEdit = async () => {
    if (!editMode || !note || !session) return;

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
    } catch (error: any) {
      showError(error.message || 'Failed to update note');
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
        } catch (summaryError: any) {
          showError(summaryError.message || 'Note approved, but summary generation failed');
        }
      }

      showSuccess(successMessage);

      if (action === 'approve' && onApproved) {
        onApproved();
      } else if (action === 'reject' && onRejected) {
        onRejected();
      }

      await loadData();
    } catch (error: any) {
      showError(error.message || 'Failed to review note');
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

    const sectionsToPost = AMBIENT_NOTE_SECTIONS
      .filter(({ key }) => selectedSections[key])
      .map(({ key }) => key as AmbientSectionKey);
    if (sectionsToPost.length === 0) {
      const message = 'Select at least one reviewed section before posting to the appointment.';
      setPostError(message);
      setPostStatus(message);
      showError(message);
      return;
    }

    try {
      setSaving(true);
      setPostError(null);
      setPostStatus('Posting the selected reviewed sections. Existing encounter content will be preserved.');

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
        applyStructuredActions: true,
        includeDiagnoses: true,
        includeOrders: true,
        includeTasks: true,
        includeBillingReview: true,
        sections: sectionsToPost,
        mode: 'fill_empty',
      });

      let summaryMessage = 'patient summary saved';
      try {
        const summaryResult = await generatePatientSummary(
          session.tenantId,
          session.accessToken,
          noteId
        );
        summaryMessage = summaryResult.existing ? 'existing patient summary kept' : 'patient summary saved';
      } catch (summaryError: any) {
        summaryMessage = 'patient summary needs review';
        showError(summaryError.message || 'Note posted, but patient summary publishing failed');
      }

      const actions = applyResult.structuredActions;
      const actionMessage = actions
        ? `structured actions: ${actions.diagnosesCreated} diagnosis suggestions, ${actions.ordersCreated} orders, ${actions.tasksCreated} tasks, ${actions.billingReviewItemsCreated || 0} billing reviews`
        : 'structured actions reviewed';
      const appliedCount = applyResult.appliedSections?.length ?? sectionsToPost.length;
      const skippedCount = applyResult.skippedSections?.length ?? 0;
      const selectionMessage = skippedCount > 0
        ? `${appliedCount} section${appliedCount === 1 ? '' : 's'} posted; ${skippedCount} existing section${skippedCount === 1 ? '' : 's'} preserved`
        : `${appliedCount} section${appliedCount === 1 ? '' : 's'} posted`;
      const successMessage = `AI note posted to appointment; ${selectionMessage}; ${summaryMessage}; ${actionMessage}`;
      setPostStatus(successMessage);
      showSuccess(successMessage);
      await loadData();
    } catch (error: any) {
      const message = error.message || 'Failed to post AI note to appointment';
      setPostError(message);
      setPostStatus(`Posting failed: ${message}`);
      showError(message);
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
    } catch (error: any) {
      showError(error.message || 'Failed to publish patient summary');
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
    return (
      <div role="status" aria-live="polite" aria-atomic="true" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', height: '16rem' }}>
        <div aria-hidden="true" style={{ animation: 'spin 1s linear infinite', height: '2rem', width: '2rem', border: '4px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '9999px' }} />
        <span>Loading clinical note.</span>
      </div>
    );
  }

  if (!note) {
    return <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>Note not found</div>;
  }

  const clinicalEditSections = new Set(['chief_complaint', 'hpi', 'ros', 'physical_exam', 'assessment', 'plan']);
  const noteForPreview: AmbientGeneratedNote = editMode ? { ...note, [editMode]: editValue } : note;
  const hasClinicalEdits = Boolean(editMode) || edits.some((edit) => clinicalEditSections.has(edit.section));
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
  const selectedSectionCount = AMBIENT_NOTE_SECTIONS.filter(({ key }) => selectedSections[key]).length;

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
            aria-controls="ambient-transcript-panel"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="scribe-review-toggle"
            aria-expanded={showSuggestions}
            aria-controls="ambient-suggestions-panel"
          >
            {showSuggestions ? 'Hide' : 'Show'} Suggestions
          </button>
        </div>
      </div>

      <div className={`scribe-review-layout ${showTranscript || showSuggestions || edits.length > 0 ? '' : 'scribe-review-layout--single'}`}>
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

            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                background: '#f8fafc',
                color: '#1f2937',
                fontSize: '0.875rem',
              }}
            >
              {postStatus}
            </div>

            {postError && (
              <div id="ambient-post-error" role="alert" style={{ color: '#991b1b', fontSize: '0.875rem' }}>
                {postError}
              </div>
            )}

            <fieldset
              aria-describedby={postError ? 'ambient-post-sections-help ambient-post-error' : 'ambient-post-sections-help'}
              aria-busy={saving}
              style={{
                margin: 0,
                padding: '1rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                background: '#f9fafb',
              }}
            >
              <legend style={{ padding: '0 0.35rem', fontWeight: 700, color: '#111827' }}>
                Sections to post to appointment
              </legend>
              <p id="ambient-post-sections-help" style={{ margin: '0 0 0.75rem', color: '#374151', fontSize: '0.875rem' }}>
                Select only content you reviewed. Existing manual encounter content is preserved; unselected sections are not posted.
              </p>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {AMBIENT_NOTE_SECTIONS.map(({ key, label, field }) => {
                  const { review, legacy } = getAmbientSectionReview(note, key);
                  const content = String(note[field] || '').trim();
                  // Explicit clinician selection can post edited content even
                  // when the AI metadata says it was not documented. The
                  // default remains unselected for that status.
                  const canSelect = Boolean(content);
                  const evidence = (review.evidence || []).filter((item) => item.excerpt?.trim());
                  return (
                    <div
                      key={`post-${key}`}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '0.35rem',
                        padding: '0.65rem 0.75rem',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <input
                          id={`ambient-post-${key}`}
                          type="checkbox"
                          checked={Boolean(selectedSections[key])}
                          disabled={!canSelect || saving || !note.encounterId}
                          onChange={(event) => setSelectedSections((previous) => ({ ...previous, [key]: event.target.checked }))}
                          style={{ width: '1.15rem', height: '1.15rem', minWidth: '1.15rem' }}
                        />
                        <label htmlFor={`ambient-post-${key}`} style={{ display: 'flex', alignItems: 'center', minHeight: '2.75rem', cursor: canSelect ? 'pointer' : 'not-allowed', color: '#1f2937' }}>
                          <span>
                            <span style={{ display: 'block', fontWeight: 600 }}>{label}</span>
                            <span style={{ display: 'block', fontSize: '0.8rem', color: '#374151', marginTop: '0.15rem' }}>
                              {legacy
                                ? 'Needs clinician review (legacy note)'
                                : review.status === 'drafted'
                                  ? `Drafted · ${Math.round(Math.max(0, Math.min(1, review.confidence || 0)) * 100)}% confidence`
                                  : content
                                    ? 'Not documented · clinician review required'
                                    : 'Not documented'}
                              {!content && ' · No content'}
                            </span>
                          </span>
                        </label>
                      </div>
                      {evidence.length > 0 && (
                        <details style={{ margin: '0.55rem 0 0 2rem' }}>
                          <summary style={{ cursor: 'pointer', minHeight: '2.25rem', display: 'flex', alignItems: 'center', color: '#075985', fontWeight: 600 }}>
                            Source evidence ({evidence.length})
                          </summary>
                          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.15rem', color: '#374151', fontSize: '0.8rem' }}>
                            {evidence.map((item, index) => (
                              <li key={`${key}-evidence-${index}`}>
                                <span style={{ fontWeight: 600 }}>{item.source === 'transcript' ? 'Transcript' : 'Visit context'}:</span>{' '}
                                {item.excerpt}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {/* Note Sections */}
            {AMBIENT_NOTE_SECTIONS.map(({ key, label, field }) => {
              const { review, legacy } = getAmbientSectionReview(note, key);
              const confidence = review.confidence || 0;
              const isEditing = editMode === key;
              const confidenceTone = getConfidenceTone(confidence);
              const evidence = (review.evidence || []).filter((item) => item.excerpt?.trim());

              return (
                <div key={key} className="scribe-note-section">
                  <div className="scribe-note-section__header">
                    <div className="scribe-note-section__title-group">
                      <span className="scribe-note-section__label">{label}</span>
                      <span className={`scribe-note-section__confidence scribe-note-section__confidence--${confidenceTone}`}>
                        {(confidence * 100).toFixed(0)}% confidence
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#374151' }}>
                        {legacy ? 'Needs clinician review' : review.status === 'drafted' ? 'Drafted' : 'Not documented'}
                      </span>
                    </div>
                    {!isEditing && note.reviewStatus !== 'approved' && (
                      <button
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
                        <label htmlFor={`ambient-edit-${key}`} style={{ fontWeight: 600, color: '#1f2937' }}>
                          {label} content
                        </label>
                        <textarea
                          id={`ambient-edit-${key}`}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={8}
                        />
                        <label htmlFor={`ambient-edit-reason-${key}`} style={{ fontWeight: 600, color: '#1f2937' }}>
                          Reason for edit (optional)
                        </label>
                        <input
                          id={`ambient-edit-reason-${key}`}
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
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
                            onClick={() => setEditMode(null)}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="scribe-note-section__content">
                          {note[field] || <span className="scribe-note-section__empty">No content generated</span>}
                        </div>
                        {evidence.length > 0 && (
                          <details style={{ marginTop: '0.75rem' }}>
                            <summary style={{ cursor: 'pointer', minHeight: '2.25rem', display: 'flex', alignItems: 'center', color: '#075985', fontWeight: 600 }}>
                              Source evidence ({evidence.length})
                            </summary>
                            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.15rem', color: '#374151', fontSize: '0.8rem' }}>
                              {evidence.map((item, index) => (
                                <li key={`${key}-section-evidence-${index}`}>
                                  <span style={{ fontWeight: 600 }}>{item.source === 'transcript' ? 'Transcript' : 'Visit context'}:</span>{' '}
                                  {item.excerpt}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
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
                <div className="scribe-review-workflow-title">Doctor posting workflow</div>
                <div className="scribe-review-workflow-copy">
                  Edit any section above, save the edit, then post the selected reviewed sections into the linked appointment encounter. Existing manual encounter content is preserved.
                </div>
              </div>
              <button
                type="button"
                onClick={handleApproveAndPostToAppointment}
                disabled={saving || !note.encounterId || note.reviewStatus === 'rejected' || selectedSectionCount === 0}
                className="scribe-review-action-button scribe-review-action-button--primary"
                aria-describedby="ambient-post-sections-help"
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
                  Publish to Patient Profile
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {(showTranscript || showSuggestions || edits.length > 0) && (
          <div className="scribe-review-sidebar">
            {/* Transcript */}
            {showTranscript && transcript && (
              <div id="ambient-transcript-panel" className="scribe-review-sidebar-card">
                <h3 id="ambient-transcript-heading" className="scribe-review-sidebar-title">Transcript</h3>
                <div className="scribe-review-transcript-list" role="region" aria-labelledby="ambient-transcript-heading" tabIndex={0}>
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
              </div>
            )}

            {/* Suggestions */}
            {showSuggestions && (
              <div id="ambient-suggestions-panel">
                {/* ICD-10 Codes */}
                {note.suggestedIcd10Codes && note.suggestedIcd10Codes.length > 0 && (
                  <div className="scribe-review-sidebar-card">
                    <h3 className="scribe-review-sidebar-title">Suggested ICD-10 Codes</h3>
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
                      <h3 className="scribe-insight-card__title">Suggested CPT Codes</h3>
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
                    <h3 className="scribe-review-sidebar-title">Mentioned Medications</h3>
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
                      <h3 className="scribe-insight-card__title">Follow-up Tasks</h3>
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
              </div>
            )}

            {/* Edit History */}
            {edits.length > 0 && (
              <div className="scribe-review-sidebar-card">
                <h3 id="ambient-edit-history-heading" className="scribe-review-sidebar-title">Edit History</h3>
                <div className="scribe-review-edit-list" role="region" aria-labelledby="ambient-edit-history-heading" tabIndex={0}>
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
