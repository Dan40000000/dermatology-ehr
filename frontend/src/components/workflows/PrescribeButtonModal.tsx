import { useState } from 'react';
import { Modal } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { sendPrescriptionWorkflow } from '../../api';

interface PrescribeButtonModalProps {
  prescriptionId?: string;
  orderId?: string;
  patientId?: string;
  patientName?: string;
  medicationName?: string;
  sig?: string;
  quantity?: string | number;
  refills?: string | number;
  pharmacyName?: string;
  pharmacyNcpdp?: string;
  disabled?: boolean;
  buttonLabel?: string;
  onSent?: () => void;
}

export function PrescribeButtonModal({
  prescriptionId,
  orderId,
  patientId,
  patientName,
  medicationName,
  sig,
  quantity,
  refills,
  pharmacyName,
  pharmacyNcpdp,
  disabled,
  buttonLabel = 'Send eRx',
  onSent,
}: PrescribeButtonModalProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    pharmacyName: pharmacyName || '',
    pharmacyNcpdp: pharmacyNcpdp || '',
  });
  const [result, setResult] = useState<any | null>(null);

  const handleSend = async () => {
    if (!session) return;

    setSending(true);
    try {
      const response = await sendPrescriptionWorkflow(session.tenantId, session.accessToken, {
        prescriptionId,
        orderId,
        patientId,
        medicationName,
        sig,
        quantity,
        refills,
        pharmacyName: form.pharmacyName || pharmacyName,
        pharmacyNcpdp: form.pharmacyNcpdp || pharmacyNcpdp,
      });
      setResult(response.result || response);
      showSuccess('Prescription sent electronically');
      onSent?.();
    } catch (err: any) {
      showError(err.message || 'Failed to send prescription');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        style={{
          padding: '0.25rem 0.5rem',
          background: disabled ? '#94a3b8' : '#0369a1',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.75rem',
        }}
      >
        {buttonLabel}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Send Electronic Prescription"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn ghost" onClick={() => setIsOpen(false)}>
              Close
            </button>
            <button type="button" className="btn" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending...' : 'Send through provider'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Prescription
            </div>
            <div style={{ marginTop: '0.35rem', fontWeight: 700, color: '#0f172a' }}>
              {medicationName || 'Selected prescription'}
            </div>
            <div style={{ marginTop: '0.25rem', color: '#475569', fontSize: '0.85rem' }}>
              {patientName ? `${patientName} · ` : ''}{sig || 'Directions on file'}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
            Pharmacy Name
            <input
              value={form.pharmacyName}
              onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })}
              placeholder="Demo Pharmacy"
              style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>
            NCPDP ID
            <input
              value={form.pharmacyNcpdp}
              onChange={(e) => setForm({ ...form, pharmacyNcpdp: e.target.value })}
              placeholder="Optional in mock mode"
              style={{ padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </label>

          {result && (
            <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '0.85rem', fontSize: '0.85rem' }}>
              Sent via {result.provider} ({result.mode}) · Message {result.messageId}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
