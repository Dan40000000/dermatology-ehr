import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { auditLog } from "../services/audit";

const orderSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string().optional(), // Optional - will default to first available provider
  type: z.string().min(1),
  status: z.string().optional(),
  priority: z.enum(['normal', 'high', 'stat', 'routine', 'urgent']).optional(),
  details: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const orderStatusSchema = z.object({
  status: z.string(),
});

const erxSchema = z.object({
  orderId: z.string().optional(),
  medication: z.string().optional(),
  sig: z.string().optional(),
  pharmacy: z.string().optional(),
});

export const ordersRouter = Router();

ordersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Extract query parameters for filtering
  const { orderTypes, statuses, priorities, search, patientId, limit = '100' } = req.query;

  let query = `
    select
      o.id,
      o.encounter_id as "encounterId",
      o.patient_id as "patientId",
      o.provider_id as "providerId",
      o.type,
      o.status,
      o.priority,
      o.details,
      o.notes,
      o.result_flag as "resultFlag",
      o.result_flag_updated_at as "resultFlagUpdatedAt",
      o.result_flag_updated_by as "resultFlagUpdatedBy",
      o.created_at as "createdAt",
      p.full_name as "providerName"
    from orders o
    left join providers p on o.provider_id = p.id and o.tenant_id = p.tenant_id
    where o.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let paramIndex = 2;

  // Filter by order types
  if (orderTypes && typeof orderTypes === 'string') {
    const types = orderTypes.split(',').filter(Boolean);
    if (types.length > 0) {
      query += ` and o.type = ANY($${paramIndex})`;
      params.push(types);
      paramIndex++;
    }
  }

  // Filter by statuses
  if (statuses && typeof statuses === 'string') {
    const statusList = statuses.split(',').filter(Boolean);
    if (statusList.length > 0) {
      query += ` and o.status = ANY($${paramIndex})`;
      params.push(statusList);
      paramIndex++;
    }
  }

  // Filter by priorities
  if (priorities && typeof priorities === 'string') {
    const priorityList = priorities.split(',').filter(Boolean);
    if (priorityList.length > 0) {
      query += ` and o.priority = ANY($${paramIndex})`;
      params.push(priorityList);
      paramIndex++;
    }
  }

  // Search filter
  if (search && typeof search === 'string' && search.trim()) {
    query += ` and (o.details ilike $${paramIndex} or o.notes ilike $${paramIndex})`;
    params.push(`%${search.trim()}%`);
    paramIndex++;
  }

  // Filter by patient
  if (patientId && typeof patientId === 'string') {
    query += ` and o.patient_id = $${paramIndex}`;
    params.push(patientId);
    paramIndex++;
  }

  query += ` order by o.created_at desc limit $${paramIndex}`;
  params.push(parseInt(limit as string, 10));

  const result = await pool.query(query, params);
  res.json({ orders: result.rows });
});

ordersRouter.post("/", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const o = parsed.data;

  // Get provider ID - use provided one or default to first available provider
  let providerId = o.providerId;
  let providerName: string | null = null;

  if (providerId) {
    // If a caller passes an invalid provider ID, fall back to default provider
    // instead of attempting an insert that violates provider FK constraints.
    const providerResult = await pool.query(
      `select id, full_name from providers where id = $1 and tenant_id = $2`,
      [providerId, tenantId]
    );
    if (providerResult.rows[0]) {
      providerId = providerResult.rows[0].id;
      providerName = providerResult.rows[0].full_name;
    } else {
      providerId = undefined;
    }
  }

  if (!providerId) {
    // Default to first available provider (prefer Dr. David Skin for derm orders)
    const defaultProviderResult = await pool.query(
      `select id, full_name from providers where tenant_id = $1 order by
       case when id = 'prov-demo' then 0 else 1 end, created_at limit 1`,
      [tenantId]
    );
    if (defaultProviderResult.rows[0]) {
      providerId = defaultProviderResult.rows[0].id;
      providerName = defaultProviderResult.rows[0].full_name;
    } else {
      return res.status(400).json({ error: "No providers available" });
    }
  }

  await pool.query(
    `insert into orders(id, tenant_id, encounter_id, patient_id, provider_id, provider_name, type, status, priority, details, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      tenantId,
      o.encounterId || null,
      o.patientId,
      providerId,
      providerName,
      o.type,
      o.status || "draft",
      o.priority || "normal",
      o.details || null,
      o.notes || null
    ],
  );
  await auditLog(tenantId, req.user!.id, "order_create", "order", id);
  res.status(201).json({ id });
});

ordersRouter.post("/:id/status", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const orderId = req.params.id;
  await pool.query(`update orders set status = $1 where id = $2 and tenant_id = $3`, [parsed.data.status, orderId, tenantId]);
  await auditLog(tenantId, req.user?.id ?? "unknown", "order_status_change", "order", String(orderId));
  res.json({ ok: true });
});

// eRx stub
ordersRouter.post("/erx/send", requireAuth, requireRoles(["provider"]), async (req: AuthedRequest, res) => {
  const parsed = erxSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  if (parsed.data.orderId) {
    await pool.query(`update orders set status = 'ordered', details = coalesce(details,'') || ' | eRx sent' where id = $1 and tenant_id = $2`, [
      parsed.data.orderId,
      tenantId,
    ]);
  }
  await auditLog(tenantId, req.user?.id ?? "unknown", "erx_send", "erx", "stub");
  res.json({
    accepted: true,
    message: "eRx stub accepted",
    pharmacy: parsed.data.pharmacy,
    sig: parsed.data.sig,
  });
});
