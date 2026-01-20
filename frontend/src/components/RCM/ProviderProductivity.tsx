import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ProviderData {
  providerId: string;
  providerName: string;
  encounters: number;
  patients: number;
  charges: number;
  collections: number;
  chargesPerPatient: number;
  collectionRate: number;
  denialRate: number;
}

interface ProviderProductivityProps {
  providers: ProviderData[];
}

export function ProviderProductivity({ providers }: ProviderProductivityProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{data.providerName}</p>
          <p className="text-sm text-gray-700">Revenue: {formatCurrency(data.charges)}</p>
          <p className="text-sm text-gray-700">Encounters: {data.encounters}</p>
          <p className="text-sm text-gray-700">Collection Rate: {data.collectionRate.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Provider Productivity</h3>
          <p className="text-sm text-gray-600 mt-1">Revenue and productivity metrics by provider</p>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Revenue by Provider</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={providers.slice(0, 8)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} stroke="#6b7280" />
            <YAxis type="category" dataKey="providerName" width={120} stroke="#6b7280" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="charges" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Provider Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Provider</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Encounters</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Patients</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Charges</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Per Patient</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Collection %</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Denial %</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider, index) => (
              <tr key={provider.providerId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-4 px-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${index % 3 === 0 ? 'bg-purple-500' : index % 3 === 1 ? 'bg-blue-500' : 'bg-green-500'}`}>
                      {provider.providerName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                    <span className="font-medium text-gray-900">{provider.providerName}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-center text-gray-900">{provider.encounters}</td>
                <td className="py-4 px-4 text-center text-gray-900">{provider.patients}</td>
                <td className="py-4 px-4 text-right font-semibold text-gray-900">
                  {formatCurrency(provider.charges)}
                </td>
                <td className="py-4 px-4 text-right text-gray-700">
                  {formatCurrency(provider.chargesPerPatient)}
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${provider.collectionRate >= 95 ? 'bg-green-50 text-green-600' : provider.collectionRate >= 85 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                    {provider.collectionRate.toFixed(1)}%
                  </span>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${provider.denialRate <= 5 ? 'bg-green-50 text-green-600' : provider.denialRate <= 10 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                    {provider.denialRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
