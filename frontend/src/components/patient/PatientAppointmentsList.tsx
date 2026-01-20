import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientAppointments } from '../../api';
import { Skeleton } from '../ui';
import { Calendar, Clock, User, MapPin } from 'lucide-react';

interface PatientAppointmentsListProps {
  patientId: string;
}

export function PatientAppointmentsList({ patientId }: PatientAppointmentsListProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-appointments', patientId],
    queryFn: () => fetchPatientAppointments(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const appointments = data?.appointments || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return '#3b82f6';
      case 'confirmed': return '#10b981';
      case 'checked-in': return '#8b5cf6';
      case 'in-progress': return '#f59e0b';
      case 'completed': return '#6b7280';
      case 'cancelled': return '#ef4444';
      case 'no-show': return '#dc2626';
      default: return '#9ca3af';
    }
  };

  const isUpcoming = (dateStr: string) => {
    return new Date(dateStr) > new Date();
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={100} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#fee2e2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '1rem',
        color: '#991b1b'
      }}>
        Failed to load appointments
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <Calendar size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Appointments</h3>
        <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
          This patient has no scheduled appointments.
        </p>
        <button
          className="ema-action-btn"
          onClick={() => navigate(`/schedule?patientId=${patientId}`)}
        >
          Schedule Appointment
        </button>
      </div>
    );
  }

  const upcomingAppointments = appointments.filter((apt: any) =>
    isUpcoming(apt.scheduledStart) && apt.status !== 'cancelled'
  );
  const pastAppointments = appointments.filter((apt: any) =>
    !isUpcoming(apt.scheduledStart) || apt.status === 'cancelled'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Upcoming Appointments
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcomingAppointments.map((appointment: any) => (
              <div
                key={appointment.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeftColor: getStatusColor(appointment.status),
                  borderLeftWidth: '4px'
                }}
                onClick={() => navigate(`/schedule?appointmentId=${appointment.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = getStatusColor(appointment.status);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.borderLeftColor = getStatusColor(appointment.status);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Calendar size={16} style={{ color: '#6b7280' }} />
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {formatDate(appointment.scheduledStart)}
                      </span>
                      <Clock size={16} style={{ color: '#6b7280', marginLeft: '0.5rem' }} />
                      <span style={{ color: '#6b7280' }}>
                        {formatTime(appointment.scheduledStart)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <User size={16} style={{ color: '#6b7280' }} />
                      <span style={{ color: '#374151' }}>
                        {appointment.providerName || 'Provider TBD'}
                      </span>
                    </div>

                    {appointment.appointmentType && (
                      <div style={{
                        display: 'inline-block',
                        background: '#f3f4f6',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.875rem',
                        color: '#374151',
                        marginTop: '0.5rem'
                      }}>
                        {appointment.appointmentType}
                      </div>
                    )}

                    {appointment.chiefComplaint && (
                      <p style={{
                        margin: '0.5rem 0 0',
                        color: '#6b7280',
                        fontSize: '0.875rem'
                      }}>
                        {appointment.chiefComplaint}
                      </p>
                    )}
                  </div>

                  <div style={{
                    padding: '0.375rem 0.75rem',
                    background: getStatusColor(appointment.status) + '20',
                    color: getStatusColor(appointment.status),
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {appointment.status.replace('-', ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Past Appointments
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pastAppointments.slice(0, 10).map((appointment: any) => (
              <div
                key={appointment.id}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/schedule?appointmentId=${appointment.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500, color: '#374151' }}>
                        {formatDate(appointment.scheduledStart)}
                      </span>
                      <span style={{ color: '#9ca3af' }}>•</span>
                      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        {appointment.providerName || 'Provider TBD'}
                      </span>
                    </div>
                    {appointment.appointmentType && (
                      <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        {appointment.appointmentType}
                      </span>
                    )}
                  </div>

                  <div style={{
                    padding: '0.25rem 0.5rem',
                    background: getStatusColor(appointment.status) + '20',
                    color: getStatusColor(appointment.status),
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {appointment.status.replace('-', ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
