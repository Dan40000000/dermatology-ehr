import crypto from "crypto";
import type { PoolClient } from "pg";

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function paymentMethodToLedgerMethod(
  paymentMethodType?: string,
): "cash" | "credit" | "debit" | "check" | "ach" | "other" {
  switch (paymentMethodType) {
    case "credit_card":
      return "credit";
    case "debit_card":
      return "debit";
    case "ach":
    case "bank_account":
      return "ach";
    default:
      return "other";
  }
}

export async function postPortalPaymentToLedger(
  client: PoolClient,
  params: {
    tenantId: string;
    patientId: string;
    amountCents: number;
    paymentMethodType: string;
    cardLastFour?: string | null;
    processorTransactionId: string;
    receiptNumber: string;
    transactionId: string;
    description?: string | null;
    invoiceId?: string | null;
  },
): Promise<{ appliedCents: number; unappliedCents: number; paymentIds: string[] }> {
  const paymentIds: string[] = [];
  let remainingCents = params.amountCents;
  let appliedCents = 0;
  const paymentMethod = paymentMethodToLedgerMethod(params.paymentMethodType);
  const notes = [
    params.description || "Patient payment",
    `Portal transaction ${params.transactionId}`,
  ].join(" | ");

  const billsResult = await client.query(
    `SELECT id, patient_responsibility_cents, paid_amount_cents, adjustment_amount_cents, balance_cents
     FROM bills
     WHERE tenant_id = $1
       AND patient_id = $2
       AND status NOT IN ('paid', 'written_off', 'cancelled')
       AND balance_cents > 0
       AND ($3::text IS NULL OR id = $3)
     ORDER BY due_date NULLS LAST, bill_date, created_at
     FOR UPDATE`,
    [params.tenantId, params.patientId, params.invoiceId || null],
  );

  for (const bill of billsResult.rows) {
    if (remainingCents <= 0) break;

    const billBalanceCents = Math.max(0, Number(bill.balance_cents || 0));
    const appliedToBillCents = Math.min(remainingCents, billBalanceCents);
    if (appliedToBillCents <= 0) continue;

    const paymentId = crypto.randomUUID();
    paymentIds.push(paymentId);
    await client.query(
      `INSERT INTO patient_payments(
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, card_last_four, reference_number, receipt_number,
        applied_to_invoice_id, status, notes, processed_by
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, 'posted', $10, NULL)`,
      [
        paymentId,
        params.tenantId,
        params.patientId,
        appliedToBillCents,
        paymentMethod,
        params.cardLastFour || null,
        params.processorTransactionId,
        params.receiptNumber,
        bill.id,
        notes,
      ],
    );

    const paidAmountCents = Number(bill.paid_amount_cents || 0) + appliedToBillCents;
    const adjustmentAmountCents = Number(bill.adjustment_amount_cents || 0);
    const patientResponsibilityCents = Number(bill.patient_responsibility_cents || 0);
    const balanceCents = Math.max(0, patientResponsibilityCents - paidAmountCents - adjustmentAmountCents);
    const status = balanceCents === 0 ? "paid" : "partial";

    await client.query(
      `UPDATE bills
       SET paid_amount_cents = $1,
           balance_cents = $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5`,
      [paidAmountCents, balanceCents, status, bill.id, params.tenantId],
    );

    remainingCents -= appliedToBillCents;
    appliedCents += appliedToBillCents;
  }

  if (remainingCents > 0) {
    const paymentId = crypto.randomUUID();
    paymentIds.push(paymentId);
    await client.query(
      `INSERT INTO patient_payments(
        id, tenant_id, patient_id, payment_date, amount_cents,
        payment_method, card_last_four, reference_number, receipt_number,
        status, notes, processed_by
      ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, 'posted', $9, NULL)`,
      [
        paymentId,
        params.tenantId,
        params.patientId,
        remainingCents,
        paymentMethod,
        params.cardLastFour || null,
        params.processorTransactionId,
        params.receiptNumber,
        `${notes} | Unapplied balance credit`,
      ],
    );
  }

  return { appliedCents, unappliedCents: remainingCents, paymentIds };
}
