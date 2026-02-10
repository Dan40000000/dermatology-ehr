import React, { useState } from 'react';
import type { FlowStatus } from './PatientStatusBadge';

interface QuickStatusUpdateProps {
  currentStatus: FlowStatus;
  appointmentId: string;
  onStatusChange: (appointmentId: string, newStatus: FlowStatus, roomId?: string) => Promise<void>;
  availableRooms?: Array<{ id: string; roomNumber: string; roomName: string }>;
  disabled?: boolean;
}

// Define valid status transitions
const statusTransitions: Record<FlowStatus, FlowStatus[]> = {
  checked_in: ['rooming'],
  rooming: ['vitals_complete', 'checked_in'],
  vitals_complete: ['ready_for_provider', 'rooming'],
  ready_for_provider: ['with_provider', 'vitals_complete'],
  with_provider: ['checkout', 'ready_for_provider'],
  checkout: ['completed', 'with_provider'],
  completed: [],
};

const statusButtons: Record<FlowStatus, { label: string; shortLabel: string; color: string }> = {
  checked_in: {
    label: 'Check In',
    shortLabel: 'Check In',
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  rooming: {
    label: 'Start Rooming',
    shortLabel: 'Room',
    color: 'bg-yellow-600 hover:bg-yellow-700',
  },
  vitals_complete: {
    label: 'Vitals Complete',
    shortLabel: 'Vitals',
    color: 'bg-purple-600 hover:bg-purple-700',
  },
  ready_for_provider: {
    label: 'Ready for Provider',
    shortLabel: 'Ready',
    color: 'bg-orange-600 hover:bg-orange-700',
  },
  with_provider: {
    label: 'Provider In',
    shortLabel: 'Provider',
    color: 'bg-indigo-600 hover:bg-indigo-700',
  },
  checkout: {
    label: 'Start Checkout',
    shortLabel: 'Checkout',
    color: 'bg-teal-600 hover:bg-teal-700',
  },
  completed: {
    label: 'Complete Visit',
    shortLabel: 'Complete',
    color: 'bg-green-600 hover:bg-green-700',
  },
};

export const QuickStatusUpdate: React.FC<QuickStatusUpdateProps> = ({
  currentStatus,
  appointmentId,
  onStatusChange,
  availableRooms = [],
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showRoomSelect, setShowRoomSelect] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<FlowStatus | null>(null);

  const nextStatuses = statusTransitions[currentStatus] || [];

  const handleStatusClick = async (newStatus: FlowStatus) => {
    // If transitioning to rooming and rooms are available, show room selection
    if (newStatus === 'rooming' && availableRooms.length > 0) {
      setPendingStatus(newStatus);
      setShowRoomSelect(true);
      return;
    }

    await performStatusChange(newStatus);
  };

  const handleRoomSelect = async (roomId: string) => {
    if (pendingStatus) {
      await performStatusChange(pendingStatus, roomId);
    }
    setShowRoomSelect(false);
    setPendingStatus(null);
  };

  const performStatusChange = async (newStatus: FlowStatus, roomId?: string) => {
    setIsLoading(true);
    try {
      await onStatusChange(appointmentId, newStatus, roomId);
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (nextStatuses.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">Visit completed</div>
    );
  }

  return (
    <div className="relative">
      {/* Room selection modal */}
      {showRoomSelect && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-10 min-w-[200px]">
          <div className="text-sm font-medium text-gray-700 mb-2">Select Room:</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {availableRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleRoomSelect(room.id)}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium">{room.roomNumber}</span>
                <span className="text-gray-500 ml-1">- {room.roomName}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowRoomSelect(false);
              setPendingStatus(null);
            }}
            className="mt-2 w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Status buttons */}
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => {
          const config = statusButtons[status];
          const isPrimary = nextStatuses.indexOf(status) === 0;

          return (
            <button
              key={status}
              onClick={() => handleStatusClick(status)}
              disabled={disabled || isLoading}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium text-white
                transition-all duration-150
                ${isPrimary ? config.color : 'bg-gray-400 hover:bg-gray-500'}
                ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Updating...
                </span>
              ) : (
                config.shortLabel
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickStatusUpdate;
