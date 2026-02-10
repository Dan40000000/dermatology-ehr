import { useState, type CSSProperties } from 'react';
import type { CosmeticPackage } from './PackageCard';
import { Modal } from '../ui/Modal';
import { LoadingButton } from '../ui/LoadingButton';

interface PackagePurchaseProps {
  pkg: CosmeticPackage;
  patientId: string;
  patientName?: string;
  onPurchase: (data: PurchaseData) => Promise<void>;
  onClose: () => void;
}

export interface PurchaseData {
  patientId: string;
  packageId: string;
  paymentMethod?: string;
  paymentReference?: string;
  amountPaidCents?: number;
  notes?: string;
}

export function PackagePurchase({
  pkg,
  patientId,
  patientName,
  onPurchase,
  onClose,
}: PackagePurchaseProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>('credit_card');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>((pkg.packagePriceCents / 100).toFixed(2));
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountCents = Math.round(parseFloat(amountPaid) * 100);

      await onPurchase({
        patientId,
        packageId: pkg.id,
        paymentMethod: paymentMethod || undefined,
        paymentReference: paymentReference || undefined,
        amountPaidCents: amountCents,
        notes: notes || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete purchase');
    } finally {
      setLoading(false);
    }
  };

  const styles: Record<string, CSSProperties> = {
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    summary: {
      background: '#f0fdf4',
      border: '2px solid #bbf7d0',
      borderRadius: '12px',
      padding: '20px',
    },
    summaryTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#111827',
      margin: '0 0 8px 0',
    },
    summaryPatient: {
      fontSize: '14px',
      color: '#6b7280',
      margin: '0 0 16px 0',
    },
    summaryPrice: {
      fontSize: '28px',
      fontWeight: '800',
      color: '#059669',
      margin: 0,
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    label: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
    },
    input: {
      padding: '12px 14px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
      transition: 'border-color 0.2s',
    },
    select: {
      padding: '12px 14px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
      backgroundColor: 'white',
    },
    textarea: {
      padding: '12px 14px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
      minHeight: '80px',
      resize: 'vertical' as const,
    },
    row: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
    },
    error: {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      padding: '12px 16px',
      color: '#dc2626',
      fontSize: '14px',
    },
    actions: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end',
      marginTop: '8px',
    },
    cancelButton: {
      padding: '12px 24px',
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
      cursor: 'pointer',
    },
    submitButton: {
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '700',
      color: 'white',
      cursor: 'pointer',
    },
    packageServices: {
      fontSize: '13px',
      color: '#6b7280',
      marginTop: '12px',
    },
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Complete Package Purchase"
      size="medium"
    >
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.summary}>
          <h3 style={styles.summaryTitle}>{pkg.name}</h3>
          <p style={styles.summaryPatient}>
            Patient: {patientName || patientId}
          </p>
          <div style={styles.summaryPrice}>
            {formatCurrency(pkg.packagePriceCents)}
          </div>
          {pkg.savingsAmountCents && pkg.savingsAmountCents > 0 && (
            <div style={{ color: '#059669', fontWeight: '600', marginTop: '4px' }}>
              Savings: {formatCurrency(pkg.savingsAmountCents)}
            </div>
          )}
          <div style={styles.packageServices}>
            Includes: {pkg.services.map(s => `${s.quantity}x ${s.name || s.serviceId}`).join(', ')}
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Payment Method</label>
            <select
              style={styles.select}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="financing">Financing</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Amount Paid ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              style={styles.input}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              required
            />
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Reference / Transaction ID (Optional)</label>
          <input
            type="text"
            style={styles.input}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="e.g., Last 4 digits, check number, transaction ID"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Notes (Optional)</label>
          <textarea
            style={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes about this purchase..."
          />
        </div>

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            loading={loading}
            style={styles.submitButton}
          >
            Complete Purchase
          </LoadingButton>
        </div>
      </form>
    </Modal>
  );
}
