import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

const createHandoutSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  condition: z.string().min(1),
  content: z.string().min(1),
  isActive: z.boolean().default(true),
});

const updateHandoutSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// Get all handouts
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { category, condition, search } = req.query;

    let query = 'SELECT * FROM patient_handouts WHERE tenant_id = $1';
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      values.push(category);
    }

    if (condition) {
      paramCount++;
      query += ` AND condition ILIKE $${paramCount}`;
      values.push(`%${condition}%`);
    }

    if (search) {
      paramCount++;
      query += ` AND (title ILIKE $${paramCount} OR content ILIKE $${paramCount})`;
      values.push(`%${search}%`);
    }

    query += ' ORDER BY category, title ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get single handout
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM patient_handouts WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Create handout
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const validated = createHandoutSchema.parse(req.body);

    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO patient_handouts (
        id, tenant_id, title, category, condition, content, is_active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        id,
        tenantId,
        validated.title,
        validated.category,
        validated.condition,
        validated.content,
        validated.isActive,
        userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// Update handout
router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const validated = updateHandoutSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.title !== undefined) {
      paramCount++;
      updates.push(`title = $${paramCount}`);
      values.push(validated.title);
    }

    if (validated.category !== undefined) {
      paramCount++;
      updates.push(`category = $${paramCount}`);
      values.push(validated.category);
    }

    if (validated.condition !== undefined) {
      paramCount++;
      updates.push(`condition = $${paramCount}`);
      values.push(validated.condition);
    }

    if (validated.content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      values.push(validated.content);
    }

    if (validated.isActive !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(validated.isActive);
    }

    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    const query = `
      UPDATE patient_handouts
      SET ${updates.join(', ')}
      WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// Delete handout
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM patient_handouts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Handout not found' });
    }

    res.json({ message: 'Handout deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
