/**
 * Result Flags Routes
 * Manage result flags for lab orders and imaging/radiology orders
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Result flag types enum
const resultFlagTypes = [
  'benign',
  'inconclusive',
  'precancerous',
  'cancerous',
  'normal',
  'abnormal',
  'low',
  'high',
  'out_of_range',
  'panic_value',
  'none'
] as const;

// Validation schema
const updateResultFlagSchema = z.object({
  resultFlag: z.enum(resultFlagTypes),
  changeReason: z.string().optional(),
});

/**
 * PATCH /api/result-flags/orders/:id
 * Update result flag for a general order (imaging/radiology)
 */
router.patch('/orders/:id', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const parsed = updateResultFlagSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { resultFlag, changeReason } = parsed.data;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    await client.query('BEGIN');

    // Get current flag for audit
    const currentResult = await client.query(
      `SELECT result_flag FROM orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const oldFlag = currentResult.rows[0].result_flag;

    // Update the order
    const updateResult = await client.query(
      `UPDATE orders
       SET result_flag = $1,
           result_flag_updated_at = NOW(),
           result_flag_updated_by = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, result_flag as "resultFlag", result_flag_updated_at as "resultFlagUpdatedAt"`,
      [resultFlag, userId, id, tenantId]
    );

    // Create audit trail
    await client.query(
      `INSERT INTO result_flag_audit (
        tenant_id, order_id, old_flag, new_flag, changed_by, change_reason
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, id, oldFlag, resultFlag, userId, changeReason]
    );

    await client.query('COMMIT');

    logger.info('Order result flag updated', {
      orderId: id,
      oldFlag,
      newFlag: resultFlag,
      userId
    });

    res.json(updateResult.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error updating order result flag', { error: error.message });
    res.status(500).json({ error: 'Failed to update result flag' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/result-flags/lab-orders/:id
 * Update result flag for a lab order
 */
router.patch('/lab-orders/:id', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const parsed = updateResultFlagSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { resultFlag, changeReason } = parsed.data;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    await client.query('BEGIN');

    // Get current flag for audit
    const currentResult = await client.query(
      `SELECT result_flag FROM lab_orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lab order not found' });
    }

    const oldFlag = currentResult.rows[0].result_flag;

    // Update the lab order
    const updateResult = await client.query(
      `UPDATE lab_orders
       SET result_flag = $1,
           result_flag_updated_at = NOW(),
           result_flag_updated_by = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, result_flag as "resultFlag", result_flag_updated_at as "resultFlagUpdatedAt"`,
      [resultFlag, userId, id, tenantId]
    );

    // Create audit trail
    await client.query(
      `INSERT INTO result_flag_audit (
        tenant_id, lab_order_id, old_flag, new_flag, changed_by, change_reason
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, id, oldFlag, resultFlag, userId, changeReason]
    );

    await client.query('COMMIT');

    logger.info('Lab order result flag updated', {
      labOrderId: id,
      oldFlag,
      newFlag: resultFlag,
      userId
    });

    res.json(updateResult.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error updating lab order result flag', { error: error.message });
    res.status(500).json({ error: 'Failed to update result flag' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/result-flags/audit
 * Get audit trail for result flag changes
 */
router.get('/audit', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { order_id, lab_order_id, limit = 50 } = req.query;
    const tenantId = req.user!.tenantId;

    let query = `
      SELECT
        rfa.*,
        p.first_name || ' ' || p.last_name as changed_by_name
      FROM result_flag_audit rfa
      LEFT JOIN providers p ON rfa.changed_by = p.id
      WHERE rfa.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (order_id) {
      query += ` AND rfa.order_id = $${paramIndex}`;
      params.push(order_id);
      paramIndex++;
    }

    if (lab_order_id) {
      query += ` AND rfa.lab_order_id = $${paramIndex}`;
      params.push(lab_order_id);
      paramIndex++;
    }

    query += ` ORDER BY rfa.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching result flag audit', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

/**
 * GET /api/result-flags/stats
 * Get statistics about result flags
 */
router.get('/stats', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Get stats for orders (imaging/radiology)
    const orderStats = await pool.query(
      `SELECT
        result_flag,
        COUNT(*) as count
      FROM orders
      WHERE tenant_id = $1 AND result_flag IS NOT NULL
      GROUP BY result_flag`,
      [tenantId]
    );

    // Get stats for lab orders
    const labOrderStats = await pool.query(
      `SELECT
        result_flag,
        COUNT(*) as count
      FROM lab_orders
      WHERE tenant_id = $1 AND result_flag IS NOT NULL
      GROUP BY result_flag`,
      [tenantId]
    );

    res.json({
      orders: orderStats.rows,
      labOrders: labOrderStats.rows
    });
  } catch (error: any) {
    logger.error('Error fetching result flag stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export const resultFlagsRouter = router;
