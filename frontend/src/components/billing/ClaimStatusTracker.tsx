/**
 * ClaimStatusTracker Component
 *
 * Track and display the status of submitted claims with detailed history.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface StatusHistoryEntry {
  status: string;
  date: Date;
  notes?: string;
}

interface ClaimStatus {
  status: string;
  statusCode?: string;
  statusMessage?: string;
  lastUpdated: Date;
  history: StatusHistoryEntry[];
}

interface Submission {
  id: string;
  submissionDate: string;
  submissionNumber: string;
  x12ClaimId: string;
  status: string;
  statusCode?: string;
  statusMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  clearinghouseName: string;
  clearinghouseType: string;
}

interface ClaimStatusTrackerProps {
  claimId: string;
  claimNumber?: string;
  onStatusChange?: (status: string) => void;
}

export default function ClaimStatusTracker({ claimId, claimNumber, onStatusChange }: ClaimStatusTrackerProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadStatus();
    loadSubmissions();
  }, [claimId]);

  const loadStatus = async () => {
    if (!session) return;

    setLoading(true);
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

      if (response.status === 404) {
        // No submission found, this is okay
        setStatus(null);
        return;
      }

      if (!response.ok) throw new Error('Failed to load status');

      const data = await response.json();
      setStatus(data);
    } catch (err: unknown) {
      // Don't show error for not found
      if (!(err instanceof Error && err.message.includes('not found'))) {
        const message = err instanceof Error ? err.message : 'Failed to load status';
        showError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/${claimId}/submissions`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      setSubmissions(data.submissions || []);
    } catch {
      // Silent fail for submissions list
    }
  };

  const handleCheckStatus = async () => {
    if (!session) return;

    setChecking(true);
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

      const data = await response.json();
      setStatus(data);

      if (onStatusChange && data.status) {
        onStatusChange(data.status);
      }

      showSuccess('Status updated');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check status';
      showError(message);
    } finally {
      setChecking(false);
    }
  };

  const getStatusColor = (statusValue: string) => {
    switch (statusValue?.toLowerCase()) {
      case 'accepted':
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'rejected':
      case 'denied':
        return 'bg-red-100 text-red-800';
      case 'pending':
      case 'submitted':
      case 'pended':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (statusValue: string) => {
    switch (statusValue?.toLowerCase()) {
      case 'accepted':
      case 'paid':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'rejected':
      case 'denied':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'pending':
      case 'submitted':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!status && submissions.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">
          Claim has not been submitted to a clearinghouse yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Current Status Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {status && getStatusIcon(status.status)}
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Claim Status {claimNumber ? `- ${claimNumber}` : ''}
              </h3>
              {status && (
                <div className="flex items-center space-x-3 mt-1">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status.status)}`}>
                    {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
                  </span>
                  {status.statusCode && (
                    <span className="text-sm text-gray-500">
                      Code: {status.statusCode}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleCheckStatus}
            disabled={checking}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {checking ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking...
              </>
            ) : (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Status
              </>
            )}
          </button>
        </div>

        {status?.statusMessage && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded p-3">
            {status.statusMessage}
          </p>
        )}
      </div>

      {/* Status History */}
      {status?.history && status.history.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <svg
              className={`h-4 w-4 mr-2 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Status History ({status.history.length} entries)
          </button>

          {expanded && (
            <div className="mt-4 space-y-3">
              {status.history.map((entry, index) => (
                <div key={index} className="flex items-start space-x-3 text-sm">
                  <div className="flex-shrink-0 mt-1">
                    <div className={`h-2 w-2 rounded-full ${
                      entry.status === 'accepted' || entry.status === 'paid' ? 'bg-green-500' :
                      entry.status === 'rejected' || entry.status === 'denied' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                      </span>
                      <span className="text-gray-500">
                        {new Date(entry.date).toLocaleString()}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-gray-500 mt-1">{entry.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submissions List */}
      {submissions.length > 0 && (
        <div className="px-6 py-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Submission History</h4>
          <div className="space-y-3">
            {submissions.map((submission) => (
              <div key={submission.id} className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Control #:</span>
                    <p className="font-medium">{submission.x12ClaimId || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Clearinghouse:</span>
                    <p className="font-medium">{submission.clearinghouseName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Submitted:</span>
                    <p className="font-medium">
                      {new Date(submission.submissionDate).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <p className={`font-medium ${
                      submission.status === 'accepted' ? 'text-green-600' :
                      submission.status === 'rejected' ? 'text-red-600' :
                      'text-yellow-600'
                    }`}>
                      {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                    </p>
                  </div>
                </div>
                {submission.errorMessage && (
                  <div className="mt-3 text-sm text-red-600 bg-red-50 rounded p-2">
                    <strong>Error:</strong> {submission.errorMessage}
                    {submission.errorCode && ` (${submission.errorCode})`}
                  </div>
                )}
                {submission.statusMessage && !submission.errorMessage && (
                  <div className="mt-3 text-sm text-gray-600 bg-gray-100 rounded p-2">
                    {submission.statusMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
