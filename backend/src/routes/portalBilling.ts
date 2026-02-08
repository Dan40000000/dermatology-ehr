import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import crypto from "crypto";

export const portalBillingRouter = Router();

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

      // 95% success rate simulation
      const success = Math.random() > 0.05;

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

      // Get balance summary
      const balanceResult = await pool.query(
        `SELECT
          total_charges as "totalCharges",
          total_payments as "totalPayments",
          total_adjustments as "totalAdjustments",
          current_balance as "currentBalance",
          last_payment_date as "lastPaymentDate",
          last_payment_amount as "lastPaymentAmount"
         FROM portal_patient_balances
         WHERE patient_id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (balanceResult.rows.length === 0) {
        // Initialize balance if doesn't exist
        await pool.query(
          `INSERT INTO portal_patient_balances (tenant_id, patient_id, total_charges, total_payments, total_adjustments)
           VALUES ($1, $2, 0, 0, 0)
           ON CONFLICT (patient_id) DO NOTHING`,
          [tenantId, patientId]
        );

        return res.json({
          totalCharges: 0,
          totalPayments: 0,
          totalAdjustments: 0,
          currentBalance: 0,
          lastPaymentDate: null,
          lastPaymentAmount: null,
        });
      }

      return res.json(balanceResult.rows[0]);
    } catch (error) {
      console.error("Get balance error:", error);
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
      console.error("Get charges error:", error);
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
      console.error("Get statements error:", error);
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
      console.error("Get statement error:", error);
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
      console.error("Get payment methods error:", error);
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
      console.error("Add payment method error:", error);
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
      console.error("Delete payment method error:", error);
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
  chargeIds: z.array(z.string().uuid()).optional(),
  description: z.string().optional(),
  savePaymentMethod: z.boolean().default(false),
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

      // Get or create payment method
      if (data.newPaymentMethod) {
        // Tokenize new card
        const token = await mockStripe.tokens.create({
          card: data.newPaymentMethod,
        });
        paymentToken = token.id;

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
          `SELECT token FROM portal_payment_methods
           WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 AND is_active = true`,
          [paymentMethodId, patientId, tenantId]
        );

        if (pmResult.rows.length === 0) {
          return res.status(404).json({ error: "Payment method not found" });
        }

        paymentToken = pmResult.rows[0].token;
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
          data.newPaymentMethod?.paymentType || 'credit_card',
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
          amount: Math.round(data.amount * 100), // cents
          currency: 'usd',
          source: paymentToken,
          description: data.description || 'Medical services payment',
        });

        // Update transaction with result
        await pool.query(
          `UPDATE portal_payment_transactions
           SET status = $1,
               processor_transaction_id = $2,
               processor_response = $3,
               receipt_url = $4,
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            charge.status === 'succeeded' ? 'completed' : 'failed',
            charge.id,
            JSON.stringify(charge),
            charge.receipt_url,
            transactionId,
          ]
        );

        if (charge.status === 'succeeded') {
          // Update patient balance
          await pool.query(
            `UPDATE portal_patient_balances
             SET total_payments = total_payments + $1,
                 last_payment_date = CURRENT_TIMESTAMP,
                 last_payment_amount = $1,
                 last_updated = CURRENT_TIMESTAMP
             WHERE patient_id = $2 AND tenant_id = $3`,
            [data.amount, patientId, tenantId]
          );

          // If specific charges were paid, mark them
          if (data.chargeIds && data.chargeIds.length > 0) {
            // This would integrate with your charges table
            // For now, we'll just record the association
          }

          return res.json({
            success: true,
            transactionId,
            receiptNumber,
            receiptUrl: charge.receipt_url,
            amount: data.amount,
          });
        } else {
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
      console.error("Payment processing error:", error);
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
      console.error("Get payment history error:", error);
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
      console.error("Get payment plans error:", error);
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
      console.error("Get installments error:", error);
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
      console.error("Get autopay error:", error);
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
      console.error("Enroll autopay error:", error);
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
      console.error("Cancel autopay error:", error);
      return res.status(500).json({ error: "Failed to cancel auto-pay" });
    }
  }
);
