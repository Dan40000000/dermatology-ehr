import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

const vitalsSchema = z.object({
  patientId: z.string(),
  encounterId: z.string().optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  bpSystolic: z.number().optional(),
  bpDiastolic: z.number().optional(),
  pulse: z.number().optional(),
  tempC: z.number().optional(),
  respiratoryRate: z.number().optional(),
  o2Saturation: z.number().optional(),
  recordedAt: z.string().optional(),
});

export const vitalsWriteRouter = Router();

vitalsWriteRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = vitalsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const id = crypto.randomUUID();
  const v = parsed.data;

  // Verify patient exists
  const patient = await pool.query(`select id from patients where id = $1 and tenant_id = $2`, [v.patientId, tenantId]);
  if (!patient.rowCount) return res.status(404).json({ error: "Patient not found" });

  // If encounterId provided, verify it exists and is not locked
  if (v.encounterId) {
    const enc = await pool.query(`select status from encounters where id = $1 and tenant_id = $2`, [v.encounterId, tenantId]);
    if (!enc.rowCount) return res.status(404).json({ error: "Encounter not found" });
    if (enc.rows[0].status === "locked") return res.status(409).json({ error: "Encounter is locked" });
  }

  const recordedAt = v.recordedAt ? new Date(v.recordedAt) : new Date();

  await pool.query(
    `insert into vitals(id, tenant_id, patient_id, encounter_id, height_cm, weight_kg, bp_systolic, bp_diastolic, pulse, temp_c, respiratory_rate, o2_saturation, recorded_by_id, recorded_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, tenantId, v.patientId, v.encounterId || null, v.heightCm || null, v.weightKg || null, v.bpSystolic || null, v.bpDiastolic || null, v.pulse || null, v.tempC || null, v.respiratoryRate || null, v.o2Saturation || null, userId, recordedAt],
  );
  await auditLog(tenantId, userId, "vitals_create", "vitals", id);
  res.status(201).json({ id });
});
