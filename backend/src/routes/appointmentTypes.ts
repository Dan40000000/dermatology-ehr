import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { redisCache, CacheKeys, CacheTTL } from "../services/redisCache";

export const appointmentTypesRouter = Router();

appointmentTypesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Try to get from cache first
  const cacheKey = CacheKeys.appointmentTypes(tenantId);
  const cached = await redisCache.get(cacheKey);

  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ appointmentTypes: cached });
  }

  // If not in cache, query database
  const result = await pool.query(
    `select id, name, duration_minutes as "durationMinutes", created_at as "createdAt"
     from appointment_types where tenant_id = $1 order by name`,
    [tenantId],
  );

  // Store in cache for 1 hour (appointment types rarely change)
  await redisCache.set(cacheKey, result.rows, CacheTTL.LONG);

  res.setHeader('X-Cache', 'MISS');
  res.json({ appointmentTypes: result.rows });
});
