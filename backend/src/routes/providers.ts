import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const providersRouter = Router();

providersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const result = await pool.query(
    `select id, full_name as "fullName", specialty, created_at as "createdAt"
     from providers where tenant_id = $1 order by full_name`,
    [tenantId],
  );
  res.json({ providers: result.rows });
});
