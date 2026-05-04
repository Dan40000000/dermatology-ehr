import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { checkPriorAuthWorkflowStatus } from '../../api';

interface PAStatusTrackerProps {
  priorAuthId: string;
  authNumber?: string;
  currentStatus?: string;
}

const statusColor = (status?: string) => {
  if (status === 'approved') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'denied') return { bg: '#fee2e2', fg: '#991b1b' };
  if (status === 'needs_info' || status === 'more_info_needed') return { bg: '#ffedd5', fg: '#9a3412' };
  if (status === 'submitted') return { bg: '#dbeafe', fg: '#1d4ed8' };
  return { bg: '#f1f5f9', fg: '#475569' };
};

export function PAStatusTracker({ priorAuthId, authNumber, currentStatus }: PAStatusTrackerProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any | null>(null);

  const loadStatus = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await checkPriorAuthWorkflowStatus(session.tenantId, session.accessToken, priorAuthId);
      setStatus(response.workflow || response);
    } catch (err: any) {
      showError(err.message || 'Failed to check PA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (priorAuthId && ['submitted', 'pending', 'more_info_needed'].includes(currentStatus || '')) {
      loadStatus();
    }
  }, [priorAuthId]);

  const displayStatus = status?.status || currentStatus || 'pending';
  const color = statusColor(displayStatus);

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '1rem',
      background: '#ffffff',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Prior Auth Status Tracker
          </div>
          <h4 style={{ margin: '0.3rem 0 0', color: '#0f172a' }}>
            {authNumber || priorAuthId}
          </h4>
          {status?.externalReferenceId && (
            <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.8rem' }}>
              Vendor ref: {status.externalReferenceId}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{
            background: color.bg,
            color: color.fg,
            borderRadius: '999px',
            padding: '0.3rem 0.7rem',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            {String(displayStatus).replace(/_/g, ' ')}
          </span>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            style={{
              padding: '0.45rem 0.7rem',
              background: loading ? '#94a3b8' : '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Checking...' : 'Check payer'}
          </button>
        </div>
      </div>

      {status && (
        <>
          <div style={{ marginTop: '0.9rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: '#f8fafc', padding: '0.7rem', borderRadius: '8px' }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 700 }}>Payer Status</div>
              <div style={{ color: '#0f172a', fontWeight: 700, marginTop: '0.25rem' }}>{status.payerStatus}</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '0.7rem', borderRadius: '8px' }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 700 }}>Provider</div>
              <div style={{ color: '#0f172a', fontWeight: 700, marginTop: '0.25rem' }}>{status.provider} ({status.mode})</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '0.7rem', borderRadius: '8px' }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 700 }}>Decision ETA</div>
              <div style={{ color: '#0f172a', fontWeight: 700, marginTop: '0.25rem' }}>
                {status.estimatedDecisionDate ? new Date(status.estimatedDecisionDate).toLocaleDateString() : 'No ETA'}
              </div>
            </div>
          </div>

          {status.requiredNextSteps?.length > 0 && (
            <div style={{ marginTop: '0.9rem', color: '#334155', fontSize: '0.85rem' }}>
              <strong>Next steps:</strong> {status.requiredNextSteps.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
