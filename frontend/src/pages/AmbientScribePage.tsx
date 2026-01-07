/**
 * Ambient Scribe Management Page
 *
 * Dashboard for managing ambient AI medical scribe recordings and generated notes
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { AmbientRecorder } from '../components/AmbientRecorder';
import { NoteReviewEditor } from '../components/NoteReviewEditor';
import {
  fetchAmbientRecordings,
  fetchRecordingTranscript,
  generateAmbientNote,
  fetchAmbientNote,
  deleteAmbientRecording,
  type AmbientRecording,
  type AmbientTranscript,
  type AmbientGeneratedNote
} from '../api';

type View = 'dashboard' | 'new-recording' | 'view-recording' | 'review-note';

export default function AmbientScribePage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<View>('dashboard');
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<AmbientRecording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<AmbientRecording | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    // Handle deep linking
    const noteId = searchParams.get('noteId');
    const recordingId = searchParams.get('recordingId');

    if (noteId) {
      setSelectedNoteId(noteId);
      setView('review-note');
    } else if (recordingId) {
      loadRecordingDetails(recordingId);
    } else {
      loadRecordings();
    }
  }, [searchParams]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const filters: any = { limit: 100 };
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      const data = await fetchAmbientRecordings(session!.tenantId, session!.accessToken, filters);
      setRecordings(data.recordings);
    } catch (error: any) {
      showError(error.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const loadRecordingDetails = async (recordingId: string) => {
    const recording = recordings.find(r => r.id === recordingId);
    if (recording) {
      setSelectedRecording(recording);
      setView('view-recording');
    }
  };

  const handleViewRecording = (recording: AmbientRecording) => {
    setSelectedRecording(recording);
    setView('view-recording');
    setSearchParams({ recordingId: recording.id });
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm('Are you sure you want to delete this recording? This cannot be undone.')) {
      return;
    }

    try {
      await deleteAmbientRecording(session!.tenantId, session!.accessToken, recordingId);
      showSuccess('Recording deleted successfully');
      setRecordings(recordings.filter(r => r.id !== recordingId));
      if (selectedRecording?.id === recordingId) {
        setView('dashboard');
        setSearchParams({});
      }
    } catch (error: any) {
      showError(error.message || 'Failed to delete recording');
    }
  };

  const handleRecordingComplete = () => {
    showSuccess('Recording uploaded successfully');
    setView('dashboard');
    setSearchParams({});
    loadRecordings();
  };

  const renderDashboard = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827' }}>Ambient AI Medical Scribe</h1>
          <p style={{ color: '#4b5563', marginTop: '0.25rem' }}>Automated clinical documentation from patient conversations</p>
        </div>
        <button
          onClick={() => setView('new-recording')}
          style={{ padding: '0.75rem 1.5rem', background: '#7c3aed', color: 'white', fontWeight: 500, borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
          className="hover-bg-purple"
        >
          New Recording
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>Total Recordings</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{recordings.length}</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>Completed</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
            {recordings.filter(r => r.status === 'completed').length}
          </div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>In Progress</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04' }}>
            {recordings.filter(r => r.status === 'recording').length}
          </div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>Total Duration</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {Math.floor(recordings.reduce((sum, r) => sum + r.durationSeconds, 0) / 60)} min
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
            >
              <option value="all">All</option>
              <option value="recording">Recording</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={loadRecordings}
              style={{ padding: '0.5rem 1rem', background: '#e5e7eb', color: '#374151', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
              className="hover-bg-gray"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Recordings List */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb' }}>
            <tr>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Patient</th>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Provider</th>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Duration</th>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Created</th>
              <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody style={{ background: 'white' }}>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading recordings...</td>
              </tr>
            ) : recordings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No recordings found. Start your first recording to begin.
                </td>
              </tr>
            ) : (
              recordings.map((recording) => (
                <tr key={recording.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{recording.patientName || 'Unknown'}</div>
                    {recording.encounterId && (
                      <div className="text-xs text-gray-500">Encounter: {recording.encounterId.substring(0, 8)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {recording.providerName || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      recording.status === 'completed' ? 'bg-green-100 text-green-800' :
                      recording.status === 'recording' ? 'bg-yellow-100 text-yellow-800' :
                      recording.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {recording.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {Math.floor(recording.durationSeconds / 60)}:{String(recording.durationSeconds % 60).padStart(2, '0')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {new Date(recording.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleViewRecording(recording)}
                      className="text-purple-600 hover:text-purple-700 font-medium mr-3"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDeleteRecording(recording.id)}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderNewRecording = () => {
    // Simplified - in production, you'd have patient/provider selectors
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => {
            setView('dashboard');
            setSearchParams({});
          }}
          className="mb-4 text-purple-600 hover:text-purple-700 font-medium"
        >
          &larr; Back to Dashboard
        </button>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> For demo purposes, this page allows creating standalone recordings.
            In production, recordings would typically be initiated from within an encounter page.
          </p>
        </div>

        <AmbientRecorder
          patientId="demo-patient"
          providerId={session!.userId}
          patientName="Demo Patient"
          onRecordingComplete={handleRecordingComplete}
        />
      </div>
    );
  };

  const renderViewRecording = () => {
    if (!selectedRecording) return null;

    return (
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => {
            setView('dashboard');
            setSelectedRecording(null);
            setSearchParams({});
          }}
          className="mb-4 text-purple-600 hover:text-purple-700 font-medium"
        >
          &larr; Back to Dashboard
        </button>

        <RecordingDetails
          recording={selectedRecording}
          onGenerateNote={(noteId) => {
            setSelectedNoteId(noteId);
            setView('review-note');
            setSearchParams({ noteId });
          }}
        />
      </div>
    );
  };

  const renderReviewNote = () => {
    if (!selectedNoteId) return null;

    return (
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => {
            setView('dashboard');
            setSelectedNoteId(null);
            setSearchParams({});
          }}
          className="mb-4 text-purple-600 hover:text-purple-700 font-medium"
        >
          &larr; Back to Dashboard
        </button>

        <NoteReviewEditor
          noteId={selectedNoteId}
          onApproved={() => {
            showSuccess('Note approved successfully');
            setView('dashboard');
            setSelectedNoteId(null);
            setSearchParams({});
          }}
          onRejected={() => {
            setView('dashboard');
            setSelectedNoteId(null);
            setSearchParams({});
          }}
        />
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '1.5rem' }}>
      {view === 'dashboard' && renderDashboard()}
      {view === 'new-recording' && renderNewRecording()}
      {view === 'view-recording' && renderViewRecording()}
      {view === 'review-note' && renderReviewNote()}
    </div>
  );
}

// Recording Details Component
function RecordingDetails({
  recording,
  onGenerateNote
}: {
  recording: AmbientRecording;
  onGenerateNote: (noteId: string) => void;
}) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [transcript, setTranscript] = useState<AmbientTranscript | null>(null);
  const [generatedNote, setGeneratedNote] = useState<AmbientGeneratedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadTranscript();
  }, [recording.id]);

  const loadTranscript = async () => {
    try {
      setLoading(true);
      const data = await fetchRecordingTranscript(session!.tenantId, session!.accessToken, recording.id);
      setTranscript(data.transcript);

      // Check if note already exists
      if (data.transcript.encounterId) {
        // Could fetch existing notes here
      }
    } catch (error: any) {
      // Transcript might not exist yet
      console.error('No transcript found:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNote = async () => {
    if (!transcript) {
      showError('Transcript not available');
      return;
    }

    try {
      setGenerating(true);
      const result = await generateAmbientNote(session!.tenantId, session!.accessToken, transcript.id);
      showSuccess('Note generation started');

      // Poll for completion (simplified - in production use websockets or polling)
      setTimeout(async () => {
        const noteData = await fetchAmbientNote(session!.tenantId, session!.accessToken, result.noteId);
        setGeneratedNote(noteData.note);
        onGenerateNote(result.noteId);
      }, 3000);
    } catch (error: any) {
      showError(error.message || 'Failed to generate note');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Recording Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Recording Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Patient</div>
            <div className="font-medium text-gray-900">{recording.patientName}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Provider</div>
            <div className="font-medium text-gray-900">{recording.providerName}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Duration</div>
            <div className="font-medium text-gray-900">
              {Math.floor(recording.durationSeconds / 60)}:{String(recording.durationSeconds % 60).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Consent Method</div>
            <div className="font-medium text-gray-900">{recording.consentMethod || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Transcript */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading transcript...</p>
        </div>
      ) : transcript ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900">Transcript</h3>
            {!generatedNote && (
              <button
                onClick={handleGenerateNote}
                disabled={generating}
                className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-300"
              >
                {generating ? 'Generating...' : 'Generate Clinical Note'}
              </button>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {transcript.transcriptSegments.map((segment, idx) => (
              <div key={idx} className={`p-3 rounded-lg ${
                segment.speaker === 'speaker_0' ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm">
                    {segment.speaker === 'speaker_0' ? 'Doctor' : 'Patient'}
                  </span>
                  <span className="text-xs text-gray-500">{Math.floor(segment.start)}s</span>
                </div>
                <p className="text-gray-800">{segment.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">Transcription in progress or not yet started...</p>
        </div>
      )}
    </div>
  );
}
