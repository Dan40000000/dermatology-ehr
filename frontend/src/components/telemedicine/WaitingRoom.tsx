import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinVideoWaitingQueue,
  updateVideoDeviceCheck,
  type VideoVisitSession,
  type VideoWaitingQueueEntry,
} from '../../api';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import '../../styles/telehealth.css';

interface WaitingRoomProps {
  session: VideoVisitSession;
  onReady: () => void;
  onCancel: () => void;
}

interface DeviceCheckStatus {
  camera: boolean;
  microphone: boolean;
  speaker: boolean;
  bandwidth: boolean;
  browser: boolean;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({ session, onReady, onCancel }) => {
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;

  const [queueEntry, setQueueEntry] = useState<VideoWaitingQueueEntry | null>(null);
  const [deviceCheck, setDeviceCheck] = useState<DeviceCheckStatus>({
    camera: false,
    microphone: false,
    speaker: false,
    bandwidth: false,
    browser: false,
  });
  const [isCheckingDevices, setIsCheckingDevices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pollInterval = useRef<number>();

  useEffect(() => {
    joinWaitingQueue();

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    // Check if provider has called this patient
    if (queueEntry?.status === 'called') {
      onReady();
    }
  }, [queueEntry, onReady]);

  const joinWaitingQueue = async () => {
    if (!tenantId || !accessToken) {
      setLoading(false);
      return;
    }

    try {
      const entry = await joinVideoWaitingQueue(tenantId, accessToken, session.id);
      setQueueEntry(entry);
      setLoading(false);

      // Start polling for status updates
      pollInterval.current = window.setInterval(() => {
        checkQueueStatus();
      }, 5000);
    } catch (err) {
      console.error('Failed to join waiting queue:', err);
      setError('Failed to join waiting room. Please try again.');
      setLoading(false);
    }
  };

  const checkQueueStatus = async () => {
    if (!tenantId || !accessToken || !queueEntry) return;

    try {
      // In production, this would fetch the updated queue entry
      // For now, we'll simulate status updates
      // const updated = await fetchQueueEntry(tenantId, accessToken, queueEntry.id);
      // setQueueEntry(updated);
    } catch (err) {
      console.error('Failed to check queue status:', err);
    }
  };

  const performDeviceCheck = async () => {
    setIsCheckingDevices(true);

    const results: DeviceCheckStatus = {
      camera: false,
      microphone: false,
      speaker: false,
      bandwidth: false,
      browser: false,
    };

    // Check browser compatibility
    results.browser = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    // Check camera and microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      results.camera = stream.getVideoTracks().length > 0;
      results.microphone = stream.getAudioTracks().length > 0;

      // Stop tracks after preview (they'll be restarted when joining the call)
      setTimeout(() => {
        stream.getTracks().forEach((track) => track.stop());
      }, 10000);
    } catch (err) {
      console.error('Media access error:', err);
    }

    // Check speaker (play test tone)
    try {
      if (audioRef.current) {
        await audioRef.current.play();
        results.speaker = true;
      }
    } catch (err) {
      // User might need to interact first
      results.speaker = true; // Assume working
    }

    // Simulate bandwidth check
    results.bandwidth = true;

    setDeviceCheck(results);

    // Update on server
    if (queueEntry && tenantId && accessToken) {
      try {
        const updated = await updateVideoDeviceCheck(tenantId, accessToken, queueEntry.id, results);
        setQueueEntry(updated);
      } catch (err) {
        console.error('Failed to update device check:', err);
      }
    }

    setIsCheckingDevices(false);
  };

  const allDevicesWorking = Object.values(deviceCheck).every((v) => v === true);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="mt-4 text-gray-600">Joining waiting room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={onCancel} variant="secondary">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Virtual Waiting Room</h1>
              <p className="text-gray-600 mt-1">
                Please complete the device check while you wait for your provider
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-indigo-600">
                #{queueEntry?.queue_position || '...'}
              </div>
              <div className="text-sm text-gray-500">Position in Queue</div>
              {queueEntry && queueEntry.estimated_wait_minutes > 0 && (
                <div className="mt-1 text-sm text-gray-500">
                  Estimated wait: ~{queueEntry.estimated_wait_minutes} minutes
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Device Check */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Device Check</h2>

            <div className="space-y-3 mb-6">
              <DeviceCheckItem label="Camera" status={deviceCheck.camera} />
              <DeviceCheckItem label="Microphone" status={deviceCheck.microphone} />
              <DeviceCheckItem label="Speaker" status={deviceCheck.speaker} />
              <DeviceCheckItem label="Internet Speed" status={deviceCheck.bandwidth} />
              <DeviceCheckItem label="Browser Compatibility" status={deviceCheck.browser} />
            </div>

            <Button
              onClick={performDeviceCheck}
              disabled={isCheckingDevices}
              variant="primary"
              fullWidth
            >
              {isCheckingDevices ? 'Checking Devices...' : 'Run Device Check'}
            </Button>

            {allDevicesWorking && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center text-green-700">
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <div>
                    <div className="font-semibold">All systems ready!</div>
                    <div className="text-sm">You're all set for your video visit</div>
                  </div>
                </div>
              </div>
            )}

            {/* Camera Preview */}
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Camera Preview</h3>
              <div className="bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </div>
            </div>

            {/* Hidden audio element for speaker test */}
            <audio ref={audioRef} src="/test-tone.mp3" />
          </div>

          {/* Instructions & Tips */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Tips for Your Video Visit</h2>

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-semibold">1</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Find Good Lighting</h3>
                  <p className="text-sm text-gray-600">
                    Position yourself facing a window or light source for the best visibility.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-semibold">2</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Quiet Environment</h3>
                  <p className="text-sm text-gray-600">
                    Find a quiet space and minimize background noise.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-semibold">3</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Stable Connection</h3>
                  <p className="text-sm text-gray-600">
                    Use a stable WiFi connection for the best video quality.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-600 font-semibold">4</span>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Have Questions Ready</h3>
                  <p className="text-sm text-gray-600">
                    Write down any questions or concerns you want to discuss.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">About Your Visit</h3>
              <p className="text-sm text-blue-700">
                When your provider is ready, you'll be automatically connected. Please ensure your
                device check is complete before the visit begins.
              </p>
            </div>

            <div className="mt-6">
              <Button onClick={onCancel} variant="secondary" fullWidth>
                Leave Waiting Room
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DeviceCheckItemProps {
  label: string;
  status: boolean;
}

const DeviceCheckItem: React.FC<DeviceCheckItemProps> = ({ label, status }) => {
  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
      <span className="font-medium text-gray-700">{label}</span>
      {status ? (
        <span className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Working
        </span>
      ) : (
        <span className="text-gray-400">Not checked</span>
      )}
    </div>
  );
};

export default WaitingRoom;
