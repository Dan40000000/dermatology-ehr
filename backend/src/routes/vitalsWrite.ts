import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

const vitalsSchema = z.object({
  encounterId: z.string(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  bpSystolic: z.number().optional(),
  bpDiastolic: z.number().optional(),
  pulse: z.number().optional(),
  tempC: z.number().optional(),
});

export const vitalsWriteRouter = Router();

vitalsWriteRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = vitalsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const id = crypto.randomUUID();
  const v = parsed.data;
  const enc = await pool.query(`select status from encounters where id = $1 and tenant_id = $2`, [v.encounterId, tenantId]);
  if (!enc.rowCount) return res.status(404).json({ error: "Encounter not found" });
  if (enc.rows[0].status === "locked") return res.status(409).json({ error: "Encounter is locked" });
  await pool.query(
    `insert into vitals(id, tenant_id, encounter_id, height_cm, weight_kg, bp_systolic, bp_diastolic, pulse, temp_c)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, tenantId, v.encounterId, v.heightCm || null, v.weightKg || null, v.bpSystolic || null, v.bpDiastolic || null, v.pulse || null, v.tempC || null],
  );
  await auditLog(tenantId, req.user!.id, "vitals_create", "vitals", id);
  res.status(201).json({ id });
});
