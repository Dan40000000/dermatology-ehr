import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";

const templateContentSchema = z.object({
  chiefComplaint: z.string().optional(),
  hpi: z.string().optional(),
  ros: z.string().optional(),
  exam: z.string().optional(),
  assessmentPlan: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    "Initial Visit",
    "Follow-up Visit",
    "Procedure Note",
    "Biopsy",
    "Excision",
    "Cosmetic Consultation",
  ]),
  description: z.string().optional(),
  isShared: z.boolean().optional(),
  templateContent: templateContentSchema,
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  isShared: z.boolean().optional(),
  templateContent: templateContentSchema.optional(),
});

export const noteTemplatesRouter = Router();

noteTemplatesRouter.use(requireAuth, requireModuleAccess("templates"));

// GET /api/note-templates - List templates
noteTemplatesRouter.get("/", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { category, providerId } = req.query;

  let query = `
    SELECT
      nt.id,
      nt.tenant_id as "tenantId",
      nt.provider_id as "providerId",
      nt.name,
      nt.category,
      nt.description,
      nt.is_shared as "isShared",
      nt.template_content as "templateContent",
      nt.usage_count as "usageCount",
      nt.created_at as "createdAt",
      nt.updated_at as "updatedAt",
      CASE WHEN ptf.id IS NOT NULL THEN true ELSE false END as "isFavorite"
    FROM note_templates nt
    LEFT JOIN provider_template_favorites ptf
      ON ptf.template_id = nt.id AND ptf.provider_id = $2
    WHERE nt.tenant_id = $1
      AND (nt.is_shared = true OR nt.provider_id = $2)
  `;

  const params: any[] = [tenantId, userId];
  let paramIndex = 3;

  if (category) {
    query += ` AND nt.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (providerId) {
    query += ` AND nt.provider_id = $${paramIndex}`;
    params.push(providerId);
    paramIndex++;
  }

  query += ` ORDER BY nt.usage_count DESC, nt.created_at DESC`;

  const result = await pool.query(query, params);
  res.json({ templates: result.rows });
});

// GET /api/note-templates/:id - Get single template
noteTemplatesRouter.get("/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const templateId = String(req.params.id);

  const result = await pool.query(
    `SELECT
      nt.id,
      nt.tenant_id as "tenantId",
      nt.provider_id as "providerId",
      nt.name,
      nt.category,
      nt.description,
      nt.is_shared as "isShared",
      nt.template_content as "templateContent",
      nt.usage_count as "usageCount",
      nt.created_at as "createdAt",
      nt.updated_at as "updatedAt",
      CASE WHEN ptf.id IS NOT NULL THEN true ELSE false END as "isFavorite"
    FROM note_templates nt
    LEFT JOIN provider_template_favorites ptf
      ON ptf.template_id = nt.id AND ptf.provider_id = $3
    WHERE nt.id = $1
      AND nt.tenant_id = $2
      AND (nt.is_shared = true OR nt.provider_id = $3)`,
    [templateId, tenantId, userId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Template not found" });
  }

  res.json({ template: result.rows[0] });
});

// POST /api/note-templates - Create template
noteTemplatesRouter.post(
  "/",
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const id = crypto.randomUUID();
    const tenantId = req.user!.tenantId;
    const providerId = req.user!.id;
    const payload = parsed.data;

    await pool.query(
      `INSERT INTO note_templates(
        id, tenant_id, provider_id, name, category, description,
        is_shared, template_content, usage_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
      [
        id,
        tenantId,
        providerId,
        payload.name,
        payload.category,
        payload.description || null,
        payload.isShared || false,
        JSON.stringify(payload.templateContent),
      ]
    );

    await auditLog(tenantId, providerId, "template_create", "note_template", id);
    res.status(201).json({ id, template: { id, ...payload } });
  }
);

// PUT /api/note-templates/:id - Update template
noteTemplatesRouter.put(
  "/:id",
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const templateId = String(req.params.id);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const payload = parsed.data;

    // Check if template exists and user has permission
    const checkResult = await pool.query(
      `SELECT provider_id as "providerId", is_shared as "isShared"
       FROM note_templates
       WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    if (!checkResult.rowCount) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = checkResult.rows[0];
    const isAdmin = req.user!.role === "admin";

    // Only template owner or admin can update
    if (template.providerId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to update this template" });
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (payload.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(payload.name);
      paramIndex++;
    }

    if (payload.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      values.push(payload.category);
      paramIndex++;
    }

    if (payload.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(payload.description);
      paramIndex++;
    }

    if (payload.isShared !== undefined) {
      updates.push(`is_shared = $${paramIndex}`);
      values.push(payload.isShared);
      paramIndex++;
    }

    if (payload.templateContent !== undefined) {
      updates.push(`template_content = $${paramIndex}`);
      values.push(JSON.stringify(payload.templateContent));
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      // Only updated_at, nothing to change
      return res.json({ ok: true });
    }

    values.push(templateId, tenantId);

    await pool.query(
      `UPDATE note_templates
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );

    await auditLog(tenantId, userId, "template_update", "note_template", templateId);
    res.json({ ok: true });
  }
);

// DELETE /api/note-templates/:id - Delete template
noteTemplatesRouter.delete(
  "/:id",
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    const templateId = String(req.params.id);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Check if template exists and user has permission
    const checkResult = await pool.query(
      `SELECT provider_id as "providerId"
       FROM note_templates
       WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    if (!checkResult.rowCount) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = checkResult.rows[0];
    const isAdmin = req.user!.role === "admin";

    // Only template owner or admin can delete
    if (template.providerId !== userId && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to delete this template" });
    }

    await pool.query(
      `DELETE FROM note_templates WHERE id = $1 AND tenant_id = $2`,
      [templateId, tenantId]
    );

    await auditLog(tenantId, userId, "template_delete", "note_template", templateId);
    res.json({ ok: true });
  }
);

// POST /api/note-templates/:id/apply - Apply template (increment usage count)
noteTemplatesRouter.post("/:id/apply", requireAuth, async (req: AuthedRequest, res) => {
  const templateId = String(req.params.id);
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Verify access
  const result = await pool.query(
    `SELECT template_content as "templateContent"
     FROM note_templates
     WHERE id = $1 AND tenant_id = $2 AND (is_shared = true OR provider_id = $3)`,
    [templateId, tenantId, userId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Template not found" });
  }

  // Increment usage count
  await pool.query(
    `UPDATE note_templates SET usage_count = usage_count + 1 WHERE id = $1`,
    [templateId]
  );

  await auditLog(tenantId, userId, "template_apply", "note_template", templateId);
  res.json({ templateContent: result.rows[0].templateContent });
});

// POST /api/note-templates/:id/favorite - Toggle favorite
noteTemplatesRouter.post("/:id/favorite", async (req: AuthedRequest, res) => {
  const templateId = String(req.params.id);
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Check if already favorited
  const existingResult = await pool.query(
    `SELECT id FROM provider_template_favorites
     WHERE provider_id = $1 AND template_id = $2`,
    [userId, templateId]
  );

  if (existingResult.rowCount) {
    // Remove favorite
    await pool.query(
      `DELETE FROM provider_template_favorites
       WHERE provider_id = $1 AND template_id = $2`,
      [userId, templateId]
    );
    res.json({ isFavorite: false });
  } else {
    // Add favorite
    const favoriteId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO provider_template_favorites(id, tenant_id, provider_id, template_id)
       VALUES ($1, $2, $3, $4)`,
      [favoriteId, tenantId, userId, templateId]
    );
    res.json({ isFavorite: true });
  }
});
