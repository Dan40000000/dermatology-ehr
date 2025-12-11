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
  providerId: z.string(),
  type: z.string().min(1),
  status: z.string().optional(),
  details: z.string().max(500).optional(),
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
  const result = await pool.query(
    `select id, encounter_id as "encounterId", patient_id as "patientId", provider_id as "providerId", type, status, details, created_at as "createdAt"
     from orders where tenant_id = $1 order by created_at desc limit 100`,
    [tenantId],
  );
  res.json({ orders: result.rows });
});

ordersRouter.post("/", requireAuth, requireRoles(["provider", "ma", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const o = parsed.data;
  await pool.query(
    `insert into orders(id, tenant_id, encounter_id, patient_id, provider_id, type, status, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, tenantId, o.encounterId || null, o.patientId, o.providerId, o.type, o.status || "draft", o.details || null],
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
