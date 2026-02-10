/**
 * Appointment Reminders Routes
 * API endpoints for managing appointment reminder system
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import {
  scheduleReminders,
  processReminderQueue,
  handleConfirmation,
  cancelReminders,
  getReminderStats,
  getReminderQueue,
  updatePatientPreferences,
  getPatientPreferences,
  scheduleNoShowFollowup,
} from '../services/appointmentReminderService';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// REMINDER QUEUE ROUTES
// ============================================================================

/**
 * GET /api/reminders/queue
 * Get the reminder queue with optional filters
 */
router.get('/queue', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;
    const reminderType = req.query.reminderType as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getReminderQueue(tenantId, {
      status,
      reminderType,
      limit,
      offset,
    });

    res.json({
      reminders: result.reminders,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching reminder queue', { error: message });
    res.status(500).json({ error: 'Failed to fetch reminder queue' });
  }
});

/**
 * GET /api/reminders/queue/:id
 * Get a specific reminder by ID
 */
router.get('/queue/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const reminderId = req.params.id;

    const result = await pool.query(
      `SELECT
        rq.*,
        p.first_name || ' ' || p.last_name as "patientName",
        p.phone as "patientPhone",
        p.email as "patientEmail",
        a.start_time as "appointmentTime",
        u.name as "providerName"
      FROM reminder_queue rq
      JOIN patients p ON rq.patient_id = p.id
      JOIN appointments a ON rq.appointment_id = a.id
      JOIN users u ON a.provider_id = u.id
      WHERE rq.id = $1 AND rq.tenant_id = $2`,
      [reminderId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ reminder: result.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching reminder', { error: message });
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

/**
 * DELETE /api/reminders/queue/:id
 * Cancel a pending reminder
 */
router.delete('/queue/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const reminderId = req.params.id;

    const result = await pool.query(
      `UPDATE reminder_queue
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING id`,
      [reminderId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found or already processed' });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_cancel', 'reminder_queue', reminderId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error cancelling reminder', { error: message });
    res.status(500).json({ error: 'Failed to cancel reminder' });
  }
});

// ============================================================================
// APPOINTMENT REMINDER SCHEDULING
// ============================================================================

/**
 * POST /api/reminders/appointment/:id/schedule
 * Schedule reminders for a specific appointment
 */
router.post('/appointment/:id/schedule', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.id;

    const result = await scheduleReminders(tenantId, appointmentId ?? '');

    if (result.errors.length > 0 && result.scheduled === 0) {
      return res.status(400).json({
        error: 'Failed to schedule reminders',
        details: result.errors,
      });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_schedule', 'appointment', appointmentId ?? '');

    res.json({
      success: true,
      scheduled: result.scheduled,
      errors: result.errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error scheduling reminders', { error: message });
    res.status(500).json({ error: 'Failed to schedule reminders' });
  }
});

/**
 * DELETE /api/reminders/appointment/:id
 * Cancel all reminders for an appointment
 */
router.delete('/appointment/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.id;

    const result = await cancelReminders(tenantId, appointmentId ?? '');

    await auditLog(tenantId, userId ?? '', 'reminder_cancel_all', 'appointment', appointmentId ?? '');

    res.json({
      success: true,
      cancelled: result.cancelled,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error cancelling reminders', { error: message });
    res.status(500).json({ error: 'Failed to cancel reminders' });
  }
});

/**
 * POST /api/reminders/appointment/:id/no-show-followup
 * Schedule no-show follow-up for an appointment
 */
router.post('/appointment/:id/no-show-followup', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.id;

    const result = await scheduleNoShowFollowup(tenantId, appointmentId ?? '');

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_noshow_schedule', 'appointment', appointmentId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error scheduling no-show follow-up', { error: message });
    res.status(500).json({ error: 'Failed to schedule follow-up' });
  }
});

// ============================================================================
// PATIENT PREFERENCES
// ============================================================================

/**
 * GET /api/reminders/patient/:id/preferences
 * Get patient's reminder preferences
 */
router.get('/patient/:id/preferences', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.id;

    const preferences = await getPatientPreferences(tenantId, patientId ?? '');

    if (!preferences) {
      // Return defaults
      return res.json({
        preferredChannel: 'both',
        quietHoursStart: null,
        quietHoursEnd: null,
        optedOut: false,
        preferredLanguage: 'en',
        advanceNoticeHours: 24,
        receiveNoShowFollowup: true,
      });
    }

    res.json(preferences);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching patient preferences', { error: message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/reminders/patient/:id/preferences
 * Update patient's reminder preferences
 */
const updatePreferencesSchema = z.object({
  preferredChannel: z.enum(['sms', 'email', 'both', 'none']).optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  optedOut: z.boolean().optional(),
  optedOutReason: z.string().optional(),
  preferredLanguage: z.string().optional(),
  advanceNoticeHours: z.number().min(1).max(168).optional(),
  receiveNoShowFollowup: z.boolean().optional(),
});

router.put('/patient/:id/preferences', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.id;

    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const result = await updatePatientPreferences(tenantId, patientId ?? '', parsed.data);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, userId ?? '', 'patient_reminder_prefs_update', 'patient', patientId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating patient preferences', { error: message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================================================
// WEBHOOK RESPONSE HANDLING
// ============================================================================

/**
 * POST /api/reminders/webhook/response
 * Handle patient responses from SMS/email
 */
const webhookResponseSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional(),
  response: z.string(),
  channel: z.enum(['sms', 'email', 'phone', 'portal']).optional(),
});

router.post('/webhook/response', async (req, res: Response) => {
  try {
    const parsed = webhookResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { appointmentId, patientPhone, patientEmail, response, channel } = parsed.data;

    // Parse response to determine type
    const normalizedResponse = response.toLowerCase().trim();
    let responseType: 'confirmed' | 'cancelled' | 'rescheduled' | 'unknown' = 'unknown';

    if (['y', 'yes', 'confirm', 'confirmed', '1'].includes(normalizedResponse)) {
      responseType = 'confirmed';
    } else if (['n', 'no', 'cancel', 'cancelled', '2'].includes(normalizedResponse)) {
      responseType = 'cancelled';
    } else if (['r', 'reschedule', 'change', '3'].includes(normalizedResponse)) {
      responseType = 'rescheduled';
    }

    // Find appointment if not provided
    let apptId = appointmentId;
    let tenantId: string | undefined;

    if (!apptId && (patientPhone || patientEmail)) {
      // Find most recent reminder for this patient
      const lookupQuery = patientPhone
        ? `SELECT rq.appointment_id, rq.tenant_id
           FROM reminder_queue rq
           JOIN patients p ON rq.patient_id = p.id
           WHERE p.phone = $1 AND rq.status = 'sent'
           ORDER BY rq.sent_at DESC LIMIT 1`
        : `SELECT rq.appointment_id, rq.tenant_id
           FROM reminder_queue rq
           JOIN patients p ON rq.patient_id = p.id
           WHERE p.email = $1 AND rq.status = 'sent'
           ORDER BY rq.sent_at DESC LIMIT 1`;

      const lookupResult = await pool.query(lookupQuery, [patientPhone || patientEmail]);

      if (lookupResult.rows.length > 0) {
        apptId = lookupResult.rows[0].appointment_id;
        tenantId = lookupResult.rows[0].tenant_id;
      }
    }

    if (!apptId || !tenantId) {
      // Get tenant from appointment
      if (apptId) {
        const tenantResult = await pool.query(
          'SELECT tenant_id FROM appointments WHERE id = $1',
          [apptId]
        );
        tenantId = tenantResult.rows[0]?.tenant_id;
      }
    }

    if (!apptId || !tenantId) {
      return res.status(404).json({ error: 'Could not identify appointment' });
    }

    if (responseType === 'unknown') {
      return res.status(400).json({ error: 'Could not interpret response' });
    }

    const result = await handleConfirmation(
      tenantId,
      apptId,
      responseType,
      response,
      channel || 'sms'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      responseType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing webhook response', { error: message });
    res.status(500).json({ error: 'Failed to process response' });
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * GET /api/reminders/stats
 * Get reminder effectiveness statistics
 */
router.get('/stats', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const stats = await getReminderStats(tenantId, { startDate, endDate });

    res.json({
      stats,
      dateRange: { startDate, endDate },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching reminder stats', { error: message });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/reminders/stats/daily
 * Get daily reminder statistics for trending
 */
router.get('/stats/daily', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const days = parseInt(req.query.days as string) || 30;

    const result = await pool.query(
      `SELECT
        DATE(rq.created_at) as date,
        COUNT(*) as "totalScheduled",
        COUNT(*) FILTER (WHERE rq.status = 'sent') as "totalSent",
        COUNT(*) FILTER (WHERE rq.delivery_status = 'delivered') as "totalDelivered",
        COUNT(*) FILTER (WHERE rq.status = 'failed') as "totalFailed"
      FROM reminder_queue rq
      WHERE rq.tenant_id = $1
        AND rq.created_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY DATE(rq.created_at)
      ORDER BY date DESC`,
      [tenantId, days]
    );

    const responseResult = await pool.query(
      `SELECT
        DATE(rr.created_at) as date,
        COUNT(*) FILTER (WHERE rr.response_type = 'confirmed') as "totalConfirmed",
        COUNT(*) FILTER (WHERE rr.response_type = 'cancelled') as "totalCancelled"
      FROM reminder_responses rr
      WHERE rr.tenant_id = $1
        AND rr.created_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY DATE(rr.created_at)
      ORDER BY date DESC`,
      [tenantId, days]
    );

    // Merge results
    const responseMap = new Map(
      responseResult.rows.map(r => [r.date, r])
    );

    const dailyStats = result.rows.map(day => ({
      ...day,
      totalConfirmed: responseMap.get(day.date)?.totalConfirmed || 0,
      totalCancelled: responseMap.get(day.date)?.totalCancelled || 0,
    }));

    res.json({ dailyStats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching daily stats', { error: message });
    res.status(500).json({ error: 'Failed to fetch daily statistics' });
  }
});

// ============================================================================
// REMINDER SCHEDULES (Admin)
// ============================================================================

/**
 * GET /api/reminders/schedules
 * Get all reminder schedules for the tenant
 */
router.get('/schedules', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        rs.id,
        rs.tenant_id as "tenantId",
        rs.appointment_type_id as "appointmentTypeId",
        at.name as "appointmentTypeName",
        rs.reminder_type as "reminderType",
        rs.hours_before as "hoursBefore",
        rs.template_id as "templateId",
        rt.name as "templateName",
        rs.is_active as "isActive",
        rs.include_confirmation_request as "includeConfirmationRequest",
        rs.priority,
        rs.created_at as "createdAt"
      FROM reminder_schedules rs
      LEFT JOIN appointment_types at ON rs.appointment_type_id = at.id
      LEFT JOIN reminder_templates rt ON rs.template_id = rt.id
      WHERE rs.tenant_id = $1
      ORDER BY rs.priority, rs.hours_before DESC`,
      [tenantId]
    );

    res.json({ schedules: result.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching schedules', { error: message });
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * POST /api/reminders/schedules
 * Create a new reminder schedule
 */
const createScheduleSchema = z.object({
  appointmentTypeId: z.string().uuid().nullable().optional(),
  reminderType: z.enum(['sms', 'email', 'both']),
  hoursBefore: z.number().min(1).max(168),
  templateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  includeConfirmationRequest: z.boolean().optional(),
  priority: z.number().optional(),
});

router.post('/schedules', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;
    const scheduleId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO reminder_schedules
       (id, tenant_id, appointment_type_id, reminder_type, hours_before,
        template_id, is_active, include_confirmation_request, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        scheduleId,
        tenantId,
        data.appointmentTypeId || null,
        data.reminderType,
        data.hoursBefore,
        data.templateId || null,
        data.isActive !== false,
        data.includeConfirmationRequest || false,
        data.priority || 0,
      ]
    );

    await auditLog(tenantId, userId, 'reminder_schedule_create', 'reminder_schedule', scheduleId);

    res.json({ success: true, scheduleId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating schedule', { error: message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * PUT /api/reminders/schedules/:id
 * Update a reminder schedule
 */
const updateScheduleSchema = z.object({
  appointmentTypeId: z.string().uuid().nullable().optional(),
  reminderType: z.enum(['sms', 'email', 'both']).optional(),
  hoursBefore: z.number().min(1).max(168).optional(),
  templateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  includeConfirmationRequest: z.boolean().optional(),
  priority: z.number().optional(),
});

router.put('/schedules/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const scheduleId = req.params.id;

    const parsed = updateScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;
    const updates: string[] = [];
    const params: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (data.appointmentTypeId !== undefined) {
      updates.push(`appointment_type_id = $${paramIndex}`);
      params.push(data.appointmentTypeId);
      paramIndex++;
    }

    if (data.reminderType !== undefined) {
      updates.push(`reminder_type = $${paramIndex}`);
      params.push(data.reminderType);
      paramIndex++;
    }

    if (data.hoursBefore !== undefined) {
      updates.push(`hours_before = $${paramIndex}`);
      params.push(data.hoursBefore);
      paramIndex++;
    }

    if (data.templateId !== undefined) {
      updates.push(`template_id = $${paramIndex}`);
      params.push(data.templateId);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(data.isActive);
      paramIndex++;
    }

    if (data.includeConfirmationRequest !== undefined) {
      updates.push(`include_confirmation_request = $${paramIndex}`);
      params.push(data.includeConfirmationRequest);
      paramIndex++;
    }

    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(data.priority);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(scheduleId ?? '', tenantId);

    const result = await pool.query(
      `UPDATE reminder_schedules SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_schedule_update', 'reminder_schedule', scheduleId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating schedule', { error: message });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * DELETE /api/reminders/schedules/:id
 * Delete a reminder schedule
 */
router.delete('/schedules/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const scheduleId = req.params.id;

    const result = await pool.query(
      `DELETE FROM reminder_schedules WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [scheduleId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_schedule_delete', 'reminder_schedule', scheduleId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting schedule', { error: message });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ============================================================================
// REMINDER TEMPLATES
// ============================================================================

/**
 * GET /api/reminders/templates
 * Get all reminder templates
 */
router.get('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const templateType = req.query.templateType as string | undefined;
    const channel = req.query.channel as string | undefined;

    let query = `
      SELECT
        id,
        tenant_id as "tenantId",
        name,
        description,
        template_type as "templateType",
        channel,
        subject,
        body,
        is_active as "isActive",
        is_default as "isDefault",
        variables,
        created_at as "createdAt"
      FROM reminder_templates
      WHERE tenant_id = $1
    `;

    const params: string[] = [tenantId];
    let paramIndex = 2;

    if (templateType) {
      query += ` AND template_type = $${paramIndex}`;
      params.push(templateType);
      paramIndex++;
    }

    if (channel) {
      query += ` AND channel = $${paramIndex}`;
      params.push(channel);
    }

    query += ` ORDER BY template_type, channel, is_default DESC`;

    const result = await pool.query(query, params);

    res.json({ templates: result.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching templates', { error: message });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/reminders/templates
 * Create a new reminder template
 */
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateType: z.enum(['48_hour', '24_hour', '2_hour', 'confirmation', 'no_show_followup', 'custom']),
  channel: z.enum(['sms', 'email']),
  subject: z.string().optional(),
  body: z.string().min(1),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  variables: z.array(z.string()).optional(),
});

router.post('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;
    const templateId = crypto.randomUUID();

    // If setting as default, unset other defaults of same type/channel
    if (data.isDefault) {
      await pool.query(
        `UPDATE reminder_templates SET is_default = false
         WHERE tenant_id = $1 AND template_type = $2 AND channel = $3`,
        [tenantId, data.templateType, data.channel]
      );
    }

    await pool.query(
      `INSERT INTO reminder_templates
       (id, tenant_id, name, description, template_type, channel, subject, body,
        is_active, is_default, variables, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        templateId,
        tenantId,
        data.name,
        data.description || null,
        data.templateType,
        data.channel,
        data.subject || null,
        data.body,
        data.isActive !== false,
        data.isDefault || false,
        JSON.stringify(data.variables || []),
        userId,
      ]
    );

    await auditLog(tenantId, userId, 'reminder_template_create', 'reminder_template', templateId);

    res.json({ success: true, templateId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating template', { error: message });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PUT /api/reminders/templates/:id
 * Update a reminder template
 */
const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  variables: z.array(z.string()).optional(),
});

router.put('/templates/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const templateId = req.params.id;

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;
    const updates: string[] = [];
    const params: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }

    if (data.subject !== undefined) {
      updates.push(`subject = $${paramIndex}`);
      params.push(data.subject);
      paramIndex++;
    }

    if (data.body !== undefined) {
      updates.push(`body = $${paramIndex}`);
      params.push(data.body);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(data.isActive);
      paramIndex++;
    }

    if (data.isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex}`);
      params.push(data.isDefault);
      paramIndex++;

      // If setting as default, unset other defaults
      if (data.isDefault) {
        const templateResult = await pool.query(
          'SELECT template_type, channel FROM reminder_templates WHERE id = $1',
          [templateId]
        );
        if (templateResult.rows[0]) {
          await pool.query(
            `UPDATE reminder_templates SET is_default = false
             WHERE tenant_id = $1 AND template_type = $2 AND channel = $3 AND id != $4`,
            [tenantId, templateResult.rows[0].template_type, templateResult.rows[0].channel, templateId]
          );
        }
      }
    }

    if (data.variables !== undefined) {
      updates.push(`variables = $${paramIndex}`);
      params.push(JSON.stringify(data.variables));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(templateId ?? '', tenantId);

    const result = await pool.query(
      `UPDATE reminder_templates SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_template_update', 'reminder_template', templateId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating template', { error: message });
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/reminders/templates/:id
 * Delete a reminder template
 */
router.delete('/templates/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const templateId = req.params.id;

    const result = await pool.query(
      `DELETE FROM reminder_templates WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [templateId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await auditLog(tenantId, userId ?? '', 'reminder_template_delete', 'reminder_template', templateId ?? '');

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting template', { error: message });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * POST /api/reminders/process-queue
 * Manually trigger queue processing (admin only)
 */
router.post('/process-queue', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await processReminderQueue();

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing queue', { error: message });
    res.status(500).json({ error: 'Failed to process queue' });
  }
});

export const remindersRouter = router;
