import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientInsurance } from '../../api';
import { Skeleton } from '../ui';
import { Shield, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface PatientInsuranceCardProps {
  patientId: string;
}

export function PatientInsuranceCard({ patientId }: PatientInsuranceCardProps) {
  const { session } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['patient-insurance', patientId],
    queryFn: () => fetchPatientInsurance(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const insurance = data?.insurance;
  const eligibility = data?.eligibility;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (isLoading) {
    return <Skeleton variant="card" height={250} />;
  }

  if (error) {
    return (
      <div style={{
        background: '#fee2e2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '1rem',
        color: '#991b1b'
      }}>
        Failed to load insurance information
      </div>
    );
  }

  if (!insurance?.insurance && !insurance?.insuranceId) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <Shield size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Insurance on File</h3>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Add insurance information to verify coverage.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        padding: '1.5rem',
        color: '#ffffff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Shield size={24} />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                Insurance Information
              </h3>
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 500, opacity: 0.9 }}>
              {insurance.insurance || 'Insurance Company'}
            </div>
          </div>

          {eligibility && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600
            }}>
              {eligibility.coverageActive ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={16} />
                  Active Coverage
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <XCircle size={16} />
                  Inactive
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Insurance Details */}
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {insurance.insuranceId && (
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
                Member ID
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#111827', fontWeight: 600 }}>
                {insurance.insuranceId}
              </div>
            </div>
          )}

          {insurance.insuranceGroupNumber && (
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
                Group Number
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '1rem', color: '#111827', fontWeight: 600 }}>
                {insurance.insuranceGroupNumber}
              </div>
            </div>
          )}
        </div>

        {/* Eligibility Information */}
        {eligibility ? (
          <>
            <div style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '1.5rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                  Coverage Details
                </h4>
                <button
                  onClick={() => refetch()}
                  style={{
                    background: 'transparent',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  <RefreshCw size={12} />
                  Verify
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {eligibility.copay != null && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    padding: '0.75rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#15803d', marginBottom: '0.25rem' }}>
                      Copay
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#166534' }}>
                      {formatCurrency(eligibility.copay)}
                    </div>
                  </div>
                )}

                {eligibility.deductible != null && (
                  <div style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    padding: '0.75rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#1e40af', marginBottom: '0.25rem' }}>
                      Deductible
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e3a8a' }}>
                      {formatCurrency(eligibility.deductible)}
                    </div>
                  </div>
                )}

                {eligibility.deductibleRemaining != null && (
                  <div style={{
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    padding: '0.75rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.25rem' }}>
                      Deductible Remaining
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#78350f' }}>
                      {formatCurrency(eligibility.deductibleRemaining)}
                    </div>
                  </div>
                )}

                {eligibility.outOfPocketMax != null && (
                  <div style={{
                    background: '#fce7f3',
                    border: '1px solid #fbcfe8',
                    borderRadius: '6px',
                    padding: '0.75rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#9f1239', marginBottom: '0.25rem' }}>
                      Out-of-Pocket Max
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#881337' }}>
                      {formatCurrency(eligibility.outOfPocketMax)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{
              background: '#f9fafb',
              borderRadius: '6px',
              padding: '0.75rem',
              fontSize: '0.75rem',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={14} />
              Last verified: {formatDate(eligibility.checkedAt)}
            </div>
          </>
        ) : (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertCircle size={16} style={{ color: '#92400e' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>
                Eligibility Not Verified
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#78350f' }}>
              Run an eligibility check to verify coverage and benefits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
