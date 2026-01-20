import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientBodyMap } from '../../api';
import { Skeleton } from '../ui';
import { MapPin, Maximize2 } from 'lucide-react';

interface PatientBodyMapPreviewProps {
  patientId: string;
}

export function PatientBodyMapPreview({ patientId }: PatientBodyMapPreviewProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-body-map', patientId],
    queryFn: () => fetchPatientBodyMap(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const lesions = data?.lesions || [];

  const getLesionTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'primary':
        return '#ef4444';
      case 'secondary':
        return '#f59e0b';
      case 'monitor':
        return '#3b82f6';
      case 'resolved':
        return '#6b7280';
      default:
        return '#8b5cf6';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return '#ef4444';
      case 'monitoring':
        return '#f59e0b';
      case 'resolved':
        return '#10b981';
      case 'treated':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Skeleton variant="card" height={400} style={{ flex: 1 }} />
        <Skeleton variant="card" height={400} style={{ flex: 1 }} />
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
        Failed to load body map
      </div>
    );
  }

  if (lesions.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <MapPin size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Lesions Mapped</h3>
        <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
          No lesions have been documented on the body map for this patient.
        </p>
        <button
          className="ema-action-btn"
          onClick={() => navigate(`/body-diagram?patientId=${patientId}`)}
        >
          Add Lesion
        </button>
      </div>
    );
  }

  // Group lesions by region
  const regionGroups: { [key: string]: any[] } = {};
  lesions.forEach((lesion: any) => {
    const region = lesion.bodyRegion || lesion.bodyLocation || 'Other';
    if (!regionGroups[region]) regionGroups[region] = [];
    regionGroups[region].push(lesion);
  });

  const activeLesions = lesions.filter((l: any) =>
    l.status === 'active' || l.status === 'monitoring'
  );
  const resolvedLesions = lesions.filter((l: any) =>
    l.status === 'resolved' || l.status === 'treated'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        borderRadius: '12px',
        padding: '1.5rem',
        color: '#ffffff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
              Total Lesions Tracked
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}>
              {lesions.length}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
              Active / Monitoring
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {activeLesions.length}
            </div>
          </div>

          <button
            onClick={() => navigate(`/body-diagram?patientId=${patientId}`)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1.5rem',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <Maximize2 size={16} />
            View Full Map
          </button>
        </div>
      </div>

      {/* Active Lesions */}
      {activeLesions.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Active Lesions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeLesions.map((lesion: any) => (
              <div
                key={lesion.id}
                style={{
                  background: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeftColor: getStatusColor(lesion.status),
                  borderLeftWidth: '4px'
                }}
                onClick={() => navigate(`/body-diagram?patientId=${patientId}&lesionId=${lesion.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = getStatusColor(lesion.status);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.borderLeftColor = getStatusColor(lesion.status);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <MapPin size={18} style={{ color: getLesionTypeColor(lesion.lesionType) }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        {lesion.bodyLocation}
                      </h4>
                      {lesion.lesionType && (
                        <span style={{
                          background: getLesionTypeColor(lesion.lesionType) + '20',
                          color: getLesionTypeColor(lesion.lesionType),
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}>
                          {lesion.lesionType}
                        </span>
                      )}
                    </div>

                    {lesion.description && (
                      <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                        {lesion.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                      {lesion.sizeMm && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Size:</span> {lesion.sizeMm}mm
                        </div>
                      )}
                      {lesion.color && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Color:</span> {lesion.color}
                        </div>
                      )}
                      {lesion.firstNoted && (
                        <div>
                          <span style={{ fontWeight: 500 }}>First Noted:</span> {formatDate(lesion.firstNoted)}
                        </div>
                      )}
                    </div>

                    {lesion.diagnosis && (
                      <div style={{
                        marginTop: '0.75rem',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.875rem',
                        color: '#166534',
                        fontWeight: 500
                      }}>
                        Diagnosis: {lesion.diagnosis}
                      </div>
                    )}
                  </div>

                  <div style={{
                    padding: '0.375rem 0.75rem',
                    background: getStatusColor(lesion.status) + '20',
                    color: getStatusColor(lesion.status),
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {lesion.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lesion Summary by Region */}
      <div>
        <h3 style={{
          margin: '0 0 1rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827'
        }}>
          Lesions by Region
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {Object.entries(regionGroups).map(([region, regionLesions]) => {
            const activeCount = regionLesions.filter((l: any) =>
              l.status === 'active' || l.status === 'monitoring'
            ).length;

            return (
              <div
                key={region}
                style={{
                  background: activeCount > 0 ? '#fff7ed' : '#f9fafb',
                  border: `1px solid ${activeCount > 0 ? '#fed7aa' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => navigate(`/body-diagram?patientId=${patientId}&region=${region}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  fontWeight: 600,
                  color: '#111827',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem'
                }}>
                  {region}
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>Total: </span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>
                      {regionLesions.length}
                    </span>
                  </div>
                  {activeCount > 0 && (
                    <div>
                      <span style={{ color: '#ea580c' }}>Active: </span>
                      <span style={{ fontWeight: 600, color: '#c2410c' }}>
                        {activeCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recently Updated */}
      {lesions.some((l: any) => l.lastExamined) && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Recently Examined
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {lesions
              .filter((l: any) => l.lastExamined)
              .sort((a: any, b: any) => new Date(b.lastExamined).getTime() - new Date(a.lastExamined).getTime())
              .slice(0, 5)
              .map((lesion: any) => (
                <div
                  key={lesion.id}
                  style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => navigate(`/body-diagram?patientId=${patientId}&lesionId=${lesion.id}`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: '#374151', fontSize: '0.875rem' }}>
                      {lesion.bodyLocation}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                      Last examined: {formatDate(lesion.lastExamined)}
                    </div>
                  </div>
                  <div style={{
                    padding: '0.25rem 0.5rem',
                    background: getStatusColor(lesion.status) + '20',
                    color: getStatusColor(lesion.status),
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}>
                    {lesion.status}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
