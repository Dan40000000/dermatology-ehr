import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientPriorAuths } from '../../api';
import { Skeleton } from '../ui';
import { FileCheck, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface PatientPriorAuthsListProps {
  patientId: string;
}

export function PatientPriorAuthsList({ patientId }: PatientPriorAuthsListProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-prior-auths', patientId],
    queryFn: () => fetchPatientPriorAuths(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const priorAuths = data?.priorAuths || [];

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
      case 'approved':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'pending':
        return <Clock size={16} style={{ color: '#f59e0b' }} />;
      case 'denied':
        return <XCircle size={16} style={{ color: '#ef4444' }} />;
      default:
        return <FileCheck size={16} style={{ color: '#6b7280' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'denied': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
        Failed to load prior authorizations
      </div>
    );
  }

  if (priorAuths.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <FileCheck size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Prior Authorizations</h3>
        <p style={{ color: '#6b7280', margin: 0 }}>
          This patient has no prior authorization requests on record.
        </p>
      </div>
    );
  }

  const activePAs = priorAuths.filter((pa: any) =>
    pa.status === 'approved' && (!pa.expiresAt || new Date(pa.expiresAt) > new Date())
  );
  const pendingPAs = priorAuths.filter((pa: any) => pa.status === 'pending');
  const deniedPAs = priorAuths.filter((pa: any) => pa.status === 'denied');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Active Prior Auths */}
      {activePAs.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Active Authorizations
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activePAs.map((pa: any) => (
              <div
                key={pa.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid #d1fae5',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/prior-auth?paId=${pa.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#86efac';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#d1fae5';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <FileCheck size={18} style={{ color: '#10b981' }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        {pa.medicationName || pa.prescriptionMedication}
                      </h4>
                    </div>

                    {pa.insuranceCompany && (
                      <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                        {pa.insuranceCompany}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {pa.approvalNumber && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Auth #:</span> {pa.approvalNumber}
                        </div>
                      )}
                      {pa.decisionDate && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Approved:</span> {formatDate(pa.decisionDate)}
                        </div>
                      )}
                      {pa.expiresAt && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Expires:</span> {formatDate(pa.expiresAt)}
                        </div>
                      )}
                    </div>

                    {pa.expiresAt && new Date(pa.expiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
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
                        <AlertCircle size={14} />
                        Expires soon - renewal may be needed
                      </div>
                    )}
                  </div>

                  <div style={{
                    padding: '0.375rem 0.75rem',
                    background: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <CheckCircle size={14} />
                    Approved
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Prior Auths */}
      {pendingPAs.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Pending Authorizations
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingPAs.map((pa: any) => (
              <div
                key={pa.id}
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/prior-auth?paId=${pa.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fef3c7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fffbeb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
                      {pa.medicationName || pa.prescriptionMedication}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#78350f' }}>
                      Submitted {formatDate(pa.submittedDate)}
                      {pa.insuranceCompany && ` to ${pa.insuranceCompany}`}
                    </div>
                  </div>
                  <div style={{
                    padding: '0.375rem 0.75rem',
                    background: '#fde68a',
                    color: '#78350f',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <Clock size={14} />
                    Pending
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Denied Prior Auths */}
      {deniedPAs.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Denied Authorizations
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {deniedPAs.slice(0, 5).map((pa: any) => (
              <div
                key={pa.id}
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/prior-auth?paId=${pa.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fee2e2';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fef2f2';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: '#111827', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                      {pa.medicationName || pa.prescriptionMedication}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#7f1d1d', marginBottom: '0.25rem' }}>
                      {formatDate(pa.decisionDate)}
                    </div>
                    {pa.denialReason && (
                      <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.5rem' }}>
                        Reason: {pa.denialReason}
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: '0.25rem 0.5rem',
                    background: '#fecaca',
                    color: '#7f1d1d',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <XCircle size={12} />
                    Denied
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
