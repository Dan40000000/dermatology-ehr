import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const chargeSchema = z.object({
  encounterId: z.string().optional(),
  cptCode: z.string().min(3).max(10),
  description: z.string().optional(),
  icdCodes: z.array(z.string().min(3).max(10)).optional(),
  linkedDiagnosisIds: z.array(z.string()).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  feeCents: z.number().int().min(0).max(500000).optional(),
  amountCents: z.number().int().min(0).max(500000),
  status: z.enum(["draft", "pending", "ready", "submitted", "claimed", "self_pay", "paid", "denied"]).optional(),
});

const updateChargeSchema = z.object({
  description: z.string().optional(),
  icdCodes: z.array(z.string().min(3).max(10)).optional(),
  linkedDiagnosisIds: z.array(z.string()).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  feeCents: z.number().int().min(0).max(500000).optional(),
  status: z.enum(["draft", "pending", "ready", "submitted", "claimed", "self_pay", "paid", "denied"]).optional(),
});

export const chargesRouter = Router();

chargesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, encounter_id as "encounterId", cpt_code as "cptCode", description, icd_codes as "icdCodes",
            linked_diagnosis_ids as "linkedDiagnosisIds", quantity, fee_cents as "feeCents",
            amount_cents as "amountCents", status, created_at as "createdAt"
     from charges where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  res.json({ charges: result.rows });
});

// Get charges for specific encounter
chargesRouter.get("/encounter/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { encounterId } = req.params;

  const result = await pool.query(
    `select id, encounter_id as "encounterId", cpt_code as "cptCode", description, icd_codes as "icdCodes",
            linked_diagnosis_ids as "linkedDiagnosisIds", quantity, fee_cents as "feeCents",
            amount_cents as "amountCents", status, created_at as "createdAt"
     from charges
     where tenant_id = $1 and encounter_id = $2
     order by created_at asc`,
    [tenantId, encounterId],
  );
  res.json({ charges: result.rows });
});

chargesRouter.post("/", requireAuth, requireRoles(["admin", "billing", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const parsed = chargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;
  await pool.query(
    `insert into charges(id, tenant_id, encounter_id, cpt_code, description, icd_codes, linked_diagnosis_ids, quantity, fee_cents, amount_cents, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      tenantId,
      payload.encounterId || null,
      payload.cptCode,
      payload.description || null,
      payload.icdCodes || [],
      payload.linkedDiagnosisIds || [],
      payload.quantity || 1,
      payload.feeCents || null,
      payload.amountCents,
      payload.status || "pending",
    ],
  );
  res.status(201).json({ id });
});

// Update charge
chargesRouter.put("/:id", requireAuth, requireRoles(["admin", "billing", "provider", "ma", "front_desk"]), async (req: AuthedRequest, res) => {
  const parsed = updateChargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const payload = parsed.data;

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(payload.description);
  }
  if (payload.icdCodes !== undefined) {
    updates.push(`icd_codes = $${paramCount++}`);
    values.push(payload.icdCodes);
  }
  if (payload.linkedDiagnosisIds !== undefined) {
    updates.push(`linked_diagnosis_ids = $${paramCount++}`);
    values.push(payload.linkedDiagnosisIds);
  }
  if (payload.quantity !== undefined) {
    updates.push(`quantity = $${paramCount++}`);
    values.push(payload.quantity);
  }
  if (payload.feeCents !== undefined) {
    updates.push(`fee_cents = $${paramCount++}`);
    values.push(payload.feeCents);
  }
  if (payload.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(payload.status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  values.push(id, tenantId);
  await pool.query(
    `update charges set ${updates.join(", ")} where id = $${paramCount} and tenant_id = $${paramCount + 1}`,
    values,
  );

  res.json({ success: true });
});

// Delete charge
chargesRouter.delete("/:id", requireAuth, requireRoles(["admin", "billing", "provider", "ma"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(`delete from charges where id = $1 and tenant_id = $2`, [id, tenantId]);
  res.json({ success: true });
});

// Search CPT codes
chargesRouter.get("/search/cpt", requireAuth, async (req: AuthedRequest, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const searchTerm = `%${q}%`;
  const result = await pool.query(
    `with tenant_fee_items as (
       select distinct on (fsi.cpt_code)
         fsi.cpt_code,
         nullif(fsi.cpt_description, '') as cpt_description,
         nullif(fsi.category, '') as category,
         fsi.fee_cents
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
       order by fsi.cpt_code, fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     )
     select
       coalesce(tfi.cpt_code, c.code) as code,
       coalesce(c.description, tfi.cpt_description, tfi.cpt_code) as description,
       coalesce(c.category, tfi.category) as category,
       coalesce(tfi.fee_cents, c.default_fee_cents, 0) as "defaultFeeCents",
       coalesce(c.is_common, false) as "isCommon"
     from tenant_fee_items tfi
     full outer join cpt_codes c on c.code = tfi.cpt_code
     where coalesce(tfi.cpt_code, c.code) ilike $2
        or coalesce(c.description, tfi.cpt_description, '') ilike $2
        or coalesce(c.category, tfi.category, '') ilike $2
     order by "isCommon" desc, code asc
     limit 50`,
    [req.user!.tenantId, searchTerm],
  );

  res.json({ codes: result.rows });
});
