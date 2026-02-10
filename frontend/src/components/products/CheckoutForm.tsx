import { useState } from 'react';
import type { Patient, CartItem, PaymentMethod, Sale } from '../../types';
import { Modal } from '../ui';

interface CheckoutFormProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  discountAmount: number;
  onConfirm: () => Promise<Sale | null>;
  isProcessing: boolean;
}

export function CheckoutForm({
  isOpen,
  onClose,
  patient,
  items,
  paymentMethod,
  discountAmount,
  onConfirm,
  isProcessing,
}: CheckoutFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  const TAX_RATE = 0.0825;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const subtotal = items.reduce(
    (sum, item) => sum + (item.price * item.quantity) - (item.discountAmount || 0),
    0
  );
  const taxableAmount = subtotal - discountAmount;
  const tax = Math.round(taxableAmount * TAX_RATE);
  const total = taxableAmount + tax;

  const handleConfirm = async () => {
    setError(null);
    try {
      const sale = await onConfirm();
      if (sale) {
        setCompletedSale(sale);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process sale');
    }
  };

  const handleClose = () => {
    setError(null);
    setCompletedSale(null);
    onClose();
  };

  if (!isOpen) return null;

  if (completedSale) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Sale Complete" size="md">
        <div className="sale-complete">
          <div className="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>Sale Completed Successfully</h3>
          <div className="sale-details">
            <p><strong>Sale ID:</strong> {completedSale.id.substring(0, 8)}...</p>
            <p><strong>Total:</strong> {formatCurrency(completedSale.total)}</p>
            <p><strong>Payment:</strong> {completedSale.paymentMethod}</p>
            <p><strong>Items:</strong> {completedSale.items?.length || items.length}</p>
          </div>
          <div className="complete-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Close
            </button>
            <button type="button" className="btn-primary" onClick={() => window.print()}>
              Print Receipt
            </button>
          </div>
        </div>

        <style>{`
          .sale-complete {
            text-align: center;
            padding: 1.5rem;
          }

          .success-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1rem;
            color: #10b981;
          }

          .success-icon svg {
            width: 100%;
            height: 100%;
          }

          .sale-complete h3 {
            margin: 0 0 1.5rem 0;
            color: #10b981;
          }

          .sale-details {
            background: #f9fafb;
            border-radius: 8px;
            padding: 1rem;
            text-align: left;
            margin-bottom: 1.5rem;
          }

          .sale-details p {
            margin: 0.5rem 0;
            font-size: 0.875rem;
          }

          .complete-actions {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
          }

          .btn-secondary {
            padding: 0.75rem 1.5rem;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            color: #374151;
            font-weight: 500;
            cursor: pointer;
          }

          .btn-secondary:hover {
            background: #f3f4f6;
          }

          .btn-primary {
            padding: 0.75rem 1.5rem;
            background: #2563eb;
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            cursor: pointer;
          }

          .btn-primary:hover {
            background: #1d4ed8;
          }
        `}</style>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Confirm Sale" size="md">
      <div className="checkout-form">
        {!patient ? (
          <div className="no-patient-warning">
            <strong>Warning:</strong> No patient selected. Please select a patient before completing the sale.
          </div>
        ) : (
          <div className="patient-info">
            <h4>Patient</h4>
            <p>{patient.firstName} {patient.lastName}</p>
            {patient.email && <p className="muted">{patient.email}</p>}
          </div>
        )}

        <div className="items-summary">
          <h4>Items ({items.length})</h4>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    {item.brand && <span className="brand"> - {item.brand}</span>}
                  </td>
                  <td className="center">{item.quantity}</td>
                  <td className="right">{formatCurrency(item.price)}</td>
                  <td className="right">{formatCurrency(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="payment-summary">
          <h4>Payment Summary</h4>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="summary-row discount">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="summary-row">
            <span>Tax (8.25%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="payment-method">
            <span>Payment Method:</span>
            <span className="method">{paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</span>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            onClick={handleConfirm}
            disabled={isProcessing || !patient}
          >
            {isProcessing ? 'Processing...' : `Confirm Sale - ${formatCurrency(total)}`}
          </button>
        </div>
      </div>

      <style>{`
        .checkout-form {
          padding: 0.5rem;
        }

        .no-patient-warning {
          padding: 1rem;
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 8px;
          color: #92400e;
          margin-bottom: 1.5rem;
        }

        .patient-info {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .patient-info h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #6b7280;
        }

        .patient-info p {
          margin: 0;
        }

        .patient-info .muted {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .items-summary {
          margin-bottom: 1.5rem;
        }

        .items-summary h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          color: #374151;
        }

        .items-summary table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .items-summary th {
          text-align: left;
          padding: 0.5rem;
          background: #f3f4f6;
          font-weight: 500;
          color: #374151;
        }

        .items-summary td {
          padding: 0.5rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .items-summary .brand {
          color: #6b7280;
          font-size: 0.75rem;
        }

        .center {
          text-align: center;
        }

        .right {
          text-align: right;
        }

        .payment-summary {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .payment-summary h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          color: #374151;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          font-size: 0.875rem;
        }

        .summary-row.discount {
          color: #10b981;
        }

        .summary-row.total {
          padding-top: 0.75rem;
          margin-top: 0.5rem;
          border-top: 1px solid #e5e7eb;
          font-weight: 700;
          font-size: 1rem;
        }

        .payment-method {
          display: flex;
          justify-content: space-between;
          padding-top: 0.75rem;
          margin-top: 0.5rem;
          border-top: 1px solid #e5e7eb;
          font-size: 0.875rem;
        }

        .payment-method .method {
          font-weight: 600;
          color: #2563eb;
        }

        .error-message {
          padding: 0.75rem 1rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #dc2626;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .form-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }

        .btn-cancel {
          padding: 0.75rem 1.5rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          color: #374151;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-cancel:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .btn-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-confirm {
          padding: 0.75rem 1.5rem;
          background: #2563eb;
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-confirm:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .btn-confirm:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </Modal>
  );
}
