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

const optionalDateString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);

const contactMethodSchema = z.enum([
  "phone",
  "text",
  "email",
  "mail",
  "portal",
  "in_person",
  "statement",
  "other",
]);

const contactOutcomeSchema = z.enum([
  "no_answer",
  "left_voicemail",
  "left_message",
  "spoke_patient",
  "spoke_guarantor",
  "promise_to_pay",
  "payment_plan_requested",
  "partial_payment_expected",
  "dispute_opened",
  "financial_assistance_requested",
  "insurance_follow_up",
  "insurance_issue",
  "wrong_number",
  "bad_address",
  "refused_to_pay",
  "do_not_contact",
  "resolved",
]);

const collectionContactAttemptSchema = z.object({
  amountDue: z.number().nonnegative().optional(),
  amountCollected: z.number().nonnegative().optional(),
  contactMethod: contactMethodSchema,
  contactDirection: z.enum(["outbound", "inbound"]).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  outcome: contactOutcomeSchema,
  notes: z.string().trim().max(4000).optional(),
  patientResponse: z.string().trim().max(4000).optional(),
  staffNextStep: z.string().trim().max(1000).optional(),
  nextFollowUpDate: optionalDateString,
  followUpStatus: z.enum(["open", "scheduled", "resolved", "paused", "do_not_contact"]).optional(),
  assignedTo: z.string().optional(),
  patientPromisedAmount: z.number().nonnegative().optional(),
  patientPromisedDate: optionalDateString,
  disputeStatus: z.enum(["none", "opened", "under_review", "resolved"]).optional(),
  financialAssistanceStatus: z.enum(["not_discussed", "discussed", "application_sent", "application_received", "approved", "denied"]).optional(),
  paymentPlanDiscussed: z.boolean().optional(),
  financialAssistanceDiscussed: z.boolean().optional(),
  contactPreferenceConfirmed: z.boolean().optional(),
  doNotContact: z.boolean().optional(),
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
      if (error instanceof Error && error.name === "UnpricedCptCodesError") {
        const codes = Array.isArray((error as costEstimator.UnpricedCptCodesError).codes)
          ? (error as costEstimator.UnpricedCptCodesError).codes
          : [];
        return res.status(400).json({ error: error.message, codes });
      }
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

// Share an estimate with the patient portal
collectionsRouter.post(
  "/estimate/:estimateId/share",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const estimateId = String(req.params.estimateId);

    try {
      const shared = await costEstimator.shareEstimateWithPatient(tenantId, estimateId, req.user!.id);

      if (!shared) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      await auditLog(
        tenantId,
        req.user!.id,
        "cost_estimate_shared_with_patient",
        "cost_estimate",
        estimateId
      );

      return res.json({
        success: true,
        estimateId,
        patientId: shared.patientId,
        sharedAt: shared.sharedAt,
      });
    } catch (error) {
      logCollectionsError("Error sharing cost estimate:", error);
      return res.status(500).json({ error: "Failed to share cost estimate" });
    }
  }
);

const revokeEstimateSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

collectionsRouter.post(
  "/estimate/:estimateId/revoke",
  requireAuth,
  requireRoles(["provider", "admin", "billing", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = revokeEstimateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
    try {
      const result = await costEstimator.revokeEstimate(
        req.user!.tenantId,
        String(req.params.estimateId),
        req.user!.id,
        parsed.data.reason
      );
      if (!result) return res.status(404).json({ error: "Active estimate not found" });
      await auditLog(req.user!.tenantId, req.user!.id, "cost_estimate_revoked", "cost_estimate", String(req.params.estimateId));
      return res.json({ success: true, ...result });
    } catch (error) {
      logCollectionsError("Error revoking cost estimate:", error);
      return res.status(500).json({ error: "Failed to revoke cost estimate" });
    }
  }
);

const reviseEstimateSchema = z.object({
  serviceType: z.string().trim().min(1).optional(),
  cptCodes: z.array(z.string().trim().min(1)).min(1),
  isCosmetic: z.boolean().optional(),
  appointmentId: z.string().optional(),
});

collectionsRouter.post(
  "/estimate/:estimateId/revise",
  requireAuth,
  requireRoles(["provider", "admin", "billing", "front_desk"]),
  async (req: AuthedRequest, res) => {
    const parsed = reviseEstimateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
    try {
      const estimate = await costEstimator.reviseEstimate(
        req.user!.tenantId,
        String(req.params.estimateId),
        { ...parsed.data, userId: req.user!.id }
      );
      if (!estimate) return res.status(404).json({ error: "Estimate not found or cannot be revised" });
      await auditLog(req.user!.tenantId, req.user!.id, "cost_estimate_revised", "cost_estimate", estimate.id);
      return res.status(201).json({ estimate });
    } catch (error) {
      logCollectionsError("Error revising cost estimate:", error);
      return res.status(500).json({ error: "Failed to revise cost estimate" });
    }
  }
);

collectionsRouter.get("/patient/:id/estimates", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT ce.*,
              cer.actual_allowed_amount,
              cer.actual_insurance_payment,
              cer.actual_patient_responsibility,
              cer.allowed_variance,
              cer.patient_variance,
              cer.accuracy_percent,
              cer.reconciled_at
       FROM cost_estimates ce
       LEFT JOIN cost_estimate_reconciliations cer
         ON cer.tenant_id = ce.tenant_id AND cer.estimate_id = ce.id
       WHERE ce.tenant_id = $1 AND ce.patient_id = $2
       ORDER BY ce.created_at DESC`,
      [req.user!.tenantId, req.params.id]
    );
    return res.json({ estimates: result.rows });
  } catch (error) {
    logCollectionsError("Error listing patient cost estimates:", error);
    return res.status(500).json({ error: "Failed to list cost estimates" });
  }
});

collectionsRouter.get("/estimate/:estimateId/events", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT e.* FROM cost_estimate_events e
       JOIN cost_estimates ce ON ce.id = e.estimate_id AND ce.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.estimate_id = $2
       ORDER BY e.created_at DESC`,
      [req.user!.tenantId, req.params.estimateId]
    );
    return res.json({ events: result.rows });
  } catch (error) {
    logCollectionsError("Error fetching cost estimate events:", error);
    return res.status(500).json({ error: "Failed to fetch estimate events" });
  }
});

const reconciliationSchema = z.object({
  claimId: z.string().optional(),
  eraPaymentId: z.string().optional(),
  actualAllowedAmount: z.number().nonnegative().optional(),
  actualInsurancePayment: z.number().nonnegative().optional(),
  actualPatientResponsibility: z.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine(value => Boolean(value.eraPaymentId) || (
  value.actualAllowedAmount !== undefined &&
  value.actualInsurancePayment !== undefined &&
  value.actualPatientResponsibility !== undefined
), { message: "Provide an ERA payment id or all actual amounts" });

collectionsRouter.post(
  "/estimate/:estimateId/reconcile",
  requireAuth,
  requireRoles(["admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = reconciliationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
    const tenantId = req.user!.tenantId;
    const estimateId = String(req.params.estimateId);
    try {
      const estimateResult = await pool.query(
        `SELECT patient_id as "patientId", estimated_allowed_amount as "estimatedAllowed",
                estimated_patient_responsibility as "estimatedPatient"
         FROM cost_estimates WHERE id = $1 AND tenant_id = $2`,
        [estimateId, tenantId]
      );
      if (!estimateResult.rowCount) return res.status(404).json({ error: "Estimate not found" });

      let actualAllowed = parsed.data.actualAllowedAmount;
      let actualInsurance = parsed.data.actualInsurancePayment;
      let actualPatient = parsed.data.actualPatientResponsibility;
      let claimId = parsed.data.claimId || null;
      if (parsed.data.eraPaymentId) {
        const era = await pool.query(
          `SELECT claim_id as "claimId", allowed_amount_cents / 100.0 as "allowed",
                  paid_amount_cents / 100.0 as "insurance",
                  patient_responsibility_cents / 100.0 as "patient"
           FROM era_payments WHERE id = $1 AND tenant_id = $2`,
          [parsed.data.eraPaymentId, tenantId]
        );
        if (!era.rowCount) return res.status(404).json({ error: "ERA payment not found" });
        claimId = claimId || era.rows[0].claimId || null;
        actualAllowed = Number(era.rows[0].allowed || 0);
        actualInsurance = Number(era.rows[0].insurance || 0);
        actualPatient = Number(era.rows[0].patient || 0);
      }

      const estimate = estimateResult.rows[0];
      const { allowedVariance, patientVariance, accuracyPercent } = costEstimator.calculateEstimateReconciliation({
        estimatedAllowedAmount: Number(estimate.estimatedAllowed || 0),
        estimatedPatientResponsibility: Number(estimate.estimatedPatient || 0),
        actualAllowedAmount: Number(actualAllowed),
        actualPatientResponsibility: Number(actualPatient),
      });
      const reconciliationId = crypto.randomUUID();
      const result = await pool.query(
        `INSERT INTO cost_estimate_reconciliations (
           id, tenant_id, estimate_id, claim_id, era_payment_id,
           actual_allowed_amount, actual_insurance_payment, actual_patient_responsibility,
           allowed_variance, patient_variance, accuracy_percent, reconciled_by, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (tenant_id, estimate_id) DO UPDATE SET
           claim_id = EXCLUDED.claim_id, era_payment_id = EXCLUDED.era_payment_id,
           actual_allowed_amount = EXCLUDED.actual_allowed_amount,
           actual_insurance_payment = EXCLUDED.actual_insurance_payment,
           actual_patient_responsibility = EXCLUDED.actual_patient_responsibility,
           allowed_variance = EXCLUDED.allowed_variance,
           patient_variance = EXCLUDED.patient_variance,
           accuracy_percent = EXCLUDED.accuracy_percent,
           reconciled_by = EXCLUDED.reconciled_by, reconciled_at = now(), notes = EXCLUDED.notes
         RETURNING *`,
        [reconciliationId, tenantId, estimateId, claimId, parsed.data.eraPaymentId || null,
          actualAllowed, actualInsurance, actualPatient, allowedVariance, patientVariance,
          accuracyPercent, req.user!.id, parsed.data.notes || null]
      );
      await pool.query(`UPDATE cost_estimates SET status = 'reconciled', reconciled_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`, [estimateId, tenantId]);
      await costEstimator.recordEstimateEvent(tenantId, estimateId, String(estimate.patientId), "staff", req.user!.id, "reconciled", parsed.data.notes || null, { claimId, eraPaymentId: parsed.data.eraPaymentId || null });
      await auditLog(tenantId, req.user!.id, "cost_estimate_reconciled", "cost_estimate", estimateId);
      return res.json({ reconciliation: result.rows[0] });
    } catch (error) {
      logCollectionsError("Error reconciling cost estimate:", error);
      return res.status(500).json({ error: "Failed to reconcile cost estimate" });
    }
  }
);

const prescriptionEstimateSchema = z.object({
  patientId: z.string().min(1),
  medicationName: z.string().trim().min(1),
  ndc: z.string().trim().optional(),
  quantity: z.number().positive().optional(),
  daysSupply: z.number().int().positive().optional(),
  pharmacyName: z.string().trim().optional(),
  cashPrice: z.number().nonnegative().optional(),
  insurancePrice: z.number().nonnegative().optional(),
  patientPrice: z.number().nonnegative(),
  formularyStatus: z.string().optional(),
  priorAuthRequired: z.boolean().optional(),
  pricingSource: z.string().trim().min(1),
  environment: z.enum(["production", "sandbox", "mock"]),
  responseReference: z.string().trim().min(1),
  validUntil: z.string().datetime().optional(),
});

collectionsRouter.post(
  "/prescription-estimate",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    const parsed = prescriptionEstimateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
    const id = crypto.randomUUID();
    const data = parsed.data;
    try {
      const result = await pool.query(
        `INSERT INTO prescription_cost_estimates (
           id, tenant_id, patient_id, medication_name, ndc, quantity, days_supply,
           pharmacy_name, cash_price, insurance_price, patient_price, formulary_status,
           prior_auth_required, pricing_source, environment, response_reference,
           valid_until, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [id, req.user!.tenantId, data.patientId, data.medicationName, data.ndc || null,
          data.quantity || null, data.daysSupply || null, data.pharmacyName || null,
          data.cashPrice ?? null, data.insurancePrice ?? null, data.patientPrice,
          data.formularyStatus || null, data.priorAuthRequired || false, data.pricingSource,
          data.environment, data.responseReference,
          data.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), req.user!.id]
      );
      await auditLog(req.user!.tenantId, req.user!.id, "prescription_cost_estimate_create", "prescription_cost_estimate", id);
      return res.status(201).json({ estimate: result.rows[0] });
    } catch (error) {
      logCollectionsError("Error saving prescription estimate:", error);
      return res.status(500).json({ error: "Failed to save prescription estimate" });
    }
  }
);

collectionsRouter.post(
  "/prescription-estimate/:estimateId/share",
  requireAuth,
  requireRoles(["provider", "admin", "billing"]),
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query(
        `UPDATE prescription_cost_estimates
         SET shown_to_patient = true, shown_at = now()
         WHERE id = $1 AND tenant_id = $2
           AND (valid_until IS NULL OR valid_until >= now())
         RETURNING id, patient_id as "patientId", shown_at as "sharedAt", environment`,
        [req.params.estimateId, req.user!.tenantId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Active prescription estimate not found" });
      await auditLog(req.user!.tenantId, req.user!.id, "prescription_cost_estimate_shared", "prescription_cost_estimate", String(req.params.estimateId));
      return res.json({ success: true, ...result.rows[0] });
    } catch (error) {
      logCollectionsError("Error sharing prescription estimate:", error);
      return res.status(500).json({ error: "Failed to share prescription estimate" });
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
            id, tenant_id, patient_id,
            total_amount, remaining_balance, monthly_payment, number_of_payments,
            total_amount_cents,
            installment_amount_cents, frequency, start_date,
            next_payment_date, paid_amount_cents, remaining_amount_cents,
            status, auto_charge, payment_method_id, notes, created_by
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            planId,
            tenantId,
            payload.patientId,
            payload.totalAmount,
            payload.totalAmount,
            payload.monthlyPayment,
            payload.numberOfPayments,
            Math.round(payload.totalAmount * 100),
            Math.round(payload.monthlyPayment * 100),
            "monthly",
            payload.startDate,
            nextPaymentDate.toISOString().split("T")[0],
            0,
            Math.round(payload.totalAmount * 100),
            "active",
            payload.autoCharge || false,
            payload.cardOnFileId || null,
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

collectionsRouter.get(
  "/patient/:id/activity",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.id);

    try {
      const activity = await collectionsService.getPatientCollectionActivity(
        tenantId,
        patientId
      );

      res.json(activity);
    } catch (error) {
      logCollectionsError("Error fetching patient collection activity:", error);
      res.status(500).json({ error: "Failed to fetch patient collection activity" });
    }
  }
);

collectionsRouter.post(
  "/patient/:id/contact-attempts",
  requireAuth,
  requireRoles(["admin", "billing", "front_desk", "manager"]),
  async (req: AuthedRequest, res) => {
    const parsed = collectionContactAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const patientId = String(req.params.id);

    try {
      const attemptId = await collectionsService.createCollectionContactAttempt(
        tenantId,
        {
          ...parsed.data,
          patientId,
          attemptedBy: req.user!.id,
        }
      );

      await auditLog(
        tenantId,
        req.user!.id,
        "collection_contact_attempt_create",
        "collection_attempt",
        attemptId
      );

      res.status(201).json({ id: attemptId });
    } catch (error) {
      logCollectionsError("Error recording collection contact attempt:", error);
      res.status(500).json({ error: "Failed to record collection contact attempt" });
    }
  }
);

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
          due_date, balance_cents, previous_balance, new_charges, payments_received,
          current_balance, current_amount, days_30_amount, days_60_amount,
          days_90_plus_amount, sent_via, delivery_method, status, generated_by, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          statementId,
          tenantId,
          patientId,
          statementDate,
          statementNumber,
          dueDate.toISOString().split("T")[0],
          Math.round(balance.totalBalance * 100),
          0, // previous_balance (would calculate from last statement)
          balance.totalBalance,
          0, // payments_received (would calculate)
          balance.totalBalance,
          balance.currentBalance,
          balance.balance31_60,
          balance.balance61_90,
          balance.balanceOver90,
          deliveryMethod || "mail",
          deliveryMethod || "mail",
          "draft",
          req.user!.id,
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
