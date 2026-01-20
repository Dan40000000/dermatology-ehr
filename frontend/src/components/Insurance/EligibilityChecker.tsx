/**
 * EligibilityChecker Component
 *
 * Displays current insurance on file and allows real-time verification
 * Shows comprehensive verification results including copays, deductibles, and prior auth requirements
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, RefreshCw, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import { api } from '../../api';

interface EligibilityCheckerProps {
  patientId: string;
  appointmentId?: string;
  autoVerify?: boolean;
  onVerificationComplete?: (result: any) => void;
}

interface VerificationResult {
  id: string;
  patientId: string;
  verificationStatus: string;
  verifiedAt: string;
  payerName: string;
  hasIssues: boolean;
  issueNotes?: string;
  memberID?: string;
  groupNumber?: string;
  planName?: string;
  planType?: string;
  effectiveDate?: string;
  terminationDate?: string;
  benefits: {
    copays?: {
      specialist?: number;
      primaryCare?: number;
      emergency?: number;
      urgentCare?: number;
    };
    deductible?: {
      individual?: {
        total: number;
        met: number;
        remaining: number;
      };
    };
    coinsurance?: {
      percentage: number;
    };
    outOfPocketMax?: {
      individual?: {
        total: number;
        met: number;
        remaining: number;
      };
    };
    priorAuth?: {
      required: boolean;
      services?: string[];
      phone?: string;
    };
  };
}

export const EligibilityChecker: React.FC<EligibilityCheckerProps> = ({
  patientId,
  appointmentId,
  autoVerify = false,
  onVerificationComplete,
}) => {
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastVerifiedTime, setLastVerifiedTime] = useState<string>('');

  useEffect(() => {
    // Load latest verification on mount
    loadLatestVerification();

    // Auto-verify if enabled
    if (autoVerify) {
      verifyEligibility();
    }
  }, [patientId]);

  const loadLatestVerification = async () => {
    try {
      const response = await api.get(`/api/eligibility/history/${patientId}`);
      if (response.data.success && response.data.history.length > 0) {
        const latest = response.data.history[0];
        setVerification(mapVerificationFromHistory(latest));
        updateLastVerifiedTime(latest.verified_at);
      }
    } catch (err) {
      console.error('Error loading verification history:', err);
    }
  };

  const verifyEligibility = async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/eligibility/verify/${patientId}${appointmentId ? `?appointmentId=${appointmentId}` : ''}`;
      const response = await api.post(url);

      if (response.data.success) {
        setVerification(response.data.verification);
        updateLastVerifiedTime(response.data.verification.verifiedAt);
        onVerificationComplete?.(response.data.verification);
      } else {
        setError(response.data.error || 'Verification failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify insurance eligibility');
    } finally {
      setLoading(false);
    }
  };

  const updateLastVerifiedTime = (timestamp: string) => {
    const now = new Date();
    const verified = new Date(timestamp);
    const diffMs = now.getTime() - verified.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      setLastVerifiedTime('Just now');
    } else if (diffMins < 60) {
      setLastVerifiedTime(`${diffMins} minute${diffMins > 1 ? 's' : ''} ago`);
    } else if (diffHours < 24) {
      setLastVerifiedTime(`${diffHours} hour${diffHours > 1 ? 's' : ''} ago`);
    } else {
      setLastVerifiedTime(`${diffDays} day${diffDays > 1 ? 's' : ''} ago`);
    }
  };

  const mapVerificationFromHistory = (historyItem: any): VerificationResult => {
    return {
      id: historyItem.id,
      patientId,
      verificationStatus: historyItem.verification_status,
      verifiedAt: historyItem.verified_at,
      payerName: historyItem.payer_name,
      hasIssues: historyItem.has_issues,
      issueNotes: historyItem.issue_notes,
      memberID: historyItem.member_id,
      benefits: {
        copays: {
          specialist: historyItem.copay_specialist_cents,
          primaryCare: historyItem.copay_pcp_cents,
        },
        deductible: historyItem.deductible_total_cents ? {
          individual: {
            total: historyItem.deductible_total_cents,
            met: historyItem.deductible_total_cents - historyItem.deductible_remaining_cents,
            remaining: historyItem.deductible_remaining_cents,
          },
        } : undefined,
        outOfPocketMax: historyItem.oop_max_cents ? {
          individual: {
            total: historyItem.oop_max_cents,
            met: historyItem.oop_max_cents - historyItem.oop_remaining_cents,
            remaining: historyItem.oop_remaining_cents,
          },
        } : undefined,
        priorAuth: {
          required: !!historyItem.prior_auth_required,
          services: historyItem.prior_auth_required,
        },
      },
    };
  };

  const formatCurrency = (cents: number | undefined): string => {
    if (cents === undefined || cents === null) return 'N/A';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'inactive':
      case 'terminated':
        return <XCircle className="w-6 h-6 text-red-600" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return <AlertCircle className="w-6 h-6 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 border-green-200';
      case 'inactive':
      case 'terminated':
        return 'bg-red-50 border-red-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-yellow-50 border-yellow-200';
    }
  };

  if (!verification && !loading && !error) {
    return (
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No insurance verification on record</p>
          <button
            onClick={verifyEligibility}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Verify Insurance Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow border-2 ${verification ? getStatusColor(verification.verificationStatus) : 'border-gray-200'}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            {verification && getStatusIcon(verification.verificationStatus)}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Insurance Verification</h2>
              {verification && (
                <>
                  <p className="text-lg font-medium text-gray-700 mt-1">{verification.payerName}</p>
                  {verification.memberID && (
                    <p className="text-sm text-gray-600">Member ID: {verification.memberID}</p>
                  )}
                  {verification.groupNumber && (
                    <p className="text-sm text-gray-600">Group: {verification.groupNumber}</p>
                  )}
                </>
              )}
            </div>
          </div>
          <button
            onClick={verifyEligibility}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Verifying...' : 'Verify Again'}</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Verification Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Verification Results */}
      {verification && (
        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">Status</h3>
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                verification.verificationStatus === 'active'
                  ? 'bg-green-100 text-green-800'
                  : verification.verificationStatus === 'inactive' || verification.verificationStatus === 'terminated'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {verification.verificationStatus.toUpperCase()}
              </span>
              {verification.effectiveDate && verification.terminationDate && (
                <span className="text-sm text-gray-600">
                  Effective: {new Date(verification.effectiveDate).toLocaleDateString()} - {new Date(verification.terminationDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Benefits */}
          {verification.verificationStatus === 'active' && (
            <>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase mb-3">Benefits</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Copays */}
                  {verification.benefits.copays && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-xs font-medium text-gray-600 mb-2">Specialist Copay</h4>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(verification.benefits.copays.specialist)}
                      </p>
                    </div>
                  )}

                  {/* Deductible */}
                  {verification.benefits.deductible?.individual && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-xs font-medium text-gray-600 mb-2">Deductible</h4>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(verification.benefits.deductible.individual.total)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatCurrency(verification.benefits.deductible.individual.remaining)} remaining
                      </p>
                    </div>
                  )}

                  {/* Coinsurance */}
                  {verification.benefits.coinsurance && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-xs font-medium text-gray-600 mb-2">Coinsurance</h4>
                      <p className="text-2xl font-bold text-gray-900">
                        {verification.benefits.coinsurance.percentage}%
                      </p>
                    </div>
                  )}

                  {/* Out-of-Pocket Max */}
                  {verification.benefits.outOfPocketMax?.individual && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-xs font-medium text-gray-600 mb-2">Out-of-Pocket Max</h4>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(verification.benefits.outOfPocketMax.individual.total)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatCurrency(verification.benefits.outOfPocketMax.individual.remaining)} remaining
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Prior Auth Requirements */}
              {verification.benefits.priorAuth?.required && verification.benefits.priorAuth.services && verification.benefits.priorAuth.services.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-yellow-900 mb-2">Prior Auth Required:</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {verification.benefits.priorAuth.services.map((service, index) => (
                          <li key={index} className="text-sm text-yellow-800">{service}</li>
                        ))}
                      </ul>
                      {verification.benefits.priorAuth.phone && (
                        <p className="text-sm text-yellow-700 mt-2">
                          Phone: {verification.benefits.priorAuth.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Issues */}
          {verification.hasIssues && verification.issueNotes && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-900 mb-1">Coverage Issues</h4>
                  <p className="text-sm text-red-800 whitespace-pre-line">{verification.issueNotes}</p>
                </div>
              </div>
            </div>
          )}

          {/* Last Verified */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>Last Verified: {lastVerifiedTime}</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => window.open(`/patients/${patientId}/insurance-history`, '_blank')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View History
              </button>
              <button
                onClick={() => window.open(`/patients/${patientId}/insurance`, '_blank')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Edit Insurance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
