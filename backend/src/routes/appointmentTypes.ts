import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { redisCache, CacheKeys, CacheTTL } from "../services/redisCache";

export const appointmentTypesRouter = Router();

const updatePriorAuthRequiredSchema = z.object({
  priorAuthRequired: z.boolean(),
});

const createAppointmentTypeSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  color: z.string().trim().max(32).optional(),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
  priorAuthRequired: z.boolean().optional(),
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

appointmentTypesRouter.post(
  "/",
  requireAuth,
  requireRoles(["admin"]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const parsed = createAppointmentTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const existing = await pool.query(
      `SELECT id
       FROM appointment_types
       WHERE tenant_id = $1
         AND lower(trim(name)) = lower(trim($2))
       LIMIT 1`,
      [tenantId, parsed.data.name]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json({ error: "An appointment type with this name already exists" });
    }

    const id = parsed.data.id || crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO appointment_types (
         id, tenant_id, name, duration_minutes, color, category, description,
         is_active, prior_auth_required
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         name,
         duration_minutes as "durationMinutes",
         color,
         category,
         description,
         is_active as "isActive",
         coalesce(prior_auth_required, false) as "priorAuthRequired",
         created_at as "createdAt"`,
      [
        id,
        tenantId,
        parsed.data.name,
        parsed.data.durationMinutes,
        parsed.data.color || "#2563eb",
        parsed.data.category || "medical",
        parsed.data.description || null,
        parsed.data.isActive ?? true,
        parsed.data.priorAuthRequired ?? false,
      ]
    );

    await redisCache.del(CacheKeys.appointmentTypes(tenantId));

    return res.status(201).json({ appointmentType: result.rows[0] });
  }
);

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
