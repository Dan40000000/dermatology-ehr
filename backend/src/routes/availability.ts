import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const availabilityRouter = Router();

availabilityRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, provider_id as "providerId", day_of_week as "dayOfWeek", start_time as "startTime", end_time as "endTime"
     from provider_availability where tenant_id = $1 order by provider_id, day_of_week, start_time`,
    [tenantId],
  );
  res.json({ availability: result.rows });
});
