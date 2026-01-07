import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { getTwilioServiceFromEnv } from '../services/twilioService';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import { waitlistAutoFillService } from '../services/waitlistAutoFillService';
import { sendWaitlistNotification, getWaitlistNotificationHistory } from '../services/waitlistNotificationService';

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
    const tenantId = req.user!.tenantId;
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
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
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
    const tenantId = req.user!.tenantId;
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
    const tenantId = req.user!.tenantId;
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

// Auto-fill waitlist when appointment is cancelled
router.post('/auto-fill', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { appointmentId, providerId, appointmentDate, appointmentTime } = req.body;

    if (!appointmentId || !providerId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get appointment details
    const apptResult = await pool.query(
      `SELECT a.id, a.scheduled_start, a.scheduled_end, a.provider_id, a.location_id,
              pr.full_name as provider_name
       FROM appointments a
       JOIN providers pr ON a.provider_id = pr.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (apptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appointment = apptResult.rows[0];
    const scheduledStart = new Date(appointment.scheduled_start);
    const scheduledEnd = new Date(appointment.scheduled_end);
    const appointmentHour = scheduledStart.getHours();

    // Determine time of day
    let timeOfDay = 'any';
    if (appointmentHour >= 6 && appointmentHour < 12) {
      timeOfDay = 'morning';
    } else if (appointmentHour >= 12 && appointmentHour < 17) {
      timeOfDay = 'afternoon';
    } else if (appointmentHour >= 17 && appointmentHour < 20) {
      timeOfDay = 'evening';
    }

    // Find matching waitlist entries
    const waitlistResult = await pool.query(
      `SELECT w.*, p.first_name, p.last_name, p.phone, p.email
       FROM waitlist w
       JOIN patients p ON w.patient_id = p.id
       WHERE w.tenant_id = $1
         AND w.status = 'active'
         AND (w.provider_id = $2 OR w.provider_id IS NULL)
         AND (w.preferred_start_date IS NULL OR w.preferred_start_date <= $3)
         AND (w.preferred_end_date IS NULL OR w.preferred_end_date >= $3)
         AND (w.preferred_time_of_day = $4 OR w.preferred_time_of_day = 'any')
       ORDER BY
         CASE w.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
         END,
         w.created_at ASC
       LIMIT 10`,
      [tenantId, providerId, appointmentDate, timeOfDay]
    );

    const eligiblePatients = waitlistResult.rows;
    const notifications: any[] = [];

    // Send notifications to eligible patients
    for (const entry of eligiblePatients) {
      try {
        // Send SMS notification
        if (entry.phone) {
          await sendWaitlistNotification(
            tenantId,
            entry,
            appointment.provider_name,
            appointmentDate,
            appointmentTime,
            'sms'
          );
        }

        // Send email notification (simulated)
        if (entry.email) {
          await sendWaitlistNotification(
            tenantId,
            entry,
            appointment.provider_name,
            appointmentDate,
            appointmentTime,
            'email'
          );
        }

        // Create portal notification
        await sendWaitlistNotification(
          tenantId,
          entry,
          appointment.provider_name,
          appointmentDate,
          appointmentTime,
          'portal'
        );

        // Update waitlist entry status
        await pool.query(
          `UPDATE waitlist
           SET status = 'contacted',
               patient_notified_at = $1,
               notification_method = $2,
               updated_at = $1
           WHERE id = $3 AND tenant_id = $4`,
          [new Date().toISOString(), 'sms,email,portal', entry.id, tenantId]
        );

        notifications.push({
          waitlistId: entry.id,
          patientId: entry.patient_id,
          patientName: `${entry.first_name} ${entry.last_name}`,
          methods: ['sms', 'email', 'portal'],
          success: true,
        });

        // Audit log
        await auditLog(tenantId, userId || 'system', 'waitlist_auto_fill_notification', 'waitlist', entry.id);
      } catch (error: any) {
        logger.error('Failed to notify waitlist patient', { error: error.message, waitlistId: entry.id });
        notifications.push({
          waitlistId: entry.id,
          patientId: entry.patient_id,
          patientName: `${entry.first_name} ${entry.last_name}`,
          error: error.message,
          success: false,
        });
      }
    }

    res.json({
      message: 'Waitlist auto-fill completed',
      appointmentId,
      eligibleCount: eligiblePatients.length,
      notifications,
    });
  } catch (error) {
    next(error);
  }
});

// Manually notify a waitlist patient
router.post('/:id/notify', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { method, appointmentDate, appointmentTime, providerName } = req.body;

    if (!method || !appointmentDate || !appointmentTime || !providerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get waitlist entry with patient details
    const result = await pool.query(
      `SELECT w.*, p.first_name, p.last_name, p.phone, p.email
       FROM waitlist w
       JOIN patients p ON w.patient_id = p.id
       WHERE w.id = $1 AND w.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    const entry = result.rows[0];

    // Use new notification service for SMS
    if (method === 'sms') {
      const twilioService = getTwilioServiceFromEnv();
      const notificationResult = await sendWaitlistNotification(
        {
          waitlistId: id,
          patientId: entry.patient_id,
          patientName: `${entry.first_name} ${entry.last_name}`,
          patientPhone: entry.phone,
          patientEmail: entry.email,
          providerName,
          appointmentDate,
          appointmentTime,
          tenantId,
        },
        twilioService
      );

      if (!notificationResult.success) {
        return res.status(400).json({ error: notificationResult.error });
      }

      // Audit log
      await auditLog(tenantId, userId || 'system', 'waitlist_manual_notification', 'waitlist', id);

      res.json({
        message: 'Patient notified successfully',
        waitlistId: id,
        notificationId: notificationResult.notificationId,
        method,
        notifiedAt: new Date().toISOString(),
      });
    } else {
      // Fallback to old notification method for email/phone/portal
      await sendWaitlistNotification_legacy(
        tenantId,
        entry,
        providerName,
        appointmentDate,
        appointmentTime,
        method
      );

      // Update waitlist entry
      await pool.query(
        `UPDATE waitlist
         SET status = 'contacted',
             patient_notified_at = $1,
             notification_method = $2,
             updated_at = $1
         WHERE id = $3 AND tenant_id = $4`,
        [new Date().toISOString(), method, id, tenantId]
      );

      // Audit log
      await auditLog(tenantId, userId || 'system', 'waitlist_manual_notification', 'waitlist', id);

      res.json({
        message: 'Patient notified successfully',
        waitlistId: id,
        method,
        notifiedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    logger.error('Failed to notify waitlist patient', { error: error.message });
    next(error);
  }
});

// Get notification history for a waitlist entry
router.get('/:id/notifications', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    // Verify waitlist entry exists and belongs to tenant
    const waitlistCheck = await pool.query(
      'SELECT id FROM waitlist WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (waitlistCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    // Get notification history
    const notifications = await getWaitlistNotificationHistory(tenantId, id);

    res.json(notifications);
  } catch (error: any) {
    logger.error('Failed to get notification history', { error: error.message });
    next(error);
  }
});

// Fill waitlist entry by manually scheduling
router.post('/:id/fill', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID is required' });
    }

    // Update waitlist entry to scheduled status
    const result = await pool.query(
      `UPDATE waitlist
       SET status = 'scheduled',
           scheduled_appointment_id = $1,
           resolved_at = $2,
           updated_at = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [appointmentId, new Date().toISOString(), id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    // Audit log
    await auditLog(tenantId, userId || 'system', 'waitlist_manual_fill', 'waitlist', id, {
      appointmentId,
    });

    logger.info('Waitlist entry filled manually', {
      waitlistId: id,
      appointmentId,
      userId,
    });

    res.json({
      message: 'Waitlist entry scheduled successfully',
      waitlist: result.rows[0],
    });
  } catch (error: any) {
    logger.error('Failed to fill waitlist entry', { error: error.message });
    next(error);
  }
});

// Helper function to send notifications (legacy)
async function sendWaitlistNotification_legacy(
  tenantId: string,
  entry: any,
  providerName: string,
  appointmentDate: string,
  appointmentTime: string,
  method: string
): Promise<void> {
  const patientName = `${entry.first_name} ${entry.last_name}`;

  if (method === 'sms' && entry.phone) {
    try {
      const twilioService = getTwilioServiceFromEnv();
      const fromPhone = process.env.TWILIO_PHONE_NUMBER || '';

      const message = `Hi ${entry.first_name}, an appointment slot opened on ${appointmentDate} at ${appointmentTime} with Dr. ${providerName}. Reply YES to book or call us to schedule.`;

      await twilioService.sendSMS({
        to: entry.phone,
        from: fromPhone,
        body: message,
      });

      logger.info('Waitlist SMS sent', {
        tenantId,
        waitlistId: entry.id,
        patientId: entry.patient_id,
        phone: entry.phone,
      });
    } catch (error: any) {
      logger.error('Failed to send waitlist SMS', { error: error.message, waitlistId: entry.id });
      throw error;
    }
  }

  if (method === 'email' && entry.email) {
    // Email notification (simulated for now - integrate with real email service)
    const emailSubject = 'Appointment Slot Available';
    const emailBody = `
Dear ${entry.first_name},

Good news! An appointment slot has opened up that matches your waitlist preferences.

Appointment Details:
- Provider: Dr. ${providerName}
- Date: ${appointmentDate}
- Time: ${appointmentTime}

Please contact our office as soon as possible to confirm this appointment, as it will be offered to other patients if not claimed.

To schedule, please call us or log in to your patient portal.

Thank you,
Your Healthcare Team
    `.trim();

    // Log email (in production, integrate with SendGrid/AWS SES)
    logger.info('Waitlist email notification', {
      tenantId,
      waitlistId: entry.id,
      patientId: entry.patient_id,
      to: entry.email,
      subject: emailSubject,
    });
  }

  if (method === 'portal') {
    // Create portal notification
    const notificationId = randomUUID();
    await pool.query(
      `INSERT INTO patient_notifications (id, tenant_id, patient_id, type, title, message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        notificationId,
        tenantId,
        entry.patient_id,
        'waitlist_appointment_available',
        'Appointment Slot Available',
        `An appointment slot has opened on ${appointmentDate} at ${appointmentTime} with Dr. ${providerName}. Contact us to schedule.`,
        new Date().toISOString(),
      ]
    ).catch((err) => {
      // If table doesn't exist, log it but don't fail
      logger.warn('Could not create portal notification - table may not exist', { error: err.message });
    });

    logger.info('Waitlist portal notification created', {
      tenantId,
      waitlistId: entry.id,
      patientId: entry.patient_id,
      notificationId,
    });
  }
}

// Get holds for a waitlist entry
router.get('/:id/holds', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        wh.*,
        p.full_name as provider_name,
        l.name as location_name,
        at.name as appointment_type_name
       FROM waitlist_holds wh
       LEFT JOIN providers p ON wh.provider_id = p.id
       LEFT JOIN locations l ON wh.location_id = l.id
       LEFT JOIN waitlist w ON wh.waitlist_id = w.id
       LEFT JOIN appointment_types at ON w.appointment_type_id = at.id
       WHERE wh.waitlist_id = $1 AND wh.tenant_id = $2
       ORDER BY wh.created_at DESC`,
      [id, tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Accept a hold and schedule the appointment
router.post('/holds/:holdId/accept', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { holdId } = req.params;

    await client.query('BEGIN');

    // Get hold details
    const holdResult = await client.query(
      `SELECT wh.*, w.patient_id
       FROM waitlist_holds wh
       JOIN waitlist w ON wh.waitlist_id = w.id
       WHERE wh.id = $1 AND wh.tenant_id = $2 AND wh.status = 'active'
       FOR UPDATE`,
      [holdId, tenantId]
    );

    if (holdResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hold not found or no longer active' });
    }

    const hold = holdResult.rows[0];

    // Check if hold has expired
    if (new Date(hold.hold_until) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Hold has expired' });
    }

    // Create the appointment
    const appointmentId = randomUUID();
    await client.query(
      `INSERT INTO appointments (
        id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
        scheduled_start, scheduled_end, status, created_at
      )
      SELECT $1, $2, $3, wh.provider_id, wh.location_id, w.appointment_type_id,
             wh.appointment_slot_start, wh.appointment_slot_end, 'scheduled', NOW()
      FROM waitlist_holds wh
      JOIN waitlist w ON wh.waitlist_id = w.id
      WHERE wh.id = $4`,
      [appointmentId, tenantId, hold.patient_id, holdId]
    );

    // Update hold status
    await client.query(
      `UPDATE waitlist_holds
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1`,
      [holdId]
    );

    // Update waitlist entry
    await client.query(
      `UPDATE waitlist
       SET status = 'scheduled',
           scheduled_appointment_id = $1,
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [appointmentId, hold.waitlist_id]
    );

    // Audit log
    await auditLog(tenantId, userId || 'system', 'waitlist_hold_accepted', 'waitlist_hold', holdId);

    await client.query('COMMIT');

    res.json({
      message: 'Hold accepted and appointment scheduled',
      appointmentId,
      waitlistId: hold.waitlist_id,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to accept hold', { error: error.message });
    next(error);
  } finally {
    client.release();
  }
});

// Reject/cancel a hold
router.post('/holds/:holdId/cancel', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { holdId } = req.params;

    await client.query('BEGIN');

    // Update hold status
    const result = await client.query(
      `UPDATE waitlist_holds
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'active'
       RETURNING waitlist_id`,
      [holdId, tenantId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hold not found or no longer active' });
    }

    const waitlistId = result.rows[0].waitlist_id;

    // Check if there are other active holds for this waitlist entry
    const otherHolds = await client.query(
      `SELECT id FROM waitlist_holds
       WHERE waitlist_id = $1 AND status = 'active' AND hold_until > NOW()`,
      [waitlistId]
    );

    // If no other active holds, return waitlist to active status
    if (otherHolds.rows.length === 0) {
      await client.query(
        `UPDATE waitlist
         SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status = 'matched'`,
        [waitlistId]
      );
    }

    // Audit log
    await auditLog(tenantId, userId || 'system', 'waitlist_hold_cancelled', 'waitlist_hold', holdId);

    await client.query('COMMIT');

    res.json({
      message: 'Hold cancelled',
      waitlistId,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to cancel hold', { error: error.message });
    next(error);
  } finally {
    client.release();
  }
});

// Get all active holds for a tenant
router.get('/holds', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status } = req.query;

    let query = `
      SELECT
        wh.*,
        w.patient_id,
        p.first_name,
        p.last_name,
        p.phone,
        p.email,
        pr.full_name as provider_name,
        l.name as location_name,
        at.name as appointment_type_name
      FROM waitlist_holds wh
      JOIN waitlist w ON wh.waitlist_id = w.id
      JOIN patients p ON w.patient_id = p.id
      LEFT JOIN providers pr ON wh.provider_id = pr.id
      LEFT JOIN locations l ON wh.location_id = l.id
      LEFT JOIN appointment_types at ON w.appointment_type_id = at.id
      WHERE wh.tenant_id = $1
    `;

    const values: any[] = [tenantId];

    if (status) {
      values.push(status);
      query += ` AND wh.status = $${values.length}`;
    } else {
      // Default to active holds
      query += ` AND wh.status = 'active' AND wh.hold_until > NOW()`;
    }

    query += ' ORDER BY wh.hold_until ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Manual trigger for waitlist auto-fill (for testing or manual runs)
router.post('/trigger-auto-fill/:appointmentId', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user?.id;
    const { appointmentId } = req.params;
    const { maxMatches = 5 } = req.body;

    const matches = await waitlistAutoFillService.processAppointmentCancellation(
      tenantId,
      appointmentId,
      maxMatches
    );

    // Audit log
    await auditLog(tenantId, userId || 'system', 'waitlist_auto_fill_manual_trigger', 'appointment', appointmentId);

    res.json({
      message: 'Waitlist auto-fill triggered',
      appointmentId,
      matchesCreated: matches.length,
      matches: matches.map(m => ({
        holdId: m.holdId,
        waitlistId: m.waitlistId,
        score: m.score,
      })),
    });
  } catch (error: any) {
    logger.error('Manual waitlist auto-fill failed', { error: error.message });
    next(error);
  }
});

// Get waitlist auto-fill statistics
router.get('/stats/auto-fill', async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const stats = await waitlistAutoFillService.getStats(tenantId, start, end);

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
