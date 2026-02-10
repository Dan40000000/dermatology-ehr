/**
 * ClaimQueue Component
 *
 * Batch submission queue for claims with filtering and bulk operations.
 */

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface QueuedClaim {
  claimId: string;
  claimNumber: string;
  patientName: string;
  submittedAt: Date;
  status: string;
  daysPending: number;
}

interface Batch {
  id: string;
  batchNumber: string;
  batchDate: string;
  totalClaims: number;
  submittedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  status: string;
  submittedAt?: string;
  clearinghouseName: string;
}

type TabType = 'pending' | 'batches';
type SortField = 'daysPending' | 'patientName' | 'claimNumber' | 'status';
type SortDirection = 'asc' | 'desc';

export default function ClaimQueue() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [loading, setLoading] = useState(true);
  const [pendingClaims, setPendingClaims] = useState<QueuedClaim[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sortField, setSortField] = useState<SortField>('daysPending');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    if (activeTab === 'pending') {
      loadPendingClaims();
    } else {
      loadBatches();
    }
  }, [activeTab]);

  const loadPendingClaims = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/pending`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load pending claims');

      const data = await response.json();
      setPendingClaims(data.claims || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load pending claims';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadBatches = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/batches`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load batches');

      const data = await response.json();
      setBatches(data.batches || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load batches';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async (claimId: string) => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/${claimId}/status`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to check status');

      showSuccess('Status refreshed');
      loadPendingClaims();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check status';
      showError(message);
    }
  };

  const handleRefreshAllStatuses = async () => {
    if (!session || pendingClaims.length === 0) return;

    let successCount = 0;
    for (const claim of pendingClaims) {
      try {
        await fetch(
          `${API_BASE_URL}/api/claims-submission/${claim.claimId}/status`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'x-tenant-id': session.tenantId,
            },
          }
        );
        successCount++;
      } catch {
        // Continue with next claim
      }
    }

    showSuccess(`Refreshed status for ${successCount} claims`);
    loadPendingClaims();
  };

  const sortedAndFilteredClaims = useMemo(() => {
    let result = [...pendingClaims];

    // Filter
    if (filterStatus) {
      result = result.filter(c => c.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'daysPending':
          aVal = a.daysPending;
          bVal = b.daysPending;
          break;
        case 'patientName':
          aVal = a.patientName.toLowerCase();
          bVal = b.patientName.toLowerCase();
          break;
        case 'claimNumber':
          aVal = a.claimNumber;
          bVal = b.claimNumber;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [pendingClaims, sortField, sortDirection, filterStatus]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      submitted: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      pended: 'bg-orange-100 text-orange-800',
      additional_info_requested: 'bg-purple-100 text-purple-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  const getBatchStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      ready: 'bg-blue-100 text-blue-800',
      submitted: 'bg-blue-100 text-blue-800',
      partial: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getDaysPendingColor = (days: number) => {
    if (days > 30) return 'text-red-600 font-semibold';
    if (days > 14) return 'text-orange-600';
    if (days > 7) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const uniqueStatuses = useMemo(() => {
    return [...new Set(pendingClaims.map(c => c.status))];
  }, [pendingClaims]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Claims
            {pendingClaims.length > 0 && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                {pendingClaims.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('batches')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'batches'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Submission Batches
          </button>
        </nav>
      </div>

      {activeTab === 'pending' ? (
        <>
          {/* Filters and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                {uniqueStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-500">
                Showing {sortedAndFilteredClaims.length} of {pendingClaims.length} claims
              </span>
            </div>
            <button
              onClick={handleRefreshAllStatuses}
              disabled={pendingClaims.length === 0}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh All Statuses
            </button>
          </div>

          {/* Pending Claims Table */}
          {sortedAndFilteredClaims.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No pending claims</h3>
              <p className="mt-1 text-sm text-gray-500">
                All submitted claims have been processed.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      onClick={() => handleSort('claimNumber')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Claim #
                      {sortField === 'claimNumber' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('patientName')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Patient
                      {sortField === 'patientName' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th
                      onClick={() => handleSort('status')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Status
                      {sortField === 'status' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      onClick={() => handleSort('daysPending')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Days Pending
                      {sortField === 'daysPending' && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedAndFilteredClaims.map((claim) => (
                    <tr key={claim.claimId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {claim.claimNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {claim.patientName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(claim.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(claim.status)}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${getDaysPendingColor(claim.daysPending)}`}>
                        {claim.daysPending} day{claim.daysPending !== 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRefreshStatus(claim.claimId)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Refresh
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary Stats */}
          {pendingClaims.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Pending Claims Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{pendingClaims.length}</p>
                  <p className="text-sm text-gray-500">Total Pending</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-yellow-600">
                    {pendingClaims.filter(c => c.daysPending > 30).length}
                  </p>
                  <p className="text-sm text-gray-500">&gt; 30 Days</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {Math.round(pendingClaims.reduce((sum, c) => sum + c.daysPending, 0) / pendingClaims.length)}
                  </p>
                  <p className="text-sm text-gray-500">Avg. Days Pending</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {pendingClaims.filter(c => c.status === 'pended' || c.status === 'additional_info_requested').length}
                  </p>
                  <p className="text-sm text-gray-500">Need Attention</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Batches Table */}
          {batches.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No submission batches</h3>
              <p className="mt-1 text-sm text-gray-500">
                Batch submissions will appear here.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Batch #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Clearinghouse
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Claims
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {batch.batchNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {batch.clearinghouseName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(batch.batchDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {batch.totalClaims}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-4 text-xs">
                          <span className="text-green-600">{batch.acceptedCount} accepted</span>
                          <span className="text-red-600">{batch.rejectedCount} rejected</span>
                          <span className="text-yellow-600">{batch.pendingCount} pending</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{
                              width: `${batch.totalClaims > 0 ? (batch.acceptedCount / batch.totalClaims) * 100 : 0}%`
                            }}
                          ></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getBatchStatusBadge(batch.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
