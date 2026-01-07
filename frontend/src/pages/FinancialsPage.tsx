import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchPatients } from '../api';
import type { Patient } from '../types';

type PaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'refunded';
type TransactionType = 'charge' | 'payment' | 'adjustment' | 'refund';

interface Invoice {
  id: string;
  patientId: string;
  appointmentId?: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: PaymentStatus;
}

interface InvoiceItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Transaction {
  id: string;
  patientId: string;
  invoiceId?: string;
  type: TransactionType;
  amount: number;
  method?: 'cash' | 'credit' | 'check' | 'insurance';
  date: string;
  description: string;
}

const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv-001',
    patientId: '1',
    date: '2025-01-15',
    dueDate: '2025-02-15',
    items: [
      { id: '1', code: '99213', description: 'Office visit, established patient', quantity: 1, unitPrice: 150, total: 150 },
      { id: '2', code: '11102', description: 'Tangential biopsy, single lesion', quantity: 1, unitPrice: 175, total: 175 },
    ],
    subtotal: 325,
    tax: 0,
    total: 325,
    paid: 200,
    balance: 125,
    status: 'partial',
  },
  {
    id: 'inv-002',
    patientId: '2',
    date: '2025-01-14',
    dueDate: '2025-02-14',
    items: [
      { id: '1', code: '99214', description: 'Office visit, established patient, moderate complexity', quantity: 1, unitPrice: 200, total: 200 },
    ],
    subtotal: 200,
    tax: 0,
    total: 200,
    paid: 200,
    balance: 0,
    status: 'paid',
  },
  {
    id: 'inv-003',
    patientId: '3',
    date: '2024-12-01',
    dueDate: '2025-01-01',
    items: [
      { id: '1', code: '17000', description: 'Destruction of benign lesion', quantity: 3, unitPrice: 85, total: 255 },
    ],
    subtotal: 255,
    tax: 0,
    total: 255,
    paid: 0,
    balance: 255,
    status: 'overdue',
  },
];

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', patientId: '1', invoiceId: 'inv-001', type: 'charge', amount: 325, date: '2025-01-15', description: 'Office visit & biopsy' },
  { id: 't2', patientId: '1', invoiceId: 'inv-001', type: 'payment', amount: 200, method: 'credit', date: '2025-01-15', description: 'Credit card payment' },
  { id: 't3', patientId: '2', invoiceId: 'inv-002', type: 'charge', amount: 200, date: '2025-01-14', description: 'Office visit' },
  { id: 't4', patientId: '2', invoiceId: 'inv-002', type: 'payment', amount: 200, method: 'insurance', date: '2025-01-20', description: 'Insurance payment' },
];

export function FinancialsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'transactions' | 'aging'>('overview');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'check'>('credit');

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const patientsRes = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const handleRecordPayment = () => {
    if (!selectedInvoice || !paymentAmount) {
      showError('Please enter payment amount');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showError('Invalid payment amount');
      return;
    }

    const newTransaction: Transaction = {
      id: `t-${Date.now()}`,
      patientId: selectedInvoice.patientId,
      invoiceId: selectedInvoice.id,
      type: 'payment',
      amount,
      method: paymentMethod,
      date: new Date().toISOString(),
      description: `${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)} payment`,
    };

    setTransactions((prev) => [...prev, newTransaction]);

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === selectedInvoice.id) {
          const newPaid = inv.paid + amount;
          const newBalance = inv.total - newPaid;
          return {
            ...inv,
            paid: newPaid,
            balance: Math.max(0, newBalance),
            status: newBalance <= 0 ? 'paid' : 'partial',
          };
        }
        return inv;
      })
    );

    showSuccess(`Payment of $${amount.toFixed(2)} recorded`);
    setShowPaymentModal(false);
    setSelectedInvoice(null);
    setPaymentAmount('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const totalRevenue = transactions
    .filter((t) => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balance, 0);
  const overdueAmount = invoices
    .filter((inv) => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.balance, 0);

  if (loading) {
    return (
      <div className="financials-page">
        <div className="page-header">
          <h1>Financials</h1>
        </div>
        <div className="financial-stats">
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
        </div>
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="financials-page" style={{
      background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <div className="page-header" style={{
        background: 'linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
        padding: '2rem',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        marginBottom: '2rem',
        animation: 'slideInDown 0.5s ease-out',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>Financial Management</h1>
          <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Track revenue, invoices, and payments</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('/claims')} style={{
            background: 'white',
            color: '#059669',
            border: '2px solid #059669',
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.background = '#059669';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.color = '#059669';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            Claims Management
          </button>
          <button type="button" className="btn-primary" style={{
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
          }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.6)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
          }}>
            + New Invoice
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="financial-stats" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)',
          border: '2px solid rgba(16, 185, 129, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          animation: 'fadeIn 0.6s ease-out'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.3)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #059669, #34d399)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{formatCurrency(totalRevenue)}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Collected (MTD)</div>
        </div>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)',
          border: '2px solid rgba(16, 185, 129, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          animation: 'fadeIn 0.7s ease-out'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.3)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #10b981, #6ee7b7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{formatCurrency(totalOutstanding)}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Outstanding</div>
        </div>
        <div className={`stat-card ${overdueAmount > 0 ? 'warning' : ''}`} style={{
          background: overdueAmount > 0
            ? 'linear-gradient(135deg, rgba(251, 146, 60, 0.1), rgba(251, 146, 60, 0.05))'
            : 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: overdueAmount > 0
            ? '0 8px 24px rgba(251, 146, 60, 0.3)'
            : '0 8px 24px rgba(16, 185, 129, 0.2)',
          border: overdueAmount > 0
            ? '2px solid rgba(251, 146, 60, 0.3)'
            : '2px solid rgba(16, 185, 129, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          animation: 'fadeIn 0.8s ease-out'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = overdueAmount > 0
            ? '0 12px 32px rgba(251, 146, 60, 0.4)'
            : '0 12px 32px rgba(16, 185, 129, 0.3)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = overdueAmount > 0
            ? '0 8px 24px rgba(251, 146, 60, 0.3)'
            : '0 8px 24px rgba(16, 185, 129, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: overdueAmount > 0
              ? 'linear-gradient(135deg, #fb923c, #fdba74)'
              : 'linear-gradient(135deg, #059669, #34d399)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{formatCurrency(overdueAmount)}</div>
          <div className="stat-label" style={{
            color: overdueAmount > 0 ? '#c2410c' : '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Overdue</div>
        </div>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)',
          border: '2px solid rgba(16, 185, 129, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
          animation: 'fadeIn 0.9s ease-out'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.3)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #047857, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{invoices.length}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Total Invoices</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="financial-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'aging' ? 'active' : ''}`}
          onClick={() => setActiveTab('aging')}
        >
          A/R Aging
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="financial-overview">
          <div className="overview-row">
            <Panel title="Recent Activity">
              <div className="activity-list">
                {transactions.slice(-5).reverse().map((t) => (
                  <div key={t.id} className="activity-item">
                    <span className={`activity-icon ${t.type}`}>
                      {t.type === 'payment' ? '' : t.type === 'charge' ? '' : ''}
                    </span>
                    <div className="activity-info">
                      <div className="activity-desc">{t.description}</div>
                      <div className="activity-patient muted tiny">
                        {getPatientName(t.patientId)}
                      </div>
                    </div>
                    <div className={`activity-amount ${t.type === 'payment' ? 'positive' : ''}`}>
                      {t.type === 'payment' ? '+' : ''}{formatCurrency(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Quick Stats">
              <div className="quick-stats">
                <div className="quick-stat">
                  <div className="qs-label">Avg Days to Pay</div>
                  <div className="qs-value">12</div>
                </div>
                <div className="quick-stat">
                  <div className="qs-label">Collection Rate</div>
                  <div className="qs-value">94%</div>
                </div>
                <div className="quick-stat">
                  <div className="qs-label">Write-offs (MTD)</div>
                  <div className="qs-value">{formatCurrency(150)}</div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Needs Attention">
            {invoices.filter((inv) => inv.status === 'overdue' || inv.status === 'partial').length === 0 ? (
              <p className="muted">All accounts in good standing</p>
            ) : (
              <div className="attention-list">
                {invoices
                  .filter((inv) => inv.status === 'overdue' || inv.status === 'partial')
                  .map((inv) => (
                    <div key={inv.id} className={`attention-item ${inv.status}`}>
                      <div className="attention-info">
                        <div className="attention-patient strong">{getPatientName(inv.patientId)}</div>
                        <div className="attention-details muted tiny">
                          Invoice #{inv.id} • Due {new Date(inv.dueDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="attention-balance">{formatCurrency(inv.balance)}</div>
                      <span className={`pill ${inv.status}`}>{inv.status}</span>
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setShowPaymentModal(true);
                        }}
                      >
                        Record Payment
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <Panel title="">
          <div className="invoices-table">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className={inv.status === 'overdue' ? 'overdue-row' : ''}>
                    <td className="strong">{inv.id}</td>
                    <td>{getPatientName(inv.patientId)}</td>
                    <td className="muted">{new Date(inv.date).toLocaleDateString()}</td>
                    <td className="muted">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td>{formatCurrency(inv.total)}</td>
                    <td className="positive">{formatCurrency(inv.paid)}</td>
                    <td className={inv.balance > 0 ? 'negative' : ''}>{formatCurrency(inv.balance)}</td>
                    <td>
                      <span className={`pill ${inv.status}`}>{inv.status}</span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="btn-sm btn-secondary">View</button>
                        {inv.balance > 0 && (
                          <button
                            type="button"
                            className="btn-sm btn-primary"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPaymentAmount(inv.balance.toString());
                              setShowPaymentModal(true);
                            }}
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <Panel title="">
          <div className="transactions-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Patient</th>
                  <th>Description</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{new Date(t.date).toLocaleDateString()}</td>
                    <td>
                      <span className={`pill ${t.type}`}>{t.type}</span>
                    </td>
                    <td>{getPatientName(t.patientId)}</td>
                    <td>{t.description}</td>
                    <td className="muted">{t.method || '-'}</td>
                    <td className={t.type === 'payment' ? 'positive' : t.type === 'refund' ? 'negative' : ''}>
                      {t.type === 'payment' ? '+' : t.type === 'refund' ? '-' : ''}{formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* A/R Aging Tab */}
      {activeTab === 'aging' && (
        <Panel title="Accounts Receivable Aging Report">
          <div className="aging-buckets">
            <div className="aging-bucket">
              <div className="bucket-label">Current (0-30 days)</div>
              <div className="bucket-value">{formatCurrency(125)}</div>
              <div className="bucket-count">1 account</div>
            </div>
            <div className="aging-bucket">
              <div className="bucket-label">31-60 days</div>
              <div className="bucket-value">{formatCurrency(0)}</div>
              <div className="bucket-count">0 accounts</div>
            </div>
            <div className="aging-bucket warning">
              <div className="bucket-label">61-90 days</div>
              <div className="bucket-value">{formatCurrency(255)}</div>
              <div className="bucket-count">1 account</div>
            </div>
            <div className="aging-bucket danger">
              <div className="bucket-label">90+ days</div>
              <div className="bucket-value">{formatCurrency(0)}</div>
              <div className="bucket-count">0 accounts</div>
            </div>
          </div>

          <div className="aging-chart">
            <div className="chart-placeholder">
              <div className="chart-bar" style={{ height: '33%', backgroundColor: 'var(--success-color)' }} title="Current: $125"></div>
              <div className="chart-bar" style={{ height: '0%', backgroundColor: 'var(--info-color)' }} title="31-60: $0"></div>
              <div className="chart-bar" style={{ height: '67%', backgroundColor: 'var(--warning-color)' }} title="61-90: $255"></div>
              <div className="chart-bar" style={{ height: '0%', backgroundColor: 'var(--error-color)' }} title="90+: $0"></div>
            </div>
          </div>
        </Panel>
      )}

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        title="Record Payment"
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedInvoice(null);
          setPaymentAmount('');
        }}
      >
        {selectedInvoice && (
          <div className="modal-form">
            <div className="payment-invoice-info">
              <div className="info-row">
                <span className="label">Patient:</span>
                <span className="value">{getPatientName(selectedInvoice.patientId)}</span>
              </div>
              <div className="info-row">
                <span className="label">Invoice:</span>
                <span className="value">{selectedInvoice.id}</span>
              </div>
              <div className="info-row">
                <span className="label">Balance Due:</span>
                <span className="value strong">{formatCurrency(selectedInvoice.balance)}</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Payment Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'credit' | 'check')}
                >
                  <option value="credit">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Reference/Note</label>
              <input type="text" placeholder="Optional reference number or note" />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowPaymentModal(false)}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleRecordPayment}>
            Record Payment
          </button>
        </div>
      </Modal>
    </div>
  );
}
