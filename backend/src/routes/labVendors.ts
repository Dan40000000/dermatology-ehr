/**
 * Lab Vendors Routes
 * Manage lab vendors, test catalog, and order sets
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/lab-vendors
 * Get all lab vendors
 */
router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const { active_only = 'true', vendor_type } = req.query;

    let query = `
      SELECT *
      FROM lab_vendors
      WHERE tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }

    if (vendor_type) {
      query += ` AND vendor_type = $${paramIndex}`;
      params.push(vendor_type);
      paramIndex++;
    }

    query += ` ORDER BY is_preferred DESC, name ASC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab vendors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch lab vendors' });
  }
});

/**
 * GET /api/lab-vendors/catalog
 * Get lab test catalog with filtering
 */
router.get('/catalog', async (req: AuthedRequest, res: Response) => {
  try {
    const { vendor_id, category, subcategory, search, active_only = 'true' } = req.query;

    let query = `
      SELECT
        ltc.*,
        lv.name as vendor_name,
        lv.vendor_type
      FROM lab_test_catalog ltc
      LEFT JOIN lab_vendors lv ON ltc.vendor_id = lv.id
      WHERE ltc.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (active_only === 'true') {
      query += ` AND ltc.is_active = true`;
    }

    if (vendor_id) {
      query += ` AND ltc.vendor_id = $${paramIndex}`;
      params.push(vendor_id);
      paramIndex++;
    }

    if (category) {
      query += ` AND ltc.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (subcategory) {
      query += ` AND ltc.subcategory = $${paramIndex}`;
      params.push(subcategory);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        ltc.test_name ILIKE $${paramIndex} OR
        ltc.short_name ILIKE $${paramIndex} OR
        ltc.test_code ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY ltc.order_priority ASC, ltc.test_name ASC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab test catalog', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch test catalog' });
  }
});

/**
 * GET /api/lab-vendors/order-sets
 * Get lab order sets
 */
router.get('/order-sets', async (req: AuthedRequest, res: Response) => {
  try {
    const { category, active_only = 'true' } = req.query;

    let query = `
      SELECT
        los.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', lost.id,
              'test_id', lost.test_id,
              'is_required', lost.is_required,
              'test_code', ltc.test_code,
              'test_name', ltc.test_name,
              'category', ltc.category,
              'specimen_type', ltc.specimen_type
            ) ORDER BY lost.display_order
          )
          FROM lab_order_set_tests lost
          JOIN lab_test_catalog ltc ON lost.test_id = ltc.id
          WHERE lost.order_set_id = los.id
        ) as tests
      FROM lab_order_sets los
      WHERE los.tenant_id = $1
    `;

    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (active_only === 'true') {
      query += ` AND los.is_active = true`;
    }

    if (category) {
      query += ` AND los.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY los.is_default DESC, los.name ASC`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching lab order sets', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch order sets' });
  }
});

/**
 * GET /api/lab-vendors/categories
 * Get available test categories
 */
router.get('/categories', async (req: AuthedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as test_count
      FROM lab_test_catalog
      WHERE tenant_id = $1 AND is_active = true
      GROUP BY category
      ORDER BY category`,
      [req.user!.tenantId]
    );

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching test categories', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * POST /api/lab-vendors/order-sets
 * Create a custom lab order set
 */
router.post('/order-sets', async (req: AuthedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const { name, description, category, indication, frequency_recommendation, tests } = req.body;

    await client.query('BEGIN');

    // Create order set
    const orderSetResult = await client.query(
      `INSERT INTO lab_order_sets (
        tenant_id, name, description, category, indication,
        frequency_recommendation, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [req.user!.tenantId, name, description, category, indication, frequency_recommendation, true, req.user!.id]
    );

    const orderSetId = orderSetResult.rows[0].id;

    // Add tests to order set
    if (tests && tests.length > 0) {
      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        await client.query(
          `INSERT INTO lab_order_set_tests (
            order_set_id, test_id, is_required, display_order
          ) VALUES ($1, $2, $3, $4)`,
          [orderSetId, test.test_id, test.is_required ?? true, i]
        );
      }
    }

    await client.query('COMMIT');

    logger.info('Lab order set created', { orderSetId, userId: req.user!.id });

    res.status(201).json(orderSetResult.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error creating lab order set', { error: error.message });
    res.status(500).json({ error: 'Failed to create order set' });
  } finally {
    client.release();
  }
});

export const labVendorsRouter = router;
