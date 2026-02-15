import React from 'react';
import { format, differenceInMinutes } from 'date-fns';
import type { AppointmentWithDetails } from './TodaySchedulePanel';

interface UpcomingAlertsProps {
  upcomingAppointments: AppointmentWithDetails[];
  isLoading?: boolean;
}

export const UpcomingAlerts: React.FC<UpcomingAlertsProps> = ({
  upcomingAppointments,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
        </div>
        <div className="p-6 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const getMinutesUntil = (scheduledTime: string): number => {
    return differenceInMinutes(new Date(scheduledTime), new Date());
  };

  const hasIssues = (appointment: AppointmentWithDetails): boolean => {
    return (
      !appointment.insuranceVerified ||
      (appointment.outstandingBalance !== undefined &&
        appointment.outstandingBalance > 100)
    );
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-indigo-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">
            Arriving Soon
          </h2>
        </div>
      </div>

      {/* Upcoming List */}
      <div className="divide-y divide-gray-200">
        {upcomingAppointments.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No upcoming appointments
          </div>
        ) : (
          upcomingAppointments.map((appointment) => {
            const minutesUntil = getMinutesUntil(appointment.scheduledStart);
            const issues = hasIssues(appointment);

            return (
              <div
                key={appointment.id}
                className={`px-6 py-4 ${
                  issues ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  {/* Patient Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-gray-900">
                        {appointment.patientFirstName}{' '}
                        {appointment.patientLastName}
                      </div>
                      {minutesUntil <= 15 && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                          {minutesUntil} min
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {format(new Date(appointment.scheduledStart), 'h:mm a')} •{' '}
                      {appointment.providerName}
                    </div>

                    {/* Issues/Alerts */}
                    {issues && (
                      <div className="space-y-1">
                        {!appointment.insuranceVerified && (
                          <div className="flex items-center gap-2 text-yellow-700">
                            <svg
                              className="w-4 h-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                            <span className="text-xs font-medium">
                              Insurance needs verification
                            </span>
                          </div>
                        )}
                        {appointment.outstandingBalance &&
                          appointment.outstandingBalance > 100 && (
                            <div className="flex items-center gap-2 text-red-700">
                              <svg
                                className="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              <span className="text-xs font-medium">
                                Outstanding balance: $
                                {appointment.outstandingBalance.toFixed(2)}
                              </span>
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Quick Info */}
                  <div className="text-right">
                    {appointment.copayAmount !== undefined && (
                      <div className="text-sm">
                        <span className="text-gray-600">Copay:</span>{' '}
                        <span className="font-semibold text-gray-900">
                          ${appointment.copayAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary Footer */}
      {upcomingAppointments.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              Next {upcomingAppointments.length} appointment(s)
            </div>
            {upcomingAppointments.filter(hasIssues).length > 0 && (
              <div className="flex items-center gap-2 text-yellow-700 font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {upcomingAppointments.filter(hasIssues).length} requires attention
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
