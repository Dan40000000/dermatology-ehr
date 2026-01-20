import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { redisCache, CacheKeys, CacheTTL } from "../services/redisCache";

export const locationsRouter = Router();

/**
 * @swagger
 * /api/locations:
 *   get:
 *     summary: List locations
 *     description: Retrieve all locations for the current tenant, sorted by name.
 *     tags:
 *       - Locations
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of locations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 locations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       address:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
locationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;

  // Try to get from cache first
  const cacheKey = CacheKeys.locations(tenantId);
  const cached = await redisCache.get(cacheKey);

  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ locations: cached });
  }

  // If not in cache, query database
  const result = await pool.query(
    `select id, name, address, created_at as "createdAt"
     from locations where tenant_id = $1 order by name`,
    [tenantId],
  );

  // Store in cache for 1 hour (locations rarely change)
  await redisCache.set(cacheKey, result.rows, CacheTTL.LONG);

  res.setHeader('X-Cache', 'MISS');
  res.json({ locations: result.rows });
});
