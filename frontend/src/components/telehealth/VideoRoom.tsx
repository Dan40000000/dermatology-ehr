import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  reportQualityMetrics,
  startSessionRecording,
  stopSessionRecording,
  captureSessionPhoto,
  logSessionEvent,
  type TelehealthSession,
  type SessionRecording,
} from '../../api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import '../../styles/telehealth.css';

interface VideoRoomProps {
  session: TelehealthSession;
  onSessionEnd: () => void;
  onPhotoCapture?: (photoUrl: string) => void;
}

interface Annotation {
  type: 'arrow' | 'circle' | 'text' | 'freehand';
  points: { x: number; y: number }[];
  color: string;
  text?: string;
}

// Mock Video SDK - simulates Twilio Video or Agora
class MockVideoSDK {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  isPiPEnabled = false;
  isScreenSharing = false;
  connectionQuality = { bitrate: 1500, packetLoss: 0.5, jitter: 10, latency: 80 };

  async connectToRoom(roomName: string, token: string) {
    // Simulate getting local media
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to get media:', error);
      throw new Error('Failed to access camera/microphone');
    }
  }

  disconnect() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
  }

  async startScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.isScreenSharing = true;
      return stream;
    } catch (error) {
      console.error('Screen share failed:', error);
      throw error;
    }
  }

  stopScreenShare() {
    this.isScreenSharing = false;
  }

  enablePictureInPicture(videoElement: HTMLVideoElement) {
    if (document.pictureInPictureEnabled) {
      videoElement.requestPictureInPicture();
      this.isPiPEnabled = true;
    }
  }

  disablePictureInPicture() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
      this.isPiPEnabled = false;
    }
  }

  getConnectionStats() {
    // Simulate varying connection quality
    const variance = () => (Math.random() - 0.5) * 0.2;
    return {
      bitrateKbps: Math.floor(this.connectionQuality.bitrate * (1 + variance())),
      packetLossPercent: Math.max(0, this.connectionQuality.packetLoss * (1 + variance())),
      jitterMs: Math.floor(this.connectionQuality.jitter * (1 + variance())),
      latencyMs: Math.floor(this.connectionQuality.latency * (1 + variance())),
      videoResolution: '720p',
      videoFps: 30,
    };
  }
}

const VideoRoom: React.FC<VideoRoomProps> = ({ session, onSessionEnd, onPhotoCapture }) => {
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isPiPMode, setIsPiPMode] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<SessionRecording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [virtualBackground, setVirtualBackground] = useState<string | null>(null);
  const [beautyFilter, setBeautyFilter] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('excellent');
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [annotationTool, setAnnotationTool] = useState<'arrow' | 'circle' | 'text' | 'freehand'>('arrow');
  const [annotationColor, setAnnotationColor] = useState('#FF0000');
  const [showSettings, setShowSettings] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoSDK = useRef<MockVideoSDK>(new MockVideoSDK());
  const qualityInterval = useRef<number>();
  const recordingInterval = useRef<number>();
  const sessionTimeInterval = useRef<number>();

  useEffect(() => {
    connectToRoom();

    return () => {
      disconnectFromRoom();
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      // Start quality monitoring
      qualityInterval.current = window.setInterval(() => {
        monitorConnectionQuality();
      }, 5000);

      // Start session timer
      sessionTimeInterval.current = window.setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);

      return () => {
        if (qualityInterval.current) clearInterval(qualityInterval.current);
        if (sessionTimeInterval.current) clearInterval(sessionTimeInterval.current);
      };
    }
  }, [isConnected]);

  useEffect(() => {
    if (isRecording) {
      recordingInterval.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingInterval.current) clearInterval(recordingInterval.current);
      setRecordingDuration(0);
    }

    return () => {
      if (recordingInterval.current) clearInterval(recordingInterval.current);
    };
  }, [isRecording]);

  const connectToRoom = async () => {
    if (!tenantId || !accessToken) return;
    try {
      await videoSDK.current.connectToRoom(session.room_name, session.session_token);

      if (localVideoRef.current && videoSDK.current.localStream) {
        localVideoRef.current.srcObject = videoSDK.current.localStream;
      }

      setIsConnected(true);

      // Log connection event
      await logSessionEvent(tenantId, accessToken, session.id, {
        eventType: 'video_connected',
        eventData: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      console.error('Failed to connect to room:', error);
      alert('Failed to connect to video room. Please check your camera and microphone permissions.');
    }
  };

  const disconnectFromRoom = () => {
    videoSDK.current.disconnect();
    setIsConnected(false);
  };

  const monitorConnectionQuality = async () => {
    if (!tenantId || !accessToken) return;
    const stats = videoSDK.current.getConnectionStats();

    try {
      await reportQualityMetrics(tenantId, accessToken, session.id, {
        participantType: 'provider',
        ...stats,
        audioQuality: 'good',
        connectionType: 'wifi',
        bandwidthUpMbps: 5.0,
        bandwidthDownMbps: 10.0,
        freezesCount: 0,
        audioDropsCount: 0,
      });

      // Determine quality level
      let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';
      if (stats.packetLossPercent > 5 || stats.latencyMs > 300) {
        quality = 'poor';
      } else if (stats.packetLossPercent > 2 || stats.latencyMs > 150) {
        quality = 'fair';
      } else if (stats.packetLossPercent > 1 || stats.latencyMs > 100) {
        quality = 'good';
      }

      setConnectionQuality(quality);
    } catch (error) {
      console.error('Failed to report quality metrics:', error);
    }
  };

  const toggleMute = () => {
    if (videoSDK.current.localStream) {
      const audioTrack = videoSDK.current.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (videoSDK.current.localStream) {
      const videoTrack = videoSDK.current.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const togglePictureInPicture = () => {
    if (remoteVideoRef.current) {
      if (isPiPMode) {
        videoSDK.current.disablePictureInPicture();
        setIsPiPMode(false);
      } else {
        videoSDK.current.enablePictureInPicture(remoteVideoRef.current);
        setIsPiPMode(true);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!tenantId || !accessToken) return;
    try {
      if (isScreenSharing) {
        videoSDK.current.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        const stream = await videoSDK.current.startScreenShare();
        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
        }
        setIsScreenSharing(true);

        await logSessionEvent(tenantId, accessToken, session.id, {
          eventType: 'screen_share_started',
          eventData: { timestamp: new Date().toISOString() },
        });
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  const toggleRecording = async () => {
    if (!tenantId || !accessToken) return;
    try {
      if (isRecording && currentRecording) {
        // Stop recording
        await stopSessionRecording(tenantId, accessToken, currentRecording.id, {
          durationSeconds: recordingDuration,
          fileSizeBytes: recordingDuration * 100000, // Estimated
          resolution: '720p',
        });
        setIsRecording(false);
        setCurrentRecording(null);
      } else {
        // Start recording - check consent
        if (!session.recording_consent) {
          alert('Recording consent has not been obtained from the patient.');
          return;
        }

        const recording = await startSessionRecording(tenantId, accessToken, session.id);
        setCurrentRecording(recording);
        setIsRecording(true);
      }
    } catch (error: any) {
      console.error('Recording error:', error);
      alert(error.message || 'Failed to manage recording');
    }
  };

  const capturePhoto = async () => {
    if (!tenantId || !accessToken) return;
    if (remoteVideoRef.current && canvasRef.current) {
      const video = remoteVideoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        // Convert to blob and create URL
        canvas.toBlob(async (blob) => {
          if (blob) {
            const photoUrl = URL.createObjectURL(blob);

            // In production, upload to S3
            const filePath = `session-photos/${session.id}/${Date.now()}.jpg`;

            try {
              await captureSessionPhoto(tenantId!, accessToken!, session.id, {
                filePath,
                viewType: 'capture',
              });

              if (onPhotoCapture) {
                onPhotoCapture(photoUrl);
              }

              alert('Photo captured successfully!');
            } catch (error) {
              console.error('Failed to save photo:', error);
            }
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const handleAnnotationStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!showAnnotations) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentAnnotation({
      type: annotationTool,
      points: [{ x, y }],
      color: annotationColor,
    });
  };

  const handleAnnotationMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentAnnotation) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentAnnotation({
      ...currentAnnotation,
      points: [...currentAnnotation.points, { x, y }],
    });
  };

  const handleAnnotationEnd = () => {
    if (currentAnnotation) {
      setAnnotations([...annotations, currentAnnotation]);
      setCurrentAnnotation(null);
    }
  };

  const clearAnnotations = () => {
    setAnnotations([]);
    setCurrentAnnotation(null);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = () => {
    switch (connectionQuality) {
      case 'excellent': return '#16a34a';
      case 'good': return '#2563eb';
      case 'fair': return '#ca8a04';
      case 'poor': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const containerStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#111827',
  };

  const headerStyle: React.CSSProperties = {
    background: '#1f2937',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'white',
  };

  const videoGridStyle: React.CSSProperties = {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem',
    padding: '1rem',
    position: 'relative',
  };

  const videoTileStyle: React.CSSProperties = {
    position: 'relative',
    background: 'black',
    borderRadius: '0.75rem',
    overflow: 'hidden',
  };

  const controlsStyle: React.CSSProperties = {
    background: '#1f2937',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
  };

  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '1rem',
    left: '1rem',
    color: 'white',
    background: 'rgba(0, 0, 0, 0.5)',
    padding: '0.25rem 0.75rem',
    borderRadius: '0.25rem',
  };

  return (
    <div style={containerStyle}>
      {/* Header with session info */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            {session.patient_first_name} {session.patient_last_name}
          </h2>
          <span style={{
            padding: '0.25rem 0.75rem',
            background: '#2563eb',
            borderRadius: '9999px',
            fontSize: '0.875rem',
          }}>
            {formatTime(sessionTime)}
          </span>
          <span style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            color: getQualityColor(),
            background: 'white',
          }}>
            {connectionQuality} connection
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isRecording && (
            <span style={{ display: 'flex', alignItems: 'center', color: '#ef4444' }}>
              <span style={{
                width: '0.75rem',
                height: '0.75rem',
                background: '#ef4444',
                borderRadius: '50%',
                marginRight: '0.5rem',
                animation: 'pulse 1s ease-in-out infinite',
              }}></span>
              REC {formatTime(recordingDuration)}
            </span>
          )}
          <Button onClick={() => setShowSettings(true)} variant="secondary" size="sm">
            Settings
          </Button>
          <Button onClick={onSessionEnd} variant="danger" size="sm">
            End Session
          </Button>
        </div>
      </div>

      {/* Video grid */}
      <div style={videoGridStyle}>
        {/* Remote video (patient) */}
        <div style={videoTileStyle}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={labelStyle}>
            Patient
          </div>
          {showAnnotations && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                cursor: 'crosshair',
              }}
              onMouseDown={handleAnnotationStart}
              onMouseMove={handleAnnotationMove}
              onMouseUp={handleAnnotationEnd}
            />
          )}
        </div>

        {/* Local video or screen share */}
        <div style={videoTileStyle}>
          {isScreenSharing ? (
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                filter: beautyFilter ? 'blur(0.5px) brightness(1.1) contrast(1.05)' : 'none',
              }}
            />
          )}
          <div style={labelStyle}>
            {isScreenSharing ? 'Screen Share' : 'You'}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={controlsStyle}>
        <Button
          onClick={toggleMute}
          variant={isMuted ? 'danger' : 'secondary'}
          size="lg"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </Button>

        <Button
          onClick={toggleVideo}
          variant={isVideoOff ? 'danger' : 'secondary'}
          size="lg"
          title={isVideoOff ? 'Turn On Video' : 'Turn Off Video'}
        >
          {isVideoOff ? 'Start Video' : 'Stop Video'}
        </Button>

        <Button onClick={toggleScreenShare} variant={isScreenSharing ? 'primary' : 'secondary'} size="lg">
          {isScreenSharing ? 'Stop' : 'Share'} Screen
        </Button>

        <Button onClick={togglePictureInPicture} variant="secondary" size="lg">
          Picture-in-Picture
        </Button>

        <Button onClick={capturePhoto} variant="secondary" size="lg">
          Capture Photo
        </Button>

        <Button
          onClick={() => setShowAnnotations(!showAnnotations)}
          variant={showAnnotations ? 'primary' : 'secondary'}
          size="lg"
        >
          {showAnnotations ? 'Hide' : 'Show'} Annotations
        </Button>

        <Button
          onClick={toggleRecording}
          variant={isRecording ? 'danger' : 'secondary'}
          size="lg"
          disabled={!session.recording_consent}
          title={!session.recording_consent ? 'Recording consent required' : ''}
        >
          {isRecording ? 'Stop' : 'Record'}
        </Button>
      </div>

      {/* Annotation controls */}
      {showAnnotations && (
        <div style={{ ...controlsStyle, padding: '0.75rem' }}>
          <select
            value={annotationTool}
            onChange={(e) => setAnnotationTool(e.target.value as any)}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#374151',
              color: 'white',
              borderRadius: '0.25rem',
              border: 'none',
            }}
          >
            <option value="arrow">Arrow</option>
            <option value="circle">Circle</option>
            <option value="freehand">Freehand</option>
            <option value="text">Text</option>
          </select>

          <input
            type="color"
            value={annotationColor}
            onChange={(e) => setAnnotationColor(e.target.value)}
            style={{ width: '2.5rem', height: '2rem', borderRadius: '0.25rem', cursor: 'pointer' }}
          />

          <Button onClick={clearAnnotations} variant="secondary" size="sm">
            Clear Annotations
          </Button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Video Settings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>Virtual Background</label>
              <select
                value={virtualBackground || ''}
                onChange={(e) => setVirtualBackground(e.target.value || null)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
              >
                <option value="">None</option>
                <option value="blur">Blur</option>
                <option value="office">Office</option>
                <option value="clinic">Clinic</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={beautyFilter}
                  onChange={(e) => setBeautyFilter(e.target.checked)}
                  style={{ borderRadius: '0.25rem' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Enable Beauty Filter</span>
              </label>
            </div>

            <div style={{ paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Connection Quality</h3>
              <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                <p>Status: <span style={{ color: getQualityColor() }}>{connectionQuality}</span></p>
                <p>Bitrate: ~1500 kbps</p>
                <p>Latency: ~80 ms</p>
                <p>Packet Loss: ~0.5%</p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default VideoRoom;
