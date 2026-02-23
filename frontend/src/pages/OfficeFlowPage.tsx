import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
import {
  fetchFrontDeskSchedule,
  updateFrontDeskStatus,
  checkOutFrontDeskAppointment,
  fetchExamRooms,
  fetchPatientFlowActive,
  updatePatientFlowStatus,
  fetchPatients,
  fetchProviders,
  fetchPatientEncounters,
  createEncounter,
} from '../api';
import type { Appointment, Patient, Provider } from '../types';
import { setActiveEncounter } from '../utils/activeEncounter';

const AUTO_REFRESH_INTERVAL_MS = 15000;

type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'blocked';
type RoomType = 'exam' | 'procedure' | 'cosmetic' | 'waiting' | 'consult' | 'triage';
type PatientFlowStatus = Appointment['status'];

interface Room {
  id: string;
  name: string;
  type: RoomType;
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
  providerId: string;
  providerName: string;
  locationId?: string;
  locationName?: string;
  waitTime?: number;
}

const getMinutesBetween = (startIso?: string, endIso?: string): number | null => {
  if (!startIso || !endIso) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const diffMinutes = (endMs - startMs) / (1000 * 60);
  if (!Number.isFinite(diffMinutes) || diffMinutes < 0) return null;
  return diffMinutes;
};

const isLaserAppointmentType = (appointmentType?: string): boolean => /laser/i.test(appointmentType || '');

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [roomTemplates, setRoomTemplates] = useState<Room[]>(INITIAL_ROOMS);
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [patientFlows, setPatientFlows] = useState<PatientFlow[]>([]);
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});
  const [, setSelectedRoom] = useState<Room | null>(null);
  const [startingVisitId, setStartingVisitId] = useState<string | null>(null);

  // Filter states
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterFacility, setFilterFacility] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterCallButton, setFilterCallButton] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [scheduleRes, patientsRes, providersRes, roomsRes, activeFlowsRes] = await Promise.all([
        fetchFrontDeskSchedule(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
        fetchExamRooms(session.tenantId, session.accessToken).catch(() => ({ rooms: [] })),
        fetchPatientFlowActive(session.tenantId, session.accessToken).catch(() => ({ flows: [] })),
      ]);

      const patientsList = patientsRes.patients || patientsRes.data || [];
      setPatients(patientsList);
      setProviders(providersRes.providers || []);

      const backendRooms = Array.isArray(roomsRes.rooms)
        ? roomsRes.rooms.map((room: any) => ({
          id: room.id,
          name: room.roomName ? `${room.roomNumber} - ${room.roomName}` : room.roomNumber,
          type: room.roomType as RoomType,
          status: 'available' as const,
        }))
        : [];
      setRoomTemplates(backendRooms.length > 0 ? backendRooms : INITIAL_ROOMS);

      const assignmentMap: Record<string, string> = {};
      const activeFlows = Array.isArray(activeFlowsRes.flows) ? activeFlowsRes.flows : [];
      activeFlows.forEach((flow: any) => {
        if (flow.appointmentId && flow.roomId) {
          assignmentMap[flow.appointmentId] = flow.roomId;
        }
      });
      setRoomAssignments(assignmentMap);

      const activeStatuses: PatientFlowStatus[] = ['checked_in', 'in_room', 'with_provider', 'completed'];
      const flows: PatientFlow[] = (scheduleRes.appointments || [])
        .filter((appt: any) => activeStatuses.includes(appt.status))
        .map((appt: any) => {
          const patientName = appt.patientLastName && appt.patientFirstName
            ? `${appt.patientLastName}, ${appt.patientFirstName}`
            : (appt.patientName || 'Patient');
          const liveWaitMinutes = getMinutesBetween(appt.arrivedAt, new Date().toISOString());
          const waitTime = appt.status === 'checked_in'
            ? Math.floor(appt.waitTimeMinutes ?? liveWaitMinutes ?? 0)
            : undefined;

          return {
            id: appt.id,
            appointmentId: appt.id,
            patientId: appt.patientId,
            patientName,
            appointmentType: appt.appointmentTypeName || 'Visit',
            scheduledTime: appt.scheduledStart,
            arrivalTime: appt.arrivedAt,
            roomedTime: appt.roomedAt,
            providerStartTime: appt.roomedAt,
            checkoutTime: appt.completedAt,
            status: appt.status,
            providerId: appt.providerId,
            providerName: appt.providerName || 'Provider',
            locationId: appt.locationId,
            locationName: appt.locationName,
            waitTime,
          };
        });

      setPatientFlows(flows);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!session) return;
    const intervalId = window.setInterval(() => {
      loadData();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session, loadData]);

  useEffect(() => {
    if (!statusParam) return;
    const normalized = statusParam.toLowerCase();
    const statusMap: Record<string, PatientFlowStatus> = {
      checked_in: 'checked_in',
      in_room: 'in_room',
      with_provider: 'with_provider',
      completed: 'completed',
      waiting: 'checked_in',
      'in-exam': 'in_room',
      checkout: 'completed',
    };
    const mappedStatus = statusMap[normalized];
    if (mappedStatus) {
      setFilterStatus(mappedStatus);
    }
  }, [statusParam]);

  useEffect(() => {
    const updatedRooms = roomTemplates.map((room) => {
      const occupant = patientFlows.find((flow) => {
        const assignedRoomId = roomAssignments[flow.appointmentId];
        return assignedRoomId === room.id && (flow.status === 'in_room' || flow.status === 'with_provider');
      });

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

      return {
        ...room,
        status: 'available' as const,
        currentPatient: undefined,
      };
    });

    setRooms(updatedRooms);
  }, [patientFlows, roomAssignments, roomTemplates]);

  const getPatientName = (patientId: string) => {
    const flow = patientFlows.find((p) => p.patientId === patientId);
    if (flow) return flow.patientName;
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const statusLabels: Record<PatientFlowStatus, string> = {
    scheduled: 'scheduled',
    checked_in: 'checked in',
    in_room: 'in room',
    with_provider: 'with provider',
    completed: 'completed',
    cancelled: 'cancelled',
    no_show: 'no show',
  };

  const getStatusLabel = (status: PatientFlowStatus) => statusLabels[status] || status;

  const ensureEncounterForFlow = useCallback(async (flow: PatientFlow) => {
    if (!session) {
      throw new Error('Session missing');
    }

    const encountersRes = await fetchPatientEncounters(
      session.tenantId,
      session.accessToken,
      flow.patientId
    );
    const existing = (encountersRes.encounters || []).find((encounter: any) => encounter.appointmentId === flow.appointmentId);
    if (existing?.id) {
      return existing.id as string;
    }

    const created = await createEncounter(session.tenantId, session.accessToken, {
      patientId: flow.patientId,
      providerId: flow.providerId,
      appointmentId: flow.appointmentId,
    });
    return created.id as string;
  }, [session]);

  const handleRoomPatient = async (flow: PatientFlow, roomId: string) => {
    if (!session) return;

    try {
      try {
        await updatePatientFlowStatus(session.tenantId, session.accessToken, flow.appointmentId, 'rooming', roomId);
      } catch {
        // Fallback for tenants not fully configured for patient-flow yet
        await updateFrontDeskStatus(session.tenantId, session.accessToken, flow.appointmentId, 'in_room');
      }
      setRoomAssignments((prev) => ({ ...prev, [flow.appointmentId]: roomId }));
      setPatientFlows((prev) =>
        prev.map((f) =>
          f.id === flow.id
            ? {
              ...f,
              status: 'in_room',
              roomedTime: new Date().toISOString(),
            }
            : f
        )
      );

      const roomName = rooms.find((room) => room.id === roomId)?.name || 'room';
      showSuccess(`${flow.patientName} roomed in ${roomName}`);
    } catch (err: any) {
      showError(err.message || 'Failed to room patient');
    }
  };

  const handleStatusChange = async (flow: PatientFlow, newStatus: PatientFlowStatus) => {
    if (!session) return;

    try {
      if (newStatus === 'completed') {
        try {
          await updatePatientFlowStatus(session.tenantId, session.accessToken, flow.appointmentId, 'completed');
        } catch {
          await checkOutFrontDeskAppointment(session.tenantId, session.accessToken, flow.appointmentId);
        }
        setRoomAssignments((prev) => {
          if (!prev[flow.appointmentId]) return prev;
          const next = { ...prev };
          delete next[flow.appointmentId];
          return next;
        });
      } else if (newStatus === 'with_provider') {
        try {
          await updatePatientFlowStatus(session.tenantId, session.accessToken, flow.appointmentId, 'with_provider');
        } catch {
          await updateFrontDeskStatus(session.tenantId, session.accessToken, flow.appointmentId, newStatus);
        }
      } else {
        await updateFrontDeskStatus(session.tenantId, session.accessToken, flow.appointmentId, newStatus);
      }

      setPatientFlows((prev) =>
        prev.map((f) => {
          if (f.id === flow.id) {
            const updates: Partial<PatientFlow> = { status: newStatus };
            if (newStatus === 'with_provider') {
              updates.providerStartTime = new Date().toISOString();
            } else if (newStatus === 'completed') {
              updates.checkoutTime = new Date().toISOString();
            }
            return { ...f, ...updates };
          }
          return f;
        })
      );

      showSuccess(`Status updated to ${getStatusLabel(newStatus)}`);
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    }
  };

  const handleStartVisit = async (flow: PatientFlow) => {
    if (!session) return;
    try {
      setStartingVisitId(flow.appointmentId);

      if (flow.status !== 'with_provider' && flow.status !== 'completed') {
        try {
          await updatePatientFlowStatus(session.tenantId, session.accessToken, flow.appointmentId, 'with_provider');
        } catch {
          await updateFrontDeskStatus(session.tenantId, session.accessToken, flow.appointmentId, 'with_provider');
        }
      }

      setPatientFlows((prev) =>
        prev.map((item) =>
          item.id === flow.id
            ? {
                ...item,
                status: 'with_provider',
                providerStartTime: item.providerStartTime || new Date().toISOString(),
              }
            : item
        )
      );

      const encounterId = await ensureEncounterForFlow(flow);
      try {
        sessionStorage.setItem(
          `encounter:appointmentType:${flow.appointmentId}`,
          flow.appointmentType || ''
        );
      } catch {
        // Ignore storage failures in private/locked contexts.
      }
      showSuccess('Visit started');
      setActiveEncounter({
        encounterId,
        patientId: flow.patientId,
        patientName: flow.patientName,
        appointmentTypeName: flow.appointmentType,
        startedAt: new Date().toISOString(),
        startedEncounterFrom: 'office_flow',
        undoAppointmentStatus: flow.status,
        returnPath: '/office-flow',
      });
      navigate(`/patients/${flow.patientId}/encounter/${encounterId}`, {
        state: {
          startedEncounterFrom: 'office_flow',
          undoAppointmentStatus: flow.status,
          appointmentTypeName: flow.appointmentType,
          returnPath: '/office-flow',
        },
      });
    } catch (err: any) {
      showError(err.message || 'Failed to start visit');
    } finally {
      setStartingVisitId(null);
    }
  };

  const handleMoveToWaiting = async (flow: PatientFlow) => {
    if (!session) return;

    try {
      try {
        await updatePatientFlowStatus(session.tenantId, session.accessToken, flow.appointmentId, 'checked_in');
      } catch {
        await updateFrontDeskStatus(session.tenantId, session.accessToken, flow.appointmentId, 'checked_in');
      }

      setRoomAssignments((prev) => {
        if (!prev[flow.appointmentId]) return prev;
        const next = { ...prev };
        delete next[flow.appointmentId];
        return next;
      });

      const refreshedWait = getMinutesBetween(flow.arrivalTime, new Date().toISOString());
      setPatientFlows((prev) =>
        prev.map((item) =>
          item.id === flow.id
            ? {
                ...item,
                status: 'checked_in',
                roomedTime: undefined,
                providerStartTime: undefined,
                waitTime: typeof refreshedWait === 'number' ? Math.floor(refreshedWait) : item.waitTime,
              }
            : item
        )
      );

      showSuccess(`${flow.patientName} moved back to waiting room`);
    } catch (err: any) {
      showError(err.message || 'Failed to move patient back to waiting room');
    }
  };

  const getStatusIcon = (status: PatientFlowStatus) => {
    switch (status) {
      case 'scheduled': return '';
      case 'checked_in': return '';
      case 'in_room': return '';
      case 'with_provider': return '';
      case 'completed': return '';
      case 'cancelled': return '';
      case 'no_show': return '';
    }
  };

  const getRoomIcon = (type: Room['type']) => {
    switch (type) {
      case 'exam': return '';
      case 'procedure': return '';
      case 'cosmetic': return '';
      case 'waiting': return '';
      case 'consult': return '';
      case 'triage': return '';
    }
  };

  const filteredFlows = patientFlows.filter((flow) => {
    if (filterFacility && flow.locationName !== filterFacility) return false;
    if (filterProvider && flow.providerId !== filterProvider) return false;
    if (filterPatient && flow.patientId !== filterPatient) return false;
    if (filterStatus && flow.status !== filterStatus) return false;
    return true;
  });

  const waitingPatients = filteredFlows.filter((f) => f.status === 'checked_in');
  const roomedPatients = filteredFlows.filter((f) => f.status === 'in_room' || f.status === 'with_provider');
  const completedPatients = filteredFlows.filter((f) => f.status === 'completed');
  const availableRooms = rooms.filter((r) => r.status === 'available');
  const facilityOptions = Array.from(
    new Set(patientFlows.map((flow) => flow.locationName).filter((name): name is string => Boolean(name)))
  ).sort();

  const avgWaitSamples = filteredFlows
    .map((flow) => {
      if (!flow.arrivalTime) return null;
      if (flow.status === 'checked_in') {
        if (typeof flow.waitTime === 'number') {
          return flow.waitTime;
        }
        return getMinutesBetween(flow.arrivalTime, new Date().toISOString());
      }
      if (flow.roomedTime) {
        return getMinutesBetween(flow.arrivalTime, flow.roomedTime);
      }
      return null;
    })
    .filter((minutes): minutes is number => typeof minutes === 'number');

  const avgWaitTime = avgWaitSamples.length > 0
    ? Math.round(avgWaitSamples.reduce((sum, minutes) => sum + minutes, 0) / avgWaitSamples.length)
    : 0;

  const avgAppointmentSamples = completedPatients
    .map((flow) => {
      const visitStart = flow.providerStartTime || flow.roomedTime || flow.scheduledTime;
      return getMinutesBetween(visitStart, flow.checkoutTime);
    })
    .filter((minutes): minutes is number => typeof minutes === 'number');

  const avgAppointmentTime = avgAppointmentSamples.length > 0
    ? Math.round(avgAppointmentSamples.reduce((sum, minutes) => sum + minutes, 0) / avgAppointmentSamples.length)
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
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Office Flow</h1>
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
                <option value="">All Facilities</option>
                {facilityOptions.map((facility) => (
                  <option key={facility} value={facility}>
                    {facility}
                  </option>
                ))}
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
                <option value="">All Statuses</option>
                <option value="checked_in">Checked In</option>
                <option value="in_room">In Room</option>
                <option value="with_provider">With Provider</option>
                <option value="completed">Completed</option>
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
      <div className="flow-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', padding: '1.5rem', background: '#f9fafb' }}>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{waitingPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Waiting</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{roomedPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>In Rooms</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{completedPatients.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Completed</span>
        </div>
        <div className="flow-stat" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{availableRooms.length}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Rooms Free</span>
        </div>
        <div data-testid="avg-wait-stat" className="flow-stat" style={{ background: avgWaitTime > 15 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{avgWaitTime}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Avg Wait (min)</span>
        </div>
        <div data-testid="avg-appt-time-stat" className="flow-stat" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#ffffff', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <span className="stat-value" style={{ display: 'block', fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{avgAppointmentTime}</span>
          <span className="stat-label" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Avg Appt Time (min)</span>
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
                        {getStatusIcon(room.currentPatient.status)} {getStatusLabel(room.currentPatient.status)}
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
                    {typeof flow.waitTime === 'number' && (
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
                const assignedRoomId = roomAssignments[flow.appointmentId];
                const room = rooms.find((r) => r.id === assignedRoomId);
                return (
                  <div key={flow.id} className="flow-card">
                    <div className="flow-card-header">
                      <span className="patient-name">{flow.patientName}</span>
                      <span className="room-badge">{room?.name}</span>
                    </div>
                    <div className="flow-card-info">
                      <div className="info-row">
                        <span className="status-badge">{getStatusIcon(flow.status)} {getStatusLabel(flow.status)}</span>
                      </div>
                      <div className="info-row muted tiny">
                        {flow.providerName}
                      </div>
                    </div>
                    <div className="flow-card-actions">
                      {flow.status === 'in_room' && (
                        <>
                          <button
                            type="button"
                            className="btn-sm btn-primary"
                            onClick={() => handleStartVisit(flow)}
                            disabled={startingVisitId === flow.appointmentId}
                          >
                            {startingVisitId === flow.appointmentId
                              ? 'Starting...'
                              : isLaserAppointmentType(flow.appointmentType)
                                ? 'Start Laser Visit'
                                : 'Start Visit'}
                          </button>
                          <button
                            type="button"
                            className="btn-sm btn-secondary"
                            onClick={() => handleMoveToWaiting(flow)}
                            disabled={startingVisitId === flow.appointmentId}
                          >
                            Move to Waiting
                          </button>
                        </>
                      )}
                      {flow.status === 'with_provider' && (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          onClick={() => handleStatusChange(flow, 'completed')}
                        >
                          Check Out
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

          {/* Completed */}
          <div className="flow-column">
            <div className="column-header checkout">
              <span className="column-title">Completed</span>
              <span className="column-count">{completedPatients.length}</span>
            </div>
            <div className="column-content">
              {completedPatients.map((flow) => (
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
                    <button
                      type="button"
                      className="btn-sm btn-secondary"
                      onClick={() => navigate(`/schedule?patientId=${flow.patientId}`)}
                    >
                      Schedule F/U
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={() => navigate(`/patients/${flow.patientId}`)}
                    >
                      View Chart
                    </button>
                  </div>
                </div>
              ))}
              {completedPatients.length === 0 && (
                <div className="empty-column" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.3 }}>💳</div>
                  <span className="empty-text" style={{ fontSize: '0.875rem', fontWeight: 500 }}>No completed visits</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
