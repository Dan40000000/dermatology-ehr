/**
 * AmbientRecorder Component
 *
 * Real-time audio recording widget for ambient clinical documentation
 * Features:
 * - Audio recording with MediaRecorder API
 * - Real-time duration tracking
 * - Consent workflow
 * - Auto-upload and transcription
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { AudioVisualizer } from './AudioVisualizer';
import { createSilenceMonitor, type SilenceMonitor } from '../utils/audioMonitor';
import { ENABLE_LIVE_DRAFT } from '../utils/featureFlags';
import {
  startAmbientRecording,
  stopAmbientRecording,
  uploadAmbientRecording,
  type AmbientRecording
} from '../api';

interface AmbientRecorderProps {
  encounterId?: string;
  patientId: string;
  providerId: string;
  patientName: string;
  onRecordingComplete?: (recording: AmbientRecording) => void;
  compact?: boolean;
}

export function AmbientRecorder({
  encounterId,
  patientId,
  providerId,
  patientName,
  onRecordingComplete,
  compact = false
}: AmbientRecorderProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const { emit, on, off, isConnected } = useWebSocketContext();

  const [recordingState, setRecordingState] = useState<'idle' | 'consent' | 'recording' | 'stopped' | 'uploading'>('idle');
  const [consentObtained, setConsentObtained] = useState(false);
  const [consentMethod, setConsentMethod] = useState<'verbal' | 'written' | 'electronic'>('verbal');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [promptReason, setPromptReason] = useState<'duration' | 'silence' | null>(null);
  const [durationPrompted, setDurationPrompted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const silenceMonitorRef = useRef<SilenceMonitor | null>(null);

  const MAX_RECORDING_SECONDS = 30 * 60;
  const SILENCE_PROMPT_SECONDS = 5 * 60;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const requestConsent = () => {
    setRecordingState('consent');
  };

  const handleConsentConfirm = async () => {
    if (!consentObtained) {
      showError('Please confirm patient consent before recording');
      return;
    }

    try {
      // Start recording session on server
      const result = await startAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        {
          encounterId,
          patientId,
          providerId,
          consentObtained: true,
          consentMethod
        }
      );

      setRecordingId(result.recordingId);
      chunkIndexRef.current = 0;
      setLiveTranscript([]);
      setLiveStatus(ENABLE_LIVE_DRAFT && isConnected ? 'connecting' : 'idle');
      setLiveError(null);

      if (ENABLE_LIVE_DRAFT && isConnected) {
        emit('ambient:join', { recordingId: result.recordingId });
      }
      await startRecording(result.recordingId);
    } catch (error: any) {
      showError(error.message || 'Failed to start recording');
      setRecordingState('idle');
    }
  };

  const startRecording = async (activeRecordingId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (silenceMonitorRef.current) {
        silenceMonitorRef.current.stop();
      }
      silenceMonitorRef.current = createSilenceMonitor(stream, {
        silenceMs: SILENCE_PROMPT_SECONDS * 1000,
        onSilence: () => {
          if (!showContinuePrompt) {
            setPromptReason('silence');
            setShowContinuePrompt(true);
          }
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          if (ENABLE_LIVE_DRAFT && isConnected && activeRecordingId) {
            const currentChunk = chunkIndexRef.current++;
            event.data.arrayBuffer().then((buffer) => {
              emit('ambient:audio-chunk', {
                recordingId: activeRecordingId,
                chunkIndex: currentChunk,
                mimeType: event.data.type,
                data: buffer
              });
            }).catch(() => {
              // Ignore chunk streaming errors to avoid disrupting recording
            });
          }
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        setRecordingState('stopped');
      };

      mediaRecorder.start(1000); // Collect data every second
      setRecordingState('recording');
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      showSuccess('Recording started');
    } catch (error: any) {
      showError('Failed to access microphone: ' + error.message);
      setRecordingState('idle');
    }
  };

  const stopRecording = () => {
    const isActive = mediaRecorderRef.current?.state === 'recording';
    const safeDurationSeconds = Math.max(1, Math.round(Number(duration) || 0));

    if (isActive && recordingId && session) {
      void stopAmbientRecording(
        session.tenantId,
        session.accessToken,
        recordingId,
        safeDurationSeconds
      ).catch(() => {
        // Preserve local stop/upload flow when stop endpoint is unavailable
      });
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (silenceMonitorRef.current) {
      silenceMonitorRef.current.stop();
      silenceMonitorRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (ENABLE_LIVE_DRAFT && recordingId) {
      emit('ambient:leave', { recordingId });
    }
    setLiveStatus('idle');
    setLiveError(null);
  };

  const handleUpload = async () => {
    if (!audioBlob || !recordingId) {
      showError('No recording to upload');
      return;
    }

    setRecordingState('uploading');

    try {
      const audioFile = new File([audioBlob], `recording-${recordingId}.webm`, { type: 'audio/webm' });
      const safeDurationSeconds = Math.max(1, Math.round(Number(duration) || 0));

      await uploadAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        recordingId,
        audioFile,
        safeDurationSeconds
      );

      showSuccess('Recording uploaded successfully. Transcription started automatically.');

      if (onRecordingComplete) {
        onRecordingComplete({
          id: recordingId,
          patientId,
          providerId,
          encounterId,
          status: 'completed',
          durationSeconds: duration,
          consentObtained: true,
          consentMethod,
          startedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }

      // Reset
      reset();
    } catch (error: any) {
      showError(error.message || 'Failed to upload recording');
      setRecordingState('stopped');
    }
  };

  const reset = () => {
    setRecordingState('idle');
    setConsentObtained(false);
    setRecordingId(null);
    setDuration(0);
    setAudioBlob(null);
    audioChunksRef.current = [];
    setLiveTranscript([]);
    setLiveStatus('idle');
    setLiveError(null);
    setShowContinuePrompt(false);
    setPromptReason(null);
    setDurationPrompted(false);
  };

  useEffect(() => {
    if (recordingState !== 'recording' || durationPrompted) return;
    if (duration >= MAX_RECORDING_SECONDS && !showContinuePrompt) {
      setPromptReason('duration');
      setShowContinuePrompt(true);
      setDurationPrompted(true);
    }
  }, [duration, recordingState, durationPrompted, showContinuePrompt]);

  useEffect(() => {
    if (!ENABLE_LIVE_DRAFT) return;
    if (!recordingId || recordingState !== 'recording' || !isConnected) return;

    emit('ambient:join', { recordingId });
    setLiveStatus('connecting');

    const handleTranscript = (data: { recordingId: string; text: string }) => {
      if (data.recordingId !== recordingId || !data.text) return;
      setLiveStatus('streaming');
      setLiveError(null);
      setLiveTranscript((prev) => {
        const next = [...prev, data.text.trim()].filter(Boolean);
        return next.slice(-8);
      });
    };

    const handleJoined = (data: { recordingId: string }) => {
      if (data.recordingId !== recordingId) return;
      setLiveStatus('streaming');
      setLiveError(null);
    };

    const handleError = (data: { recordingId?: string; message: string }) => {
      if (data.recordingId && data.recordingId !== recordingId) return;
      setLiveStatus('error');
      setLiveError(data.message || 'Live transcription paused');
    };

    on('ambient:joined', handleJoined);
    on('ambient:transcript', handleTranscript);
    on('ambient:error', handleError);

    return () => {
      off('ambient:joined', handleJoined);
      off('ambient:transcript', handleTranscript);
      off('ambient:error', handleError);
    };
  }, [recordingId, recordingState, isConnected, emit, on, off]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const continuePrompt = showContinuePrompt ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          width: 'min(420px, 92vw)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
          border: '1px solid #e2e8f0'
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#0f172a' }}>
          Continue recording?
        </h3>
        <p style={{ fontSize: '14px', color: '#475569', marginBottom: '16px' }}>
          {promptReason === 'duration'
            ? 'You have been recording for 30 minutes. Do you want to keep recording?'
            : 'No speech detected for 5 minutes. Do you want to keep recording?'}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setShowContinuePrompt(false);
              setPromptReason(null);
              silenceMonitorRef.current?.resetTimer();
            }}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#f8fafc',
              color: '#1e293b',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Continue
          </button>
          <button
            onClick={() => {
              setShowContinuePrompt(false);
              setPromptReason(null);
              stopRecording();
            }}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#ef4444',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Stop & Upload
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    // Compact view for embedding in encounter page
    return (
      <div className="bg-white border border-purple-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`h-3 w-3 rounded-full ${recordingState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-sm font-medium text-gray-700">
              {recordingState === 'recording' ? `Recording ${formatDuration(duration)}` : 'Ambient Scribe'}
            </span>
          </div>
          <div className="flex space-x-2">
            {recordingState === 'idle' && (
              <button
                onClick={requestConsent}
                className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
              >
                Start Recording
              </button>
            )}
            {recordingState === 'recording' && (
              <button
                onClick={stopRecording}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
              >
                Stop
              </button>
            )}
            {recordingState === 'stopped' && (
              <>
                <button
                  onClick={handleUpload}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  Upload & Transcribe
                </button>
                <button
                  onClick={reset}
                  className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Consent Modal */}
        {recordingState === 'consent' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Consent Required</h3>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Recording conversation with <strong>{patientName}</strong>
                </p>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consentObtained}
                    onChange={(e) => setConsentObtained(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="consent" className="text-sm text-gray-700">
                    Patient has provided informed consent for audio recording
                  </label>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Consent Method</label>
                  <select
                    value={consentMethod}
                    onChange={(e) => setConsentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="verbal">Verbal Consent</option>
                    <option value="written">Written Consent</option>
                    <option value="electronic">Electronic Consent</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleConsentConfirm}
                  disabled={!consentObtained}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Start Recording
                </button>
                <button
                  onClick={() => setRecordingState('idle')}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full view for standalone page
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Ambient AI Medical Scribe</h2>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-600">Patient: <span className="font-medium">{patientName}</span></p>
            {encounterId && <p className="text-xs text-gray-500">Encounter ID: {encounterId}</p>}
          </div>
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            recordingState === 'recording' ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className={`h-4 w-4 rounded-full ${recordingState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-2xl font-mono font-semibold">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Audio Visualizer */}
        {recordingState === 'recording' && (
          <div className="mb-4 flex justify-center">
            <AudioVisualizer
              stream={streamRef.current}
              isRecording={recordingState === 'recording'}
              width={600}
              height={80}
            />
          </div>
        )}

        {ENABLE_LIVE_DRAFT && (recordingState === 'recording' || liveTranscript.length > 0) && (
          <div className="mb-4 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Live Draft</div>
              <div className={`text-xs ${liveStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                {liveStatus === 'streaming' ? 'Streaming' : liveStatus === 'connecting' ? 'Connecting…' : liveStatus === 'error' ? 'Paused' : 'Idle'}
              </div>
            </div>
            {liveTranscript.length === 0 ? (
              <div className={`text-sm ${liveStatus === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
                {liveStatus === 'error' && liveError ? liveError : 'Listening for speech… this draft updates in real time.'}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-800">
                {liveTranscript.map((line, idx) => (
                  <div key={`${idx}-${line.slice(0, 12)}`}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex space-x-4">
          {recordingState === 'idle' && (
            <button
              onClick={requestConsent}
              className="flex-1 px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition"
            >
              Start Recording
            </button>
          )}

          {recordingState === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex-1 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
            >
              Stop Recording
            </button>
          )}

          {recordingState === 'stopped' && (
            <>
              <button
                onClick={handleUpload}
                className="flex-1 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition"
              >
                Upload & Transcribe
              </button>
              <button
                onClick={reset}
                className="px-6 py-3 bg-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-400 transition"
              >
                Discard
              </button>
            </>
          )}

          {recordingState === 'uploading' && (
            <div className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg text-center">
              Uploading...
            </div>
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">How it works:</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Obtain patient consent for audio recording</li>
          <li>Start recording during the patient visit</li>
          <li>AI automatically transcribes the conversation with speaker diarization</li>
          <li>Clinical note is auto-generated from the transcript</li>
          <li>Review and edit the AI-generated note before signing</li>
        </ol>
      </div>

      {/* Consent Modal */}
        {recordingState === 'consent' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-lg w-full mx-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Patient Consent Required</h3>

            <div className="mb-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>HIPAA Compliance:</strong> Before recording, you must obtain and document patient
                  consent to record the clinical conversation. All recordings are encrypted and PHI is automatically masked.
                </p>
              </div>

              <p className="text-gray-700 mb-4">
                Recording conversation with: <strong className="text-purple-600">{patientName}</strong>
              </p>

              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-start mb-3">
                  <input
                    type="checkbox"
                    id="consent-full"
                    checked={consentObtained}
                    onChange={(e) => setConsentObtained(e.target.checked)}
                    className="mt-1 mr-3 h-5 w-5"
                  />
                  <label htmlFor="consent-full" className="text-sm text-gray-700 cursor-pointer">
                    I have informed the patient that this visit will be recorded for clinical documentation purposes,
                    and the patient has provided informed consent to proceed with the recording.
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Consent Method</label>
                <select
                  value={consentMethod}
                  onChange={(e) => setConsentMethod(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="verbal">Verbal Consent (documented in chart)</option>
                  <option value="written">Written Consent (signed form)</option>
                  <option value="electronic">Electronic Consent (patient portal)</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleConsentConfirm}
                disabled={!consentObtained}
                className="flex-1 px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                Confirm & Start Recording
              </button>
              <button
                onClick={() => setRecordingState('idle')}
                className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
            </div>
          </div>
        )}

        {continuePrompt}
      </div>
    );
  }
