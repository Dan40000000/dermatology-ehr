import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";
import { amountToCents, postPortalPaymentToLedger } from "../services/paymentLedgerService";

export const publicBillPayRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
}

function logPublicBillPayError(message: string, error: unknown): void {
  logger.error(message, { error: toSafeErrorMessage(error) });
}

function normalizeBillPayCode(code: string): string {
  return code.replace(/\D/g, "");
}

function normalizeAccountVerifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-4);
}

function patientDisplayName(firstName?: string, lastName?: string): string {
  const first = firstName ? `${firstName.charAt(0)}.` : "";
  const last = lastName || "";
  return [first, last].filter(Boolean).join(" ") || "Patient";
}

const lookupSchema = z.object({
  code: z.string().min(7).max(20).transform(normalizeBillPayCode).refine((code) => /^\d{7}$/.test(code), {
    message: "Bill pay code must be 7 digits",
  }),
  accountVerifier: z.string().min(2).max(20).transform(normalizeAccountVerifier).refine((value) => /^[A-Z0-9]{4}$/.test(value), {
    message: "Account verification must be the last 4 characters from the statement account number",
  }),
});

const paymentSchema = z.object({
  code: z.string().min(7).max(20).transform(normalizeBillPayCode).refine((code) => /^\d{7}$/.test(code), {
    message: "Bill pay code must be 7 digits",
  }),
  accountVerifier: z.string().min(2).max(20).transform(normalizeAccountVerifier).refine((value) => /^[A-Z0-9]{4}$/.test(value), {
    message: "Account verification must be the last 4 characters from the statement account number",
  }),
  amount: z.number().positive(),
  demoPaymentMethod: z.boolean().default(true),
});

async function lookupBillByCode(code: string, accountVerifier: string) {
  const result = await pool.query(
    `SELECT
       b.id as "billId",
       b.tenant_id as "tenantId",
       b.patient_id as "patientId",
       b.bill_number as "billNumber",
       b.bill_pay_code as "billPayCode",
       b.bill_date as "billDate",
       b.due_date as "dueDate",
       b.patient_responsibility_cents as "patientResponsibilityCents",
       b.paid_amount_cents as "paidAmountCents",
       b.balance_cents as "balanceCents",
       b.status,
       p.first_name as "patientFirstName",
       p.last_name as "patientLastName",
       p.account_number as "accountNumber"
     FROM bills b
     JOIN patients p ON p.id = b.patient_id AND p.tenant_id = b.tenant_id
     WHERE b.bill_pay_code = $1
       AND RIGHT(UPPER(REGEXP_REPLACE(COALESCE(p.account_number, ''), '[^a-zA-Z0-9]', '', 'g')), 4) = $2
       AND b.status NOT IN ('written_off', 'cancelled')
     LIMIT 1`,
    [code, accountVerifier],
  );

  return result.rows[0] || null;
}

function publicBillPayload(row: any) {
  const accountNumber = String(row.accountNumber || "");
  return {
    billNumber: row.billNumber,
    billPayCode: row.billPayCode,
    billDate: row.billDate,
    dueDate: row.dueDate,
    status: row.status,
    patientDisplayName: patientDisplayName(row.patientFirstName, row.patientLastName),
    accountEnding: accountNumber ? accountNumber.slice(-4) : null,
    patientResponsibilityCents: Number(row.patientResponsibilityCents || 0),
    paidAmountCents: Number(row.paidAmountCents || 0),
    balanceCents: Number(row.balanceCents || 0),
  };
}

publicBillPayRouter.get("/lookup", async (req, res) => {
  try {
    const parsed = lookupSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Valid bill pay code required" });
    }

    const bill = await lookupBillByCode(parsed.data.code, parsed.data.accountVerifier);
    if (!bill) {
      return res.status(404).json({ error: "Bill not found" });
    }

    return res.json({ bill: publicBillPayload(bill) });
  } catch (error) {
    logPublicBillPayError("Public bill lookup error", error);
    return res.status(500).json({ error: "Failed to look up bill" });
  }
});

publicBillPayRouter.post("/pay", async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payment request", details: parsed.error.issues });
  }

  const amountCents = amountToCents(parsed.data.amount);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const billResult = await client.query(
      `SELECT
         b.id as "billId",
         b.tenant_id as "tenantId",
         b.patient_id as "patientId",
         b.bill_number as "billNumber",
         b.bill_pay_code as "billPayCode",
         b.bill_date as "billDate",
         b.due_date as "dueDate",
         b.patient_responsibility_cents as "patientResponsibilityCents",
         b.paid_amount_cents as "paidAmountCents",
         b.balance_cents as "balanceCents",
         b.status,
         p.first_name as "patientFirstName",
         p.last_name as "patientLastName",
         p.account_number as "accountNumber"
       FROM bills b
       JOIN patients p ON p.id = b.patient_id AND p.tenant_id = b.tenant_id
       WHERE b.bill_pay_code = $1
         AND RIGHT(UPPER(REGEXP_REPLACE(COALESCE(p.account_number, ''), '[^a-zA-Z0-9]', '', 'g')), 4) = $2
         AND b.status NOT IN ('written_off', 'cancelled')
       FOR UPDATE`,
      [parsed.data.code, parsed.data.accountVerifier],
    );

    if (!billResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Bill not found" });
    }

    const bill = billResult.rows[0];
    const balanceCents = Number(bill.balanceCents || 0);
    if (balanceCents <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Bill is already paid", bill: publicBillPayload(bill) });
    }
    if (amountCents > balanceCents) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Payment exceeds current bill balance" });
    }

    const transactionId = crypto.randomUUID();
    const processorTransactionId = `pbp_${crypto.randomBytes(12).toString("hex")}`;
    const receiptNumber = `PBP-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    await client.query(
      `INSERT INTO portal_payment_transactions (
        id, tenant_id, patient_id, amount, currency, status,
        payment_method_type, processor, processor_transaction_id,
        processor_response, invoice_id, description, receipt_number,
        completed_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'completed', 'credit_card',
        'public_bill_pay_demo', $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
      [
        transactionId,
        bill.tenantId,
        bill.patientId,
        amountCents / 100,
        processorTransactionId,
        JSON.stringify({ status: "succeeded", demoPaymentMethod: parsed.data.demoPaymentMethod }),
        bill.billId,
        "Public bill pay payment",
        receiptNumber,
      ],
    );

    await postPortalPaymentToLedger(client, {
      tenantId: bill.tenantId,
      patientId: bill.patientId,
      amountCents,
      paymentMethodType: "credit_card",
      cardLastFour: "0000",
      processorTransactionId,
      receiptNumber,
      transactionId,
      invoiceId: bill.billId,
      description: "Public bill pay payment",
    });

    const updatedBillResult = await client.query(
      `SELECT
         b.bill_number as "billNumber",
         b.bill_pay_code as "billPayCode",
         b.bill_date as "billDate",
         b.due_date as "dueDate",
         b.patient_responsibility_cents as "patientResponsibilityCents",
         b.paid_amount_cents as "paidAmountCents",
         b.balance_cents as "balanceCents",
         b.status,
         p.first_name as "patientFirstName",
         p.last_name as "patientLastName",
         p.account_number as "accountNumber"
       FROM bills b
       JOIN patients p ON p.id = b.patient_id AND p.tenant_id = b.tenant_id
       WHERE b.id = $1 AND b.tenant_id = $2`,
      [bill.billId, bill.tenantId],
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      transactionId,
      receiptNumber,
      amount: amountCents / 100,
      bill: publicBillPayload(updatedBillResult.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    logPublicBillPayError("Public bill payment error", error);
    return res.status(500).json({ error: "Payment failed" });
  } finally {
    client.release();
  }
});
