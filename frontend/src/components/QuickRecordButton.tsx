/**
 * QuickRecordButton Component
 *
 * Simplified, prominent recording button for patient detail pages
 * Features:
 * - One-click recording (assumes verbal consent)
 * - Large, prominent UI with pulsing animation
 * - Real-time duration display
 * - Auto-upload on stop
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useRecording } from '../contexts/RecordingContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { createSilenceMonitor, type SilenceMonitor } from '../utils/audioMonitor';
import { ENABLE_LIVE_DRAFT } from '../utils/featureFlags';
import {
  startAmbientRecording,
  uploadAmbientRecording,
  fetchProviders,
} from '../api';

interface QuickRecordButtonProps {
  patientId: string;
  patientName: string;
  encounterId?: string;
  providerId?: string;
  autoStart?: boolean;
  onRecordingComplete?: (recordingId: string) => void;
}

export function QuickRecordButton({
  patientId,
  patientName,
  encounterId,
  providerId: propProviderId,
  autoStart = false,
  onRecordingComplete
}: QuickRecordButtonProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const { emit, on, off, isConnected } = useWebSocketContext();
  const {
    isRecording,
    recordingId,
    duration,
    setIsRecording,
    setRecordingId,
    setDuration,
    setPatientId,
    setPatientName,
    resetRecording,
  } = useRecording();

  const [isUploading, setIsUploading] = useState(false);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [promptReason, setPromptReason] = useState<'duration' | 'silence' | null>(null);
  const [durationPrompted, setDurationPrompted] = useState(false);
  const autoStartTriggeredRef = useRef(false);
  const recordingIdRef = useRef<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);
  const silenceMonitorRef = useRef<SilenceMonitor | null>(null);

  const MAX_RECORDING_SECONDS = 30 * 60;
  const SILENCE_PROMPT_SECONDS = 5 * 60;

  // Fetch default provider on mount if not provided
  useEffect(() => {
    if (!propProviderId && session) {
      fetchProviders(session.tenantId, session.accessToken)
        .then(res => {
          if (res.providers && res.providers.length > 0) {
            setDefaultProviderId(res.providers[0].id);
          }
        })
        .catch(err => console.error('Failed to fetch providers:', err));
    }
  }, [propProviderId, session]);

  const effectiveProviderId = propProviderId || defaultProviderId;

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

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (!effectiveProviderId) {
      showError('No provider available. Please try again in a moment.');
      return;
    }

    try {
      setPatientId(patientId);
      setPatientName(patientName);

      // Create recording session on server first
      const result = await startAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        {
          encounterId,
          patientId,
          providerId: effectiveProviderId,
          consentObtained: true,
          consentMethod: 'verbal' // Assume verbal consent
        }
      );

      setRecordingId(result.recordingId);
      recordingIdRef.current = result.recordingId;
      chunkIndexRef.current = 0;
      setLiveTranscript([]);
      setLiveStatus(ENABLE_LIVE_DRAFT && isConnected ? 'connecting' : 'idle');
      setLiveError(null);

      if (ENABLE_LIVE_DRAFT && isConnected) {
        emit('ambient:join', { recordingId: result.recordingId });
      }

      // Get microphone access
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

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          if (ENABLE_LIVE_DRAFT && isConnected && result.recordingId) {
            const currentChunk = chunkIndexRef.current++;
            event.data.arrayBuffer().then((buffer) => {
              emit('ambient:audio-chunk', {
                recordingId: result.recordingId,
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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleUpload(audioBlob);
      };

      // Start recording and timer
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      showSuccess(`Recording started for ${patientName}`);
    } catch (error: any) {
      showError('Failed to start recording: ' + error.message);
      resetRecording();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (!autoStart) return;
    if (autoStartTriggeredRef.current) return;
    if (!session || !effectiveProviderId) return;
    if (isRecording || isUploading) return;
    autoStartTriggeredRef.current = true;
    startRecording();
  }, [autoStart, session, effectiveProviderId, isRecording, isUploading]);

  const stopRecording = () => {
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
    setIsRecording(false);
    if (ENABLE_LIVE_DRAFT && recordingId) {
      emit('ambient:leave', { recordingId });
    }
    setLiveStatus('idle');
    setLiveError(null);
  };

  const handleUpload = async (audioBlob: Blob) => {
    const activeRecordingId = recordingIdRef.current || recordingId;
    if (!activeRecordingId) {
      showError('No recording session found');
      return;
    }

    setIsUploading(true);

    try {
      const audioFile = new File([audioBlob], `recording-${activeRecordingId}.webm`, { type: 'audio/webm' });
      const safeDurationSeconds = Math.max(1, Math.round(Number(duration) || 0));

      await uploadAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        activeRecordingId,
        audioFile,
        safeDurationSeconds
      );

      showSuccess('Recording uploaded successfully. Transcription started.');

      if (onRecordingComplete) {
        onRecordingComplete(activeRecordingId);
      }

      // Reset state
      resetRecording();
      recordingIdRef.current = null;
      audioChunksRef.current = [];
      setLiveTranscript([]);
      setLiveStatus('idle');
      setLiveError(null);
      setShowContinuePrompt(false);
      setPromptReason(null);
      setDurationPrompted(false);
    } catch (error: any) {
      showError(error.message || 'Failed to upload recording');
    } finally {
      setIsUploading(false);
    }
  };

  const handleButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    if (!isRecording || durationPrompted) return;
    if (duration >= MAX_RECORDING_SECONDS && !showContinuePrompt) {
      setPromptReason('duration');
      setShowContinuePrompt(true);
      setDurationPrompted(true);
    }
  }, [duration, isRecording, durationPrompted, showContinuePrompt]);

  useEffect(() => {
    if (!ENABLE_LIVE_DRAFT) return;
    if (!recordingId || !isRecording || !isConnected) return;

    emit('ambient:join', { recordingId });
    setLiveStatus('connecting');

    const handleTranscript = (data: {
      recordingId: string;
      text: string;
      receivedAt: string;
    }) => {
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
  }, [recordingId, isRecording, isConnected, emit, on, off]);

  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  // Inline styles for animations
  const pulseKeyframes = `
    @keyframes pulse-dot {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }
  `;

  const buttonStyle: React.CSSProperties = {
    minHeight: '60px',
    width: '100%',
    padding: '16px 24px',
    fontSize: '18px',
    fontWeight: '600',
    borderRadius: '12px',
    border: 'none',
    cursor: isUploading ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    transition: 'all 0.2s ease',
    boxShadow: isRecording
      ? '0 4px 12px rgba(239, 68, 68, 0.4)'
      : '0 4px 12px rgba(34, 197, 94, 0.3)',
    backgroundColor: isUploading
      ? '#9ca3af'
      : isRecording
      ? '#ef4444'
      : '#22c55e',
    color: 'white',
    position: 'relative',
    overflow: 'hidden'
  };

  const dotStyle: React.CSSProperties = {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'white',
    animation: isRecording ? 'pulse-dot 1.5s ease-in-out infinite' : 'none'
  };

  const timerStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '20px',
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 'auto'
  };

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={handleButtonClick}
          disabled={isUploading}
          style={buttonStyle}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = isRecording
                ? '0 6px 16px rgba(239, 68, 68, 0.5)'
                : '0 6px 16px rgba(34, 197, 94, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = isRecording
              ? '0 4px 12px rgba(239, 68, 68, 0.4)'
              : '0 4px 12px rgba(34, 197, 94, 0.3)';
          }}
        >
          {isUploading ? (
            <>
              <span>Uploading...</span>
            </>
          ) : isRecording ? (
            <>
              <span style={{ fontSize: '24px' }}>⏹️</span>
              <span>Stop Recording</span>
              <div style={dotStyle} />
              <span style={timerStyle}>{formatDuration(duration)}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '24px' }}>🎙️</span>
              <span>Start Recording</span>
            </>
          )}
        </button>

        {ENABLE_LIVE_DRAFT && (isRecording || liveTranscript.length > 0) && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 16px',
              color: '#0f172a'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Live Draft
              </div>
              <div style={{ fontSize: '12px', color: liveStatus === 'error' ? '#dc2626' : '#64748b' }}>
                {liveStatus === 'streaming' ? 'Streaming' : liveStatus === 'connecting' ? 'Connecting…' : liveStatus === 'error' ? 'Paused' : 'Idle'}
              </div>
            </div>
            {liveTranscript.length === 0 ? (
              <div style={{ fontSize: '14px', color: liveStatus === 'error' ? '#dc2626' : '#64748b' }}>
                {liveStatus === 'error' && liveError ? liveError : 'Listening for speech… this draft updates in real time.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {liveTranscript.map((line, idx) => (
                  <div key={`${idx}-${line.slice(0, 12)}`} style={{ fontSize: '14px', lineHeight: 1.4 }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showContinuePrompt && (
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
      )}
    </>
  );
}
