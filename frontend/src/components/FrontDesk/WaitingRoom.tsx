import React from 'react';
import { format } from 'date-fns';

export interface WaitingRoomPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  scheduledTime: string;
  arrivedAt: string;
  waitTimeMinutes: number;
  isDelayed: boolean;
}

interface WaitingRoomProps {
  patients: WaitingRoomPatient[];
  onMoveToRoom: (appointmentId: string) => void;
  isLoading?: boolean;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  patients,
  onMoveToRoom,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
        </div>
        <div className="p-6 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Waiting Room</h2>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-blue-600">
              {patients.length}
            </div>
            <div className="text-sm text-gray-600">waiting</div>
          </div>
        </div>
      </div>

      {/* Patient List */}
      <div className="divide-y divide-gray-200">
        {patients.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No patients waiting
          </div>
        ) : (
          patients.map((patient) => (
            <div
              key={patient.appointmentId}
              className={`px-6 py-4 hover:bg-gray-50 transition-colors ${
                patient.isDelayed ? 'bg-orange-50 border-l-4 border-orange-500' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                {/* Patient Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-lg font-semibold text-gray-900">
                      {patient.patientName}
                    </div>
                    {patient.isDelayed && (
                      <div className="flex items-center gap-1 text-orange-600 bg-orange-100 px-2 py-1 rounded-full text-xs font-medium">
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
                        Delayed
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {patient.providerName} •{' '}
                    {format(new Date(patient.scheduledTime), 'h:mm a')}
                  </div>
                </div>

                {/* Wait Time */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      Wait Time
                    </div>
                    <div
                      className={`text-2xl font-bold ${
                        patient.waitTimeMinutes > 20
                          ? 'text-red-600'
                          : patient.waitTimeMinutes > 15
                          ? 'text-orange-600'
                          : 'text-green-600'
                      }`}
                    >
                      {patient.waitTimeMinutes}
                      <span className="text-sm ml-1">min</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => onMoveToRoom(patient.appointmentId)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-sm transition-colors"
                  >
                    Move to Room
                  </button>
                </div>
              </div>

              {/* Arrived Time */}
              <div className="mt-2 text-xs text-gray-500">
                Arrived at {format(new Date(patient.arrivedAt), 'h:mm a')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alert for long waits */}
      {patients.some((p) => p.waitTimeMinutes > 20) && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">
              {patients.filter((p) => p.waitTimeMinutes > 20).length} patient(s)
              waiting over 20 minutes
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
