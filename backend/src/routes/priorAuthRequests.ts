/**
 * Prior Authorization Requests API Routes
 * MVP Backend for electronic prior authorization workflow.
 *
 * Routes:
 * - POST   /api/prior-auth-requests         Create new PA request
 * - GET    /api/prior-auth-requests         List PA requests (filtered)
 * - GET    /api/prior-auth-requests/:id     Get single PA request
 * - POST   /api/prior-auth-requests/:id/submit  Submit PA to payer
 * - GET    /api/prior-auth-requests/:id/status  Check PA status
 * - PATCH  /api/prior-auth-requests/:id     Update PA request
 */

import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../db/pool";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getPriorAuthAdapter } from "../services/priorAuthAdapter";
import { auditLog } from "../services/audit";

const router = Router();
router.use(requireAuth);

const createPARequestSchema = z.object({
  patientId: z.string().min(1, "Patient ID required"),
  prescriptionId: z.string().optional(),
  medicationName: z.string().optional(),
  medicationStrength: z.string().optional(),
  medicationQuantity: z.number().int().positive().optional(),
  sig: z.string().optional(),
  payer: z.string().min(1, "Payer name required"),
  memberId: z.string().min(1, "Member ID required"),
  prescriberId: z.string().optional(),
  prescriberNpi: z.string().optional(),
  prescriberName: z.string().optional(),
});

const updatePARequestSchema = z.object({
  status: z.enum(["pending", "submitted", "approved", "denied", "needs_info", "error"]).optional(),
  statusReason: z.string().optional(),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string(),
    fileType: z.string(),
    uploadedAt: z.string(),
  })).optional(),
});

// POST /api/prior-auth-requests - Create new PA request
router.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const validated = createPARequestSchema.parse(req.body);

    // Verify patient exists
    const patientCheck = await pool.query(
      "SELECT id FROM patients WHERE id = $1 AND tenant_id = $2",
      [validated.patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Get prescription data if provided
    let prescriptionData = null;
    if (validated.prescriptionId) {
      const rxCheck = await pool.query(
        "SELECT medication_name, strength, quantity, sig FROM prescriptions WHERE id = $1 AND tenant_id = $2",
        [validated.prescriptionId, tenantId]
      );
      if (rxCheck.rows.length > 0) {
        prescriptionData = rxCheck.rows[0];
      }
    }

    const paId = crypto.randomUUID();
    const now = new Date().toISOString();

    const historyEntry = {
      timestamp: now,
      event: "created",
      status: "pending",
      userId,
      notes: "PA request created",
    };

    const result = await pool.query(
      `INSERT INTO prior_auth_requests (
        id, tenant_id, patient_id, prescription_id,
        medication_name, medication_strength, medication_quantity, sig,
        payer, member_id, prescriber, prescriber_npi, prescriber_name,
        status, status_reason, history, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        paId,
        tenantId,
        validated.patientId,
        validated.prescriptionId || null,
        validated.medicationName || prescriptionData?.medication_name || null,
        validated.medicationStrength || prescriptionData?.strength || null,
        validated.medicationQuantity || prescriptionData?.quantity || null,
        validated.sig || prescriptionData?.sig || null,
        validated.payer,
        validated.memberId,
        validated.prescriberId || userId,
        validated.prescriberNpi || null,
        validated.prescriberName || null,
        "pending",
        "PA request created, awaiting submission",
        JSON.stringify([historyEntry]),
        now,
        now,
      ]
    );

    await auditLog(tenantId, userId, "prior_auth_create", "prior_auth_requests", paId);

    res.status(201).json({
      message: "Prior authorization request created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.issues });
    }
    next(error);
  }
});

// GET /api/prior-auth-requests - List PA requests
router.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, status, payer, limit = "50", offset = "0" } = req.query;

    let query = `
      SELECT
        pa.*,
        p.first_name, p.last_name,
        u.full_name as prescriber_full_name
      FROM prior_auth_requests pa
      JOIN patients p ON pa.patient_id = p.id
      LEFT JOIN users u ON pa.prescriber = u.id
      WHERE pa.tenant_id = $1
    `;
    const values: (string | number)[] = [tenantId];
    let paramCount = 1;

    if (patientId) {
      paramCount++;
      query += ` AND pa.patient_id = $${paramCount}`;
      values.push(patientId as string);
    }

    if (status) {
      paramCount++;
      query += ` AND pa.status = $${paramCount}`;
      values.push(status as string);
    }

    if (payer) {
      paramCount++;
      query += ` AND pa.payer ILIKE $${paramCount}`;
      values.push(`%${payer}%`);
    }

    query += ` ORDER BY pa.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await pool.query(query, values);

    res.json({ count: result.rows.length, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth-requests/:id - Get single PA request
router.get("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params.id as string;

    const result = await pool.query(
      `SELECT
        pa.*,
        p.first_name, p.last_name, p.phone, p.email,
        u.full_name as prescriber_full_name, u.email as prescriber_email,
        rx.medication_name as rx_medication_name, rx.sig as rx_sig
      FROM prior_auth_requests pa
      JOIN patients p ON pa.patient_id = p.id
      LEFT JOIN users u ON pa.prescriber = u.id
      LEFT JOIN prescriptions rx ON pa.prescription_id = rx.id
      WHERE pa.id = $1 AND pa.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prior authorization request not found" });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/prior-auth-requests/:id/submit - Submit PA to payer
router.post("/:id/submit", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params.id as string;
    const userId = req.user!.id;

    const paResult = await pool.query(
      "SELECT * FROM prior_auth_requests WHERE id = $1 AND tenant_id = $2",
      [id, tenantId]
    );

    if (paResult.rows.length === 0) {
      return res.status(404).json({ error: "Prior authorization request not found" });
    }

    const paRequest = paResult.rows[0];

    if (paRequest.status !== "pending") {
      return res.status(400).json({
        error: "Cannot submit PA request",
        reason: `Current status is '${paRequest.status}'. Can only submit 'pending' requests`,
      });
    }

    const adapter = getPriorAuthAdapter(paRequest.payer);
    const submitResponse = await adapter.submit({
      id: paRequest.id,
      tenantId: paRequest.tenant_id,
      patientId: paRequest.patient_id,
      prescriptionId: paRequest.prescription_id,
      medicationName: paRequest.medication_name,
      medicationStrength: paRequest.medication_strength,
      medicationQuantity: paRequest.medication_quantity,
      sig: paRequest.sig,
      payer: paRequest.payer,
      memberId: paRequest.member_id,
      prescriberId: paRequest.prescriber,
      prescriberNpi: paRequest.prescriber_npi,
      prescriberName: paRequest.prescriber_name,
    });

    const now = new Date().toISOString();
    const existingHistory = paRequest.history || [];
    const newHistoryEntry = {
      timestamp: now,
      event: "submitted",
      status: submitResponse.status,
      userId,
      notes: submitResponse.statusReason,
      externalReferenceId: submitResponse.externalReferenceId,
    };

    await pool.query(
      `UPDATE prior_auth_requests
       SET status = $1, status_reason = $2, request_payload = $3,
           response_payload = $4, history = $5, external_reference_id = $6, updated_at = $7
       WHERE id = $8 AND tenant_id = $9`,
      [
        submitResponse.status,
        submitResponse.statusReason,
        JSON.stringify(submitResponse.requestPayload),
        JSON.stringify(submitResponse.responsePayload),
        JSON.stringify([...existingHistory, newHistoryEntry]),
        submitResponse.externalReferenceId,
        now,
        id,
        tenantId,
      ]
    );

    await auditLog(tenantId, userId, "prior_auth_submit", "prior_auth_requests", id);

    res.json({
      message: "Prior authorization submitted successfully",
      status: submitResponse.status,
      statusReason: submitResponse.statusReason,
      externalReferenceId: submitResponse.externalReferenceId,
      estimatedDecisionTime: submitResponse.estimatedDecisionTime,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prior-auth-requests/:id/status - Check PA status
router.get("/:id/status", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params.id as string;

    const paResult = await pool.query(
      `SELECT pa.*, p.first_name, p.last_name
       FROM prior_auth_requests pa
       JOIN patients p ON pa.patient_id = p.id
       WHERE pa.id = $1 AND pa.tenant_id = $2`,
      [id, tenantId]
    );

    if (paResult.rows.length === 0) {
      return res.status(404).json({ error: "Prior authorization request not found" });
    }

    const paRequest = paResult.rows[0];
    const adapter = getPriorAuthAdapter(paRequest.payer);
    const statusResponse = await adapter.checkStatus(paRequest.id, paRequest.external_reference_id);

    // Update if status changed
    if (statusResponse.status !== paRequest.status) {
      const now = new Date().toISOString();
      const existingHistory = paRequest.history || [];
      const newHistoryEntry = {
        timestamp: now,
        event: "status_check",
        status: statusResponse.status,
        notes: `Status updated: ${statusResponse.statusReason}`,
      };

      await pool.query(
        `UPDATE prior_auth_requests SET status = $1, status_reason = $2,
         response_payload = $3, history = $4, updated_at = $5
         WHERE id = $6 AND tenant_id = $7`,
        [
          statusResponse.status,
          statusResponse.statusReason,
          JSON.stringify(statusResponse.responsePayload),
          JSON.stringify([...existingHistory, newHistoryEntry]),
          now,
          id,
          tenantId,
        ]
      );
    }

    res.json({
      paRequestId: paRequest.id,
      externalReferenceId: statusResponse.externalReferenceId,
      status: statusResponse.status,
      statusReason: statusResponse.statusReason,
      patientName: `${paRequest.first_name} ${paRequest.last_name}`,
      medicationName: paRequest.medication_name,
      payer: paRequest.payer,
      lastUpdated: statusResponse.lastUpdated,
      history: paRequest.history,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/prior-auth-requests/:id - Update PA request
router.patch("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params.id as string;
    const userId = req.user!.id;

    const validated = updatePARequestSchema.parse(req.body);

    const currentResult = await pool.query(
      "SELECT * FROM prior_auth_requests WHERE id = $1 AND tenant_id = $2",
      [id, tenantId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Prior authorization request not found" });
    }

    const current = currentResult.rows[0];
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (validated.status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(validated.status);
    }

    if (validated.statusReason) {
      paramCount++;
      updates.push(`status_reason = $${paramCount}`);
      values.push(validated.statusReason);
    }

    if (validated.attachments) {
      paramCount++;
      updates.push(`attachments = $${paramCount}`);
      values.push(JSON.stringify(validated.attachments));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const now = new Date().toISOString();
    const existingHistory = current.history || [];
    const historyEntry = {
      timestamp: now,
      event: "updated",
      status: validated.status || current.status,
      userId,
      notes: validated.statusReason || "PA request updated",
    };

    paramCount++;
    updates.push(`history = $${paramCount}`);
    values.push(JSON.stringify([...existingHistory, historyEntry]));

    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(now);

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    const query = `
      UPDATE prior_auth_requests
      SET ${updates.join(", ")}
      WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    await auditLog(tenantId, userId, "prior_auth_update", "prior_auth_requests", id);

    res.json({ message: "Prior authorization request updated successfully", data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.issues });
    }
    next(error);
  }
});

export default router;
