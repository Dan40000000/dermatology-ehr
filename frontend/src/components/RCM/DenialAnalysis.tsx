import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DenialReason {
  reason: string;
  count: number;
  amount: number;
  percentage: number;
}

interface DenialAnalysisProps {
  topReasons: DenialReason[];
  totalDenials: number;
  totalDenialAmount: number;
  recoveryRate: number;
}

export function DenialAnalysis({ topReasons, totalDenials, totalDenialAmount, recoveryRate }: DenialAnalysisProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#10b981'];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{data.reason}</p>
          <p className="text-sm text-gray-700">Count: {data.count}</p>
          <p className="text-sm text-gray-700">Amount: {formatCurrency(data.amount)}</p>
          <p className="text-sm font-semibold text-gray-900">{data.percentage.toFixed(1)}% of denials</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Denial Analysis</h3>
          <p className="text-sm text-gray-600 mt-1">Top reasons for claim denials</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">Total Denials</div>
          <div className="text-2xl font-bold text-red-600">{totalDenials}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={topReasons}
                dataKey="count"
                nameKey="reason"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.percentage.toFixed(0)}%`}
              >
                {topReasons.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 Reasons List */}
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 mb-3">Top 5 Denial Reasons</h4>
          {topReasons.map((reason, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-3 flex-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{reason.reason}</div>
                  <div className="text-sm text-gray-600">{reason.count} claims</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">{formatCurrency(reason.amount)}</div>
                <div className="text-sm text-gray-600">{reason.percentage.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Denial Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="text-sm text-red-600 font-medium mb-1">Total Denied Amount</div>
          <div className="text-2xl font-bold text-red-900">{formatCurrency(totalDenialAmount)}</div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="text-sm text-green-600 font-medium mb-1">Recovery Rate</div>
          <div className="text-2xl font-bold text-green-900">{recoveryRate.toFixed(1)}%</div>
          <div className="text-xs text-green-600 mt-1">On appealed denials</div>
        </div>
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <div className="text-sm text-orange-600 font-medium mb-1">Potential Recovery</div>
          <div className="text-2xl font-bold text-orange-900">{formatCurrency(totalDenialAmount * (recoveryRate / 100))}</div>
        </div>
      </div>

      {/* Action Tips */}
      <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Action Items</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>Focus on top denial reasons for maximum impact</li>
          <li>Train staff on proper authorization procedures</li>
          <li>Implement pre-claim scrubbing for common issues</li>
          <li>Appeal all denials with recovery potential</li>
        </ul>
      </div>
    </div>
  );
}
