import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

const createWaitlistSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  appointmentTypeId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  preferredStartDate: z.string().optional(),
  preferredEndDate: z.string().optional(),
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
  preferredDaysOfWeek: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

const updateWaitlistSchema = z.object({
  status: z.enum(['active', 'contacted', 'scheduled', 'cancelled', 'expired']).optional(),
  patientNotifiedAt: z.string().optional(),
  notificationMethod: z.enum(['phone', 'email', 'sms', 'portal']).optional(),
  scheduledAppointmentId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

// Get waitlist entries
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { status, priority, providerId } = req.query;

    let query = `
      SELECT w.*, p.first_name, p.last_name, p.phone, p.email,
             u.full_name as provider_name
      FROM waitlist w
      JOIN patients p ON w.patient_id = p.id
      LEFT JOIN users u ON w.provider_id = u.id
      WHERE w.tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND w.status = $${paramCount}`;
      values.push(status);
    } else {
      // Default to active only
      paramCount++;
      query += ` AND w.status = $${paramCount}`;
      values.push('active');
    }

    if (priority) {
      paramCount++;
      query += ` AND w.priority = $${paramCount}`;
      values.push(priority);
    }

    if (providerId) {
      paramCount++;
      query += ` AND w.provider_id = $${paramCount}`;
      values.push(providerId);
    }

    query += ' ORDER BY w.priority DESC, w.created_at ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Create waitlist entry
router.post('/', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.user?.userId;
    const validated = createWaitlistSchema.parse(req.body);

    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO waitlist (
        id, tenant_id, patient_id, provider_id, appointment_type_id, location_id,
        reason, notes, preferred_start_date, preferred_end_date, preferred_time_of_day,
        preferred_days_of_week, priority, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        id,
        tenantId,
        validated.patientId,
        validated.providerId || null,
        validated.appointmentTypeId || null,
        validated.locationId || null,
        validated.reason,
        validated.notes || null,
        validated.preferredStartDate || null,
        validated.preferredEndDate || null,
        validated.preferredTimeOfDay,
        validated.preferredDaysOfWeek || null,
        validated.priority,
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

// Update waitlist entry
router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;
    const validated = updateWaitlistSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (validated.status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(validated.status);

      if (validated.status === 'scheduled') {
        paramCount++;
        updates.push(`resolved_at = $${paramCount}`);
        values.push(new Date().toISOString());
      }
    }

    if (validated.patientNotifiedAt) {
      paramCount++;
      updates.push(`patient_notified_at = $${paramCount}`);
      values.push(validated.patientNotifiedAt);
    }

    if (validated.notificationMethod) {
      paramCount++;
      updates.push(`notification_method = $${paramCount}`);
      values.push(validated.notificationMethod);
    }

    if (validated.scheduledAppointmentId) {
      paramCount++;
      updates.push(`scheduled_appointment_id = $${paramCount}`);
      values.push(validated.scheduledAppointmentId);
    }

    if (validated.notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(validated.notes);
    }

    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    paramCount++;
    values.push(id);
    paramCount++;
    values.push(tenantId);

    const query = `
      UPDATE waitlist
      SET ${updates.join(', ')}
      WHERE id = $${paramCount - 1} AND tenant_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
});

// Delete waitlist entry
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM waitlist WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    res.json({ message: 'Waitlist entry deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
