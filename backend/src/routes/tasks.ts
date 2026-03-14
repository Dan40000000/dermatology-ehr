import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

const taskStatusInputSchema = z.enum([
  "todo",
  "in_progress",
  "completed",
  "cancelled",
  "open",
  "in-progress",
  "done",
  "closed",
  "resolved",
  "canceled",
]);

type CanonicalTaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

const STATUS_FILTER_VALUES: Record<CanonicalTaskStatus, string[]> = {
  todo: ["todo", "open"],
  in_progress: ["in_progress", "in-progress"],
  completed: ["completed", "done", "closed", "resolved"],
  cancelled: ["cancelled", "canceled"],
};

const normalizeTaskStatus = (status?: string | null): CanonicalTaskStatus => {
  const normalized = String(status || "").toLowerCase();
  switch (normalized) {
    case "todo":
    case "open":
      return "todo";
    case "in_progress":
    case "in-progress":
      return "in_progress";
    case "completed":
    case "done":
    case "closed":
    case "resolved":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "todo";
  }
};

const normalizeTaskPriority = (priority?: string | null): "low" | "normal" | "high" | "urgent" => {
  const normalized = String(priority || "").toLowerCase();
  switch (normalized) {
    case "low":
    case "normal":
    case "high":
    case "urgent":
      return normalized;
    case "medium":
      return "normal";
    default:
      return "normal";
  }
};

const priorityFilterValues = (priority: string): string[] => {
  const normalized = normalizeTaskPriority(priority);
  if (normalized === "normal") {
    return ["normal", "medium"];
  }
  return [normalized];
};

const taskSchema = z.object({
  patientId: z.string().optional(),
  encounterId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: taskStatusInputSchema.optional(),
  dueDate: z.string().optional(),
  assignedTo: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: taskStatusInputSchema,
});

const commentSchema = z.object({
  comment: z.string().min(1),
});

export const tasksRouter = Router();

// GET /api/tasks - List tasks with filtering and sorting
tasksRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Parse query parameters
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const assignedTo = req.query.assignedTo as string | undefined;
  const createdBy = req.query.createdBy as string | undefined;
  const priority = req.query.priority as string | undefined;
  const search = req.query.search as string | undefined;
  const dueDateFrom = req.query.dueDateFrom as string | undefined;
  const dueDateTo = req.query.dueDateTo as string | undefined;
  const sortBy = (req.query.sortBy as string) || "createdAt";
  const sortOrder = (req.query.sortOrder as string) || "desc";

  // Build WHERE clauses
  const whereClauses: string[] = ["t.tenant_id = $1"];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (status) {
    const canonicalStatus = normalizeTaskStatus(status);
    whereClauses.push(`LOWER(COALESCE(t.status, '')) = ANY($${paramIndex})`);
    params.push(STATUS_FILTER_VALUES[canonicalStatus]);
    paramIndex++;
  }

  if (category) {
    whereClauses.push(`t.category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (assignedTo) {
    if (assignedTo === "me") {
      whereClauses.push(`t.assigned_to = $${paramIndex}`);
      params.push(req.user!.id);
      paramIndex++;
    } else if (assignedTo === "unassigned") {
      whereClauses.push("t.assigned_to is null");
    } else {
      whereClauses.push(`t.assigned_to = $${paramIndex}`);
      params.push(assignedTo);
      paramIndex++;
    }
  }

  if (createdBy) {
    if (createdBy === "me") {
      whereClauses.push(`t.created_by = $${paramIndex}`);
      params.push(req.user!.id);
      paramIndex++;
    } else {
      whereClauses.push(`t.created_by = $${paramIndex}`);
      params.push(createdBy);
      paramIndex++;
    }
  }

  if (priority) {
    whereClauses.push(`LOWER(COALESCE(t.priority, '')) = ANY($${paramIndex})`);
    params.push(priorityFilterValues(priority));
    paramIndex++;
  }

  if (dueDateFrom) {
    whereClauses.push(`t.due_date >= $${paramIndex}`);
    params.push(dueDateFrom);
    paramIndex++;
  }

  if (dueDateTo) {
    whereClauses.push(`t.due_date <= $${paramIndex}`);
    params.push(dueDateTo);
    paramIndex++;
  }

  if (search) {
    whereClauses.push(`(t.title ilike $${paramIndex} or t.description ilike $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = whereClauses.join(" and ");

  // Validate sort column
  const allowedSortColumns = ["createdAt", "dueDate", "priority", "status", "title"];
  const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : "createdAt";
  const order = sortOrder.toLowerCase() === "asc" ? "asc" : "desc";

  // Map camelCase to snake_case
  const columnMap: Record<string, string> = {
    createdAt: "created_at",
    dueDate: "due_date",
    assignedTo: "assigned_to",
  };
  const dbSortColumn = "t." + (columnMap[sortColumn] || sortColumn);

  const query = `
    select
      t.id,
      t.patient_id as "patientId",
      t.encounter_id as "encounterId",
      t.title,
      t.description,
      t.category,
      t.priority,
      t.status,
      t.due_date as "dueDate",
      t.due_at as "dueAt",
      t.assigned_to as "assignedTo",
      t.created_by as "createdBy",
      t.completed_at as "completedAt",
      t.completed_by as "completedBy",
      t.created_at as "createdAt",
      u.full_name as "assignedToName",
      creator.full_name as "createdByName",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
    from tasks t
    left join users u on t.assigned_to = u.id
    left join users creator on t.created_by = creator.id
    left join patients p on t.patient_id = p.id
    where ${whereClause}
    order by ${dbSortColumn} ${order}
    limit 200
  `;

  const result = await pool.query(query, params);
  const normalizedRows = result.rows.map((row) => ({
    ...row,
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
  }));
  res.json({ tasks: normalizedRows });
});

// POST /api/tasks - Create task
tasksRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  await pool.query(
    `insert into tasks(
      id, tenant_id, patient_id, encounter_id, title, description,
      category, priority, status, due_date, due_at, assigned_to, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      tenantId,
      payload.patientId || null,
      payload.encounterId || null,
      payload.title,
      payload.description || null,
      payload.category || null,
      payload.priority || "normal",
      normalizeTaskStatus(payload.status),
      payload.dueDate || null,
      payload.dueDate || null, // Keep dueAt for backward compatibility
      payload.assignedTo || null,
      req.user!.id,
    ],
  );

  await auditLog(tenantId, req.user!.id, "task_create", "task", id);
  res.status(201).json({ id });
});

// PUT /api/tasks/:id - Update task
tasksRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // Build update query dynamically
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

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
    params.push(normalizeTaskPriority(payload.priority));
    paramIndex++;
  }
  if (payload.status !== undefined) {
    const normalizedStatus = normalizeTaskStatus(payload.status);
    updates.push(`status = $${paramIndex}`);
    params.push(normalizedStatus);
    paramIndex++;

    // Track completion
    if (normalizedStatus === "completed") {
      updates.push(`completed_at = now()`);
      updates.push(`completed_by = $${paramIndex}`);
      params.push(req.user!.id);
      paramIndex++;
    } else {
      updates.push(`completed_at = null`);
      updates.push(`completed_by = null`);
    }
  }
  if (payload.dueDate !== undefined) {
    updates.push(`due_date = $${paramIndex}`);
    params.push(payload.dueDate);
    paramIndex++;
    updates.push(`due_at = $${paramIndex}`);
    params.push(payload.dueDate);
    paramIndex++;
  }
  if (payload.assignedTo !== undefined) {
    updates.push(`assigned_to = $${paramIndex}`);
    params.push(payload.assignedTo);
    paramIndex++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  params.push(id, tenantId);
  const query = `
    update tasks
    set ${updates.join(", ")}
    where id = $${paramIndex} and tenant_id = $${paramIndex + 1}
    returning id
  `;

  const result = await pool.query(query, params);

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  await auditLog(tenantId, req.user!.id, "task_update", "task", id!);
  res.json({ success: true });
});

// PUT /api/tasks/:id/status - Quick status update
tasksRouter.put("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const status = normalizeTaskStatus(parsed.data.status);

  const completedFields =
    status === "completed"
      ? ", completed_at = now(), completed_by = $4"
      : ", completed_at = null, completed_by = null";

  const params =
    status === "completed"
      ? [status, id, tenantId, req.user!.id]
      : [status, id, tenantId];

  const result = await pool.query(
    `update tasks set status = $1${completedFields}
     where id = $2 and tenant_id = $3
     returning id`,
    params,
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  await auditLog(tenantId, req.user!.id, "task_status_change", "task", id!);
  res.json({ success: true });
});

// DELETE /api/tasks/:id - Delete task
tasksRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    "delete from tasks where id = $1 and tenant_id = $2 returning id",
    [id, tenantId],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  await auditLog(tenantId, req.user!.id, "task_delete", "task", id!);
  res.json({ success: true });
});

// GET /api/tasks/:id/comments - Get task comments
tasksRouter.get("/:id/comments", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const tenantId = req.user!.tenantId;

  const result = await pool.query(
    `select
      c.id,
      c.comment,
      c.created_at as "createdAt",
      c.user_id as "userId",
      u.full_name as "userName"
    from task_comments c
    join users u on c.user_id = u.id
    where c.task_id = $1 and c.tenant_id = $2
    order by c.created_at asc`,
    [id, tenantId],
  );

  res.json({ comments: result.rows });
});

// POST /api/tasks/:id/comments - Add comment
tasksRouter.post("/:id/comments", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const commentId = crypto.randomUUID();
  const tenantId = req.user!.tenantId;

  // Verify task exists
  const taskCheck = await pool.query(
    "select 1 from tasks where id = $1 and tenant_id = $2",
    [id, tenantId],
  );

  if (taskCheck.rowCount === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  await pool.query(
    `insert into task_comments(id, tenant_id, task_id, user_id, comment)
     values ($1, $2, $3, $4, $5)`,
    [commentId, tenantId, id, req.user!.id, parsed.data.comment],
  );

  await auditLog(tenantId, req.user!.id, "task_comment_add", "task", id!);
  res.status(201).json({ id: commentId });
});
