import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog, createAuditLog } from "../services/audit";

const taskTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  defaultAssignee: z.string().optional(),
});

export const taskTemplatesRouter = Router();

// GET /api/task-templates - List all task templates
taskTemplatesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
        tt.id,
        tt.name,
        tt.title,
        tt.description,
        tt.category,
        tt.priority,
        tt.default_assignee as "defaultAssignee",
        tt.created_by as "createdBy",
        tt.created_at as "createdAt",
        tt.updated_at as "updatedAt",
        u.full_name as "defaultAssigneeName",
        creator.full_name as "createdByName"
      FROM task_templates tt
      LEFT JOIN users u ON tt.default_assignee = u.id
      LEFT JOIN users creator ON tt.created_by = creator.id
      WHERE tt.tenant_id = $1
      ORDER BY tt.name ASC`,
      [tenantId]
    );

    res.json({ templates: result.rows });
  } catch (err: any) {
    console.error("Error fetching task templates:", err);
    res.status(500).json({ error: "Failed to fetch task templates" });
  }
});

// POST /api/task-templates - Create a new task template
taskTemplatesRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = taskTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const payload = parsed.data;

  try {
    // Check for duplicate name
    const existingCheck = await pool.query(
      "SELECT id FROM task_templates WHERE tenant_id = $1 AND name = $2",
      [tenantId, payload.name]
    );

    if (existingCheck.rowCount! > 0) {
      return res.status(400).json({ error: "A template with this name already exists" });
    }

    await pool.query(
      `INSERT INTO task_templates(
        id, tenant_id, name, title, description, category, priority, default_assignee, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        tenantId,
        payload.name,
        payload.title,
        payload.description || null,
        payload.category || null,
        payload.priority || "normal",
        payload.defaultAssignee || null,
        userId,
      ]
    );

    await auditLog(tenantId, userId, "task_template_create", "task_template", id);
    res.status(201).json({ id });
  } catch (err: any) {
    console.error("Error creating task template:", err);
    res.status(500).json({ error: "Failed to create task template" });
  }
});

// PUT /api/task-templates/:id - Update a task template
taskTemplatesRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = taskTemplateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const payload = parsed.data;

  try {
    // Check if name conflict exists (excluding current template)
    if (payload.name) {
      const existingCheck = await pool.query(
        "SELECT id FROM task_templates WHERE tenant_id = $1 AND name = $2 AND id != $3",
        [tenantId, payload.name, id]
      );

      if (existingCheck.rowCount! > 0) {
        return res.status(400).json({ error: "A template with this name already exists" });
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (payload.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(payload.name);
      paramIndex++;
    }
    if (payload.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(payload.title);
      paramIndex++;
    }
    if (payload.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(payload.description);
      paramIndex++;
    }
    if (payload.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(payload.category);
      paramIndex++;
    }
    if (payload.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(payload.priority);
      paramIndex++;
    }
    if (payload.defaultAssignee !== undefined) {
      updates.push(`default_assignee = $${paramIndex}`);
      params.push(payload.defaultAssignee);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id, tenantId);

    const query = `
      UPDATE task_templates
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING id
    `;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    await auditLog(tenantId, userId, "task_template_update", "task_template", id!);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error updating task template:", err);
    res.status(500).json({ error: "Failed to update task template" });
  }
});

// DELETE /api/task-templates/:id - Delete a task template
taskTemplatesRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const result = await pool.query(
      "DELETE FROM task_templates WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [id, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    await auditLog(tenantId, userId, "task_template_delete", "task_template", id!);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting task template:", err);
    res.status(500).json({ error: "Failed to delete task template" });
  }
});

// POST /api/task-templates/:id/create-task - Create a task from a template
taskTemplatesRouter.post("/:id/create-task", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  // Optional overrides
  const { patientId, encounterId, assignedTo, dueDate } = req.body;

  try {
    // Fetch the template
    const templateResult = await pool.query(
      `SELECT * FROM task_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (templateResult.rowCount === 0) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = templateResult.rows[0];
    const taskId = crypto.randomUUID();

    // Create task from template
    await pool.query(
      `INSERT INTO tasks(
        id, tenant_id, patient_id, encounter_id, title, description,
        category, priority, status, due_date, assigned_to, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        taskId,
        tenantId,
        patientId || null,
        encounterId || null,
        template.title,
        template.description,
        template.category,
        template.priority,
        "todo",
        dueDate || null,
        assignedTo || template.default_assignee || null,
        userId,
      ]
    );

    await createAuditLog({
      tenantId,
      userId,
      action: "task_create_from_template",
      resourceType: "task",
      resourceId: taskId,
      metadata: {
        templateId: id,
        templateName: template.name,
      },
    });

    res.status(201).json({ id: taskId });
  } catch (err: any) {
    console.error("Error creating task from template:", err);
    res.status(500).json({ error: "Failed to create task from template" });
  }
});
