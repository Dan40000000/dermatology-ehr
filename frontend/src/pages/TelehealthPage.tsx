import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createTelehealthSession,
  fetchTelehealthSessions,
  fetchTelehealthSession,
  fetchTelehealthStats,
  updateSessionStatus,
  fetchWaitingRoom,
  callPatientFromWaitingRoom,
  fetchProviders,
  fetchPatients,
  type TelehealthSession,
  type TelehealthStats,
  type WaitingRoomEntry,
} from '../api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { DataTable } from '../components/ui/DataTable';
import VideoRoom from '../components/telehealth/VideoRoom';
import VirtualWaitingRoom from '../components/telehealth/VirtualWaitingRoom';
import TelehealthNotes from '../components/telehealth/TelehealthNotes';
import TelehealthStatsCards from '../components/telehealth/TelehealthStatsCards';
import TelehealthFilters, { type FilterValues, DERMATOLOGY_REASONS } from '../components/telehealth/TelehealthFilters';
import '../styles/telehealth.css';

type ViewMode = 'list' | 'waiting-room' | 'video' | 'notes';

const TelehealthPage: React.FC = () => {
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const accessToken = session?.accessToken;
  const user = session?.user;

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sessions, setSessions] = useState<TelehealthSession[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<TelehealthSession[]>([]);
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomEntry[]>([]);
  const [currentSession, setCurrentSession] = useState<TelehealthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showLicenseWarning, setShowLicenseWarning] = useState(false);
  const [licenseWarningMessage, setLicenseWarningMessage] = useState('');

  // Stats
  const [stats, setStats] = useState<TelehealthStats>({
    myInProgress: 0,
    myCompleted: 0,
    myUnreadMessages: 0,
    unassignedCases: 0,
  });
  const [activeStatsFilter, setActiveStatsFilter] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterValues>({
    datePreset: 'alltime',
    startDate: '',
    endDate: '',
    status: '',
    assignedTo: '',
    physician: '',
    patientSearch: '',
    reason: '',
    myUnreadOnly: false,
  });

  // New session form
  const [newSessionForm, setNewSessionForm] = useState({
    patientId: '',
    providerId: user?.id || '',
    patientState: '',
    recordingConsent: false,
    reason: '',
  });

  const [providers, setProviders] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  useEffect(() => {
    loadData();
    loadProvidersAndPatients();

    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load data when filters change
    loadData();
  }, [filters]);

  useEffect(() => {
    // Apply filtering logic
    applyFilters();
  }, [sessions, activeStatsFilter]);

  const loadData = async () => {
    if (!tenantId || !accessToken) {
      setLoading(false);
      return;
    }
    try {
      const filterParams: any = {};
      if (filters.startDate) filterParams.startDate = filters.startDate;
      if (filters.endDate) filterParams.endDate = filters.endDate;
      if (filters.status) filterParams.status = filters.status;
      if (filters.assignedTo) filterParams.assignedTo = filters.assignedTo;
      if (filters.physician) filterParams.physicianId = filters.physician;
      if (filters.patientSearch) filterParams.patientSearch = filters.patientSearch;
      if (filters.reason) filterParams.reason = filters.reason;
      if (filters.myUnreadOnly) filterParams.myUnreadOnly = true;

      const [sessionsData, waitingRoomData, statsData] = await Promise.all([
        fetchTelehealthSessions(tenantId, accessToken, filterParams),
        fetchWaitingRoom(tenantId, accessToken),
        fetchTelehealthStats(tenantId, accessToken, {
          startDate: filters.startDate,
          endDate: filters.endDate,
        }),
      ]);

      setSessions(sessionsData);
      setWaitingRoom(waitingRoomData);
      setStats(statsData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load telehealth data:', error);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...sessions];

    // Apply stats card filter
    if (activeStatsFilter) {
      switch (activeStatsFilter) {
        case 'in_progress':
          filtered = filtered.filter((s) => s.status === 'in_progress');
          break;
        case 'completed':
          filtered = filtered.filter((s) => s.status === 'completed');
          break;
        case 'unread':
          // Filter for unread messages when implemented
          break;
        case 'unassigned':
          filtered = filtered.filter((s) => !s.assigned_to || s.assigned_to === null);
          break;
      }
    }

    setFilteredSessions(filtered);
  };

  const loadProvidersAndPatients = async () => {
    if (!tenantId || !accessToken) return;
    try {
      const [providersData, patientsData] = await Promise.all([
        fetchProviders(tenantId, accessToken),
        fetchPatients(tenantId, accessToken),
      ]);

      setProviders(providersData.providers || []);
      setPatients(patientsData.patients || []);
    } catch (error) {
      console.error('Failed to load providers/patients:', error);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !accessToken) return;

    try {
      const sessionData = await createTelehealthSession(tenantId, accessToken, {
        patientId: parseInt(newSessionForm.patientId),
        providerId: parseInt(newSessionForm.providerId),
        patientState: newSessionForm.patientState,
        recordingConsent: newSessionForm.recordingConsent,
        reason: newSessionForm.reason || undefined,
      });

      setSessions([sessionData, ...sessions]);
      setShowNewSessionModal(false);
      setNewSessionForm({
        patientId: '',
        providerId: user?.id || '',
        patientState: '',
        recordingConsent: false,
        reason: '',
      });

      alert('Telehealth session created successfully! Send the session link to the patient.');
    } catch (error: any) {
      console.error('Failed to create session:', error);

      // Check for licensing error
      if (error.message.includes('not licensed')) {
        setLicenseWarningMessage(error.message);
        setShowLicenseWarning(true);
      } else {
        alert('Failed to create session: ' + error.message);
      }
    }
  };

  const handleStatsCardClick = (filterId: string) => {
    if (activeStatsFilter === filterId) {
      setActiveStatsFilter(null);
    } else {
      setActiveStatsFilter(filterId);
    }
  };

  const handleFiltersChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setActiveStatsFilter(null); // Clear stats filter when using manual filters
  };

  const handleClearFilters = () => {
    setFilters({
      datePreset: 'alltime',
      startDate: '',
      endDate: '',
      status: '',
      assignedTo: '',
      physician: '',
      patientSearch: '',
      reason: '',
      myUnreadOnly: false,
    });
    setActiveStatsFilter(null);
  };

  const handleJoinSession = async (teleSession: TelehealthSession) => {
    if (!tenantId || !accessToken) return;
    try {
      // Refresh session data
      const updatedSession = await fetchTelehealthSession(tenantId, accessToken, teleSession.id);
      setCurrentSession(updatedSession);

      if (user?.role === 'patient') {
        setViewMode('waiting-room');
      } else {
        setViewMode('video');
      }
    } catch (error) {
      console.error('Failed to join session:', error);
      alert('Failed to join session. Please try again.');
    }
  };

  const handleWaitingRoomReady = () => {
    setViewMode('video');
  };

  const handleCallPatient = async (waitingEntry: WaitingRoomEntry) => {
    if (!tenantId || !accessToken) return;
    try {
      await callPatientFromWaitingRoom(tenantId, accessToken, waitingEntry.id);

      // Find and load the session
      const teleSession = sessions.find(s => s.id === waitingEntry.session_id);
      if (teleSession) {
        handleJoinSession(teleSession);
      }

      // Refresh waiting room
      loadData();
    } catch (error) {
      console.error('Failed to call patient:', error);
      alert('Failed to call patient. Please try again.');
    }
  };

  const handleSessionEnd = async () => {
    if (!currentSession || !tenantId || !accessToken) return;

    if (confirm('Are you sure you want to end this session?')) {
      try {
        await updateSessionStatus(tenantId, accessToken, currentSession.id, 'completed');

        // Show notes view
        setViewMode('notes');
      } catch (error) {
        console.error('Failed to end session:', error);
        alert('Failed to end session. Please try again.');
      }
    }
  };

  const handleNotesFinalized = () => {
    setViewMode('list');
    setCurrentSession(null);
    loadData();
  };

  const getStatusClass = (status: string) => {
    return `session-status ${status}`;
  };

  if (loading) {
    return (
      <div className="telehealth-loading">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  // Render based on view mode
  if (viewMode === 'waiting-room' && currentSession) {
    return (
      <VirtualWaitingRoom
        session={currentSession}
        patientId={user?.id || 0}
        onReady={handleWaitingRoomReady}
      />
    );
  }

  if (viewMode === 'video' && currentSession) {
    return (
      <div className="telehealth-video-layout">
        <div className="telehealth-video-main">
          <VideoRoom session={currentSession} onSessionEnd={handleSessionEnd} />
        </div>
        <div className="telehealth-notes-sidebar">
          <TelehealthNotes session={currentSession} />
        </div>
      </div>
    );
  }

  if (viewMode === 'notes' && currentSession) {
    return (
      <div style={{ height: '100vh' }}>
        <TelehealthNotes session={currentSession} onNotesFinalized={handleNotesFinalized} />
      </div>
    );
  }

  // Main list view
  return (
    <div className="telehealth-page">
      <div className="telehealth-header">
        <div>
          <h1>Telehealth Video Consultations</h1>
          <p>
            Conduct secure video visits with HIPAA compliance and state licensing verification
          </p>
        </div>
        <Button onClick={() => setShowNewSessionModal(true)} variant="primary">
          + New Session
        </Button>
      </div>

      {/* Current Telehealth Stats */}
      <TelehealthStatsCards
        stats={stats}
        onCardClick={handleStatsCardClick}
        activeFilter={activeStatsFilter}
      />

      {/* Telehealth Cases Section Header */}
      <div className="section-header">
        <h2>Telehealth Cases</h2>
      </div>

      {/* Filters */}
      <TelehealthFilters
        filters={filters}
        onChange={handleFiltersChange}
        onClear={handleClearFilters}
        providers={providers}
        patients={patients}
      />

      {/* Waiting Room Queue */}
      {waitingRoom.length > 0 && (
        <div className="waiting-room-section">
          <h2>Patients in Waiting Room</h2>
          <div className="waiting-room-list">
            {waitingRoom.map((entry) => (
              <div key={entry.id} className="waiting-room-entry">
                <div className="waiting-room-entry-info">
                  <div className="queue-position">
                    #{entry.queue_position}
                  </div>
                  <div className="waiting-room-entry-details">
                    <div className="patient-id">Patient ID: {entry.patient_id}</div>
                    <div className="join-time">
                      Joined: {new Date(entry.joined_at).toLocaleTimeString()}
                    </div>
                    {entry.equipment_check_completed && (
                      <div className="equipment-check">Equipment check completed</div>
                    )}
                  </div>
                </div>
                <div className="waiting-room-entry-actions">
                  <span className="wait-time">
                    Est. wait: {entry.estimated_wait_minutes} min
                  </span>
                  <Button onClick={() => handleCallPatient(entry)} variant="primary" size="sm">
                    Call Patient
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions Table */}
      <div className="sessions-table-container">
        <DataTable
          columns={[
            {
              key: 'updated_at',
              label: 'Last Updated',
              sortable: true,
              render: (row: TelehealthSession) =>
                row.updated_at
                  ? new Date(row.updated_at).toLocaleString()
                  : new Date(row.created_at).toLocaleString(),
            },
            {
              key: 'created_at',
              label: 'Date Created',
              sortable: true,
              render: (row: TelehealthSession) => new Date(row.created_at).toLocaleString(),
            },
            {
              key: 'patient',
              label: 'Patient',
              sortable: true,
              render: (row: TelehealthSession) =>
                `${row.patient_first_name} ${row.patient_last_name}`,
            },
            {
              key: 'assigned_to_name',
              label: 'Assigned To',
              sortable: true,
              render: (row: TelehealthSession) => row.assigned_to_name || 'Unassigned',
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (row: TelehealthSession) => (
                <div className="table-actions">
                  {row.status === 'scheduled' && (
                    <Button onClick={() => handleJoinSession(row)} variant="primary" size="sm">
                      Start Session
                    </Button>
                  )}
                  {row.status === 'in_progress' && (
                    <Button onClick={() => handleJoinSession(row)} variant="primary" size="sm">
                      Join Session
                    </Button>
                  )}
                  {row.status === 'completed' && (
                    <Button
                      onClick={() => {
                        setCurrentSession(row);
                        setViewMode('notes');
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      View Notes
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={filteredSessions}
          keyExtractor={(row) => row.id.toString()}
          emptyMessage="No telehealth sessions found"
        />

        {/* Total Results Counter */}
        <div className="total-results">
          Total Results: <span className="count">{filteredSessions.length}</span>
        </div>
      </div>

      {/* New Session Modal */}
      {showNewSessionModal && (
        <Modal
          isOpen={showNewSessionModal}
          onClose={() => setShowNewSessionModal(false)}
          title="Create New Telehealth Session"
        >
          <form onSubmit={handleCreateSession} className="telehealth-modal-form">
            <div>
              <label>Patient</label>
              <select
                value={newSessionForm.patientId}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, patientId: e.target.value })}
                required
              >
                <option value="">Select patient...</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Provider</label>
              <select
                value={newSessionForm.providerId}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, providerId: e.target.value })}
                required
              >
                <option value="">Select provider...</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.fullName || provider.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>
                Patient State (for licensing verification)
              </label>
              <select
                value={newSessionForm.patientState}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, patientState: e.target.value })}
                required
              >
                <option value="">Select state...</option>
                <option value="CA">California</option>
                <option value="NY">New York</option>
                <option value="TX">Texas</option>
                <option value="FL">Florida</option>
                <option value="IL">Illinois</option>
                <option value="PA">Pennsylvania</option>
                <option value="OH">Ohio</option>
              </select>
            </div>

            <div>
              <label htmlFor="reason-for-visit">Reason for Visit</label>
              <select
                id="reason-for-visit"
                value={newSessionForm.reason}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, reason: e.target.value })}
              >
                <option value="">Select reason...</option>
                {DERMATOLOGY_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="telehealth-checkbox-label">
                <input
                  type="checkbox"
                  checked={newSessionForm.recordingConsent}
                  onChange={(e) =>
                    setNewSessionForm({ ...newSessionForm, recordingConsent: e.target.checked })
                  }
                />
                <span>
                  Patient has provided recording consent
                </span>
              </label>
            </div>

            <div className="telehealth-modal-actions">
              <Button type="button" onClick={() => setShowNewSessionModal(false)} variant="secondary">
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create Session
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* License Warning Modal */}
      {showLicenseWarning && (
        <Modal
          isOpen={showLicenseWarning}
          onClose={() => setShowLicenseWarning(false)}
          title="State Licensing Issue"
        >
          <div>
            <div className="license-warning-box">
              <p>{licenseWarningMessage}</p>
            </div>
            <p className="license-warning-description">
              Providers must be licensed in the state where the patient is located to conduct telehealth visits.
              Please add the required license or select a different provider.
            </p>
            <Button onClick={() => setShowLicenseWarning(false)} variant="primary">
              Understood
            </Button>
          </div>
        </Modal>
      )}

      <style>{`
        .telehealth-page {
          padding: 1.5rem;
          background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
          min-height: 100vh;
        }

        .telehealth-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
          animation: slideDown 0.4s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .telehealth-header h1 {
          margin: 0 0 0.5rem 0;
          color: #0e7490;
        }

        .telehealth-header p {
          margin: 0;
          color: #0891b2;
        }

        .section-header {
          margin-bottom: 1rem;
        }

        .section-header h2 {
          margin: 0;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
          color: white;
          border-radius: 8px;
          font-size: 1.125rem;
          font-weight: 600;
        }


        .waiting-room-section {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          border-left: 4px solid #06b6d4;
        }

        .waiting-room-section h2 {
          margin: 0 0 1rem 0;
          color: #0e7490;
        }

        .waiting-room-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .waiting-room-entry {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
          border-radius: 8px;
          border: 1px solid #a5f3fc;
        }

        .waiting-room-entry-info {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .queue-position {
          background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
          color: white;
          font-weight: bold;
          font-size: 1.25rem;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(8, 145, 178, 0.3);
        }

        .waiting-room-entry-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .patient-id {
          font-weight: 600;
          color: #0e7490;
        }

        .join-time, .equipment-check {
          font-size: 0.875rem;
          color: #0891b2;
        }

        .waiting-room-entry-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .wait-time {
          font-size: 0.875rem;
          color: #0891b2;
          font-weight: 500;
        }

        .sessions-table-container {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .session-status {
          display: inline-block;
          padding: 0.375rem 0.875rem;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .session-status.scheduled {
          background: #fef3c7;
          color: #92400e;
        }

        .session-status.in_progress {
          background: #cffafe;
          color: #0e7490;
        }

        .session-status.completed {
          background: #dbeafe;
          color: #1e40af;
        }

        .table-actions {
          display: flex;
          gap: 0.5rem;
        }

        .total-results {
          margin-top: 1.5rem;
          padding: 1rem;
          text-align: center;
          font-size: 0.875rem;
          color: #475569;
          border-top: 1px solid #e2e8f0;
        }

        .total-results .count {
          font-weight: 700;
          color: #0891b2;
          font-size: 1rem;
        }

        .telehealth-modal-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .telehealth-modal-form > div {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .telehealth-modal-form label {
          font-weight: 500;
          color: #374151;
        }

        .telehealth-modal-form input,
        .telehealth-modal-form select {
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
        }

        .telehealth-checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .telehealth-checkbox-label input[type="checkbox"] {
          width: auto;
        }

        .telehealth-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .license-warning-box {
          padding: 1.25rem;
          background: #fef2f2;
          border: 2px solid #fca5a5;
          border-radius: 8px;
          color: #991b1b;
          margin-bottom: 1rem;
          font-weight: 500;
        }

        .license-warning-description {
          color: #6b7280;
          margin-bottom: 1.5rem;
        }

        .telehealth-loading {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
        }

        .telehealth-video-layout {
          display: flex;
          gap: 1.5rem;
          height: calc(100vh - 2rem);
          padding: 1rem;
        }

        .telehealth-video-main {
          flex: 1;
          background: #1f2937;
          border-radius: 12px;
          overflow: hidden;
        }

        .telehealth-notes-sidebar {
          width: 400px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default TelehealthPage;
