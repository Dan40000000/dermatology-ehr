import React, { useState, useEffect } from 'react';

interface ReminderStatistics {
  totalScheduled: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalConfirmed: number;
  totalCancelled: number;
  totalNoShows: number;
  confirmationRate: number;
  deliveryRate: number;
  noShowReductionRate: number;
}

interface DailyStats {
  date: string;
  totalScheduled: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalConfirmed: number;
  totalCancelled: number;
}

interface ReminderStatsProps {
  tenantId: string;
  accessToken: string;
}

export function ReminderStats({ tenantId, accessToken }: ReminderStatsProps) {
  const [stats, setStats] = useState<ReminderStatistics | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchStats();
  }, [tenantId, accessToken, dateRange]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [statsRes, dailyRes] = await Promise.all([
        fetch(
          `/api/reminders/stats?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'x-tenant-id': tenantId,
            },
          }
        ),
        fetch(`/api/reminders/stats/daily?days=30`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-tenant-id': tenantId,
          },
        }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (dailyRes.ok) {
        const data = await dailyRes.json();
        setDailyStats(data.dailyStats || []);
      }

      setError(null);
    } catch (err) {
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const getPercentageColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'text-green-600';
    if (value >= thresholds.warning) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Reminder Effectiveness</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                  className="border rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                  className="border rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={fetchStats}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        {stats && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Confirmation Rate */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Confirmation Rate</p>
                    <p
                      className={`text-3xl font-bold ${getPercentageColor(
                        stats.confirmationRate,
                        { good: 60, warning: 40 }
                      )}`}
                    >
                      {stats.confirmationRate}%
                    </p>
                  </div>
                  <div className="p-3 bg-blue-500 rounded-full">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  {stats.totalConfirmed} of {stats.totalSent} reminders confirmed
                </p>
              </div>

              {/* Delivery Rate */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 font-medium">Delivery Rate</p>
                    <p
                      className={`text-3xl font-bold ${getPercentageColor(
                        stats.deliveryRate,
                        { good: 90, warning: 75 }
                      )}`}
                    >
                      {stats.deliveryRate}%
                    </p>
                  </div>
                  <div className="p-3 bg-green-500 rounded-full">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  {stats.totalDelivered} delivered successfully
                </p>
              </div>

              {/* No-Show Reduction */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Show Rate</p>
                    <p
                      className={`text-3xl font-bold ${getPercentageColor(
                        stats.noShowReductionRate,
                        { good: 85, warning: 70 }
                      )}`}
                    >
                      {stats.noShowReductionRate}%
                    </p>
                  </div>
                  <div className="p-3 bg-purple-500 rounded-full">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-purple-600 mt-2">
                  {stats.totalNoShows} no-shows in period
                </p>
              </div>

              {/* Cancellations */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600 font-medium">Cancellations</p>
                    <p className="text-3xl font-bold text-orange-600">
                      {stats.totalCancelled}
                    </p>
                  </div>
                  <div className="p-3 bg-orange-500 rounded-full">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-xs text-orange-600 mt-2">
                  Via reminder response
                </p>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.totalScheduled}
                </p>
                <p className="text-sm text-gray-500">Total Scheduled</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-semibold text-gray-900">{stats.totalSent}</p>
                <p className="text-sm text-gray-500">Total Sent</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-semibold text-gray-900">{stats.totalFailed}</p>
                <p className="text-sm text-gray-500">Failed</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-semibold text-gray-900">
                  {stats.totalConfirmed}
                </p>
                <p className="text-sm text-gray-500">Confirmed</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Daily Trend Chart (Simple Bar Representation) */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">Daily Trend (Last 30 Days)</h3>
        </div>
        <div className="p-6">
          {dailyStats.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex items-end space-x-1 h-48 min-w-max">
                {dailyStats.slice(-30).map((day, index) => {
                  const maxSent = Math.max(...dailyStats.map((d) => d.totalSent || 1));
                  const height = ((day.totalSent || 0) / maxSent) * 100;
                  const confirmedHeight = day.totalSent
                    ? ((day.totalConfirmed || 0) / day.totalSent) * height
                    : 0;

                  return (
                    <div
                      key={day.date || index}
                      className="flex flex-col items-center group"
                      title={`${day.date}: ${day.totalSent} sent, ${day.totalConfirmed} confirmed`}
                    >
                      <div className="relative w-3 bg-gray-200 rounded-t" style={{ height: `${height}%` }}>
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t"
                          style={{ height: `${confirmedHeight}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-gray-400 mt-1 rotate-45 origin-left hidden group-hover:block">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center mt-4 space-x-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-200 rounded mr-2" />
                  <span className="text-xs text-gray-500">Sent</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded mr-2" />
                  <span className="text-xs text-gray-500">Confirmed</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No data available for the selected period
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Table */}
      {dailyStats.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Scheduled
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Sent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Delivered
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Confirmed
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Confirmation Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dailyStats.slice(0, 10).map((day, index) => {
                  const confirmRate = day.totalSent
                    ? ((day.totalConfirmed / day.totalSent) * 100).toFixed(1)
                    : '0';
                  return (
                    <tr key={day.date || index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(day.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {day.totalScheduled}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {day.totalSent}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {day.totalDelivered}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {day.totalConfirmed}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span
                          className={`font-medium ${getPercentageColor(parseFloat(confirmRate), {
                            good: 60,
                            warning: 40,
                          })}`}
                        >
                          {confirmRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
