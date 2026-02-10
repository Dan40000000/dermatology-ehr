import { useState, type CSSProperties } from 'react';
import { Modal } from '../ui/Modal';
import { LoadingButton } from '../ui/LoadingButton';
import type { PatientPackage, RemainingService } from './PatientPackages';

interface ServiceRedemptionProps {
  patientPackage: PatientPackage;
  serviceId: string;
  service: RemainingService;
  encounterId?: string;
  onRedeem: (data: RedemptionData) => Promise<void>;
  onClose: () => void;
}

export interface RedemptionData {
  patientPackageId: string;
  serviceId: string;
  quantity: number;
  encounterId?: string;
}

export function ServiceRedemption({
  patientPackage,
  serviceId,
  service,
  encounterId,
  onRedeem,
  onClose,
}: ServiceRedemptionProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (quantity < 1 || quantity > service.remaining) {
      setError(`Quantity must be between 1 and ${service.remaining}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onRedeem({
        patientPackageId: patientPackage.id,
        serviceId,
        quantity,
        encounterId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem service');
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysUntilExpiry = (expirationDate: string) => {
    const expiry = new Date(expirationDate);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = getDaysUntilExpiry(patientPackage.expirationDate);

  const styles: Record<string, CSSProperties> = {
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    infoCard: {
      background: '#f0fdf4',
      border: '2px solid #bbf7d0',
      borderRadius: '12px',
      padding: '20px',
    },
    packageName: {
      fontSize: '14px',
      color: '#6b7280',
      margin: '0 0 4px 0',
    },
    serviceName: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#111827',
      margin: '0 0 16px 0',
    },
    statsRow: {
      display: 'flex',
      gap: '24px',
    },
    statItem: {
      flex: 1,
      textAlign: 'center' as const,
      padding: '12px',
      background: 'white',
      borderRadius: '8px',
    },
    statValue: {
      fontSize: '24px',
      fontWeight: '800',
      color: '#059669',
    },
    statLabel: {
      fontSize: '12px',
      color: '#6b7280',
      marginTop: '4px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    label: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
    },
    quantityControl: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    quantityButton: {
      width: '44px',
      height: '44px',
      border: '2px solid #e5e7eb',
      background: 'white',
      borderRadius: '8px',
      fontSize: '20px',
      fontWeight: '600',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quantityInput: {
      width: '80px',
      padding: '12px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '18px',
      fontWeight: '600',
      textAlign: 'center' as const,
    },
    maxNote: {
      fontSize: '13px',
      color: '#6b7280',
    },
    warningBox: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '14px 16px',
      background: '#fef3c7',
      border: '1px solid #fbbf24',
      borderRadius: '8px',
    },
    warningIcon: {
      fontSize: '18px',
    },
    warningText: {
      fontSize: '13px',
      color: '#b45309',
      lineHeight: 1.5,
    },
    expiryInfo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: '#f9fafb',
      borderRadius: '8px',
      fontSize: '13px',
      color: '#6b7280',
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
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Redeem Service"
      size="small"
    >
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.infoCard}>
          <p style={styles.packageName}>
            {patientPackage.packageName || 'Package'}
          </p>
          <h3 style={styles.serviceName}>
            {service.serviceName || serviceId}
          </h3>
          <div style={styles.statsRow}>
            <div style={styles.statItem}>
              <div style={styles.statValue}>{service.remaining}</div>
              <div style={styles.statLabel}>Remaining</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statValue}>{service.original - service.remaining}</div>
              <div style={styles.statLabel}>Used</div>
            </div>
            <div style={styles.statItem}>
              <div style={styles.statValue}>{service.original}</div>
              <div style={styles.statLabel}>Total</div>
            </div>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Quantity to Redeem</label>
          <div style={styles.quantityControl}>
            <button
              type="button"
              style={styles.quantityButton}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={service.remaining}
              style={styles.quantityInput}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(service.remaining, parseInt(e.target.value) || 1)))}
            />
            <button
              type="button"
              style={styles.quantityButton}
              onClick={() => setQuantity(Math.min(service.remaining, quantity + 1))}
              disabled={quantity >= service.remaining}
            >
              +
            </button>
          </div>
          <div style={styles.maxNote}>
            Maximum: {service.remaining} {service.remaining === 1 ? 'unit' : 'units'}
          </div>
        </div>

        {quantity > 1 && (
          <div style={styles.warningBox}>
            <span style={styles.warningIcon}>&#9888;</span>
            <span style={styles.warningText}>
              You are about to redeem {quantity} units of this service.
              This action cannot be undone.
            </span>
          </div>
        )}

        <div style={styles.expiryInfo}>
          <span>Package Expires:</span>
          <span style={{ fontWeight: '600', color: daysLeft <= 30 ? '#b45309' : '#374151' }}>
            {formatDate(patientPackage.expirationDate)}
            {daysLeft <= 30 && ` (${daysLeft} days left)`}
          </span>
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
            Confirm Redemption
          </LoadingButton>
        </div>
      </form>
    </Modal>
  );
}
