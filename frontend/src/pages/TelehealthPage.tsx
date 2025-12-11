import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
import { fetchAppointments, fetchPatients } from '../api';
import type { Appointment, Patient } from '../types';

type TelehealthStatus = 'waiting' | 'in-progress' | 'completed';

interface TelehealthSession {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  scheduledStart: string;
  status: TelehealthStatus;
  waitTime?: number;
}

export function TelehealthPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [, setAppointments] = useState<Appointment[]>([]);
  const [, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<TelehealthSession[]>([]);
  const [activeSession, setActiveSession] = useState<TelehealthSession | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [appointmentsRes, patientsRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setAppointments(appointmentsRes.appointments || []);
      setPatients(patientsRes.patients || []);

      // Create mock telehealth sessions from today's appointments
      const today = new Date().toDateString();
      const todayAppts = (appointmentsRes.appointments || []).filter(
        (a: Appointment) =>
          new Date(a.scheduledStart).toDateString() === today &&
          a.status !== 'cancelled'
      );

      const mockSessions: TelehealthSession[] = todayAppts.slice(0, 5).map((appt: Appointment, i: number) => ({
        id: `session-${i}`,
        appointmentId: appt.id,
        patientId: appt.patientId,
        patientName: appt.patientName || 'Patient',
        scheduledStart: appt.scheduledStart,
        status: i === 0 ? 'waiting' : i === 1 ? 'in-progress' : 'completed' as TelehealthStatus,
        waitTime: i === 0 ? 5 : undefined,
      }));

      setSessions(mockSessions);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartSession = (sessionData: TelehealthSession) => {
    setActiveSession(sessionData);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionData.id ? { ...s, status: 'in-progress' as const } : s))
    );
    showSuccess('Starting telehealth session...');
  };

  const handleEndSession = () => {
    if (activeSession) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? { ...s, status: 'completed' as const } : s))
      );
    }
    setActiveSession(null);
    showSuccess('Session ended');
  };

  const waitingCount = sessions.filter((s) => s.status === 'waiting').length;
  const inProgressCount = sessions.filter((s) => s.status === 'in-progress').length;

  if (loading) {
    return (
      <div className="telehealth-page">
        <div className="page-header">
          <h1>Telehealth</h1>
        </div>
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="telehealth-page">
      <div className="page-header">
        <h1>Telehealth</h1>
        <div className="telehealth-stats">
          <span className="stat-badge waiting">{waitingCount} waiting</span>
          <span className="stat-badge active">{inProgressCount} active</span>
        </div>
      </div>

      <div className="telehealth-layout">
        {/* Waiting Room */}
        <div className="waiting-room">
          <Panel title="Virtual Waiting Room">
            {sessions.filter((s) => s.status === 'waiting').length === 0 ? (
              <div className="empty-waiting">
                <div className="empty-icon">🏠</div>
                <p className="muted">No patients waiting</p>
              </div>
            ) : (
              <div className="waiting-list">
                {sessions
                  .filter((s) => s.status === 'waiting')
                  .map((sessionData) => (
                    <div key={sessionData.id} className="waiting-patient">
                      <div className="patient-avatar">👤</div>
                      <div className="patient-info">
                        <div className="patient-name strong">{sessionData.patientName}</div>
                        <div className="patient-time muted tiny">
                          Scheduled: {new Date(sessionData.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {sessionData.waitTime && (
                          <div className="wait-time">
                            Waiting: {sessionData.waitTime} min
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleStartSession(sessionData)}
                      >
                        Start Visit
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </Panel>

          {/* Completed Sessions */}
          <Panel title="Today's Completed">
            {sessions.filter((s) => s.status === 'completed').length === 0 ? (
              <p className="muted">No completed sessions today</p>
            ) : (
              <div className="completed-list">
                {sessions
                  .filter((s) => s.status === 'completed')
                  .map((sessionData) => (
                    <div key={sessionData.id} className="completed-session">
                      <span className="check-icon">✓</span>
                      <span className="patient-name">{sessionData.patientName}</span>
                      <span className="session-time muted tiny">
                        {new Date(sessionData.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Video Area */}
        <div className="video-area">
          {activeSession ? (
            <div className="active-call">
              <div className="video-container">
                <div className="remote-video">
                  <div className="video-placeholder">
                    <div className="video-avatar">👤</div>
                    <div className="video-name">{activeSession.patientName}</div>
                  </div>
                </div>
                <div className="local-video">
                  <div className="video-placeholder small">
                    <span>You</span>
                  </div>
                </div>
              </div>

              <div className="call-controls">
                <button type="button" className="control-btn" title="Toggle Microphone">
                  🎤
                </button>
                <button type="button" className="control-btn" title="Toggle Camera">
                  📷
                </button>
                <button type="button" className="control-btn" title="Share Screen">
                  🖥️
                </button>
                <button type="button" className="control-btn" title="Chat">
                  💬
                </button>
                <button
                  type="button"
                  className="control-btn end-call"
                  onClick={handleEndSession}
                  title="End Call"
                >
                  📞
                </button>
              </div>

              <div className="call-info">
                <div className="call-duration">00:00:00</div>
                <div className="call-quality">HD Quality</div>
              </div>
            </div>
          ) : (
            <div className="no-active-call">
              <div className="empty-video">
                <div className="empty-icon">📹</div>
                <h3>No Active Session</h3>
                <p className="muted">Select a patient from the waiting room to start</p>
              </div>

              <div className="quick-actions">
                <h4>Quick Actions</h4>
                <button type="button" className="quick-action-btn">
                  📋 Review Today's Schedule
                </button>
                <button type="button" className="quick-action-btn">
                  ⚙️ Test Audio/Video
                </button>
                <button type="button" className="quick-action-btn">
                  📝 View Recent Notes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="telehealth-sidebar">
          <Panel title="Session Tools">
            <div className="tool-buttons">
              <button type="button" className="tool-btn" disabled={!activeSession}>
                📋 Patient Chart
              </button>
              <button type="button" className="tool-btn" disabled={!activeSession}>
                📝 Quick Note
              </button>
              <button type="button" className="tool-btn" disabled={!activeSession}>
                💊 Prescribe
              </button>
              <button type="button" className="tool-btn" disabled={!activeSession}>
                🧪 Order Labs
              </button>
              <button type="button" className="tool-btn" disabled={!activeSession}>
                📅 Schedule Follow-up
              </button>
            </div>
          </Panel>

          <Panel title="Connection Status">
            <div className="connection-status">
              <div className="status-item">
                <span className="status-indicator good"></span>
                <span>Internet: Good</span>
              </div>
              <div className="status-item">
                <span className="status-indicator good"></span>
                <span>Camera: Connected</span>
              </div>
              <div className="status-item">
                <span className="status-indicator good"></span>
                <span>Microphone: Connected</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
