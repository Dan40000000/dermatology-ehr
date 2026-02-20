import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import * as collectionsService from "../services/collectionsService";
import * as costEstimator from "../services/costEstimator";
import * as copayCollectionService from "../services/copayCollectionService";
import { pool } from "../db/pool";
import crypto from "crypto";
import { logger } from "../lib/logger";

export const collectionsRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logCollectionsError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// ============================================
// PATIENT BALANCE
// ============================================

// Get patient balance details
collectionsRouter.get(
  "/patient/:id/balance",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.id);

    try {
      const balance = await collectionsService.getPatientBalance(
        tenantId,
        patientId
      );

      if (!balance) {
        return res.json({
          patientId,
          totalBalance: 0,
          currentBalance: 0,
          balance31_60: 0,
          balance61_90: 0,
          balanceOver90: 0,
          oldestChargeDate: null,
          lastPaymentDate: null,
          lastPaymentAmount: null,
          hasPaymentPlan: false,
          hasAutopay: false,
        });
      }

      // Get talking points
      const talkingPoints = collectionsService.getCollectionTalkingPoints(balance);

      res.json({
        ...balance,
        talkingPoints,
      });
    } catch (error) {
      logCollectionsError("Error fetching patient balance:", error);
      res.status(500).json({ error: "Failed to fetch patient balance" });
    }
  }
);

// ============================================
// PAYMENTS
// ============================================

const paymentSchema = z.object({
  patientId: z.string(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["card", "cash", "check", "hsa"]),
  cardLastFour: z.string().optional(),
  checkNumber: z.string().optional(),
  referenceNumber: z.string().optional(),
  encounterId: z.string().optional(),
  collectionPoint: z
    .enum(["check_in", "check_out", "phone", "statement", "portal", "text"])
    .optional(),
  notes: z.string().optional(),
});

// Process payment
collectionsRouter.post(
  "/payment",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const payload = parsed.data;

    try {
      // Process payment through service
      const result = await collectionsService.processPayment(
        tenantId,
        payload.patientId,
        payload.amount,
        payload.paymentMethod,
        {
          encounterId: payload.encounterId,
          collectionPoint: payload.collectionPoint || "other",
          cardLastFour: payload.cardLastFour,
          checkNumber: payload.checkNumber,
          referenceNumber: payload.referenceNumber,
          collectedBy: req.user!.id,
          notes: payload.notes,
        }
      );

      // Record collection attempt
      await collectionsService.recordCollectionAttempt(tenantId, {
        patientId: payload.patientId,
        encounterId: payload.encounterId,
        amountDue: payload.amount,
        collectionPoint: payload.collectionPoint || "other",
        result: "collected_full",
        amountCollected: payload.amount,
        attemptedBy: req.user!.id,
      });

      await auditLog(
        tenantId,
        req.user!.id,
        "payment_collected",
        "patient_payment",
        result.paymentId
      );

      res.json({
        success: true,
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
      });
    } catch (error) {
      logCollectionsError("Error processing payment:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  }
);

// ============================================
// COST ESTIMATES
// ============================================

const estimateSchema = z.object({
  patientId: z.string(),
  appointmentId: z.string().optional(),
  serviceType: z.string(),
  cptCodes: z.array(z.string()),
  isCosmetic: z.boolean().optional(),
});

// Create cost estimate
collectionsRouter.post(
  "/estimate",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = estimateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const payload = parsed.data;

    try {
      const estimate = await costEstimator.createCostEstimate(
        tenantId,
        payload.patientId,
        {
          appointmentId: payload.appointmentId,
          serviceType: payload.serviceType,
          cptCodes: payload.cptCodes,
          isCosmetic: payload.isCosmetic || false,
          userId: req.user!.id,
        }
      );

      res.json({ estimate });
    } catch (error) {
      logCollectionsError("Error creating cost estimate:", error);
      res.status(500).json({ error: "Failed to create cost estimate" });
    }
  }
);

// Get estimate by appointment
collectionsRouter.get(
  "/estimate/:appointmentId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const appointmentId = String(req.params.appointmentId);

    try {
      const estimate = await costEstimator.getEstimateByAppointment(
        tenantId,
        appointmentId
      );

      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      res.json({ estimate });
    } catch (error) {
      logCollectionsError("Error fetching estimate:", error);
      res.status(500).json({ error: "Failed to fetch estimate" });
    }
  }
);

// Quick estimate
collectionsRouter.post(
  "/estimate/quick",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { patientId, procedureType } = req.body;

    if (!patientId || !procedureType) {
      return res
        .status(400)
        .json({ error: "Patient ID and procedure type required" });
    }

    try {
      const estimate = await costEstimator.quickEstimate(
        tenantId,
        patientId,
        procedureType
      );

      res.json(estimate);
    } catch (error) {
      logCollectionsError("Error creating quick estimate:", error);
      res.status(500).json({ error: "Failed to create quick estimate" });
    }
  }
);

// ============================================
// PAYMENT PLANS
// ============================================

const paymentPlanSchema = z.object({
  patientId: z.string(),
  totalAmount: z.number().positive(),
  monthlyPayment: z.number().positive(),
  numberOfPayments: z.number().int().positive(),
  startDate: z.string(),
  autoCharge: z.boolean().optional(),
  cardOnFileId: z.string().optional(),
  notes: z.string().optional(),
});

// Create payment plan
collectionsRouter.post(
  "/payment-plan",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = paymentPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const payload = parsed.data;
    const planId = crypto.randomUUID();

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Create payment plan in existing payment_plans table
        const startDate = new Date(payload.startDate);
        const nextPaymentDate = new Date(startDate);
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

        await client.query(
          `insert into payment_plans (
            id, tenant_id, patient_id, total_amount_cents,
            installment_amount_cents, frequency, start_date,
            next_payment_date, paid_amount_cents, remaining_amount_cents,
            status, notes, created_by
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            planId,
            tenantId,
            payload.patientId,
            Math.round(payload.totalAmount * 100),
            Math.round(payload.monthlyPayment * 100),
            "monthly",
            payload.startDate,
            nextPaymentDate.toISOString().split("T")[0],
            0,
            Math.round(payload.totalAmount * 100),
            "active",
            payload.notes || null,
            req.user!.id,
          ]
        );

        // Update patient balance to reflect payment plan
        await client.query(
          `update patient_balances
           set has_payment_plan = true
           where tenant_id = $1 and patient_id = $2`,
          [tenantId, payload.patientId]
        );

        // Record collection attempt
        await client.query(
          `insert into collection_attempts (
            id, tenant_id, patient_id, attempt_date,
            amount_due, collection_point, result,
            amount_collected, notes, attempted_by
          ) values ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9)`,
          [
            crypto.randomUUID(),
            tenantId,
            payload.patientId,
            payload.totalAmount,
            "check_in",
            "payment_plan",
            0,
            `Payment plan created: $${payload.monthlyPayment}/mo for ${payload.numberOfPayments} months`,
            req.user!.id,
          ]
        );

        await client.query("COMMIT");

        await auditLog(
          tenantId,
          req.user!.id,
          "payment_plan_create",
          "payment_plan",
          planId
        );

        res.status(201).json({ id: planId });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logCollectionsError("Error creating payment plan:", error);
      res.status(500).json({ error: "Failed to create payment plan" });
    }
  }
);

// Get payment plans
collectionsRouter.get("/payment-plans", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { patientId, status } = req.query;

  let query = `
    select
      pp.id,
      pp.patient_id as "patientId",
      pp.total_amount_cents / 100.0 as "totalAmount",
      pp.installment_amount_cents / 100.0 as "monthlyPayment",
      pp.start_date as "startDate",
      pp.next_payment_date as "nextPaymentDate",
      pp.paid_amount_cents / 100.0 as "paidAmount",
      pp.remaining_amount_cents / 100.0 as "remainingAmount",
      pp.status,
      pp.notes,
      pp.created_at as "createdAt",
      p.first_name || ' ' || p.last_name as "patientName"
    from payment_plans pp
    join patients p on p.id = pp.patient_id
    where pp.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramCount = 1;

  if (patientId) {
    paramCount++;
    query += ` and pp.patient_id = $${paramCount}`;
    params.push(patientId);
  }

  if (status) {
    paramCount++;
    query += ` and pp.status = $${paramCount}`;
    params.push(status);
  }

  query += ` order by pp.created_at desc`;

  try {
    const result = await pool.query(query, params);
    res.json({ paymentPlans: result.rows });
  } catch (error) {
    logCollectionsError("Error fetching payment plans:", error);
    res.status(500).json({ error: "Failed to fetch payment plans" });
  }
});

// ============================================
// AGING REPORT
// ============================================

// Get aging report
collectionsRouter.get("/aging", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const agingReport = await collectionsService.getAgingReport(tenantId);

    res.json(agingReport);
  } catch (error) {
    logCollectionsError("Error fetching aging report:", error);
    res.status(500).json({ error: "Failed to fetch aging report" });
  }
});

// ============================================
// COLLECTION STATISTICS
// ============================================

// Get collection statistics
collectionsRouter.get("/stats", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const stats = await collectionsService.getCollectionStats(
      tenantId,
      String(startDate),
      String(endDate)
    );

    // Calculate summary metrics
    const summary = stats.reduce(
      (acc, stat) => {
        acc.totalCharges += stat.totalCharges;
        acc.totalCollected += stat.totalCollected;
        acc.collectedAtService +=
          stat.collectedAtCheckin + stat.collectedAtCheckout;
        return acc;
      },
      { totalCharges: 0, totalCollected: 0, collectedAtService: 0 }
    );

    const overallCollectionRate =
      summary.totalCharges > 0
        ? (summary.totalCollected / summary.totalCharges) * 100
        : 0;
    const serviceCollectionRate =
      summary.totalCharges > 0
        ? (summary.collectedAtService / summary.totalCharges) * 100
        : 0;

    res.json({
      stats,
      summary: {
        ...summary,
        overallCollectionRate,
        serviceCollectionRate,
      },
    });
  } catch (error) {
    logCollectionsError("Error fetching collection stats:", error);
    res.status(500).json({ error: "Failed to fetch collection stats" });
  }
});

// Update collection stats for a date
collectionsRouter.post(
  "/stats/update",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    try {
      await collectionsService.updateCollectionStats(tenantId, date);
      res.json({ success: true });
    } catch (error) {
      logCollectionsError("Error updating collection stats:", error);
      res.status(500).json({ error: "Failed to update collection stats" });
    }
  }
);

// ============================================
// STATEMENTS
// ============================================

// Generate patient statement
collectionsRouter.post(
  "/statement/:patientId",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);
    const { deliveryMethod } = req.body;

    try {
      const statementId = crypto.randomUUID();

      // Get patient balance
      const balance = await collectionsService.getPatientBalance(
        tenantId,
        patientId
      );

      if (!balance || balance.totalBalance === 0) {
        return res
          .status(400)
          .json({ error: "Patient has no outstanding balance" });
      }

      // Generate statement number
      const statementCount = await pool.query(
        `select count(*) as count from patient_statements where tenant_id = $1`,
        [tenantId]
      );
      const statementNumber = `STMT-${new Date().getFullYear()}-${String(
        parseInt(statementCount.rows[0].count) + 1
      ).padStart(6, "0")}`;

      const statementDate = new Date().toISOString().split("T")[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create statement
      await pool.query(
        `insert into patient_statements (
          id, tenant_id, patient_id, statement_date, statement_number,
          due_date, previous_balance, new_charges, payments_received,
          current_balance, current_amount, days_30_amount, days_60_amount,
          days_90_plus_amount, delivery_method, status, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          statementId,
          tenantId,
          patientId,
          statementDate,
          statementNumber,
          dueDate.toISOString().split("T")[0],
          0, // previous_balance (would calculate from last statement)
          balance.totalBalance,
          0, // payments_received (would calculate)
          balance.totalBalance,
          balance.currentBalance,
          balance.balance31_60,
          balance.balance61_90,
          balance.balanceOver90,
          deliveryMethod || "mail",
          "draft",
          req.user!.id,
        ]
      );

      await auditLog(
        tenantId,
        req.user!.id,
        "statement_generate",
        "patient_statement",
        statementId
      );

      res.status(201).json({
        id: statementId,
        statementNumber,
      });
    } catch (error) {
      logCollectionsError("Error generating statement:", error);
      res.status(500).json({ error: "Failed to generate statement" });
    }
  }
);

// Get patient statements
collectionsRouter.get(
  "/statements/:patientId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.patientId);

    try {
      const result = await pool.query(
        `select
          id,
          statement_number as "statementNumber",
          statement_date as "statementDate",
          due_date as "dueDate",
          current_balance as "currentBalance",
          status,
          delivery_method as "deliveryMethod",
          sent_at as "sentAt"
        from patient_statements
        where tenant_id = $1 and patient_id = $2
        order by statement_date desc`,
        [tenantId, patientId]
      );

      res.json({ statements: result.rows });
    } catch (error) {
      logCollectionsError("Error fetching statements:", error);
      res.status(500).json({ error: "Failed to fetch statements" });
    }
  }
);

// ============================================
// COPAY COLLECTION AND PAYMENT PROMPTS
// ============================================

// Validation schemas for copay collection
const recordCopayPaymentSchema = z.object({
  promptId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  method: z.enum(['cash', 'check', 'credit_card', 'debit_card', 'hsa_fsa', 'card_on_file']),
  referenceNumber: z.string().optional(),
  promptType: z.enum(['copay', 'balance', 'deductible', 'coinsurance', 'prepayment', 'deposit']).optional(),
  collectionPoint: z.enum(['pre_visit', 'check_in', 'checkout', 'post_visit']).optional(),
});

const saveCardSchema = z.object({
  lastFour: z.string().length(4),
  cardType: z.enum(['visa', 'mastercard', 'amex', 'discover', 'other']),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2024).max(2050),
  cardholderName: z.string().optional(),
  billingZip: z.string().optional(),
  stripePaymentMethodId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  isDefault: z.boolean().optional(),
  consentMethod: z.enum(['in_person', 'patient_portal', 'phone', 'written']).optional(),
});

const chargeCardSchema = z.object({
  patientId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  description: z.string().optional(),
  cardId: z.string().uuid().optional(),
});

const skipPromptSchema = z.object({
  reason: z.enum([
    'patient_refused',
    'no_card_available',
    'dispute',
    'hardship',
    'insurance_issue',
    'will_pay_later',
    'manager_override',
    'other',
  ]),
  notes: z.string().optional(),
});

const createPromptSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  promptType: z.enum(['copay', 'balance', 'deductible', 'coinsurance', 'prepayment', 'deposit']),
  amountCents: z.number().int().nonnegative(),
  collectionPoint: z.enum(['pre_visit', 'check_in', 'checkout', 'post_visit']),
});

/**
 * GET /api/collections/appointment/:id/due
 * Get expected copay amount due for an appointment at check-in
 */
collectionsRouter.get(
  "/appointment/:id/due",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const appointmentId = String(req.params.id);

      const copay = await copayCollectionService.getExpectedCopay(tenantId, appointmentId);

      if (!copay) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      return res.json({
        appointmentId: copay.appointmentId,
        patientId: copay.patientId,
        copayAmount: copay.copayAmountCents / 100,
        copayAmountCents: copay.copayAmountCents,
        source: copay.source,
        visitType: copay.visitType,
        payer: {
          id: copay.payerId,
          name: copay.payerName,
        },
        patientBalance: copay.patientBalance,
        totalDue: copay.totalDue,
      });
    } catch (error: unknown) {
      logCollectionsError("Error getting expected copay:", error);
      return res.status(500).json({ error: "Failed to get expected copay" });
    }
  }
);

/**
 * POST /api/collections/copay-payment
 * Record a copay payment with enhanced tracking
 */
collectionsRouter.post(
  "/copay-payment",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = recordCopayPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      let promptId = data.promptId;

      // If no prompt ID, create one first
      if (!promptId && data.appointmentId) {
        const prompt = await copayCollectionService.createCollectionPrompt(
          tenantId,
          data.appointmentId,
          data.patientId,
          data.promptType || 'copay',
          data.amountCents,
          data.collectionPoint || 'check_in'
        );
        promptId = prompt.id;
      }

      if (!promptId) {
        // Create a standalone prompt without appointment
        const prompt = await copayCollectionService.createCollectionPrompt(
          tenantId,
          '', // No appointment
          data.patientId,
          data.promptType || 'balance',
          data.amountCents,
          data.collectionPoint || 'checkout'
        );
        promptId = prompt.id;
      }

      const result = await copayCollectionService.recordPayment(
        tenantId,
        promptId,
        data.amountCents,
        data.method,
        userId,
        data.referenceNumber
      );

      await auditLog(
        tenantId,
        userId,
        "copay_payment_recorded",
        "payment",
        result.paymentId
      );

      return res.status(201).json({
        success: true,
        promptId: result.promptId,
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
      });
    } catch (error: unknown) {
      logCollectionsError("Error recording copay payment:", error);
      const message = error instanceof Error ? error.message : "Failed to record payment";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/collections/patient/:id/cards
 * Get patient's cards on file
 */
collectionsRouter.get(
  "/patient/:id/cards",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const patientId = String(req.params.id);

      const cards = await copayCollectionService.getCardOnFile(tenantId, patientId);

      return res.json({
        cards: cards.map((card) => ({
          id: card.id,
          lastFour: card.lastFour,
          cardType: card.cardType,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          cardholderName: card.cardholderName,
          isDefault: card.isDefault,
          isValid: card.isValid,
          displayName: `${card.cardType.toUpperCase()} ****${card.lastFour}`,
        })),
      });
    } catch (error: unknown) {
      logCollectionsError("Error getting cards on file:", error);
      return res.status(500).json({ error: "Failed to get cards on file" });
    }
  }
);

/**
 * POST /api/collections/patient/:id/cards
 * Save a new card on file
 */
collectionsRouter.post(
  "/patient/:id/cards",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = saveCardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const patientId = String(req.params.id);
      const data = parsed.data;

      const card = await copayCollectionService.saveCardOnFile(
        tenantId,
        patientId,
        {
          lastFour: data.lastFour,
          cardType: data.cardType,
          expiryMonth: data.expiryMonth,
          expiryYear: data.expiryYear,
          cardholderName: data.cardholderName,
          billingZip: data.billingZip,
          stripePaymentMethodId: data.stripePaymentMethodId,
          stripeCustomerId: data.stripeCustomerId,
          isDefault: data.isDefault,
          consentMethod: data.consentMethod,
        },
        userId
      );

      await auditLog(
        tenantId,
        userId,
        "card_on_file_saved",
        "card_on_file",
        card.id
      );

      return res.status(201).json({
        id: card.id,
        lastFour: card.lastFour,
        cardType: card.cardType,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: card.isDefault,
        displayName: `${card.cardType.toUpperCase()} ****${card.lastFour}`,
      });
    } catch (error: unknown) {
      logCollectionsError("Error saving card on file:", error);
      const message = error instanceof Error ? error.message : "Failed to save card on file";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/collections/charge-card
 * Charge a card on file
 */
collectionsRouter.post(
  "/charge-card",
  requireAuth,
  requireRoles(["admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = chargeCardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const data = parsed.data;

      const result = await copayCollectionService.chargeCardOnFile(
        tenantId,
        data.patientId,
        data.amountCents,
        data.description,
        data.cardId
      );

      if (!result.success) {
        await auditLog(
          tenantId,
          userId,
          "card_charge_failed",
          "patient",
          data.patientId
        );

        return res.status(400).json({
          success: false,
          error: result.error,
          declineCode: result.declineCode,
        });
      }

      await auditLog(
        tenantId,
        userId,
        "card_charged",
        "patient",
        data.patientId
      );

      return res.json({
        success: true,
        transactionId: result.transactionId,
        amount: data.amountCents / 100,
      });
    } catch (error: unknown) {
      logCollectionsError("Error charging card:", error);
      const message = error instanceof Error ? error.message : "Failed to charge card";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/collections/summary
 * Get collection summary for a date range
 */
collectionsRouter.get(
  "/summary",
  requireAuth,
  requireRoles(["admin", "billing", "manager"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId!;
      const defaultDate = new Date().toISOString().split("T")[0];
      const startDate = String(req.query.startDate || defaultDate);
      const endDate = String(req.query.endDate || startDate);

      const summary = await copayCollectionService.getCollectionSummary(tenantId, startDate, endDate);

      // Calculate totals if date range
      const totals = summary.reduce(
        (acc, day) => ({
          copaysDueCents: acc.copaysDueCents + day.copaysDueCents,
          copaysCollectedCents: acc.copaysCollectedCents + day.copaysCollectedCents,
          copaysCollectedCount: acc.copaysCollectedCount + day.copaysCollectedCount,
          balancesDueCents: acc.balancesDueCents + day.balancesDueCents,
          balancesCollectedCents: acc.balancesCollectedCents + day.balancesCollectedCents,
          paymentPlansCreated: acc.paymentPlansCreated + day.paymentPlansCreated,
        }),
        {
          copaysDueCents: 0,
          copaysCollectedCents: 0,
          copaysCollectedCount: 0,
          balancesDueCents: 0,
          balancesCollectedCents: 0,
          paymentPlansCreated: 0,
        }
      );

      const totalDue = totals.copaysDueCents + totals.balancesDueCents;
      const totalCollected = totals.copaysCollectedCents + totals.balancesCollectedCents;

      return res.json({
        startDate,
        endDate,
        days: summary,
        totals: {
          copaysDue: totals.copaysDueCents / 100,
          copaysCollected: totals.copaysCollectedCents / 100,
          copaysCollectedCount: totals.copaysCollectedCount,
          balancesDue: totals.balancesDueCents / 100,
          balancesCollected: totals.balancesCollectedCents / 100,
          totalDue: totalDue / 100,
          totalCollected: totalCollected / 100,
          collectionRate: totalDue > 0 ? ((totalCollected / totalDue) * 100).toFixed(1) : "0",
          paymentPlansCreated: totals.paymentPlansCreated,
        },
      });
    } catch (error: unknown) {
      logCollectionsError("Error getting collection summary:", error);
      return res.status(500).json({ error: "Failed to get collection summary" });
    }
  }
);

/**
 * POST /api/collections/prompt
 * Create a collection prompt
 */
collectionsRouter.post(
  "/prompt",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = createPromptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const data = parsed.data;

      const prompt = await copayCollectionService.createCollectionPrompt(
        tenantId,
        data.appointmentId || '',
        data.patientId,
        data.promptType,
        data.amountCents,
        data.collectionPoint
      );

      return res.status(201).json({
        id: prompt.id,
        appointmentId: prompt.appointmentId,
        patientId: prompt.patientId,
        promptType: prompt.promptType,
        collectionPoint: prompt.collectionPoint,
        amountDue: prompt.amountDueCents / 100,
        amountDueCents: prompt.amountDueCents,
        status: prompt.status,
      });
    } catch (error: unknown) {
      logCollectionsError("Error creating collection prompt:", error);
      const message = error instanceof Error ? error.message : "Failed to create collection prompt";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/collections/appointment/:id/prompts
 * Get pending prompts for an appointment
 */
collectionsRouter.get(
  "/appointment/:id/prompts",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const appointmentId = String(req.params.id);

      const prompts = await copayCollectionService.getPendingPrompts(tenantId, appointmentId);

      return res.json({
        prompts: prompts.map((prompt) => ({
          id: prompt.id,
          promptType: prompt.promptType,
          collectionPoint: prompt.collectionPoint,
          amountDue: prompt.amountDueCents / 100,
          amountDueCents: prompt.amountDueCents,
          collectedAmount: prompt.collectedAmountCents / 100,
          status: prompt.status,
          displayedAt: prompt.displayedAt,
        })),
      });
    } catch (error: unknown) {
      logCollectionsError("Error getting prompts:", error);
      return res.status(500).json({ error: "Failed to get prompts" });
    }
  }
);

/**
 * POST /api/collections/prompt/:id/skip
 * Skip/defer a collection prompt
 */
collectionsRouter.post(
  "/prompt/:id/skip",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk", "manager"]),
  async (req: AuthedRequest, res) => {
    const parsed = skipPromptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const promptId = String(req.params.id);
      const data = parsed.data;

      await copayCollectionService.skipCollectionPrompt(
        tenantId,
        promptId,
        data.reason,
        data.notes || null,
        userId
      );

      await auditLog(
        tenantId,
        userId,
        "collection_skipped",
        "collection_prompt",
        promptId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
      logCollectionsError("Error skipping prompt:", error);
      const message = error instanceof Error ? error.message : "Failed to skip prompt";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/collections/prompt/:id/waive
 * Waive a collection prompt
 */
collectionsRouter.post(
  "/prompt/:id/waive",
  requireAuth,
  requireRoles(["admin", "billing", "manager"]),
  async (req: AuthedRequest, res) => {
    const { reason } = req.body;

    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ error: "Reason is required" });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const promptId = String(req.params.id);

      await copayCollectionService.waiveCollectionPrompt(tenantId, promptId, reason, userId);

      await auditLog(
        tenantId,
        userId,
        "collection_waived",
        "collection_prompt",
        promptId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
      logCollectionsError("Error waiving prompt:", error);
      const message = error instanceof Error ? error.message : "Failed to waive prompt";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/collections/notify-previsit
 * Send pre-visit payment notification
 */
collectionsRouter.post(
  "/notify-previsit",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk", "billing"]),
  async (req: AuthedRequest, res) => {
    const { appointmentId, method = "both" } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: "Appointment ID is required" });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await copayCollectionService.sendPreVisitNotification(
        tenantId,
        appointmentId,
        method
      );

      await auditLog(
        tenantId,
        userId,
        "previsit_notification_sent",
        "appointment",
        appointmentId
      );

      return res.json(result);
    } catch (error: unknown) {
      logCollectionsError("Error sending notification:", error);
      const message = error instanceof Error ? error.message : "Failed to send notification";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/collections/receipt/:paymentId
 * Generate a receipt
 */
collectionsRouter.get(
  "/receipt/:paymentId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const paymentId = String(req.params.paymentId);

      const receipt = await copayCollectionService.generateReceipt(tenantId, paymentId);

      return res.json(receipt);
    } catch (error: unknown) {
      logCollectionsError("Error generating receipt:", error);
      const message = error instanceof Error ? error.message : "Failed to generate receipt";
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/collections/patient/:id/payment-plans
 * Get patient's payment plans (enhanced version)
 */
collectionsRouter.get(
  "/patient/:id/payment-plans",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const patientId = String(req.params.id);

      const plans = await copayCollectionService.getPatientPaymentPlans(tenantId, patientId);

      return res.json({
        paymentPlans: plans.map((plan) => ({
          id: plan.id,
          planNumber: plan.planNumber,
          originalAmount: plan.originalAmountCents / 100,
          remainingAmount: plan.remainingAmountCents / 100,
          monthlyPayment: plan.monthlyPaymentCents / 100,
          numberOfPayments: plan.numberOfPayments,
          paymentsMade: plan.paymentsMade,
          nextDueDate: plan.nextDueDate,
          status: plan.status,
          autoCharge: plan.autoCharge,
        })),
      });
    } catch (error: unknown) {
      logCollectionsError("Error getting payment plans:", error);
      return res.status(500).json({ error: "Failed to get payment plans" });
    }
  }
);
