import { useState, type CSSProperties } from 'react';

export interface RemainingService {
  original: number;
  remaining: number;
  serviceName?: string;
}

export interface PatientPackage {
  id: string;
  patientId: string;
  packageId: string;
  packageName?: string;
  purchaseDate: string;
  expirationDate: string;
  amountPaidCents: number;
  paymentMethod?: string;
  remainingServices: Record<string, RemainingService>;
  status: 'active' | 'expired' | 'fully_redeemed' | 'cancelled' | 'refunded';
  notes?: string;
}

interface PatientPackagesProps {
  packages: PatientPackage[];
  onRedeem?: (packageId: string, serviceId: string) => void;
  onViewDetails?: (pkg: PatientPackage) => void;
  loading?: boolean;
}

export function PatientPackages({
  packages,
  onRedeem,
  onViewDetails,
  loading = false,
}: PatientPackagesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
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
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusConfig = (status: string, expirationDate: string) => {
    const daysLeft = getDaysUntilExpiry(expirationDate);

    if (status === 'active' && daysLeft <= 30) {
      return { label: 'Expiring Soon', color: '#f59e0b', bg: '#fef3c7' };
    }

    switch (status) {
      case 'active':
        return { label: 'Active', color: '#22c55e', bg: '#dcfce7' };
      case 'expired':
        return { label: 'Expired', color: '#ef4444', bg: '#fee2e2' };
      case 'fully_redeemed':
        return { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' };
      case 'cancelled':
        return { label: 'Cancelled', color: '#ef4444', bg: '#fee2e2' };
      case 'refunded':
        return { label: 'Refunded', color: '#f59e0b', bg: '#fef3c7' };
      default:
        return { label: status, color: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const getTotalRemaining = (remainingServices: Record<string, RemainingService>) => {
    return Object.values(remainingServices).reduce(
      (sum, svc) => sum + svc.remaining,
      0
    );
  };

  const getTotalOriginal = (remainingServices: Record<string, RemainingService>) => {
    return Object.values(remainingServices).reduce(
      (sum, svc) => sum + svc.original,
      0
    );
  };

  const styles: Record<string, CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    emptyState: {
      textAlign: 'center' as const,
      padding: '40px 20px',
      background: '#f9fafb',
      borderRadius: '12px',
      color: '#6b7280',
    },
    packageCard: {
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      overflow: 'hidden',
      transition: 'all 0.2s',
    },
    packageCardActive: {
      borderColor: '#22c55e',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      cursor: 'pointer',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    packageName: {
      fontSize: '16px',
      fontWeight: '700',
      color: '#111827',
      margin: 0,
    },
    statusBadge: {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    remainingBadge: {
      background: '#f0fdf4',
      border: '2px solid #bbf7d0',
      borderRadius: '8px',
      padding: '8px 12px',
      textAlign: 'center' as const,
    },
    remainingValue: {
      fontSize: '20px',
      fontWeight: '800',
      color: '#059669',
    },
    remainingLabel: {
      fontSize: '11px',
      color: '#6b7280',
      textTransform: 'uppercase' as const,
    },
    expandIcon: {
      fontSize: '20px',
      color: '#9ca3af',
      transition: 'transform 0.2s',
    },
    expandedContent: {
      borderTop: '1px solid #e5e7eb',
      padding: '20px',
      background: '#fafafa',
    },
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '16px',
      marginBottom: '20px',
    },
    infoItem: {
      textAlign: 'center' as const,
    },
    infoValue: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#111827',
    },
    infoLabel: {
      fontSize: '12px',
      color: '#6b7280',
    },
    servicesSection: {
      marginTop: '20px',
    },
    servicesTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '12px',
    },
    servicesList: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    serviceItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
    },
    serviceInfo: {
      flex: 1,
    },
    serviceName: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#111827',
    },
    serviceProgress: {
      fontSize: '13px',
      color: '#6b7280',
    },
    progressBar: {
      height: '4px',
      background: '#e5e7eb',
      borderRadius: '2px',
      marginTop: '6px',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      background: '#22c55e',
      borderRadius: '2px',
    },
    redeemButton: {
      padding: '8px 16px',
      background: '#059669',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
    },
    redeemButtonDisabled: {
      background: '#d1d5db',
      cursor: 'not-allowed',
    },
    expiryWarning: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 16px',
      background: '#fef3c7',
      border: '1px solid #fbbf24',
      borderRadius: '8px',
      marginTop: '16px',
      fontSize: '13px',
      color: '#b45309',
    },
    actions: {
      display: 'flex',
      gap: '12px',
      marginTop: '16px',
    },
    actionButton: {
      padding: '10px 20px',
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
      cursor: 'pointer',
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              ...styles.packageCard,
              height: '80px',
              background: '#f3f4f6',
              animation: 'pulse 1.5s infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div style={styles.emptyState}>
        <p>No packages found.</p>
        <p style={{ fontSize: '14px', marginTop: '8px' }}>
          Purchase a package to get started with exclusive savings!
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {packages.map((pkg) => {
        const isExpanded = expandedId === pkg.id;
        const statusConfig = getStatusConfig(pkg.status, pkg.expirationDate);
        const totalRemaining = getTotalRemaining(pkg.remainingServices);
        const totalOriginal = getTotalOriginal(pkg.remainingServices);
        const daysLeft = getDaysUntilExpiry(pkg.expirationDate);

        return (
          <div
            key={pkg.id}
            style={{
              ...styles.packageCard,
              ...(pkg.status === 'active' ? styles.packageCardActive : {}),
            }}
          >
            <div
              style={styles.header}
              onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
            >
              <div style={styles.headerLeft}>
                <div>
                  <h4 style={styles.packageName}>
                    {pkg.packageName || 'Package'}
                  </h4>
                  <span
                    style={{
                      ...styles.statusBadge,
                      background: statusConfig.bg,
                      color: statusConfig.color,
                    }}
                  >
                    {statusConfig.label}
                  </span>
                </div>
              </div>

              <div style={styles.headerRight}>
                <div style={styles.remainingBadge}>
                  <div style={styles.remainingValue}>
                    {totalRemaining}/{totalOriginal}
                  </div>
                  <div style={styles.remainingLabel}>Remaining</div>
                </div>
                <span
                  style={{
                    ...styles.expandIcon,
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  &#9660;
                </span>
              </div>
            </div>

            {isExpanded && (
              <div style={styles.expandedContent}>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <div style={styles.infoValue}>
                      {formatCurrency(pkg.amountPaidCents)}
                    </div>
                    <div style={styles.infoLabel}>Amount Paid</div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoValue}>
                      {formatDate(pkg.purchaseDate)}
                    </div>
                    <div style={styles.infoLabel}>Purchase Date</div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoValue}>
                      {formatDate(pkg.expirationDate)}
                    </div>
                    <div style={styles.infoLabel}>Expires</div>
                  </div>
                  {pkg.paymentMethod && (
                    <div style={styles.infoItem}>
                      <div style={styles.infoValue}>
                        {pkg.paymentMethod.replace('_', ' ')}
                      </div>
                      <div style={styles.infoLabel}>Payment Method</div>
                    </div>
                  )}
                </div>

                {pkg.status === 'active' && daysLeft <= 30 && daysLeft > 0 && (
                  <div style={styles.expiryWarning}>
                    <span>&#9888;</span>
                    <span>
                      This package expires in {daysLeft} days. Use remaining services before expiration.
                    </span>
                  </div>
                )}

                <div style={styles.servicesSection}>
                  <div style={styles.servicesTitle}>Services</div>
                  <div style={styles.servicesList}>
                    {Object.entries(pkg.remainingServices).map(([serviceId, svc]) => {
                      const usedPercent = ((svc.original - svc.remaining) / svc.original) * 100;
                      const canRedeem = pkg.status === 'active' && svc.remaining > 0;

                      return (
                        <div key={serviceId} style={styles.serviceItem}>
                          <div style={styles.serviceInfo}>
                            <div style={styles.serviceName}>
                              {svc.serviceName || serviceId}
                            </div>
                            <div style={styles.serviceProgress}>
                              {svc.remaining} of {svc.original} remaining
                            </div>
                            <div style={styles.progressBar}>
                              <div
                                style={{
                                  ...styles.progressFill,
                                  width: `${usedPercent}%`,
                                  background: usedPercent === 100 ? '#9ca3af' : '#22c55e',
                                }}
                              />
                            </div>
                          </div>
                          {onRedeem && (
                            <button
                              style={{
                                ...styles.redeemButton,
                                ...(canRedeem ? {} : styles.redeemButtonDisabled),
                              }}
                              disabled={!canRedeem}
                              onClick={() => onRedeem(pkg.id, serviceId)}
                            >
                              {canRedeem ? 'Redeem' : 'Used'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {onViewDetails && (
                  <div style={styles.actions}>
                    <button
                      style={styles.actionButton}
                      onClick={() => onViewDetails(pkg)}
                    >
                      View Full Details
                    </button>
                  </div>
                )}

                {pkg.notes && (
                  <div style={{ marginTop: '16px', fontSize: '13px', color: '#6b7280' }}>
                    <strong>Notes:</strong> {pkg.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
