/**
 * ClaimsManagementPage
 *
 * Full claims management dashboard with clearinghouse submission,
 * status tracking, and batch operations.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../utils/apiBase';
import ClaimSubmission from '../components/billing/ClaimSubmission';
import ClaimStatusTracker from '../components/billing/ClaimStatusTracker';
import ClaimQueue from '../components/billing/ClaimQueue';

type TabView = 'submit' | 'pending' | 'remittances' | 'clearinghouses';

interface Clearinghouse {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isDefault: boolean;
  apiEndpoint?: string;
  submissionFormat: string;
  submissionMethod: string;
  batchEnabled: boolean;
  maxBatchSize: number;
  createdAt: string;
}

interface Remittance {
  id: string;
  claimId?: string;
  claimNumber?: string;
  eraNumber: string;
  eraDate: string;
  payerName?: string;
  paymentAmount: number;
  patientResponsibility: number;
  patientName?: string;
  status: string;
  reconciled: boolean;
  createdAt: string;
}

interface DashboardStats {
  pendingSubmission: number;
  awaitingResponse: number;
  acceptedToday: number;
  rejectedToday: number;
  totalPendingAmount: number;
}

export default function ClaimsManagementPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabView>('submit');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    pendingSubmission: 0,
    awaitingResponse: 0,
    acceptedToday: 0,
    rejectedToday: 0,
    totalPendingAmount: 0,
  });
  const [clearinghouses, setClearinghouses] = useState<Clearinghouse[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  // Clearinghouse form state
  const [showAddClearinghouse, setShowAddClearinghouse] = useState(false);
  const [editingClearinghouse, setEditingClearinghouse] = useState<Clearinghouse | null>(null);
  const [clearinghouseForm, setClearinghouseForm] = useState({
    name: '',
    type: 'change_healthcare' as const,
    apiEndpoint: '',
    submissionFormat: '837P',
    submissionMethod: 'api',
    batchEnabled: true,
    maxBatchSize: 100,
    isDefault: false,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === 'clearinghouses') {
      loadClearinghouses();
    } else if (activeTab === 'remittances') {
      loadRemittances();
    }
  }, [activeTab]);

  const loadDashboardData = async () => {
    if (!session) return;

    setLoading(true);
    try {
      // Load pending claims count
      const [readyResponse, pendingResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/claims?status=ready`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
        fetch(`${API_BASE_URL}/api/claims-submission/pending`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
      ]);

      if (readyResponse.ok) {
        const readyData = await readyResponse.json();
        setStats(prev => ({
          ...prev,
          pendingSubmission: readyData.claims?.length || 0,
        }));
      }

      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        setStats(prev => ({
          ...prev,
          awaitingResponse: pendingData.claims?.length || 0,
        }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadClearinghouses = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/clearinghouses`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load clearinghouses');

      const data = await response.json();
      setClearinghouses(data.clearinghouses || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load clearinghouses';
      showError(message);
    }
  };

  const loadRemittances = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/remittances?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load remittances');

      const data = await response.json();
      setRemittances(data.remittances || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load remittances';
      showError(message);
    }
  };

  const handleSaveClearinghouse = async () => {
    if (!session) return;

    try {
      const url = editingClearinghouse
        ? `${API_BASE_URL}/api/claims-submission/clearinghouses/${editingClearinghouse.id}`
        : `${API_BASE_URL}/api/claims-submission/clearinghouses`;

      const response = await fetch(url, {
        method: editingClearinghouse ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify(clearinghouseForm),
      });

      if (!response.ok) throw new Error('Failed to save clearinghouse');

      showSuccess(editingClearinghouse ? 'Clearinghouse updated' : 'Clearinghouse created');
      setShowAddClearinghouse(false);
      setEditingClearinghouse(null);
      setClearinghouseForm({
        name: '',
        type: 'change_healthcare',
        apiEndpoint: '',
        submissionFormat: '837P',
        submissionMethod: 'api',
        batchEnabled: true,
        maxBatchSize: 100,
        isDefault: false,
      });
      loadClearinghouses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save clearinghouse';
      showError(message);
    }
  };

  const handleDeleteClearinghouse = async (id: string) => {
    if (!session) return;
    if (!confirm('Are you sure you want to delete this clearinghouse configuration?')) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/clearinghouses/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to delete clearinghouse');

      showSuccess('Clearinghouse deleted');
      loadClearinghouses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete clearinghouse';
      showError(message);
    }
  };

  const handleEditClearinghouse = (ch: Clearinghouse) => {
    setEditingClearinghouse(ch);
    setClearinghouseForm({
      name: ch.name,
      type: ch.type as 'change_healthcare' | 'availity' | 'trizetto' | 'waystar' | 'custom',
      apiEndpoint: ch.apiEndpoint || '',
      submissionFormat: ch.submissionFormat,
      submissionMethod: ch.submissionMethod,
      batchEnabled: ch.batchEnabled,
      maxBatchSize: ch.maxBatchSize,
      isDefault: ch.isDefault,
    });
    setShowAddClearinghouse(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      received: 'bg-blue-100 text-blue-800',
      pending_review: 'bg-yellow-100 text-yellow-800',
      posted: 'bg-green-100 text-green-800',
      disputed: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Submit claims, track status, and manage remittances
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Ready to Submit</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.pendingSubmission}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Awaiting Response</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.awaitingResponse}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Accepted Today</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.acceptedToday}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Rejected Today</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.rejectedToday}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('submit')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'submit'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Submit Claims
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Queue
          </button>
          <button
            onClick={() => setActiveTab('remittances')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'remittances'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Remittances
          </button>
          <button
            onClick={() => setActiveTab('clearinghouses')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'clearinghouses'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Clearinghouses
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'submit' && (
          <ClaimSubmission onSubmitted={loadDashboardData} />
        )}

        {activeTab === 'pending' && (
          <ClaimQueue />
        )}

        {activeTab === 'remittances' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Remittance Advices (ERA/EOB)</h2>
              <button
                onClick={loadRemittances}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>

            {remittances.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No remittances</h3>
                <p className="mt-1 text-sm text-gray-500">
                  ERA/EOB data will appear here when received from payers.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ERA #</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claim</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient Resp.</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {remittances.map((remittance) => (
                      <tr key={remittance.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {remittance.eraNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {remittance.claimNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {remittance.patientName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {remittance.payerName || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          {formatCurrency(remittance.paymentAmount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatCurrency(remittance.patientResponsibility)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(remittance.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(remittance.eraDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clearinghouses' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Clearinghouse Configurations</h2>
              <button
                onClick={() => {
                  setEditingClearinghouse(null);
                  setClearinghouseForm({
                    name: '',
                    type: 'change_healthcare',
                    apiEndpoint: '',
                    submissionFormat: '837P',
                    submissionMethod: 'api',
                    batchEnabled: true,
                    maxBatchSize: 100,
                    isDefault: false,
                  });
                  setShowAddClearinghouse(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Clearinghouse
              </button>
            </div>

            {clearinghouses.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No clearinghouses configured</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Add a clearinghouse to start submitting claims electronically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clearinghouses.map((ch) => (
                  <div key={ch.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{ch.name}</h3>
                        <p className="text-sm text-gray-500 capitalize">{ch.type.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {ch.isDefault && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            Default
                          </span>
                        )}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          ch.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {ch.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                      <div className="flex justify-between">
                        <span>Format:</span>
                        <span className="font-medium text-gray-900">{ch.submissionFormat}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Method:</span>
                        <span className="font-medium text-gray-900 capitalize">{ch.submissionMethod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Batch:</span>
                        <span className="font-medium text-gray-900">
                          {ch.batchEnabled ? `Yes (max ${ch.maxBatchSize})` : 'No'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-3">
                      <button
                        onClick={() => handleEditClearinghouse(ch)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClearinghouse(ch.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clearinghouse Modal */}
      {showAddClearinghouse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingClearinghouse ? 'Edit Clearinghouse' : 'Add Clearinghouse'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={clearinghouseForm.name}
                  onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={clearinghouseForm.type}
                  onChange={(e) => setClearinghouseForm({
                    ...clearinghouseForm,
                    type: e.target.value as 'change_healthcare' | 'availity' | 'trizetto' | 'waystar' | 'custom'
                  })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="change_healthcare">Change Healthcare</option>
                  <option value="availity">Availity</option>
                  <option value="trizetto">Trizetto</option>
                  <option value="waystar">Waystar</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">API Endpoint</label>
                <input
                  type="url"
                  value={clearinghouseForm.apiEndpoint}
                  onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, apiEndpoint: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Submission Format</label>
                  <select
                    value={clearinghouseForm.submissionFormat}
                    onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, submissionFormat: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="837P">837P (Professional)</option>
                    <option value="837I">837I (Institutional)</option>
                    <option value="CMS1500">CMS-1500</option>
                    <option value="UB04">UB-04</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Submission Method</label>
                  <select
                    value={clearinghouseForm.submissionMethod}
                    onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, submissionMethod: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="api">API</option>
                    <option value="sftp">SFTP</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={clearinghouseForm.batchEnabled}
                    onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, batchEnabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Enable batch submission</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={clearinghouseForm.isDefault}
                    onChange={(e) => setClearinghouseForm({ ...clearinghouseForm, isDefault: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Set as default</span>
                </label>
              </div>

              {clearinghouseForm.batchEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Max Batch Size</label>
                  <input
                    type="number"
                    value={clearinghouseForm.maxBatchSize}
                    onChange={(e) => setClearinghouseForm({
                      ...clearinghouseForm,
                      maxBatchSize: parseInt(e.target.value) || 100
                    })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    min="1"
                    max="1000"
                  />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddClearinghouse(false);
                  setEditingClearinghouse(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClearinghouse}
                disabled={!clearinghouseForm.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {editingClearinghouse ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Tracker Modal */}
      {selectedClaimId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Claim Status</h3>
              <button
                onClick={() => setSelectedClaimId(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[60vh]">
              <ClaimStatusTracker claimId={selectedClaimId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
