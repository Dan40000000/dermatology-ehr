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
  const [, setProviders] = useState<Provider[]>([]);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [patientFlows, setPatientFlows] = useState<PatientFlow[]>([]);
  const [, setSelectedRoom] = useState<Room | null>(null);

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
      case 'checked-in': return '📋';
      case 'in-waiting': return '🪑';
      case 'roomed': return '🚪';
      case 'with-provider': return '👨‍⚕️';
      case 'checkout': return '💳';
      case 'completed': return '✅';
    }
  };

  const getRoomIcon = (type: Room['type']) => {
    switch (type) {
      case 'exam': return '🔬';
      case 'procedure': return '🏥';
      case 'cosmetic': return '✨';
      case 'waiting': return '🪑';
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
      <div className="page-header">
        <h1>Office Flow</h1>
        <div className="flow-time">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flow-stats">
        <div className="flow-stat">
          <span className="stat-icon">🪑</span>
          <span className="stat-value">{waitingPatients.length}</span>
          <span className="stat-label">Waiting</span>
        </div>
        <div className="flow-stat">
          <span className="stat-icon">🚪</span>
          <span className="stat-value">{roomedPatients.length}</span>
          <span className="stat-label">In Rooms</span>
        </div>
        <div className="flow-stat">
          <span className="stat-icon">💳</span>
          <span className="stat-value">{checkoutPatients.length}</span>
          <span className="stat-label">Checkout</span>
        </div>
        <div className="flow-stat">
          <span className="stat-icon">🏠</span>
          <span className="stat-value">{availableRooms.length}</span>
          <span className="stat-label">Rooms Free</span>
        </div>
        <div className={`flow-stat ${avgWaitTime > 15 ? 'warning' : ''}`}>
          <span className="stat-icon">⏱️</span>
          <span className="stat-value">{avgWaitTime}</span>
          <span className="stat-label">Avg Wait (min)</span>
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
              <span className="column-icon">🪑</span>
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
                <div className="empty-column">
                  <span className="empty-icon">👍</span>
                  <span className="empty-text">No patients waiting</span>
                </div>
              )}
            </div>
          </div>

          {/* In Rooms */}
          <div className="flow-column">
            <div className="column-header roomed">
              <span className="column-icon">🚪</span>
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
                <div className="empty-column">
                  <span className="empty-icon">🏠</span>
                  <span className="empty-text">No patients in rooms</span>
                </div>
              )}
            </div>
          </div>

          {/* Checkout */}
          <div className="flow-column">
            <div className="column-header checkout">
              <span className="column-icon">💳</span>
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
                <div className="empty-column">
                  <span className="empty-icon">✅</span>
                  <span className="empty-text">No patients at checkout</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
