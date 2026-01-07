import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

interface Appointment {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  providerName: string;
  appointmentType: string;
  status: string;
}

export function KioskAppointmentSelectionPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const patientId = sessionStorage.getItem('kioskPatientId');
  const patientName = sessionStorage.getItem('kioskPatientName');

  useEffect(() => {
    if (!patientId) {
      navigate('/kiosk');
      return;
    }

    fetchTodayAppointments();
  }, [patientId]);

  const fetchTodayAppointments = async () => {
    try {
      const response = await fetch('/api/kiosk/today-appointments', {
        headers: {
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }

      const data = await response.json();

      const patientAppointments = data.appointments.filter(
        (apt: any) => apt.patientId === patientId
      );

      setAppointments(patientAppointments);

      if (patientAppointments.length === 1) {
        setSelectedAppointmentId(patientAppointments[0].id);
      }
    } catch (err) {
      setError('Unable to find your appointments. Please see the front desk.');
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeout = () => {
    sessionStorage.clear();
    navigate('/kiosk');
  };

  const handleBack = () => {
    navigate('/kiosk/verify');
  };

  const startCheckIn = async () => {
    if (!selectedAppointmentId) {
      setError('Please select an appointment');
      return;
    }

    try {
      const response = await fetch('/api/kiosk/checkin/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Code': localStorage.getItem('kioskCode') || 'KIOSK-001',
          'X-Tenant-Id': localStorage.getItem('tenantId') || 'modmed-demo',
        },
        body: JSON.stringify({
          patientId,
          appointmentId: selectedAppointmentId,
          verificationMethod: 'kiosk',
          verificationValue: 'tablet-checkin',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start check-in');
      }

      const data = await response.json();
      sessionStorage.setItem('kioskSessionId', data.sessionId);

      navigate('/kiosk/demographics');
    } catch (err) {
      setError('Unable to start check-in. Please see the front desk.');
      console.error('Error starting check-in:', err);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const cardStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '1rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    padding: '2rem',
  };

  if (loading) {
    return (
      <KioskLayout currentStep={1} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div className="kiosk-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1.5rem', color: '#4b5563' }}>Finding your appointments...</p>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={1} totalSteps={6} stepName="Select Appointment" onTimeout={handleTimeout}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
          Welcome, {patientName}!
        </h2>

        {appointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <div style={{
              width: '6rem',
              height: '6rem',
              background: '#fef3c7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <svg style={{ width: '3rem', height: '3rem', color: '#d97706' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              No Appointments Found
            </h3>
            <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
              We couldn't find any scheduled appointments for you today.
            </p>
            <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
              Please see the front desk staff for assistance.
            </p>
            <button onClick={handleBack} className="kiosk-btn-primary" style={{ marginTop: '2rem', padding: '1.25rem 3rem' }}>
              Go Back
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '2rem' }}>
              {appointments.length === 1
                ? 'We found your appointment for today:'
                : 'Please select your appointment:'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  onClick={() => setSelectedAppointmentId(appointment.id)}
                  style={{
                    width: '100%',
                    padding: '1.5rem',
                    borderRadius: '0.75rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: selectedAppointmentId === appointment.id ? '#ede9fe' : '#f9fafb',
                    border: selectedAppointmentId === appointment.id ? '4px solid #7c3aed' : '2px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
                        {formatTime(appointment.scheduledStart)}
                      </div>
                      <div style={{ fontSize: '1.25rem', color: '#374151', marginBottom: '0.25rem' }}>
                        Provider: {appointment.providerName}
                      </div>
                      <div style={{ fontSize: '1.125rem', color: '#4b5563' }}>
                        Type: {appointment.appointmentType}
                      </div>
                    </div>
                    {selectedAppointmentId === appointment.id && (
                      <div style={{
                        width: '3rem',
                        height: '3rem',
                        background: '#7c3aed',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <svg style={{ width: '2rem', height: '2rem', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {error && <div className="kiosk-error">{error}</div>}

            <div className="kiosk-nav-buttons">
              <button onClick={handleBack} className="kiosk-btn-secondary" style={{ flex: 1 }}>
                Back
              </button>
              <button
                onClick={startCheckIn}
                disabled={!selectedAppointmentId}
                className="kiosk-btn-primary"
                style={{ flex: 1 }}
              >
                Continue Check-In
              </button>
            </div>
          </>
        )}
      </div>
    </KioskLayout>
  );
}
