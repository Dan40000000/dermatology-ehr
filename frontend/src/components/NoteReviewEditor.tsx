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
  type AmbientNoteEdit
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

      await applyAmbientNoteToEncounter(session.tenantId, session.accessToken, noteId);

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

      showSuccess(`AI note posted to appointment; ${summaryMessage}`);
      await loadData();
    } catch (error: any) {
      showError(error.message || 'Failed to post AI note to appointment');
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
            onClick={() => setShowTranscript(!showTranscript)}
            className="scribe-review-toggle"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="scribe-review-toggle"
          >
            {showSuggestions ? 'Hide' : 'Show'} Suggestions
          </button>
        </div>
      </div>

      <div className={`scribe-review-layout ${showTranscript ? '' : 'scribe-review-layout--single'}`}>
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

            {/* Note Sections */}
            {sections.map(({ key, label, field }) => {
              const confidence = note.sectionConfidence?.[key] || 0;
              const isEditing = editMode === key;
              const confidenceTone = getConfidenceTone(confidence);

              return (
                <div key={key} className="scribe-note-section">
                  <div className="scribe-note-section__header">
                    <div className="scribe-note-section__title-group">
                      <span className="scribe-note-section__label">{label}</span>
                      <span className={`scribe-note-section__confidence scribe-note-section__confidence--${confidenceTone}`}>
                        {(confidence * 100).toFixed(0)}% confidence
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
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={8}
                        />
                        <input
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Reason for edit (optional)"
                          className="w-full px-3 py-2 border border-gray-300 text-sm"
                        />
                        <div className="flex space-x-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditMode(null)}
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
                <div className="scribe-review-workflow-title">Doctor posting workflow</div>
                <div className="scribe-review-workflow-copy">
                  Edit any section above, save the edit, then post the approved note into the linked appointment encounter.
                </div>
              </div>
              <button
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
                  onClick={() => handleReview('approve')}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--success"
                >
                  Approve Note Only
                </button>
                <button
                  onClick={() => handleReview('request_regeneration')}
                  disabled={saving}
                  className="scribe-review-action-button scribe-review-action-button--primary"
                >
                  Regenerate
                </button>
                <button
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
        {showTranscript && (
          <div className="scribe-review-sidebar">
            {/* Transcript */}
            {transcript && (
              <div className="scribe-review-sidebar-card">
                <h4 className="scribe-review-sidebar-title">Transcript</h4>
                <div className="scribe-review-transcript-list">
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
              <>
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
              </>
            )}

            {/* Edit History */}
            {edits.length > 0 && (
              <div className="scribe-review-sidebar-card">
                <h4 className="scribe-review-sidebar-title">Edit History</h4>
                <div className="scribe-review-edit-list">
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
