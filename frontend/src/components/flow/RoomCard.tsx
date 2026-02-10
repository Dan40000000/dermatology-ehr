import React from 'react';
import { PatientStatusBadge, type FlowStatus } from './PatientStatusBadge';
import { QuickStatusUpdate } from './QuickStatusUpdate';

export interface RoomData {
  id: string;
  roomName: string;
  roomNumber: string;
  roomType: 'exam' | 'procedure' | 'consult' | 'triage';
  isActive: boolean;
}

export interface PatientInRoom {
  flowId: string;
  patientId: string;
  patientName: string;
  appointmentId: string;
  appointmentType: string;
  status: FlowStatus;
  statusChangedAt: string;
  waitTimeMinutes: number;
  providerName?: string;
  maName?: string;
  priority: string;
}

export interface RoomCardProps {
  room: RoomData;
  patient?: PatientInRoom;
  assignedProvider?: { id: string; name: string };
  onStatusChange: (appointmentId: string, newStatus: FlowStatus, roomId?: string) => Promise<void>;
  onPatientClick?: (patientId: string) => void;
  availableRooms?: Array<{ id: string; roomNumber: string; roomName: string }>;
  compact?: boolean;
}

const roomTypeIcons: Record<string, string> = {
  exam: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  procedure: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  consult: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  triage: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
};

const formatWaitTime = (minutes: number): string => {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const getWaitTimeColor = (minutes: number, status: FlowStatus): string => {
  // Different thresholds based on status
  const thresholds: Record<FlowStatus, { warning: number; danger: number }> = {
    checked_in: { warning: 5, danger: 10 },
    rooming: { warning: 5, danger: 10 },
    vitals_complete: { warning: 5, danger: 10 },
    ready_for_provider: { warning: 10, danger: 20 },
    with_provider: { warning: 20, danger: 40 },
    checkout: { warning: 5, danger: 10 },
    completed: { warning: 999, danger: 999 },
  };

  const threshold = thresholds[status] || { warning: 10, danger: 20 };

  if (minutes >= threshold.danger) return 'text-red-600 bg-red-50';
  if (minutes >= threshold.warning) return 'text-yellow-600 bg-yellow-50';
  return 'text-gray-600 bg-gray-100';
};

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  patient,
  assignedProvider,
  onStatusChange,
  onPatientClick,
  availableRooms = [],
  compact = false,
}) => {
  const isEmpty = !patient;
  const roomIcon = roomTypeIcons[room.roomType] || roomTypeIcons.exam;

  if (compact) {
    return (
      <div
        className={`
          rounded-lg border-2 p-3
          ${isEmpty ? 'border-gray-200 bg-gray-50' : 'border-blue-200 bg-white'}
          transition-all duration-200 hover:shadow-md
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{room.roomNumber}</span>
            {assignedProvider && (
              <span className="text-xs text-gray-500">{assignedProvider.name}</span>
            )}
          </div>
          {patient && (
            <PatientStatusBadge status={patient.status} size="sm" showIcon={false} />
          )}
        </div>

        {patient ? (
          <div>
            <button
              onClick={() => onPatientClick?.(patient.patientId)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {patient.patientName}
            </button>
            <div className="text-xs text-gray-500 mt-1">
              {patient.appointmentType}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic">Empty</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl border-2 shadow-sm overflow-hidden
        ${isEmpty ? 'border-gray-200 bg-gray-50' : 'border-blue-300 bg-white'}
        transition-all duration-200 hover:shadow-lg
      `}
    >
      {/* Room Header */}
      <div
        className={`
          px-4 py-3 flex items-center justify-between
          ${isEmpty ? 'bg-gray-100' : 'bg-blue-50'}
        `}
      >
        <div className="flex items-center gap-3">
          <div
            className={`
              p-2 rounded-lg
              ${isEmpty ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-600'}
            `}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={roomIcon}
              />
            </svg>
          </div>
          <div>
            <div className="font-bold text-lg text-gray-900">
              Room {room.roomNumber}
            </div>
            <div className="text-xs text-gray-500 capitalize">{room.roomType}</div>
          </div>
        </div>

        {assignedProvider && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Assigned</div>
            <div className="text-sm font-medium text-gray-700">
              {assignedProvider.name}
            </div>
          </div>
        )}
      </div>

      {/* Room Content */}
      <div className="p-4">
        {patient ? (
          <div className="space-y-3">
            {/* Patient Info */}
            <div className="flex items-start justify-between">
              <div>
                <button
                  onClick={() => onPatientClick?.(patient.patientId)}
                  className="text-lg font-semibold text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                >
                  {patient.patientName}
                </button>
                <div className="text-sm text-gray-600 mt-0.5">
                  {patient.appointmentType}
                </div>
                {patient.providerName && (
                  <div className="text-xs text-gray-500 mt-1">
                    Dr. {patient.providerName}
                  </div>
                )}
              </div>

              {/* Priority Badge */}
              {patient.priority !== 'normal' && (
                <span
                  className={`
                    px-2 py-1 rounded-full text-xs font-medium uppercase
                    ${patient.priority === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}
                  `}
                >
                  {patient.priority}
                </span>
              )}
            </div>

            {/* Status & Wait Time */}
            <div className="flex items-center justify-between">
              <PatientStatusBadge status={patient.status} size="md" />
              <div
                className={`
                  px-2 py-1 rounded-lg text-sm font-medium
                  ${getWaitTimeColor(patient.waitTimeMinutes, patient.status)}
                `}
              >
                {formatWaitTime(patient.waitTimeMinutes)}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-gray-100">
              <QuickStatusUpdate
                currentStatus={patient.status}
                appointmentId={patient.appointmentId}
                onStatusChange={onStatusChange}
                availableRooms={availableRooms}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <svg
              className="mx-auto h-12 w-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500">Room Available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomCard;
