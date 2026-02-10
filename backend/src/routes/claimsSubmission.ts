/**
 * Claims Submission API Routes
 *
 * Handles claim submission to clearinghouses, status tracking, batch operations,
 * and remittance processing.
 */

import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";
import {
  submitClaim,
  checkClaimStatus,
  submitBatch,
  processRemittance,
  getPendingClaims,
  generateX12Claim,
} from "../services/clearinghouseService";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const submitClaimSchema = z.object({
  claimId: z.string().uuid(),
  clearinghouseId: z.string().uuid().optional(),
});

const batchSubmitSchema = z.object({
  claimIds: z.array(z.string().uuid()).min(1).max(100),
  clearinghouseId: z.string().uuid().optional(),
});

const resubmitClaimSchema = z.object({
  clearinghouseId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const processRemittanceSchema = z.object({
  era835Data: z.string().optional(),
  remittance: z
    .object({
      claimId: z.string().uuid().optional(),
      eraNumber: z.string(),
      paymentAmount: z.number(),
      adjustmentCodes: z.array(
        z.object({
          code: z.string(),
          group: z.string(),
          reason: z.string(),
          amount: z.number(),
        })
      ),
      patientResponsibility: z.number(),
      serviceLines: z.array(
        z.object({
          lineNumber: z.number(),
          cptCode: z.string(),
          chargeAmount: z.number(),
          paidAmount: z.number(),
          adjustments: z.array(
            z.object({
              code: z.string(),
              reason: z.string(),
              amount: z.number(),
            })
          ),
          remarkCodes: z.array(z.string()).optional(),
        })
      ),
    })
    .optional(),
});

const clearinghouseConfigSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["change_healthcare", "availity", "trizetto", "waystar", "custom"]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  apiEndpoint: z.string().url().optional(),
  apiVersion: z.string().optional(),
  sftpHost: z.string().optional(),
  sftpPort: z.number().int().positive().optional(),
  senderId: z.string().optional(),
  senderQualifier: z.string().default("ZZ"),
  receiverId: z.string().optional(),
  receiverQualifier: z.string().default("ZZ"),
  submitterId: z.string().optional(),
  tradingPartnerId: z.string().optional(),
  submissionFormat: z.enum(["837P", "837I", "CMS1500", "UB04"]).default("837P"),
  submissionMethod: z.enum(["api", "sftp", "direct"]).default("api"),
  batchEnabled: z.boolean().default(true),
  maxBatchSize: z.number().int().positive().default(100),
  notes: z.string().optional(),
});

export const claimsSubmissionRouter = Router();

// ============================================================================
// CLAIM SUBMISSION
// ============================================================================

/**
 * POST /api/claims/submit
 * Submit a single claim to clearinghouse
 */
claimsSubmissionRouter.post(
  "/submit",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = submitClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { claimId, clearinghouseId } = parsed.data;

      // Get default clearinghouse if not specified
      let targetClearinghouseId = clearinghouseId;
      if (!targetClearinghouseId) {
        const defaultResult = await pool.query(
          `SELECT id FROM clearinghouse_configs
           WHERE tenant_id = $1 AND is_default = TRUE AND is_active = TRUE`,
          [tenantId]
        );
        if (defaultResult.rowCount) {
          targetClearinghouseId = defaultResult.rows[0].id;
        } else {
          return res.status(400).json({
            error: "No clearinghouse specified and no default configured",
          });
        }
      }

      if (!targetClearinghouseId) {
        return res.status(400).json({ error: "No clearinghouse available" });
      }

      const submission = await submitClaim(tenantId, claimId, targetClearinghouseId, userId);

      res.status(201).json({
        success: true,
        submission: {
          id: submission.id,
          claimId: submission.claimId,
          x12ClaimId: submission.x12ClaimId,
          status: submission.status,
          statusMessage: submission.statusMessage,
          submittedAt: submission.submissionDate,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/claims/:id/status
 * Get claim status from clearinghouse
 */
claimsSubmissionRouter.get(
  "/:id/status",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const claimId = req.params.id;

      const statusResult = await checkClaimStatus(tenantId, claimId!, req.user!.id);

      res.json(statusResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Status check failed";
      if (message.includes("not found")) {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/claims/batch-submit
 * Submit multiple claims in a batch
 */
claimsSubmissionRouter.post(
  "/batch-submit",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = batchSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { claimIds, clearinghouseId } = parsed.data;

      // Get default clearinghouse if not specified
      let targetClearinghouseId = clearinghouseId;
      if (!targetClearinghouseId) {
        const defaultResult = await pool.query(
          `SELECT id FROM clearinghouse_configs
           WHERE tenant_id = $1 AND is_default = TRUE AND is_active = TRUE`,
          [tenantId]
        );
        if (defaultResult.rowCount) {
          targetClearinghouseId = defaultResult.rows[0].id;
        } else {
          return res.status(400).json({
            error: "No clearinghouse specified and no default configured",
          });
        }
      }

      if (!targetClearinghouseId) {
        return res.status(400).json({ error: "No clearinghouse available" });
      }

      const result = await submitBatch(tenantId, claimIds, targetClearinghouseId, userId);

      res.status(201).json({
        success: true,
        batch: {
          id: result.batchId,
          totalClaims: result.totalClaims,
          submitted: result.submitted,
          failed: result.failed,
          errors: result.errors,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch submission failed";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/claims/pending
 * Get claims pending clearinghouse response
 */
claimsSubmissionRouter.get(
  "/pending",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { clearinghouseId, limit } = req.query;

      const pendingClaims = await getPendingClaims(tenantId, {
        clearinghouseId: clearinghouseId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.json({ claims: pendingClaims });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get pending claims";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/claims/:id/resubmit
 * Resubmit a rejected claim
 */
claimsSubmissionRouter.post(
  "/:id/resubmit",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = resubmitClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const claimId = req.params.id;
      const { clearinghouseId, notes } = parsed.data;

      // Get the claim and verify it can be resubmitted
      const claimResult = await pool.query(
        `SELECT id, status, claim_number FROM claims WHERE id = $1 AND tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        return res.status(404).json({ error: "Claim not found" });
      }

      const claim = claimResult.rows[0];

      if (!["rejected", "denied"].includes(claim.status)) {
        return res.status(400).json({
          error: `Cannot resubmit claim with status: ${claim.status}`,
        });
      }

      // Reset claim status to allow resubmission
      await pool.query(
        `UPDATE claims SET status = 'ready', updated_at = NOW() WHERE id = $1`,
        [claimId]
      );

      // Add note about resubmission
      await pool.query(
        `INSERT INTO claim_status_history (id, tenant_id, claim_id, status, notes, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          claimId,
          "ready",
          notes || "Claim prepared for resubmission",
          userId,
        ]
      );

      // Get clearinghouse
      let targetClearinghouseId = clearinghouseId;
      if (!targetClearinghouseId) {
        const defaultResult = await pool.query(
          `SELECT id FROM clearinghouse_configs
           WHERE tenant_id = $1 AND is_default = TRUE AND is_active = TRUE`,
          [tenantId]
        );
        if (defaultResult.rowCount) {
          targetClearinghouseId = defaultResult.rows[0].id;
        } else {
          return res.status(400).json({
            error: "No clearinghouse specified and no default configured",
          });
        }
      }

      if (!targetClearinghouseId) {
        return res.status(400).json({ error: "No clearinghouse available" });
      }

      // Submit the claim
      const submission = await submitClaim(tenantId, claimId!, targetClearinghouseId, userId);

      await auditLog(tenantId, userId, "claim_resubmitted", "claim", claimId!);

      res.status(201).json({
        success: true,
        submission: {
          id: submission.id,
          claimId: submission.claimId,
          x12ClaimId: submission.x12ClaimId,
          status: submission.status,
          statusMessage: submission.statusMessage,
          submittedAt: submission.submissionDate,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resubmission failed";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/claims/:id/x12
 * Generate and return X12 837P for a claim
 */
claimsSubmissionRouter.get(
  "/:id/x12",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const claimId = req.params.id;

      // Get claim's encounter ID
      const claimResult = await pool.query(
        `SELECT encounter_id FROM claims WHERE id = $1 AND tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        return res.status(404).json({ error: "Claim not found" });
      }

      const encounterId = claimResult.rows[0].encounter_id;
      if (!encounterId) {
        return res.status(400).json({ error: "Claim has no associated encounter" });
      }

      const { x12Content, controlNumbers } = await generateX12Claim(tenantId, encounterId);

      res.json({
        x12Content,
        controlNumbers,
        format: "837P",
        version: "005010X222A1",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "X12 generation failed";
      res.status(500).json({ error: message });
    }
  }
);

// ============================================================================
// REMITTANCE PROCESSING
// ============================================================================

/**
 * POST /api/claims/remittance
 * Process ERA/835 remittance data
 */
claimsSubmissionRouter.post(
  "/remittance",
  requireAuth,
  requireRoles(["provider", "admin", "front_desk"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = processRemittanceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { era835Data, remittance } = parsed.data;

      if (!era835Data && !remittance) {
        return res.status(400).json({
          error: "Either era835Data or remittance object is required",
        });
      }

      const result = await processRemittance(
        tenantId,
        era835Data || (remittance as unknown as import("../services/clearinghouseService").RemittanceAdvice),
        userId
      );

      res.status(201).json({
        success: true,
        remittance: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Remittance processing failed";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/claims/remittances
 * List all remittance advices
 */
claimsSubmissionRouter.get(
  "/remittances",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { status, startDate, endDate, limit = "100" } = req.query;

      let query = `
        SELECT
          ra.id,
          ra.claim_id as "claimId",
          ra.era_number as "eraNumber",
          ra.era_date as "eraDate",
          ra.payer_name as "payerName",
          ra.payment_amount as "paymentAmount",
          ra.patient_responsibility as "patientResponsibility",
          ra.status,
          ra.reconciled,
          ra.created_at as "createdAt",
          c.claim_number as "claimNumber",
          CONCAT(p.first_name, ' ', p.last_name) as "patientName"
        FROM remittance_advices ra
        LEFT JOIN claims c ON c.id = ra.claim_id
        LEFT JOIN patients p ON p.id = c.patient_id
        WHERE ra.tenant_id = $1
      `;

      const params: (string | number)[] = [tenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND ra.status = $${paramIndex}`;
        params.push(status as string);
        paramIndex++;
      }

      if (startDate) {
        query += ` AND ra.era_date >= $${paramIndex}`;
        params.push(startDate as string);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND ra.era_date <= $${paramIndex}`;
        params.push(endDate as string);
        paramIndex++;
      }

      query += ` ORDER BY ra.created_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string, 10));

      const result = await pool.query(query, params);

      res.json({ remittances: result.rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get remittances";
      res.status(500).json({ error: message });
    }
  }
);

// ============================================================================
// CLEARINGHOUSE CONFIGURATION
// ============================================================================

/**
 * GET /api/claims/clearinghouses
 * List clearinghouse configurations
 */
claimsSubmissionRouter.get(
  "/clearinghouses",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await pool.query(
        `SELECT
          id, name, type, is_active as "isActive", is_default as "isDefault",
          api_endpoint as "apiEndpoint", submission_format as "submissionFormat",
          submission_method as "submissionMethod", batch_enabled as "batchEnabled",
          max_batch_size as "maxBatchSize", created_at as "createdAt"
        FROM clearinghouse_configs
        WHERE tenant_id = $1
        ORDER BY is_default DESC, name ASC`,
        [tenantId]
      );

      res.json({ clearinghouses: result.rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get clearinghouses";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * POST /api/claims/clearinghouses
 * Create a new clearinghouse configuration
 */
claimsSubmissionRouter.post(
  "/clearinghouses",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = clearinghouseConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const config = parsed.data;
      const configId = crypto.randomUUID();

      // If setting as default, unset other defaults first
      if (config.isDefault) {
        await pool.query(
          `UPDATE clearinghouse_configs SET is_default = FALSE WHERE tenant_id = $1`,
          [tenantId]
        );
      }

      await pool.query(
        `INSERT INTO clearinghouse_configs (
          id, tenant_id, name, type, is_active, is_default,
          api_endpoint, api_version, sftp_host, sftp_port,
          sender_id, sender_qualifier, receiver_id, receiver_qualifier,
          submitter_id, trading_partner_id, submission_format,
          submission_method, batch_enabled, max_batch_size, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          configId,
          tenantId,
          config.name,
          config.type,
          config.isActive,
          config.isDefault,
          config.apiEndpoint,
          config.apiVersion,
          config.sftpHost,
          config.sftpPort,
          config.senderId,
          config.senderQualifier,
          config.receiverId,
          config.receiverQualifier,
          config.submitterId,
          config.tradingPartnerId,
          config.submissionFormat,
          config.submissionMethod,
          config.batchEnabled,
          config.maxBatchSize,
          config.notes,
          userId,
        ]
      );

      await auditLog(tenantId, userId, "clearinghouse_created", "clearinghouse_config", configId);

      res.status(201).json({ id: configId, ...config });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create clearinghouse";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * PUT /api/claims/clearinghouses/:id
 * Update clearinghouse configuration
 */
claimsSubmissionRouter.put(
  "/clearinghouses/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = clearinghouseConfigSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const configId = req.params.id;
      const updates = parsed.data;

      // Verify config exists
      const existingResult = await pool.query(
        `SELECT id FROM clearinghouse_configs WHERE id = $1 AND tenant_id = $2`,
        [configId, tenantId]
      );

      if (!existingResult.rowCount) {
        return res.status(404).json({ error: "Clearinghouse configuration not found" });
      }

      // If setting as default, unset other defaults first
      if (updates.isDefault) {
        await pool.query(
          `UPDATE clearinghouse_configs SET is_default = FALSE WHERE tenant_id = $1 AND id != $2`,
          [tenantId, configId]
        );
      }

      // Build update query dynamically
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const fieldMap: Record<string, string> = {
        name: "name",
        type: "type",
        isActive: "is_active",
        isDefault: "is_default",
        apiEndpoint: "api_endpoint",
        apiVersion: "api_version",
        sftpHost: "sftp_host",
        sftpPort: "sftp_port",
        senderId: "sender_id",
        senderQualifier: "sender_qualifier",
        receiverId: "receiver_id",
        receiverQualifier: "receiver_qualifier",
        submitterId: "submitter_id",
        tradingPartnerId: "trading_partner_id",
        submissionFormat: "submission_format",
        submissionMethod: "submission_method",
        batchEnabled: "batch_enabled",
        maxBatchSize: "max_batch_size",
        notes: "notes",
      };

      for (const [key, value] of Object.entries(updates)) {
        if (fieldMap[key] && value !== undefined) {
          setClauses.push(`${fieldMap[key]} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      setClauses.push(`updated_at = NOW()`);
      setClauses.push(`updated_by = $${paramIndex}`);
      values.push(userId);
      paramIndex++;

      values.push(configId);
      values.push(tenantId);

      await pool.query(
        `UPDATE clearinghouse_configs SET ${setClauses.join(", ")}
         WHERE id = $${paramIndex - 1} AND tenant_id = $${paramIndex}`,
        values
      );

      await auditLog(tenantId, userId, "clearinghouse_updated", "clearinghouse_config", configId!);

      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update clearinghouse";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * DELETE /api/claims/clearinghouses/:id
 * Delete clearinghouse configuration
 */
claimsSubmissionRouter.delete(
  "/clearinghouses/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const configId = req.params.id;

      // Check if clearinghouse has submissions
      const submissionsResult = await pool.query(
        `SELECT COUNT(*) as count FROM claim_submissions WHERE clearinghouse_id = $1`,
        [configId]
      );

      if (parseInt(submissionsResult.rows[0].count, 10) > 0) {
        // Soft delete by deactivating
        await pool.query(
          `UPDATE clearinghouse_configs SET is_active = FALSE, is_default = FALSE, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [configId, tenantId]
        );
      } else {
        // Hard delete
        await pool.query(
          `DELETE FROM clearinghouse_configs WHERE id = $1 AND tenant_id = $2`,
          [configId, tenantId]
        );
      }

      await auditLog(tenantId, userId, "clearinghouse_deleted", "clearinghouse_config", configId!);

      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete clearinghouse";
      res.status(500).json({ error: message });
    }
  }
);

// ============================================================================
// SUBMISSION HISTORY
// ============================================================================

/**
 * GET /api/claims/:id/submissions
 * Get submission history for a claim
 */
claimsSubmissionRouter.get(
  "/:id/submissions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const claimId = req.params.id;

      const result = await pool.query(
        `SELECT
          cs.id,
          cs.submission_date as "submissionDate",
          cs.submission_number as "submissionNumber",
          cs.x12_claim_id as "x12ClaimId",
          cs.status,
          cs.status_code as "statusCode",
          cs.status_message as "statusMessage",
          cs.error_code as "errorCode",
          cs.error_message as "errorMessage",
          cs.retry_count as "retryCount",
          cc.name as "clearinghouseName",
          cc.type as "clearinghouseType"
        FROM claim_submissions cs
        LEFT JOIN clearinghouse_configs cc ON cc.id = cs.clearinghouse_id
        WHERE cs.claim_id = $1 AND cs.tenant_id = $2
        ORDER BY cs.submission_date DESC`,
        [claimId, tenantId]
      );

      res.json({ submissions: result.rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get submissions";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /api/claims/batches
 * List submission batches
 */
claimsSubmissionRouter.get(
  "/batches",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { status, limit = "50" } = req.query;

      let query = `
        SELECT
          b.id,
          b.batch_number as "batchNumber",
          b.batch_date as "batchDate",
          b.total_claims as "totalClaims",
          b.submitted_count as "submittedCount",
          b.accepted_count as "acceptedCount",
          b.rejected_count as "rejectedCount",
          b.pending_count as "pendingCount",
          b.status,
          b.submitted_at as "submittedAt",
          cc.name as "clearinghouseName"
        FROM claim_submission_batches b
        LEFT JOIN clearinghouse_configs cc ON cc.id = b.clearinghouse_id
        WHERE b.tenant_id = $1
      `;

      const params: (string | number)[] = [tenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND b.status = $${paramIndex}`;
        params.push(status as string);
        paramIndex++;
      }

      query += ` ORDER BY b.batch_date DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string, 10));

      const result = await pool.query(query, params);

      res.json({ batches: result.rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get batches";
      res.status(500).json({ error: message });
    }
  }
);

export default claimsSubmissionRouter;
