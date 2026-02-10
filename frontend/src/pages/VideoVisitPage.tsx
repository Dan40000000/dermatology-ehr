import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchVideoSession,
  joinVideoSession,
  startVideoSession,
  endVideoSession,
  type VideoVisitSession,
} from '../api';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import VideoRoom from '../components/telemedicine/VideoRoom';
import WaitingRoom from '../components/telemedicine/WaitingRoom';
import VideoControls from '../components/telemedicine/VideoControls';
import PhotoCapture from '../components/telemedicine/PhotoCapture';
import ProviderWaitingList from '../components/telemedicine/ProviderWaitingList';
import TelehealthConsent from '../components/telemedicine/TelehealthConsent';
import '../styles/telehealth.css';

type ViewMode = 'loading' | 'consent' | 'waiting' | 'video' | 'ended' | 'error';

const VideoVisitPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;
  const user = authSession?.user;

  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [videoSession, setVideoSession] = useState<VideoVisitSession | null>(null);
  const [joinInfo, setJoinInfo] = useState<{ roomUrl: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [consentGiven, setConsentGiven] = useState(false);

  // Determine if user is provider or patient
  const participantType = searchParams.get('role') || 'provider';
  const isProvider = participantType === 'provider';

  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId, tenantId, accessToken]);

  const loadSession = async () => {
    if (!tenantId || !accessToken || !sessionId) return;

    try {
      const session = await fetchVideoSession(tenantId, accessToken, parseInt(sessionId, 10));
      setVideoSession(session);

      // Determine initial view based on session status
      if (session.status === 'completed' || session.status === 'cancelled') {
        setViewMode('ended');
      } else if (session.status === 'in_progress') {
        // Session already started, join directly
        await handleJoinSession();
      } else if (isProvider) {
        // Provider can see waiting list or start session
        setViewMode('waiting');
      } else {
        // Patient needs consent first
        setViewMode('consent');
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load video session. Please try again.');
      setViewMode('error');
    }
  };

  const handleJoinSession = async () => {
    if (!tenantId || !accessToken || !sessionId) return;

    try {
      const participantId = user?.id ? parseInt(user.id, 10) : undefined;
      const info = await joinVideoSession(
        tenantId,
        accessToken,
        parseInt(sessionId, 10),
        participantType as 'patient' | 'provider',
        participantId
      );

      setJoinInfo(info);
      setViewMode('video');
    } catch (err) {
      console.error('Failed to join session:', err);
      setError('Failed to join video session. Please try again.');
    }
  };

  const handleStartSession = async () => {
    if (!tenantId || !accessToken || !sessionId) return;

    try {
      await startVideoSession(tenantId, accessToken, parseInt(sessionId, 10));
      await handleJoinSession();
    } catch (err) {
      console.error('Failed to start session:', err);
      setError('Failed to start video session. Please try again.');
    }
  };

  const handleEndSession = async () => {
    if (!tenantId || !accessToken || !sessionId) return;

    try {
      await endVideoSession(tenantId, accessToken, parseInt(sessionId, 10));
      setViewMode('ended');
    } catch (err) {
      console.error('Failed to end session:', err);
      setError('Failed to end video session.');
    }
  };

  const handleConsentComplete = () => {
    setConsentGiven(true);
    // Patient enters waiting room after consent
    setViewMode('waiting');
  };

  const handlePhotoCapture = (photoUrl: string) => {
    setCapturedPhotos([...capturedPhotos, photoUrl]);
    setShowPhotoCapture(false);
  };

  const handlePatientReady = () => {
    // Patient clicked join - provider will be notified
    handleJoinSession();
  };

  if (viewMode === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="mt-4 text-gray-600">Loading video session...</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => navigate(-1)} variant="secondary">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (viewMode === 'ended') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
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
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Visit Complete</h2>
          <p className="text-gray-600 mb-6">
            {videoSession?.duration_minutes
              ? `Your video visit lasted ${videoSession.duration_minutes} minutes.`
              : 'Your video visit has ended.'}
          </p>
          {isProvider && (
            <p className="text-sm text-gray-500 mb-4">
              Remember to complete your clinical documentation.
            </p>
          )}
          <div className="space-x-4">
            <Button onClick={() => navigate('/appointments')} variant="primary">
              Back to Appointments
            </Button>
            {isProvider && videoSession && (
              <Button
                onClick={() => navigate(`/encounters?appointmentId=${videoSession.appointment_id}`)}
                variant="secondary"
              >
                View Encounter
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'consent') {
    return (
      <TelehealthConsent
        patientId={videoSession?.patient_id || 0}
        onConsentComplete={handleConsentComplete}
        onCancel={() => navigate(-1)}
      />
    );
  }

  if (viewMode === 'waiting') {
    if (isProvider) {
      return (
        <div className="min-h-screen bg-gray-100 p-6">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Video Visit</h1>
                  {videoSession && (
                    <p className="text-gray-600">
                      Patient: {videoSession.patient_first_name} {videoSession.patient_last_name}
                    </p>
                  )}
                </div>
                <div className="space-x-4">
                  <Button onClick={handleStartSession} variant="primary" size="lg">
                    Start Video Visit
                  </Button>
                  <Button onClick={() => navigate(-1)} variant="secondary">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>

            <ProviderWaitingList
              onPatientSelect={(patientSessionId) => {
                navigate(`/video-visit/${patientSessionId}?role=provider`);
              }}
            />
          </div>
        </div>
      );
    }

    // Patient waiting room
    return (
      <WaitingRoom
        session={videoSession!}
        onReady={handlePatientReady}
        onCancel={() => navigate(-1)}
      />
    );
  }

  // Video view
  return (
    <div className="min-h-screen bg-gray-900">
      {videoSession && joinInfo && (
        <VideoRoom
          session={videoSession}
          roomUrl={joinInfo.roomUrl}
          token={joinInfo.token}
          isProvider={isProvider}
          onSessionEnd={handleEndSession}
          onPhotoCapture={() => setShowPhotoCapture(true)}
        />
      )}

      {showPhotoCapture && videoSession && (
        <PhotoCapture
          sessionId={videoSession.id}
          onCapture={handlePhotoCapture}
          onClose={() => setShowPhotoCapture(false)}
        />
      )}
    </div>
  );
};

export default VideoVisitPage;
