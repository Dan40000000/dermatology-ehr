import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { amountToCents, postPortalPaymentToLedger } from "../services/paymentLedgerService";

export const portalBillingRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPortalBillingError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function isMissingOptionalPortalBillingData(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  const message = toSafeErrorMessage(error).toLowerCase();

  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function emptyPortalBalance() {
  return {
    totalCharges: 0,
    totalPayments: 0,
    totalAdjustments: 0,
    currentBalance: 0,
    lastPaymentDate: null,
    lastPaymentAmount: null,
  };
}

// ============================================================================
// MOCK STRIPE INTEGRATION (similar to Twilio/Surescripts pattern)
// ============================================================================

interface MockStripeToken {
  id: string;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

interface MockStripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt_url: string;
}

const mockStripe = {
  tokens: {
    create: async (cardData: any): Promise<MockStripeToken> => {
      // Simulate Stripe tokenization
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        id: `tok_${crypto.randomBytes(12).toString('hex')}`,
        card: {
          brand: cardData.card.cardBrand || cardData.card.brand || 'visa',
          last4: (cardData.card.cardNumber || cardData.card.number || '0000').slice(-4),
          exp_month: cardData.card.expiryMonth || cardData.card.exp_month,
          exp_year: cardData.card.expiryYear || cardData.card.exp_year,
        },
      };
    },
  },
  charges: {
    create: async (chargeData: any): Promise<MockStripeCharge> => {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Demo portal payments should be deterministic; saved/mock cards retain failure simulation.
      const success = String(chargeData.source || '').startsWith('tok_demo_') || Math.random() > 0.05;

      return {
        id: `ch_${crypto.randomBytes(12).toString('hex')}`,
        amount: chargeData.amount,
        currency: chargeData.currency,
        status: success ? 'succeeded' : 'failed',
        receipt_url: `https://mock-stripe.com/receipts/${crypto.randomBytes(8).toString('hex')}`,
      };
    },
  },
  refunds: {
    create: async (refundData: any) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        id: `re_${crypto.randomBytes(12).toString('hex')}`,
        amount: refundData.amount,
        status: 'succeeded',
      };
    },
  },
};

// ============================================================================
// PATIENT BALANCE
// ============================================================================

export async function getLivePortalBalance(tenantId: string, patientId: string) {
  let summaryResult;
  try {
    summaryResult = await pool.query(
      `WITH bill_summary AS (
       SELECT
         COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_charges_cents ELSE 0 END), 0)::int AS bill_total_charges_cents,
         COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN patient_responsibility_cents ELSE 0 END), 0)::int AS bill_patient_responsibility_cents,
         COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN insurance_responsibility_cents ELSE 0 END), 0)::int AS bill_insurance_responsibility_cents,
         COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN paid_amount_cents ELSE 0 END), 0)::int AS bill_paid_cents,
         COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN adjustment_amount_cents ELSE 0 END), 0)::int AS bill_adjustment_cents,
         COALESCE(SUM(
           CASE
             WHEN status NOT IN ('paid', 'written_off', 'cancelled')
               THEN GREATEST(COALESCE(balance_cents, 0), 0)
             ELSE 0
           END
         ), 0)::int AS bill_balance_cents
       FROM bills
       WHERE tenant_id = $1 AND patient_id = $2
     ),
     unbilled_summary AS (
       SELECT
         COALESCE(SUM(c.amount_cents), 0)::int AS unbilled_total_charges_cents,
         COALESCE(SUM(
           COALESCE(
             NULLIF(to_jsonb(c)->>'patient_responsibility_cents', '')::int,
             CASE
               WHEN COALESCE(NULLIF(to_jsonb(c)->>'billing_route', ''), CASE WHEN c.status = 'self_pay' THEN 'self_pay' ELSE 'insurance' END) = 'self_pay'
                 THEN COALESCE(c.amount_cents, 0)
               ELSE 0
             END
           )
         ), 0)::int AS unbilled_patient_responsibility_cents,
         COALESCE(SUM(
           COALESCE(
             NULLIF(to_jsonb(c)->>'insurance_responsibility_cents', '')::int,
             CASE
               WHEN COALESCE(NULLIF(to_jsonb(c)->>'billing_route', ''), CASE WHEN c.status = 'self_pay' THEN 'self_pay' ELSE 'insurance' END) = 'insurance'
                 THEN COALESCE(c.amount_cents, 0)
               ELSE 0
             END
           )
         ), 0)::int AS unbilled_insurance_responsibility_cents
       FROM charges c
       LEFT JOIN bill_line_items li
         ON li.tenant_id = c.tenant_id
        AND li.charge_id = c.id
       WHERE c.tenant_id = $1
         AND c.patient_id = $2
         AND COALESCE(c.status, 'pending') <> 'voided'
         AND li.id IS NULL
     ),
     payment_summary AS (
       SELECT
         COALESCE(SUM(amount_cents), 0)::int AS patient_payment_cents,
         COALESCE(SUM(
           CASE
             WHEN applied_to_invoice_id IS NULL AND applied_to_claim_id IS NULL THEN amount_cents
             ELSE 0
           END
         ), 0)::int AS unapplied_patient_payment_cents,
         MAX(payment_date) AS last_payment_date
       FROM patient_payments
       WHERE tenant_id = $1
         AND patient_id = $2
         AND status NOT IN ('failed', 'voided')
     ),
     portal_payment_summary AS (
       SELECT
         COALESCE(SUM((amount * 100)::int), 0)::int AS portal_payment_cents,
         MAX(completed_at) AS last_portal_payment_date
       FROM portal_payment_transactions
       WHERE tenant_id = $1
         AND patient_id = $2
         AND status = 'completed'
         AND NOT EXISTS (
           SELECT 1
           FROM patient_payments pp
           WHERE pp.tenant_id = portal_payment_transactions.tenant_id
             AND pp.patient_id = portal_payment_transactions.patient_id
             AND pp.status NOT IN ('failed', 'voided')
             AND (
               (portal_payment_transactions.processor_transaction_id IS NOT NULL
                 AND pp.reference_number = portal_payment_transactions.processor_transaction_id)
               OR (portal_payment_transactions.receipt_number IS NOT NULL
                 AND pp.receipt_number = portal_payment_transactions.receipt_number)
             )
         )
     ),
     last_payment AS (
       SELECT amount_cents, payment_date
       FROM patient_payments
       WHERE tenant_id = $1
         AND patient_id = $2
         AND status NOT IN ('failed', 'voided')
       ORDER BY payment_date DESC NULLS LAST, created_at DESC
       LIMIT 1
     )
     SELECT
       bs.bill_total_charges_cents,
       bs.bill_patient_responsibility_cents,
       bs.bill_insurance_responsibility_cents,
       bs.bill_paid_cents,
       bs.bill_adjustment_cents,
       bs.bill_balance_cents,
       us.unbilled_total_charges_cents,
       us.unbilled_patient_responsibility_cents,
       us.unbilled_insurance_responsibility_cents,
       ps.patient_payment_cents,
       ps.unapplied_patient_payment_cents,
       pps.portal_payment_cents,
       lp.amount_cents AS last_payment_cents,
       COALESCE(lp.payment_date, ps.last_payment_date, pps.last_portal_payment_date) AS last_payment_date
     FROM bill_summary bs
     CROSS JOIN unbilled_summary us
     CROSS JOIN payment_summary ps
     CROSS JOIN portal_payment_summary pps
     LEFT JOIN last_payment lp ON TRUE`,
      [tenantId, patientId],
    );
  } catch (error) {
    if (!isMissingOptionalPortalBillingData(error)) {
      throw error;
    }

    logger.warn("Optional patient portal billing balance data unavailable", {
      tenantId,
      patientId,
      error: toSafeErrorMessage(error),
    });
    return emptyPortalBalance();
  }

  const row = summaryResult.rows[0] || {};
  const toCents = (value: unknown) => Math.max(0, Number(value || 0));
  const totalChargesCents = toCents(row.bill_total_charges_cents) + toCents(row.unbilled_total_charges_cents);
  const totalPaymentsCents = Math.max(
    toCents(row.bill_paid_cents),
    toCents(row.patient_payment_cents) + toCents(row.portal_payment_cents),
  );
  const totalAdjustmentsCents = toCents(row.bill_adjustment_cents);
  const currentBalanceCents = Math.max(
    0,
    toCents(row.bill_balance_cents)
      + toCents(row.unbilled_patient_responsibility_cents)
      - toCents(row.unapplied_patient_payment_cents)
      - toCents(row.portal_payment_cents),
  );
  const lastPaymentCents = row.last_payment_cents == null ? null : toCents(row.last_payment_cents);
  // Patient-facing ledger must reconcile: charges = payments + adjustments + balance.
  const portalLedgerChargesCents = currentBalanceCents + totalPaymentsCents + totalAdjustmentsCents;

  const result = {
    totalCharges: portalLedgerChargesCents / 100,
    totalPayments: totalPaymentsCents / 100,
    totalAdjustments: totalAdjustmentsCents / 100,
    currentBalance: currentBalanceCents / 100,
    lastPaymentDate: row.last_payment_date || null,
    lastPaymentAmount: lastPaymentCents == null ? null : lastPaymentCents / 100,
  };

  // current_balance is generated as total_charges - total_payments - total_adjustments.
  try {
    await pool.query(
      `INSERT INTO portal_patient_balances (
       tenant_id, patient_id, total_charges, total_payments, total_adjustments,
       last_payment_date, last_payment_amount, last_updated
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (patient_id)
     DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       total_charges = EXCLUDED.total_charges,
       total_payments = EXCLUDED.total_payments,
       total_adjustments = EXCLUDED.total_adjustments,
       last_payment_date = EXCLUDED.last_payment_date,
       last_payment_amount = EXCLUDED.last_payment_amount,
       last_updated = CURRENT_TIMESTAMP`,
      [
        tenantId,
        patientId,
        portalLedgerChargesCents / 100,
        result.totalPayments,
        result.totalAdjustments,
        result.lastPaymentDate,
        result.lastPaymentAmount,
      ],
    );
  } catch (error) {
    if (!isMissingOptionalPortalBillingData(error)) {
      throw error;
    }

    logger.warn("Optional patient portal balance cache unavailable", {
      tenantId,
      patientId,
      error: toSafeErrorMessage(error),
    });
  }

  return result;
}

/**
 * GET /api/patient-portal/billing/balance
 * Get patient's current balance and statement
 */
portalBillingRouter.get(
  "/balance",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      return res.json(await getLivePortalBalance(tenantId, patientId));
    } catch (error) {
      if (isMissingOptionalPortalBillingData(error)) {
        return res.json(emptyPortalBalance());
      }
      logPortalBillingError("Get balance error", error);
      return res.status(500).json({ error: "Failed to get balance" });
    }
  }
);

/**
 * GET /api/patient-portal/billing/charges
 * Get patient's charge history
 */
portalBillingRouter.get(
  "/charges",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          c.id,
          c.service_date as "serviceDate",
          c.description,
          c.amount,
          c.amount_cents as "amountCents",
          COALESCE(NULLIF(to_jsonb(c)->>'insurance_responsibility_cents', '')::int, 0) / 100.0 as "insurancePaid",
          COALESCE(
            NULLIF(to_jsonb(c)->>'patient_responsibility_cents', '')::int,
            CASE
              WHEN COALESCE(NULLIF(to_jsonb(c)->>'billing_route', ''), CASE WHEN c.status = 'self_pay' THEN 'self_pay' ELSE 'insurance' END) = 'self_pay'
                THEN COALESCE(c.amount_cents, 0)
              ELSE 0
            END
          ) / 100.0 as "patientResponsibility",
          c.transaction_type as "transactionType",
          c.created_at as "createdAt",
          e.chief_complaint as "chiefComplaint",
          p.full_name as "providerName"
         FROM charges c
         LEFT JOIN encounters e ON c.encounter_id = e.id
         LEFT JOIN providers p ON e.provider_id = p.id
         WHERE c.patient_id = $1 AND c.tenant_id = $2
         ORDER BY c.service_date DESC, c.created_at DESC
         LIMIT 100`,
        [patientId, tenantId]
      );

      return res.json({ charges: result.rows });
    } catch (error) {
      if (isMissingOptionalPortalBillingData(error)) {
        return res.json({ charges: [] });
      }
      logPortalBillingError("Get charges error", error);
      return res.status(500).json({ error: "Failed to get charges" });
    }
  }
);

/**
 * GET /api/patient-portal/billing/statements
 * Get patient's statements (e-statement history)
 */
portalBillingRouter.get(
  "/statements",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          s.id,
          s.statement_number as "statementNumber",
          s.statement_date as "statementDate",
          s.balance_cents as "balanceCents",
          s.status,
          s.last_sent_date as "lastSentDate",
          s.sent_via as "sentVia",
          s.due_date as "dueDate",
          s.notes,
          (
            SELECT COUNT(*)::int
            FROM statement_line_items li
            WHERE li.statement_id = s.id AND li.tenant_id = s.tenant_id
          ) as "lineItemCount"
        FROM patient_statements s
        WHERE s.patient_id = $1 AND s.tenant_id = $2
        ORDER BY s.statement_date DESC
        LIMIT 50`,
        [patientId, tenantId]
      );

      return res.json({ statements: result.rows });
    } catch (error) {
      if (isMissingOptionalPortalBillingData(error)) {
        return res.json({ statements: [] });
      }
      logPortalBillingError("Get statements error", error);
      return res.status(500).json({ error: "Failed to get statements" });
    }
  }
);

/**
 * GET /api/patient-portal/billing/statements/:id
 * Get statement with line items (portal view)
 */
portalBillingRouter.get(
  "/statements/:id",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const statementId = String(req.params.id);

      const statementResult = await pool.query(
        `SELECT
          s.id,
          s.statement_number as "statementNumber",
          s.statement_date as "statementDate",
          s.balance_cents as "balanceCents",
          s.status,
          s.last_sent_date as "lastSentDate",
          s.sent_via as "sentVia",
          s.due_date as "dueDate",
          s.notes
        FROM patient_statements s
        WHERE s.id = $1 AND s.patient_id = $2 AND s.tenant_id = $3`,
        [statementId, patientId, tenantId]
      );

      if (statementResult.rows.length === 0) {
        return res.status(404).json({ error: "Statement not found" });
      }

      const lineItemsResult = await pool.query(
        `SELECT
          id,
          claim_id as "claimId",
          service_date as "serviceDate",
          description,
          amount_cents as "amountCents",
          insurance_paid_cents as "insurancePaidCents",
          patient_responsibility_cents as "patientResponsibilityCents"
        FROM statement_line_items
        WHERE statement_id = $1 AND tenant_id = $2
        ORDER BY service_date ASC`,
        [statementId, tenantId]
      );

      return res.json({
        statement: statementResult.rows[0],
        lineItems: lineItemsResult.rows,
      });
    } catch (error) {
      logPortalBillingError("Get statement error", error);
      return res.status(500).json({ error: "Failed to get statement" });
    }
  }
);

// ============================================================================
// PAYMENT METHODS
// ============================================================================

/**
 * GET /api/patient-portal/billing/payment-methods
 * Get patient's saved payment methods
 */
portalBillingRouter.get(
  "/payment-methods",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          id,
          payment_type as "paymentType",
          last_four as "lastFour",
          card_brand as "cardBrand",
          account_type as "accountType",
          bank_name as "bankName",
          cardholder_name as "cardholderName",
          expiry_month as "expiryMonth",
          expiry_year as "expiryYear",
          is_default as "isDefault",
          created_at as "createdAt"
         FROM portal_payment_methods
         WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true
         ORDER BY is_default DESC, created_at DESC`,
        [patientId, tenantId]
      );

      return res.json({ paymentMethods: result.rows });
    } catch (error) {
      if (isMissingOptionalPortalBillingData(error)) {
        return res.json({ paymentMethods: [] });
      }
      logPortalBillingError("Get payment methods error", error);
      return res.status(500).json({ error: "Failed to get payment methods" });
    }
  }
);

/**
 * POST /api/patient-portal/billing/payment-methods
 * Add a new payment method (tokenize card)
 */
const addPaymentMethodSchema = z.object({
  paymentType: z.enum(['credit_card', 'debit_card', 'ach', 'bank_account']),
  cardNumber: z.string().optional(),
  cardBrand: z.string().optional(),
  expiryMonth: z.number().min(1).max(12).optional(),
  expiryYear: z.number().min(2024).optional(),
  cardholderName: z.string(),
  accountType: z.string().optional(),
  bankName: z.string().optional(),
  routingNumber: z.string().optional(),
  accountNumber: z.string().optional(),
  billingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default('US'),
  }),
  setAsDefault: z.boolean().default(false),
});

portalBillingRouter.post(
  "/payment-methods",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const data = addPaymentMethodSchema.parse(req.body);

      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PORTAL_RAW_CARD_ENTRY !== 'true') {
        return res.status(400).json({
          error: "Direct payment method entry is disabled. Use a tokenized payment vendor.",
        });
      }

      // Tokenize with mock Stripe
      let token: MockStripeToken;

      if (data.paymentType === 'credit_card' || data.paymentType === 'debit_card') {
        token = await mockStripe.tokens.create({
          card: {
            number: data.cardNumber,
            brand: data.cardBrand,
            exp_month: data.expiryMonth,
            exp_year: data.expiryYear,
            cvc: '123', // Not stored
          },
        });
      } else {
        // ACH tokenization
        token = {
          id: `tok_${crypto.randomBytes(12).toString('hex')}`,
          card: {
            brand: 'bank',
            last4: data.accountNumber!.slice(-4),
            exp_month: 0,
            exp_year: 0,
          },
        };
      }

      // If setting as default, unset other defaults
      if (data.setAsDefault) {
        await pool.query(
          `UPDATE portal_payment_methods
           SET is_default = false
           WHERE patient_id = $1 AND tenant_id = $2`,
          [patientId, tenantId]
        );
      }

      // Save tokenized payment method
      const result = await pool.query(
        `INSERT INTO portal_payment_methods (
          tenant_id, patient_id, payment_type, token, processor,
          last_four, card_brand, account_type, bank_name,
          cardholder_name, expiry_month, expiry_year,
          billing_address, is_default, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
         RETURNING id, payment_type as "paymentType", last_four as "lastFour",
                   card_brand as "cardBrand", is_default as "isDefault"`,
        [
          tenantId,
          patientId,
          data.paymentType,
          token.id,
          'stripe',
          data.paymentType === 'ach' ? data.accountNumber!.slice(-4) : token.card.last4,
          data.cardBrand || token.card.brand,
          data.accountType,
          data.bankName,
          data.cardholderName,
          data.expiryMonth || null,
          data.expiryYear || null,
          JSON.stringify(data.billingAddress),
          data.setAsDefault,
        ]
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalBillingError("Add payment method error", error);
      return res.status(500).json({ error: "Failed to add payment method" });
    }
  }
);

/**
 * DELETE /api/patient-portal/billing/payment-methods/:id
 * Remove a payment method
 */
portalBillingRouter.delete(
  "/payment-methods/:id",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { id } = req.params;

      // Soft delete (mark as inactive)
      const result = await pool.query(
        `UPDATE portal_payment_methods
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3
         RETURNING id`,
        [id, patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Payment method not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      logPortalBillingError("Delete payment method error", error);
      return res.status(500).json({ error: "Failed to delete payment method" });
    }
  }
);

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

/**
 * POST /api/patient-portal/billing/payments
 * Make a one-time payment
 */
const makePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string().uuid().optional(),
  invoiceId: z.string().optional(),
  chargeIds: z.array(z.string().uuid()).optional(),
  description: z.string().optional(),
  savePaymentMethod: z.boolean().default(false),
  demoPaymentMethod: z.boolean().default(false),
  newPaymentMethod: z.object({
    paymentType: z.enum(['credit_card', 'debit_card']),
    cardNumber: z.string(),
    cardBrand: z.string(),
    expiryMonth: z.number(),
    expiryYear: z.number(),
    cardholderName: z.string(),
    cvv: z.string(),
    billingAddress: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default('US'),
    }),
  }).optional(),
});

portalBillingRouter.post(
  "/payments",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const data = makePaymentSchema.parse(req.body);

      let paymentMethodId = data.paymentMethodId;
      let paymentToken: string;
      let paymentMethodType = 'credit_card';
      let cardLastFour: string | null = null;

      if (data.newPaymentMethod && process.env.NODE_ENV === 'production' && process.env.ALLOW_PORTAL_RAW_CARD_ENTRY !== 'true') {
        return res.status(400).json({
          error: "Direct card entry is disabled. Use the demo payment method or a tokenized payment vendor.",
        });
      }

      // Get or create payment method
      if (data.demoPaymentMethod) {
        paymentToken = `tok_demo_${crypto.randomBytes(8).toString('hex')}`;
        paymentMethodType = 'credit_card';
        cardLastFour = '0000';
      } else if (data.newPaymentMethod) {
        // Tokenize new card
        const token = await mockStripe.tokens.create({
          card: data.newPaymentMethod,
        });
        paymentToken = token.id;
        paymentMethodType = data.newPaymentMethod.paymentType;
        cardLastFour = token.card.last4;

        // Save if requested
        if (data.savePaymentMethod) {
          const pmResult = await pool.query(
            `INSERT INTO portal_payment_methods (
              tenant_id, patient_id, payment_type, token, processor,
              last_four, card_brand, cardholder_name, expiry_month, expiry_year,
              billing_address, is_default, is_active
             ) VALUES ($1, $2, $3, $4, 'stripe', $5, $6, $7, $8, $9, $10, false, true)
             RETURNING id`,
            [
              tenantId,
              patientId,
              data.newPaymentMethod.paymentType,
              token.id,
              token.card.last4,
              data.newPaymentMethod.cardBrand,
              data.newPaymentMethod.cardholderName,
              data.newPaymentMethod.expiryMonth,
              data.newPaymentMethod.expiryYear,
              JSON.stringify(data.newPaymentMethod.billingAddress),
            ]
          );
          paymentMethodId = pmResult.rows[0].id;
        }
      } else if (paymentMethodId) {
        // Use existing payment method
        const pmResult = await pool.query(
          `SELECT token, last_four, payment_type
           FROM portal_payment_methods
           WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND is_active = true`,
          [paymentMethodId, patientId, tenantId]
        );

        if (pmResult.rows.length === 0) {
          return res.status(404).json({ error: "Payment method not found" });
        }

        paymentToken = pmResult.rows[0].token;
        paymentMethodType = pmResult.rows[0].payment_type || 'credit_card';
        cardLastFour = pmResult.rows[0].last_four || null;
      } else {
        return res.status(400).json({ error: "Payment method required" });
      }

      // Generate receipt number
      const receiptNumber = `RCP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Create pending transaction
      const transactionResult = await pool.query(
        `INSERT INTO portal_payment_transactions (
          tenant_id, patient_id, amount, currency, status,
          payment_method_id, payment_method_type, processor,
          charge_ids, description, receipt_number,
          ip_address, user_agent
         ) VALUES ($1, $2, $3, 'USD', 'pending', $4, $5, 'stripe', $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          tenantId,
          patientId,
          data.amount,
          paymentMethodId,
          paymentMethodType,
          data.chargeIds ? JSON.stringify(data.chargeIds) : null,
          data.description,
          receiptNumber,
          req.ip,
          req.get('user-agent'),
        ]
      );

      const transactionId = transactionResult.rows[0].id;

      try {
        // Process payment with mock Stripe
        const charge = await mockStripe.charges.create({
          amount: amountToCents(data.amount), // cents
          currency: 'usd',
          source: paymentToken,
          description: data.description || 'Medical services payment',
        });

        if (charge.status === 'succeeded') {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query(
              `UPDATE portal_payment_transactions
               SET status = 'completed',
                   processor_transaction_id = $1,
                   processor_response = $2,
                   receipt_url = $3,
                   completed_at = CURRENT_TIMESTAMP,
                   invoice_id = COALESCE(invoice_id, $4)
               WHERE id = $5`,
              [
                charge.id,
                JSON.stringify(charge),
                charge.receipt_url,
                data.invoiceId || null,
                transactionId,
              ]
            );

            await postPortalPaymentToLedger(client, {
              tenantId,
              patientId,
              amountCents: amountToCents(data.amount),
              paymentMethodType,
              cardLastFour,
              processorTransactionId: charge.id,
              receiptNumber,
              transactionId,
              description: data.description,
              invoiceId: data.invoiceId || null,
            });

            await client.query('COMMIT');
          } catch (ledgerError) {
            await client.query('ROLLBACK');
            throw ledgerError;
          } finally {
            client.release();
          }

          await getLivePortalBalance(tenantId, patientId).catch((balanceError) => {
            logPortalBillingError("Portal balance refresh after payment failed", balanceError);
          });

          return res.json({
            success: true,
            transactionId,
            receiptNumber,
            receiptUrl: charge.receipt_url,
            amount: data.amount,
          });
        } else {
          await pool.query(
            `UPDATE portal_payment_transactions
             SET status = 'failed',
                 processor_transaction_id = $1,
                 processor_response = $2
             WHERE id = $3`,
            [charge.id, JSON.stringify(charge), transactionId]
          );
          return res.status(402).json({
            error: "Payment failed",
            transactionId,
          });
        }
      } catch (paymentError) {
        // Mark transaction as failed
        await pool.query(
          `UPDATE portal_payment_transactions
           SET status = 'failed'
           WHERE id = $1`,
          [transactionId]
        );

        throw paymentError;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalBillingError("Payment processing error", error);
      return res.status(500).json({ error: "Payment processing failed" });
    }
  }
);

/**
 * GET /api/patient-portal/billing/payment-history
 * Get patient's payment history
 */
portalBillingRouter.get(
  "/payment-history",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          id,
          amount,
          currency,
          status,
          payment_method_type as "paymentMethodType",
          description,
          receipt_number as "receiptNumber",
          receipt_url as "receiptUrl",
          refund_amount as "refundAmount",
          created_at as "createdAt",
          completed_at as "completedAt"
         FROM portal_payment_transactions
         WHERE patient_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [patientId, tenantId]
      );

      return res.json({ payments: result.rows });
    } catch (error) {
      if (isMissingOptionalPortalBillingData(error)) {
        return res.json({ payments: [] });
      }
      logPortalBillingError("Get payment history error", error);
      return res.status(500).json({ error: "Failed to get payment history" });
    }
  }
);

// ============================================================================
// PAYMENT PLANS
// ============================================================================

/**
 * GET /api/patient-portal/billing/payment-plans
 * Get patient's payment plans
 */
portalBillingRouter.get(
  "/payment-plans",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          id,
          total_amount as "totalAmount",
          amount_paid as "amountPaid",
          installment_amount as "installmentAmount",
          installment_frequency as "installmentFrequency",
          number_of_installments as "numberOfInstallments",
          start_date as "startDate",
          next_payment_date as "nextPaymentDate",
          status,
          auto_pay as "autoPay",
          description,
          created_at as "createdAt"
         FROM portal_payment_plans
         WHERE patient_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC`,
        [patientId, tenantId]
      );

      return res.json({ paymentPlans: result.rows });
    } catch (error) {
      logPortalBillingError("Get payment plans error", error);
      return res.status(500).json({ error: "Failed to get payment plans" });
    }
  }
);

/**
 * GET /api/patient-portal/billing/payment-plans/:id/installments
 * Get installments for a payment plan
 */
portalBillingRouter.get(
  "/payment-plans/:id/installments",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { id } = req.params;

      // Verify plan belongs to patient
      const planResult = await pool.query(
        `SELECT id FROM portal_payment_plans
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [id, patientId, tenantId]
      );

      if (planResult.rows.length === 0) {
        return res.status(404).json({ error: "Payment plan not found" });
      }

      const result = await pool.query(
        `SELECT
          id,
          installment_number as "installmentNumber",
          amount,
          due_date as "dueDate",
          status,
          paid_amount as "paidAmount",
          paid_at as "paidAt",
          transaction_id as "transactionId"
         FROM portal_payment_plan_installments
         WHERE payment_plan_id = $1 AND tenant_id = $2
         ORDER BY installment_number`,
        [id, tenantId]
      );

      return res.json({ installments: result.rows });
    } catch (error) {
      logPortalBillingError("Get installments error", error);
      return res.status(500).json({ error: "Failed to get installments" });
    }
  }
);

// ============================================================================
// AUTO-PAY
// ============================================================================

/**
 * GET /api/patient-portal/billing/autopay
 * Get patient's auto-pay enrollment
 */
portalBillingRouter.get(
  "/autopay",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          ae.id,
          ae.payment_method_id as "paymentMethodId",
          ae.is_active as "isActive",
          ae.charge_day as "chargeDay",
          ae.charge_all_balances as "chargeAllBalances",
          ae.minimum_amount as "minimumAmount",
          ae.notify_before_charge as "notifyBeforeCharge",
          ae.notification_days as "notificationDays",
          ae.enrolled_at as "enrolledAt",
          ae.last_charge_date as "lastChargeDate",
          ae.last_charge_amount as "lastChargeAmount",
          pm.payment_type as "paymentType",
          pm.last_four as "lastFour",
          pm.card_brand as "cardBrand"
         FROM portal_autopay_enrollments ae
         LEFT JOIN portal_payment_methods pm ON ae.payment_method_id = pm.id
         WHERE ae.patient_id = $1 AND ae.tenant_id = $2
         ORDER BY ae.enrolled_at DESC
         LIMIT 1`,
        [patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.json({ enrolled: false });
      }

      return res.json({ enrolled: true, ...result.rows[0] });
    } catch (error) {
      logPortalBillingError("Get autopay error", error);
      return res.status(500).json({ error: "Failed to get autopay enrollment" });
    }
  }
);

/**
 * POST /api/patient-portal/billing/autopay
 * Enroll in auto-pay
 */
const enrollAutopaySchema = z.object({
  paymentMethodId: z.string().uuid(),
  chargeDay: z.number().min(1).max(28),
  chargeAllBalances: z.boolean().default(true),
  minimumAmount: z.number().positive().optional(),
  notifyBeforeCharge: z.boolean().default(true),
  notificationDays: z.number().min(1).max(14).default(3),
  termsAccepted: z.boolean().refine(val => val === true, {
    message: "Must accept terms to enroll in auto-pay",
  }),
});

portalBillingRouter.post(
  "/autopay",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const data = enrollAutopaySchema.parse(req.body);

      // Verify payment method belongs to patient
      const pmResult = await pool.query(
        `SELECT id FROM portal_payment_methods
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND is_active = true`,
        [data.paymentMethodId, patientId, tenantId]
      );

      if (pmResult.rows.length === 0) {
        return res.status(404).json({ error: "Payment method not found" });
      }

      // Cancel any existing enrollments
      await pool.query(
        `UPDATE portal_autopay_enrollments
         SET is_active = false, cancelled_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true`,
        [patientId, tenantId]
      );

      // Create new enrollment
      const result = await pool.query(
        `INSERT INTO portal_autopay_enrollments (
          tenant_id, patient_id, payment_method_id,
          is_active, charge_day, charge_all_balances, minimum_amount,
          notify_before_charge, notification_days,
          terms_accepted, terms_accepted_at
         ) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         RETURNING id, enrolled_at as "enrolledAt"`,
        [
          tenantId,
          patientId,
          data.paymentMethodId,
          data.chargeDay,
          data.chargeAllBalances,
          data.minimumAmount,
          data.notifyBeforeCharge,
          data.notificationDays,
          data.termsAccepted,
        ]
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalBillingError("Enroll autopay error", error);
      return res.status(500).json({ error: "Failed to enroll in auto-pay" });
    }
  }
);

/**
 * DELETE /api/patient-portal/billing/autopay
 * Cancel auto-pay enrollment
 */
portalBillingRouter.delete(
  "/autopay",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `UPDATE portal_autopay_enrollments
         SET is_active = false,
             cancelled_at = CURRENT_TIMESTAMP,
             cancelled_reason = 'Patient cancelled via portal'
         WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true
         RETURNING id`,
        [patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No active auto-pay enrollment found" });
      }

      return res.json({ success: true });
    } catch (error) {
      logPortalBillingError("Cancel autopay error", error);
      return res.status(500).json({ error: "Failed to cancel auto-pay" });
    }
  }
);
