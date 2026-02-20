import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import { billingService } from "../services/billingService";
import { logger } from "../lib/logger";

export const billingRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logBillingError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * GET /api/billing/claims
 * List claims with optional filters
 */
billingRouter.get("/claims", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const status = req.query.status as string | undefined;
  const patientId = req.query.patientId as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;

  let query = `
    SELECT c.id, c.claim_number as "claimNumber", c.total_cents as "totalCents",
           c.status, c.payer, c.payer_id as "payerId",
           c.submitted_at as "submittedAt", c.created_at as "createdAt",
           c.updated_at as "updatedAt",
           p.first_name || ' ' || p.last_name as "patientName",
           c.patient_id as "patientId", c.encounter_id as "encounterId"
    FROM claims c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (patientId) {
    query += ` AND c.patient_id = $${paramIndex}`;
    params.push(patientId);
    paramIndex++;
  }

  query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  try {
    const result = await pool.query(query, params);
    return res.json({ claims: result.rows, count: result.rows.length });
  } catch (error) {
    logBillingError("Error fetching claims", error);
    return res.status(500).json({ error: "Failed to fetch claims" });
  }
});

/**
 * GET /api/billing/claims/:id
 * Get claim details with line items
 */
billingRouter.get("/claims/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);

  try {
    const claim = await billingService.getClaimDetails(tenantId, claimId);

    if (!claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    await auditLog(tenantId, req.user!.id, "claim_viewed", "claim", claimId);
    return res.json(claim);
  } catch (error) {
    logBillingError("Error fetching claim details", error);
    return res.status(500).json({ error: "Failed to fetch claim details" });
  }
});

/**
 * POST /api/billing/claims/:id/submit
 * Submit a claim for processing
 */
billingRouter.post("/claims/:id/submit", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const userId = req.user!.id;

  try {
    await billingService.submitClaim(tenantId, claimId, userId);

    return res.status(200).json({
      claimId,
      message: "Claim submitted successfully"
    });
  } catch (error: any) {
    logBillingError("Error submitting claim", error);
    return res.status(500).json({ error: error.message || "Failed to submit claim" });
  }
});

/**
 * POST /api/billing/claims/:id/status
 * Update claim status
 */
const statusSchema = z.object({
  status: z.string().min(1),
});

billingRouter.post("/claims/:id/status", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const claimId = String(req.params.id);
  const userId = req.user!.id;

  try {
    await billingService.updateClaimStatus(tenantId, claimId, parsed.data.status, userId);

    return res.status(200).json({
      claimId,
      status: parsed.data.status,
      message: "Claim status updated successfully"
    });
  } catch (error: any) {
    logBillingError("Error updating claim status", error);
    return res.status(500).json({ error: error.message || "Failed to update claim status" });
  }
});

/**
 * GET /api/billing/charges
 * List charges with optional filters
 */
billingRouter.get("/charges", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const status = req.query.status as string | undefined;
  const encounterId = req.query.encounterId as string | undefined;
  const limit = parseInt(req.query.limit as string) || 100;

  let query = `
    SELECT c.id, c.cpt_code as "cptCode", c.description, c.quantity,
           c.fee_cents as "feeCents", c.status, c.created_at as "createdAt",
           c.encounter_id as "encounterId",
           p.first_name || ' ' || p.last_name as "patientName"
    FROM charges c
    LEFT JOIN encounters e ON e.id = c.encounter_id
    LEFT JOIN patients p ON p.id = e.patient_id
    WHERE c.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (encounterId) {
    query += ` AND c.encounter_id = $${paramIndex}`;
    params.push(encounterId);
    paramIndex++;
  }

  query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  try {
    const result = await pool.query(query, params);
    const totalCents = result.rows.reduce((sum, charge) => sum + (charge.feeCents || 0) * (charge.quantity || 1), 0);

    return res.json({
      charges: result.rows,
      count: result.rows.length,
      totalCents
    });
  } catch (error) {
    logBillingError("Error fetching charges", error);
    return res.status(500).json({ error: "Failed to fetch charges" });
  }
});

/**
 * GET /api/billing/dashboard
 * Get billing dashboard statistics
 */
billingRouter.get("/dashboard", requireAuth, requireRoles(["admin", "billing"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    // Get claim statistics
    const claimStats = await pool.query(
      `SELECT
        COUNT(*) as total_claims,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_claims,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted_claims,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_claims,
        COUNT(*) FILTER (WHERE status = 'denied') as denied_claims,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'approved'), 0) as approved_total_cents,
        COALESCE(SUM(total_cents) FILTER (WHERE status = 'submitted'), 0) as pending_total_cents
       FROM claims
       WHERE tenant_id = $1`,
      [tenantId]
    );

    // Get recent charges without claims
    const unbilledCharges = await pool.query(
      `SELECT COUNT(*) as unbilled_count,
              COALESCE(SUM(c.fee_cents * c.quantity), 0) as unbilled_total_cents
       FROM charges c
       WHERE c.tenant_id = $1
         AND c.status IN ('pending', 'ready')
         AND NOT EXISTS (
           SELECT 1 FROM claim_line_items cli
           WHERE cli.charge_id = c.id
         )`,
      [tenantId]
    );

    // Get monthly revenue
    const monthlyRevenue = await pool.query(
      `SELECT
        DATE_TRUNC('month', created_at) as month,
        COALESCE(SUM(total_cents), 0) as revenue_cents
       FROM claims
       WHERE tenant_id = $1
         AND status = 'approved'
         AND created_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC
       LIMIT 12`,
      [tenantId]
    );

    return res.json({
      claimStats: claimStats.rows[0],
      unbilledCharges: unbilledCharges.rows[0],
      monthlyRevenue: monthlyRevenue.rows
    });
  } catch (error) {
    logBillingError("Error fetching billing dashboard", error);
    return res.status(500).json({ error: "Failed to fetch billing dashboard" });
  }
});
