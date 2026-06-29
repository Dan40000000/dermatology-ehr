import type { CSSProperties } from 'react';
import { Copy, ExternalLink, MailCheck, Printer, X } from 'lucide-react';

interface BillStatementBill {
  id: string;
  billNumber?: string;
  billPayCode?: string;
  accountEnding?: string;
  accountNumber?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientEmail?: string;
  patientPhone?: string;
  patientAddress?: string;
  patientCity?: string;
  patientState?: string;
  patientZip?: string;
  payerName?: string;
  billDate?: string;
  dueDate?: string;
  serviceDateStart?: string;
  serviceDateEnd?: string;
  totalChargesCents?: number;
  insuranceResponsibilityCents?: number;
  patientResponsibilityCents?: number;
  paidAmountCents?: number;
  adjustmentAmountCents?: number;
  balanceCents?: number;
  status?: string;
  lastStatementSentAt?: string;
}

interface BillStatementLineItem {
  id: string;
  serviceDate?: string;
  cptCode?: string;
  description?: string;
  quantity?: number;
  unitPriceCents?: number;
  totalCents?: number;
  icdCodes?: string[];
}

interface BillStatementModalProps {
  bill: BillStatementBill;
  lineItems: BillStatementLineItem[];
  payUrl: string;
  onClose: () => void;
  onPrint: () => Promise<void>;
  onCopyPayLink: () => Promise<void>;
  onMarkMailed: () => Promise<void>;
  printing?: boolean;
  markingMailed?: boolean;
}

function formatCurrency(cents?: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents) || 0) / 100);
}

function formatDate(value?: string | null): string {
  if (!value) return '--';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function patientName(bill: BillStatementBill): string {
  return [bill.patientFirstName, bill.patientLastName].filter(Boolean).join(' ') || 'Patient';
}

function mailingAddressLines(bill: BillStatementBill): string[] {
  const cityStateZip = [
    bill.patientCity,
    [bill.patientState, bill.patientZip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');

  return [
    patientName(bill),
    bill.patientAddress,
    cityStateZip,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

function hasMailingAddress(bill: BillStatementBill): boolean {
  return Boolean(bill.patientAddress && (bill.patientCity || bill.patientState || bill.patientZip));
}

function buildPrintableStatementHtml(bill: BillStatementBill, lineItems: BillStatementLineItem[], payUrl: string): string {
  const rows = lineItems.length
    ? lineItems.map((item) => `
      <tr>
        <td>${escapeHtml(formatDate(item.serviceDate))}</td>
        <td>${escapeHtml(item.cptCode || '--')}</td>
        <td>${escapeHtml(item.description || 'Bill line item')}</td>
        <td class="right">${escapeHtml(String(item.quantity || 1))}</td>
        <td class="right">${escapeHtml(formatCurrency(item.totalCents))}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="5" class="empty">No separate line items were recorded for this bill.</td></tr>`;

  const address = mailingAddressLines(bill).map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(bill.billNumber || 'Patient Bill')}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 32px; background: #fff; }
        .statement { max-width: 820px; margin: 0 auto; }
        .top { display: flex; justify-content: space-between; gap: 32px; border-bottom: 3px solid #0f766e; padding-bottom: 18px; }
        .practice h1 { margin: 0 0 6px; font-size: 24px; color: #0f3f3a; }
        .practice div, .meta div, .address div { line-height: 1.45; font-size: 13px; }
        .meta { text-align: right; min-width: 230px; }
        .meta strong { display: block; font-size: 22px; color: #111827; margin-bottom: 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0; }
        .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; min-height: 112px; }
        .box h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #4b5563; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
        th { background: #f3f4f6; color: #374151; text-align: left; padding: 10px; border-bottom: 1px solid #d1d5db; }
        td { padding: 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .right { text-align: right; }
        .empty { text-align: center; color: #6b7280; padding: 20px; }
        .summary { margin-left: auto; width: 330px; margin-top: 20px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
        .summary div { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
        .summary div:last-child { border-bottom: 0; background: #ecfdf5; font-size: 18px; font-weight: 800; color: #065f46; }
        .pay { margin-top: 28px; border: 2px solid #0f766e; border-radius: 10px; padding: 16px; background: #f0fdfa; }
        .pay h2 { margin: 0 0 10px; color: #0f3f3a; font-size: 18px; }
        .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; font-size: 13px; }
        .pay-code { font-size: 20px; font-weight: 800; letter-spacing: .08em; }
        .footer { margin-top: 28px; color: #4b5563; font-size: 12px; line-height: 1.5; }
        @media print {
          body { padding: 0.4in; }
          .statement { max-width: none; }
        }
      </style>
    </head>
    <body>
      <main class="statement">
        <section class="top">
          <div class="practice">
            <h1>Dermatology DEMO Office</h1>
            <div>Billing Office</div>
            <div>123 Medical Center Dr</div>
            <div>Phone: (555) 123-4567</div>
          </div>
          <div class="meta">
            <strong>Patient Statement</strong>
            <div>Bill: ${escapeHtml(bill.billNumber || bill.id)}</div>
            <div>Bill Date: ${escapeHtml(formatDate(bill.billDate))}</div>
            <div>Due Date: ${escapeHtml(formatDate(bill.dueDate))}</div>
          </div>
        </section>

        <section class="grid">
          <div class="box address">
            <h2>Mail To</h2>
            ${address || '<div>No mailing address on file</div>'}
          </div>
          <div class="box">
            <h2>Account</h2>
            <div>Patient: ${escapeHtml(patientName(bill))}</div>
            <div>Account ending: ${escapeHtml(bill.accountEnding || '--')}</div>
            <div>Payer: ${escapeHtml(bill.payerName || 'Self-pay')}</div>
            <div>Status: ${escapeHtml(bill.status || 'new')}</div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th>Service Date</th>
              <th>Code</th>
              <th>Description</th>
              <th class="right">Qty</th>
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <section class="summary">
          <div><span>Total charges</span><strong>${escapeHtml(formatCurrency(bill.totalChargesCents))}</strong></div>
          <div><span>Insurance responsibility</span><strong>${escapeHtml(formatCurrency(bill.insuranceResponsibilityCents))}</strong></div>
          <div><span>Patient responsibility</span><strong>${escapeHtml(formatCurrency(bill.patientResponsibilityCents))}</strong></div>
          <div><span>Paid / adjustments</span><strong>${escapeHtml(formatCurrency((bill.paidAmountCents || 0) + (bill.adjustmentAmountCents || 0)))}</strong></div>
          <div><span>Balance due</span><strong>${escapeHtml(formatCurrency(bill.balanceCents))}</strong></div>
        </section>

        <section class="pay">
          <h2>Payment Options</h2>
          <div class="pay-grid">
            <div>
              <div>Pay online</div>
              <strong>${escapeHtml(payUrl)}</strong>
            </div>
            <div>
              <div>Bill pay code</div>
              <div class="pay-code">${escapeHtml(bill.billPayCode || '--')}</div>
            </div>
            <div>Account verification: last 4 characters of account number</div>
            <div><strong>${escapeHtml(bill.accountEnding || '--')}</strong></div>
          </div>
        </section>

        <section class="footer">
          Please contact the billing office if this statement looks incorrect or if you need a payment plan.
          This statement is for payment convenience and does not replace payer explanation of benefits.
        </section>
      </main>
      <script>window.addEventListener('load', () => window.print());</script>
    </body>
  </html>`;
}

export function openPrintableBillStatement(bill: BillStatementBill, lineItems: BillStatementLineItem[], payUrl: string): void {
  const printWindow = window.open('', '_blank', 'width=920,height=1100');
  if (!printWindow) {
    throw new Error('Pop-up was blocked. Allow pop-ups to print this statement.');
  }
  printWindow.document.open();
  printWindow.document.write(buildPrintableStatementHtml(bill, lineItems, payUrl));
  printWindow.document.close();
}

export function BillStatementModal({
  bill,
  lineItems,
  payUrl,
  onClose,
  onPrint,
  onCopyPayLink,
  onMarkMailed,
  printing,
  markingMailed,
}: BillStatementModalProps) {
  const addressLines = mailingAddressLines(bill);
  const canMarkMailed = hasMailingAddress(bill);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Print and mail bill statement"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(1120px, 96vw)',
          maxHeight: '92vh',
          overflow: 'hidden',
          background: '#f8fafc',
          borderRadius: 10,
          boxShadow: '0 28px 80px rgba(15, 23, 42, 0.35)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #dbe4ef',
            background: 'white',
          }}
        >
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
              Print / Mail Statement
            </div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>
              {bill.billNumber || bill.id} · {patientName(bill)}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCopyPayLink}
              title="Copy patient payment link"
              style={toolbarButtonStyle('#ecfdf5', '#047857', '#a7f3d0')}
            >
              <Copy size={16} aria-hidden="true" />
              Copy Pay Link
            </button>
            <button
              type="button"
              onClick={onPrint}
              disabled={printing}
              title="Open printable statement"
              style={toolbarButtonStyle('#eff6ff', '#1d4ed8', '#bfdbfe', printing)}
            >
              <Printer size={16} aria-hidden="true" />
              {printing ? 'Opening...' : 'Print'}
            </button>
            <button
              type="button"
              onClick={onMarkMailed}
              disabled={!canMarkMailed || markingMailed}
              title={canMarkMailed ? 'Mark this printed statement as mailed' : 'Add a mailing address before marking mailed'}
              style={toolbarButtonStyle('#fff7ed', '#c2410c', '#fed7aa', !canMarkMailed || markingMailed)}
            >
              <MailCheck size={16} aria-hidden="true" />
              {markingMailed ? 'Saving...' : 'Mark Mailed'}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close statement preview"
              aria-label="Close statement preview"
              style={{
                width: 38,
                height: 38,
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#334155',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div style={{ overflow: 'auto', padding: '1.25rem' }}>
          {!canMarkMailed && (
            <div style={{
              marginBottom: '1rem',
              border: '1px solid #fbbf24',
              background: '#fffbeb',
              color: '#92400e',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              fontWeight: 700,
            }}>
              Add a patient mailing address before marking this statement as mailed.
            </div>
          )}

          <section style={{
            background: 'white',
            border: '1px solid #dbe4ef',
            borderRadius: 8,
            padding: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', borderBottom: '3px solid #0f766e', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem', color: '#0f3f3a', fontSize: '1.4rem' }}>Dermatology DEMO Office</h3>
                <div style={{ color: '#475569', lineHeight: 1.5 }}>Billing Office</div>
                <div style={{ color: '#475569', lineHeight: 1.5 }}>123 Medical Center Dr</div>
                <div style={{ color: '#475569', lineHeight: 1.5 }}>Phone: (555) 123-4567</div>
              </div>
              <div style={{ textAlign: 'right', color: '#475569', lineHeight: 1.6 }}>
                <div style={{ color: '#111827', fontSize: '1.45rem', fontWeight: 900 }}>Patient Statement</div>
                <div>Bill: {bill.billNumber || bill.id}</div>
                <div>Bill Date: {formatDate(bill.billDate)}</div>
                <div>Due Date: {formatDate(bill.dueDate)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
              <div style={previewBoxStyle}>
                <div style={boxTitleStyle}>Mail To</div>
                {addressLines.length > 0 ? addressLines.map((line) => (
                  <div key={line} style={{ lineHeight: 1.5 }}>{line}</div>
                )) : <div style={{ color: '#991b1b', fontWeight: 700 }}>No mailing address on file</div>}
              </div>
              <div style={previewBoxStyle}>
                <div style={boxTitleStyle}>Account</div>
                <div>Patient: {patientName(bill)}</div>
                <div>Account ending: {bill.accountEnding || '--'}</div>
                <div>Payer: {bill.payerName || 'Self-pay'}</div>
                <div>Status: {bill.status || 'new'}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1.25rem', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#334155' }}>
                  <th style={thStyle}>Service Date</th>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                      No separate line items were recorded for this bill.
                    </td>
                  </tr>
                ) : lineItems.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{formatDate(item.serviceDate)}</td>
                    <td style={tdStyle}>{item.cptCode || '--'}</td>
                    <td style={tdStyle}>{item.description || 'Bill line item'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{item.quantity || 1}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatCurrency(item.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{
              width: 'min(360px, 100%)',
              marginLeft: 'auto',
              marginTop: '1.25rem',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {[
                ['Total charges', formatCurrency(bill.totalChargesCents)],
                ['Insurance responsibility', formatCurrency(bill.insuranceResponsibilityCents)],
                ['Patient responsibility', formatCurrency(bill.patientResponsibilityCents)],
                ['Paid / adjustments', formatCurrency((bill.paidAmountCents || 0) + (bill.adjustmentAmountCents || 0))],
              ].map(([label, value]) => (
                <div key={label} style={summaryRowStyle}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <div style={{ ...summaryRowStyle, background: '#ecfdf5', color: '#065f46', fontSize: '1.1rem' }}>
                <span>Balance due</span>
                <strong>{formatCurrency(bill.balanceCents)}</strong>
              </div>
            </div>

            <div style={{
              marginTop: '1.25rem',
              border: '2px solid #0f766e',
              borderRadius: 8,
              background: '#f0fdfa',
              padding: '1rem',
            }}>
              <div style={{ fontWeight: 900, color: '#0f3f3a', marginBottom: '0.6rem' }}>Payment Options</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: '1rem', color: '#334155' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase' }}>Pay online</div>
                  <a href={payUrl} target="_blank" rel="noreferrer" style={{ color: '#0f766e', fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {payUrl} <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase' }}>Bill pay code</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.08em' }}>{bill.billPayCode || '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase' }}>Account last 4</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{bill.accountEnding || '--'}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function toolbarButtonStyle(background: string, color: string, borderColor: string, disabled = false): CSSProperties {
  return {
    minHeight: 38,
    padding: '0.5rem 0.75rem',
    background: disabled ? '#f1f5f9' : background,
    color: disabled ? '#94a3b8' : color,
    border: `1px solid ${disabled ? '#e2e8f0' : borderColor}`,
    borderRadius: 8,
    fontSize: '0.82rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
  };
}

const previewBoxStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '0.9rem',
  minHeight: 108,
  color: '#334155',
};

const boxTitleStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: '#64748b',
  fontWeight: 900,
  textTransform: 'uppercase',
  marginBottom: '0.55rem',
};

const thStyle: CSSProperties = {
  padding: '0.7rem',
  textAlign: 'left',
  borderBottom: '1px solid #cbd5e1',
};

const tdStyle: CSSProperties = {
  padding: '0.7rem',
  borderBottom: '1px solid #e2e8f0',
  color: '#334155',
  verticalAlign: 'top',
};

const summaryRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.72rem 0.85rem',
  borderBottom: '1px solid #e5e7eb',
  color: '#334155',
};
