/**
 * Queue Board Component
 *
 * Displays the patient queue for waiting room displays
 * Shows anonymized patient names and wait status
 */

import { useMemo } from 'react';

export interface QueueEntry {
  displayName: string;
  queueNumber: number | null;
  position: number | null;
  status: 'waiting' | 'called' | 'in_room' | 'complete' | 'no_show';
  providerName: string | null;
  estimatedWaitMinutes: number | null;
  roomNumber: string | null;
}

interface QueueBoardProps {
  queue: QueueEntry[];
  showPosition?: boolean;
  showEstimatedTime?: boolean;
  showProviderNames?: boolean;
  maxDisplayCount?: number;
  className?: string;
}

export function QueueBoard({
  queue,
  showPosition = true,
  showEstimatedTime = true,
  showProviderNames = true,
  maxDisplayCount = 10,
  className = '',
}: QueueBoardProps) {
  // Separate waiting and called patients
  const { waiting, called } = useMemo(() => {
    const waitingPatients = queue.filter((p) => p.status === 'waiting');
    const calledPatients = queue.filter((p) => p.status === 'called');
    return {
      waiting: waitingPatients.slice(0, maxDisplayCount),
      called: calledPatients,
    };
  }, [queue, maxDisplayCount]);

  const formatWaitTime = (minutes: number | null): string => {
    if (minutes === null) return '--';
    if (minutes < 5) return '< 5 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'called':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_room':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'waiting':
        return 'Waiting';
      case 'called':
        return 'Ready';
      case 'in_room':
        return 'With Provider';
      default:
        return status;
    }
  };

  return (
    <div className={`queue-board ${className}`}>
      {/* Called patients - highlighted section */}
      {called.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            Now Calling
          </h3>
          <div className="space-y-2">
            {called.map((patient, index) => (
              <div
                key={`called-${index}`}
                className="bg-green-50 border-2 border-green-400 rounded-lg p-4 animate-pulse-slow"
              >
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-green-800">
                    {patient.displayName}
                  </span>
                  {patient.roomNumber && (
                    <span className="text-xl font-semibold text-green-700">
                      Room {patient.roomNumber}
                    </span>
                  )}
                </div>
                {showProviderNames && patient.providerName && (
                  <p className="text-green-600 mt-1">
                    {patient.providerName}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waiting patients */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Waiting ({waiting.length})
        </h3>

        {waiting.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No patients currently waiting</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {showPosition && (
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      #
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    Patient
                  </th>
                  {showProviderNames && (
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Provider
                    </th>
                  )}
                  {showEstimatedTime && (
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Est. Wait
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {waiting.map((patient, index) => (
                  <tr key={`waiting-${index}`} className="hover:bg-gray-50">
                    {showPosition && (
                      <td className="px-4 py-3 text-lg font-bold text-gray-700">
                        {patient.position ?? index + 1}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-lg font-medium text-gray-900">
                        {patient.displayName}
                      </span>
                    </td>
                    {showProviderNames && (
                      <td className="px-4 py-3 text-gray-600">
                        {patient.providerName || '--'}
                      </td>
                    )}
                    {showEstimatedTime && (
                      <td className="px-4 py-3">
                        <span className="text-gray-700 font-medium">
                          {formatWaitTime(patient.estimatedWaitMinutes)}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-sm font-medium rounded-full border ${getStatusColor(patient.status)}`}
                      >
                        {getStatusLabel(patient.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {queue.filter((p) => p.status === 'waiting').length > maxDisplayCount && (
          <p className="text-center text-gray-500 mt-4 text-sm">
            + {queue.filter((p) => p.status === 'waiting').length - maxDisplayCount} more patients waiting
          </p>
        )}
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default QueueBoard;
