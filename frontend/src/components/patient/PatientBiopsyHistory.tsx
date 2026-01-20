import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientBiopsies } from '../../api';
import { Skeleton } from '../ui';
import { Microscope, MapPin, CheckCircle, Clock, AlertTriangle, AlertCircle } from 'lucide-react';

interface PatientBiopsyHistoryProps {
  patientId: string;
}

export function PatientBiopsyHistory({ patientId }: PatientBiopsyHistoryProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-biopsies', patientId],
    queryFn: () => fetchPatientBiopsies(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const biopsies = data?.biopsies || [];

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
      case 'resulted':
      case 'reviewed':
      case 'closed':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'processing':
      case 'sent':
      case 'received_by_lab':
        return <Clock size={16} style={{ color: '#3b82f6' }} />;
      case 'ordered':
      case 'collected':
        return <Clock size={16} style={{ color: '#f59e0b' }} />;
      default:
        return <Microscope size={16} style={{ color: '#6b7280' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resulted':
      case 'reviewed':
      case 'closed':
        return '#10b981';
      case 'processing':
      case 'sent':
      case 'received_by_lab':
        return '#3b82f6';
      case 'ordered':
      case 'collected':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getSeverityColor = (malignancyType: string | null) => {
    if (!malignancyType) return null;
    const lower = malignancyType.toLowerCase();
    if (lower.includes('melanoma')) return '#dc2626';
    if (lower.includes('carcinoma') || lower.includes('cancer')) return '#ea580c';
    if (lower.includes('dysplastic') || lower.includes('atypical')) return '#f59e0b';
    return '#6b7280';
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Skeleton variant="card" height={120} />
        <Skeleton variant="card" height={120} />
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
        Failed to load biopsy history
      </div>
    );
  }

  if (biopsies.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <Microscope size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Biopsies</h3>
        <p style={{ color: '#6b7280', margin: 0 }}>
          This patient has no biopsy records.
        </p>
      </div>
    );
  }

  const pendingBiopsies = biopsies.filter((b: any) =>
    b.status !== 'resulted' && b.status !== 'reviewed' && b.status !== 'closed'
  );
  const completedBiopsies = biopsies.filter((b: any) =>
    b.status === 'resulted' || b.status === 'reviewed' || b.status === 'closed'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Pending Biopsies */}
      {pendingBiopsies.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Pending Results
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingBiopsies.map((biopsy: any) => (
              <div
                key={biopsy.id}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/biopsy-log?biopsyId=${biopsy.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dbeafe';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#eff6ff';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <MapPin size={16} style={{ color: '#3b82f6' }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        {biopsy.bodyLocation}
                      </h4>
                    </div>

                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {biopsy.specimenType} biopsy
                      {biopsy.specimenNumber && ` • Specimen #${biopsy.specimenNumber}`}
                    </div>

                    {biopsy.clinicalDescription && (
                      <p style={{ margin: '0 0 0.5rem', color: '#374151', fontSize: '0.875rem' }}>
                        {biopsy.clinicalDescription}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>Ordered:</span> {formatDate(biopsy.orderedAt)}
                      </div>
                      {biopsy.pathLab && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Lab:</span> {biopsy.pathLab}
                        </div>
                      )}
                      {biopsy.pathLabCaseNumber && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Case #:</span> {biopsy.pathLabCaseNumber}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{
                    padding: '0.375rem 0.75rem',
                    background: getStatusColor(biopsy.status) + '20',
                    color: getStatusColor(biopsy.status),
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    textTransform: 'capitalize'
                  }}>
                    {getStatusIcon(biopsy.status)}
                    {biopsy.status.replace('_', ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Biopsies */}
      {completedBiopsies.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Pathology Results
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {completedBiopsies.map((biopsy: any) => {
              const severityColor = getSeverityColor(biopsy.malignancyType);
              const needsAction = biopsy.followUpAction && biopsy.followUpAction !== 'none';

              return (
                <div
                  key={biopsy.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ...(severityColor ? { borderLeftWidth: '4px', borderLeftColor: severityColor } : {})
                  }}
                  onClick={() => navigate(`/biopsy-log?biopsyId=${biopsy.id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <MapPin size={16} style={{ color: '#6b7280' }} />
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                          {biopsy.bodyLocation}
                        </h4>
                        {biopsy.specimenNumber && (
                          <span style={{
                            background: '#f3f4f6',
                            color: '#6b7280',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace'
                          }}>
                            #{biopsy.specimenNumber}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        {formatDate(biopsy.resultedAt || biopsy.orderedAt)}
                      </div>
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
                      {biopsy.status === 'reviewed' ? 'Reviewed' : 'Resulted'}
                    </div>
                  </div>

                  {biopsy.pathologyDiagnosis && (
                    <div style={{
                      background: severityColor ? `${severityColor}10` : '#f9fafb',
                      border: `1px solid ${severityColor ? `${severityColor}40` : '#e5e7eb'}`,
                      borderRadius: '6px',
                      padding: '0.75rem',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: severityColor || '#6b7280',
                        marginBottom: '0.25rem',
                        fontWeight: 500
                      }}>
                        Diagnosis
                      </div>
                      <div style={{
                        color: severityColor || '#111827',
                        fontSize: '0.875rem',
                        fontWeight: severityColor ? 600 : 400
                      }}>
                        {biopsy.pathologyDiagnosis}
                      </div>
                    </div>
                  )}

                  {biopsy.margins && (
                    <div style={{
                      display: 'inline-block',
                      background: biopsy.margins === 'clear' ? '#d1fae5' : '#fef3c7',
                      color: biopsy.margins === 'clear' ? '#065f46' : '#92400e',
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      marginRight: '0.5rem',
                      marginBottom: '0.5rem'
                    }}>
                      Margins: {biopsy.margins}
                    </div>
                  )}

                  {needsAction && (
                    <div style={{
                      marginTop: '0.75rem',
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={16} style={{ color: '#92400e', flexShrink: 0, marginTop: '0.125rem' }} />
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>
                          Follow-up Required: {biopsy.followUpAction.replace('_', ' ')}
                        </div>
                        {biopsy.followUpNotes && (
                          <div style={{ fontSize: '0.75rem', color: '#78350f' }}>
                            {biopsy.followUpNotes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
