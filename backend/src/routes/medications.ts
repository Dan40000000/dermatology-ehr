import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';

export const medicationsRouter = Router();

/**
 * @swagger
 * /api/medications:
 *   get:
 *     summary: Search medications
 *     description: Search for medications with optional filters for category and controlled status (limited to 50).
 *     tags:
 *       - Medications
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, generic name, or brand name
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by medication category
 *       - in: query
 *         name: controlled
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter by controlled substance status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: List of medications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 medications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       genericName:
 *                         type: string
 *                       brandName:
 *                         type: string
 *                       category:
 *                         type: string
 *                       isControlled:
 *                         type: boolean
 *       500:
 *         description: Failed to search medications
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
medicationsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { search, category, controlled, limit = '50' } = req.query;

    let query = 'select * from medications where 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search && typeof search === 'string') {
      query += ` and (
        name ilike $${paramIndex} or
        generic_name ilike $${paramIndex} or
        brand_name ilike $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (category && typeof category === 'string') {
      query += ` and category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (controlled === 'true') {
      query += ` and is_controlled = true`;
    } else if (controlled === 'false') {
      query += ` and is_controlled = false`;
    }

    query += ` order by name limit $${paramIndex}`;
    params.push(parseInt(limit as string, 10));

    const result = await pool.query(query, params);

    return res.json({ medications: result.rows });
  } catch (error) {
    console.error('Error searching medications:', error);
    return res.status(500).json({ error: 'Failed to search medications' });
  }
});

/**
 * @swagger
 * /api/medications/list/categories:
 *   get:
 *     summary: Get medication categories
 *     description: Retrieve all distinct medication categories.
 *     tags:
 *       - Medications
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Failed to fetch categories
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
medicationsRouter.get('/list/categories', requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const result = await pool.query(
      'select distinct category from medications where category is not null order by category'
    );

    return res.json({ categories: result.rows.map(r => r.category) });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * @swagger
 * /api/medications/{id}:
 *   get:
 *     summary: Get medication by ID
 *     description: Retrieve a single medication's detailed information.
 *     tags:
 *       - Medications
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Medication ID
 *     responses:
 *       200:
 *         description: Medication details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 medication:
 *                   type: object
 *       404:
 *         description: Medication not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch medication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
medicationsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'select * from medications where id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    return res.json({ medication: result.rows[0] });
  } catch (error) {
    console.error('Error fetching medication:', error);
    return res.status(500).json({ error: 'Failed to fetch medication' });
  }
});
