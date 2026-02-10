/**
 * Wait Estimate Component
 *
 * Displays individual wait time estimate for a patient
 * Used in patient portal and kiosk check-in confirmation
 */

import { useMemo } from 'react';

interface WaitEstimateProps {
  patientName?: string;
  position: number;
  estimatedWaitMinutes: number;
  estimatedCallTime?: Date | string;
  checkInTime?: Date | string;
  providerName?: string | null;
  status: string;
  confidence?: 'high' | 'medium' | 'low';
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function WaitEstimate({
  patientName,
  position,
  estimatedWaitMinutes,
  estimatedCallTime,
  checkInTime,
  providerName,
  status,
  confidence = 'medium',
  showDetails = true,
  compact = false,
  className = '',
}: WaitEstimateProps) {
  const formatTime = (time: Date | string | undefined): string => {
    if (!time) return '--';
    const date = typeof time === 'string' ? new Date(time) : time;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatWaitTime = (minutes: number): string => {
    if (minutes < 5) return 'Less than 5 minutes';
    if (minutes < 60) return `About ${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `About ${hours} hour${hours > 1 ? 's' : ''}`;
    return `About ${hours}h ${mins}m`;
  };

  const waitedSoFar = useMemo(() => {
    if (!checkInTime) return 0;
    const checkIn = typeof checkInTime === 'string' ? new Date(checkInTime) : checkInTime;
    return Math.round((Date.now() - checkIn.getTime()) / 60000);
  }, [checkInTime]);

  const getConfidenceInfo = () => {
    switch (confidence) {
      case 'high':
        return { color: 'text-green-600', label: 'Accurate estimate' };
      case 'medium':
        return { color: 'text-yellow-600', label: 'Approximate' };
      case 'low':
        return { color: 'text-orange-600', label: 'May vary' };
      default:
        return { color: 'text-gray-600', label: '' };
    }
  };

  const confidenceInfo = getConfidenceInfo();

  if (compact) {
    return (
      <div className={`wait-estimate-compact bg-blue-50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-full p-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-blue-600">Estimated wait</p>
              <p className="text-xl font-bold text-blue-800">
                {formatWaitTime(estimatedWaitMinutes)}
              </p>
            </div>
          </div>
          {position > 0 && (
            <div className="text-right">
              <p className="text-sm text-gray-500">Position</p>
              <p className="text-2xl font-bold text-gray-700">#{position}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`wait-estimate bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium opacity-90">Your Wait Time</h3>
            {patientName && (
              <p className="text-2xl font-bold mt-1">{patientName}</p>
            )}
          </div>
          <div className="bg-white/20 rounded-full p-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Estimated wait */}
        <div className="text-center mb-6">
          <p className="text-gray-500 text-sm mb-1">Estimated Wait</p>
          <p className="text-4xl font-bold text-gray-800">
            {formatWaitTime(estimatedWaitMinutes)}
          </p>
          <p className={`text-sm mt-1 ${confidenceInfo.color}`}>
            {confidenceInfo.label}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500 text-sm">Your Position</p>
            <p className="text-3xl font-bold text-gray-800">#{position}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500 text-sm">Expected By</p>
            <p className="text-2xl font-bold text-gray-800">
              {formatTime(estimatedCallTime)}
            </p>
          </div>
        </div>

        {showDetails && (
          <>
            {/* Provider info */}
            {providerName && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="text-sm text-blue-600">Your Provider</p>
                  <p className="font-medium text-blue-800">{providerName}</p>
                </div>
              </div>
            )}

            {/* Check-in time and waited so far */}
            {checkInTime && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">
                    Checked in at {formatTime(checkInTime)}
                  </p>
                  {waitedSoFar > 0 && (
                    <p className="text-sm text-gray-600">
                      Waited: {waitedSoFar} minute{waitedSoFar !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          You will be called when it is your turn. Please remain in the waiting area.
        </p>
      </div>
    </div>
  );
}

export default WaitEstimate;
