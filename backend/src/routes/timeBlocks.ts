import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

const createTimeBlockSchema = z.object({
  providerId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  title: z.string().min(1),
  blockType: z.enum(['blocked', 'lunch', 'meeting', 'admin', 'continuing_education', 'out_of_office']),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  recurrenceEndDate: z.string().optional(),
});

// Get time blocks
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { providerId, startDate, endDate } = req.query;

    let query = 'SELECT * FROM time_blocks WHERE tenant_id = $1 AND status = $2';
    const values: any[] = [tenantId, 'active'];
    let paramCount = 2;

    if (providerId) {
      paramCount++;
      query += ` AND provider_id = $${paramCount}`;
      values.push(providerId);
    }

    if (startDate && endDate) {
      paramCount++;
      query += ` AND start_time >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
      query += ` AND end_time <= $${paramCount}`;
      values.push(endDate);
    }

    query += ' ORDER BY start_time ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Create time block
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.userId;
    const validated = createTimeBlockSchema.parse(req.body);

    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO time_blocks (
        id, tenant_id, provider_id, location_id, title, block_type, description,
        start_time, end_time, is_recurring, recurrence_pattern, recurrence_end_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        id,
        tenantId,
        validated.providerId,
        validated.locationId || null,
        validated.title,
        validated.blockType,
        validated.description || null,
        validated.startTime,
        validated.endTime,
        validated.isRecurring,
        validated.recurrencePattern || null,
        validated.recurrenceEndDate || null,
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

// Delete time block
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    await pool.query(
      'UPDATE time_blocks SET status = $1 WHERE id = $2 AND tenant_id = $3',
      ['cancelled', id, tenantId]
    );

    res.json({ message: 'Time block cancelled' });
  } catch (error) {
    next(error);
  }
});

export default router;
