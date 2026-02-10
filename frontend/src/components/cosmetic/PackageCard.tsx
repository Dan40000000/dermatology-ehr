import type { CSSProperties } from 'react';

export interface PackageServiceItem {
  serviceId: string;
  name?: string;
  quantity: number;
  discountedUnits?: number;
  discountPercent?: number;
}

export interface CosmeticPackage {
  id: string;
  name: string;
  description?: string;
  category?: string;
  services: PackageServiceItem[];
  packagePriceCents: number;
  originalPriceCents?: number;
  savingsAmountCents?: number;
  savingsPercent?: number;
  validityDays: number;
  isFeatured: boolean;
  isActive: boolean;
}

interface PackageCardProps {
  pkg: CosmeticPackage;
  onPurchase?: (pkg: CosmeticPackage) => void;
  showPurchaseButton?: boolean;
  compact?: boolean;
}

export function PackageCard({
  pkg,
  onPurchase,
  showPurchaseButton = true,
  compact = false,
}: PackageCardProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const styles: Record<string, CSSProperties> = {
    card: {
      background: pkg.isFeatured ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : 'white',
      border: pkg.isFeatured ? '2px solid #22c55e' : '2px solid #e5e7eb',
      borderRadius: '16px',
      padding: compact ? '16px' : '24px',
      position: 'relative',
      transition: 'all 0.2s ease',
      cursor: onPurchase ? 'pointer' : 'default',
    },
    featuredBadge: {
      position: 'absolute',
      top: '-12px',
      right: '16px',
      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      color: 'white',
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '700',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    header: {
      marginBottom: '16px',
    },
    title: {
      fontSize: compact ? '18px' : '22px',
      fontWeight: '700',
      color: '#111827',
      margin: '0 0 8px 0',
    },
    description: {
      fontSize: '14px',
      color: '#6b7280',
      margin: 0,
      lineHeight: 1.5,
    },
    servicesSection: {
      marginBottom: '20px',
    },
    servicesTitle: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#9ca3af',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
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
      gap: '8px',
      fontSize: '14px',
      color: '#374151',
    },
    checkIcon: {
      color: '#22c55e',
      fontSize: '16px',
    },
    pricingSection: {
      background: '#f9fafb',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '16px',
    },
    originalPrice: {
      fontSize: '14px',
      color: '#9ca3af',
      textDecoration: 'line-through',
      marginBottom: '4px',
    },
    currentPrice: {
      fontSize: '32px',
      fontWeight: '800',
      color: '#059669',
      margin: 0,
    },
    savingsTag: {
      display: 'inline-block',
      background: '#fef3c7',
      color: '#b45309',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '700',
      marginTop: '8px',
    },
    validityNote: {
      fontSize: '12px',
      color: '#9ca3af',
      marginTop: '8px',
    },
    purchaseButton: {
      width: '100%',
      padding: '14px 24px',
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    categoryPill: {
      display: 'inline-block',
      background: '#e0e7ff',
      color: '#4f46e5',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase' as const,
      marginBottom: '12px',
    },
  };

  return (
    <div style={styles.card}>
      {pkg.isFeatured && (
        <div style={styles.featuredBadge}>Most Popular</div>
      )}

      <div style={styles.header}>
        {pkg.category && (
          <span style={styles.categoryPill}>
            {pkg.category.replace(/_/g, ' ')}
          </span>
        )}
        <h3 style={styles.title}>{pkg.name}</h3>
        {pkg.description && (
          <p style={styles.description}>{pkg.description}</p>
        )}
      </div>

      {!compact && pkg.services.length > 0 && (
        <div style={styles.servicesSection}>
          <div style={styles.servicesTitle}>Package Includes</div>
          <div style={styles.servicesList}>
            {pkg.services.map((svc, index) => (
              <div key={index} style={styles.serviceItem}>
                <span style={styles.checkIcon}>&#10003;</span>
                <span>
                  {svc.quantity}x {svc.name || svc.serviceId}
                  {svc.discountPercent && svc.discountedUnits && (
                    <span style={{ color: '#059669', marginLeft: '4px' }}>
                      ({svc.discountedUnits} at {svc.discountPercent}% off)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.pricingSection}>
        {pkg.originalPriceCents && pkg.originalPriceCents > pkg.packagePriceCents && (
          <div style={styles.originalPrice}>
            Regular: {formatCurrency(pkg.originalPriceCents)}
          </div>
        )}
        <div style={styles.currentPrice}>
          {formatCurrency(pkg.packagePriceCents)}
        </div>
        {pkg.savingsAmountCents && pkg.savingsAmountCents > 0 && (
          <div style={styles.savingsTag}>
            Save {formatCurrency(pkg.savingsAmountCents)}
            {pkg.savingsPercent && ` (${Math.round(pkg.savingsPercent)}%)`}
          </div>
        )}
        <div style={styles.validityNote}>
          Valid for {pkg.validityDays} days after purchase
        </div>
      </div>

      {showPurchaseButton && onPurchase && (
        <button
          style={styles.purchaseButton}
          onClick={() => onPurchase(pkg)}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Purchase Package
        </button>
      )}
    </div>
  );
}
