import type { CSSProperties } from 'react';

export interface LoyaltyPoints {
  id: string;
  patientId: string;
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  tier: string;
  lastActivity: string;
}

export interface LoyaltyTransaction {
  id: string;
  points: number;
  transactionType: 'earn' | 'redeem' | 'expire' | 'adjust' | 'bonus' | 'referral';
  description?: string;
  balanceAfter: number;
  createdAt: string;
}

interface LoyaltyWidgetProps {
  loyalty: LoyaltyPoints;
  recentTransactions?: LoyaltyTransaction[];
  onRedeem?: () => void;
  compact?: boolean;
}

const TIER_CONFIG: Record<string, { color: string; bg: string; icon: string; nextTier?: string; pointsToNext?: number }> = {
  bronze: { color: '#b45309', bg: '#fef3c7', icon: '🥉', nextTier: 'Silver', pointsToNext: 5000 },
  silver: { color: '#6b7280', bg: '#f3f4f6', icon: '🥈', nextTier: 'Gold', pointsToNext: 15000 },
  gold: { color: '#ca8a04', bg: '#fef9c3', icon: '🥇', nextTier: 'Platinum', pointsToNext: 30000 },
  platinum: { color: '#7c3aed', bg: '#ede9fe', icon: '💎' },
};

export function LoyaltyWidget({
  loyalty,
  recentTransactions = [],
  onRedeem,
  compact = false,
}: LoyaltyWidgetProps) {
  const tierConfig = TIER_CONFIG[loyalty.tier.toLowerCase()] || TIER_CONFIG.bronze;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'earn':
        return '+';
      case 'redeem':
        return '-';
      case 'bonus':
        return '★';
      case 'referral':
        return '👥';
      case 'expire':
        return '⏱';
      default:
        return '•';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'earn':
      case 'bonus':
      case 'referral':
        return '#22c55e';
      case 'redeem':
      case 'expire':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  // Calculate progress to next tier
  let progressPercent = 100;
  let pointsToNextTier = 0;
  if (tierConfig.nextTier && tierConfig.pointsToNext) {
    const currentTierMin = Object.entries(TIER_CONFIG).findIndex(
      ([key]) => key === loyalty.tier.toLowerCase()
    );
    const prevTierPoints = currentTierMin > 0 ? [0, 5000, 15000, 30000][currentTierMin] : 0;
    const range = tierConfig.pointsToNext - prevTierPoints;
    const progress = loyalty.lifetimeEarned - prevTierPoints;
    progressPercent = Math.min((progress / range) * 100, 100);
    pointsToNextTier = tierConfig.pointsToNext - loyalty.lifetimeEarned;
  }

  const styles: Record<string, CSSProperties> = {
    container: {
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: compact ? '12px' : '16px',
      overflow: 'hidden',
    },
    header: {
      background: `linear-gradient(135deg, ${tierConfig.bg} 0%, white 100%)`,
      padding: compact ? '16px' : '24px',
      borderBottom: '1px solid #e5e7eb',
    },
    tierRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px',
    },
    tierBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: tierConfig.bg,
      border: `2px solid ${tierConfig.color}`,
      padding: '6px 14px',
      borderRadius: '20px',
    },
    tierIcon: {
      fontSize: '18px',
    },
    tierName: {
      fontSize: '14px',
      fontWeight: '700',
      color: tierConfig.color,
      textTransform: 'uppercase' as const,
    },
    balanceSection: {
      textAlign: 'center' as const,
    },
    balanceLabel: {
      fontSize: '12px',
      color: '#6b7280',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '4px',
    },
    balanceValue: {
      fontSize: compact ? '32px' : '42px',
      fontWeight: '800',
      color: '#111827',
      lineHeight: 1,
    },
    pointsText: {
      fontSize: '14px',
      color: '#6b7280',
      marginTop: '4px',
    },
    progressSection: {
      marginTop: '16px',
    },
    progressLabel: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '12px',
      color: '#6b7280',
      marginBottom: '8px',
    },
    progressBar: {
      height: '8px',
      background: '#e5e7eb',
      borderRadius: '4px',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      background: `linear-gradient(90deg, ${tierConfig.color} 0%, ${tierConfig.color}99 100%)`,
      borderRadius: '4px',
      transition: 'width 0.5s ease',
    },
    body: {
      padding: compact ? '16px' : '20px',
    },
    statsRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginBottom: '16px',
    },
    statItem: {
      textAlign: 'center' as const,
    },
    statValue: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#111827',
    },
    statLabel: {
      fontSize: '12px',
      color: '#6b7280',
    },
    transactionsSection: {
      marginTop: '16px',
    },
    transactionsTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '12px',
    },
    transactionsList: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    transactionItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      background: '#f9fafb',
      borderRadius: '8px',
      fontSize: '13px',
    },
    transactionLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    transactionDescription: {
      color: '#374151',
    },
    transactionDate: {
      color: '#9ca3af',
      fontSize: '12px',
    },
    transactionPoints: {
      fontWeight: '700',
    },
    redeemButton: {
      width: '100%',
      padding: '12px 20px',
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: '700',
      cursor: 'pointer',
      marginTop: '16px',
    },
    redeemValue: {
      fontSize: '12px',
      color: '#6b7280',
      textAlign: 'center' as const,
      marginTop: '8px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tierRow}>
          <div style={styles.tierBadge}>
            <span style={styles.tierIcon}>{tierConfig.icon}</span>
            <span style={styles.tierName}>{loyalty.tier} Member</span>
          </div>
        </div>

        <div style={styles.balanceSection}>
          <div style={styles.balanceLabel}>Available Points</div>
          <div style={styles.balanceValue}>
            {formatNumber(loyalty.pointsBalance)}
          </div>
          <div style={styles.pointsText}>points</div>
        </div>

        {tierConfig.nextTier && !compact && (
          <div style={styles.progressSection}>
            <div style={styles.progressLabel}>
              <span>Progress to {tierConfig.nextTier}</span>
              <span>{formatNumber(pointsToNextTier)} points to go</span>
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${progressPercent}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={styles.body}>
        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <div style={styles.statValue}>
              {formatNumber(loyalty.lifetimeEarned)}
            </div>
            <div style={styles.statLabel}>Lifetime Earned</div>
          </div>
          <div style={styles.statItem}>
            <div style={styles.statValue}>
              {formatNumber(loyalty.lifetimeRedeemed)}
            </div>
            <div style={styles.statLabel}>Lifetime Redeemed</div>
          </div>
        </div>

        {!compact && recentTransactions.length > 0 && (
          <div style={styles.transactionsSection}>
            <div style={styles.transactionsTitle}>Recent Activity</div>
            <div style={styles.transactionsList}>
              {recentTransactions.slice(0, 5).map((tx) => (
                <div key={tx.id} style={styles.transactionItem}>
                  <div style={styles.transactionLeft}>
                    <span
                      style={{
                        color: getTransactionColor(tx.transactionType),
                        fontWeight: '700',
                        fontSize: '16px',
                      }}
                    >
                      {getTransactionIcon(tx.transactionType)}
                    </span>
                    <div>
                      <div style={styles.transactionDescription}>
                        {tx.description || tx.transactionType}
                      </div>
                      <div style={styles.transactionDate}>
                        {formatDate(tx.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      ...styles.transactionPoints,
                      color: getTransactionColor(tx.transactionType),
                    }}
                  >
                    {tx.points > 0 ? '+' : ''}{formatNumber(tx.points)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onRedeem && loyalty.pointsBalance >= 100 && (
          <>
            <button style={styles.redeemButton} onClick={onRedeem}>
              Redeem Points
            </button>
            <div style={styles.redeemValue}>
              100 points = $1 discount
            </div>
          </>
        )}
      </div>
    </div>
  );
}
