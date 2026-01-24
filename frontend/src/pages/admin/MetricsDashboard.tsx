import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../utils/apiBase';

// ================================================
// TYPES
// ================================================

interface MetricsSummary {
  period: string;
  totalEncounters: number;
  totalProviders: number;
  averageEncounterDuration: number;
  averageClicksPerEncounter: number;
  totalTimeSaved: number;
  topPerformer: {
    providerId: string;
    providerName: string;
    efficiencyScore: number;
  };
}

interface ProviderMetrics {
  providerId: string;
  providerName: string;
  encountersCompleted: number;
  avgDuration: number;
  avgClicks: number;
  efficiencyScore: number;
  timeSaved: number;
  rank: number;
}

interface TrendData {
  date: string;
  avgDuration: number;
  avgClicks: number;
  encounterCount: number;
  timeSaved: number;
}

interface FeatureUsage {
  featureName: string;
  category: string;
  usageCount: number;
  uniqueUsers: number;
  avgTimeSaved: number;
}

type TimePeriod = '7d' | '30d' | '90d' | 'all';

// ================================================
// COMPONENT
// ================================================

export default function MetricsDashboard() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [providers, setProviders] = useState<ProviderMetrics[]>([]);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage[]>([]);
  const [loading, setLoading] = useState(true);

  // ================================================
  // FETCH DATA
  // ================================================

  useEffect(() => {
    if (!session) return;

    const fetchMetrics = async () => {
      setLoading(true);

      try {
        const [summaryRes, providersRes, trendsRes, featuresRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/metrics/summary?period=${period}`, {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }),
          fetch(`${API_BASE_URL}/api/metrics/providers?period=${period}`, {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }),
          fetch(`${API_BASE_URL}/api/metrics/trends?period=${period}`, {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }),
          fetch(`${API_BASE_URL}/api/metrics/features?period=${period}`, {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`,
              'X-Tenant-ID': session.tenantId,
            },
          }),
        ]);

        if (summaryRes.ok) setSummary(await summaryRes.json());
        if (providersRes.ok) setProviders(await providersRes.json());
        if (trendsRes.ok) setTrends(await trendsRes.json());
        if (featuresRes.ok) setFeatureUsage(await featuresRes.json());
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [session, period]);

  // ================================================
  // HELPERS
  // ================================================

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatLargeTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getPeriodLabel = (p: TimePeriod): string => {
    const labels = {
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days',
      '90d': 'Last 90 Days',
      'all': 'All Time',
    };
    return labels[p];
  };

  // ================================================
  // RENDER
  // ================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Efficiency Metrics Dashboard
          </h1>
          <p className="text-gray-600">
            Track and compare provider efficiency across your organization
          </p>
        </div>

        {/* Period Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Time Period:</span>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {getPeriodLabel(p)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Total Encounters</h3>
                <span className="text-2xl">📊</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{summary.totalEncounters}</p>
              <p className="text-xs text-gray-500 mt-1">
                Across {summary.totalProviders} providers
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Avg Time/Encounter</h3>
                <span className="text-2xl">⏱️</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {formatTime(summary.averageEncounterDuration)}
              </p>
              <p className="text-xs text-green-600 mt-1">
                vs Industry: 4:30
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Avg Clicks</h3>
                <span className="text-2xl">🖱️</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary.averageClicksPerEncounter.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-1">per encounter</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Total Time Saved</h3>
                <span className="text-2xl">💰</span>
              </div>
              <p className="text-3xl font-bold text-green-600">
                {formatLargeTime(summary.totalTimeSaved)}
              </p>
              <p className="text-xs text-gray-500 mt-1">vs industry average</p>
            </div>
          </div>
        )}

        {/* Provider Leaderboard */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>🏆</span>
            Provider Leaderboard
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Provider</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Encounters</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Avg Time</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Avg Clicks</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Efficiency</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Time Saved</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider, index) => (
                  <tr
                    key={provider.providerId}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      index < 3 ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">#{provider.rank}</span>
                        {index === 0 && <span className="text-xl">🥇</span>}
                        {index === 1 && <span className="text-xl">🥈</span>}
                        {index === 2 && <span className="text-xl">🥉</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900">{provider.providerName}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700">
                      {provider.encountersCompleted}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700">
                      {formatTime(provider.avgDuration)}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700">
                      {provider.avgClicks.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          provider.efficiencyScore >= 90
                            ? 'bg-green-100 text-green-800'
                            : provider.efficiencyScore >= 75
                            ? 'bg-blue-100 text-blue-800'
                            : provider.efficiencyScore >= 60
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {provider.efficiencyScore.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-green-600 font-semibold">
                        +{formatLargeTime(provider.timeSaved)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trends Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📈</span>
            Efficiency Trends
          </h2>

          <div className="space-y-4">
            {trends.slice(0, 10).map((trend, index) => {
              const maxDuration = Math.max(...trends.map(t => t.avgDuration));
              const widthPercent = (trend.avgDuration / maxDuration) * 100;

              return (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-24 text-sm text-gray-600">
                    {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${widthPercent}%` }}
                        >
                          <span className="text-xs font-medium text-white">
                            {formatTime(trend.avgDuration)}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-600 w-16 text-right">
                        {trend.encounterCount} enc
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature Usage */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>⚡</span>
            Top Time-Saving Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featureUsage.slice(0, 9).map((feature, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {feature.featureName}
                  </h3>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                    {feature.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Usage</span>
                    <span className="font-semibold text-gray-900">
                      {feature.usageCount} times
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Users</span>
                    <span className="font-semibold text-gray-900">
                      {feature.uniqueUsers}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200">
                    <span className="text-gray-600">Avg Time Saved</span>
                    <span className="font-semibold text-green-600">
                      {formatTime(feature.avgTimeSaved)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Industry Comparison */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>🎯</span>
            Industry Comparison
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Your Average</h3>
              <p className="text-3xl font-bold text-blue-600">
                {summary ? formatTime(summary.averageEncounterDuration) : '--'}
              </p>
              <p className="text-xs text-gray-500 mt-1">per encounter</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Industry Average</h3>
              <p className="text-3xl font-bold text-gray-600">4:30</p>
              <p className="text-xs text-gray-500 mt-1">ModMed, eCW, etc.</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-600 mb-2">You Save</h3>
              <p className="text-3xl font-bold text-green-600">
                {summary
                  ? formatTime(270 - summary.averageEncounterDuration)
                  : '--'}
              </p>
              <p className="text-xs text-gray-500 mt-1">per patient</p>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">💡 Sales Pitch Ready</h3>
            <p className="text-sm text-gray-700 mb-2">
              "Our platform saves an average of{' '}
              <strong className="text-green-600">
                {summary ? formatTime(270 - summary.averageEncounterDuration) : '60-90 seconds'}
              </strong>
              {' '}per patient encounter compared to industry standards."
            </p>
            <p className="text-sm text-gray-700">
              "That's{' '}
              <strong className="text-green-600">
                {summary ? formatLargeTime(summary.totalTimeSaved) : 'hours'}
              </strong>
              {' '}saved in just {getPeriodLabel(period).toLowerCase()}."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
