/**
 * ClaimSubmission Component
 *
 * Submit individual or multiple claims to clearinghouse for processing.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { API_BASE_URL } from '../../utils/apiBase';

interface Claim {
  id: string;
  claimNumber: string;
  patientFirstName: string;
  patientLastName: string;
  totalCharges: number;
  status: string;
  serviceDate: string;
  payerName?: string;
  scrubStatus?: string;
}

interface Clearinghouse {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
}

interface SubmissionResult {
  id: string;
  claimId: string;
  x12ClaimId: string;
  status: string;
  statusMessage: string;
  submittedAt: string;
}

interface ClaimSubmissionProps {
  claimId?: string;
  onSubmitted?: () => void;
}

export default function ClaimSubmission({ claimId, onSubmitted }: ClaimSubmissionProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [clearinghouses, setClearinghouses] = useState<Clearinghouse[]>([]);
  const [selectedClearinghouse, setSelectedClearinghouse] = useState<string>('');
  const [lastResult, setLastResult] = useState<SubmissionResult | null>(null);
  const [showX12Preview, setShowX12Preview] = useState(false);
  const [x12Content, setX12Content] = useState<string>('');
  const [previewClaimId, setPreviewClaimId] = useState<string>('');

  useEffect(() => {
    if (claimId) {
      setSelectedClaims([claimId]);
    }
    loadClearinghouses();
    loadReadyClaims();
  }, [claimId]);

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

      // Set default clearinghouse
      const defaultCh = data.clearinghouses?.find((ch: Clearinghouse) => ch.isDefault);
      if (defaultCh) {
        setSelectedClearinghouse(defaultCh.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load clearinghouses';
      showError(message);
    }
  };

  const loadReadyClaims = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims?status=ready`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load claims');

      const data = await response.json();
      setClaims(data.claims || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load claims';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSingle = async (targetClaimId: string) => {
    if (!session || !selectedClearinghouse) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({
            claimId: targetClaimId,
            clearinghouseId: selectedClearinghouse,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Submission failed');
      }

      const data = await response.json();
      setLastResult(data.submission);
      showSuccess(`Claim submitted successfully. Status: ${data.submission.status}`);

      // Remove from list
      setClaims(claims.filter(c => c.id !== targetClaimId));
      setSelectedClaims(selectedClaims.filter(id => id !== targetClaimId));

      if (onSubmitted) onSubmitted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (!session || !selectedClearinghouse || selectedClaims.length === 0) return;

    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/batch-submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({
            claimIds: selectedClaims,
            clearinghouseId: selectedClearinghouse,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Batch submission failed');
      }

      const data = await response.json();

      showSuccess(
        `Batch submitted: ${data.batch.submitted}/${data.batch.totalClaims} claims processed`
      );

      // Remove submitted claims
      const submittedIds = new Set(selectedClaims.filter(
        id => !data.batch.errors?.some((e: { claimId: string }) => e.claimId === id)
      ));
      setClaims(claims.filter(c => !submittedIds.has(c.id)));
      setSelectedClaims([]);

      if (onSubmitted) onSubmitted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Batch submission failed';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewX12 = async (previewId: string) => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/claims-submission/${previewId}/x12`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to generate X12 preview');

      const data = await response.json();
      setX12Content(data.x12Content);
      setPreviewClaimId(previewId);
      setShowX12Preview(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to preview X12';
      showError(message);
    }
  };

  const toggleClaimSelection = (toggleClaimId: string) => {
    setSelectedClaims(prev =>
      prev.includes(toggleClaimId)
        ? prev.filter(id => id !== toggleClaimId)
        : [...prev, toggleClaimId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedClaims.length === claims.length) {
      setSelectedClaims([]);
    } else {
      setSelectedClaims(claims.map(c => c.id));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getScrubStatusBadge = (scrubStatus?: string) => {
    switch (scrubStatus) {
      case 'clean':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Clean</span>;
      case 'warnings':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Warnings</span>;
      case 'errors':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Errors</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">Not Scrubbed</span>;
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded w-1/3"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Clearinghouse Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Submit Claims to Clearinghouse</h2>
            <p className="text-sm text-gray-500 mt-1">
              Select claims and submit to your clearinghouse for processing
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Clearinghouse:</label>
            <select
              value={selectedClearinghouse}
              onChange={(e) => setSelectedClearinghouse(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select clearinghouse...</option>
              {clearinghouses.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} ({ch.type}) {ch.isDefault ? '- Default' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Claims List */}
      {claims.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No claims ready for submission</h3>
          <p className="mt-1 text-sm text-gray-500">
            Claims need to pass scrubbing before they can be submitted.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <input
                type="checkbox"
                checked={selectedClaims.length === claims.length && claims.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-600">
                {selectedClaims.length} of {claims.length} selected
              </span>
            </div>
            <button
              onClick={handleBatchSubmit}
              disabled={submitting || selectedClaims.length === 0 || !selectedClearinghouse}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {submitting ? 'Submitting...' : `Submit Selected (${selectedClaims.length})`}
            </button>
          </div>

          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Claim #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scrub</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {claims.map((claim) => (
                <tr key={claim.id} className={selectedClaims.includes(claim.id) ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedClaims.includes(claim.id)}
                      onChange={() => toggleClaimSelection(claim.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {claim.claimNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {claim.patientFirstName} {claim.patientLastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(claim.serviceDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {claim.payerName || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(claim.totalCharges)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getScrubStatusBadge(claim.scrubStatus)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handlePreviewX12(claim.id)}
                      className="text-gray-600 hover:text-gray-900"
                      title="Preview X12"
                    >
                      <svg className="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleSubmitSingle(claim.id)}
                      disabled={submitting || !selectedClearinghouse}
                      className="text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                    >
                      Submit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Last Submission Result */}
      {lastResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Last Submission Result</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Claim ID:</span>
              <p className="font-medium">{lastResult.x12ClaimId}</p>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <p className={`font-medium ${
                lastResult.status === 'accepted' ? 'text-green-600' :
                lastResult.status === 'rejected' ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {lastResult.status.charAt(0).toUpperCase() + lastResult.status.slice(1)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Message:</span>
              <p className="font-medium">{lastResult.statusMessage}</p>
            </div>
            <div>
              <span className="text-gray-500">Submitted:</span>
              <p className="font-medium">
                {new Date(lastResult.submittedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* X12 Preview Modal */}
      {showX12Preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">X12 837P Preview</h3>
              <button
                onClick={() => setShowX12Preview(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[60vh]">
              <pre className="text-xs font-mono bg-gray-50 p-4 rounded overflow-x-auto whitespace-pre-wrap">
                {x12Content}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(x12Content);
                  showSuccess('X12 content copied to clipboard');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowX12Preview(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
