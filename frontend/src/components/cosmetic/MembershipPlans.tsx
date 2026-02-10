import { useState, type CSSProperties } from 'react';
import { LoadingButton } from '../ui/LoadingButton';

export interface MembershipBenefit {
  type: string;
  description: string;
  value: number | string | boolean;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description?: string;
  tier: string;
  monthlyPriceCents: number;
  annualPriceCents?: number;
  benefits: MembershipBenefit[];
  discountPercent: number;
  priorityBooking: boolean;
  freeConsultations: boolean;
  loyaltyPointsMultiplier: number;
  isActive: boolean;
}

interface MembershipPlansProps {
  plans: MembershipPlan[];
  currentPlanId?: string;
  onEnroll?: (planId: string, billingFrequency: 'monthly' | 'annual') => Promise<void>;
  loading?: boolean;
}

export function MembershipPlans({
  plans,
  currentPlanId,
  onEnroll,
  loading = false,
}: MembershipPlansProps) {
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'annual'>('monthly');
  const [enrollingPlanId, setEnrollingPlanId] = useState<string | null>(null);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getTierColor = (tier: string): { bg: string; text: string; border: string } => {
    switch (tier.toLowerCase()) {
      case 'vip':
        return { bg: '#fef3c7', text: '#b45309', border: '#fbbf24' };
      case 'premium':
        return { bg: '#ede9fe', text: '#7c3aed', border: '#a78bfa' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
    }
  };

  const handleEnroll = async (planId: string) => {
    if (!onEnroll) return;

    setEnrollingPlanId(planId);
    try {
      await onEnroll(planId, billingFrequency);
    } finally {
      setEnrollingPlanId(null);
    }
  };

  const styles: Record<string, CSSProperties> = {
    container: {
      padding: '24px',
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '32px',
    },
    title: {
      fontSize: '32px',
      fontWeight: '800',
      color: '#111827',
      margin: '0 0 12px 0',
    },
    subtitle: {
      fontSize: '16px',
      color: '#6b7280',
      margin: 0,
    },
    billingToggle: {
      display: 'flex',
      justifyContent: 'center',
      gap: '8px',
      marginBottom: '32px',
    },
    toggleButton: {
      padding: '10px 24px',
      border: '2px solid #e5e7eb',
      background: 'white',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    toggleButtonActive: {
      background: '#059669',
      borderColor: '#059669',
      color: 'white',
    },
    savingsNote: {
      textAlign: 'center' as const,
      marginBottom: '24px',
    },
    savingsBadge: {
      display: 'inline-block',
      background: '#dcfce7',
      color: '#15803d',
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: '600',
    },
    plansGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '24px',
      maxWidth: '1200px',
      margin: '0 auto',
    },
    planCard: {
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '16px',
      padding: '28px',
      display: 'flex',
      flexDirection: 'column' as const,
      position: 'relative' as const,
      transition: 'all 0.2s',
    },
    planCardVip: {
      border: '3px solid #fbbf24',
      boxShadow: '0 8px 25px rgba(251, 191, 36, 0.2)',
    },
    tierBadge: {
      position: 'absolute' as const,
      top: '-14px',
      left: '24px',
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '700',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    planName: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#111827',
      margin: '8px 0 8px 0',
    },
    planDescription: {
      fontSize: '14px',
      color: '#6b7280',
      margin: '0 0 20px 0',
      lineHeight: 1.5,
    },
    priceSection: {
      marginBottom: '24px',
    },
    price: {
      fontSize: '36px',
      fontWeight: '800',
      color: '#111827',
    },
    pricePeriod: {
      fontSize: '16px',
      color: '#6b7280',
      fontWeight: '500',
    },
    benefitsList: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      marginBottom: '24px',
    },
    benefitItem: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      fontSize: '14px',
      color: '#374151',
    },
    benefitIcon: {
      color: '#22c55e',
      fontSize: '18px',
      marginTop: '2px',
    },
    discountHighlight: {
      background: '#f0fdf4',
      border: '2px solid #bbf7d0',
      borderRadius: '8px',
      padding: '12px',
      textAlign: 'center' as const,
      marginBottom: '16px',
    },
    discountText: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#059669',
    },
    enrollButton: {
      width: '100%',
      padding: '14px 24px',
      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '700',
      cursor: 'pointer',
    },
    currentPlanBadge: {
      width: '100%',
      padding: '14px 24px',
      background: '#f3f4f6',
      color: '#6b7280',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '600',
      textAlign: 'center' as const,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Membership Plans</h2>
        <p style={styles.subtitle}>
          Unlock exclusive savings and perks with our membership program
        </p>
      </div>

      <div style={styles.billingToggle}>
        <button
          style={{
            ...styles.toggleButton,
            ...(billingFrequency === 'monthly' ? styles.toggleButtonActive : {}),
          }}
          onClick={() => setBillingFrequency('monthly')}
        >
          Monthly
        </button>
        <button
          style={{
            ...styles.toggleButton,
            ...(billingFrequency === 'annual' ? styles.toggleButtonActive : {}),
          }}
          onClick={() => setBillingFrequency('annual')}
        >
          Annual
        </button>
      </div>

      {billingFrequency === 'annual' && (
        <div style={styles.savingsNote}>
          <span style={styles.savingsBadge}>
            Save up to 2 months free with annual billing!
          </span>
        </div>
      )}

      <div style={styles.plansGrid}>
        {plans.map((plan) => {
          const tierColors = getTierColor(plan.tier);
          const isCurrentPlan = currentPlanId === plan.id;
          const isVip = plan.tier.toLowerCase() === 'vip';
          const price = billingFrequency === 'annual' && plan.annualPriceCents
            ? plan.annualPriceCents
            : plan.monthlyPriceCents;

          return (
            <div
              key={plan.id}
              style={{
                ...styles.planCard,
                ...(isVip ? styles.planCardVip : {}),
              }}
            >
              <div
                style={{
                  ...styles.tierBadge,
                  background: tierColors.bg,
                  color: tierColors.text,
                  border: `2px solid ${tierColors.border}`,
                }}
              >
                {plan.tier}
              </div>

              <h3 style={styles.planName}>{plan.name}</h3>
              {plan.description && (
                <p style={styles.planDescription}>{plan.description}</p>
              )}

              <div style={styles.priceSection}>
                <span style={styles.price}>{formatCurrency(price)}</span>
                <span style={styles.pricePeriod}>
                  /{billingFrequency === 'annual' ? 'year' : 'month'}
                </span>
              </div>

              {plan.discountPercent > 0 && (
                <div style={styles.discountHighlight}>
                  <div style={styles.discountText}>
                    {plan.discountPercent}% off all services
                  </div>
                </div>
              )}

              <div style={styles.benefitsList}>
                {plan.benefits.map((benefit, index) => (
                  <div key={index} style={styles.benefitItem}>
                    <span style={styles.benefitIcon}>&#10003;</span>
                    <span>{benefit.description}</span>
                  </div>
                ))}
                {plan.priorityBooking && (
                  <div style={styles.benefitItem}>
                    <span style={styles.benefitIcon}>&#10003;</span>
                    <span>Priority appointment booking</span>
                  </div>
                )}
                {plan.freeConsultations && (
                  <div style={styles.benefitItem}>
                    <span style={styles.benefitIcon}>&#10003;</span>
                    <span>Free consultations</span>
                  </div>
                )}
                {plan.loyaltyPointsMultiplier > 1 && (
                  <div style={styles.benefitItem}>
                    <span style={styles.benefitIcon}>&#10003;</span>
                    <span>{plan.loyaltyPointsMultiplier}x loyalty points multiplier</span>
                  </div>
                )}
              </div>

              {isCurrentPlan ? (
                <div style={styles.currentPlanBadge}>
                  Current Plan
                </div>
              ) : onEnroll ? (
                <LoadingButton
                  style={styles.enrollButton}
                  loading={enrollingPlanId === plan.id || loading}
                  onClick={() => handleEnroll(plan.id)}
                  disabled={loading}
                >
                  {isVip ? 'Upgrade to VIP' : 'Start Membership'}
                </LoadingButton>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
