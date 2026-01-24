import { useState, useEffect } from 'react';
import { useMetricsContext } from './MetricsProvider';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

// ================================================
// TYPES
// ================================================

interface EfficiencyStats {
  currentDuration: number; // seconds
  currentClicks: number;
  averageDuration: number;
  averageClicks: number;
  percentFaster: number;
  percentFewerClicks: number;
  estimatedTimeSaved: number; // seconds
}

interface EfficiencyBadgeProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  compact?: boolean;
  showDetails?: boolean;
}

// ================================================
// COMPONENT
// ================================================

export function EfficiencyBadge({
  position = 'top-right',
  compact = false,
  showDetails = true,
}: EfficiencyBadgeProps) {
  const { currentEncounterMetrics, isOnline } = useMetricsContext();
  const { session } = useAuth();
  const [stats, setStats] = useState<EfficiencyStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(!compact);

  // ================================================
  // POSITION STYLES
  // ================================================

  const positionStyles = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  // ================================================
  // CALCULATE CURRENT METRICS
  // ================================================

  const currentDuration = currentEncounterMetrics
    ? Math.floor((Date.now() - currentEncounterMetrics.startTime) / 1000)
    : 0;

  const currentClicks = currentEncounterMetrics?.clicks || 0;

  // ================================================
  // FETCH AVERAGE METRICS
  // ================================================

  useEffect(() => {
    if (!session || !currentEncounterMetrics || !isOnline) return;

    const fetchAverages = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/metrics/summary?period=30d`,
          {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }
        );

        if (!response.ok) return;

        const data = await response.json();

        // Calculate comparison
        const avgDuration = data.averageEncounterDuration || 195; // Default: 3:15
        const avgClicks = data.averageClicks || 18;

        const percentFaster = avgDuration > 0
          ? Math.round(((avgDuration - currentDuration) / avgDuration) * 100)
          : 0;

        const percentFewerClicks = avgClicks > 0
          ? Math.round(((avgClicks - currentClicks) / avgClicks) * 100)
          : 0;

        const timeSaved = avgDuration - currentDuration;

        setStats({
          currentDuration,
          currentClicks,
          averageDuration: avgDuration,
          averageClicks: avgClicks,
          percentFaster,
          percentFewerClicks,
          estimatedTimeSaved: timeSaved,
        });
      } catch (error) {
        console.error('Failed to fetch efficiency stats:', error);
      }
    };

    // Fetch on mount and every 10 seconds
    fetchAverages();
    const interval = setInterval(fetchAverages, 10000);

    return () => clearInterval(interval);
  }, [session, currentEncounterMetrics, currentDuration, currentClicks, isOnline]);

  // ================================================
  // HELPERS
  // ================================================

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getEfficiencyColor = (percent: number): string => {
    if (percent >= 20) return 'text-green-600 bg-green-50';
    if (percent >= 0) return 'text-blue-600 bg-blue-50';
    if (percent >= -20) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getEfficiencyEmoji = (percent: number): string => {
    if (percent >= 30) return '🚀';
    if (percent >= 20) return '⚡';
    if (percent >= 10) return '✨';
    if (percent >= 0) return '✓';
    return '⏱️';
  };

  // ================================================
  // RENDER
  // ================================================

  // Don't show if no active encounter
  if (!currentEncounterMetrics) {
    return null;
  }

  // Compact view
  if (compact && !isExpanded) {
    return (
      <div
        className={`fixed ${positionStyles[position]} z-50 cursor-pointer`}
        onClick={() => setIsExpanded(true)}
      >
        <div className="bg-white rounded-full shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-2 hover:shadow-xl transition-shadow">
          <span className="text-xl">{getEfficiencyEmoji(stats?.percentFaster || 0)}</span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900">
              {formatTime(currentDuration)}
            </span>
            <span className="text-xs text-gray-600">{currentClicks} clicks</span>
          </div>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className={`fixed ${positionStyles[position]} z-50`}>
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-lg">{getEfficiencyEmoji(stats?.percentFaster || 0)}</span>
            Encounter Metrics
          </h3>
          {compact && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Current Stats */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Time Elapsed</span>
            <span className="text-lg font-bold text-gray-900">
              {formatTime(currentDuration)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Clicks</span>
            <span className="text-lg font-bold text-gray-900">{currentClicks}</span>
          </div>
        </div>

        {/* Comparison */}
        {showDetails && stats && (
          <div className="border-t border-gray-200 pt-3 space-y-2">
            {/* Time Comparison */}
            <div className={`rounded-lg p-2 ${getEfficiencyColor(stats.percentFaster)}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">vs. Your Average</span>
                <span className="text-sm font-bold">
                  {stats.percentFaster > 0 ? '+' : ''}
                  {stats.percentFaster}%
                </span>
              </div>
              <div className="text-xs mt-1">
                {stats.percentFaster > 0 ? (
                  <>You're {formatTime(Math.abs(stats.estimatedTimeSaved))} faster!</>
                ) : stats.percentFaster < 0 ? (
                  <>Taking {formatTime(Math.abs(stats.estimatedTimeSaved))} longer</>
                ) : (
                  <>Right on track!</>
                )}
              </div>
            </div>

            {/* Click Comparison */}
            <div className={`rounded-lg p-2 ${getEfficiencyColor(stats.percentFewerClicks)}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Click Efficiency</span>
                <span className="text-sm font-bold">
                  {stats.percentFewerClicks > 0 ? '+' : ''}
                  {stats.percentFewerClicks}%
                </span>
              </div>
              <div className="text-xs mt-1">
                {stats.percentFewerClicks > 0 ? (
                  <>{Math.abs(currentClicks - stats.averageClicks)} fewer clicks</>
                ) : stats.percentFewerClicks < 0 ? (
                  <>{Math.abs(currentClicks - stats.averageClicks)} more clicks</>
                ) : (
                  <>Average click count</>
                )}
              </div>
            </div>

            {/* Industry Comparison */}
            <div className="bg-purple-50 rounded-lg p-2 text-purple-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">vs. Industry Avg</span>
                <span className="text-sm font-bold">
                  {Math.round(((270 - currentDuration) / 270) * 100) > 0 ? '+' : ''}
                  {Math.round(((270 - currentDuration) / 270) * 100)}%
                </span>
              </div>
              <div className="text-xs mt-1">
                Industry avg: 4:30 per patient
              </div>
            </div>
          </div>
        )}

        {/* Footer Message */}
        {stats && stats.percentFaster >= 20 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Great job! You're crushing it!</span>
            </div>
          </div>
        )}

        {/* Offline Indicator */}
        {!isOnline && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
            <span>Offline - syncing when online</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================
// EXPORT
// ================================================

export default EfficiencyBadge;
