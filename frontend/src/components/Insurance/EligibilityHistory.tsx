/**
 * EligibilityHistory Component
 *
 * Displays history of insurance verification checks for a patient
 * Shows changes over time and alerts on plan changes
 */

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../../api';

interface EligibilityHistoryProps {
  patientId: string;
}

interface HistoryItem {
  id: string;
  payerName: string;
  memberId: string;
  verificationStatus: string;
  verifiedAt: string;
  copaySpecialistCents: number | null;
  deductibleTotalCents: number | null;
  deductibleRemainingCents: number | null;
  oopMaxCents: number | null;
  oopRemainingCents: number | null;
  hasIssues: boolean;
  issueNotes: string | null;
  priorAuthRequired: string[] | null;
}

export const EligibilityHistory: React.FC<EligibilityHistoryProps> = ({ patientId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [patientId]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/eligibility/history/${patientId}`);
      if (response.data.success) {
        setHistory(response.data.history);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load verification history');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number | null): string => {
    if (cents === null || cents === undefined) return 'N/A';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'inactive':
      case 'terminated':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
      case 'terminated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const detectChange = (currentItem: HistoryItem, previousItem?: HistoryItem) => {
    if (!previousItem) return null;

    const changes: string[] = [];

    // Check for payer change
    if (currentItem.payerName !== previousItem.payerName) {
      changes.push(`Plan changed from ${previousItem.payerName} to ${currentItem.payerName}`);
    }

    // Check for status change
    if (currentItem.verificationStatus !== previousItem.verificationStatus) {
      changes.push(`Status changed from ${previousItem.verificationStatus} to ${currentItem.verificationStatus}`);
    }

    // Check for significant deductible changes (more than $100)
    if (
      currentItem.deductibleTotalCents &&
      previousItem.deductibleTotalCents &&
      Math.abs(currentItem.deductibleTotalCents - previousItem.deductibleTotalCents) > 10000
    ) {
      changes.push(
        `Deductible changed from ${formatCurrency(previousItem.deductibleTotalCents)} to ${formatCurrency(currentItem.deductibleTotalCents)}`
      );
    }

    // Check for copay changes
    if (
      currentItem.copaySpecialistCents &&
      previousItem.copaySpecialistCents &&
      currentItem.copaySpecialistCents !== previousItem.copaySpecialistCents
    ) {
      changes.push(
        `Specialist copay changed from ${formatCurrency(previousItem.copaySpecialistCents)} to ${formatCurrency(currentItem.copaySpecialistCents)}`
      );
    }

    return changes.length > 0 ? changes : null;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading verification history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow border border-red-200 p-6">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-medium">Error Loading History</h3>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
        <div className="text-center">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No verification history available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Verification History</h2>
          </div>
          <span className="text-sm text-gray-600">{history.length} verifications</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6">
        <div className="space-y-6">
          {history.map((item, index) => {
            const changes = detectChange(item, history[index + 1]);
            const hasPlanChange = changes && changes.some(c => c.includes('Plan changed'));

            return (
              <div key={item.id} className="relative">
                {/* Timeline Line */}
                {index < history.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200" />
                )}

                {/* Timeline Item */}
                <div className="flex space-x-4">
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white border-2 border-gray-300">
                      {getStatusIcon(item.verificationStatus)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className={`rounded-lg p-4 ${
                      hasPlanChange ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-gray-50 border border-gray-200'
                    }`}>
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{item.payerName}</h3>
                          <p className="text-sm text-gray-600">{formatDate(item.verifiedAt)}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(item.verificationStatus)}`}>
                          {item.verificationStatus.toUpperCase()}
                        </span>
                      </div>

                      {/* Changes Alert */}
                      {changes && (
                        <div className={`mb-3 p-3 rounded-lg ${
                          hasPlanChange ? 'bg-yellow-100 border border-yellow-300' : 'bg-blue-50 border border-blue-200'
                        }`}>
                          <div className="flex items-start space-x-2">
                            {hasPlanChange ? (
                              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                            ) : (
                              <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <p className={`text-xs font-medium ${
                                hasPlanChange ? 'text-yellow-800' : 'text-blue-800'
                              }`}>
                                Changes Detected
                              </p>
                              <ul className="mt-1 space-y-1">
                                {changes.map((change, i) => (
                                  <li key={i} className={`text-xs ${
                                    hasPlanChange ? 'text-yellow-700' : 'text-blue-700'
                                  }`}>
                                    {change}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Benefits Summary */}
                      {item.verificationStatus === 'active' && (
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          <div className="bg-white p-2 rounded">
                            <p className="text-xs text-gray-600">Copay</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(item.copaySpecialistCents)}
                            </p>
                          </div>
                          <div className="bg-white p-2 rounded">
                            <p className="text-xs text-gray-600">Deductible</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(item.deductibleTotalCents)}
                            </p>
                          </div>
                          <div className="bg-white p-2 rounded">
                            <p className="text-xs text-gray-600">Remaining</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(item.deductibleRemainingCents)}
                            </p>
                          </div>
                          <div className="bg-white p-2 rounded">
                            <p className="text-xs text-gray-600">OOP Max</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(item.oopMaxCents)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Issues */}
                      {item.hasIssues && item.issueNotes && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <p className="text-xs font-medium text-red-800 mb-1">Issues</p>
                          <p className="text-xs text-red-700 whitespace-pre-line">{item.issueNotes}</p>
                        </div>
                      )}

                      {/* Prior Auth */}
                      {item.priorAuthRequired && item.priorAuthRequired.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 mb-1">Prior Auth Required:</p>
                          <div className="flex flex-wrap gap-1">
                            {item.priorAuthRequired.map((service, i) => (
                              <span
                                key={i}
                                className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
                              >
                                {service}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
