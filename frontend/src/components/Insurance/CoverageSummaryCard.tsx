/**
 * Coverage Summary Card Component
 *
 * Displays insurance coverage details at a glance including:
 * - Payer and plan information
 * - Copay amounts
 * - Deductible status (met/remaining)
 * - Coinsurance percentage
 * - Prior auth requirements
 * - Verification status and date
 */

import React from 'react';
import { InsuranceStatusBadge } from './InsuranceStatusBadge';

interface CoverageSummaryCardProps {
  eligibility: {
    status?: string;
    verifiedAt?: string | Date;
    payerName?: string;
    planName?: string;
    memberId?: string;
    groupNumber?: string;
    copayAmount?: number;
    deductibleTotal?: number;
    deductibleMet?: number;
    deductibleRemaining?: number;
    coinsurancePercent?: number;
    oopMax?: number;
    oopMet?: number;
    oopRemaining?: number;
    priorAuthRequired?: boolean;
    referralRequired?: boolean;
    hasIssues?: boolean;
    issueNotes?: string;
  };
  onRefresh?: () => void;
  isRefreshing?: boolean;
  compact?: boolean;
}

export const CoverageSummaryCard: React.FC<CoverageSummaryCardProps> = ({
  eligibility,
  onRefresh,
  isRefreshing,
  compact = false,
}) => {
  const formatCurrency = (cents?: number) => {
    if (cents === undefined || cents === null) return 'N/A';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatPercent = (percent?: number) => {
    if (percent === undefined || percent === null) return 'N/A';
    return `${percent}%`;
  };

  const deductibleProgress = eligibility.deductibleTotal
    ? ((eligibility.deductibleMet || 0) / eligibility.deductibleTotal) * 100
    : 0;

  const oopProgress = eligibility.oopMax
    ? ((eligibility.oopMet || 0) / eligibility.oopMax) * 100
    : 0;

  if (compact) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">{eligibility.payerName || 'No Insurance'}</h3>
            {eligibility.planName && (
              <p className="text-sm text-gray-600">{eligibility.planName}</p>
            )}
          </div>
          <InsuranceStatusBadge
            status={eligibility.status}
            verifiedAt={eligibility.verifiedAt}
            hasIssues={eligibility.hasIssues}
            size="sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-gray-600">Copay</p>
            <p className="font-semibold text-gray-900">{formatCurrency(eligibility.copayAmount)}</p>
          </div>
          <div>
            <p className="text-gray-600">Deductible Left</p>
            <p className="font-semibold text-gray-900">{formatCurrency(eligibility.deductibleRemaining)}</p>
          </div>
          <div>
            <p className="text-gray-600">Coinsurance</p>
            <p className="font-semibold text-gray-900">{formatPercent(eligibility.coinsurancePercent)}</p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="mt-3 w-full text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : '↻ Refresh Eligibility'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Insurance Coverage</h2>
            {eligibility.payerName && (
              <p className="text-sm text-gray-600 mt-1">
                {eligibility.payerName} {eligibility.planName && `- ${eligibility.planName}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <InsuranceStatusBadge
              status={eligibility.status}
              verifiedAt={eligibility.verifiedAt}
              hasIssues={eligibility.hasIssues}
              showDate
            />
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-50 transition-colors"
                title="Refresh eligibility"
              >
                {isRefreshing ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Refreshing...</span>
                  </span>
                ) : (
                  '↻ Refresh'
                )}
              </button>
            )}
          </div>
        </div>

        {eligibility.hasIssues && eligibility.issueNotes && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              <span className="font-semibold">⚠ Issue: </span>
              {eligibility.issueNotes}
            </p>
          </div>
        )}
      </div>

      {/* Member Info */}
      {(eligibility.memberId || eligibility.groupNumber) && (
        <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {eligibility.memberId && (
              <div>
                <p className="text-gray-600">Member ID</p>
                <p className="font-mono font-semibold text-gray-900">{eligibility.memberId}</p>
              </div>
            )}
            {eligibility.groupNumber && (
              <div>
                <p className="text-gray-600">Group Number</p>
                <p className="font-mono font-semibold text-gray-900">{eligibility.groupNumber}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Benefits Summary */}
      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Benefits Summary</h3>

        <div className="space-y-4">
          {/* Copay */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Specialist Copay</span>
            <span className="text-lg font-semibold text-gray-900">{formatCurrency(eligibility.copayAmount)}</span>
          </div>

          {/* Deductible */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Deductible</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(eligibility.deductibleMet)} of {formatCurrency(eligibility.deductibleTotal)} met
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(deductibleProgress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(eligibility.deductibleRemaining)} remaining
            </p>
          </div>

          {/* Out-of-Pocket Max */}
          {eligibility.oopMax && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Out-of-Pocket Max</span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(eligibility.oopMet)} of {formatCurrency(eligibility.oopMax)} met
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(oopProgress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatCurrency(eligibility.oopRemaining)} remaining
              </p>
            </div>
          )}

          {/* Coinsurance */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Coinsurance</span>
            <span className="text-lg font-semibold text-gray-900">{formatPercent(eligibility.coinsurancePercent)}</span>
          </div>
        </div>
      </div>

      {/* Requirements */}
      {(eligibility.priorAuthRequired || eligibility.referralRequired) && (
        <div className="border-t border-gray-200 px-6 py-4 bg-yellow-50">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Requirements</h3>
          <div className="space-y-1">
            {eligibility.priorAuthRequired && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">⚠</span> Prior authorization may be required for certain procedures
              </p>
            )}
            {eligibility.referralRequired && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">⚠</span> Referral required for specialist visits
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
