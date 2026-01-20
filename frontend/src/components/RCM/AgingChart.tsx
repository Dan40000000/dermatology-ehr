import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ARAgingData {
  current: number;
  days31_60: number;
  days61_90: number;
  days91_120: number;
  days120Plus: number;
  total: number;
}

interface AgingChartProps {
  data: ARAgingData;
  onDrillDown?: (bucket: string) => void;
}

export function AgingChart({ data, onDrillDown }: AgingChartProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const chartData = [
    {
      bucket: 'Current',
      amount: data.current,
      percentage: data.total > 0 ? (data.current / data.total) * 100 : 0,
      color: '#10b981',
      key: 'current',
    },
    {
      bucket: '31-60',
      amount: data.days31_60,
      percentage: data.total > 0 ? (data.days31_60 / data.total) * 100 : 0,
      color: '#3b82f6',
      key: '31-60',
    },
    {
      bucket: '61-90',
      amount: data.days61_90,
      percentage: data.total > 0 ? (data.days61_90 / data.total) * 100 : 0,
      color: '#f59e0b',
      key: '61-90',
    },
    {
      bucket: '91-120',
      amount: data.days91_120,
      percentage: data.total > 0 ? (data.days91_120 / data.total) * 100 : 0,
      color: '#ef4444',
      key: '91-120',
    },
    {
      bucket: '120+',
      amount: data.days120Plus,
      percentage: data.total > 0 ? (data.days120Plus / data.total) * 100 : 0,
      color: '#dc2626',
      key: '120+',
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-1">{data.bucket} Days</p>
          <p className="text-lg font-bold" style={{ color: data.color }}>
            {formatCurrency(data.amount)}
          </p>
          <p className="text-sm text-gray-600">{data.percentage.toFixed(1)}% of total A/R</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-900">A/R Aging Breakdown</h3>
        <div className="text-sm text-gray-600">
          Total A/R: <span className="font-bold text-gray-900">{formatCurrency(data.total)}</span>
        </div>
      </div>

      {/* Visual Bar Chart */}
      <div className="mb-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="bucket" stroke="#6b7280" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} stroke="#6b7280" />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="amount"
              radius={[8, 8, 0, 0]}
              onClick={(data) => onDrillDown && onDrillDown(data.key)}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Breakdown */}
      <div className="space-y-3">
        {chartData.map((bucket) => (
          <div
            key={bucket.key}
            onClick={() => onDrillDown && onDrillDown(bucket.key)}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
          >
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }}></div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{bucket.bucket} Days</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${bucket.percentage}%`,
                      backgroundColor: bucket.color,
                    }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="text-right ml-4">
              <div className="text-lg font-bold text-gray-900">{formatCurrency(bucket.amount)}</div>
              <div className="text-sm text-gray-600">{bucket.percentage.toFixed(1)}%</div>
            </div>
            <svg
              className="w-5 h-5 ml-2 text-gray-400 group-hover:text-gray-600 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ))}
      </div>

      {/* Warning Banner for Old A/R */}
      {data.days120Plus > 0 && data.total > 0 && (data.days120Plus / data.total) * 100 > 10 && (
        <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <h4 className="text-sm font-semibold text-red-800">High Aged A/R</h4>
              <p className="text-sm text-red-700 mt-1">
                {((data.days120Plus / data.total) * 100).toFixed(1)}% of your A/R is over 120 days old. Focus on
                collecting these accounts.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
