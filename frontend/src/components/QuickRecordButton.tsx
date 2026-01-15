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
  onRecordingComplete?: (recordingId: string) => void;
}

export function QuickRecordButton({
  patientId,
  patientName,
  encounterId,
  providerId: propProviderId,
  onRecordingComplete
}: QuickRecordButtonProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    const effectiveProviderId = propProviderId || defaultProviderId;

    if (!effectiveProviderId) {
      showError('No provider available. Please try again in a moment.');
      return;
    }

    try {
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

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
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
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const handleUpload = async (audioBlob: Blob) => {
    if (!recordingId) {
      showError('No recording session found');
      return;
    }

    setIsUploading(true);

    try {
      const audioFile = new File([audioBlob], `recording-${recordingId}.webm`, { type: 'audio/webm' });

      await uploadAmbientRecording(
        session!.tenantId,
        session!.accessToken,
        recordingId,
        audioFile,
        duration
      );

      showSuccess('Recording uploaded successfully. Transcription started.');

      if (onRecordingComplete) {
        onRecordingComplete(recordingId);
      }

      // Reset state
      setRecordingId(null);
      setDuration(0);
      audioChunksRef.current = [];
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
    </>
  );
}
