import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientEncounters } from '../../api';
import { Skeleton } from '../ui';
import { FileText, Calendar, User, CheckCircle, Clock } from 'lucide-react';

interface PatientEncountersListProps {
  patientId: string;
}

export function PatientEncountersList({ patientId }: PatientEncountersListProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-encounters', patientId],
    queryFn: () => fetchPatientEncounters(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const encounters = data?.encounters || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'signed':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'in-progress':
        return <Clock size={16} style={{ color: '#f59e0b' }} />;
      default:
        return <FileText size={16} style={{ color: '#6b7280' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'signed': return '#10b981';
      case 'in-progress': return '#f59e0b';
      case 'draft': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Skeleton variant="card" height={120} />
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
        Failed to load encounters
      </div>
    );
  }

  if (encounters.length === 0) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '3rem',
        textAlign: 'center'
      }}>
        <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Encounters</h3>
        <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
          This patient has no clinical encounters on record.
        </p>
        <button
          className="ema-action-btn"
          onClick={() => navigate(`/patients/${patientId}/encounter/new`)}
        >
          Start Encounter
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {encounters.map((encounter: any) => (
        <div
          key={encounter.id}
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onClick={() => navigate(`/patients/${patientId}/encounter/${encounter.id}`)}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Calendar size={18} style={{ color: '#6b7280' }} />
              <span style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>
                {formatDate(encounter.encounterDate)}
              </span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.75rem',
              background: getStatusColor(encounter.status) + '20',
              color: getStatusColor(encounter.status),
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'capitalize'
            }}>
              {getStatusIcon(encounter.status)}
              {encounter.status}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <User size={16} style={{ color: '#6b7280' }} />
            <span style={{ color: '#374151', fontSize: '0.875rem' }}>
              {encounter.providerName || 'Unknown Provider'}
            </span>
          </div>

          {encounter.chiefComplaint && (
            <div style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '0.75rem',
              marginTop: '0.75rem'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 500 }}>
                Chief Complaint
              </div>
              <div style={{ color: '#374151', fontSize: '0.875rem' }}>
                {encounter.chiefComplaint}
              </div>
            </div>
          )}

          {encounter.assessmentPlan && (
            <div style={{
              background: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '0.75rem',
              marginTop: '0.5rem'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#1e40af', marginBottom: '0.25rem', fontWeight: 500 }}>
                Assessment & Plan
              </div>
              <div style={{ color: '#1e3a8a', fontSize: '0.875rem', lineHeight: '1.5' }}>
                {encounter.assessmentPlan.length > 150
                  ? encounter.assessmentPlan.substring(0, 150) + '...'
                  : encounter.assessmentPlan}
              </div>
            </div>
          )}

          {encounter.signedAt && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
              Signed {new Date(encounter.signedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
