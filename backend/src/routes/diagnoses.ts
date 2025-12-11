import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const diagnosisSchema = z.object({
  encounterId: z.string(),
  icd10Code: z.string().min(3).max(10),
  description: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

export const diagnosesRouter = Router();

// Get all diagnoses for an encounter
diagnosesRouter.get("/encounter/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { encounterId } = req.params;

  const result = await pool.query(
    `select id, encounter_id as "encounterId", icd10_code as "icd10Code", description, is_primary as "isPrimary", created_at as "createdAt"
     from encounter_diagnoses
     where tenant_id = $1 and encounter_id = $2
     order by is_primary desc, created_at asc`,
    [tenantId, encounterId],
  );
  res.json({ diagnoses: result.rows });
});

// Add diagnosis to encounter
diagnosesRouter.post("/", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = diagnosisSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const id = crypto.randomUUID();
  const tenantId = req.user!.tenantId;
  const payload = parsed.data;

  // If this is being marked as primary, unmark any other primary diagnoses for this encounter
  if (payload.isPrimary) {
    await pool.query(
      `update encounter_diagnoses set is_primary = false
       where tenant_id = $1 and encounter_id = $2`,
      [tenantId, payload.encounterId],
    );
  }

  await pool.query(
    `insert into encounter_diagnoses(id, tenant_id, encounter_id, icd10_code, description, is_primary)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, tenantId, payload.encounterId, payload.icd10Code, payload.description, payload.isPrimary || false],
  );

  res.status(201).json({ id });
});

// Update diagnosis (primarily for changing primary status)
diagnosesRouter.put("/:id", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { isPrimary } = req.body;

  // Get the encounter ID for this diagnosis
  const diagnosisResult = await pool.query(
    `select encounter_id from encounter_diagnoses where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );

  if (diagnosisResult.rowCount === 0) {
    return res.status(404).json({ error: "Diagnosis not found" });
  }

  const encounterId = diagnosisResult.rows[0].encounter_id;

  // If marking as primary, unmark others
  if (isPrimary) {
    await pool.query(
      `update encounter_diagnoses set is_primary = false
       where tenant_id = $1 and encounter_id = $2 and id != $3`,
      [tenantId, encounterId, id],
    );
  }

  await pool.query(
    `update encounter_diagnoses set is_primary = $1 where id = $2 and tenant_id = $3`,
    [isPrimary, id, tenantId],
  );

  res.json({ success: true });
});

// Delete diagnosis
diagnosesRouter.delete("/:id", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  await pool.query(`delete from encounter_diagnoses where id = $1 and tenant_id = $2`, [id, tenantId]);
  res.json({ success: true });
});

// Search ICD-10 codes
diagnosesRouter.get("/search/icd10", requireAuth, async (req: AuthedRequest, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const searchTerm = `%${q}%`;
  const result = await pool.query(
    `select code, description, category, is_common as "isCommon"
     from icd10_codes
     where code ilike $1 or description ilike $1
     order by is_common desc, code asc
     limit 50`,
    [searchTerm],
  );

  res.json({ codes: result.rows });
});
