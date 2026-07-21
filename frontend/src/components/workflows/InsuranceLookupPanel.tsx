import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { checkEligibilityWorkflow } from '../../api';

interface InsuranceLookupPanelProps {
  patientId: string;
  payerId?: string;
  payerName?: string;
  memberId?: string;
  onChecked?: () => void;
}

const formatCurrency = (value?: number) => {
  if (value === undefined || value === null) return '-';
  return `$${Number(value).toFixed(2)}`;
};

const formatLookupMode = (result: any) => {
  if (result?.environment === 'sandbox') return 'Stedi sandbox';
  if (result?.environment === 'production') return 'Production vendor';
  if (result?.mode === 'live') return 'Live vendor';
  return 'Internal demo';
};

export function InsuranceLookupPanel({
  patientId,
  payerId,
  payerName,
  memberId,
  onChecked,
}: InsuranceLookupPanelProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [form, setForm] = useState({
    payerId: payerId || '',
    payerName: payerName || '',
    memberId: memberId || '',
    serviceDate: new Date().toISOString().slice(0, 10),
    serviceType: '30',
  });
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleCheck = async () => {
    if (!session) return;

    setChecking(true);
    try {
      const response = await checkEligibilityWorkflow(session.tenantId, session.accessToken, {
        patientId,
        payerId: form.payerId.trim() || undefined,
        payerName: form.payerName.trim() || undefined,
        memberId: form.memberId.trim() || undefined,
        serviceDate: form.serviceDate,
        serviceType: form.serviceType,
        bypassCache: true,
      });
      setResult(response.result);
      showSuccess('Eligibility check completed');
      onChecked?.();
    } catch (err: any) {
      showError(err.message || 'Failed to check eligibility');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #dbeafe',
      borderRadius: '10px',
      padding: '1rem',
      marginTop: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h4 style={{ margin: '0 0 0.25rem', color: '#0f172a', fontSize: '0.95rem' }}>Real-time insurance lookup</h4>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
            Vendor-neutral check using the configured eligibility provider.
          </p>
        </div>
        {result && (
          <span style={{
            background: result.coverageActive ? '#dcfce7' : '#fee2e2',
            color: result.coverageActive ? '#166534' : '#991b1b',
            borderRadius: '999px',
            padding: '0.25rem 0.65rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {result.coverageActive ? 'Active' : 'Inactive'}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
          Payer ID
          <input
            value={form.payerId}
            onChange={(e) => setForm({ ...form, payerId: e.target.value })}
            placeholder="e.g. AETNA01"
            style={{ padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
          Payer Name
          <input
            value={form.payerName}
            onChange={(e) => setForm({ ...form, payerName: e.target.value })}
            placeholder="Insurance plan"
            style={{ padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
          Member ID
          <input
            value={form.memberId}
            onChange={(e) => setForm({ ...form, memberId: e.target.value })}
            placeholder="Member number"
            style={{ padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
          Service Date
          <input
            type="date"
            value={form.serviceDate}
            onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
            style={{ padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {result ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#334155' }}>
            <span>Copay: <strong>{formatCurrency(result.copayAmount)}</strong></span>
            <span>Deductible left: <strong>{formatCurrency(result.deductibleRemaining)}</strong></span>
            <span>Coinsurance: <strong>{result.coinsurancePct ?? 0}%</strong></span>
            <span>Provider: <strong>{result.provider}</strong></span>
            <span>Mode: <strong>{formatLookupMode(result)}</strong></span>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No lookup run yet.</div>
        )}
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          style={{
            padding: '0.55rem 0.9rem',
            background: checking ? '#94a3b8' : '#0369a1',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            cursor: checking ? 'not-allowed' : 'pointer',
          }}
        >
          {checking ? 'Checking...' : 'Check Eligibility'}
        </button>
      </div>
    </div>
  );
}
