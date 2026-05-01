import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { createPatientPayment, fetchBills, fetchPatientPayments } from '../../api/financials';
import { Modal } from '../ui';
import { PaymentsPerformancePanel } from './PaymentsPerformancePanel';

interface PaymentMethod {
  id: 'cash' | 'credit' | 'debit' | 'check' | 'ach' | 'other';
  label: string;
  description: string;
}

interface PaymentPlan {
  id: string;
  patientId: string;
  patientName: string;
  totalAmountCents: number;
  remainingCents: number;
  monthlyPaymentCents: number;
  nextPaymentDate: string;
  paymentsRemaining: number;
  status: 'active' | 'paused' | 'completed' | 'defaulted';
  autopayEnabled: boolean;
}

interface PendingPayment {
  id: string;
  patientId: string;
  patientName: string;
  amountCents: number;
  balanceCents: number;
  dueDate: string;
  serviceDate: string;
  description: string;
  status: 'pending' | 'overdue' | 'partial';
}

interface FinancialBill {
  id: string;
  patientId: string;
  patientFirstName?: string;
  patientLastName?: string;
  billNumber?: string;
  billDate?: string;
  dueDate?: string;
  serviceDateStart?: string;
  totalChargesCents?: number;
  balanceCents?: number;
  status?: string;
}

interface Props {
  onPaymentSuccess?: (paymentId: string) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', label: 'Cash', description: 'Post a cash collection at checkout' },
  { id: 'check', label: 'Check', description: 'Post a check received at checkout' },
  { id: 'credit', label: 'Card Terminal', description: 'Record a card payment captured outside this app' },
  { id: 'debit', label: 'Debit Terminal', description: 'Record a debit payment captured outside this app' },
  { id: 'ach', label: 'ACH', description: 'Record an ACH payment' },
  { id: 'other', label: 'Other', description: 'Record another manual payment method' },
];

const MOCK_PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: 'pp-1',
    patientId: '1',
    patientName: 'John Smith',
    totalAmountCents: 250000,
    remainingCents: 150000,
    monthlyPaymentCents: 50000,
    nextPaymentDate: '2026-02-01',
    paymentsRemaining: 3,
    status: 'active',
    autopayEnabled: true,
  },
  {
    id: 'pp-2',
    patientId: '2',
    patientName: 'Emily Davis',
    totalAmountCents: 180000,
    remainingCents: 180000,
    monthlyPaymentCents: 60000,
    nextPaymentDate: '2026-02-15',
    paymentsRemaining: 3,
    status: 'active',
    autopayEnabled: false,
  },
];

export function PatientPaymentPortal({ onPaymentSuccess }: Props) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [searchParams] = useSearchParams();
  const patientFilterId = searchParams.get('patientId') || undefined;
  const [activeTab, setActiveTab] = useState<'collect' | 'plans' | 'text-pay' | 'quick-pay'>('collect');
  const [paymentMethods] = useState<PaymentMethod[]>(PAYMENT_METHODS);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(MOCK_PAYMENT_PLANS);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [recentPaymentsTotalCents, setRecentPaymentsTotalCents] = useState(0);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Modal states
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTextPayModal, setShowTextPayModal] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);

  // Form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [textPayPhone, setTextPayPhone] = useState('');
  const [textPayAmount, setTextPayAmount] = useState('');

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const loadPaymentData = useCallback(async () => {
    if (!session) return;

    setLoadingPayments(true);
    try {
      const [billsRes, paymentsRes] = await Promise.all([
        fetchBills(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          patientFilterId ? { patientId: patientFilterId } : undefined,
        ),
        fetchPatientPayments(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          patientFilterId ? { patientId: patientFilterId, status: 'posted' } : { status: 'posted' },
        ),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const pending = (billsRes.bills || [])
        .filter((bill: FinancialBill) => Number(bill.balanceCents || 0) > 0)
        .map((bill: FinancialBill): PendingPayment => {
          const dueDate = String(bill.dueDate || bill.billDate || today).slice(0, 10);
          const status = String(bill.status || '').toLowerCase() === 'partial'
            ? 'partial'
            : dueDate < today
              ? 'overdue'
              : 'pending';

          return {
            id: bill.id,
            patientId: bill.patientId,
            patientName: [bill.patientFirstName, bill.patientLastName].filter(Boolean).join(' ') || 'Unknown patient',
            amountCents: Number(bill.totalChargesCents || 0),
            balanceCents: Number(bill.balanceCents || 0),
            dueDate,
            serviceDate: String(bill.serviceDateStart || bill.billDate || today).slice(0, 10),
            description: bill.billNumber ? `Bill ${bill.billNumber}` : 'Patient balance',
            status,
          };
        });

      const payments = paymentsRes.payments || paymentsRes.data || [];
      setPendingPayments(pending);
      setRecentPaymentsTotalCents(
        payments.reduce((sum: number, payment: any) => sum + Number(payment.amountCents || 0), 0),
      );
    } catch (error: any) {
      showError(error?.message || 'Failed to load patient balances');
    } finally {
      setLoadingPayments(false);
    }
  }, [patientFilterId, session, showError]);

  useEffect(() => {
    loadPaymentData();
  }, [loadPaymentData]);

  const handleProcessPayment = async () => {
    if (!session || !selectedPayment || !paymentAmount || !selectedMethod) return;

    const amountCents = Math.round(Number(paymentAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      showError('Enter a valid payment amount');
      return;
    }

    setProcessingPayment(true);
    try {
      const payment = await createPatientPayment(
        { tenantId: session.tenantId, accessToken: session.accessToken },
        {
          patientId: selectedPayment.patientId,
          paymentDate: new Date().toISOString().slice(0, 10),
          amountCents,
          paymentMethod: selectedMethod as PaymentMethod['id'],
          appliedToInvoiceId: selectedPayment.id,
          notes: `Checkout payment applied to ${selectedPayment.description}`,
        },
      );

      showSuccess('Payment posted to patient ledger');
      onPaymentSuccess?.(payment.id || selectedPayment.id);
      setShowPaymentModal(false);
      setSelectedPayment(null);
      setPaymentAmount('');
      setSelectedMethod('');
      await loadPaymentData();
    } catch (error: any) {
      showError(error?.message || 'Failed to post payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleSendTextPay = () => {
    if (!textPayPhone || !textPayAmount) return;

    // Simulate sending text-to-pay
    setShowTextPayModal(false);
    setTextPayPhone('');
    setTextPayAmount('');
  };

  const toggleAutopay = (planId: string) => {
    setPaymentPlans(plans =>
      plans.map(plan =>
        plan.id === planId ? { ...plan, autopayEnabled: !plan.autopayEnabled } : plan
      )
    );
  };

  return (
    <div className="patient-payment-portal">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
            Patient Payments
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            Collect payments, manage plans, and send payment requests
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowTextPayModal(true)}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'white',
              color: '#059669',
              border: '2px solid #059669',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Send Text to Pay
          </button>
          <button
            onClick={() => setShowNewPlanModal(true)}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            + New Payment Plan
          </button>
        </div>
      </div>

      <PaymentsPerformancePanel />

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          background: '#f0fdf4',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #bbf7d0',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: '0.5rem', fontWeight: '600' }}>
            Posted Payments
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>
            {formatCurrency(recentPaymentsTotalCents)}
          </div>
        </div>
        <div style={{
          background: '#fef3c7',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #fde68a',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '0.5rem', fontWeight: '600' }}>
            Pending Collection
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f59e0b' }}>
            {formatCurrency(pendingPayments.reduce((sum, p) => sum + p.balanceCents, 0))}
          </div>
        </div>
        <div style={{
          background: '#ecfdf5',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #a7f3d0',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: '0.5rem', fontWeight: '600' }}>
            Active Payment Plans
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#10b981' }}>
            {paymentPlans.filter(p => p.status === 'active').length}
          </div>
        </div>
        <div style={{
          background: '#f0f9ff',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '2px solid #bae6fd',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#0369a1', marginBottom: '0.5rem', fontWeight: '600' }}>
            Text-to-Pay Mode
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0ea5e9' }}>
            Demo
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '0.5rem',
      }}>
        {[
          { key: 'collect', label: 'Collect Payment' },
          { key: 'plans', label: 'Payment Plans' },
          { key: 'text-pay', label: 'Text-to-Pay' },
          { key: 'quick-pay', label: 'Quick Pay Links' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.key ? '#059669' : '#6b7280',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '3px solid #059669' : '3px solid transparent',
              marginBottom: '-0.6rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Collect Payment Tab */}
      {activeTab === 'collect' && (
        <div>
          {/* Saved Payment Methods */}
          <div style={{
            background: '#f9fafb',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151' }}>
                Manual Posting Methods
              </h3>
              <button
                onClick={() => setShowAddCardModal(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '6px',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Configure Terminal
              </button>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {paymentMethods.map(method => (
                <div
                  key={method.id}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '1rem 1.25rem',
                    border: '2px solid #e5e7eb',
                    minWidth: '200px',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}>
                    <span style={{ fontWeight: '600', color: '#374151' }}>
                      {method.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                    {method.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Payments */}
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              Pending Patient Balances
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Patient</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Service</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Due</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Amount</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Balance</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayments && (
                  <tr>
                    <td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                      Loading patient balances...
                    </td>
                  </tr>
                )}
                {!loadingPayments && pendingPayments.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                      No open patient balances found.
                    </td>
                  </tr>
                )}
                {pendingPayments.map(payment => (
                  <tr key={payment.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827' }}>
                      {payment.patientName}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#374151' }}>
                      {payment.description}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                      {formatDate(payment.serviceDate)}
                    </td>
                    <td style={{ padding: '0.75rem', color: payment.status === 'overdue' ? '#dc2626' : '#6b7280' }}>
                      {formatDate(payment.dueDate)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#374151' }}>
                      {formatCurrency(payment.amountCents)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#dc2626' }}>
                      {formatCurrency(payment.balanceCents)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: payment.status === 'overdue' ? '#fee2e2' : payment.status === 'partial' ? '#fef3c7' : '#f3f4f6',
                        color: payment.status === 'overdue' ? '#991b1b' : payment.status === 'partial' ? '#92400e' : '#374151',
                      }}>
                        {payment.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setPaymentAmount((payment.balanceCents / 100).toFixed(2));
                            setShowPaymentModal(true);
                          }}
                          style={{
                            padding: '0.4rem 0.75rem',
                            background: '#059669',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          Collect
                        </button>
                        <button
                          onClick={() => {
                            setTextPayPhone('');
                            setTextPayAmount((payment.balanceCents / 100).toFixed(2));
                            setShowTextPayModal(true);
                          }}
                          style={{
                            padding: '0.4rem 0.75rem',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontWeight: '600',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          Text
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Plans Tab */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
              Active Payment Plans
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {paymentPlans.map(plan => (
                <div
                  key={plan.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '1rem',
                  }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                        {plan.patientName}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                        Plan ID: {plan.id}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Autopay:</span>
                        <button
                          onClick={() => toggleAutopay(plan.id)}
                          style={{
                            width: '48px',
                            height: '24px',
                            borderRadius: '12px',
                            border: 'none',
                            background: plan.autopayEnabled ? '#059669' : '#d1d5db',
                            cursor: 'pointer',
                            position: 'relative',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: plan.autopayEnabled ? '26px' : '2px',
                            transition: 'left 0.2s ease',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </button>
                      </div>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: plan.status === 'active' ? '#dcfce7' : '#fee2e2',
                        color: plan.status === 'active' ? '#166534' : '#991b1b',
                      }}>
                        {plan.status}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '1.5rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Amount</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151' }}>
                        {formatCurrency(plan.totalAmountCents)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Remaining</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#dc2626' }}>
                        {formatCurrency(plan.remainingCents)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Monthly Payment</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151' }}>
                        {formatCurrency(plan.monthlyPaymentCents)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Next Payment</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151' }}>
                        {formatDate(plan.nextPaymentDate)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Payments Left</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151' }}>
                        {plan.paymentsRemaining}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{
                      height: '8px',
                      background: '#f3f4f6',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${((plan.totalAmountCents - plan.remainingCents) / plan.totalAmountCents) * 100}%`,
                        height: '100%',
                        background: '#10b981',
                        borderRadius: '4px',
                      }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {Math.round(((plan.totalAmountCents - plan.remainingCents) / plan.totalAmountCents) * 100)}% paid
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}>
                      Make Payment
                    </button>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: 'white',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}>
                      View History
                    </button>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: 'white',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}>
                      Modify Plan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text-to-Pay Tab */}
      {activeTab === 'text-pay' && (
        <div>
          <div style={{
            background: '#f0fdf4',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '2rem',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
              Send Payment Request via Text
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Patients receive a secure link to pay their balance from their phone
            </p>
            <button
              onClick={() => setShowTextPayModal(true)}
              style={{
                padding: '0.75rem 2rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              Send Text-to-Pay
            </button>
          </div>

          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
            Recent Text-to-Pay Requests
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Patient</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Phone</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Sent</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Amount</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827' }}>Sarah Johnson</td>
                <td style={{ padding: '0.75rem', color: '#6b7280' }}>(555) 123-4567</td>
                <td style={{ padding: '0.75rem', color: '#6b7280' }}>Jan 14, 2026 2:30 PM</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#374151' }}>$125.00</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: '#dcfce7',
                    color: '#166534',
                  }}>
                    Paid
                  </span>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <button style={{
                    padding: '0.4rem 0.75rem',
                    background: 'white',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}>
                    View
                  </button>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827' }}>Michael Brown</td>
                <td style={{ padding: '0.75rem', color: '#6b7280' }}>(555) 987-6543</td>
                <td style={{ padding: '0.75rem', color: '#6b7280' }}>Jan 14, 2026 10:15 AM</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#374151' }}>$350.00</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: '#fef3c7',
                    color: '#92400e',
                  }}>
                    Pending
                  </span>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button style={{
                      padding: '0.4rem 0.75rem',
                      background: 'white',
                      color: '#6b7280',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}>
                      Resend
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Pay Links Tab */}
      {activeTab === 'quick-pay' && (
        <div>
          <div style={{
            background: '#f0f9ff',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '2rem',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#0c4a6e', marginBottom: '0.5rem' }}>
              Online Quick Pay Portal
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Patients can pay their balance online without logging in
            </p>
            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              color: '#374151',
              marginBottom: '1rem',
            }}>
              https://pay.dermclinic.com/quick-pay
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button style={{
                padding: '0.5rem 1rem',
                background: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}>
                Copy Link
              </button>
              <button style={{
                padding: '0.5rem 1rem',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}>
                Customize Portal
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1rem',
          }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              padding: '1.5rem',
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Patient Portal Payments
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                Patients can view and pay bills from their portal account
              </p>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                $2,450.00
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Collected this month via portal
              </div>
            </div>

            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              padding: '1.5rem',
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Kiosk Payments
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                In-office kiosk collections at check-in/checkout
              </p>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                $1,850.00
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Collected this month via kiosk
              </div>
            </div>

            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '2px solid #e5e7eb',
              padding: '1.5rem',
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Terminal Payments
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                Credit card terminal transactions at front desk
              </p>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                $4,125.00
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Collected this month via terminal
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        title="Collect Payment"
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedPayment(null);
        }}
      >
        {selectedPayment && (
          <div>
            <div style={{
              background: '#f9fafb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                {selectedPayment.patientName}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                {selectedPayment.description}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#dc2626', marginTop: '0.5rem' }}>
                Balance: {formatCurrency(selectedPayment.balanceCents)}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Payment Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Payment Method
              </label>
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              >
                <option value="">Select a payment method</option>
                {paymentMethods.map(method => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleProcessPayment}
                disabled={processingPayment}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: processingPayment ? '#9ca3af' : '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: processingPayment ? 'not-allowed' : 'pointer',
                }}
              >
                {processingPayment ? 'Posting...' : 'Post Manual Payment'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Text-to-Pay Modal */}
      <Modal
        isOpen={showTextPayModal}
        title="Send Text-to-Pay"
        onClose={() => setShowTextPayModal(false)}
      >
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
              Patient Phone Number
            </label>
            <input
              type="tel"
              value={textPayPhone}
              onChange={(e) => setTextPayPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
              Amount to Request
            </label>
            <input
              type="number"
              step="0.01"
              value={textPayAmount}
              onChange={(e) => setTextPayAmount(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
              }}
            />
          </div>

          <div style={{
            background: '#f0fdf4',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
              Message Preview:
            </div>
            <div style={{ fontSize: '0.9rem', color: '#374151' }}>
              "Your balance of ${textPayAmount || '0.00'} is due at Dermatology Associates.
              Pay securely here: https://pay.dermclinic.com/abc123"
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowTextPayModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSendTextPay}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Send Text
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Card Modal */}
      <Modal
        isOpen={showAddCardModal}
        title="Add Payment Method"
        onClose={() => setShowAddCardModal(false)}
      >
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
              Card Number
            </label>
            <input
              type="text"
              placeholder="4242 4242 4242 4242"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Expiry Date
              </label>
              <input
                type="text"
                placeholder="MM/YY"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                CVV
              </label>
              <input
                type="text"
                placeholder="123"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" />
              <span style={{ fontSize: '0.9rem', color: '#374151' }}>Save as default payment method</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowAddCardModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setShowAddCardModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Add Card
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
