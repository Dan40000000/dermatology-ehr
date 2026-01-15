import { useState } from 'react';
import { Modal } from '../ui';

interface PaymentMethod {
  id: string;
  type: 'credit' | 'debit' | 'ach' | 'hsa' | 'fsa';
  last4: string;
  brand?: string;
  isDefault: boolean;
  expiry?: string;
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

interface Props {
  onPaymentSuccess?: (paymentId: string) => void;
}

const MOCK_PAYMENT_METHODS: PaymentMethod[] = [
  { id: '1', type: 'credit', last4: '4242', brand: 'Visa', isDefault: true, expiry: '12/26' },
  { id: '2', type: 'credit', last4: '5555', brand: 'Mastercard', isDefault: false, expiry: '03/27' },
  { id: '3', type: 'ach', last4: '6789', isDefault: false },
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

const MOCK_PENDING_PAYMENTS: PendingPayment[] = [
  {
    id: 'pend-1',
    patientId: '3',
    patientName: 'Robert Wilson',
    amountCents: 35000,
    balanceCents: 35000,
    dueDate: '2026-01-25',
    serviceDate: '2026-01-08',
    description: 'Dermatology consultation & biopsy',
    status: 'pending',
  },
  {
    id: 'pend-2',
    patientId: '4',
    patientName: 'Maria Garcia',
    amountCents: 28000,
    balanceCents: 28000,
    dueDate: '2026-01-10',
    serviceDate: '2025-12-15',
    description: 'Office visit - skin exam',
    status: 'overdue',
  },
  {
    id: 'pend-3',
    patientId: '5',
    patientName: 'James Anderson',
    amountCents: 45000,
    balanceCents: 22500,
    dueDate: '2026-02-01',
    serviceDate: '2026-01-09',
    description: 'Mohs surgery consultation',
    status: 'partial',
  },
];

export function PatientPaymentPortal({ onPaymentSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<'collect' | 'plans' | 'text-pay' | 'quick-pay'>('collect');
  const [paymentMethods] = useState<PaymentMethod[]>(MOCK_PAYMENT_METHODS);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>(MOCK_PAYMENT_PLANS);
  const [pendingPayments] = useState<PendingPayment[]>(MOCK_PENDING_PAYMENTS);

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

  const handleProcessPayment = () => {
    if (!selectedPayment || !paymentAmount || !selectedMethod) return;

    // Simulate payment processing
    setTimeout(() => {
      onPaymentSuccess?.(selectedPayment.id);
      setShowPaymentModal(false);
      setSelectedPayment(null);
      setPaymentAmount('');
      setSelectedMethod('');
    }, 1000);
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
            Collected Today
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>
            $1,245.00
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
            Text-to-Pay Sent
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0ea5e9' }}>
            12
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
                Saved Payment Methods
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
                + Add Card
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
                    border: method.isDefault ? '2px solid #059669' : '2px solid #e5e7eb',
                    minWidth: '200px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}>
                    <span style={{ fontWeight: '600', color: '#374151' }}>
                      {method.brand || method.type.toUpperCase()}
                    </span>
                    {method.isDefault && (
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        background: '#dcfce7',
                        color: '#166534',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: '600',
                      }}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                    **** {method.last4}
                    {method.expiry && ` | Exp: ${method.expiry}`}
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
                    {method.brand || method.type.toUpperCase()} **** {method.last4}
                    {method.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
                <option value="new">+ Add new card</option>
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
                Process Payment
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
