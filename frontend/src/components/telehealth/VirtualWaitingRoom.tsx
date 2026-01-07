import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  joinWaitingRoom,
  updateEquipmentCheck,
  sendWaitingRoomChat,
  fetchEducationalContent,
  trackContentView,
  type WaitingRoomEntry,
  type TelehealthSession,
  type EducationalContent,
} from '../../api';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import '../../styles/telehealth.css';

interface VirtualWaitingRoomProps {
  session: TelehealthSession;
  patientId: number;
  onReady: () => void;
}

const VirtualWaitingRoom: React.FC<VirtualWaitingRoomProps> = ({ session, patientId, onReady }) => {
  const { session: authSession } = useAuth();
  const tenantId = authSession?.tenantId;
  const accessToken = authSession?.accessToken;

  const [waitingEntry, setWaitingEntry] = useState<WaitingRoomEntry | null>(null);
  const [equipmentCheck, setEquipmentCheck] = useState({
    camera: false,
    microphone: false,
    speaker: false,
    bandwidth: false,
    browser: false,
  });
  const [isCheckingEquipment, setIsCheckingEquipment] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ sender: string; message: string; timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [educationalContent, setEducationalContent] = useState<EducationalContent[]>([]);
  const [selectedContent, setSelectedContent] = useState<EducationalContent | null>(null);
  const [loading, setLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    initializeWaitingRoom();
    loadEducationalContent();
  }, []);

  useEffect(() => {
    if (waitingEntry?.status === 'called') {
      onReady();
    }
  }, [waitingEntry]);

  const initializeWaitingRoom = async () => {
    if (!tenantId || !accessToken) {
      setLoading(false);
      return;
    }
    try {
      const entry = await joinWaitingRoom(tenantId, accessToken, {
        sessionId: session.id,
        patientId,
      });
      setWaitingEntry(entry);
      setChatMessages(entry.chat_messages || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to join waiting room:', error);
      setLoading(false);
    }
  };

  const loadEducationalContent = async () => {
    if (!tenantId || !accessToken) return;
    try {
      const content = await fetchEducationalContent(tenantId, accessToken);
      setEducationalContent(content);
    } catch (error) {
      console.error('Failed to load educational content:', error);
    }
  };

  const performEquipmentCheck = async () => {
    setIsCheckingEquipment(true);

    const results = {
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

      // Stop the stream after check
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
      }, 5000);
    } catch (error) {
      console.error('Media access error:', error);
    }

    // Check speaker
    try {
      if (audioRef.current) {
        await audioRef.current.play();
        results.speaker = true;
      }
    } catch (error) {
      console.error('Speaker check error:', error);
    }

    // Simulate bandwidth check
    results.bandwidth = true; // In production, perform actual speed test

    setEquipmentCheck(results);

    // Update on server
    try {
      if (waitingEntry && tenantId && accessToken) {
        await updateEquipmentCheck(tenantId, accessToken, waitingEntry.id, results);
      }
    } catch (error) {
      console.error('Failed to update equipment check:', error);
    }

    setIsCheckingEquipment(false);
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !waitingEntry || !tenantId || !accessToken) return;

    try {
      const updated = await sendWaitingRoomChat(tenantId, accessToken, waitingEntry.id, {
        message: chatInput,
        sender: 'Patient',
      });

      setWaitingEntry(updated);
      setChatMessages(updated.chat_messages || []);
      setChatInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const viewContent = async (content: EducationalContent) => {
    setSelectedContent(content);
    if (!tenantId || !accessToken) return;
    try {
      await trackContentView(tenantId, accessToken, content.id);
    } catch (error) {
      console.error('Failed to track content view:', error);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="telehealth-loading">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  const allEquipmentWorking = Object.values(equipmentCheck).every(v => v === true);

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(to bottom right, #eef2ff, #faf5ff)',
    padding: '1.5rem',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '72rem',
    margin: '0 auto',
  };

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem',
  };

  const flexColumnStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={cardStyle}>
          <div style={headerRowStyle}>
            <div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', margin: 0 }}>Virtual Waiting Room</h1>
              <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
                Please complete the equipment check while you wait for your provider
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 700, color: '#4f46e5' }}>
                #{waitingEntry?.queue_position || '...'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>Position in Queue</div>
              {waitingEntry && waitingEntry.estimated_wait_minutes > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  Estimated wait: ~{waitingEntry.estimated_wait_minutes} minutes
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={gridStyle}>
          {/* Equipment Check */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Equipment Check</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <EquipmentItem label="Camera" status={equipmentCheck.camera} />
              <EquipmentItem label="Microphone" status={equipmentCheck.microphone} />
              <EquipmentItem label="Speaker" status={equipmentCheck.speaker} />
              <EquipmentItem label="Internet Speed" status={equipmentCheck.bandwidth} />
              <EquipmentItem label="Browser Compatibility" status={equipmentCheck.browser} />
            </div>

            <Button
              onClick={performEquipmentCheck}
              disabled={isCheckingEquipment}
              fullWidth
              variant="primary"
            >
              {isCheckingEquipment ? 'Checking Equipment...' : 'Run Equipment Check'}
            </Button>

            {allEquipmentWorking && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '0.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', color: '#166534' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>All systems ready!</div>
                    <div style={{ fontSize: '0.875rem' }}>You're all set for your video visit</div>
                  </div>
                </div>
              </div>
            )}

            {/* Video preview */}
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>Camera Preview</h3>
              <div style={{ background: 'black', borderRadius: '0.5rem', overflow: 'hidden', aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
              </div>
            </div>

            {/* Hidden audio element for speaker test */}
            <audio ref={audioRef} src="/test-tone.mp3" />
          </div>

          {/* Chat with Front Desk */}
          <div style={{ ...cardStyle, ...flexColumnStyle }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Chat with Front Desk</h2>

            <div style={{
              flex: 1,
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem',
              overflowY: 'auto',
              height: '16rem',
              background: '#f9fafb',
            }}>
              {chatMessages.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', fontSize: '0.875rem' }}>
                  No messages yet. Send a message if you need assistance.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        background: msg.sender === 'Patient' ? '#e0e7ff' : '#e5e7eb',
                        marginLeft: msg.sender === 'Patient' ? '2rem' : 0,
                        marginRight: msg.sender !== 'Patient' ? '2rem' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{msg.sender}</span>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.875rem', margin: 0 }}>{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
              <Button onClick={sendMessage} variant="primary">
                Send
              </Button>
            </div>
          </div>
        </div>

        {/* Educational Content */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>While You Wait</h2>

          {selectedContent ? (
            <div>
              <Button
                onClick={() => setSelectedContent(null)}
                variant="secondary"
                size="sm"
                style={{ marginBottom: '1rem' }}
              >
                Back to Library
              </Button>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{selectedContent.title}</h3>
                <p style={{ color: '#4b5563', marginBottom: '1rem' }}>{selectedContent.description}</p>

                {selectedContent.content_type === 'video' && selectedContent.content_url && (
                  <div style={{
                    aspectRatio: '16/9',
                    background: 'black',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <p style={{ color: 'white' }}>Video Player: {selectedContent.content_url}</p>
                  </div>
                )}

                {selectedContent.content_type === 'article' && (
                  <div>
                    <p style={{ color: '#374151' }}>
                      This is sample article content. In production, this would display the full article.
                    </p>
                  </div>
                )}

                {selectedContent.content_type === 'faq' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ borderLeft: '4px solid #4f46e5', paddingLeft: '1rem' }}>
                      <h4 style={{ fontWeight: 600, margin: 0 }}>What should I expect during my telehealth visit?</h4>
                      <p style={{ color: '#4b5563', marginTop: '0.25rem' }}>
                        Your provider will be able to see and hear you through video, just like an in-person visit.
                      </p>
                    </div>
                    <div style={{ borderLeft: '4px solid #4f46e5', paddingLeft: '1rem' }}>
                      <h4 style={{ fontWeight: 600, margin: 0 }}>How long will my visit take?</h4>
                      <p style={{ color: '#4b5563', marginTop: '0.25rem' }}>
                        Most visits last 15-30 minutes, depending on the complexity of your condition.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {educationalContent.map((content) => (
                <button
                  key={content.id}
                  onClick={() => viewContent(content)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    textAlign: 'left',
                    background: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>
                      {content.content_type === 'video' && ''}
                      {content.content_type === 'article' && ''}
                      {content.content_type === 'infographic' && ''}
                      {content.content_type === 'faq' && ''}
                    </span>
                    {content.duration_seconds && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {formatDuration(content.duration_seconds)}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{content.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: 0 }}>{content.description}</p>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {content.categories?.slice(0, 2).map((cat) => (
                      <span
                        key={cat}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: '#e0e7ff',
                          color: '#4338ca',
                          borderRadius: '0.25rem',
                        }}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface EquipmentItemProps {
  label: string;
  status: boolean;
}

const EquipmentItem: React.FC<EquipmentItemProps> = ({ label, status }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {status ? (
          <span style={{ color: '#16a34a', fontWeight: 600 }}>Working</span>
        ) : (
          <span style={{ color: '#9ca3af' }}>Not checked</span>
        )}
      </div>
    </div>
  );
};

export default VirtualWaitingRoom;
