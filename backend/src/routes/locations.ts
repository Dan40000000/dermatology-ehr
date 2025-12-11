import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const locationsRouter = Router();

locationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, name, address, created_at as "createdAt"
     from locations where tenant_id = $1 order by name`,
    [tenantId],
  );
  res.json({ locations: result.rows });
});
