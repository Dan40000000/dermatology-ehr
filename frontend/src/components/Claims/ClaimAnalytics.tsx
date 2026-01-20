import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface AnalyticsData {
  stats: {
    submitted: number;
    denied: number;
    paid: number;
    inProcess: number;
    denialRate: number;
    avgDaysToPayment: number;
  };
  topDenialReasons: Array<{
    denial_category: string;
    denial_reason: string;
    count: number;
  }>;
  denialByPayer: Array<{
    payer_name: string;
    denied: number;
    total: number;
    denialRate: number;
  }>;
  denialByProvider: Array<{
    providerName: string;
    denied: number;
    total: number;
    denialRate: number;
  }>;
  appealStats: {
    approved: number;
    appealDenied: number;
    total: number;
    successRate: number;
  };
}

export default function ClaimAnalytics() {
  const { session } = useAuth();
  const { showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(
        `${apiBase}/api/claims/analytics`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load analytics');

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err: any) {
      showError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-200 rounded"></div>
        <div className="h-48 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-gray-500">
        No analytics data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overall Statistics (Last 90 Days)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-gray-600">Submitted</div>
            <div className="text-3xl font-bold text-blue-600">{data.stats.submitted || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Denied</div>
            <div className="text-3xl font-bold text-red-600">{data.stats.denied || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Paid</div>
            <div className="text-3xl font-bold text-green-600">{data.stats.paid || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">In Process</div>
            <div className="text-3xl font-bold text-yellow-600">{data.stats.inProcess || 0}</div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-600">Denial Rate</div>
              <div className={`text-2xl font-bold ${(data.stats.denialRate || 0) > 5 ? 'text-red-600' : 'text-green-600'}`}>
                {(data.stats.denialRate || 0).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(data.stats.denialRate || 0) > 5
                  ? 'Above target (5%)'
                  : 'Meeting target! (Under 5%)'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Avg Days to Payment</div>
              <div className="text-2xl font-bold text-blue-600">
                {(data.stats.avgDaysToPayment || 0).toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Target: Under 30 days</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Denial Reasons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Denial Reasons</h2>
        {data.topDenialReasons.length > 0 ? (
          <div className="space-y-3">
            {data.topDenialReasons.map((reason, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{reason.denial_reason}</div>
                  {reason.denial_category && (
                    <div className="text-xs text-gray-500 mt-0.5">Category: {reason.denial_category}</div>
                  )}
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-semibold text-red-600">{reason.count} claims</span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${Math.min((reason.count / (data.topDenialReasons[0]?.count || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No denials in the last 90 days</div>
        )}
      </div>

      {/* Denial by Payer */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Denial Rate by Payer</h2>
        {data.denialByPayer.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Payer</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Total Claims</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Denied</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Denial Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.denialByPayer.map((payer, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 text-sm text-gray-900">{payer.payer_name}</td>
                    <td className="py-2 text-sm text-right text-gray-600">{payer.total}</td>
                    <td className="py-2 text-sm text-right text-red-600">{payer.denied}</td>
                    <td className="py-2 text-sm text-right">
                      <span className={`font-semibold ${payer.denialRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                        {payer.denialRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No payer data available</div>
        )}
      </div>

      {/* Denial by Provider */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Denial Rate by Provider</h2>
        {data.denialByProvider.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Total Claims</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Denied</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Denial Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.denialByProvider.map((provider, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 text-sm text-gray-900">{provider.providerName}</td>
                    <td className="py-2 text-sm text-right text-gray-600">{provider.total}</td>
                    <td className="py-2 text-sm text-right text-red-600">{provider.denied}</td>
                    <td className="py-2 text-sm text-right">
                      <span className={`font-semibold ${provider.denialRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
                        {provider.denialRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No provider data available</div>
        )}
      </div>

      {/* Appeal Success Rate */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Appeal Success Rate</h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-600">Total Appeals</div>
            <div className="text-3xl font-bold text-gray-900">{data.appealStats.total || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Approved</div>
            <div className="text-3xl font-bold text-green-600">{data.appealStats.approved || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Success Rate</div>
            <div className="text-3xl font-bold text-blue-600">
              {(data.appealStats.successRate || 0).toFixed(1)}%
            </div>
          </div>
        </div>
        {data.appealStats.total > 0 && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full"
                style={{ width: `${data.appealStats.successRate || 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Key Insights */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Insights & Recommendations</h2>
        <div className="space-y-3">
          {(data.stats.denialRate || 0) > 5 && (
            <div className="flex items-start space-x-2">
              <span className="text-red-500">⚠️</span>
              <div className="text-sm text-gray-700">
                <strong>High Denial Rate:</strong> Current rate of {(data.stats.denialRate || 0).toFixed(1)}%
                exceeds the target of 5%. Focus on claim scrubbing before submission.
              </div>
            </div>
          )}
          {data.topDenialReasons.length > 0 && data.topDenialReasons[0].denial_category === 'modifier_issue' && (
            <div className="flex items-start space-x-2">
              <span className="text-orange-500">💡</span>
              <div className="text-sm text-gray-700">
                <strong>Modifier Issues:</strong> Consider additional training on modifier use,
                especially modifier 25 and 59 for E/M and procedures.
              </div>
            </div>
          )}
          {(data.appealStats.successRate || 0) > 70 && (
            <div className="flex items-start space-x-2">
              <span className="text-green-500">✅</span>
              <div className="text-sm text-gray-700">
                <strong>Strong Appeals:</strong> {(data.appealStats.successRate || 0).toFixed(1)}% success rate
                shows effective appeal documentation. Keep up the good work!
              </div>
            </div>
          )}
          {(data.stats.denialRate || 0) <= 5 && (
            <div className="flex items-start space-x-2">
              <span className="text-green-500">🎉</span>
              <div className="text-sm text-gray-700">
                <strong>Excellent Performance:</strong> Denial rate of {(data.stats.denialRate || 0).toFixed(1)}%
                meets target! Continue using claim scrubber for all submissions.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
