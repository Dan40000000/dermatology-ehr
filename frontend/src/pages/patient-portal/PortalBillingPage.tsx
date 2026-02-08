import { useState, useEffect, useCallback } from 'react';
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

// Payment confirmation result type
interface PaymentResult {
  success: boolean;
  transactionId: string;
  receiptNumber: string;
  receiptUrl: string;
  amount: number;
}

// Form validation errors
interface PaymentFormErrors {
  amount?: string;
  paymentMethod?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardholderName?: string;
  billingStreet?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
}

// Credit card form state
interface NewCardForm {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardholderName: string;
  billingStreet: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  saveCard: boolean;
}

const initialCardForm: NewCardForm = {
  cardNumber: '',
  expiryMonth: '',
  expiryYear: '',
  cvv: '',
  cardholderName: '',
  billingStreet: '',
  billingCity: '',
  billingState: '',
  billingZip: '',
  saveCard: false,
};

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

  // New payment modal states
  const [useNewCard, setUseNewCard] = useState(false);
  const [newCardForm, setNewCardForm] = useState<NewCardForm>(initialCardForm);
  const [formErrors, setFormErrors] = useState<PaymentFormErrors>({});
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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

  // Validate payment form
  const validatePaymentForm = useCallback((): boolean => {
    const errors: PaymentFormErrors = {};

    // Validate amount
    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      errors.amount = 'Please enter a valid payment amount';
    } else if (amount < 1) {
      errors.amount = 'Minimum payment is $1.00';
    } else if (balance && amount > balance.currentBalance) {
      errors.amount = 'Amount exceeds current balance';
    }

    // Validate payment method
    if (!useNewCard && !selectedMethod) {
      errors.paymentMethod = 'Please select a payment method';
    }

    // Validate new card form if using new card
    if (useNewCard) {
      // Card number validation (basic - remove spaces and check length)
      const cleanCardNumber = newCardForm.cardNumber.replace(/\s/g, '');
      if (!cleanCardNumber) {
        errors.cardNumber = 'Card number is required';
      } else if (!/^\d{13,19}$/.test(cleanCardNumber)) {
        errors.cardNumber = 'Please enter a valid card number';
      }

      // Expiry validation
      if (!newCardForm.expiryMonth || !newCardForm.expiryYear) {
        errors.cardExpiry = 'Expiration date is required';
      } else {
        const month = parseInt(newCardForm.expiryMonth, 10);
        const year = parseInt(newCardForm.expiryYear, 10);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        if (month < 1 || month > 12) {
          errors.cardExpiry = 'Invalid month';
        } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
          errors.cardExpiry = 'Card has expired';
        }
      }

      // CVV validation
      if (!newCardForm.cvv) {
        errors.cardCvv = 'CVV is required';
      } else if (!/^\d{3,4}$/.test(newCardForm.cvv)) {
        errors.cardCvv = 'CVV must be 3 or 4 digits';
      }

      // Cardholder name
      if (!newCardForm.cardholderName.trim()) {
        errors.cardholderName = 'Cardholder name is required';
      }

      // Billing address
      if (!newCardForm.billingStreet.trim()) {
        errors.billingStreet = 'Street address is required';
      }
      if (!newCardForm.billingCity.trim()) {
        errors.billingCity = 'City is required';
      }
      if (!newCardForm.billingState.trim()) {
        errors.billingState = 'State is required';
      }
      if (!newCardForm.billingZip.trim()) {
        errors.billingZip = 'ZIP code is required';
      } else if (!/^\d{5}(-\d{4})?$/.test(newCardForm.billingZip.trim())) {
        errors.billingZip = 'Please enter a valid ZIP code';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [paymentAmount, selectedMethod, useNewCard, newCardForm, balance]);

  // Detect card brand from number
  const detectCardBrand = (cardNumber: string): string => {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    if (/^4/.test(cleanNumber)) return 'Visa';
    if (/^5[1-5]/.test(cleanNumber)) return 'Mastercard';
    if (/^3[47]/.test(cleanNumber)) return 'American Express';
    if (/^6(?:011|5)/.test(cleanNumber)) return 'Discover';
    return 'Card';
  };

  // Format card number with spaces
  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : '';
  };

  // Handle card number input
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setNewCardForm(prev => ({ ...prev, cardNumber: formatted }));
  };

  const handleMakePayment = async () => {
    if (processing || !sessionToken || !tenantId) return;

    // Validate form
    if (!validatePaymentForm()) {
      return;
    }

    setProcessing(true);
    setPaymentError(null);

    try {
      let paymentData: Parameters<typeof makePortalPayment>[2];

      if (useNewCard) {
        // Payment with new card
        paymentData = {
          amount: parseFloat(paymentAmount),
          savePaymentMethod: newCardForm.saveCard,
          newPaymentMethod: {
            paymentType: 'credit_card',
            cardNumber: newCardForm.cardNumber.replace(/\s/g, ''),
            cardBrand: detectCardBrand(newCardForm.cardNumber),
            expiryMonth: parseInt(newCardForm.expiryMonth, 10),
            expiryYear: parseInt(newCardForm.expiryYear, 10),
            cardholderName: newCardForm.cardholderName,
            cvv: newCardForm.cvv,
            billingAddress: {
              street: newCardForm.billingStreet,
              city: newCardForm.billingCity,
              state: newCardForm.billingState,
              zip: newCardForm.billingZip,
            },
          },
        };
      } else {
        // Payment with saved method
        paymentData = {
          amount: parseFloat(paymentAmount),
          paymentMethodId: selectedMethod,
        };
      }

      const result = await makePortalPayment(tenantId, sessionToken, paymentData);

      // Show success confirmation
      setPaymentResult(result);

      // Refresh billing data to update balance
      fetchBillingData();
    } catch (error) {
      console.error('Payment failed:', error);
      setPaymentError(
        error instanceof Error
          ? error.message
          : 'Payment failed. Please try again or contact support.'
      );
    } finally {
      setProcessing(false);
    }
  };

  // Close payment modal and reset state
  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentAmount('');
    setSelectedMethod(paymentMethods.find(m => m.isDefault)?.id || paymentMethods[0]?.id || '');
    setUseNewCard(false);
    setNewCardForm(initialCardForm);
    setFormErrors({});
    setPaymentResult(null);
    setPaymentError(null);
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

        /* Payment method toggle */
        .payment-method-toggle {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }

        .toggle-btn {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          color: #6b7280;
        }

        .toggle-btn:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .toggle-btn.active {
          border-color: #6366f1;
          background: #eef2ff;
          color: #6366f1;
        }

        /* Form input error state */
        .form-input.error,
        .method-select.error {
          border-color: #ef4444;
        }

        .form-input.error:focus {
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .error-message {
          color: #ef4444;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        /* Card form grid */
        .form-row {
          display: grid;
          gap: 1rem;
        }

        .form-row.two-col {
          grid-template-columns: 1fr 1fr;
        }

        .form-row.three-col {
          grid-template-columns: 1fr 1fr 1fr;
        }

        /* Card brand icon */
        .card-input-wrapper {
          position: relative;
        }

        .card-brand-icon {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
        }

        .card-input-wrapper .form-input {
          padding-right: 5rem;
        }

        /* Checkbox styling */
        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .checkbox-group input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          accent-color: #6366f1;
        }

        .checkbox-label {
          font-size: 0.875rem;
          color: #374151;
        }

        /* Billing section header */
        .billing-section-header {
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
          margin: 1rem 0 0.75rem 0;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        /* Payment confirmation */
        .payment-success {
          text-align: center;
          padding: 1.5rem 0;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          background: #d1fae5;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .success-icon svg {
          width: 32px;
          height: 32px;
          color: #059669;
        }

        .success-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .success-amount {
          font-size: 2rem;
          font-weight: 700;
          color: #059669;
          margin: 1rem 0;
        }

        .confirmation-details {
          background: #f9fafb;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
          text-align: left;
        }

        .confirmation-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .confirmation-row:last-child {
          border-bottom: none;
        }

        .confirmation-label {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .confirmation-value {
          color: #111827;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .receipt-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .receipt-link:hover {
          text-decoration: underline;
        }

        /* Payment error */
        .payment-error {
          background: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .error-icon {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          color: #ef4444;
        }

        .payment-error-text {
          color: #991b1b;
          font-size: 0.875rem;
        }

        /* Payment history improvements */
        .payment-receipt-btn {
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #6366f1;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          transition: all 0.2s;
        }

        .payment-receipt-btn:hover {
          background: #eef2ff;
          border-color: #6366f1;
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
                        <span style={{ textTransform: 'capitalize' }}>
                          {payment.paymentMethodType?.replace(/_/g, ' ') || 'Card'}
                        </span>
                        {payment.description && <span>{payment.description}</span>}
                      </div>
                    </div>
                    <div className="charge-amounts">
                      <div className="charge-total" style={{ color: '#10b981' }}>
                        -{formatCurrency(payment.amount)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span className={`status-badge status-${payment.status === 'completed' ? 'paid' : 'pending'}`}>
                          {payment.status}
                        </span>
                        {payment.receiptUrl && (
                          <a
                            href={payment.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="payment-receipt-btn"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            Receipt
                          </a>
                        )}
                      </div>
                      {payment.refundAmount > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                          Refunded: {formatCurrency(payment.refundAmount)}
                        </div>
                      )}
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
        <div className="modal-overlay" onClick={closePaymentModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: paymentResult ? '400px' : '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {paymentResult ? 'Payment Successful' : 'Make a Payment'}
              </h3>
              <button className="modal-close" onClick={closePaymentModal}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Payment Success Confirmation */}
            {paymentResult ? (
              <div className="payment-success">
                <div className="success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h4 className="success-title">Thank you for your payment!</h4>
                <div className="success-amount">{formatCurrency(paymentResult.amount)}</div>

                <div className="confirmation-details">
                  <div className="confirmation-row">
                    <span className="confirmation-label">Confirmation Number</span>
                    <span className="confirmation-value">{paymentResult.receiptNumber}</span>
                  </div>
                  <div className="confirmation-row">
                    <span className="confirmation-label">Transaction ID</span>
                    <span className="confirmation-value">{paymentResult.transactionId}</span>
                  </div>
                  <div className="confirmation-row">
                    <span className="confirmation-label">New Balance</span>
                    <span className="confirmation-value">
                      {formatCurrency(balance?.currentBalance || 0)}
                    </span>
                  </div>
                </div>

                {paymentResult.receiptUrl && (
                  <a
                    href={paymentResult.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="receipt-link"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    View Receipt
                  </a>
                )}

                <button
                  className="submit-btn"
                  onClick={closePaymentModal}
                  style={{ marginTop: '1.5rem' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Payment Error */}
                {paymentError && (
                  <div className="payment-error">
                    <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className="payment-error-text">{paymentError}</span>
                  </div>
                )}

                {/* Payment Amount */}
                <div className="form-group">
                  <label className="form-label">Payment Amount</label>
                  <div className="amount-input-wrapper">
                    <span className="amount-prefix">$</span>
                    <input
                      type="number"
                      className={`form-input ${formErrors.amount ? 'error' : ''}`}
                      value={paymentAmount}
                      onChange={e => {
                        setPaymentAmount(e.target.value);
                        if (formErrors.amount) {
                          setFormErrors(prev => ({ ...prev, amount: undefined }));
                        }
                      }}
                      placeholder={balance?.currentBalance?.toFixed(2) || '0.00'}
                      step="0.01"
                      min="0.01"
                    />
                  </div>
                  {formErrors.amount && <div className="error-message">{formErrors.amount}</div>}
                  {balance && balance.currentBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(balance.currentBalance.toFixed(2))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6366f1',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        marginTop: '0.25rem',
                        padding: 0,
                      }}
                    >
                      Pay full balance: {formatCurrency(balance.currentBalance)}
                    </button>
                  )}
                </div>

                {/* Payment Method Toggle */}
                <div className="payment-method-toggle">
                  <button
                    type="button"
                    className={`toggle-btn ${!useNewCard ? 'active' : ''}`}
                    onClick={() => setUseNewCard(false)}
                    disabled={paymentMethods.length === 0}
                  >
                    Saved Card
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${useNewCard ? 'active' : ''}`}
                    onClick={() => setUseNewCard(true)}
                  >
                    New Card
                  </button>
                </div>

                {/* Saved Payment Methods */}
                {!useNewCard && (
                  <div className="form-group">
                    <label className="form-label">Select Payment Method</label>
                    {paymentMethods.length > 0 ? (
                      <select
                        className={`method-select ${formErrors.paymentMethod ? 'error' : ''}`}
                        value={selectedMethod}
                        onChange={e => {
                          setSelectedMethod(e.target.value);
                          if (formErrors.paymentMethod) {
                            setFormErrors(prev => ({ ...prev, paymentMethod: undefined }));
                          }
                        }}
                      >
                        <option value="">Select a payment method</option>
                        {paymentMethods.map(method => (
                          <option key={method.id} value={method.id}>
                            {formatPaymentMethodLabel(method)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        No saved payment methods. Use the &quot;New Card&quot; option to add one.
                      </p>
                    )}
                    {formErrors.paymentMethod && (
                      <div className="error-message">{formErrors.paymentMethod}</div>
                    )}
                  </div>
                )}

                {/* New Card Form */}
                {useNewCard && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Card Number</label>
                      <div className="card-input-wrapper">
                        <input
                          type="text"
                          className={`form-input ${formErrors.cardNumber ? 'error' : ''}`}
                          value={newCardForm.cardNumber}
                          onChange={handleCardNumberChange}
                          placeholder="1234 5678 9012 3456"
                          maxLength={19}
                          autoComplete="cc-number"
                        />
                        <span className="card-brand-icon">
                          {detectCardBrand(newCardForm.cardNumber)}
                        </span>
                      </div>
                      {formErrors.cardNumber && (
                        <div className="error-message">{formErrors.cardNumber}</div>
                      )}
                    </div>

                    <div className="form-row three-col">
                      <div className="form-group">
                        <label className="form-label">Month</label>
                        <select
                          className={`method-select ${formErrors.cardExpiry ? 'error' : ''}`}
                          value={newCardForm.expiryMonth}
                          onChange={e =>
                            setNewCardForm(prev => ({ ...prev, expiryMonth: e.target.value }))
                          }
                          autoComplete="cc-exp-month"
                        >
                          <option value="">MM</option>
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = (i + 1).toString().padStart(2, '0');
                            return (
                              <option key={month} value={month}>
                                {month}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Year</label>
                        <select
                          className={`method-select ${formErrors.cardExpiry ? 'error' : ''}`}
                          value={newCardForm.expiryYear}
                          onChange={e =>
                            setNewCardForm(prev => ({ ...prev, expiryYear: e.target.value }))
                          }
                          autoComplete="cc-exp-year"
                        >
                          <option value="">YYYY</option>
                          {Array.from({ length: 15 }, (_, i) => {
                            const year = (new Date().getFullYear() + i).toString();
                            return (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">CVV</label>
                        <input
                          type="text"
                          className={`form-input ${formErrors.cardCvv ? 'error' : ''}`}
                          value={newCardForm.cvv}
                          onChange={e =>
                            setNewCardForm(prev => ({
                              ...prev,
                              cvv: e.target.value.replace(/\D/g, '').slice(0, 4),
                            }))
                          }
                          placeholder="123"
                          maxLength={4}
                          autoComplete="cc-csc"
                        />
                      </div>
                    </div>
                    {formErrors.cardExpiry && (
                      <div className="error-message" style={{ marginTop: '-1rem', marginBottom: '1rem' }}>
                        {formErrors.cardExpiry}
                      </div>
                    )}
                    {formErrors.cardCvv && (
                      <div className="error-message" style={{ marginTop: '-1rem', marginBottom: '1rem' }}>
                        {formErrors.cardCvv}
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Cardholder Name</label>
                      <input
                        type="text"
                        className={`form-input ${formErrors.cardholderName ? 'error' : ''}`}
                        value={newCardForm.cardholderName}
                        onChange={e =>
                          setNewCardForm(prev => ({ ...prev, cardholderName: e.target.value }))
                        }
                        placeholder="Name as it appears on card"
                        autoComplete="cc-name"
                      />
                      {formErrors.cardholderName && (
                        <div className="error-message">{formErrors.cardholderName}</div>
                      )}
                    </div>

                    <div className="billing-section-header">Billing Address</div>

                    <div className="form-group">
                      <label className="form-label">Street Address</label>
                      <input
                        type="text"
                        className={`form-input ${formErrors.billingStreet ? 'error' : ''}`}
                        value={newCardForm.billingStreet}
                        onChange={e =>
                          setNewCardForm(prev => ({ ...prev, billingStreet: e.target.value }))
                        }
                        placeholder="123 Main St"
                        autoComplete="billing street-address"
                      />
                      {formErrors.billingStreet && (
                        <div className="error-message">{formErrors.billingStreet}</div>
                      )}
                    </div>

                    <div className="form-row two-col">
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className={`form-input ${formErrors.billingCity ? 'error' : ''}`}
                          value={newCardForm.billingCity}
                          onChange={e =>
                            setNewCardForm(prev => ({ ...prev, billingCity: e.target.value }))
                          }
                          placeholder="City"
                          autoComplete="billing address-level2"
                        />
                        {formErrors.billingCity && (
                          <div className="error-message">{formErrors.billingCity}</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <input
                          type="text"
                          className={`form-input ${formErrors.billingState ? 'error' : ''}`}
                          value={newCardForm.billingState}
                          onChange={e =>
                            setNewCardForm(prev => ({
                              ...prev,
                              billingState: e.target.value.toUpperCase().slice(0, 2),
                            }))
                          }
                          placeholder="CA"
                          maxLength={2}
                          autoComplete="billing address-level1"
                        />
                        {formErrors.billingState && (
                          <div className="error-message">{formErrors.billingState}</div>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">ZIP Code</label>
                      <input
                        type="text"
                        className={`form-input ${formErrors.billingZip ? 'error' : ''}`}
                        value={newCardForm.billingZip}
                        onChange={e =>
                          setNewCardForm(prev => ({ ...prev, billingZip: e.target.value }))
                        }
                        placeholder="12345"
                        maxLength={10}
                        autoComplete="billing postal-code"
                      />
                      {formErrors.billingZip && (
                        <div className="error-message">{formErrors.billingZip}</div>
                      )}
                    </div>

                    <div className="checkbox-group">
                      <input
                        type="checkbox"
                        id="saveCard"
                        checked={newCardForm.saveCard}
                        onChange={e =>
                          setNewCardForm(prev => ({ ...prev, saveCard: e.target.checked }))
                        }
                      />
                      <label htmlFor="saveCard" className="checkbox-label">
                        Save this card for future payments
                      </label>
                    </div>
                  </>
                )}

                <button
                  className="submit-btn"
                  onClick={handleMakePayment}
                  disabled={processing}
                  style={{ marginTop: '1.5rem' }}
                >
                  {processing ? (
                    <>
                      <span style={{ marginRight: '0.5rem' }}>Processing...</span>
                    </>
                  ) : (
                    `Pay ${paymentAmount ? formatCurrency(parseFloat(paymentAmount) || 0) : '$0.00'}`
                  )}
                </button>

                <p style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>
                  Your payment is secured with 256-bit SSL encryption
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </PatientPortalLayout>
  );
}
