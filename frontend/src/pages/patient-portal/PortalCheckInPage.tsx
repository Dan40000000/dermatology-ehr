import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth, patientPortalFetch } from '../../contexts/PatientPortalAuthContext';
import ECheckInPage from '../Portal/ECheckInPage';

interface UpcomingAppointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  providerName: string;
  appointmentType?: string;
  status: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [rawHour, minutes = '00'] = timeStr.split(':');
  const hour = Number(rawHour);
  if (Number.isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function PortalCheckInPage() {
  const { isAuthenticated, isLoading, sessionToken, tenantId } = usePatientPortalAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const appointmentId = searchParams.get('appointmentId');

  useEffect(() => {
    if (!isAuthenticated || !sessionToken || !tenantId) return;
    if (appointmentId) return;

    const loadUpcomingAppointments = async () => {
      try {
        setLoadingAppointments(true);
        setError(null);
        const data = await patientPortalFetch('/api/patient-portal-data/appointments?status=upcoming');
        setAppointments(data.appointments || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load upcoming appointments');
      } finally {
        setLoadingAppointments(false);
      }
    };

    loadUpcomingAppointments();
  }, [isAuthenticated, sessionToken, tenantId, appointmentId]);

  if (isLoading) {
    return (
      <PatientPortalLayout>
        <div style={{ padding: '2rem' }}>Loading check-in...</div>
      </PatientPortalLayout>
    );
  }

  if (!isAuthenticated || !sessionToken || !tenantId) {
    return <Navigate to="/portal/login" replace />;
  }

  if (appointmentId) {
    return (
      <PatientPortalLayout>
        <ECheckInPage
          key={appointmentId}
          tenantId={tenantId}
          portalToken={sessionToken}
          appointmentId={appointmentId}
        />
      </PatientPortalLayout>
    );
  }

  return (
    <PatientPortalLayout>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '0.5rem' }}>Pre-Check-In</h1>
          <p style={{ color: '#64748b', margin: 0 }}>
            Select your appointment to complete demographics, insurance, intake forms, and required consents.
          </p>
        </header>

        {loadingAppointments ? (
          <div style={{ padding: '1rem 0' }}>Loading upcoming appointments...</div>
        ) : error ? (
          <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '0.75rem 1rem', borderRadius: 8 }}>
            {error}
          </div>
        ) : appointments.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
            No upcoming appointments available for check-in.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {appointments.map((appointment) => (
              <button
                key={appointment.id}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('appointmentId', appointment.id);
                  setSearchParams(next);
                }}
                style={{
                  textAlign: 'left',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '1rem',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{formatDate(appointment.appointmentDate)}</div>
                    <div style={{ color: '#475569' }}>
                      {formatTime(appointment.appointmentTime)} with {appointment.providerName}
                    </div>
                    {appointment.appointmentType ? (
                      <div style={{ color: '#64748b', fontSize: 14 }}>{appointment.appointmentType}</div>
                    ) : null}
                  </div>
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 999,
                      fontSize: 12,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      textTransform: 'capitalize',
                    }}
                  >
                    {appointment.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PatientPortalLayout>
  );
}
