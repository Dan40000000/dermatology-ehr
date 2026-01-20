import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientPrescriptions } from '../../api';
import { Skeleton } from '../ui';
import { Pill, Clock, CheckCircle, XCircle, AlertTriangle, Calendar } from 'lucide-react';

interface PatientPrescriptionsListProps {
  patientId: string;
}

export function PatientPrescriptionsList({ patientId }: PatientPrescriptionsListProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-prescriptions', patientId],
    queryFn: () => fetchPatientPrescriptions(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const prescriptions = data?.prescriptions || [];
  const summary = data?.summary;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'pending':
        return <Clock size={16} style={{ color: '#f59e0b' }} />;
      case 'cancelled':
      case 'discontinued':
        return <XCircle size={16} style={{ color: '#ef4444' }} />;
      default:
        return <Pill size={16} style={{ color: '#6b7280' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'cancelled': return '#ef4444';
      case 'discontinued': return '#dc2626';
      default: return '#6b7280';
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={100} />
      </div>
    );
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
        Failed to load prescriptions
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <Pill size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Prescriptions</h3>
        <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
          This patient has no prescriptions on record.
        </p>
        <button
          className="ema-action-btn"
          onClick={() => navigate('/prescriptions')}
        >
          New Prescription
        </button>
      </div>
    );
  }

  const activePrescriptions = prescriptions.filter((rx: any) =>
    rx.status === 'active' || rx.status === 'pending'
  );
  const inactivePrescriptions = prescriptions.filter((rx: any) =>
    rx.status === 'cancelled' || rx.status === 'discontinued' || rx.refillsRemaining === 0
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#15803d', marginBottom: '0.25rem' }}>
              Active
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#166534' }}>
              {summary.active}
            </div>
          </div>

          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Total
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#374151' }}>
              {summary.total}
            </div>
          </div>

          <div style={{
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.25rem' }}>
              Controlled
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#78350f' }}>
              {summary.controlled}
            </div>
          </div>

          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#991b1b', marginBottom: '0.25rem' }}>
              Inactive
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7f1d1d' }}>
              {summary.inactive}
            </div>
          </div>
        </div>
      )}

      {/* Active Prescriptions */}
      {activePrescriptions.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Active Medications
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activePrescriptions.map((rx: any) => (
              <div
                key={rx.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeftColor: getStatusColor(rx.status),
                  borderLeftWidth: '4px'
                }}
                onClick={() => navigate(`/prescriptions?prescriptionId=${rx.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = getStatusColor(rx.status);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.borderLeftColor = getStatusColor(rx.status);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <Pill size={18} style={{ color: '#6b7280' }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        {rx.medicationName}
                      </h4>
                      {rx.isControlled && (
                        <span style={{
                          background: '#fef3c7',
                          color: '#92400e',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          border: '1px solid #fde68a'
                        }}>
                          C-{rx.deaSchedule}
                        </span>
                      )}
                    </div>

                    {rx.sig && (
                      <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                        {rx.sig}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {rx.quantity && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Qty:</span> {rx.quantity} {rx.quantityUnit}
                        </div>
                      )}
                      {rx.refills != null && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Refills:</span> {rx.refillsRemaining || 0} of {rx.refills}
                        </div>
                      )}
                      {rx.daysSupply && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Days Supply:</span> {rx.daysSupply}
                        </div>
                      )}
                    </div>

                    {rx.refillsRemaining === 0 && (
                      <div style={{
                        marginTop: '0.5rem',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '4px',
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: '#92400e'
                      }}>
                        <AlertTriangle size={14} />
                        No refills remaining
                      </div>
                    )}

                    <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={12} />
                        Written: {formatDate(rx.writtenDate)}
                        {rx.providerName && ` by ${rx.providerName}`}
                      </div>
                      {rx.pharmacyName && (
                        <div style={{ marginTop: '0.25rem' }}>
                          Pharmacy: {rx.pharmacyFullName || rx.pharmacyName}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0.75rem',
                    background: getStatusColor(rx.status) + '20',
                    color: getStatusColor(rx.status),
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {getStatusIcon(rx.status)}
                    {rx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inactive Prescriptions */}
      {inactivePrescriptions.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Medication History
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {inactivePrescriptions.slice(0, 5).map((rx: any) => (
              <div
                key={rx.id}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/prescriptions?prescriptionId=${rx.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#374151', fontSize: '0.875rem' }}>
                      {rx.medicationName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {formatDate(rx.writtenDate)} {rx.providerName && `• ${rx.providerName}`}
                    </div>
                  </div>
                  <div style={{
                    padding: '0.25rem 0.5rem',
                    background: getStatusColor(rx.status) + '20',
                    color: getStatusColor(rx.status),
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {rx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
