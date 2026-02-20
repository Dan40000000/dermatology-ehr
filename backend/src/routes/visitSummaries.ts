import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { logger } from "../lib/logger";

const createVisitSummarySchema = z.object({
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  visitDate: z.string(), // ISO date string
  chiefComplaint: z.string().optional(),
  diagnoses: z.array(z.object({
    code: z.string(),
    description: z.string()
  })).optional(),
  procedures: z.array(z.object({
    code: z.string(),
    description: z.string()
  })).optional(),
  medications: z.array(z.object({
    name: z.string(),
    sig: z.string().optional(),
    quantity: z.string().optional()
  })).optional(),
  followUpInstructions: z.string().optional(),
  nextAppointmentDate: z.string().optional(), // ISO date string
});

const updateVisitSummarySchema = createVisitSummarySchema.partial();

export const visitSummariesRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logVisitSummariesError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// All routes require authentication
visitSummariesRouter.use(requireAuth);

/**
 * GET /api/visit-summaries
 * List all visit summaries for tenant
 */
visitSummariesRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId, providerId, released } = req.query;

    let query = `
      SELECT vs.id, vs.encounter_id as "encounterId",
             vs.patient_id as "patientId", vs.provider_id as "providerId",
             vs.visit_date as "visitDate", vs.chief_complaint as "chiefComplaint",
             vs.is_released as "isReleased", vs.released_at as "releasedAt",
             vs.created_at as "createdAt", vs.updated_at as "updatedAt",
             p.first_name || ' ' || p.last_name as "patientName",
             pr.full_name as "providerName",
             ru.full_name as "releasedBy"
      FROM visit_summaries vs
      JOIN patients p ON vs.patient_id = p.id
      JOIN providers pr ON vs.provider_id = pr.id
      LEFT JOIN users ru ON vs.released_by = ru.id
      WHERE vs.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND vs.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (providerId) {
      query += ` AND vs.provider_id = $${paramIndex}`;
      params.push(providerId);
      paramIndex++;
    }

    if (released !== undefined) {
      query += ` AND vs.is_released = $${paramIndex}`;
      params.push(released === 'true');
      paramIndex++;
    }

    query += ` ORDER BY vs.visit_date DESC LIMIT 100`;

    const result = await pool.query(query, params);

    return res.json({ visitSummaries: result.rows });
  } catch (error) {
    logVisitSummariesError("Get visit summaries error:", error);
    return res.status(500).json({ error: "Failed to get visit summaries" });
  }
});

/**
 * GET /api/visit-summaries/:id
 * Get single visit summary
 */
visitSummariesRouter.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT vs.id, vs.encounter_id as "encounterId",
              vs.patient_id as "patientId", vs.provider_id as "providerId",
              vs.visit_date as "visitDate", vs.chief_complaint as "chiefComplaint",
              vs.diagnoses, vs.procedures, vs.medications,
              vs.follow_up_instructions as "followUpInstructions",
              vs.next_appointment_date as "nextAppointmentDate",
              vs.is_released as "isReleased", vs.released_at as "releasedAt",
              vs.created_at as "createdAt", vs.updated_at as "updatedAt",
              p.first_name || ' ' || p.last_name as "patientName",
              pr.full_name as "providerName",
              ru.full_name as "releasedBy"
       FROM visit_summaries vs
       JOIN patients p ON vs.patient_id = p.id
       JOIN providers pr ON vs.provider_id = pr.id
       LEFT JOIN users ru ON vs.released_by = ru.id
       WHERE vs.id = $1 AND vs.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Visit summary not found" });
    }

    return res.json({ visitSummary: result.rows[0] });
  } catch (error) {
    logVisitSummariesError("Get visit summary error:", error);
    return res.status(500).json({ error: "Failed to get visit summary" });
  }
});

/**
 * POST /api/visit-summaries
 * Create visit summary (can auto-populate from encounter)
 */
visitSummariesRouter.post(
  "/",
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const parsed = createVisitSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const {
      encounterId,
      patientId,
      providerId,
      visitDate,
      chiefComplaint,
      diagnoses,
      procedures,
      medications,
      followUpInstructions,
      nextAppointmentDate
    } = parsed.data;

    try {
      // Verify encounter exists and belongs to tenant
      const encounterResult = await pool.query(
        `SELECT id FROM encounters WHERE id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (encounterResult.rows.length === 0) {
        return res.status(404).json({ error: "Encounter not found" });
      }

      // Check if summary already exists for this encounter
      const existingResult = await pool.query(
        `SELECT id FROM visit_summaries WHERE encounter_id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          error: "Visit summary already exists for this encounter",
          existingId: existingResult.rows[0].id
        });
      }

      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO visit_summaries (
          id, tenant_id, encounter_id, patient_id, provider_id,
          visit_date, chief_complaint, diagnoses, procedures, medications,
          follow_up_instructions, next_appointment_date, is_released
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          tenantId,
          encounterId,
          patientId,
          providerId,
          visitDate,
          chiefComplaint || null,
          diagnoses ? JSON.stringify(diagnoses) : null,
          procedures ? JSON.stringify(procedures) : null,
          medications ? JSON.stringify(medications) : null,
          followUpInstructions || null,
          nextAppointmentDate || null,
          false // Not released by default
        ]
      );

      // Log creation
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          req.user!.id,
          'create',
          'visit_summary',
          id,
          'info',
          'success'
        ]
      );

      return res.status(201).json({ id });
    } catch (error) {
      logVisitSummariesError("Create visit summary error:", error);
      return res.status(500).json({ error: "Failed to create visit summary" });
    }
  }
);

/**
 * POST /api/visit-summaries/auto-generate
 * Auto-generate visit summary from encounter
 */
visitSummariesRouter.post(
  "/auto-generate",
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const { encounterId } = req.body;

    if (!encounterId) {
      return res.status(400).json({ error: "encounterId is required" });
    }

    const tenantId = req.user!.tenantId;

    try {
      // Get encounter data
      const encounterResult = await pool.query(
        `SELECT
                e.id,
                e.patient_id,
                e.provider_id,
                COALESCE(a.scheduled_start, e.created_at) AS encounter_date,
                e.chief_complaint
         FROM encounters e
         LEFT JOIN appointments a ON a.id = e.appointment_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (encounterResult.rows.length === 0) {
        return res.status(404).json({ error: "Encounter not found" });
      }

      const encounter = encounterResult.rows[0];

      // Get diagnoses from encounter
      const diagnosesResult = await pool.query(
        `SELECT d.icd10_code as code, i.description
         FROM diagnoses d
         JOIN icd10_codes i ON d.icd10_code = i.code
         WHERE d.encounter_id = $1`,
        [encounterId]
      );

      // Get procedures/charges (as procedures)
      const proceduresResult = await pool.query(
        `SELECT c.cpt_code as code, cp.description
         FROM charges c
         JOIN cpt_codes cp ON c.cpt_code = cp.code
         WHERE c.encounter_id = $1`,
        [encounterId]
      );

      // Get prescriptions
      const prescriptionsResult = await pool.query(
        `SELECT medication_name as name, sig, quantity
         FROM prescriptions
         WHERE encounter_id = $1`,
        [encounterId]
      );

      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO visit_summaries (
          id, tenant_id, encounter_id, patient_id, provider_id,
          visit_date, chief_complaint, diagnoses, procedures, medications,
          is_released
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          tenantId,
          encounterId,
          encounter.patient_id,
          encounter.provider_id,
          encounter.encounter_date,
          encounter.chief_complaint,
          JSON.stringify(diagnosesResult.rows),
          JSON.stringify(proceduresResult.rows),
          JSON.stringify(prescriptionsResult.rows),
          false
        ]
      );

      return res.status(201).json({ id, message: "Visit summary auto-generated successfully" });
    } catch (error) {
      logVisitSummariesError("Auto-generate visit summary error:", error);
      return res.status(500).json({ error: "Failed to auto-generate visit summary" });
    }
  }
);

/**
 * PUT /api/visit-summaries/:id
 * Update visit summary
 */
visitSummariesRouter.put(
  "/:id",
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const parsed = updateVisitSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(parsed.data).forEach(([key, value]) => {
        if (value !== undefined) {
          // Convert camelCase to snake_case
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();

          // Handle JSON fields
          if (['diagnoses', 'procedures', 'medications'].includes(dbKey)) {
            updates.push(`${dbKey} = $${paramIndex}`);
            values.push(JSON.stringify(value));
          } else {
            updates.push(`${dbKey} = $${paramIndex}`);
            values.push(value);
          }
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Add tenant_id and id to values
      values.push(tenantId, id);

      const query = `
        UPDATE visit_summaries
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}
        RETURNING id
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Visit summary not found' });
      }

      // Log update
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status, changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          crypto.randomUUID(),
          tenantId,
          req.user!.id,
          'update',
          'visit_summary',
          id,
          'info',
          'success',
          JSON.stringify({ fields: Object.keys(parsed.data) })
        ]
      );

      return res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      logVisitSummariesError('Update visit summary error:', error);
      return res.status(500).json({ error: 'Failed to update visit summary' });
    }
  }
);

/**
 * POST /api/visit-summaries/:id/release
 * Release visit summary to patient portal
 */
visitSummariesRouter.post(
  "/:id/release",
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    try {
      const result = await pool.query(
        `UPDATE visit_summaries
         SET is_released = true,
             released_at = CURRENT_TIMESTAMP,
             released_by = $1
         WHERE id = $2 AND tenant_id = $3
         RETURNING patient_id`,
        [req.user!.id, id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Visit summary not found' });
      }

      // Log release
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          req.user!.id,
          'release_to_portal',
          'visit_summary',
          id,
          'info',
          'success'
        ]
      );

      // TODO: Send notification to patient (email/SMS)

      return res.json({ message: 'Visit summary released to patient portal' });
    } catch (error) {
      logVisitSummariesError('Release visit summary error:', error);
      return res.status(500).json({ error: 'Failed to release visit summary' });
    }
  }
);

/**
 * POST /api/visit-summaries/:id/unrelease
 * Unrelease (hide) visit summary from patient portal
 */
visitSummariesRouter.post(
  "/:id/unrelease",
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    try {
      const result = await pool.query(
        `UPDATE visit_summaries
         SET is_released = false,
             released_at = NULL,
             released_by = NULL
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Visit summary not found' });
      }

      // Log unrelease
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          req.user!.id,
          'unrelease_from_portal',
          'visit_summary',
          id,
          'info',
          'success'
        ]
      );

      return res.json({ message: 'Visit summary hidden from patient portal' });
    } catch (error) {
      logVisitSummariesError('Unrelease visit summary error:', error);
      return res.status(500).json({ error: 'Failed to unrelease visit summary' });
    }
  }
);

/**
 * DELETE /api/visit-summaries/:id
 * Delete visit summary
 */
visitSummariesRouter.delete(
  "/:id",
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    try {
      const result = await pool.query(
        `DELETE FROM visit_summaries
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Visit summary not found' });
      }

      // Log deletion
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, severity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          tenantId,
          req.user!.id,
          'delete',
          'visit_summary',
          id,
          'warning',
          'success'
        ]
      );

      return res.json({ message: 'Visit summary deleted successfully' });
    } catch (error) {
      logVisitSummariesError('Delete visit summary error:', error);
      return res.status(500).json({ error: 'Failed to delete visit summary' });
    }
  }
);
