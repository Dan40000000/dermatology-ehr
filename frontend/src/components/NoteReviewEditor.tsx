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
  applyAmbientNoteToEncounter,
  fetchAmbientNoteEdits,
  type AmbientGeneratedNote,
  type AmbientTranscript,
  type AmbientNoteEdit
} from '../api';

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

  useEffect(() => {
    loadData();
  }, [noteId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [noteData, editsData] = await Promise.all([
        fetchAmbientNote(session!.tenantId, session!.accessToken, noteId),
        fetchAmbientNoteEdits(session!.tenantId, session!.accessToken, noteId)
      ]);

      setNote(noteData.note);
      setEdits(editsData.edits);

      // Load transcript
      if (noteData.note.transcriptId) {
        const transcriptData = await fetchAmbientTranscript(
          session!.tenantId,
          session!.accessToken,
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

  const handleEdit = (section: Section) => {
    setEditMode(section);
    setEditValue(note?.[section] || '');
    setEditReason('');
  };

  const handleSaveEdit = async () => {
    if (!editMode || !note) return;

    try {
      setSaving(true);
      await updateAmbientNote(
        session!.tenantId,
        session!.accessToken,
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
    try {
      setSaving(true);
      const result = await reviewAmbientNote(
        session!.tenantId,
        session!.accessToken,
        noteId,
        action
      );

      showSuccess(result.message);

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

  const handleApplyToEncounter = async () => {
    if (!note?.encounterId) {
      showError('No encounter associated with this note');
      return;
    }

    try {
      setSaving(true);
      await applyAmbientNoteToEncounter(session!.tenantId, session!.accessToken, noteId);
      showSuccess('Note applied to encounter successfully');
    } catch (error: any) {
      showError(error.message || 'Failed to apply note');
    } finally {
      setSaving(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-50';
    if (confidence >= 0.75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
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
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: 'white', cursor: 'pointer' }}
            className="hover-bg-gray"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.875rem', background: 'white', cursor: 'pointer' }}
            className="hover-bg-gray"
          >
            {showSuggestions ? 'Hide' : 'Show'} Suggestions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 p-6">
        {/* Main Note Content */}
        <div className={showTranscript ? 'col-span-8' : 'col-span-12'}>
          <div className="space-y-6">
            {/* Overall Confidence */}
            <div className={`p-4 rounded-lg border ${getConfidenceColor(note.overallConfidence)}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">Overall Confidence</span>
                <span className="text-2xl font-bold">{(note.overallConfidence * 100).toFixed(0)}%</span>
              </div>
              <p className="text-xs mt-1">
                {getConfidenceLabel(note.overallConfidence)} confidence - Review carefully
              </p>
            </div>

            {/* Note Sections */}
            {sections.map(({ key, label, field }) => {
              const confidence = note.sectionConfidence?.[key] || 0;
              const isEditing = editMode === key;

              return (
                <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className={`px-4 py-3 flex justify-between items-center ${getConfidenceColor(confidence)}`}>
                    <div className="flex items-center space-x-3">
                      <h3 className="font-semibold">{label}</h3>
                      <span className="text-xs px-2 py-1 rounded">
                        {(confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    {!isEditing && note.reviewStatus !== 'approved' && (
                      <button
                        onClick={() => handleEdit(key)}
                        className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="p-4 bg-white">
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          rows={8}
                        />
                        <input
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Reason for edit (optional)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                      <div className="whitespace-pre-wrap text-gray-800">
                        {note[field] || <span className="text-gray-400 italic">No content generated</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Differential Diagnoses Section */}
            {note.differentialDiagnoses && note.differentialDiagnoses.length > 0 && (
              <div className="border border-purple-200 rounded-lg overflow-hidden mt-6">
                <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center">
                      <span className="mr-2">🔬</span>
                      Differential Diagnoses (AI Recommendations)
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 italic">
                    For provider reference only - not shared with patient
                  </p>
                </div>
                <div className="p-4 bg-white space-y-3">
                  {note.differentialDiagnoses.map((diagnosis, idx) => {
                    const confidencePercent = diagnosis.confidence * 100;
                    const confidenceColorClass =
                      confidencePercent > 80 ? 'bg-green-500' :
                      confidencePercent >= 50 ? 'bg-yellow-500' :
                      'bg-red-500';

                    return (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-gray-900">{diagnosis.condition}</h4>
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                            {diagnosis.icd10Code}
                          </span>
                        </div>

                        {/* Confidence Bar */}
                        <div className="mb-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-gray-600">Confidence</span>
                            <span className="text-xs font-bold text-gray-900">{confidencePercent.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${confidenceColorClass}`}
                              style={{ width: `${confidencePercent}%` }}
                            />
                          </div>
                        </div>

                        <p className="text-sm text-gray-700">{diagnosis.reasoning}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommended Tests Section */}
            {note.recommendedTests && note.recommendedTests.length > 0 && (
              <div className="border border-purple-200 rounded-lg overflow-hidden mt-6">
                <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center">
                      <span className="mr-2">🧪</span>
                      Recommended Tests
                    </h3>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 italic">
                    For provider reference only - not shared with patient
                  </p>
                </div>
                <div className="p-4 bg-white space-y-3">
                  {note.recommendedTests.map((test, idx) => {
                    const urgencyConfig = {
                      routine: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Routine' },
                      soon: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Soon' },
                      urgent: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' }
                    };
                    const config = urgencyConfig[test.urgency];

                    return (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-gray-900">{test.testName}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 ${config.bg} ${config.text} text-xs font-medium rounded`}>
                              {config.label}
                            </span>
                            {test.cptCode && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                {test.cptCode}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-sm text-gray-700">{test.rationale}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {note.reviewStatus === 'pending' && (
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  onClick={() => handleReview('approve')}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300"
                >
                  Approve Note
                </button>
                <button
                  onClick={() => handleReview('request_regeneration')}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={saving}
                  className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-300"
                >
                  Reject
                </button>
              </div>
            )}

            {note.reviewStatus === 'approved' && note.encounterId && (
              <button
                onClick={handleApplyToEncounter}
                disabled={saving}
                className="w-full px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
              >
                Apply to Encounter
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {showTranscript && (
          <div className="col-span-4 space-y-4">
            {/* Transcript */}
            {transcript && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Transcript</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto text-sm">
                  {transcript.transcriptSegments.map((segment, idx) => (
                    <div key={idx} className={`p-2 rounded ${
                      segment.speaker === 'speaker_0' ? 'bg-blue-50' : 'bg-green-50'
                    }`}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium">
                          {segment.speaker === 'speaker_0' ? 'Doctor' : 'Patient'}
                        </span>
                        <span>{Math.floor(segment.start)}s</span>
                      </div>
                      <p className="text-gray-800">{segment.text}</p>
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
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Suggested ICD-10 Codes</h4>
                    <div className="space-y-2">
                      {note.suggestedIcd10Codes.map((code, idx) => (
                        <div key={idx} className="flex justify-between items-start text-sm">
                          <div>
                            <span className="font-medium text-purple-600">{code.code}</span>
                            <p className="text-gray-600 text-xs">{code.description}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${getConfidenceColor(code.confidence)}`}>
                            {(code.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CPT Codes */}
                {note.suggestedCptCodes && note.suggestedCptCodes.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Suggested CPT Codes</h4>
                    <div className="space-y-2">
                      {note.suggestedCptCodes.map((code, idx) => (
                        <div key={idx} className="flex justify-between items-start text-sm">
                          <div>
                            <span className="font-medium text-purple-600">{code.code}</span>
                            <p className="text-gray-600 text-xs">{code.description}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${getConfidenceColor(code.confidence)}`}>
                            {(code.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Medications */}
                {note.mentionedMedications && note.mentionedMedications.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Mentioned Medications</h4>
                    <div className="space-y-2">
                      {note.mentionedMedications.map((med, idx) => (
                        <div key={idx} className="text-sm">
                          <div className="font-medium text-gray-800">{med.name}</div>
                          <div className="text-gray-600 text-xs">{med.dosage} - {med.frequency}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Tasks */}
                {note.followUpTasks && note.followUpTasks.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Follow-up Tasks</h4>
                    <div className="space-y-2">
                      {note.followUpTasks.map((task, idx) => (
                        <div key={idx} className="text-sm">
                          <div className="flex items-start space-x-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              task.priority === 'high' ? 'bg-red-100 text-red-800' :
                              task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {task.priority}
                            </span>
                            <p className="text-gray-800 flex-1">{task.task}</p>
                          </div>
                          {task.dueDate && (
                            <p className="text-gray-500 text-xs mt-1 ml-2">Due: {task.dueDate}</p>
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
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Edit History</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
                  {edits.map((edit) => (
                    <div key={edit.id} className="border-l-2 border-purple-300 pl-2 pb-2">
                      <div className="font-medium text-gray-800">{edit.section.replace(/_/g, ' ')}</div>
                      <div className="text-gray-600">{edit.changeType}</div>
                      {edit.editReason && (
                        <div className="text-gray-500 italic">Reason: {edit.editReason}</div>
                      )}
                      <div className="text-gray-400">{new Date(edit.createdAt).toLocaleString()}</div>
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
