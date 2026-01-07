import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";
import { randomUUID } from "crypto";

const referralSchema = z.object({
  patientId: z.string().min(1),
  direction: z.enum(["incoming", "outgoing"]),
  status: z.enum(["new", "scheduled", "in_progress", "completed", "declined", "cancelled"]).optional(),
  priority: z.enum(["routine", "urgent", "stat"]).optional(),
  referringProvider: z.string().optional(),
  referringOrganization: z.string().optional(),
  referredToProvider: z.string().optional(),
  referredToOrganization: z.string().optional(),
  appointmentId: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const updateReferralSchema = referralSchema.partial().extend({
  status: z.enum(["new", "scheduled", "in_progress", "completed", "declined", "cancelled"]).optional(),
  priority: z.enum(["routine", "urgent", "stat"]).optional(),
});

export const referralsRouter = Router();

referralsRouter.use(requireAuth, requireModuleAccess("referrals"));

// GET /api/referrals
referralsRouter.get("/", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status, direction, patientId, priority } = req.query;

  let query = `
    select
      r.*,
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
    from referrals r
    join patients p on p.id = r.patient_id
    where r.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let index = 2;

  if (status) {
    query += ` and r.status = $${index++}`;
    params.push(status);
  }
  if (direction) {
    query += ` and r.direction = $${index++}`;
    params.push(direction);
  }
  if (patientId) {
    query += ` and r.patient_id = $${index++}`;
    params.push(patientId);
  }
  if (priority) {
    query += ` and r.priority = $${index++}`;
    params.push(priority);
  }

  query += " order by r.created_at desc";

  const result = await pool.query(query, params);
  res.json({ referrals: result.rows });
});

// GET /api/referrals/:id
referralsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const id = String(req.params.id);

  const result = await pool.query(
    `select
      r.*,
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
     from referrals r
     join patients p on p.id = r.patient_id
     where r.id = $1 and r.tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Referral not found" });
  }

  res.json({ referral: result.rows[0] });
});

// POST /api/referrals
referralsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = referralSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const payload = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = randomUUID();

  await pool.query(
    `insert into referrals (
      id, tenant_id, patient_id, direction, status, priority,
      referring_provider, referring_organization, referred_to_provider,
      referred_to_organization, appointment_id, reason, notes,
      created_by, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())`,
    [
      id,
      tenantId,
      payload.patientId,
      payload.direction,
      payload.status || "new",
      payload.priority || "routine",
      payload.referringProvider || null,
      payload.referringOrganization || null,
      payload.referredToProvider || null,
      payload.referredToOrganization || null,
      payload.appointmentId || null,
      payload.reason || null,
      payload.notes || null,
      userId,
    ]
  );

  await auditLog(tenantId, userId, "referral_create", "referral", id);
  res.status(201).json({ id });
});

// PUT /api/referrals/:id
referralsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = updateReferralSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const payload = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);

  const updates: string[] = [];
  const values: any[] = [];
  let index = 1;

  const add = (field: string, value: any) => {
    updates.push(`${field} = $${index++}`);
    values.push(value);
  };

  if (payload.patientId) add("patient_id", payload.patientId);
  if (payload.direction) add("direction", payload.direction);
  if (payload.status) add("status", payload.status);
  if (payload.priority) add("priority", payload.priority);
  if (payload.referringProvider !== undefined) add("referring_provider", payload.referringProvider || null);
  if (payload.referringOrganization !== undefined) add("referring_organization", payload.referringOrganization || null);
  if (payload.referredToProvider !== undefined) add("referred_to_provider", payload.referredToProvider || null);
  if (payload.referredToOrganization !== undefined) add("referred_to_organization", payload.referredToOrganization || null);
  if (payload.appointmentId !== undefined) add("appointment_id", payload.appointmentId || null);
  if (payload.reason !== undefined) add("reason", payload.reason || null);
  if (payload.notes !== undefined) add("notes", payload.notes || null);

  if (updates.length === 0) {
    return res.status(400).json({ error: "No updates provided" });
  }

  updates.push(`updated_at = now()`);
  values.push(id, tenantId);

  const result = await pool.query(
    `update referrals set ${updates.join(", ")}
     where id = $${index++} and tenant_id = $${index}
     returning id`,
    values
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Referral not found" });
  }

  await auditLog(tenantId, userId, "referral_update", "referral", id);
  res.json({ id });
});

// DELETE /api/referrals/:id
referralsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);

  const result = await pool.query(
    `delete from referrals where id = $1 and tenant_id = $2 returning id`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Referral not found" });
  }

  await auditLog(tenantId, userId, "referral_delete", "referral", id);
  res.json({ id });
});
