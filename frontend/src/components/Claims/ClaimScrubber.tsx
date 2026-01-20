import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ScrubIssue {
  severity: 'error' | 'warning' | 'info';
  ruleCode: string;
  ruleName: string;
  message: string;
  suggestion?: string;
  autoFixable?: boolean;
}

interface ScrubResult {
  status: 'clean' | 'warnings' | 'errors';
  errors: ScrubIssue[];
  warnings: ScrubIssue[];
  info: ScrubIssue[];
  canSubmit: boolean;
  passedChecks?: string[];
  autoFixed?: boolean;
}

interface ClaimScrubberProps {
  claimId: string;
  onClose: () => void;
}

export default function ClaimScrubber({ claimId, onClose }: ClaimScrubberProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [scrubbing, setScrubbingstate] = useState(false);
  const [result, setResult] = useState<ScrubResult | null>(null);
  const [claimInfo, setClaimInfo] = useState<any>(null);

  useEffect(() => {
    loadClaimAndScrub();
  }, [claimId]);

  const loadClaimAndScrub = async () => {
    if (!session) return;

    setLoading(true);
    try {
      // Load claim details
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const claimResponse = await fetch(
        `${apiBase}/api/claims/${claimId}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!claimResponse.ok) throw new Error('Failed to load claim');

      const claimData = await claimResponse.json();
      setClaimInfo(claimData.claim);

      // Run scrubber
      await runScrubber(false);
    } catch (err: any) {
      showError(err.message || 'Failed to load claim');
    } finally {
      setLoading(false);
    }
  };

  const runScrubber = async (autoFix: boolean = false) => {
    if (!session) return;

    setScrubbingstate(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
      const response = await fetch(
        `${apiBase}/api/claims/scrub`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({ claimId, autoFix }),
        }
      );

      if (!response.ok) throw new Error('Failed to scrub claim');

      const scrubData = await response.json();
      setResult(scrubData);

      if (autoFix && scrubData.autoFixed) {
        showSuccess('Auto-fixed issues successfully');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to scrub claim');
    } finally {
      setScrubbingstate(false);
    }
  };

  const handleAutoFix = async () => {
    await runScrubber(true);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-48 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Claim Scrubber Results</h2>
              {claimInfo && (
                <div className="mt-1 text-sm text-gray-600">
                  <span>Patient: {claimInfo.patientFirstName} {claimInfo.patientLastName}</span>
                  <span className="mx-2">•</span>
                  <span>DOS: {new Date(claimInfo.serviceDate).toLocaleDateString()}</span>
                  {claimInfo.providerName && (
                    <>
                      <span className="mx-2">•</span>
                      <span>Provider: {claimInfo.providerName}</span>
                    </>
                  )}
                  {claimInfo.payerName && (
                    <>
                      <span className="mx-2">•</span>
                      <span>Payer: {claimInfo.payerName}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {result && (
            <>
              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="border border-red-300 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-red-600 text-xl">❌</span>
                    <h3 className="font-bold text-red-900">ERRORS (must fix before submission)</h3>
                  </div>
                  <div className="space-y-3">
                    {result.errors.map((issue, idx) => (
                      <div key={idx} className="bg-white rounded p-3 border border-red-200">
                        <div className="font-medium text-red-900">{issue.message}</div>
                        {issue.suggestion && (
                          <div className="text-sm text-gray-700 mt-1">
                            Suggestion: {issue.suggestion}
                          </div>
                        )}
                        {issue.autoFixable && (
                          <button
                            onClick={handleAutoFix}
                            disabled={scrubbing}
                            className="mt-2 text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
                          >
                            Auto-Fix
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="border border-yellow-300 rounded-lg p-4 bg-yellow-50">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-yellow-600 text-xl">⚠️</span>
                    <h3 className="font-bold text-yellow-900">WARNINGS (review recommended)</h3>
                  </div>
                  <div className="space-y-3">
                    {result.warnings.map((issue, idx) => (
                      <div key={idx} className="bg-white rounded p-3 border border-yellow-200">
                        <div className="font-medium text-yellow-900">{issue.message}</div>
                        {issue.suggestion && (
                          <div className="text-sm text-gray-700 mt-1">
                            Suggestion: {issue.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info */}
              {result.info.length > 0 && (
                <div className="border border-blue-300 rounded-lg p-4 bg-blue-50">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-blue-600 text-xl">ℹ️</span>
                    <h3 className="font-bold text-blue-900">INFO</h3>
                  </div>
                  <div className="space-y-2">
                    {result.info.map((issue, idx) => (
                      <div key={idx} className="text-sm text-gray-700">
                        {issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Passed Checks */}
              {result.passedChecks && result.passedChecks.length > 0 && (
                <div className="border border-green-300 rounded-lg p-4 bg-green-50">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="text-green-600 text-xl">✅</span>
                    <h3 className="font-bold text-green-900">PASSED CHECKS</h3>
                  </div>
                  <ul className="space-y-1">
                    {result.passedChecks.map((check, idx) => (
                      <li key={idx} className="text-sm text-green-800 flex items-center">
                        <span className="mr-2">✓</span>
                        {check}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Clean Status */}
              {result.status === 'clean' && result.errors.length === 0 && result.warnings.length === 0 && (
                <div className="border border-green-300 rounded-lg p-6 bg-green-50 text-center">
                  <div className="text-green-600 text-4xl mb-2">✅</div>
                  <h3 className="font-bold text-green-900 text-lg">Claim is Clean!</h3>
                  <p className="text-green-700 mt-2">No issues found. This claim is ready to submit.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between">
          <div className="flex items-center space-x-2">
            {result && !result.canSubmit && (
              <span className="text-red-600 text-sm font-medium">Cannot submit - fix errors first</span>
            )}
            {result && result.canSubmit && (
              <span className="text-green-600 text-sm font-medium">Ready to submit</span>
            )}
          </div>
          <div className="space-x-2">
            <button
              onClick={() => runScrubber(false)}
              disabled={scrubbing}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Re-Scrub
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
