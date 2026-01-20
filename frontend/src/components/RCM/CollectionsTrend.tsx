import React from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendData {
  date: string;
  collections: number;
  charges: number;
  gap: number;
}

interface CollectionsTrendProps {
  data: TrendData[];
  view: 'monthly' | 'weekly' | 'daily';
  onViewChange: (view: 'monthly' | 'weekly' | 'daily') => void;
}

export function CollectionsTrend({ data, view, onViewChange }: CollectionsTrendProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{formatDate(label)}</p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-green-600 font-semibold">Collections:</span>{' '}
              {formatCurrency(payload[0].value)}
            </p>
            <p className="text-sm">
              <span className="text-blue-600 font-semibold">Charges:</span>{' '}
              {formatCurrency(payload[1].value)}
            </p>
            {payload[2] && (
              <p className="text-sm">
                <span className="text-red-600 font-semibold">Gap:</span>{' '}
                {formatCurrency(payload[2].value)}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Collections vs Charges Trend</h3>
          <p className="text-sm text-gray-600 mt-1">Track collection performance over time</p>
        </div>
        <div className="flex space-x-2">
          {(['daily', 'weekly', 'monthly'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === v
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorCollections" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="colorCharges" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tickFormatter={formatDate} stroke="#6b7280" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} stroke="#6b7280" />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="collections"
            stroke="#10b981"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorCollections)"
            name="Collections"
          />
          <Area
            type="monotone"
            dataKey="charges"
            stroke="#3b82f6"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorCharges)"
            name="Charges"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="text-sm text-green-600 font-medium mb-1">Total Collections</div>
          <div className="text-2xl font-bold text-green-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.collections, 0))}
          </div>
        </div>
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-sm text-blue-600 font-medium mb-1">Total Charges</div>
          <div className="text-2xl font-bold text-blue-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.charges, 0))}
          </div>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-sm text-purple-600 font-medium mb-1">Collection Rate</div>
          <div className="text-2xl font-bold text-purple-900">
            {((data.reduce((sum, d) => sum + d.collections, 0) / data.reduce((sum, d) => sum + d.charges, 0)) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
