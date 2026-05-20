import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { CLINICAL_ROLES } from "../lib/roles";
import { ensureMelanomaRecallForDiagnosis } from "../services/melanomaRecallService";
import { immutableEncounterErrorMessage, isImmutableEncounterStatus } from "../lib/clinicalWorkflow";

const diagnosisSchema = z.object({
  encounterId: z.string(),
  icd10Code: z.string().min(3).max(10),
  description: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

const diagnosisUpdateSchema = z.object({
  description: z.string().trim().min(1).optional(),
  isPrimary: z.boolean().optional(),
}).refine((data) => data.description !== undefined || data.isPrimary !== undefined, {
  message: "At least one diagnosis field must be provided",
});

export const diagnosesRouter = Router();

function normalizeIcd10Code(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeIcd10SearchTerm(value: string): string {
  return value.trim().toUpperCase().replace(/\./g, "");
}

async function resolveIcd10Description(code: string, fallback: string): Promise<string> {
  const result = await pool.query(
    `select description
     from icd10_codes
     where replace(upper(code), '.', '') = $1
     limit 1`,
    [normalizeIcd10SearchTerm(code)],
  );

  return result.rows[0]?.description || fallback;
}

async function ensureEncounterCanReceiveDiagnosis(tenantId: string, encounterId: string): Promise<string | null> {
  const result = await pool.query(
    `select status from encounters where id = $1 and tenant_id = $2`,
    [encounterId, tenantId],
  );
  const status = result.rows[0]?.status;
  if (status && isImmutableEncounterStatus(status)) {
    return immutableEncounterErrorMessage(status);
  }
  return null;
}

// Get all diagnoses for an encounter
diagnosesRouter.get("/encounter/:encounterId", requireAuth, requireRoles([...CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
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
  const payload = {
    ...parsed.data,
    icd10Code: normalizeIcd10Code(parsed.data.icd10Code),
  };
  const lockError = await ensureEncounterCanReceiveDiagnosis(tenantId, payload.encounterId);
  if (lockError) {
    return res.status(409).json({ error: lockError });
  }

  const description = await resolveIcd10Description(payload.icd10Code, payload.description);

  const existingResult = await pool.query(
    `select id
     from encounter_diagnoses
     where tenant_id = $1
       and encounter_id = $2
       and replace(upper(icd10_code), '.', '') = $3
     limit 1`,
    [tenantId, payload.encounterId, normalizeIcd10SearchTerm(payload.icd10Code)],
  );

  if (existingResult.rowCount && existingResult.rows[0]?.id) {
    const existingId = existingResult.rows[0].id;

    if (payload.isPrimary) {
      await pool.query(
        `update encounter_diagnoses set is_primary = false
         where tenant_id = $1 and encounter_id = $2 and id != $3`,
        [tenantId, payload.encounterId, existingId],
      );
      await pool.query(
        `update encounter_diagnoses
         set is_primary = true, description = $1
         where tenant_id = $2 and id = $3`,
        [description, tenantId, existingId],
      );
    }

    return res.status(200).json({ id: existingId, existing: true });
  }

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
    [id, tenantId, payload.encounterId, payload.icd10Code, description, payload.isPrimary || false],
  );

  const recall = await ensureMelanomaRecallForDiagnosis({
    tenantId,
    encounterId: payload.encounterId,
    icd10Code: payload.icd10Code,
    description,
    userId: req.user!.id,
  });

  res.status(201).json({ id, recall: recall.triggered ? recall : undefined });
});

// Update diagnosis (primarily for changing primary status)
diagnosesRouter.put("/:id", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const parsed = diagnosisUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { description, isPrimary } = parsed.data;

  // Get the encounter ID for this diagnosis
  const diagnosisResult = await pool.query(
    `select encounter_id from encounter_diagnoses where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );

  if (!diagnosisResult.rows[0]) {
    return res.status(404).json({ error: "Diagnosis not found" });
  }

  const encounterId = diagnosisResult.rows[0].encounter_id;
  const lockError = await ensureEncounterCanReceiveDiagnosis(tenantId, encounterId);
  if (lockError) {
    return res.status(409).json({ error: lockError });
  }

  // If marking as primary, unmark others
  if (isPrimary) {
    await pool.query(
      `update encounter_diagnoses set is_primary = false
       where tenant_id = $1 and encounter_id = $2 and id != $3`,
      [tenantId, encounterId, id],
    );
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (isPrimary !== undefined) {
    params.push(isPrimary);
    updates.push(`is_primary = $${params.length}`);
  }
  if (description !== undefined) {
    params.push(description);
    updates.push(`description = $${params.length}`);
  }

  params.push(id, tenantId);
  await pool.query(
    `update encounter_diagnoses set ${updates.join(", ")} where id = $${params.length - 1} and tenant_id = $${params.length}`,
    params,
  );

  res.json({ success: true });
});

// Delete diagnosis
diagnosesRouter.delete("/:id", requireAuth, requireRoles(["provider", "admin"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  const diagnosisResult = await pool.query(
    `select encounter_id, icd10_code
     from encounter_diagnoses
     where id = $1 and tenant_id = $2
     limit 1`,
    [id, tenantId],
  );

  if (!diagnosisResult.rows[0]) {
    return res.status(404).json({ error: "Diagnosis not found" });
  }

  const diagnosis = diagnosisResult.rows[0];
  const lockError = await ensureEncounterCanReceiveDiagnosis(tenantId, diagnosis.encounter_id);
  if (lockError) {
    return res.status(409).json({ error: lockError });
  }

  await pool.query(`delete from encounter_diagnoses where id = $1 and tenant_id = $2`, [id, tenantId]);

  await pool.query(
    `update charges
     set
       linked_diagnosis_ids = array_remove(coalesce(linked_diagnosis_ids, array[]::text[]), $1),
       icd_codes = array_remove(coalesce(icd_codes, array[]::text[]), $2)
     where tenant_id = $3
       and encounter_id = $4`,
    [id, diagnosis.icd10_code, tenantId, diagnosis.encounter_id],
  );

  res.json({ success: true });
});

// Search ICD-10 codes
diagnosesRouter.get("/search/icd10", requireAuth, requireRoles([...CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const normalizedQuery = q.trim();
  const searchTerm = `%${normalizedQuery}%`;
  const codeSearchTerm = `%${normalizeIcd10SearchTerm(normalizedQuery)}%`;
  const result = await pool.query(
    `select code, description, category, is_common as "isCommon"
     from icd10_codes
     where replace(upper(code), '.', '') ilike $1
        or code ilike $2
        or description ilike $2
     order by
       case
         when replace(upper(code), '.', '') = replace(upper($3), '.', '') then 0
         when replace(upper(code), '.', '') ilike $1 then 1
         else 2
       end,
       is_common desc,
       code asc
     limit 50`,
    [codeSearchTerm, searchTerm, normalizedQuery],
  );

  res.json({ codes: result.rows });
});
