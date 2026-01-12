import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

export const consentFormsRouter = Router();

// Get all consent forms
consentFormsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { activeOnly } = req.query;

  try {
    let query = `
      SELECT id, form_name as "formName", form_type as "formType",
             form_content as "formContent", is_active as "isActive",
             requires_signature as "requiresSignature", version,
             effective_date as "effectiveDate",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM consent_forms
      WHERE tenant_id = $1
    `;

    if (activeOnly === "true") {
      query += " AND is_active = true";
    }

    query += " ORDER BY form_type, form_name";

    const result = await pool.query(query, [tenantId]);

    return res.json({ forms: result.rows });
  } catch (err) {
    console.error("Error fetching consent forms:", err);
    return res.status(500).json({ error: "Failed to fetch consent forms" });
  }
});

// Get active consent forms (for kiosk)
consentFormsRouter.get("/active", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT id, form_name as "formName", form_type as "formType",
              form_content as "formContent", requires_signature as "requiresSignature",
              version, effective_date as "effectiveDate"
       FROM consent_forms
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY form_type, form_name`,
      [tenantId]
    );

    return res.json({ forms: result.rows });
  } catch (err) {
    console.error("Error fetching active consent forms:", err);
    return res.status(500).json({ error: "Failed to fetch active consent forms" });
  }
});

// Get single consent form
consentFormsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT id, form_name as "formName", form_type as "formType",
              form_content as "formContent", is_active as "isActive",
              requires_signature as "requiresSignature", version,
              effective_date as "effectiveDate",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM consent_forms
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Consent form not found" });
    }

    return res.json({ form: result.rows[0] });
  } catch (err) {
    console.error("Error fetching consent form:", err);
    return res.status(500).json({ error: "Failed to fetch consent form" });
  }
});

// Create new consent form
const createConsentFormSchema = z.object({
  formName: z.string().min(1).max(255),
  formType: z.string().min(1).max(100),
  formContent: z.string().min(1),
  requiresSignature: z.boolean().default(true),
  version: z.string().max(50).optional(),
  effectiveDate: z.string().optional(),
});

consentFormsRouter.post(
  "/",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const parsed = createConsentFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const { formName, formType, formContent, requiresSignature, version, effectiveDate } = parsed.data;

    try {
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO consent_forms (
          id, tenant_id, form_name, form_type, form_content,
          is_active, requires_signature, version, effective_date
        ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)`,
        [id, tenantId, formName, formType, formContent, requiresSignature, version || "1.0", effectiveDate || null]
      );

      await auditLog(tenantId, req.user!.id, "consent_form_create", "consent_form", id);

      return res.status(201).json({ id });
    } catch (err) {
      console.error("Error creating consent form:", err);
      return res.status(500).json({ error: "Failed to create consent form" });
    }
  }
);

// Update consent form
const updateConsentFormSchema = z.object({
  formName: z.string().min(1).max(255).optional(),
  formType: z.string().min(1).max(100).optional(),
  formContent: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  requiresSignature: z.boolean().optional(),
  version: z.string().max(50).optional(),
  effectiveDate: z.string().optional(),
});

consentFormsRouter.put(
  "/:id",
  requireAuth,
  requireRoles(["admin", "provider"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const parsed = updateConsentFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(parsed.data).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          updates.push(`${dbKey} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(tenantId, id);

      const result = await pool.query(
        `UPDATE consent_forms
         SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}
         RETURNING id`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Consent form not found" });
      }

      await auditLog(tenantId, req.user!.id, "consent_form_update", "consent_form", id!);

      return res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error("Error updating consent form:", err);
      return res.status(500).json({ error: "Failed to update consent form" });
    }
  }
);

// Deactivate consent form (soft delete)
consentFormsRouter.delete(
  "/:id",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    try {
      const result = await pool.query(
        `UPDATE consent_forms
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Consent form not found" });
      }

      await auditLog(tenantId, req.user!.id, "consent_form_deactivate", "consent_form", id!);

      return res.json({ success: true });
    } catch (err) {
      console.error("Error deactivating consent form:", err);
      return res.status(500).json({ error: "Failed to deactivate consent form" });
    }
  }
);

// Get patient's signed consents
consentFormsRouter.get("/patient/:patientId", requireAuth, async (req: AuthedRequest, res) => {
  const { patientId } = req.params;
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT pc.id, pc.signature_url as "signatureUrl", pc.signed_at as "signedAt",
              pc.form_version as "formVersion",
              cf.form_name as "formName", cf.form_type as "formType",
              cs.kiosk_device_id as "kioskDeviceId"
       FROM patient_consents pc
       JOIN consent_forms cf ON pc.consent_form_id = cf.id
       LEFT JOIN checkin_sessions cs ON pc.checkin_session_id = cs.id
       WHERE pc.patient_id = $1 AND pc.tenant_id = $2
       ORDER BY pc.signed_at DESC`,
      [patientId, tenantId]
    );

    return res.json({ consents: result.rows });
  } catch (err) {
    console.error("Error fetching patient consents:", err);
    return res.status(500).json({ error: "Failed to fetch patient consents" });
  }
});

// Get all patient consents (for admin)
consentFormsRouter.get("/consents/all", requireAuth, requireRoles(["admin", "provider"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { limit = "50", offset = "0" } = req.query;

  try {
    const result = await pool.query(
      `SELECT pc.id, pc.signature_url as "signatureUrl", pc.signed_at as "signedAt",
              pc.form_version as "formVersion",
              cf.form_name as "formName", cf.form_type as "formType",
              p.first_name as "patientFirstName", p.last_name as "patientLastName",
              p.id as "patientId"
       FROM patient_consents pc
       JOIN consent_forms cf ON pc.consent_form_id = cf.id
       JOIN patients p ON pc.patient_id = p.id
       WHERE pc.tenant_id = $1
       ORDER BY pc.signed_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, parseInt(limit as string), parseInt(offset as string)]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) as total FROM patient_consents WHERE tenant_id = $1",
      [tenantId]
    );

    return res.json({
      consents: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (err) {
    console.error("Error fetching all consents:", err);
    return res.status(500).json({ error: "Failed to fetch consents" });
  }
});
