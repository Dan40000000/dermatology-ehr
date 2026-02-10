import React from 'react';

export interface WaitTimeStats {
  locationId: string;
  locationName: string;
  avgCheckinToRooming: number | null;
  avgRoomingToVitals: number | null;
  avgVitalsToProvider: number | null;
  avgProviderToCheckout: number | null;
  avgTotalVisitTime: number | null;
  currentWaitingCount: number;
  currentWithProviderCount: number;
}

interface WaitTimeDisplayProps {
  stats: WaitTimeStats | null;
  isLoading?: boolean;
  compact?: boolean;
}

const formatTime = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return '--';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

const getTimeColor = (minutes: number | null, thresholds: { good: number; warning: number }): string => {
  if (minutes === null) return 'text-gray-400';
  if (minutes <= thresholds.good) return 'text-green-600';
  if (minutes <= thresholds.warning) return 'text-yellow-600';
  return 'text-red-600';
};

export const WaitTimeDisplay: React.FC<WaitTimeDisplayProps> = ({
  stats,
  isLoading = false,
  compact = false,
}) => {
  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow ${compact ? 'p-3' : 'p-4'}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`bg-white rounded-lg shadow ${compact ? 'p-3' : 'p-4'}`}>
        <div className="text-center text-gray-500">
          <svg
            className="mx-auto h-8 w-8 text-gray-400 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm">No wait time data available</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Wait Times</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              {stats.currentWaitingCount} waiting
            </span>
            <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
              {stats.currentWithProviderCount} with provider
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className={`text-lg font-bold ${getTimeColor(stats.avgCheckinToRooming, { good: 5, warning: 10 })}`}>
              {formatTime(stats.avgCheckinToRooming)}
            </div>
            <div className="text-xs text-gray-500">To Room</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${getTimeColor(stats.avgRoomingToVitals, { good: 5, warning: 10 })}`}>
              {formatTime(stats.avgRoomingToVitals)}
            </div>
            <div className="text-xs text-gray-500">Vitals</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${getTimeColor(stats.avgVitalsToProvider, { good: 10, warning: 20 })}`}>
              {formatTime(stats.avgVitalsToProvider)}
            </div>
            <div className="text-xs text-gray-500">Wait for MD</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${getTimeColor(stats.avgTotalVisitTime, { good: 30, warning: 45 })}`}>
              {formatTime(stats.avgTotalVisitTime)}
            </div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Wait Time Analytics</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-sm text-gray-600">
              {stats.currentWaitingCount} waiting
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-sm text-gray-600">
              {stats.currentWithProviderCount} with provider
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Check-in to Rooming */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Check-in to Room</span>
          </div>
          <div className={`text-2xl font-bold ${getTimeColor(stats.avgCheckinToRooming, { good: 5, warning: 10 })}`}>
            {formatTime(stats.avgCheckinToRooming)}
          </div>
        </div>

        {/* Rooming to Vitals */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Vitals</span>
          </div>
          <div className={`text-2xl font-bold ${getTimeColor(stats.avgRoomingToVitals, { good: 5, warning: 10 })}`}>
            {formatTime(stats.avgRoomingToVitals)}
          </div>
        </div>

        {/* Vitals to Provider */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Wait for Provider</span>
          </div>
          <div className={`text-2xl font-bold ${getTimeColor(stats.avgVitalsToProvider, { good: 10, warning: 20 })}`}>
            {formatTime(stats.avgVitalsToProvider)}
          </div>
        </div>

        {/* Provider to Checkout */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-500 uppercase tracking-wide">With Provider</span>
          </div>
          <div className={`text-2xl font-bold ${getTimeColor(stats.avgProviderToCheckout, { good: 15, warning: 30 })}`}>
            {formatTime(stats.avgProviderToCheckout)}
          </div>
        </div>

        {/* Total Visit Time */}
        <div className="bg-indigo-50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-indigo-600 uppercase tracking-wide font-medium">Total Visit</span>
          </div>
          <div className={`text-2xl font-bold ${getTimeColor(stats.avgTotalVisitTime, { good: 30, warning: 45 })}`}>
            {formatTime(stats.avgTotalVisitTime)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>On target</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
          <span>Slightly delayed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span>Delayed</span>
        </div>
      </div>
    </div>
  );
};

export default WaitTimeDisplay;
