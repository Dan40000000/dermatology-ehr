import { useState } from 'react';
import type { CartItem, PaymentMethod } from '../../types';

interface SalesCartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: (paymentMethod: PaymentMethod, discountAmount?: number) => void;
  isProcessing?: boolean;
}

export function SalesCart({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  isProcessing = false,
}: SalesCartProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit');
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<string>('');

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

  const calculateDiscount = () => {
    if (discountType === 'none' || !discountValue) return 0;
    const value = parseFloat(discountValue);
    if (isNaN(value) || value < 0) return 0;

    if (discountType === 'percentage') {
      return Math.round(subtotal * (Math.min(value, 100) / 100));
    } else {
      return Math.round(Math.min(value * 100, subtotal));
    }
  };

  const discount = calculateDiscount();
  const taxableAmount = subtotal - discount;
  const tax = Math.round(taxableAmount * TAX_RATE);
  const total = taxableAmount + tax;

  const handleCheckout = () => {
    onCheckout(paymentMethod, discount);
  };

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <div className="empty-icon">[ ]</div>
        <p>Cart is empty</p>
        <span className="muted">Add products to start a sale</span>

        <style>{`
          .cart-empty {
            padding: 3rem 1.5rem;
            text-align: center;
            color: #6b7280;
          }

          .empty-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
            opacity: 0.5;
          }

          .cart-empty p {
            margin: 0 0 0.5rem 0;
            font-weight: 500;
            color: #374151;
          }

          .muted {
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sales-cart">
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <div className="item-info">
              <span className="item-name">{item.name}</span>
              {item.brand && <span className="item-brand">{item.brand}</span>}
              <span className="item-price">{formatCurrency(item.price)} each</span>
            </div>
            <div className="item-controls">
              <div className="quantity-controls">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                >
                  -
                </button>
                <span className="quantity">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  disabled={item.quantity >= item.inventoryCount}
                >
                  +
                </button>
              </div>
              <span className="line-total">
                {formatCurrency(item.price * item.quantity)}
              </span>
              <button
                type="button"
                className="btn-remove"
                onClick={() => onRemoveItem(item.id)}
                aria-label="Remove item"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-discount">
        <label>Discount</label>
        <div className="discount-controls">
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as 'none' | 'percentage' | 'fixed')}
          >
            <option value="none">No Discount</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount ($)</option>
          </select>
          {discountType !== 'none' && (
            <input
              type="number"
              min="0"
              step={discountType === 'percentage' ? '1' : '0.01'}
              max={discountType === 'percentage' ? '100' : undefined}
              placeholder={discountType === 'percentage' ? '10' : '5.00'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="cart-summary">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="summary-row discount">
            <span>Discount</span>
            <span>-{formatCurrency(discount)}</span>
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
      </div>

      <div className="cart-payment">
        <label>Payment Method</label>
        <div className="payment-options">
          {(['credit', 'debit', 'cash', 'check'] as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              className={`payment-option ${paymentMethod === method ? 'selected' : ''}`}
              onClick={() => setPaymentMethod(method)}
            >
              {method.charAt(0).toUpperCase() + method.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-checkout"
        onClick={handleCheckout}
        disabled={isProcessing || items.length === 0}
      >
        {isProcessing ? 'Processing...' : `Complete Sale - ${formatCurrency(total)}`}
      </button>

      <style>{`
        .sales-cart {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .cart-items {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .cart-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 0.75rem 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .cart-item:last-child {
          border-bottom: none;
        }

        .item-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .item-name {
          font-weight: 500;
          color: #1f2937;
        }

        .item-brand {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .item-price {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .item-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .quantity-controls {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: #f3f4f6;
          border-radius: 6px;
          padding: 0.125rem;
        }

        .quantity-controls button {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quantity-controls button:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .quantity-controls button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quantity {
          width: 28px;
          text-align: center;
          font-weight: 500;
        }

        .line-total {
          font-weight: 600;
          color: #059669;
          min-width: 70px;
          text-align: right;
        }

        .btn-remove {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: #9ca3af;
          font-size: 1rem;
          cursor: pointer;
          transition: color 0.15s ease;
        }

        .btn-remove:hover {
          color: #dc2626;
        }

        .cart-discount {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .cart-discount label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .discount-controls {
          display: flex;
          gap: 0.5rem;
        }

        .discount-controls select,
        .discount-controls input {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .discount-controls select {
          flex: 1;
        }

        .discount-controls input {
          width: 80px;
        }

        .cart-summary {
          padding: 1rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          font-size: 0.875rem;
          color: #4b5563;
        }

        .summary-row.discount {
          color: #059669;
        }

        .summary-row.total {
          padding-top: 0.75rem;
          margin-top: 0.5rem;
          border-top: 1px solid #e5e7eb;
          font-size: 1.125rem;
          font-weight: 700;
          color: #1f2937;
        }

        .cart-payment {
          padding: 1rem;
        }

        .cart-payment label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .payment-options {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
        }

        .payment-option {
          padding: 0.625rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #4b5563;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .payment-option:hover {
          border-color: #2563eb;
        }

        .payment-option.selected {
          background: #eff6ff;
          border-color: #2563eb;
          color: #2563eb;
        }

        .btn-checkout {
          margin: 1rem;
          padding: 1rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-checkout:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .btn-checkout:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
