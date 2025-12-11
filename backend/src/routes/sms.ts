/**
 * SMS/Text Messaging Routes
 * Handles SMS settings, sending, receiving (webhooks), and message history
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { createTwilioService, TwilioService } from '../services/twilioService';
import { processIncomingSMS, updateSMSStatus } from '../services/smsProcessor';
import { sendImmediateReminder } from '../services/smsReminderScheduler';
import { formatPhoneE164, validateAndFormatPhone, formatPhoneDisplay } from '../utils/phone';
import { logger } from '../lib/logger';
import crypto from 'crypto';

const router = Router();

// ============================================================================
// ADMIN/PROVIDER ROUTES (require authentication)
// ============================================================================

/**
 * GET /api/sms/settings
 * Get SMS settings for tenant
 */
router.get('/settings', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        tenant_id as "tenantId",
        twilio_phone_number as "twilioPhoneNumber",
        appointment_reminders_enabled as "appointmentRemindersEnabled",
        reminder_hours_before as "reminderHoursBefore",
        allow_patient_replies as "allowPatientReplies",
        reminder_template as "reminderTemplate",
        confirmation_template as "confirmationTemplate",
        cancellation_template as "cancellationTemplate",
        reschedule_template as "rescheduleTemplate",
        is_active as "isActive",
        is_test_mode as "isTestMode",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      const newId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_settings (id, tenant_id, is_active, is_test_mode)
         VALUES ($1, $2, false, true)`,
        [newId, tenantId]
      );

      return res.json({
        id: newId,
        tenantId,
        isActive: false,
        isTestMode: true,
        appointmentRemindersEnabled: true,
        reminderHoursBefore: 24,
        allowPatientReplies: true,
      });
    }

    // Don't send credentials to frontend
    const settings = result.rows[0];
    delete settings.twilioAccountSid;
    delete settings.twilioAuthToken;

    res.json(settings);
  } catch (error: any) {
    logger.error('Error fetching SMS settings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS settings' });
  }
});

/**
 * PUT /api/sms/settings
 * Update SMS settings (admin only)
 */
const updateSettingsSchema = z.object({
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),
  appointmentRemindersEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().min(1).max(168).optional(),
  allowPatientReplies: z.boolean().optional(),
  reminderTemplate: z.string().optional(),
  confirmationTemplate: z.string().optional(),
  cancellationTemplate: z.string().optional(),
  rescheduleTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
  isTestMode: z.boolean().optional(),
});

router.put('/settings', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;

    // Validate phone number if provided
    if (data.twilioPhoneNumber) {
      const formatted = formatPhoneE164(data.twilioPhoneNumber);
      if (!formatted) {
        return res.status(400).json({ error: 'Invalid Twilio phone number format' });
      }
      data.twilioPhoneNumber = formatted;
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convert camelCase to snake_case
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${snakeKey} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(tenantId);

    const query = `
      UPDATE sms_settings
      SET ${updates.join(', ')}
      WHERE tenant_id = $${paramIndex}
      RETURNING id
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    await auditLog(tenantId, userId, 'sms_settings_update', 'sms_settings', result.rows[0].id);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error updating SMS settings', { error: error.message });
    res.status(500).json({ error: 'Failed to update SMS settings' });
  }
});

/**
 * POST /api/sms/test-connection
 * Test Twilio connection
 */
router.post('/test-connection', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0 || !result.rows[0].twilio_account_sid) {
      return res.status(400).json({ error: 'Twilio credentials not configured' });
    }

    const settings = result.rows[0];
    const twilioService = createTwilioService(
      settings.twilio_account_sid,
      settings.twilio_auth_token
    );

    const testResult = await twilioService.testConnection();

    res.json(testResult);
  } catch (error: any) {
    logger.error('Error testing Twilio connection', { error: error.message });
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

/**
 * POST /api/sms/send
 * Send SMS manually (staff use)
 */
const sendSMSSchema = z.object({
  patientId: z.string().uuid(),
  messageBody: z.string().min(1).max(1600),
  messageType: z.enum(['notification', 'conversation', 'confirmation', 'reminder']).optional(),
});

router.post('/send', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = sendSMSSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, messageBody, messageType } = parsed.data;

    // Get patient phone number
    const patientResult = await pool.query(
      `SELECT phone, first_name, last_name FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];
    if (!patient.phone) {
      return res.status(400).json({ error: 'Patient has no phone number' });
    }

    // Check if patient opted out
    const prefsResult = await pool.query(
      `SELECT opted_in FROM patient_sms_preferences WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (prefsResult.rows.length > 0 && !prefsResult.rows[0].opted_in) {
      return res.status(400).json({ error: 'Patient has opted out of SMS' });
    }

    // Get SMS settings
    const settingsResult = await pool.query(
      `SELECT twilio_account_sid, twilio_auth_token, twilio_phone_number, is_active
       FROM sms_settings
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_active) {
      return res.status(400).json({ error: 'SMS not configured or not active' });
    }

    const settings = settingsResult.rows[0];
    const twilioService = createTwilioService(
      settings.twilio_account_sid,
      settings.twilio_auth_token
    );

    // Send SMS
    const result = await twilioService.sendSMS({
      to: patient.phone,
      from: settings.twilio_phone_number,
      body: messageBody,
    });

    // Log message
    const messageId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sms_messages
       (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
        patient_id, message_body, status, message_type, sent_at, segment_count)
       VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)`,
      [
        messageId,
        tenantId,
        result.sid,
        settings.twilio_phone_number,
        formatPhoneE164(patient.phone),
        patientId,
        messageBody,
        result.status,
        messageType || 'conversation',
        result.numSegments,
      ]
    );

    await auditLog(tenantId, userId, 'sms_send', 'sms_message', messageId);

    res.json({
      success: true,
      messageId,
      twilioSid: result.sid,
      status: result.status,
    });
  } catch (error: any) {
    logger.error('Error sending SMS', { error: error.message });
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

/**
 * GET /api/sms/messages
 * List SMS messages with filters
 */
router.get('/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const patientId = req.query.patientId as string | undefined;
    const direction = req.query.direction as string | undefined;
    const messageType = req.query.messageType as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        m.id,
        m.twilio_message_sid as "twilioSid",
        m.direction,
        m.from_number as "fromNumber",
        m.to_number as "toNumber",
        m.patient_id as "patientId",
        m.message_body as "messageBody",
        m.status,
        m.message_type as "messageType",
        m.segment_count as "segmentCount",
        m.keyword_matched as "keywordMatched",
        m.sent_at as "sentAt",
        m.delivered_at as "deliveredAt",
        m.failed_at as "failedAt",
        m.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName"
      FROM sms_messages m
      LEFT JOIN patients p ON m.patient_id = p.id
      WHERE m.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND m.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (direction) {
      query += ` AND m.direction = $${paramIndex}`;
      params.push(direction);
      paramIndex++;
    }

    if (messageType) {
      query += ` AND m.message_type = $${paramIndex}`;
      params.push(messageType);
      paramIndex++;
    }

    if (status) {
      query += ` AND m.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM sms_messages m WHERE m.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countParamIndex = 2;

    if (patientId) {
      countQuery += ` AND m.patient_id = $${countParamIndex}`;
      countParams.push(patientId);
      countParamIndex++;
    }
    if (direction) {
      countQuery += ` AND m.direction = $${countParamIndex}`;
      countParams.push(direction);
      countParamIndex++;
    }
    if (messageType) {
      countQuery += ` AND m.message_type = $${countParamIndex}`;
      countParams.push(messageType);
      countParamIndex++;
    }
    if (status) {
      countQuery += ` AND m.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      messages: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching SMS messages', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * GET /api/sms/messages/patient/:patientId
 * Get SMS history for specific patient
 */
router.get('/messages/patient/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    const result = await pool.query(
      `SELECT
        m.id,
        m.direction,
        m.from_number as "fromNumber",
        m.to_number as "toNumber",
        m.message_body as "messageBody",
        m.status,
        m.message_type as "messageType",
        m.segment_count as "segmentCount",
        m.sent_at as "sentAt",
        m.delivered_at as "deliveredAt",
        m.created_at as "createdAt"
       FROM sms_messages m
       WHERE m.tenant_id = $1 AND m.patient_id = $2
       ORDER BY m.created_at DESC`,
      [tenantId, patientId]
    );

    res.json({ messages: result.rows });
  } catch (error: any) {
    logger.error('Error fetching patient SMS history', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

/**
 * GET /api/sms/auto-responses
 * List auto-response keywords
 */
router.get('/auto-responses', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        keyword,
        response_text as "responseText",
        action,
        is_active as "isActive",
        is_system_keyword as "isSystemKeyword",
        priority,
        created_at as "createdAt"
       FROM sms_auto_responses
       WHERE tenant_id = $1
       ORDER BY priority DESC, keyword`,
      [tenantId]
    );

    res.json({ autoResponses: result.rows });
  } catch (error: any) {
    logger.error('Error fetching auto-responses', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch auto-responses' });
  }
});

/**
 * PUT /api/sms/auto-responses/:id
 * Update auto-response
 */
const updateAutoResponseSchema = z.object({
  responseText: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.put('/auto-responses/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const autoResponseId = req.params.id;

    const parsed = updateAutoResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    // Check if it's a system keyword (cannot modify)
    const checkResult = await pool.query(
      `SELECT is_system_keyword FROM sms_auto_responses WHERE id = $1 AND tenant_id = $2`,
      [autoResponseId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auto-response not found' });
    }

    if (checkResult.rows[0].is_system_keyword && parsed.data.responseText) {
      return res.status(400).json({
        error: 'Cannot modify response text of system keywords (STOP, START, HELP)',
      });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (parsed.data.responseText !== undefined) {
      updates.push(`response_text = $${paramIndex}`);
      params.push(parsed.data.responseText);
      paramIndex++;
    }

    if (parsed.data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(parsed.data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(autoResponseId, tenantId);

    await pool.query(
      `UPDATE sms_auto_responses SET ${updates.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      params
    );

    await auditLog(tenantId, userId, 'sms_auto_response_update', 'sms_auto_response', autoResponseId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error updating auto-response', { error: error.message });
    res.status(500).json({ error: 'Failed to update auto-response' });
  }
});

/**
 * GET /api/sms/patient-preferences/:patientId
 * Get patient SMS preferences
 */
router.get('/patient-preferences/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const patientId = req.params.patientId;

    const result = await pool.query(
      `SELECT
        id,
        opted_in as "optedIn",
        appointment_reminders as "appointmentReminders",
        marketing_messages as "marketingMessages",
        transactional_messages as "transactionalMessages",
        opted_out_at as "optedOutAt",
        opted_out_reason as "optedOutReason",
        consent_date as "consentDate",
        consent_method as "consentMethod"
       FROM patient_sms_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        optedIn: true,
        appointmentReminders: true,
        marketingMessages: false,
        transactionalMessages: true,
      });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Error fetching patient SMS preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/sms/patient-preferences/:patientId
 * Update patient SMS preferences
 */
const updatePreferencesSchema = z.object({
  optedIn: z.boolean().optional(),
  appointmentReminders: z.boolean().optional(),
  marketingMessages: z.boolean().optional(),
});

router.put('/patient-preferences/:patientId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const patientId = req.params.patientId;

    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const data = parsed.data;

    // Check if preferences exist
    const existingResult = await pool.query(
      `SELECT id FROM patient_sms_preferences WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (existingResult.rows.length === 0) {
      // Create new preferences
      await pool.query(
        `INSERT INTO patient_sms_preferences
         (tenant_id, patient_id, opted_in, appointment_reminders, marketing_messages)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          patientId,
          data.optedIn ?? true,
          data.appointmentReminders ?? true,
          data.marketingMessages ?? false,
        ]
      );
    } else {
      // Update existing preferences
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.optedIn !== undefined) {
        updates.push(`opted_in = $${paramIndex}`);
        params.push(data.optedIn);
        paramIndex++;

        if (!data.optedIn) {
          updates.push(`opted_out_at = CURRENT_TIMESTAMP, opted_out_via = 'staff'`);
        } else {
          updates.push(`opted_out_at = NULL`);
        }
      }

      if (data.appointmentReminders !== undefined) {
        updates.push(`appointment_reminders = $${paramIndex}`);
        params.push(data.appointmentReminders);
        paramIndex++;
      }

      if (data.marketingMessages !== undefined) {
        updates.push(`marketing_messages = $${paramIndex}`);
        params.push(data.marketingMessages);
        paramIndex++;
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(tenantId, patientId);

        await pool.query(
          `UPDATE patient_sms_preferences SET ${updates.join(', ')} WHERE tenant_id = $${paramIndex} AND patient_id = $${paramIndex + 1}`,
          params
        );
      }
    }

    await auditLog(tenantId, userId, 'patient_sms_preferences_update', 'patient_sms_preferences', patientId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error updating patient SMS preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/sms/send-reminder/:appointmentId
 * Send immediate reminder for appointment
 */
router.post('/send-reminder/:appointmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const appointmentId = req.params.appointmentId;

    const result = await sendImmediateReminder(tenantId, appointmentId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    await auditLog(tenantId, userId, 'sms_reminder_send', 'appointment', appointmentId);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error sending reminder', { error: error.message });
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// ============================================================================
// TWILIO WEBHOOK ROUTES (NO AUTHENTICATION - validated by signature)
// ============================================================================

/**
 * POST /api/sms/webhook/incoming
 * Twilio webhook for incoming SMS messages
 */
router.post('/webhook/incoming', async (req: Request, res: Response) => {
  try {
    // Extract Twilio signature for validation
    const signature = req.headers['x-twilio-signature'] as string;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Get tenant from Twilio phone number (To field)
    const toNumber = formatPhoneE164(req.body.To);

    const tenantResult = await pool.query(
      `SELECT tenant_id, twilio_account_sid, twilio_auth_token
       FROM sms_settings
       WHERE twilio_phone_number = $1 AND is_active = true`,
      [toNumber]
    );

    if (tenantResult.rows.length === 0) {
      logger.warn('Incoming SMS to unknown number', { toNumber });
      return res.status(404).send('Number not configured');
    }

    const tenant = tenantResult.rows[0];

    // Validate webhook signature
    const twilioService = createTwilioService(
      tenant.twilio_account_sid,
      tenant.twilio_auth_token
    );

    const isValid = twilioService.validateWebhookSignature(signature, url, req.body);

    if (!isValid) {
      logger.error('Invalid Twilio webhook signature', { url });
      return res.status(403).send('Invalid signature');
    }

    // Process incoming SMS
    const result = await processIncomingSMS(
      {
        messageSid: req.body.MessageSid,
        from: req.body.From,
        to: req.body.To,
        body: req.body.Body,
        numMedia: parseInt(req.body.NumMedia || '0'),
        mediaUrls: [], // TODO: Handle MMS media URLs
        tenantId: tenant.tenant_id,
      },
      twilioService
    );

    logger.info('Incoming SMS processed', {
      messageId: result.messageId,
      autoResponseSent: result.autoResponseSent,
    });

    // Respond to Twilio with TwiML (empty response)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: any) {
    logger.error('Error processing incoming SMS webhook', {
      error: error.message,
      body: req.body,
    });
    res.status(500).send('Error processing message');
  }
});

/**
 * POST /api/sms/webhook/status
 * Twilio webhook for message delivery status updates
 */
router.post('/webhook/status', async (req: Request, res: Response) => {
  try {
    const messageSid = req.body.MessageSid;
    const messageStatus = req.body.MessageStatus;
    const errorCode = req.body.ErrorCode;
    const errorMessage = req.body.ErrorMessage;

    logger.info('SMS status webhook', {
      messageSid,
      status: messageStatus,
      errorCode,
    });

    // Update message status in database
    await updateSMSStatus(messageSid, messageStatus, errorCode, errorMessage);

    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Error processing status webhook', {
      error: error.message,
      body: req.body,
    });
    res.status(500).send('Error processing status');
  }
});

export const smsRouter = router;
