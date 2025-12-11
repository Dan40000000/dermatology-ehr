import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const vitalsRouter = Router();

vitalsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, encounter_id as "encounterId", height_cm as "heightCm", weight_kg as "weightKg",
            bp_systolic as "bpSystolic", bp_diastolic as "bpDiastolic", pulse, temp_c as "tempC", created_at as "createdAt"
     from vitals where tenant_id = $1 order by created_at desc limit 50`,
    [tenantId],
  );
  res.json({ vitals: result.rows });
});
