import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";
import { randomUUID } from "crypto";

const cohortSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  criteria: z.record(z.string(), z.any()).optional(),
});

const updateCohortSchema = cohortSchema.partial();

const memberSchema = z.object({
  patientId: z.string().min(1),
  status: z.enum(["active", "inactive"]).optional(),
});

export const registryRouter = Router();

registryRouter.use(requireAuth, requireModuleAccess("registry"));

// GET /api/registry/cohorts
registryRouter.get("/cohorts", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { status } = req.query;

  let query = `
    select
      rc.*,
      count(rm.id) as "memberCount"
    from registry_cohorts rc
    left join registry_members rm on rm.registry_id = rc.id
    where rc.tenant_id = $1
  `;

  const params: any[] = [tenantId];
  let index = 2;

  if (status) {
    query += ` and rc.status = $${index++}`;
    params.push(status);
  }

  query += " group by rc.id order by rc.created_at desc";

  const result = await pool.query(query, params);
  res.json({ cohorts: result.rows });
});

// POST /api/registry/cohorts
registryRouter.post("/cohorts", async (req: AuthedRequest, res) => {
  const parsed = cohortSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const payload = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = randomUUID();

  await pool.query(
    `insert into registry_cohorts(
      id, tenant_id, name, description, status, criteria, created_by, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      id,
      tenantId,
      payload.name,
      payload.description || null,
      payload.status || "active",
      payload.criteria ? JSON.stringify(payload.criteria) : null,
      userId,
    ]
  );

  await auditLog(tenantId, userId, "registry_cohort_create", "registry_cohort", id);
  res.status(201).json({ id });
});

// PUT /api/registry/cohorts/:id
registryRouter.put("/cohorts/:id", async (req: AuthedRequest, res) => {
  const parsed = updateCohortSchema.safeParse(req.body);
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

  if (payload.name) add("name", payload.name);
  if (payload.description !== undefined) add("description", payload.description || null);
  if (payload.status) add("status", payload.status);
  if (payload.criteria !== undefined) add("criteria", payload.criteria ? JSON.stringify(payload.criteria) : null);

  if (updates.length === 0) {
    return res.status(400).json({ error: "No updates provided" });
  }

  updates.push("updated_at = now()");
  values.push(id, tenantId);

  const result = await pool.query(
    `update registry_cohorts set ${updates.join(", ")}
     where id = $${index++} and tenant_id = $${index}
     returning id`,
    values
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Registry cohort not found" });
  }

  await auditLog(tenantId, userId, "registry_cohort_update", "registry_cohort", id);
  res.json({ id });
});

// DELETE /api/registry/cohorts/:id
registryRouter.delete("/cohorts/:id", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = String(req.params.id);

  const result = await pool.query(
    `delete from registry_cohorts where id = $1 and tenant_id = $2 returning id`,
    [id, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Registry cohort not found" });
  }

  await pool.query(
    `delete from registry_members where registry_id = $1 and tenant_id = $2`,
    [id, tenantId]
  );

  await auditLog(tenantId, userId, "registry_cohort_delete", "registry_cohort", id);
  res.json({ id });
});

// GET /api/registry/cohorts/:id/members
registryRouter.get("/cohorts/:id/members", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const cohortId = String(req.params.id);

  const result = await pool.query(
    `select
      rm.id,
      rm.registry_id as "registryId",
      rm.patient_id as "patientId",
      rm.status,
      rm.added_at as "addedAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName"
     from registry_members rm
     join patients p on p.id = rm.patient_id
     where rm.registry_id = $1 and rm.tenant_id = $2
     order by rm.added_at desc`,
    [cohortId, tenantId]
  );

  res.json({ members: result.rows });
});

// POST /api/registry/cohorts/:id/members
registryRouter.post("/cohorts/:id/members", async (req: AuthedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const payload = parsed.data;
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const cohortId = String(req.params.id);
  const id = randomUUID();

  const result = await pool.query(
    `insert into registry_members(
      id, tenant_id, registry_id, patient_id, status, added_by, added_at
    ) values ($1, $2, $3, $4, $5, $6, now())
    on conflict (tenant_id, registry_id, patient_id)
    do update set status = excluded.status, added_by = excluded.added_by, added_at = now()
    returning id`,
    [
      id,
      tenantId,
      cohortId,
      payload.patientId,
      payload.status || "active",
      userId,
    ]
  );

  const memberId = result.rows[0]?.id || id;
  await auditLog(tenantId, userId, "registry_member_add", "registry_member", memberId);
  res.status(201).json({ id: memberId });
});

// DELETE /api/registry/cohorts/:id/members/:memberId
registryRouter.delete("/cohorts/:id/members/:memberId", async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const memberId = String(req.params.memberId);

  const result = await pool.query(
    `delete from registry_members where id = $1 and tenant_id = $2 returning id`,
    [memberId, tenantId]
  );

  if (!result.rowCount) {
    return res.status(404).json({ error: "Registry member not found" });
  }

  await auditLog(tenantId, userId, "registry_member_remove", "registry_member", memberId);
  res.json({ id: memberId });
});
