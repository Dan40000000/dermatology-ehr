import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
import { fetchAppointments, fetchPatients, fetchProviders } from '../api';
import type { Appointment, Patient, Provider } from '../types';

type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'blocked';
type PatientFlowStatus = 'checked-in' | 'in-waiting' | 'roomed' | 'with-provider' | 'checkout' | 'completed';

interface Room {
  id: string;
  name: string;
  type: 'exam' | 'procedure' | 'cosmetic' | 'waiting';
  status: RoomStatus;
  currentPatient?: {
    patientId: string;
    appointmentId: string;
    arrivalTime: string;
    status: PatientFlowStatus;
  };
}

interface PatientFlow {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentType: string;
  scheduledTime: string;
  arrivalTime?: string;
  roomedTime?: string;
  providerStartTime?: string;
  checkoutTime?: string;
  status: PatientFlowStatus;
  roomId?: string;
  providerId: string;
  providerName: string;
  waitTime?: number;
}

const INITIAL_ROOMS: Room[] = [
  { id: 'room-1', name: 'Exam 1', type: 'exam', status: 'available' },
  { id: 'room-2', name: 'Exam 2', type: 'exam', status: 'available' },
  { id: 'room-3', name: 'Exam 3', type: 'exam', status: 'available' },
  { id: 'room-4', name: 'Exam 4', type: 'exam', status: 'available' },
  { id: 'room-5', name: 'Procedure 1', type: 'procedure', status: 'available' },
  { id: 'room-6', name: 'Procedure 2', type: 'procedure', status: 'available' },
  { id: 'room-7', name: 'Cosmetic Suite', type: 'cosmetic', status: 'available' },
];

export function OfficeFlowPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [patientFlows, setPatientFlows] = useState<PatientFlow[]>([]);
  const [, setSelectedRoom] = useState<Room | null>(null);

  // Filter states
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterFacility, setFilterFacility] = useState('Mountain Pine Dermatology PLLC');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterCallButton, setFilterCallButton] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [appointmentsRes, patientsRes, providersRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setAppointments(appointmentsRes.appointments || []);
      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);

      // Create mock patient flows from today's appointments
      const today = new Date().toDateString();
      const todayAppts = (appointmentsRes.appointments || []).filter(
        (a: Appointment) => new Date(a.scheduledStart).toDateString() === today
      );

      const mockFlows: PatientFlow[] = todayAppts.slice(0, 8).map((appt: Appointment, i: number) => {
        const statuses: PatientFlowStatus[] = ['checked-in', 'in-waiting', 'roomed', 'with-provider', 'checkout', 'completed'];
        const status = statuses[Math.min(i, statuses.length - 1)];
        const provider = (providersRes.providers || []).find((p: Provider) => p.id === appt.providerId);

        return {
          id: `flow-${i}`,
          appointmentId: appt.id,
          patientId: appt.patientId,
          patientName: appt.patientName || 'Patient',
          appointmentType: appt.appointmentTypeName || 'Visit',
          scheduledTime: appt.scheduledStart,
          arrivalTime: i < 6 ? new Date(new Date(appt.scheduledStart).getTime() - 10 * 60000).toISOString() : undefined,
          roomedTime: i >= 2 && i < 6 ? new Date(new Date(appt.scheduledStart).getTime() + 5 * 60000).toISOString() : undefined,
          providerStartTime: i >= 3 && i < 6 ? new Date(new Date(appt.scheduledStart).getTime() + 10 * 60000).toISOString() : undefined,
          status,
          roomId: i >= 2 && i < 5 ? `room-${(i % 4) + 1}` : undefined,
          providerId: appt.providerId,
          providerName: provider?.fullName || provider?.name || 'Provider',
          waitTime: i < 5 ? Math.floor(Math.random() * 20) + 5 : undefined,
        };
      });

      setPatientFlows(mockFlows);

      // Update rooms based on patient flows
      const updatedRooms = INITIAL_ROOMS.map((room) => {
        const occupant = mockFlows.find((f) => f.roomId === room.id && f.status !== 'completed' && f.status !== 'checkout');
        if (occupant) {
          return {
            ...room,
            status: 'occupied' as const,
            currentPatient: {
              patientId: occupant.patientId,
              appointmentId: occupant.appointmentId,
              arrivalTime: occupant.arrivalTime || '',
              status: occupant.status,
            },
          };
        }
        return room;
      });

      setRooms(updatedRooms);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const handleRoomPatient = (flow: PatientFlow, roomId: string) => {
    setPatientFlows((prev) =>
      prev.map((f) =>
        f.id === flow.id
          ? {
            ...f,
            status: 'roomed' as const,
            roomId,
            roomedTime: new Date().toISOString(),
          }
          : f
      )
    );

    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? {
            ...room,
            status: 'occupied' as const,
            currentPatient: {
              patientId: flow.patientId,
              appointmentId: flow.appointmentId,
              arrivalTime: flow.arrivalTime || new Date().toISOString(),
              status: 'roomed',
            },
          }
          : room
      )
    );

    showSuccess(`${flow.patientName} roomed in ${rooms.find((r) => r.id === roomId)?.name}`);
  };

  const handleStatusChange = (flow: PatientFlow, newStatus: PatientFlowStatus) => {
    setPatientFlows((prev) =>
      prev.map((f) => {
        if (f.id === flow.id) {
          const updates: Partial<PatientFlow> = { status: newStatus };
          if (newStatus === 'with-provider') {
            updates.providerStartTime = new Date().toISOString();
          } else if (newStatus === 'checkout' || newStatus === 'completed') {
            updates.checkoutTime = new Date().toISOString();
            // Free up the room
            if (f.roomId) {
              setRooms((prevRooms) =>
                prevRooms.map((room) =>
                  room.id === f.roomId
                    ? { ...room, status: 'cleaning' as const, currentPatient: undefined }
                    : room
                )
              );
            }
          }
          return { ...f, ...updates };
        }
        return f;
      })
    );

    showSuccess(`Status updated to ${newStatus}`);
  };

  const getStatusIcon = (status: PatientFlowStatus) => {
    switch (status) {
      case 'checked-in': return '';
      case 'in-waiting': return '';
      case 'roomed': return '';
      case 'with-provider': return '';
      case 'checkout': return '';
      case 'completed': return '';
    }
  };

  const getRoomIcon = (type: Room['type']) => {
    switch (type) {
      case 'exam': return '';
      case 'procedure': return '';
      case 'cosmetic': return '';
      case 'waiting': return '';
    }
  };

  const waitingPatients = patientFlows.filter((f) => f.status === 'checked-in' || f.status === 'in-waiting');
  const roomedPatients = patientFlows.filter((f) => f.status === 'roomed' || f.status === 'with-provider');
  const checkoutPatients = patientFlows.filter((f) => f.status === 'checkout');
  const availableRooms = rooms.filter((r) => r.status === 'available');

  const avgWaitTime = waitingPatients.length > 0
    ? Math.round(waitingPatients.reduce((sum, p) => sum + (p.waitTime || 0), 0) / waitingPatients.length)
    : 0;

  if (loading) {
    return (
      <div className="office-flow-page">
        <div className="page-header">
          <h1>Office Flow</h1>
        </div>
        <div className="flow-stats">
          <Skeleton variant="card" height={80} />
        </div>
        <div className="flow-layout">
          <Skeleton variant="card" height={400} />
          <Skeleton variant="card" height={400} />
        </div>
      </div>
    );
  }

  return (
    <div className="office-flow-page">
      <div className="page-header" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#ffffff', padding: '1rem 1.5rem', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>OfficeFlow</h1>
        <div className="flow-time" style={{ background: 'rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, fontSize: '1rem' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          style={{
            background: '#8b5cf6',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          Filters {showFiltersPanel ? '▲' : '▼'}
        </button>

        {filterFacility && (
          <div style={{
            background: '#e0e7ff',
            border: '1px solid #6366f1',
            borderRadius: '20px',
            padding: '0.25rem 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: '#4338ca',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>Facility</span>
            <span style={{ fontWeight: 600 }}>{filterFacility}</span>
            <button
              onClick={() => setFilterFacility('')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#4338ca',
                padding: '0',
                fontSize: '1rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      {showFiltersPanel && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.5rem',
          margin: '1rem 1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Rooms</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="checkbox" style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '0.875rem' }}>Preferred Rooms</span>
            </label>
            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Room
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Room Search...</option>
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Facility *
              </label>
              <select
                value={filterFacility}
                onChange={(e) => setFilterFacility(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="Mountain Pine Dermatology PLLC">Mountain Pine Dermatology PLLC</option>
                <option value="">All Facilities</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Provider
              </label>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Staff Search...</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Patient
              </label>
              <select
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Patient Search...</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.lastName}, {p.firstName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Call Button
              </label>
              <select
                value={filterCallButton}
                onChange={(e) => setFilterCallButton(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Call Button Search...</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151', textTransform: 'uppercase' }}>
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Custom Status Search...</option>
                <option value="waiting">Waiting</option>
                <option value="roomed">In Room</option>
                <option value="with-provider">With Provider</option>
                <option value="checkout">Checkout</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setFilterFacility('');
                setFilterProvider('');
                setFilterPatient('');
                setFilterCallButton('');
                setFilterStatus('');
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Clear Filters
            </button>
            <button
              type="button"
              onClick={() => {
                showSuccess('Filters applied');
                setShowFiltersPanel(false);
              }}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#8b5cf6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="flow-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', padding: '1.5rem', background: '#f9fafb' }}>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{waitingPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Waiting</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{roomedPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>In Rooms</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{checkoutPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Checkout</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{availableRooms.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Rooms Free</span>
        </div>
        <div className="flow-stat" style={{ background: avgWaitTime > 15 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{avgWaitTime}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Avg Wait (min)</span>
        </div>
      </div>

      <div className="flow-layout">
        {/* Room Map */}
        <Panel title="Room Status">
          <div className="room-grid">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`room-card ${room.status}`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className="room-header">
                  <span className="room-icon">{getRoomIcon(room.type)}</span>
                  <span className="room-name">{room.name}</span>
                </div>
                <div className={`room-status-indicator ${room.status}`}>
                  {room.status === 'available' && 'Available'}
                  {room.status === 'occupied' && room.currentPatient && (
                    <div className="occupant-info">
                      <div className="occupant-name">
                        {getPatientName(room.currentPatient.patientId)}
                      </div>
                      <div className="occupant-status">
                        {getStatusIcon(room.currentPatient.status)} {room.currentPatient.status}
                      </div>
                    </div>
                  )}
                  {room.status === 'cleaning' && 'Cleaning'}
                  {room.status === 'blocked' && 'Blocked'}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Patient Flow Columns */}
        <div className="flow-columns">
          {/* Waiting */}
          <div className="flow-column">
            <div className="column-header waiting">
              <span className="column-title">Waiting Room</span>
              <span className="column-count">{waitingPatients.length}</span>
            </div>
            <div className="column-content">
              {waitingPatients.map((flow) => (
                <div key={flow.id} className="flow-card">
                  <div className="flow-card-header">
                    <span className="patient-name">{flow.patientName}</span>
                    {flow.waitTime && (
                      <span className={`wait-badge ${flow.waitTime > 15 ? 'long' : ''}`}>
                        {flow.waitTime}m
                      </span>
                    )}
                  </div>
                  <div className="flow-card-info">
                    <div className="info-row muted tiny">
                      {flow.appointmentType}
                    </div>
                    <div className="info-row muted tiny">
                      {new Date(flow.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {flow.providerName}
                    </div>
                  </div>
                  <div className="flow-card-actions">
                    <select
                      className="room-select"
                      onChange={(e) => {
                        if (e.target.value) {
                          handleRoomPatient(flow, e.target.value);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="">Room patient...</option>
                      {availableRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {waitingPatients.length === 0 && (
                <div className="empty-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.3 }}>🪑</div>
                  <span className="empty-text" style={{ fontSize: '0.875rem', fontWeight: 500 }}>No patients waiting</span>
                </div>
              )}
            </div>
          </div>

          {/* In Rooms */}
          <div className="flow-column">
            <div className="column-header roomed">
              <span className="column-title">In Rooms</span>
              <span className="column-count">{roomedPatients.length}</span>
            </div>
            <div className="column-content">
              {roomedPatients.map((flow) => {
                const room = rooms.find((r) => r.id === flow.roomId);
                return (
                  <div key={flow.id} className="flow-card">
                    <div className="flow-card-header">
                      <span className="patient-name">{flow.patientName}</span>
                      <span className="room-badge">{room?.name}</span>
                    </div>
                    <div className="flow-card-info">
                      <div className="info-row">
                        <span className="status-badge">{getStatusIcon(flow.status)} {flow.status}</span>
                      </div>
                      <div className="info-row muted tiny">
                        {flow.providerName}
                      </div>
                    </div>
                    <div className="flow-card-actions">
                      {flow.status === 'roomed' && (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          onClick={() => handleStatusChange(flow, 'with-provider')}
                        >
                          Start Visit
                        </button>
                      )}
                      {flow.status === 'with-provider' && (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          onClick={() => handleStatusChange(flow, 'checkout')}
                        >
                          Ready for Checkout
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {roomedPatients.length === 0 && (
                <div className="empty-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.3 }}>🚪</div>
                  <span className="empty-text" style={{ fontSize: '0.875rem', fontWeight: 500 }}>No patients in rooms</span>
                </div>
              )}
            </div>
          </div>

          {/* Checkout */}
          <div className="flow-column">
            <div className="column-header checkout">
              <span className="column-title">Checkout</span>
              <span className="column-count">{checkoutPatients.length}</span>
            </div>
            <div className="column-content">
              {checkoutPatients.map((flow) => (
                <div key={flow.id} className="flow-card">
                  <div className="flow-card-header">
                    <span className="patient-name">{flow.patientName}</span>
                  </div>
                  <div className="flow-card-info">
                    <div className="info-row muted tiny">
                      {flow.appointmentType}
                    </div>
                  </div>
                  <div className="flow-card-actions">
                    <button type="button" className="btn-sm btn-secondary">
                      Schedule F/U
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={() => handleStatusChange(flow, 'completed')}
                    >
                      Complete
                    </button>
                  </div>
                </div>
              ))}
              {checkoutPatients.length === 0 && (
                <div className="empty-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.3 }}>💳</div>
                  <span className="empty-text" style={{ fontSize: '0.875rem', fontWeight: 500 }}>No patients at checkout</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
