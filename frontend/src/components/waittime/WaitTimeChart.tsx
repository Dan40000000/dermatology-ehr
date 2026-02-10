/**
 * Wait Time Chart Component
 *
 * Analytics visualization for wait time data
 * Shows trends by hour, day, and provider
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface HourlyData {
  hour: number;
  avgWait: number;
}

interface DailyData {
  day: number;
  avgWait: number;
}

interface ProviderData {
  providerId: string;
  providerName: string;
  avgWait: number;
}

interface WaitTimeAnalytics {
  avgWaitMinutes: number;
  medianWaitMinutes: number;
  maxWaitMinutes: number;
  totalPatients: number;
  waitTimesByHour: HourlyData[];
  waitTimesByDay: DailyData[];
  providerStats: ProviderData[];
}

interface WaitTimeChartProps {
  analytics: WaitTimeAnalytics;
  chartType?: 'hourly' | 'daily' | 'provider' | 'summary';
  title?: string;
  className?: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CHART_COLORS = {
  primary: '#2563eb',
  secondary: '#10b981',
  accent: '#f59e0b',
  gray: '#6b7280',
};

export function WaitTimeChart({
  analytics,
  chartType = 'summary',
  title,
  className = '',
}: WaitTimeChartProps) {
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Summary view with key metrics
  if (chartType === 'summary') {
    return (
      <div className={`wait-time-summary ${className}`}>
        {title && (
          <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600">Average Wait</p>
            <p className="text-2xl font-bold text-blue-800">
              {formatMinutes(analytics.avgWaitMinutes)}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600">Median Wait</p>
            <p className="text-2xl font-bold text-green-800">
              {formatMinutes(analytics.medianWaitMinutes)}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <p className="text-sm text-orange-600">Max Wait</p>
            <p className="text-2xl font-bold text-orange-800">
              {formatMinutes(analytics.maxWaitMinutes)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total Patients</p>
            <p className="text-2xl font-bold text-gray-800">
              {analytics.totalPatients.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Mini charts */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Hourly trend */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-3">
              Wait Time by Hour
            </h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.waitTimesByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={formatHour}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}m`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatMinutes(value), 'Avg Wait']}
                    labelFormatter={(label: number) => formatHour(label)}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgWait"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily trend */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-3">
              Wait Time by Day
            </h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.waitTimesByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d) => DAYS_OF_WEEK[d] || ''}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}m`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatMinutes(value), 'Avg Wait']}
                    labelFormatter={(label: number) => DAYS_OF_WEEK[label] || ''}
                  />
                  <Bar
                    dataKey="avgWait"
                    fill={CHART_COLORS.secondary}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hourly chart
  if (chartType === 'hourly') {
    return (
      <div className={`wait-time-hourly-chart ${className}`}>
        {title && (
          <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        )}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.waitTimesByHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v) => `${v} min`}
                tick={{ fontSize: 12 }}
                label={{ value: 'Wait Time', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value: number) => [formatMinutes(value), 'Average Wait']}
                labelFormatter={(label: number) => formatHour(label)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="avgWait"
                name="Average Wait"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.primary }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Daily chart
  if (chartType === 'daily') {
    return (
      <div className={`wait-time-daily-chart ${className}`}>
        {title && (
          <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        )}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.waitTimesByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="day"
                tickFormatter={(d) => DAYS_OF_WEEK[d] || ''}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v) => `${v} min`}
                tick={{ fontSize: 12 }}
                label={{ value: 'Wait Time', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value: number) => [formatMinutes(value), 'Average Wait']}
                labelFormatter={(label: number) => DAYS_OF_WEEK[label] || ''}
              />
              <Legend />
              <Bar
                dataKey="avgWait"
                name="Average Wait"
                fill={CHART_COLORS.secondary}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Provider chart
  if (chartType === 'provider') {
    const sortedProviders = [...analytics.providerStats].sort(
      (a, b) => b.avgWait - a.avgWait
    );

    return (
      <div className={`wait-time-provider-chart ${className}`}>
        {title && (
          <h3 className="text-lg font-semibold text-gray-700 mb-4">{title}</h3>
        )}
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedProviders} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v} min`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="providerName"
                tick={{ fontSize: 12 }}
                width={120}
              />
              <Tooltip
                formatter={(value: number) => [formatMinutes(value), 'Average Wait']}
              />
              <Legend />
              <Bar
                dataKey="avgWait"
                name="Average Wait"
                fill={CHART_COLORS.accent}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
}

export default WaitTimeChart;
