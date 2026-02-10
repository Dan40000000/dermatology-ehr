import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { reportVideoQualityMetrics, captureVideoPhoto, type VideoVisitSession } from '../../api';
import { Button } from '../ui/Button';
import VideoControls from './VideoControls';
import '../../styles/telehealth.css';

interface VideoRoomProps {
  session: VideoVisitSession;
  roomUrl: string;
  token: string;
  isProvider: boolean;
  onSessionEnd: () => void;
  onPhotoCapture?: () => void;
}

interface ConnectionStats {
  bitrateKbps: number;
  packetLossPercent: number;
  jitterMs: number;
  latencyMs: number;
  videoResolution: string;
  videoFps: number;
}

// Mock Video SDK - simulates Twilio Video or Daily.co
class MockVideoSDK {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  isScreenSharing = false;

  async connectToRoom(_roomUrl: string, _token: string): Promise<{ success: boolean }> {
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

  disconnect(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStream = null;
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    this.isScreenSharing = true;
    return stream;
  }

  stopScreenShare(): void {
    this.isScreenSharing = false;
  }

  getConnectionStats(): ConnectionStats {
    const variance = () => (Math.random() - 0.5) * 0.2;
    return {
      bitrateKbps: Math.floor(1500 * (1 + variance())),
      packetLossPercent: Math.max(0, 0.5 * (1 + variance())),
      jitterMs: Math.floor(10 * (1 + variance())),
      latencyMs: Math.floor(80 * (1 + variance())),
      videoResolution: '720p',
      videoFps: 30,
    };
  }
}

const VideoRoom: React.FC<VideoRoomProps> = ({
  session,
  roomUrl,
  token,
  isProvider,
  onSessionEnd,
  onPhotoCapture,
}) => {
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('excellent');
  const [sessionTime, setSessionTime] = useState(0);
  const [virtualBackground, setVirtualBackground] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoSDK = useRef<MockVideoSDK>(new MockVideoSDK());
  const qualityInterval = useRef<number>();
  const sessionTimeInterval = useRef<number>();

  const connectToRoom = useCallback(async () => {
    try {
      await videoSDK.current.connectToRoom(roomUrl, token);

      if (localVideoRef.current && videoSDK.current.localStream) {
        localVideoRef.current.srcObject = videoSDK.current.localStream;
      }

      setIsConnected(true);
      setParticipants([isProvider ? 'Provider' : 'Patient']);
    } catch (error) {
      console.error('Failed to connect to room:', error);
      alert('Failed to connect to video room. Please check your camera and microphone permissions.');
    }
  }, [roomUrl, token, isProvider]);

  const disconnectFromRoom = useCallback(() => {
    videoSDK.current.disconnect();
    setIsConnected(false);
  }, []);

  const monitorConnectionQuality = useCallback(async () => {
    if (!tenantId || !accessToken) return;

    const stats = videoSDK.current.getConnectionStats();

    try {
      await reportVideoQualityMetrics(tenantId, accessToken, session.id, {
        participantType: isProvider ? 'provider' : 'patient',
        ...stats,
        audioQuality: 'good',
        connectionType: 'wifi',
      });

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
  }, [tenantId, accessToken, session.id, isProvider]);

  useEffect(() => {
    connectToRoom();

    return () => {
      disconnectFromRoom();
    };
  }, [connectToRoom, disconnectFromRoom]);

  useEffect(() => {
    if (isConnected) {
      qualityInterval.current = window.setInterval(() => {
        monitorConnectionQuality();
      }, 5000);

      sessionTimeInterval.current = window.setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000);

      return () => {
        if (qualityInterval.current) clearInterval(qualityInterval.current);
        if (sessionTimeInterval.current) clearInterval(sessionTimeInterval.current);
      };
    }
  }, [isConnected, monitorConnectionQuality]);

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

  const toggleScreenShare = async () => {
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
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  const handleCapturePhoto = async () => {
    if (!tenantId || !accessToken) return;

    if (remoteVideoRef.current && canvasRef.current) {
      const video = remoteVideoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        context.drawImage(video, 0, 0);

        canvas.toBlob(
          async (blob) => {
            if (blob) {
              const filePath = `video-photos/${session.id}/${Date.now()}.jpg`;

              try {
                await captureVideoPhoto(tenantId, accessToken, session.id, {
                  filePath,
                  bodySite: 'captured_during_visit',
                });

                if (onPhotoCapture) {
                  onPhotoCapture();
                }

                alert('Photo captured successfully!');
              } catch (error) {
                console.error('Failed to save photo:', error);
              }
            }
          },
          'image/jpeg',
          0.9
        );
      }
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQualityColor = () => {
    switch (connectionQuality) {
      case 'excellent':
        return 'text-green-500';
      case 'good':
        return 'text-blue-500';
      case 'fair':
        return 'text-yellow-500';
      case 'poor':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const handleEndVisit = () => {
    if (window.confirm('Are you sure you want to end this video visit?')) {
      disconnectFromRoom();
      onSessionEnd();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-white">
            {session.patient_first_name} {session.patient_last_name}
          </h2>
          <span className="px-3 py-1 bg-blue-600 rounded-full text-sm text-white">
            {formatTime(sessionTime)}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm bg-gray-700 ${getQualityColor()}`}>
            {connectionQuality} connection
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-gray-400 text-sm">
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </span>
          <Button onClick={() => setShowSettings(!showSettings)} variant="secondary" size="sm">
            Settings
          </Button>
          <Button onClick={handleEndVisit} variant="danger" size="sm">
            End Visit
          </Button>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4">
        {/* Remote Video (Patient/Provider) */}
        <div className="relative bg-black rounded-xl overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
            {isProvider ? 'Patient' : 'Provider'}
          </div>
        </div>

        {/* Local Video or Screen Share */}
        <div className="relative bg-black rounded-xl overflow-hidden">
          {isScreenSharing ? (
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
            {isScreenSharing ? 'Screen Share' : 'You'}
          </div>
        </div>
      </div>

      {/* Controls */}
      <VideoControls
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onCapturePhoto={handleCapturePhoto}
        onEndCall={handleEndVisit}
        isProvider={isProvider}
      />

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-20 right-4 bg-white rounded-lg shadow-xl p-4 w-80">
          <h3 className="text-lg font-semibold mb-4">Video Settings</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Virtual Background
              </label>
              <select
                value={virtualBackground || ''}
                onChange={(e) => setVirtualBackground(e.target.value || null)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">None</option>
                <option value="blur">Blur</option>
                <option value="office">Office</option>
                <option value="clinic">Clinic</option>
              </select>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-700 mb-2">Connection Quality</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  Status: <span className={getQualityColor()}>{connectionQuality}</span>
                </p>
                <p>Bitrate: ~1500 kbps</p>
                <p>Latency: ~80 ms</p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setShowSettings(false)}
            variant="secondary"
            size="sm"
            className="mt-4 w-full"
          >
            Close
          </Button>
        </div>
      )}

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default VideoRoom;
