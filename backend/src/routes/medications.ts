import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';

export const medicationsRouter = Router();

// GET /api/medications - Search medications
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

// GET /api/medications/:id - Get single medication
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

// GET /api/medications/categories - Get all categories
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
