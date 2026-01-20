import React from 'react';

interface PayerPerformance {
  payerName: string;
  charges: number;
  payments: number;
  denials: number;
  denialRate: number;
  avgDaysToPay: number;
  collectionRate: number;
}

interface PayerMixProps {
  payers: PayerPerformance[];
}

export function PayerMix({ payers }: PayerMixProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getDenialRateColor = (rate: number) => {
    if (rate <= 5) return 'text-green-600 bg-green-50';
    if (rate <= 10) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getCollectionRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600 bg-green-50';
    if (rate >= 85) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getDaysColor = (days: number) => {
    if (days <= 20) return 'text-green-600 bg-green-50';
    if (days <= 35) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Payer Performance</h3>
          <p className="text-sm text-gray-600 mt-1">Revenue breakdown and metrics by insurance payer</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Payer</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Charges</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Paid</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Denial %</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Avg Days</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Collection %</th>
            </tr>
          </thead>
          <tbody>
            {payers.map((payer, index) => (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-4 px-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-purple-500' : index === 1 ? 'bg-blue-500' : index === 2 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <span className="font-medium text-gray-900">{payer.payerName}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-right font-semibold text-gray-900">
                  {formatCurrency(payer.charges)}
                </td>
                <td className="py-4 px-4 text-right font-semibold text-gray-900">
                  {formatCurrency(payer.payments)}
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getDenialRateColor(payer.denialRate)}`}>
                    {payer.denialRate.toFixed(1)}%
                  </span>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getDaysColor(payer.avgDaysToPay)}`}>
                    {payer.avgDaysToPay} days
                  </span>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getCollectionRateColor(payer.collectionRate)}`}>
                    {payer.collectionRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Good Performance</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-600">Needs Attention</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-600">Poor Performance</span>
          </div>
        </div>
      </div>
    </div>
  );
}
