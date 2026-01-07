import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchAppointments, fetchPatients, fetchProviders } from '../api';
import type { Appointment, Patient, Provider } from '../types';
import { InventoryUsageModal } from '../components/inventory/InventoryUsageModal';
import { InventoryUsageList } from '../components/inventory/InventoryUsageList';

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
  { status: 'scheduled', label: 'Scheduled', icon: '' },
  { status: 'confirmed', label: 'Confirmed', icon: '' },
  { status: 'checked-in', label: 'Checked In', icon: '' },
  { status: 'roomed', label: 'Roomed', icon: '' },
  { status: 'in-progress', label: 'In Progress', icon: '' },
  { status: 'checkout', label: 'Checkout', icon: '' },
  { status: 'completed', label: 'Completed', icon: '' },
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
  const [showInventoryModal, setShowInventoryModal] = useState(false);

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
    <div className="appointment-flow-page" style={{
      background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      <div className="page-header" style={{
        background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)',
        padding: '1.5rem 2rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px rgba(249, 115, 22, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h1 style={{
          color: '#ffffff',
          margin: 0,
          fontSize: '1.75rem',
          fontWeight: 700,
          textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '2rem' }}>📅</span>
          Appointment Flow
        </h1>
        <div className="header-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-picker"
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.95)',
              fontSize: '0.95rem',
              fontWeight: 500,
              color: '#f97316',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          />
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="provider-filter"
            style={{
              padding: '0.75rem 1rem',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.95)',
              fontSize: '0.95rem',
              fontWeight: 500,
              color: '#f97316',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              minWidth: '200px'
            }}
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
      <div className="flow-status-bar" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {APPOINTMENT_STEPS.map((step, index) => (
          <div key={step.status} className={`status-item ${step.status}`} style={{
            background: `linear-gradient(135deg, ${index % 2 === 0 ? '#fb923c' : '#fdba74'} 0%, ${index % 2 === 0 ? '#f97316' : '#fb923c'} 100%)`,
            padding: '1rem',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            border: '2px solid rgba(255,255,255,0.4)'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(249, 115, 22, 0.4)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.25)';
          }}>
            <span className="status-icon" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>{step.icon || '📋'}</span>
            <span className="status-count" style={{
              display: 'block',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#ffffff',
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)'
            }}>{statusCounts[step.status] || 0}</span>
            <span className="status-label" style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#ffffff',
              marginTop: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>{step.label}</span>
          </div>
        ))}
        {noShowCount > 0 && (
          <div className="status-item no-show" style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            padding: '1rem',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            border: '2px solid rgba(255,255,255,0.4)'
          }}>
            <span className="status-icon" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>❌</span>
            <span className="status-count" style={{
              display: 'block',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#ffffff',
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)'
            }}>{noShowCount}</span>
            <span className="status-label" style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#ffffff',
              marginTop: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>No-Show</span>
          </div>
        )}
      </div>

      {/* Appointment List with Flow Progress */}
      <Panel title={`${filteredAppointments.length} Appointments`}>
        {filteredAppointments.length === 0 ? (
          <div className="empty-state">
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
                    style={{
                      background: isNoShow ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)' : 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                      border: '2px solid #fb923c',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      marginBottom: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px rgba(249, 115, 22, 0.15)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isNoShow) {
                        e.currentTarget.style.transform = 'translateX(8px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(249, 115, 22, 0.3)';
                        e.currentTarget.style.borderColor = '#f97316';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isNoShow) {
                        e.currentTarget.style.transform = 'translateX(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(249, 115, 22, 0.15)';
                        e.currentTarget.style.borderColor = '#fb923c';
                      }
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
                              {isComplete && ''}
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
        size="lg"
      >
        {selectedAppointment && (
          <div className="appointment-detail" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="detail-section" style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid #fb923c'
            }}>
              <h4 style={{ color: '#c2410c', marginBottom: '0.75rem', fontWeight: 600 }}>Patient Information</h4>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Name:</span>
                <span className="value" style={{ color: '#292524' }}>{selectedAppointment.patientName || getPatientName(selectedAppointment.patientId)}</span>
              </div>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Appointment Type:</span>
                <span className="value" style={{ color: '#292524' }}>{selectedAppointment.appointmentTypeName}</span>
              </div>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Provider:</span>
                <span className="value" style={{ color: '#292524' }}>{getProviderName(selectedAppointment.providerId)}</span>
              </div>
            </div>

            <div className="detail-section" style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid #fb923c'
            }}>
              <h4 style={{ color: '#c2410c', marginBottom: '0.75rem', fontWeight: 600 }}>Schedule</h4>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Scheduled:</span>
                <span className="value" style={{ color: '#292524' }}>{new Date(selectedAppointment.scheduledStart).toLocaleString()}</span>
              </div>
              {selectedAppointment.arrivalTime && (
                <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Arrival:</span>
                  <span className="value" style={{ color: '#292524' }}>{new Date(selectedAppointment.arrivalTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.roomedTime && (
                <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Roomed:</span>
                  <span className="value" style={{ color: '#292524' }}>{new Date(selectedAppointment.roomedTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.startTime && (
                <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Visit Start:</span>
                  <span className="value" style={{ color: '#292524' }}>{new Date(selectedAppointment.startTime).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedAppointment.endTime && (
                <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="label" style={{ fontWeight: 500, color: '#78350f' }}>Visit End:</span>
                  <span className="value" style={{ color: '#292524' }}>{new Date(selectedAppointment.endTime).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            <div className="detail-section" style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              padding: '1rem',
              borderRadius: '8px',
              border: '2px solid #fb923c'
            }}>
              <h4 style={{ color: '#c2410c', marginBottom: '0.75rem', fontWeight: 600 }}>Current Status</h4>
              <div className="current-status-display" style={{
                padding: '0.75rem',
                background: 'white',
                borderRadius: '6px',
                textAlign: 'center',
                fontSize: '1.1rem',
                fontWeight: 600,
                color: '#f97316'
              }}>
                {APPOINTMENT_STEPS.find((s) => s.status === selectedAppointment.flowStatus)?.icon}{' '}
                {APPOINTMENT_STEPS.find((s) => s.status === selectedAppointment.flowStatus)?.label || selectedAppointment.flowStatus}
              </div>
            </div>

            {/* Inventory Usage Section - Only show if appointment is in-progress or later */}
            {selectedAppointment.flowStatus !== 'scheduled' &&
             selectedAppointment.flowStatus !== 'confirmed' &&
             selectedAppointment.flowStatus !== 'no-show' && (
              <div className="detail-section" style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                padding: '1rem',
                borderRadius: '8px',
                border: '2px solid #fbbf24'
              }}>
                <InventoryUsageList
                  appointmentId={selectedAppointment.id}
                  onOpenUsageModal={() => setShowInventoryModal(true)}
                />
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '2px solid #fed7aa'
        }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowDetailModal(false)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'white',
                border: '2px solid #fb923c',
                borderRadius: '8px',
                color: '#f97316',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Close
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {selectedAppointment &&
             selectedAppointment.flowStatus !== 'scheduled' &&
             selectedAppointment.flowStatus !== 'confirmed' &&
             selectedAppointment.flowStatus !== 'no-show' && (
              <button
                type="button"
                onClick={() => setShowInventoryModal(true)}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px rgba(251, 191, 36, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(251, 191, 36, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(251, 191, 36, 0.3)';
                }}
              >
                Record Inventory
              </button>
            )}
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
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  border: '2px solid #f97316',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px rgba(249, 115, 22, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(249, 115, 22, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(249, 115, 22, 0.3)';
                }}
              >
                Advance to Next Step
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Inventory Usage Modal */}
      {selectedAppointment && (
        <InventoryUsageModal
          isOpen={showInventoryModal}
          onClose={() => setShowInventoryModal(false)}
          appointmentId={selectedAppointment.id}
          patientId={selectedAppointment.patientId}
          providerId={selectedAppointment.providerId}
          onSuccess={() => {
            // Trigger refresh of inventory usage list
            if ((window as any).__refreshInventoryUsage) {
              (window as any).__refreshInventoryUsage();
            }
          }}
        />
      )}
    </div>
  );
}
