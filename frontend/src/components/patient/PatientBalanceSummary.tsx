import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPatientBalance } from '../../api';
import { Skeleton } from '../ui';
import { DollarSign, CreditCard, Calendar, TrendingDown } from 'lucide-react';

interface PatientBalanceSummaryProps {
  patientId: string;
}

export function PatientBalanceSummary({ patientId }: PatientBalanceSummaryProps) {
  const { session } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient-balance', patientId],
    queryFn: () => fetchPatientBalance(session!.tenantId, session!.accessToken, patientId),
    enabled: !!session && !!patientId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'credit_card':
      case 'debit_card':
        return <CreditCard size={14} />;
      default:
        return <DollarSign size={14} />;
    }
  };

  if (isLoading) {
    return <Skeleton variant="card" height={300} />;
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
        Failed to load account balance
      </div>
    );
  }

  const balance = data?.balance || 0;
  const totalCharges = data?.totalCharges || 0;
  const totalPayments = data?.totalPayments || 0;
  const recentPayments = data?.recentPayments || [];
  const paymentPlans = data?.paymentPlans || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Balance Overview */}
      <div style={{
        background: balance > 0 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        borderRadius: '12px',
        padding: '1.5rem',
        color: '#ffffff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
              Current Balance
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}>
              {formatCurrency(balance)}
            </div>
          </div>
          <DollarSign size={48} style={{ opacity: 0.3 }} />
        </div>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.25rem' }}>
              Total Charges
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {formatCurrency(totalCharges)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.25rem' }}>
              Total Payments
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {formatCurrency(totalPayments)}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Plans */}
      {paymentPlans.filter((p: any) => p.status === 'active').length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Active Payment Plans
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {paymentPlans.filter((p: any) => p.status === 'active').map((plan: any) => {
              const remaining = plan.totalAmount - plan.amountPaid;
              const progress = (plan.amountPaid / plan.totalAmount) * 100;

              return (
                <div
                  key={plan.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
                        Payment Plan
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Started {formatDate(plan.startDate)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                        {formatCurrency(plan.monthlyPayment)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        per month
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{
                      background: '#e5e7eb',
                      borderRadius: '999px',
                      height: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                        width: `${progress}%`,
                        height: '100%',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                    <div>
                      Paid: {formatCurrency(plan.amountPaid)}
                    </div>
                    <div>
                      Remaining: {formatCurrency(remaining)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      {recentPayments.length > 0 && (
        <div>
          <h3 style={{
            margin: '0 0 1rem',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827'
          }}>
            Recent Payments
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentPayments.map((payment: any) => (
              <div
                key={payment.id}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.875rem'
                  }}>
                    {getPaymentMethodIcon(payment.paymentMethod)}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                      {formatCurrency(payment.amount)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {formatDate(payment.paymentDate)} • {payment.paymentMethod?.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '0.25rem 0.5rem',
                  background: payment.status === 'completed' ? '#d1fae5' : '#fef3c7',
                  color: payment.status === 'completed' ? '#065f46' : '#92400e',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'capitalize'
                }}>
                  {payment.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {balance === 0 && recentPayments.length === 0 && (
        <div style={{
          background: '#f0fdf4',
          border: '1px dashed #86efac',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <TrendingDown size={48} style={{ margin: '0 auto 1rem', color: '#16a34a' }} />
          <h3 style={{ margin: '0 0 0.5rem', color: '#166534' }}>Account in Good Standing</h3>
          <p style={{ color: '#15803d', margin: 0 }}>
            No outstanding balance.
          </p>
        </div>
      )}
    </div>
  );
}
