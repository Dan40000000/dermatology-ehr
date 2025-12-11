import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchAppointments, fetchPatients, fetchProviders } from '../api';
import type { Appointment, Patient, Provider } from '../types';

type AppointmentStep = 'scheduled' | 'confirmed' | 'checked-in' | 'roomed' | 'in-progress' | 'checkout' | 'completed' | 'no-show';

interface AppointmentWithFlow extends Appointment {
  flowStatus: AppointmentStep;
  arrivalTime?: string;
  roomedTime?: string;
  startTime?: string;
  endTime?: string;
  roomNumber?: string;
}

const APPOINTMENT_STEPS: { status: AppointmentStep; label: string; icon: string }[] = [
  { status: 'scheduled', label: 'Scheduled', icon: '📅' },
  { status: 'confirmed', label: 'Confirmed', icon: '✓' },
  { status: 'checked-in', label: 'Checked In', icon: '📋' },
  { status: 'roomed', label: 'Roomed', icon: '🚪' },
  { status: 'in-progress', label: 'In Progress', icon: '👨‍⚕️' },
  { status: 'checkout', label: 'Checkout', icon: '💳' },
  { status: 'completed', label: 'Completed', icon: '✅' },
];

export function AppointmentFlowPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentWithFlow[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithFlow | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [appointmentsRes, patientsRes, providersRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);

      // Filter to selected date and add flow status
      const selectedDateStr = new Date(selectedDate).toDateString();
      const dayAppointments = (appointmentsRes.appointments || [])
        .filter((a: Appointment) => new Date(a.scheduledStart).toDateString() === selectedDateStr)
        .map((appt: Appointment, i: number): AppointmentWithFlow => {
          // Mock different statuses for demo
          const flowStatuses: AppointmentStep[] = ['completed', 'completed', 'checkout', 'in-progress', 'roomed', 'checked-in', 'confirmed', 'scheduled'];
          const flowStatus = flowStatuses[Math.min(i, flowStatuses.length - 1)];

          return {
            ...appt,
            flowStatus,
            arrivalTime: i < 6 ? new Date(new Date(appt.scheduledStart).getTime() - 5 * 60000).toISOString() : undefined,
            roomedTime: i < 5 ? new Date(new Date(appt.scheduledStart).getTime() + 3 * 60000).toISOString() : undefined,
            startTime: i < 4 ? new Date(new Date(appt.scheduledStart).getTime() + 8 * 60000).toISOString() : undefined,
            endTime: i < 2 ? new Date(new Date(appt.scheduledStart).getTime() + 25 * 60000).toISOString() : undefined,
            roomNumber: i < 5 ? `Exam ${(i % 4) + 1}` : undefined,
          };
        });

      setAppointments(dayAppointments);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, selectedDate, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.fullName || provider?.name || 'Unknown';
  };

  const handleAdvanceStep = async (appt: AppointmentWithFlow) => {
    const currentIndex = APPOINTMENT_STEPS.findIndex((s) => s.status === appt.flowStatus);
    if (currentIndex >= APPOINTMENT_STEPS.length - 1) return;

    const nextStatus = APPOINTMENT_STEPS[currentIndex + 1].status;

    setAppointments((prev) =>
      prev.map((a) => {
        if (a.id === appt.id) {
          const updates: Partial<AppointmentWithFlow> = { flowStatus: nextStatus };
          if (nextStatus === 'checked-in') {
            updates.arrivalTime = new Date().toISOString();
          } else if (nextStatus === 'roomed') {
            updates.roomedTime = new Date().toISOString();
            updates.roomNumber = 'Exam 1'; // Would normally select room
          } else if (nextStatus === 'in-progress') {
            updates.startTime = new Date().toISOString();
          } else if (nextStatus === 'checkout' || nextStatus === 'completed') {
            updates.endTime = new Date().toISOString();
          }
          return { ...a, ...updates };
        }
        return a;
      })
    );

    showSuccess(`Appointment advanced to ${nextStatus}`);
  };

  const handleNoShow = (appt: AppointmentWithFlow) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appt.id ? { ...a, flowStatus: 'no-show' as const } : a
      )
    );
    showSuccess('Marked as no-show');
  };

  const getStepIndex = (status: AppointmentStep) => {
    return APPOINTMENT_STEPS.findIndex((s) => s.status === status);
  };

  const filteredAppointments = appointments.filter((appt) => {
    if (selectedProvider !== 'all' && appt.providerId !== selectedProvider) return false;
    return true;
  });

  const statusCounts = APPOINTMENT_STEPS.reduce((acc, step) => {
    acc[step.status] = filteredAppointments.filter((a) => a.flowStatus === step.status).length;
    return acc;
  }, {} as Record<AppointmentStep, number>);

  const noShowCount = filteredAppointments.filter((a) => a.flowStatus === 'no-show').length;

  if (loading) {
    return (
      <div className="appointment-flow-page">
        <div className="page-header">
          <h1>Appointment Flow</h1>
        </div>
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={500} />
      </div>
    );
  }

  return (
    <div className="appointment-flow-page">
      <div className="page-header">
        <h1>Appointment Flow</h1>
        <div className="header-controls">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-picker"
          />
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="provider-filter"
          >
            <option value="all">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName || p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status Summary */}
      <div className="flow-status-bar">
        {APPOINTMENT_STEPS.map((step) => (
          <div key={step.status} className={`status-item ${step.status}`}>
            <span className="status-icon">{step.icon}</span>
            <span className="status-count">{statusCounts[step.status] || 0}</span>
            <span className="status-label">{step.label}</span>
          </div>
        ))}
        {noShowCount > 0 && (
          <div className="status-item no-show">
            <span className="status-icon">❌</span>
            <span className="status-count">{noShowCount}</span>
            <span className="status-label">No-Show</span>
          </div>
        )}
      </div>

      {/* Appointment List with Flow Progress */}
      <Panel title={`${filteredAppointments.length} Appointments`}>
        {filteredAppointments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>No appointments</h3>
            <p className="muted">No appointments scheduled for this date</p>
          </div>
        ) : (
          <div className="appointment-flow-list">
            {filteredAppointments
              .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
              .map((appt) => {
                const currentStepIndex = getStepIndex(appt.flowStatus);
                const isNoShow = appt.flowStatus === 'no-show';

                return (
                  <div
                    key={appt.id}
                    className={`appointment-flow-card ${isNoShow ? 'no-show' : ''}`}
                    onClick={() => {
                      setSelectedAppointment(appt);
                      setShowDetailModal(true);
                    }}
                  >
                    <div className="appt-flow-header">
                      <div className="appt-time">
                        {new Date(appt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="appt-patient">
                        <div className="patient-name strong">{appt.patientName || getPatientName(appt.patientId)}</div>
                        <div className="appt-type muted tiny">{appt.appointmentTypeName}</div>
                      </div>
                      <div className="appt-provider muted tiny">
                        {getProviderName(appt.providerId)}
                      </div>
                      {appt.roomNumber && (
                        <div className="appt-room">
                          <span className="room-badge">{appt.roomNumber}</span>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="flow-progress">
                      {APPOINTMENT_STEPS.map((step, i) => {
                        const isComplete = !isNoShow && i < currentStepIndex;
                        const isCurrent = !isNoShow && i === currentStepIndex;
                        const isPending = !isNoShow && i > currentStepIndex;

                        return (
                          <div
                            key={step.status}
                            className={`progress-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}
                            title={step.label}
                          >
                            <div className="step-dot">
                              {isComplete && '✓'}
                              {isCurrent && step.icon}
                            </div>
                            {i < APPOINTMENT_STEPS.length - 1 && (
                              <div className={`step-line ${isComplete ? 'complete' : ''}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick Actions */}
                    <div className="appt-flow-actions" onClick={(e) => e.stopPropagation()}>
                      {!isNoShow && currentStepIndex < APPOINTMENT_STEPS.length - 1 && (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          onClick={() => handleAdvanceStep(appt)}
                        >
                          {APPOINTMENT_STEPS[currentStepIndex + 1]?.icon} {APPOINTMENT_STEPS[currentStepIndex + 1]?.label}
                        </button>
                      )}
                      {!isNoShow && (appt.flowStatus === 'scheduled' || appt.flowStatus === 'confirmed') && (
                        <button
                          type="button"
                          className="btn-sm btn-secondary"
                          onClick={() => handleNoShow(appt)}
                        >
                          No-Show
                        </button>
                      )}
                      {isNoShow && (
                        <span className="no-show-badge">No-Show</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Panel>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        title="Appointment Details"
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAppointment(null);
        }}
      >
        {selectedAppointment && (
          <div className="appointment-detail">
            <div className="detail-section">
              <h4>Patient Information</h4>
              <div className="detail-row">
                <span className="label">Name:</span>
                <span className="value">{selectedAppointment.patientName || getPatientName(selectedAppointment.patientId)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Appointment Type:</span>
                <span className="value">{selectedAppointment.appointmentTypeName}</span>
              </div>
              <div className="detail-row">
                <span className="label">Provider:</span>
                <span className="value">{getProviderName(selectedAppointment.providerId)}</span>
              </div>
            </div>

            <div className="detail-section">
              <h4>Schedule</h4>
              <div className="detail-row">
                <span className="label">Scheduled:</span>
                <span className="value">{new Date(selectedAppointment.scheduledStart).toLocaleString()}</span>
              </div>
              {selectedAppointment.arrivalTime && (
                <div className="detail-row">
                  <span className="label">Arrival:</span>
                  <span className="value">{new Date(selectedAppointment.arrivalTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.roomedTime && (
                <div className="detail-row">
                  <span className="label">Roomed:</span>
                  <span className="value">{new Date(selectedAppointment.roomedTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.startTime && (
                <div className="detail-row">
                  <span className="label">Visit Start:</span>
                  <span className="value">{new Date(selectedAppointment.startTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.endTime && (
                <div className="detail-row">
                  <span className="label">Visit End:</span>
                  <span className="value">{new Date(selectedAppointment.endTime).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            <div className="detail-section">
              <h4>Current Status</h4>
              <div className="current-status-display">
                {APPOINTMENT_STEPS.find((s) => s.status === selectedAppointment.flowStatus)?.icon}{' '}
                {APPOINTMENT_STEPS.find((s) => s.status === selectedAppointment.flowStatus)?.label || selectedAppointment.flowStatus}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowDetailModal(false)}
          >
            Close
          </button>
          {selectedAppointment && selectedAppointment.flowStatus !== 'completed' && selectedAppointment.flowStatus !== 'no-show' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (selectedAppointment) {
                  handleAdvanceStep(selectedAppointment);
                  setShowDetailModal(false);
                }
              }}
            >
              Advance to Next Step
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
