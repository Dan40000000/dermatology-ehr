import React from 'react';

export interface DailyStats {
  totalScheduled: number;
  patientsArrived: number;
  patientsCompleted: number;
  noShows: number;
  collectionsToday: number;
  openSlotsRemaining: number;
  averageWaitTime?: number;
}

interface QuickStatsBarProps {
  stats: DailyStats | null;
  isLoading?: boolean;
}

export const QuickStatsBar: React.FC<QuickStatsBarProps> = ({ stats, isLoading }) => {
  if (isLoading || !stats) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Scheduled Today',
      value: stats.totalScheduled,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Patients Seen',
      value: `${stats.patientsCompleted} / ${stats.totalScheduled}`,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Currently Arrived',
      value: stats.patientsArrived,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'No-Shows',
      value: stats.noShows,
      color: stats.noShows > 0 ? 'text-red-600' : 'text-gray-600',
      bgColor: stats.noShows > 0 ? 'bg-red-50' : 'bg-gray-50',
    },
    {
      label: 'Collections Today',
      value: `$${stats.collectionsToday.toFixed(2)}`,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Open Slots',
      value: stats.openSlotsRemaining,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      label: 'Avg Wait Time',
      value: stats.averageWaitTime ? `${stats.averageWaitTime} min` : 'N/A',
      color:
        stats.averageWaitTime && stats.averageWaitTime > 15
          ? 'text-orange-600'
          : 'text-green-600',
      bgColor:
        stats.averageWaitTime && stats.averageWaitTime > 15
          ? 'bg-orange-50'
          : 'bg-green-50',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Today's Overview</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {statCards.map((stat, index) => (
            <div
              key={index}
              className={`${stat.bgColor} rounded-lg p-4 transition-all hover:shadow-md`}
            >
              <div className="text-sm font-medium text-gray-600 mb-1">
                {stat.label}
              </div>
              <div className={`text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
