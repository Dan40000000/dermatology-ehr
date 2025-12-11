import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const appointmentTypesRouter = Router();

appointmentTypesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, name, duration_minutes as "durationMinutes", created_at as "createdAt"
     from appointment_types where tenant_id = $1 order by name`,
    [tenantId],
  );
  res.json({ appointmentTypes: result.rows });
});
