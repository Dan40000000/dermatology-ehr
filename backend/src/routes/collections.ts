import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import * as collectionsService from "../services/collectionsService";
import * as costEstimator from "../services/costEstimator";
import { pool } from "../db/pool";
import crypto from "crypto";

export const collectionsRouter = Router();

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
      console.error("Error fetching patient balance:", error);
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
      console.error("Error processing payment:", error);
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
      console.error("Error creating cost estimate:", error);
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
      console.error("Error fetching estimate:", error);
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
      console.error("Error creating quick estimate:", error);
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
      console.error("Error creating payment plan:", error);
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
    console.error("Error fetching payment plans:", error);
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
    console.error("Error fetching aging report:", error);
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
    console.error("Error fetching collection stats:", error);
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
      console.error("Error updating collection stats:", error);
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
      console.error("Error generating statement:", error);
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
      console.error("Error fetching statements:", error);
      res.status(500).json({ error: "Failed to fetch statements" });
    }
  }
);
