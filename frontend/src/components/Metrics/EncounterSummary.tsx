import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

// ================================================
// TYPES
// ================================================

interface EncounterSummaryData {
  encounterId: string;
  totalDuration: number; // seconds
  clickCount: number;
  navigationCount: number;
  pageViews: number;

  // Averages for comparison
  userAverageDuration: number;
  userAverageClicks: number;

  // Industry benchmarks
  industryAverageDuration: number;
  targetDuration: number;

  // Time saved calculations
  timeSavedVsAverage: number;
  timeSavedVsIndustry: number;

  // Daily totals
  encountersToday: number;
  totalTimeSavedToday: number;

  // Efficiency score
  efficiencyScore: number;
  efficiencyRank: number;

  // Achievements earned (if any)
  achievementsEarned?: Array<{
    type: string;
    name: string;
    description: string;
    icon: string;
    tier: string;
  }>;
}

interface EncounterSummaryProps {
  encounterId: string;
  patientName?: string;
  onClose: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number; // milliseconds
}

// ================================================
// COMPONENT
// ================================================

export function EncounterSummary({
  encounterId,
  patientName,
  onClose,
  autoClose = false,
  autoCloseDelay = 8000,
}: EncounterSummaryProps) {
  const { session } = useAuth();
  const [data, setData] = useState<EncounterSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // ================================================
  // FETCH SUMMARY DATA
  // ================================================

  useEffect(() => {
    if (!session || !encounterId) return;

    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/metrics/encounters/${encounterId}/summary`,
          {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch encounter summary');
        }

        const summaryData = await response.json();
        setData(summaryData);

        // Show confetti for exceptional performance
        if (summaryData.efficiencyScore >= 90 || summaryData.timeSavedVsIndustry >= 120) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }
      } catch (err) {
        console.error('Error fetching encounter summary:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [session, encounterId]);

  // ================================================
  // AUTO CLOSE
  // ================================================

  useEffect(() => {
    if (autoClose && !loading && data) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDelay, loading, data, onClose]);

  // ================================================
  // HELPERS
  // ================================================

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 90) return 'bg-green-50';
    if (score >= 75) return 'bg-blue-50';
    if (score >= 60) return 'bg-yellow-50';
    return 'bg-gray-50';
  };

  const getPerformanceMessage = (score: number): string => {
    if (score >= 95) return "Outstanding! You're a rockstar!";
    if (score >= 90) return 'Excellent work! Keep it up!';
    if (score >= 80) return 'Great job! Very efficient!';
    if (score >= 70) return 'Good work! Solid performance!';
    if (score >= 60) return "Nice! You're on track!";
    return "Keep practicing, you'll get faster!";
  };

  // ================================================
  // RENDER
  // ================================================

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">Calculating your metrics...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-6">{error || 'Failed to load summary'}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {/* Confetti Effect */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute text-2xl animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              {['🎉', '⭐', '✨', '🚀', '💫'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`p-6 ${getScoreBgColor(data.efficiencyScore)} border-b border-gray-200`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Encounter Complete! 🎯
              </h2>
              {patientName && (
                <p className="text-sm text-gray-600">Patient: {patientName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Efficiency Score */}
          <div className="mt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-1">Efficiency Score</div>
                <div className={`text-4xl font-bold ${getScoreColor(data.efficiencyScore)}`}>
                  {data.efficiencyScore}/100
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600 mb-1">Rank</div>
                <div className="text-2xl font-bold text-gray-900">#{data.efficiencyRank}</div>
                <div className="text-xs text-gray-500">among providers</div>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-700">
              {getPerformanceMessage(data.efficiencyScore)}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* This Encounter */}
          <div className="col-span-2 bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">This Encounter</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-blue-700 mb-1">Time</div>
                <div className="text-2xl font-bold text-blue-900">
                  {formatTime(data.totalDuration)}
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-700 mb-1">Clicks</div>
                <div className="text-2xl font-bold text-blue-900">{data.clickCount}</div>
              </div>
              <div>
                <div className="text-xs text-blue-700 mb-1">Pages</div>
                <div className="text-2xl font-bold text-blue-900">{data.pageViews}</div>
              </div>
            </div>
          </div>

          {/* Your Average */}
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-3">Your Average</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-purple-700">Time</span>
                <span className="text-sm font-bold text-purple-900">
                  {formatTime(data.userAverageDuration)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-purple-700">Clicks</span>
                <span className="text-sm font-bold text-purple-900">
                  {data.userAverageClicks}
                </span>
              </div>
            </div>
          </div>

          {/* Industry Average */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Industry Avg</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700">Time</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatTime(data.industryAverageDuration)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700">Target</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatTime(data.targetDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* Time Saved */}
          <div className="col-span-2 bg-green-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-900 mb-3">Time Saved</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-green-700 mb-1">vs. Your Average</div>
                <div className="text-2xl font-bold text-green-900">
                  {data.timeSavedVsAverage > 0 ? '+' : ''}
                  {formatTime(Math.abs(data.timeSavedVsAverage))}
                </div>
              </div>
              <div>
                <div className="text-xs text-green-700 mb-1">vs. Industry</div>
                <div className="text-2xl font-bold text-green-900">
                  {data.timeSavedVsIndustry > 0 ? '+' : ''}
                  {formatTime(Math.abs(data.timeSavedVsIndustry))}
                </div>
              </div>
            </div>
          </div>

          {/* Today's Summary */}
          <div className="col-span-2 bg-yellow-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-yellow-900 mb-3">Today's Summary</h3>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-900">
                  {data.encountersToday}
                </div>
                <div className="text-xs text-yellow-700">Encounters</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-900">
                  {formatTime(data.totalTimeSavedToday)}
                </div>
                <div className="text-xs text-yellow-700">Time Saved</div>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements */}
        {data.achievementsEarned && data.achievementsEarned.length > 0 && (
          <div className="px-6 pb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              🏆 Achievements Unlocked!
            </h3>
            <div className="space-y-2">
              {data.achievementsEarned.map((achievement, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-3 border border-yellow-200"
                >
                  <span className="text-3xl">{achievement.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{achievement.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full">
                        {achievement.tier}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{achievement.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Continue
          </button>
          {autoClose && (
            <p className="text-xs text-center text-gray-500 mt-2">
              This will close automatically in a few seconds
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================
// EXPORT
// ================================================

export default EncounterSummary;
