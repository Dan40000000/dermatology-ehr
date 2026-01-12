import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";
import crypto from "crypto";

const router = Router();

// Validation schemas
const createCannedResponseSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.enum(["general", "prescription", "appointment", "billing", "medical", "other"]).optional(),
  responseText: z.string().min(1),
});

const updateCannedResponseSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  category: z.enum(["general", "prescription", "appointment", "billing", "medical", "other"]).optional(),
  responseText: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/canned-responses - List all canned responses for tenant
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const category = req.query.category as string | undefined;
    const activeOnly = req.query.activeOnly !== "false"; // Default to true

    let query = `
      SELECT
        id,
        title,
        category,
        response_text as "responseText",
        is_active as "isActive",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM message_canned_responses
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (activeOnly) {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY category, title`;

    const result = await pool.query(query, params);

    res.json({ cannedResponses: result.rows });
  } catch (error) {
    console.error("Error fetching canned responses:", error);
    res.status(500).json({ error: "Failed to fetch canned responses" });
  }
});

// GET /api/canned-responses/:id - Get single canned response
router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const responseId = req.params.id;

    const result = await pool.query(
      `SELECT
        id,
        title,
        category,
        response_text as "responseText",
        is_active as "isActive",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM message_canned_responses
      WHERE id = $1 AND tenant_id = $2`,
      [responseId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Canned response not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching canned response:", error);
    res.status(500).json({ error: "Failed to fetch canned response" });
  }
});

// POST /api/canned-responses - Create new canned response
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createCannedResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { title, category, responseText } = parsed.data;

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO message_canned_responses
      (id, tenant_id, title, category, response_text, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, title, category || null, responseText, userId]
    );

    await auditLog(tenantId, userId, "canned_response_create", "message_canned_response", id);

    res.status(201).json({ id });
  } catch (error) {
    console.error("Error creating canned response:", error);
    res.status(500).json({ error: "Failed to create canned response" });
  }
});

// PUT /api/canned-responses/:id - Update canned response
router.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const responseId = req.params.id;

    const parsed = updateCannedResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (parsed.data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(parsed.data.title);
      paramIndex++;
    }

    if (parsed.data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(parsed.data.category);
      paramIndex++;
    }

    if (parsed.data.responseText !== undefined) {
      updates.push(`response_text = $${paramIndex}`);
      params.push(parsed.data.responseText);
      paramIndex++;
    }

    if (parsed.data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(parsed.data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(responseId, tenantId);
    const query = `UPDATE message_canned_responses SET ${updates.join(", ")} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Canned response not found" });
    }

    await auditLog(tenantId, userId, "canned_response_update", "message_canned_response", responseId!);

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating canned response:", error);
    res.status(500).json({ error: "Failed to update canned response" });
  }
});

// DELETE /api/canned-responses/:id - Delete canned response (soft delete by marking inactive)
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const responseId = req.params.id;

    const result = await pool.query(
      `UPDATE message_canned_responses
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2`,
      [responseId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Canned response not found" });
    }

    await auditLog(tenantId, userId, "canned_response_delete", "message_canned_response", responseId!);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting canned response:", error);
    res.status(500).json({ error: "Failed to delete canned response" });
  }
});

export const cannedResponsesRouter = router;
