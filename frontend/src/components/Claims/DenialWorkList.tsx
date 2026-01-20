import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface Denial {
  id: string;
  claimNumber: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  providerName?: string;
  serviceDate: string;
  totalCharges: number;
  denialReason?: string;
  denialCode?: string;
  denialDate?: string;
  denialCategory?: string;
  appealStatus?: string;
  appealSubmittedAt?: string;
  daysSinceDenial?: number;
}

interface DenialWorkListProps {
  onReload?: () => void;
}

export default function DenialWorkList({ onReload }: DenialWorkListProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [denials, setDenials] = useState<Denial[]>([]);
  const [selectedDenial, setSelectedDenial] = useState<Denial | null>(null);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealNotes, setAppealNotes] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);

  useEffect(() => {
    loadDenials();
  }, []);

  const loadDenials = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(
        `${apiBase}/api/claims/denials`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load denials');

      const data = await response.json();
      setDenials(data.denials || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load denials');
    } finally {
      setLoading(false);
    }
  };

  const handleAppeal = (denial: Denial) => {
    setSelectedDenial(denial);
    setShowAppealModal(true);
    setAppealNotes('');
  };

  const submitAppeal = async () => {
    if (!session || !selectedDenial) return;

    setAppealSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(
        `${apiBase}/api/claims/${selectedDenial.id}/appeal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({
            appealNotes,
            denialReason: selectedDenial.denialReason,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to submit appeal');

      showSuccess('Appeal submitted successfully');
      setShowAppealModal(false);
      setSelectedDenial(null);
      loadDenials();
      if (onReload) onReload();
    } catch (err: any) {
      showError(err.message || 'Failed to submit appeal');
    } finally {
      setAppealSubmitting(false);
    }
  };

  const getSuggestedAction = (category?: string) => {
    const actions: { [key: string]: { action: string; color: string } } = {
      cosmetic_vs_medical: { action: 'Appeal with documentation', color: 'text-blue-600' },
      modifier_issue: { action: 'Correct & resubmit', color: 'text-green-600' },
      prior_auth: { action: 'Request retro auth', color: 'text-orange-600' },
      documentation: { action: 'Submit additional docs', color: 'text-purple-600' },
      duplicate: { action: 'Verify & void if duplicate', color: 'text-red-600' },
    };

    return actions[category || ''] || { action: 'Review', color: 'text-gray-600' };
  };

  const getUrgencyClass = (days?: number) => {
    if (!days) return 'text-gray-600';
    if (days > 90) return 'text-red-600 font-bold';
    if (days > 60) return 'text-orange-600 font-semibold';
    if (days > 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-200 rounded"></div>
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Denied Claims - Work List</h2>
        <button
          onClick={loadDenials}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Denials Table */}
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
                Denial Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Days Since
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Suggested Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {denials.map((denial) => {
              const suggestedAction = getSuggestedAction(denial.denialCategory);
              return (
                <tr key={denial.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {denial.claimNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {denial.patientFirstName} {denial.patientLastName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div>{denial.denialReason || 'Not specified'}</div>
                    {denial.denialCode && (
                      <div className="text-xs text-gray-500">Code: {denial.denialCode}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={getUrgencyClass(denial.daysSinceDenial)}>
                      {denial.daysSinceDenial || 0} days
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${denial.totalCharges.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={suggestedAction.color}>{suggestedAction.action}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {denial.appealStatus ? (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                        {denial.appealStatus}
                      </span>
                    ) : (
                      <span className="text-gray-500">Not appealed</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!denial.appealStatus && (
                      <button
                        onClick={() => handleAppeal(denial)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Appeal
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {denials.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                  <div className="text-green-600 text-3xl mb-2">✅</div>
                  <div>No denied claims found</div>
                  <div className="text-xs text-gray-400 mt-1">Great job!</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Appeal Modal */}
      {showAppealModal && selectedDenial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Submit Appeal</h3>
              <p className="text-sm text-gray-600 mt-1">
                Claim #{selectedDenial.claimNumber} - {selectedDenial.patientFirstName} {selectedDenial.patientLastName}
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <p className="text-sm text-gray-700">
                  <strong>Denial Reason:</strong> {selectedDenial.denialReason || 'Not specified'}
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  <strong>Suggested Action:</strong>{' '}
                  <span className={getSuggestedAction(selectedDenial.denialCategory).color}>
                    {getSuggestedAction(selectedDenial.denialCategory).action}
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appeal Notes / Justification
                </label>
                <textarea
                  value={appealNotes}
                  onChange={(e) => setAppealNotes(e.target.value)}
                  placeholder="Explain why this claim should be reconsidered..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={6}
                  required
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-900">
                  <strong>Tip:</strong> Include specific medical necessity documentation, policy references,
                  and any supporting evidence that justifies coverage.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowAppealModal(false);
                  setSelectedDenial(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAppeal}
                disabled={appealSubmitting || !appealNotes.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {appealSubmitting ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
