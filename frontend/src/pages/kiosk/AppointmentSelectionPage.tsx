import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

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

      // Filter appointments for this patient
      const patientAppointments = data.appointments.filter(
        (apt: any) => apt.patientId === patientId
      );

      setAppointments(patientAppointments);

      // Auto-select if only one appointment
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

  if (loading) {
    return (
      <KioskLayout currentStep={1} totalSteps={6} stepName="Loading..." onTimeout={handleTimeout}>
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-2xl text-gray-600">Finding your appointments...</p>
        </div>
      </KioskLayout>
    );
  }

  return (
    <KioskLayout currentStep={1} totalSteps={6} stepName="Select Appointment" onTimeout={handleTimeout}>
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome, {patientName}!</h2>

        {appointments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">No Appointments Found</h3>
            <p className="text-xl text-gray-600 mb-8">
              We couldn't find any scheduled appointments for you today.
            </p>
            <p className="text-lg text-gray-500">
              Please see the front desk staff for assistance.
            </p>
            <button
              onClick={handleBack}
              className="mt-8 px-12 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
            >
              Go Back
            </button>
          </div>
        ) : (
          <>
            <p className="text-xl text-gray-600 mb-8">
              {appointments.length === 1
                ? 'We found your appointment for today:'
                : 'Please select your appointment:'}
            </p>

            <div className="space-y-4 mb-8">
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  onClick={() => setSelectedAppointmentId(appointment.id)}
                  className={`w-full p-6 rounded-xl text-left transition-all ${
                    selectedAppointmentId === appointment.id
                      ? 'bg-purple-100 border-4 border-purple-500'
                      : 'bg-gray-50 border-2 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-gray-900 mb-2">
                        {formatTime(appointment.scheduledStart)}
                      </div>
                      <div className="text-xl text-gray-700 mb-1">
                        Provider: {appointment.providerName}
                      </div>
                      <div className="text-lg text-gray-600">
                        Type: {appointment.appointmentType}
                      </div>
                    </div>
                    {selectedAppointmentId === appointment.id && (
                      <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                <p className="text-lg text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleBack}
                className="flex-1 py-5 text-xl font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={startCheckIn}
                disabled={!selectedAppointmentId}
                className="flex-1 py-5 text-xl font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
