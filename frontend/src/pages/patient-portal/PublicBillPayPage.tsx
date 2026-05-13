import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/apiBase';

interface PublicBill {
  billNumber: string;
  billPayCode: string;
  billDate?: string | null;
  dueDate?: string | null;
  status: string;
  patientDisplayName: string;
  accountEnding?: string | null;
  patientResponsibilityCents: number;
  paidAmountCents: number;
  balanceCents: number;
}

interface PaymentResult {
  success: boolean;
  transactionId: string;
  receiptNumber: string;
  amount: number;
  bill: PublicBill;
}

function normalizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 7);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents) || 0) / 100);
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function lookupPublicBillPay(code: string, accountVerifier: string): Promise<{ bill: PublicBill }> {
  const params = new URLSearchParams({ code, accountVerifier });
  const res = await fetch(`${API_BASE_URL}/api/public-bill-pay/lookup?${params.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Bill pay code was not found');
  }
  return body;
}

async function payPublicBill(code: string, accountVerifier: string, amount: number): Promise<PaymentResult> {
  const res = await fetch(`${API_BASE_URL}/api/public-bill-pay/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, accountVerifier, amount, demoPaymentMethod: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Payment failed');
  }
  return body;
}

export function PublicBillPayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState(normalizeCode(searchParams.get('code') || ''));
  const [accountVerifier, setAccountVerifier] = useState((searchParams.get('account') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-4));
  const [bill, setBill] = useState<PublicBill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const amountNumber = useMemo(() => Number.parseFloat(paymentAmount), [paymentAmount]);

  async function handleLookup(nextCode = code) {
    const normalized = normalizeCode(nextCode);
    if (!/^\d{7}$/.test(normalized)) {
      setError('Enter the 7-digit bill pay code from the statement.');
      return;
    }
    const normalizedVerifier = accountVerifier.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-4);
    if (!/^[A-Z0-9]{4}$/.test(normalizedVerifier)) {
      setError('Enter the last 4 characters of the account number from the statement.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await lookupPublicBillPay(normalized, normalizedVerifier);
      setBill(response.bill);
      setCode(normalized);
      setAccountVerifier(normalizedVerifier);
      setPaymentAmount((response.bill.balanceCents / 100).toFixed(2));
      setSearchParams({ code: normalized, account: normalizedVerifier });
    } catch (lookupError) {
      setBill(null);
      setError(lookupError instanceof Error ? lookupError.message : 'Bill pay code was not found');
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    if (!bill || paying) return;
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    if (Math.round(amountNumber * 100) > bill.balanceCents) {
      setError('Payment amount cannot exceed the current balance.');
      return;
    }

    setPaying(true);
    setError(null);
    try {
      const paymentResult = await payPublicBill(bill.billPayCode, accountVerifier, amountNumber);
      setResult(paymentResult);
      setBill(paymentResult.bill);
      setPaymentAmount(paymentResult.bill.balanceCents > 0 ? (paymentResult.bill.balanceCents / 100).toFixed(2) : '');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  useEffect(() => {
    const initialCode = normalizeCode(searchParams.get('code') || '');
    if (initialCode && !bill && !loading) {
      void handleLookup(initialCode);
    }
    // Run once from the incoming URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="public-bill-pay-page">
      <div className="bill-pay-shell">
        <section className="bill-pay-hero">
          <div className="bill-pay-badge">Secure Bill Pay</div>
          <h1>Pay a Dermatology Bill</h1>
          <p>
            Enter the bill pay code from the statement or payment link. No patient portal
            account is required for this payment flow.
          </p>
          <div className="bill-pay-disclaimer">
            Demo mode posts a test payment into the practice ledger without collecting card numbers.
          </div>
        </section>

        <section className="bill-pay-card">
          <label className="bill-pay-label" htmlFor="billPayCode">Bill pay code</label>
          <div className="bill-pay-code-row">
            <input
              id="billPayCode"
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              placeholder="Example: 1000029"
              className="bill-pay-input"
              inputMode="numeric"
              maxLength={7}
              autoComplete="one-time-code"
            />
            <input
              id="billPayAccount"
              value={accountVerifier}
              onChange={(event) => setAccountVerifier(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-4))}
              placeholder="Account last 4"
              className="bill-pay-input"
              maxLength={4}
              autoComplete="off"
            />
            <button type="button" onClick={() => handleLookup()} disabled={loading} className="bill-pay-button secondary">
              {loading ? 'Looking up...' : 'Find Bill'}
            </button>
          </div>

          {error && <div className="bill-pay-error">{error}</div>}

          {bill && (
            <div className="bill-summary-card">
              <div className="bill-summary-header">
                <div>
                  <div className="bill-summary-kicker">Bill {bill.billNumber}</div>
                  <h2>{bill.patientDisplayName}</h2>
                  {bill.accountEnding && <p>Account ending {bill.accountEnding}</p>}
                </div>
                <span className={`bill-status ${bill.status === 'paid' ? 'paid' : 'open'}`}>
                  {bill.status}
                </span>
              </div>

              <div className="bill-summary-grid">
                <div>
                  <span>Total patient responsibility</span>
                  <strong>{formatCurrency(bill.patientResponsibilityCents)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{formatCurrency(bill.paidAmountCents)}</strong>
                </div>
                <div>
                  <span>Balance</span>
                  <strong>{formatCurrency(bill.balanceCents)}</strong>
                </div>
                <div>
                  <span>Due date</span>
                  <strong>{formatDate(bill.dueDate)}</strong>
                </div>
              </div>

              {bill.balanceCents > 0 ? (
                <div className="payment-panel">
                  <label className="bill-pay-label" htmlFor="paymentAmount">Payment amount</label>
                  <div className="bill-pay-code-row">
                    <input
                      id="paymentAmount"
                      type="number"
                      min="1"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      className="bill-pay-input"
                    />
                    <button type="button" onClick={handlePayment} disabled={paying} className="bill-pay-button primary">
                      {paying ? 'Posting...' : 'Pay Now'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bill-paid-message">This bill is paid in full.</div>
              )}
            </div>
          )}

          {result && (
            <div className="bill-pay-success">
              <strong>Payment posted.</strong>
              <span>Receipt {result.receiptNumber} for {formatCurrency(Math.round(result.amount * 100))}</span>
            </div>
          )}

          <Link to="/portal/login" className="portal-link">Have a portal account? Sign in here.</Link>
        </section>
      </div>

      <style>{`
        .public-bill-pay-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at 12% 10%, rgba(20, 184, 166, 0.22), transparent 32%),
            radial-gradient(circle at 82% 18%, rgba(251, 146, 60, 0.18), transparent 30%),
            linear-gradient(135deg, #f7fbf8 0%, #eef7f4 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          color: #12322d;
        }

        .bill-pay-shell {
          width: min(1040px, 100%);
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 28px;
          align-items: stretch;
        }

        .bill-pay-hero,
        .bill-pay-card {
          border-radius: 28px;
          border: 1px solid rgba(18, 50, 45, 0.12);
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 24px 70px rgba(15, 43, 37, 0.13);
          backdrop-filter: blur(14px);
        }

        .bill-pay-hero {
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background:
            linear-gradient(150deg, rgba(18, 50, 45, 0.94), rgba(21, 94, 83, 0.9)),
            #12322d;
          color: #f8fffc;
        }

        .bill-pay-badge {
          width: fit-content;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 24px;
        }

        .bill-pay-hero h1 {
          font-size: clamp(2.35rem, 5vw, 4.4rem);
          line-height: 0.95;
          margin: 0 0 18px;
          letter-spacing: -0.07em;
        }

        .bill-pay-hero p {
          font-size: 1.05rem;
          line-height: 1.6;
          color: rgba(248, 255, 252, 0.82);
          margin: 0;
        }

        .bill-pay-disclaimer {
          margin-top: 30px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(248, 255, 252, 0.85);
          line-height: 1.45;
        }

        .bill-pay-card {
          padding: 32px;
        }

        .bill-pay-label {
          display: block;
          font-size: 0.82rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #42645e;
          margin-bottom: 10px;
        }

        .bill-pay-code-row {
          display: flex;
          gap: 12px;
        }

        .bill-pay-input {
          flex: 1;
          border: 1px solid #cbd8d3;
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 1rem;
          color: #12322d;
          background: white;
          outline: none;
        }

        .bill-pay-input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
        }

        .bill-pay-button {
          border: none;
          border-radius: 14px;
          padding: 0 20px;
          font-weight: 800;
          cursor: pointer;
          min-height: 50px;
        }

        .bill-pay-button.primary {
          background: #0f766e;
          color: white;
        }

        .bill-pay-button.secondary {
          background: #173f38;
          color: white;
        }

        .bill-pay-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bill-pay-error,
        .bill-pay-success,
        .bill-paid-message {
          margin-top: 16px;
          border-radius: 14px;
          padding: 14px 16px;
          line-height: 1.45;
        }

        .bill-pay-error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }

        .bill-pay-success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
          display: grid;
          gap: 4px;
        }

        .bill-summary-card {
          margin-top: 24px;
          border: 1px solid #dbe7e2;
          border-radius: 22px;
          padding: 22px;
          background: #fbfefc;
        }

        .bill-summary-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }

        .bill-summary-kicker {
          font-size: 0.78rem;
          color: #6b817c;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .bill-summary-header h2 {
          margin: 4px 0;
          font-size: 1.6rem;
        }

        .bill-summary-header p {
          margin: 0;
          color: #6b817c;
        }

        .bill-status {
          height: fit-content;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.78rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .bill-status.paid {
          background: #dcfce7;
          color: #166534;
        }

        .bill-status.open {
          background: #ffedd5;
          color: #9a3412;
        }

        .bill-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .bill-summary-grid div {
          border-radius: 16px;
          background: white;
          border: 1px solid #e2ebe7;
          padding: 14px;
        }

        .bill-summary-grid span {
          display: block;
          color: #6b817c;
          font-size: 0.82rem;
          margin-bottom: 6px;
        }

        .bill-summary-grid strong {
          font-size: 1.1rem;
        }

        .payment-panel {
          margin-top: 20px;
        }

        .portal-link {
          display: inline-block;
          margin-top: 18px;
          color: #0f766e;
          font-weight: 700;
          text-decoration: none;
        }

        @media (max-width: 860px) {
          .bill-pay-shell {
            grid-template-columns: 1fr;
          }

          .bill-pay-code-row {
            flex-direction: column;
          }

          .bill-pay-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
