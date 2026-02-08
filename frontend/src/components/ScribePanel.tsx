/**
 * ScribePanel Component
 *
 * Premium, minimal AI Scribe interface for patient encounters
 * Reusable component that wraps recording functionality
 */

import { useState, useRef, useEffect, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface ScribePanelProps {
  patientId: string;
  patientName: string;
  encounterId?: string;
  providerId?: string;
  autoStart?: boolean;
  highlighted?: boolean;
  showScheduleBadge?: boolean;
  onRecordingComplete?: (recordingId: string) => void;
}

export const ScribePanel = forwardRef<HTMLDivElement, ScribePanelProps>(({
  patientId,
  patientName,
  encounterId,
  providerId: propProviderId,
  autoStart = false,
  highlighted = false,
  showScheduleBadge = false,
  onRecordingComplete
}, ref) => {
  const navigate = useNavigate();
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

      const result = await startAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        {
          encounterId,
          patientId,
          providerId: effectiveProviderId,
          consentObtained: true,
          consentMethod: 'verbal'
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
          if (ENABLE_LIVE_DRAFT && isConnected && result.recordingId) {
            const currentChunk = chunkIndexRef.current++;
            event.data.arrayBuffer().then((buffer) => {
              emit('ambient:audio-chunk', {
                recordingId: result.recordingId,
                chunkIndex: currentChunk,
                mimeType: event.data.type,
                data: buffer
              });
            }).catch(() => {});
          }
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleUpload(audioBlob);
      };

      mediaRecorder.start(1000);
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

      showSuccess('Recording uploaded. Generating notes...');

      if (onRecordingComplete) {
        onRecordingComplete(activeRecordingId);
      } else {
        navigate(`/ambient-scribe?recordingId=${activeRecordingId}&auto=1`);
      }

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

  // Determine panel state classes
  const getPanelClasses = () => {
    const classes = ['scribe-panel'];
    if (highlighted) classes.push('scribe-panel--highlighted');
    if (isRecording) classes.push('scribe-panel--recording');
    if (isUploading) classes.push('scribe-panel--uploading');
    return classes.join(' ');
  };

  // Determine status
  const getStatusInfo = () => {
    if (isUploading) return { label: 'Uploading', className: 'scribe-panel__status--uploading' };
    if (isRecording) return { label: 'Recording', className: 'scribe-panel__status--recording' };
    if (liveStatus === 'streaming') return { label: 'Streaming', className: 'scribe-panel__status--streaming' };
    return { label: 'Ready', className: 'scribe-panel__status--idle' };
  };

  const statusInfo = getStatusInfo();

  return (
    <>
      <div ref={ref} className={getPanelClasses()}>
        {/* Header */}
        <div className="scribe-panel__header">
          <div className="scribe-panel__header-left">
            <div className="scribe-panel__icon">
              {isUploading ? '⏳' : isRecording ? '🔴' : '🎙️'}
            </div>
            <div className="scribe-panel__title-group">
              <div className="scribe-panel__title">AI Scribe</div>
              <div className="scribe-panel__subtitle">{patientName}</div>
            </div>
          </div>

          <div className="scribe-panel__header-right">
            <div className={`scribe-panel__status ${statusInfo.className}`}>
              <span className="scribe-panel__status-dot" />
              {statusInfo.label}
            </div>
            {isRecording && (
              <div className="scribe-panel__timer">{formatDuration(duration)}</div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="scribe-panel__body">
          {/* CTA Button */}
          <button
            onClick={handleButtonClick}
            disabled={isUploading}
            className={`scribe-panel__cta ${
              isUploading
                ? 'scribe-panel__cta--uploading'
                : isRecording
                ? 'scribe-panel__cta--stop'
                : 'scribe-panel__cta--start'
            }`}
          >
            {isUploading ? (
              <>
                <span className="scribe-panel__spinner" />
                <span>Processing...</span>
              </>
            ) : isRecording ? (
              <>
                <span className="scribe-panel__cta-icon">⏹️</span>
                <span>Stop & Generate Notes</span>
              </>
            ) : (
              <>
                <span className="scribe-panel__cta-icon">🎙️</span>
                <span>Start Recording</span>
              </>
            )}
          </button>

          {/* Live Draft */}
          {ENABLE_LIVE_DRAFT && (isRecording || liveTranscript.length > 0) && (
            <div className="scribe-panel__draft">
              <div className="scribe-panel__draft-header">
                <span className="scribe-panel__draft-title">Live Draft</span>
                <span className={`scribe-panel__draft-status ${
                  liveStatus === 'streaming'
                    ? 'scribe-panel__draft-status--streaming'
                    : liveStatus === 'error'
                    ? 'scribe-panel__draft-status--error'
                    : ''
                }`}>
                  {liveStatus === 'streaming'
                    ? 'Streaming'
                    : liveStatus === 'connecting'
                    ? 'Connecting...'
                    : liveStatus === 'error'
                    ? 'Paused'
                    : 'Idle'}
                </span>
              </div>
              <div className="scribe-panel__draft-content">
                {liveTranscript.length === 0 ? (
                  <span className="scribe-panel__draft-placeholder">
                    {liveStatus === 'error' && liveError
                      ? liveError
                      : 'Listening for speech... draft updates in real time.'}
                  </span>
                ) : (
                  liveTranscript.map((line, idx) => (
                    <div key={`${idx}-${line.slice(0, 12)}`} className="scribe-panel__draft-line">
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Hint text when idle */}
          {!isRecording && !isUploading && (
            <div className="scribe-panel__hint">
              Click to start recording your appointment. The AI will transcribe and generate clinical notes automatically.
              {showScheduleBadge && (
                <div className="scribe-panel__badge">
                  <span>✓</span>
                  Ready from schedule
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Continue Prompt Modal */}
      {showContinuePrompt && (
        <div className="scribe-panel__modal-overlay">
          <div className="scribe-panel__modal">
            <h3 className="scribe-panel__modal-title">Continue recording?</h3>
            <p className="scribe-panel__modal-text">
              {promptReason === 'duration'
                ? 'You have been recording for 30 minutes. Do you want to keep recording?'
                : 'No speech detected for 5 minutes. Do you want to keep recording?'}
            </p>
            <div className="scribe-panel__modal-actions">
              <button
                onClick={() => {
                  setShowContinuePrompt(false);
                  setPromptReason(null);
                  silenceMonitorRef.current?.resetTimer();
                }}
                className="scribe-panel__modal-btn scribe-panel__modal-btn--secondary"
              >
                Continue
              </button>
              <button
                onClick={() => {
                  setShowContinuePrompt(false);
                  setPromptReason(null);
                  stopRecording();
                }}
                className="scribe-panel__modal-btn scribe-panel__modal-btn--danger"
              >
                Stop & Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ScribePanel.displayName = 'ScribePanel';
