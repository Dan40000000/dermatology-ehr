import { useState, useEffect } from 'react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import {
  fetchPortalBalance,
  fetchPortalCharges,
  fetchPortalStatements,
  fetchPortalStatementDetails,
  fetchPortalPaymentHistory,
  fetchPortalPaymentMethods,
  makePortalPayment,
  type PatientBalance,
  type Charge as PortalCharge,
  type PortalStatement,
  type PortalStatementLineItem,
  type PaymentMethod as PortalPaymentMethod,
  type PaymentTransaction,
} from '../../portalApi';

export function PortalBillingPage() {
  const { sessionToken, tenantId } = usePatientPortalAuth();
  const [balance, setBalance] = useState<PatientBalance | null>(null);
  const [charges, setCharges] = useState<PortalCharge[]>([]);
  const [statements, setStatements] = useState<PortalStatement[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PortalPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'statements' | 'charges' | 'payments' | 'methods'>('statements');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<PortalStatement | null>(null);
  const [statementLineItems, setStatementLineItems] = useState<PortalStatementLineItem[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, [sessionToken, tenantId]);

  const fetchBillingData = async () => {
    if (!sessionToken || !tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [balanceData, chargesData, statementsData, paymentsData, methodsData] = await Promise.all([
        fetchPortalBalance(tenantId, sessionToken),
        fetchPortalCharges(tenantId, sessionToken),
        fetchPortalStatements(tenantId, sessionToken),
        fetchPortalPaymentHistory(tenantId, sessionToken),
        fetchPortalPaymentMethods(tenantId, sessionToken),
      ]);

      setBalance(balanceData);
      setCharges(chargesData.charges || []);
      setStatements(statementsData.statements || []);
      setPayments(paymentsData.payments || []);
      setPaymentMethods(methodsData.paymentMethods || []);

      if (methodsData.paymentMethods?.length > 0) {
        const defaultMethod = methodsData.paymentMethods.find((m) => m.isDefault);
        setSelectedMethod(defaultMethod?.id || methodsData.paymentMethods[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = async () => {
    if (!paymentAmount || !selectedMethod || processing || !sessionToken || !tenantId) return;

    setProcessing(true);
    try {
      await makePortalPayment(tenantId, sessionToken, {
        amount: parseFloat(paymentAmount),
        paymentMethodId: selectedMethod,
      });

      setShowPaymentModal(false);
      setPaymentAmount('');
      fetchBillingData();
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCardIcon = (brand?: string) => {
    const brandLower = brand?.toLowerCase() || '';
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('master')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    return '💳';
  };

  const formatPaymentMethodLabel = (method: PortalPaymentMethod) => {
    const brand =
      method.cardBrand ||
      method.bankName ||
      method.paymentType?.replace(/_/g, ' ') ||
      'Card';
    const lastFour = method.lastFour ? `ending in ${method.lastFour}` : '';
    return `${brand} ${lastFour}`.trim();
  };

  const formatPaymentExpiry = (method: PortalPaymentMethod) => {
    if (method.expiryMonth && method.expiryYear) {
      return `Expires ${method.expiryMonth}/${method.expiryYear}`;
    }
    return 'Expiration unavailable';
  };

  const handleViewStatement = async (statementId: string) => {
    if (!sessionToken || !tenantId) return;
    setStatementLoading(true);
    try {
      const result = await fetchPortalStatementDetails(tenantId, sessionToken, statementId);
      setSelectedStatement(result.statement);
      setStatementLineItems(result.lineItems || []);
    } catch (error) {
      console.error('Failed to load statement:', error);
      setSelectedStatement(null);
      setStatementLineItems([]);
    } finally {
      setStatementLoading(false);
    }
  };

  return (
    <PatientPortalLayout>
      <style>{`
        .billing-page {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .billing-header {
          margin-bottom: 2rem;
        }

        .billing-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .billing-subtitle {
          color: #6b7280;
          margin: 0;
        }

        .balance-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .balance-card {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
        }

        .balance-card.primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
        }

        .balance-card.success {
          border-left: 4px solid #10b981;
        }

        .balance-card.warning {
          border-left: 4px solid #f59e0b;
        }

        .balance-label {
          font-size: 0.875rem;
          opacity: 0.8;
          margin-bottom: 0.5rem;
        }

        .balance-value {
          font-size: 1.75rem;
          font-weight: 700;
        }

        .balance-card.primary .balance-label {
          color: rgba(255, 255, 255, 0.9);
        }

        .balance-card:not(.primary) .balance-label {
          color: #6b7280;
        }

        .balance-card:not(.primary) .balance-value {
          color: #111827;
        }

        .pay-now-btn {
          margin-top: 1rem;
          width: 100%;
          background: white;
          color: #6366f1;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pay-now-btn:hover {
          background: #f3f4f6;
        }

        .tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.5rem;
        }

        .tab {
          padding: 0.75rem 1.5rem;
          border: none;
          background: none;
          color: #6b7280;
          font-weight: 500;
          cursor: pointer;
          border-radius: 8px 8px 0 0;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #374151;
          background: #f3f4f6;
        }

        .tab.active {
          color: #6366f1;
          background: #eef2ff;
          border-bottom: 2px solid #6366f1;
          margin-bottom: -0.5rem;
          padding-bottom: calc(0.75rem + 0.5rem);
        }

        .statement-list {
          display: grid;
          gap: 1rem;
          padding: 1.5rem;
        }

        .statement-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 1.25rem;
          border: 1px solid #e5e7eb;
          display: grid;
          gap: 0.75rem;
        }

        .statement-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .statement-number {
          font-weight: 700;
          color: #111827;
        }

        .statement-meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .statement-balance {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }

        .statement-actions {
          display: flex;
          gap: 0.5rem;
        }

        .statement-view-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: none;
          background: #6366f1;
          color: white;
          font-weight: 600;
          cursor: pointer;
        }

        .statement-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1.5rem;
        }

        .statement-modal {
          background: white;
          border-radius: 16px;
          max-width: 720px;
          width: 100%;
          max-height: 85vh;
          overflow: auto;
          padding: 1.5rem;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
        }

        .statement-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .statement-line-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 1rem;
        }

        .statement-line-item:last-child {
          border-bottom: none;
        }

        .content-section {
          background: white;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .section-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .charge-item {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          align-items: start;
        }

        .charge-item:last-child {
          border-bottom: none;
        }

        .charge-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .charge-description {
          font-weight: 500;
          color: #111827;
        }

        .charge-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .charge-amounts {
          text-align: right;
        }

        .charge-total {
          font-weight: 600;
          color: #111827;
          font-size: 1.125rem;
        }

        .charge-breakdown {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.25rem;
        }

        .insurance-covered {
          color: #10b981;
        }

        .patient-owes {
          color: #ef4444;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .status-paid {
          background: #d1fae5;
          color: #059669;
        }

        .status-pending {
          background: #fef3c7;
          color: #d97706;
        }

        .status-due {
          background: #fee2e2;
          color: #dc2626;
        }

        .payment-method-card {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .payment-method-card:last-child {
          border-bottom: none;
        }

        .method-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .method-icon {
          width: 48px;
          height: 32px;
          background: #f3f4f6;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }

        .method-details h4 {
          margin: 0;
          font-weight: 500;
          color: #111827;
        }

        .method-details p {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .default-badge {
          background: #dbeafe;
          color: #2563eb;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #6b7280;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          background: #f3f4f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .empty-icon svg {
          width: 32px;
          height: 32px;
          color: #9ca3af;
        }

        /* Payment Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          padding: 1.5rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .modal-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .modal-close {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          color: #6b7280;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .amount-input-wrapper {
          position: relative;
        }

        .amount-prefix {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #6b7280;
          font-weight: 500;
        }

        .amount-input-wrapper .form-input {
          padding-left: 2rem;
        }

        .method-select {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          background: white;
          cursor: pointer;
        }

        .submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
          padding: 0.875rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 640px) {
          .billing-page {
            padding: 1rem;
          }

          .balance-cards {
            grid-template-columns: 1fr;
          }

          .tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .tab {
            white-space: nowrap;
          }

          .charge-item {
            grid-template-columns: 1fr;
          }

          .charge-amounts {
            text-align: left;
            display: flex;
            gap: 1rem;
            align-items: center;
          }
        }
      `}</style>

      <div className="billing-page">
        <div className="billing-header">
          <h1 className="billing-title">Billing & Payments</h1>
          <p className="billing-subtitle">View your statements and manage payments</p>
        </div>

        {/* Balance Overview Cards */}
        <div className="balance-cards">
          <div className="balance-card primary">
            <div className="balance-label">Current Balance</div>
            <div className="balance-value">
              {loading ? (
                <div className="loading-skeleton" style={{ height: '2rem', width: '8rem' }} />
              ) : (
                formatCurrency(balance?.currentBalance || 0)
              )}
            </div>
            {!loading && (balance?.currentBalance || 0) > 0 && (
              <button className="pay-now-btn" onClick={() => setShowPaymentModal(true)}>
                Pay Now
              </button>
            )}
          </div>

          <div className="balance-card success">
            <div className="balance-label">Insurance Paid</div>
            <div className="balance-value">
              {loading ? (
                <div className="loading-skeleton" style={{ height: '2rem', width: '6rem' }} />
              ) : (
                formatCurrency(balance?.totalAdjustments || 0)
              )}
            </div>
          </div>

          <div className="balance-card warning">
            <div className="balance-label">Total Charges</div>
            <div className="balance-value">
              {loading ? (
                <div className="loading-skeleton" style={{ height: '2rem', width: '6rem' }} />
              ) : (
                formatCurrency(balance?.totalCharges || 0)
              )}
            </div>
          </div>

          <div className="balance-card">
            <div className="balance-label">Total Payments</div>
            <div className="balance-value">
              {loading ? (
                <div className="loading-skeleton" style={{ height: '2rem', width: '6rem' }} />
              ) : (
                formatCurrency(balance?.totalPayments || 0)
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'statements' ? 'active' : ''}`}
            onClick={() => setActiveTab('statements')}
          >
            Statements
          </button>
          <button
            className={`tab ${activeTab === 'charges' ? 'active' : ''}`}
            onClick={() => setActiveTab('charges')}
          >
            Charges
          </button>
          <button
            className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            Payment History
          </button>
          <button
            className={`tab ${activeTab === 'methods' ? 'active' : ''}`}
            onClick={() => setActiveTab('methods')}
          >
            Payment Methods
          </button>
        </div>

        {/* Content */}
        <div className="content-section">
          {activeTab === 'statements' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Statements</h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '4rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : statements.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 14l6-6M4 4v5h.01M4 4l5 5M20 20v-5h-.01M20 20l-5-5" />
                    </svg>
                  </div>
                  <p>No statements available</p>
                </div>
              ) : (
                <div className="statement-list">
                  {statements.map(statement => (
                    <div key={statement.id} className="statement-card">
                      <div className="statement-header">
                        <div>
                          <div className="statement-number">{statement.statementNumber}</div>
                          <div className="statement-meta">
                            <span>Date: {formatDate(statement.statementDate)}</span>
                            {statement.dueDate && <span>Due: {formatDate(statement.dueDate)}</span>}
                            {statement.sentVia && <span>Sent via: {statement.sentVia}</span>}
                          </div>
                        </div>
                        <div className="statement-balance">
                          {formatCurrency(statement.balanceCents / 100)}
                        </div>
                      </div>
                      <div className="statement-meta">
                        <span>Status: {statement.status}</span>
                        {statement.lineItemCount !== undefined && (
                          <span>{statement.lineItemCount} line item(s)</span>
                        )}
                      </div>
                      <div className="statement-actions">
                        <button
                          className="statement-view-btn"
                          onClick={() => handleViewStatement(statement.id)}
                        >
                          View Statement
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'charges' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Recent Charges</h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '4rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : charges.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 14l6-6M4 4v5h.01M4 4l5 5M20 20v-5h-.01M20 20l-5-5" />
                    </svg>
                  </div>
                  <p>No charges found</p>
                </div>
              ) : (
                charges.map(charge => (
                  <div key={charge.id} className="charge-item">
                    <div className="charge-info">
                      <span className="charge-description">
                        {charge.description || charge.chiefComplaint || 'Medical Service'}
                      </span>
                      <div className="charge-meta">
                        <span>{formatDate(charge.serviceDate)}</span>
                        {charge.providerName && <span>{charge.providerName}</span>}
                      </div>
                    </div>
                    <div className="charge-amounts">
                      <div className="charge-total">{formatCurrency(charge.amount)}</div>
                      {charge.insurancePaid !== undefined && (
                        <div className="charge-breakdown">
                          <span className="insurance-covered">
                            Insurance: {formatCurrency(charge.insurancePaid)}
                          </span>
                          {' | '}
                          <span className="patient-owes">
                            You owe: {formatCurrency(charge.patientResponsibility || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'payments' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Payment History</h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '4rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <p>No payment history</p>
                </div>
              ) : (
                payments.map(payment => (
                  <div key={payment.id} className="charge-item">
                    <div className="charge-info">
                      <span className="charge-description">
                        Payment - {payment.receiptNumber}
                      </span>
                      <div className="charge-meta">
                        <span>{formatDate(payment.createdAt)}</span>
                        <span>{payment.paymentMethodType}</span>
                      </div>
                    </div>
                    <div className="charge-amounts">
                      <div className="charge-total" style={{ color: '#10b981' }}>
                        -{formatCurrency(payment.amount)}
                      </div>
                      <span className={`status-badge status-${payment.status === 'completed' ? 'paid' : 'pending'}`}>
                        {payment.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'methods' && (
            <>
              <div className="section-header">
                <h3 className="section-title">Saved Payment Methods</h3>
              </div>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  {[1, 2].map(i => (
                    <div key={i} className="loading-skeleton" style={{ height: '4rem', marginBottom: '1rem' }} />
                  ))}
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <p>No saved payment methods</p>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Payment methods will be saved when you make a payment
                  </p>
                </div>
              ) : (
                paymentMethods.map(method => (
                  <div key={method.id} className="payment-method-card">
                    <div className="method-info">
                      <div className="method-icon">{getCardIcon(method.cardBrand || method.paymentType)}</div>
                      <div className="method-details">
                        <h4>{formatPaymentMethodLabel(method)}</h4>
                        <p>{formatPaymentExpiry(method)}</p>
                      </div>
                    </div>
                    {method.isDefault && <span className="default-badge">Default</span>}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {selectedStatement && (
        <div
          className="statement-modal-backdrop"
          onClick={() => {
            setSelectedStatement(null);
            setStatementLineItems([]);
          }}
        >
          <div className="statement-modal" onClick={e => e.stopPropagation()}>
            <div className="statement-modal-header">
              <h3>Statement {selectedStatement.statementNumber}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setSelectedStatement(null);
                  setStatementLineItems([]);
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {statementLoading ? (
              <div style={{ padding: '1rem' }}>
                <div className="loading-skeleton" style={{ height: '6rem' }} />
              </div>
            ) : (
              <>
                <div className="statement-meta" style={{ marginBottom: '1rem' }}>
                  <span>Date: {formatDate(selectedStatement.statementDate)}</span>
                  {selectedStatement.dueDate && <span>Due: {formatDate(selectedStatement.dueDate)}</span>}
                  <span>Status: {selectedStatement.status}</span>
                  <span>Balance: {formatCurrency(selectedStatement.balanceCents / 100)}</span>
                </div>

                {statementLineItems.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No line items available.</p>
                ) : (
                  statementLineItems.map(item => (
                    <div key={item.id} className="statement-line-item">
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.description}</div>
                        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                          {formatDate(item.serviceDate)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>{formatCurrency(item.amountCents / 100)}</div>
                        {item.patientResponsibilityCents !== undefined && (
                          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                            Patient: {formatCurrency(item.patientResponsibilityCents / 100)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Make a Payment</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Amount</label>
              <div className="amount-input-wrapper">
                <span className="amount-prefix">$</span>
                <input
                  type="number"
                  className="form-input"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder={balance?.currentBalance?.toString() || '0.00'}
                  step="0.01"
                  min="0.01"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method</label>
              {paymentMethods.length > 0 ? (
                <select
                  className="method-select"
                  value={selectedMethod}
                  onChange={e => setSelectedMethod(e.target.value)}
                >
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.id}>
                      {formatPaymentMethodLabel(method)}
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  No saved payment methods. Add a new card to make a payment.
                </p>
              )}
            </div>

            <button
              className="submit-btn"
              onClick={handleMakePayment}
              disabled={!paymentAmount || !selectedMethod || processing}
            >
              {processing ? 'Processing...' : `Pay ${paymentAmount ? formatCurrency(parseFloat(paymentAmount)) : ''}`}
            </button>
          </div>
        </div>
      )}
    </PatientPortalLayout>
  );
}
