import React, { useState, useEffect } from 'react';

interface AppointmentReminder {
  id: string;
  reminderType: 'sms' | 'email';
  reminderCategory: string;
  scheduledFor: string;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
}

interface ConfirmationResponse {
  id: string;
  responseType: 'confirmed' | 'cancelled' | 'rescheduled' | 'unknown';
  responseAt: string;
  responseChannel: string;
}

interface ConfirmationStatusProps {
  tenantId: string;
  accessToken: string;
  appointmentId: string;
  patientId?: string;
  compact?: boolean;
  showReminders?: boolean;
  onStatusChange?: (status: 'confirmed' | 'cancelled' | 'pending') => void;
}

export function ConfirmationStatus({
  tenantId,
  accessToken,
  appointmentId,
  patientId,
  compact = false,
  showReminders = true,
  onStatusChange,
}: ConfirmationStatusProps) {
  const [confirmationStatus, setConfirmationStatus] = useState<
    'confirmed' | 'cancelled' | 'pending' | 'unknown'
  >('unknown');
  const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
  const [response, setResponse] = useState<ConfirmationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [tenantId, accessToken, appointmentId]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      // Fetch reminders for this appointment
      const remindersRes = await fetch(
        `/api/reminders/queue?appointmentId=${appointmentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-tenant-id': tenantId,
          },
        }
      );

      if (remindersRes.ok) {
        const data = await remindersRes.json();
        const appointmentReminders = (data.reminders || []).filter(
          (r: AppointmentReminder & { appointmentId: string }) =>
            r.appointmentId === appointmentId
        );
        setReminders(appointmentReminders);

        // Check for confirmation responses
        const sentReminders = appointmentReminders.filter(
          (r: AppointmentReminder) => r.status === 'sent'
        );
        if (sentReminders.length > 0) {
          // Check appointment confirmation status from appointment data
          const apptRes = await fetch(`/api/appointments/${appointmentId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'x-tenant-id': tenantId,
            },
          });

          if (apptRes.ok) {
            const apptData = await apptRes.json();
            const appt = apptData.appointment || apptData;
            if (appt.confirmationStatus === 'confirmed') {
              setConfirmationStatus('confirmed');
            } else if (appt.status === 'cancelled') {
              setConfirmationStatus('cancelled');
            } else if (sentReminders.length > 0) {
              setConfirmationStatus('pending');
            }
          }
        } else if (appointmentReminders.some((r: AppointmentReminder) => r.status === 'pending')) {
          setConfirmationStatus('pending');
        }
      }
    } catch (err) {
      console.error('Error fetching confirmation status', err);
    } finally {
      setLoading(false);
    }
  };

  const manuallyConfirm = async () => {
    try {
      const res = await fetch(`/api/reminders/webhook/response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          appointmentId,
          response: 'confirmed',
          channel: 'phone',
        }),
      });

      if (res.ok) {
        setConfirmationStatus('confirmed');
        onStatusChange?.('confirmed');
      }
    } catch (err) {
      console.error('Error confirming appointment', err);
    }
  };

  const scheduleReminders = async () => {
    try {
      const res = await fetch(`/api/reminders/appointment/${appointmentId}/schedule`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (res.ok) {
        fetchStatus();
      }
    } catch (err) {
      console.error('Error scheduling reminders', err);
    }
  };

  const getStatusIcon = () => {
    switch (confirmationStatus) {
      case 'confirmed':
        return (
          <div className="flex items-center text-green-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {!compact && <span className="ml-1 text-sm font-medium">Confirmed</span>}
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center text-red-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {!compact && <span className="ml-1 text-sm font-medium">Cancelled</span>}
          </div>
        );
      case 'pending':
        return (
          <div className="flex items-center text-yellow-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {!compact && <span className="ml-1 text-sm font-medium">Awaiting</span>}
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {!compact && <span className="ml-1 text-sm font-medium">No Reminder</span>}
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse flex items-center">
        <div className="w-5 h-5 bg-gray-200 rounded-full" />
        {!compact && <div className="ml-2 w-16 h-4 bg-gray-200 rounded" />}
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="cursor-pointer"
        onClick={() => setShowDetails(true)}
        title={`Confirmation: ${confirmationStatus}`}
      >
        {getStatusIcon()}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          {confirmationStatus === 'pending' && (
            <button
              onClick={manuallyConfirm}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Mark Confirmed
            </button>
          )}
        </div>
        {showReminders && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showDetails ? 'Hide' : 'Details'}
          </button>
        )}
      </div>

      {showDetails && showReminders && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-gray-700">Reminders</span>
            {reminders.length === 0 && (
              <button
                onClick={scheduleReminders}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Schedule Reminders
              </button>
            )}
          </div>

          {reminders.length > 0 ? (
            <div className="space-y-2">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        reminder.reminderType === 'sms'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {reminder.reminderType.toUpperCase()}
                    </span>
                    <span className="text-gray-600">
                      {reminder.reminderCategory.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        reminder.status === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : reminder.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : reminder.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {reminder.status}
                    </span>
                    {reminder.sentAt ? (
                      <span className="text-gray-400">
                        {new Date(reminder.sentAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        {new Date(reminder.scheduledFor).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-xs">No reminders scheduled</p>
          )}

          {response && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-gray-600">Response received: </span>
              <span
                className={`font-medium ${
                  response.responseType === 'confirmed'
                    ? 'text-green-600'
                    : response.responseType === 'cancelled'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}
              >
                {response.responseType}
              </span>
              <span className="text-gray-400 ml-2">
                via {response.responseChannel} at{' '}
                {new Date(response.responseAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
