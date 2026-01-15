import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const vitalsRouter = Router();

vitalsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const patientId = req.query.patientId as string | undefined;

  let query = `
    select id, patient_id as "patientId", encounter_id as "encounterId",
           height_cm as "heightCm", weight_kg as "weightKg",
           bp_systolic as "bpSystolic", bp_diastolic as "bpDiastolic",
           pulse, temp_c as "tempC", respiratory_rate as "respiratoryRate",
           o2_saturation as "o2Saturation", recorded_by_id as "recordedById",
           recorded_at as "recordedAt", created_at as "createdAt"
    from vitals
    where tenant_id = $1
  `;

  const params: any[] = [tenantId];

  if (patientId) {
    query += ` and patient_id = $2`;
    params.push(patientId);
  }

  query += ` order by recorded_at desc, created_at desc limit 200`;

  const result = await pool.query(query, params);
  res.json({ vitals: result.rows });
});
