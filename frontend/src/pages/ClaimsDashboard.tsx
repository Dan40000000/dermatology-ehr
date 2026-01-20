import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import ClaimScrubber from '../components/Claims/ClaimScrubber';
import ClaimEditor from '../components/Claims/ClaimEditor';
import DenialWorkList from '../components/Claims/DenialWorkList';
import ClaimAnalytics from '../components/Claims/ClaimAnalytics';

interface Claim {
  id: string;
  claimNumber: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  providerName?: string;
  serviceDate: string;
  totalCharges: number;
  status: string;
  scrubStatus?: string;
  isCosmetic?: boolean;
  denialReason?: string;
  denialDate?: string;
  appealStatus?: string;
  submittedAt?: string;
}

type TabView = 'overview' | 'denials' | 'analytics';

export default function ClaimsDashboard() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [showScrubber, setShowScrubber] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    readyToSubmit: 0,
    needsReview: 0,
    recentlySubmitted: 0,
    denials: 0,
    firstPassRate: 0,
    denialRate: 0,
    avgDaysInAR: 0,
  });

  const [metrics, setMetrics] = useState<any>(null);
  const [aging, setAging] = useState({
    age_0_30: 0,
    amount_0_30: 0,
    age_31_60: 0,
    amount_31_60: 0,
    age_61_90: 0,
    amount_61_90: 0,
    age_90_plus: 0,
    amount_90_plus: 0,
  });

  const loadClaims = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');

      // Load claims and metrics in parallel
      const [claimsResponse, metricsResponse] = await Promise.all([
        fetch(`${apiBase}/api/claims`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
        fetch(`${apiBase}/api/claims/metrics`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
      ]);

      if (!claimsResponse.ok) throw new Error('Failed to load claims');
      if (!metricsResponse.ok) throw new Error('Failed to load metrics');

      const claimsData = await claimsResponse.json();
      const metricsData = await metricsResponse.json();

      setClaims(claimsData.claims || []);
      setMetrics(metricsData);

      // Update aging data
      if (metricsData.aging) {
        setAging(metricsData.aging);
      }

      // Calculate stats
      const ready = claimsData.claims.filter((c: Claim) => c.scrubStatus === 'clean' && c.status === 'draft').length;
      const needsReview = claimsData.claims.filter((c: Claim) => c.scrubStatus === 'errors' || c.scrubStatus === 'warnings').length;
      const recentSubmitted = claimsData.claims.filter((c: Claim) => c.status === 'submitted' || c.status === 'accepted').length;
      const denialCount = claimsData.claims.filter((c: Claim) => c.status === 'denied').length;

      const totalSubmitted = claimsData.claims.filter((c: Claim) => ['submitted', 'accepted', 'denied', 'paid'].includes(c.status)).length;
      const denialRate = metricsData.denialRate?.denialRate || 0;
      const avgDays = metricsData.daysToPayment?.avgDaysToPayment || 0;

      setStats({
        readyToSubmit: ready,
        needsReview: needsReview,
        recentlySubmitted: recentSubmitted,
        denials: denialCount,
        firstPassRate: totalSubmitted > 0 ? ((totalSubmitted - denialCount) / totalSubmitted) * 100 : 100,
        denialRate: denialRate,
        avgDaysInAR: Math.round(avgDays),
      });
    } catch (err: any) {
      showError(err.message || 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const handleScrubClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setShowScrubber(true);
  };

  const handleEditClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setShowEditor(true);
  };

  const handleSubmitClaims = async (claimIds: string[]) => {
    if (!session) return;

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(
        `${apiBase}/api/claims/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({ claimIds }),
        }
      );

      if (!response.ok) throw new Error('Failed to submit claims');

      const result = await response.json();
      showSuccess(`Submitted ${result.submitted.length} claims`);

      if (result.errors.length > 0) {
        showError(`${result.errors.length} claims had errors`);
      }

      loadClaims();
    } catch (err: any) {
      showError(err.message || 'Failed to submit claims');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const classes = {
      draft: 'bg-gray-100 text-gray-800',
      scrubbed: 'bg-blue-100 text-blue-800',
      ready: 'bg-green-100 text-green-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      denied: 'bg-red-100 text-red-800',
      paid: 'bg-purple-100 text-purple-800',
      appealed: 'bg-orange-100 text-orange-800',
    };
    return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  };

  const getScrubStatusIcon = (scrubStatus?: string) => {
    if (!scrubStatus) return null;

    if (scrubStatus === 'errors') {
      return <span className="text-red-600 font-bold">❌</span>;
    } else if (scrubStatus === 'warnings') {
      return <span className="text-yellow-600 font-bold">⚠️</span>;
    } else if (scrubStatus === 'clean') {
      return <span className="text-green-600 font-bold">✅</span>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Claims Management</h1>
          <p className="text-gray-600 mt-1">Denial prevention and claim scrubbing</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Ready to Submit</div>
          <div className="text-3xl font-bold text-green-600 mt-2">{stats.readyToSubmit}</div>
          <div className="text-xs text-gray-500 mt-1">Clean claims</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Need Review</div>
          <div className="text-3xl font-bold text-orange-600 mt-2">{stats.needsReview}</div>
          <div className="text-xs text-gray-500 mt-1">Errors or warnings</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Recently Submitted</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{stats.recentlySubmitted}</div>
          <div className="text-xs text-gray-500 mt-1">In process</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-600">Denials to Work</div>
          <div className="text-3xl font-bold text-red-600 mt-2">{stats.denials}</div>
          <div className="text-xs text-gray-500 mt-1">Requires action</div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-gray-600">First-Pass Rate</div>
            <div className="text-2xl font-bold text-green-600">{stats.firstPassRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500">Target: 95%+</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Denial Rate</div>
            <div className={`text-2xl font-bold ${stats.denialRate > 5 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.denialRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Target: Under 5%</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Avg Days in A/R</div>
            <div className="text-2xl font-bold text-blue-600">{stats.avgDaysInAR}</div>
            <div className="text-xs text-gray-500">Target: Under 30</div>
          </div>
        </div>
      </div>

      {/* Aging Buckets */}
      {metrics && metrics.collection && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Accounts Receivable Aging</h2>
            <div className="text-sm text-gray-600">
              Collection Rate: <span className="font-bold text-green-600">
                {metrics.collection.collectionRate ? metrics.collection.collectionRate.toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">0-30 Days</div>
              <div className="text-lg font-bold text-green-600">{aging.age_0_30 || 0}</div>
              <div className="text-xs text-gray-600">${(aging.amount_0_30 || 0).toFixed(2)}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">31-60 Days</div>
              <div className="text-lg font-bold text-yellow-600">{aging.age_31_60 || 0}</div>
              <div className="text-xs text-gray-600">${(aging.amount_31_60 || 0).toFixed(2)}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">61-90 Days</div>
              <div className="text-lg font-bold text-orange-600">{aging.age_61_90 || 0}</div>
              <div className="text-xs text-gray-600">${(aging.amount_61_90 || 0).toFixed(2)}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">90+ Days</div>
              <div className="text-lg font-bold text-red-600">{aging.age_90_plus || 0}</div>
              <div className="text-xs text-gray-600">${(aging.amount_90_plus || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Claims Overview
          </button>
          <button
            onClick={() => setActiveTab('denials')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'denials'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Denial WorkList
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'analytics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Claim #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Service Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scrub
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {claim.claimNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {claim.patientFirstName} {claim.patientLastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(claim.serviceDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${claim.totalCharges.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(claim.status)}`}>
                      {claim.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {getScrubStatusIcon(claim.scrubStatus)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleScrubClaim(claim)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Scrub
                    </button>
                    <button
                      onClick={() => handleEditClaim(claim)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    {claim.scrubStatus === 'clean' && claim.status === 'draft' && (
                      <button
                        onClick={() => handleSubmitClaims([claim.id])}
                        className="text-green-600 hover:text-green-900"
                      >
                        Submit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                    No claims found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'denials' && <DenialWorkList onReload={loadClaims} />}

      {activeTab === 'analytics' && <ClaimAnalytics />}

      {/* Modals */}
      {showScrubber && selectedClaim && (
        <ClaimScrubber
          claimId={selectedClaim.id}
          onClose={() => {
            setShowScrubber(false);
            setSelectedClaim(null);
            loadClaims();
          }}
        />
      )}

      {showEditor && selectedClaim && (
        <ClaimEditor
          claimId={selectedClaim.id}
          onClose={() => {
            setShowEditor(false);
            setSelectedClaim(null);
            loadClaims();
          }}
        />
      )}
    </div>
  );
}
