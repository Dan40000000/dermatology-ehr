import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { redisCache, CacheKeys, CacheTTL } from "../services/redisCache";

export const appointmentTypesRouter = Router();

const updatePriorAuthRequiredSchema = z.object({
  priorAuthRequired: z.boolean(),
});

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
    `select
       id,
       name,
       duration_minutes as "durationMinutes",
       color,
       category,
       description,
       is_active as "isActive",
       coalesce(prior_auth_required, false) as "priorAuthRequired",
       created_at as "createdAt"
     from appointment_types
     where tenant_id = $1
     order by name`,
    [tenantId],
  );

  // Store in cache for 1 hour (appointment types rarely change)
  await redisCache.set(cacheKey, result.rows, CacheTTL.LONG);

  res.setHeader('X-Cache', 'MISS');
  res.json({ appointmentTypes: result.rows });
});

appointmentTypesRouter.put(
  "/:id/prior-auth-required",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const parsed = updatePriorAuthRequiredSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const result = await pool.query(
      `update appointment_types
       set prior_auth_required = $1
       where tenant_id = $2 and id = $3
       returning
         id,
         name,
         duration_minutes as "durationMinutes",
         color,
         category,
         description,
         is_active as "isActive",
         coalesce(prior_auth_required, false) as "priorAuthRequired",
         created_at as "createdAt"`,
      [parsed.data.priorAuthRequired, tenantId, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Appointment type not found" });
    }

    await redisCache.del(CacheKeys.appointmentTypes(tenantId));
    return res.json({ appointmentType: result.rows[0] });
  }
);
