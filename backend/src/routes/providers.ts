import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { redisCache, CacheKeys, CacheTTL } from "../services/redisCache";

export const providersRouter = Router();

/**
 * @swagger
 * /api/providers:
 *   get:
 *     summary: List providers
 *     description: Retrieve all providers for the current tenant, sorted by full name.
 *     tags:
 *       - Providers
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 providers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
providersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const useCache = process.env.NODE_ENV !== "test";

  // Try to get from cache first
  const cacheKey = CacheKeys.providers(tenantId);
  const cached = useCache ? await redisCache.get(cacheKey) : null;

  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ providers: cached });
  }

  // If not in cache, query database
  const result = await pool.query(
    `select id, full_name as "fullName", specialty, created_at as "createdAt"
     from providers where tenant_id = $1 order by full_name`,
    [tenantId],
  );

  // Store in cache for 1 hour (providers rarely change)
  if (useCache) {
    await redisCache.set(cacheKey, result.rows, CacheTTL.LONG);
  }

  if (useCache) {
    res.setHeader('X-Cache', 'MISS');
  }
  res.json({ providers: result.rows });
});
