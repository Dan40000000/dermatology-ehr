/**
 * Appointment Reminder Service
 * Handles scheduling, sending, and managing automated appointment reminders
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ReminderSchedule {
  id: string;
  tenantId: string;
  appointmentTypeId: string | null;
  reminderType: 'sms' | 'email' | 'both';
  hoursBefore: number;
  templateId: string | null;
  isActive: boolean;
  includeConfirmationRequest: boolean;
  priority: number;
}

export interface QueuedReminder {
  id: string;
  tenantId: string;
  appointmentId: string;
  patientId: string;
  scheduleId: string | null;
  reminderType: 'sms' | 'email';
  reminderCategory: '48_hour' | '24_hour' | '2_hour' | 'confirmation' | 'no_show_followup' | 'custom';
  scheduledFor: Date;
  sentAt: Date | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
  deliveryStatus: string | null;
  messageContent: string | null;
  externalMessageId: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
}

export interface ReminderResponse {
  id: string;
  tenantId: string;
  reminderId: string;
  appointmentId: string;
  patientId: string;
  responseType: 'confirmed' | 'cancelled' | 'rescheduled' | 'unknown';
  responseChannel: 'sms' | 'email' | 'phone' | 'portal';
  responseAt: Date;
  rawResponse: string | null;
  processed: boolean;
}

export interface PatientReminderPreferences {
  id: string;
  tenantId: string;
  patientId: string;
  preferredChannel: 'sms' | 'email' | 'both' | 'none';
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  optedOut: boolean;
  preferredLanguage: string;
  advanceNoticeHours: number;
  receiveNoShowFollowup: boolean;
}

export interface AppointmentDetails {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  providerId: string;
  providerName: string;
  appointmentTypeId: string | null;
  appointmentTypeName: string | null;
  startTime: Date;
  endTime: Date;
  locationId: string | null;
  locationName: string | null;
  locationAddress: string | null;
  tenantId: string;
  clinicName: string;
  clinicPhone: string | null;
}

export interface ReminderStats {
  totalScheduled: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalConfirmed: number;
  totalCancelled: number;
  totalNoShows: number;
  confirmationRate: number;
  deliveryRate: number;
  noShowReductionRate: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ============================================================================
// TEMPLATE PROCESSING
// ============================================================================

/**
 * Replace template variables with actual values
 */
function processTemplate(
  template: string,
  appointment: AppointmentDetails
): string {
  const appointmentDate = new Date(appointment.startTime);
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const replacements: Record<string, string> = {
    '{patient_name}': appointment.patientName || 'Patient',
    '{appointment_date}': formattedDate,
    '{appointment_time}': formattedTime,
    '{provider_name}': appointment.providerName || 'your provider',
    '{location}': appointment.locationName || 'our clinic',
    '{location_address}': appointment.locationAddress || '',
    '{clinic_name}': appointment.clinicName || 'our clinic',
    '{clinic_phone}': appointment.clinicPhone || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }

  return result;
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Schedule reminders for an appointment based on configured schedules
 */
export async function scheduleReminders(
  tenantId: string,
  appointmentId: string
): Promise<{ scheduled: number; errors: string[] }> {
  const errors: string[] = [];
  let scheduled = 0;

  try {
    // Get appointment details
    const appointmentResult = await pool.query(
      `SELECT
        a.id as "appointmentId",
        a.patient_id as "patientId",
        p.first_name || ' ' || p.last_name as "patientName",
        p.email as "patientEmail",
        p.phone as "patientPhone",
        a.provider_id as "providerId",
        u.name as "providerName",
        a.type_id as "appointmentTypeId",
        at.name as "appointmentTypeName",
        a.start_time as "startTime",
        a.end_time as "endTime",
        a.location_id as "locationId",
        l.name as "locationName",
        l.address as "locationAddress",
        a.tenant_id as "tenantId",
        t.name as "clinicName",
        l.phone as "clinicPhone"
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.provider_id = u.id
      LEFT JOIN appointment_types at ON a.type_id = at.id
      LEFT JOIN locations l ON a.location_id = l.id
      JOIN tenants t ON a.tenant_id = t.id
      WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (appointmentResult.rows.length === 0) {
      errors.push('Appointment not found');
      return { scheduled, errors };
    }

    const appointment: AppointmentDetails = appointmentResult.rows[0];

    // Check patient preferences
    const prefsResult = await pool.query(
      `SELECT * FROM patient_reminder_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, appointment.patientId]
    );

    const prefs: PatientReminderPreferences | null = prefsResult.rows[0] || null;

    // If patient has opted out, skip
    if (prefs?.optedOut) {
      logger.info('Patient opted out of reminders', {
        patientId: appointment.patientId,
        appointmentId,
      });
      return { scheduled: 0, errors: [] };
    }

    // Get reminder schedules for this tenant
    const schedulesResult = await pool.query(
      `SELECT
        id,
        tenant_id as "tenantId",
        appointment_type_id as "appointmentTypeId",
        reminder_type as "reminderType",
        hours_before as "hoursBefore",
        template_id as "templateId",
        is_active as "isActive",
        include_confirmation_request as "includeConfirmationRequest",
        priority
      FROM reminder_schedules
      WHERE tenant_id = $1
        AND is_active = true
        AND (appointment_type_id IS NULL OR appointment_type_id = $2)
      ORDER BY priority`,
      [tenantId, appointment.appointmentTypeId]
    );

    const schedules: ReminderSchedule[] = schedulesResult.rows;

    for (const schedule of schedules) {
      try {
        // Determine channels to use
        const channels: ('sms' | 'email')[] = [];
        const preferredChannel = prefs?.preferredChannel || 'both';

        if (schedule.reminderType === 'both' || schedule.reminderType === 'sms') {
          if (preferredChannel !== 'email' && preferredChannel !== 'none' && appointment.patientPhone) {
            channels.push('sms');
          }
        }
        if (schedule.reminderType === 'both' || schedule.reminderType === 'email') {
          if (preferredChannel !== 'sms' && preferredChannel !== 'none' && appointment.patientEmail) {
            channels.push('email');
          }
        }

        // Calculate scheduled time
        const appointmentTime = new Date(appointment.startTime);
        const scheduledFor = new Date(appointmentTime);
        scheduledFor.setHours(scheduledFor.getHours() - schedule.hoursBefore);

        // Skip if reminder time is in the past
        if (scheduledFor <= new Date()) {
          continue;
        }

        // Check quiet hours
        if (prefs?.quietHoursStart && prefs?.quietHoursEnd) {
          const scheduledHour = scheduledFor.getHours();
          const quietStart = parseInt(prefs.quietHoursStart.split(':')[0] || '0');
          const quietEnd = parseInt(prefs.quietHoursEnd.split(':')[0] || '0');

          if (quietStart <= scheduledHour && scheduledHour < quietEnd) {
            // Adjust to after quiet hours
            scheduledFor.setHours(quietEnd, 0, 0, 0);
          }
        }

        // Determine reminder category
        let reminderCategory: '48_hour' | '24_hour' | '2_hour' | 'custom';
        if (schedule.hoursBefore === 48) {
          reminderCategory = '48_hour';
        } else if (schedule.hoursBefore === 24) {
          reminderCategory = '24_hour';
        } else if (schedule.hoursBefore === 2) {
          reminderCategory = '2_hour';
        } else {
          reminderCategory = 'custom';
        }

        // Create reminder entries for each channel
        for (const channel of channels) {
          // Check if reminder already exists
          const existingResult = await pool.query(
            `SELECT id FROM reminder_queue
             WHERE appointment_id = $1 AND reminder_category = $2 AND reminder_type = $3
             AND status NOT IN ('cancelled', 'failed')`,
            [appointmentId, reminderCategory, channel]
          );

          if (existingResult.rows.length > 0) {
            continue; // Skip if already scheduled
          }

          // Get template
          const templateResult = await pool.query(
            `SELECT body, subject FROM reminder_templates
             WHERE tenant_id = $1 AND template_type = $2 AND channel = $3 AND is_active = true
             ORDER BY is_default DESC
             LIMIT 1`,
            [tenantId, reminderCategory, channel]
          );

          const template = templateResult.rows[0];
          const messageContent = template
            ? processTemplate(template.body, appointment)
            : `Reminder: You have an appointment on ${new Date(appointment.startTime).toLocaleDateString()}`;

          const reminderId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO reminder_queue
             (id, tenant_id, appointment_id, patient_id, schedule_id, reminder_type,
              reminder_category, scheduled_for, status, message_content)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
            [
              reminderId,
              tenantId,
              appointmentId,
              appointment.patientId,
              schedule.id,
              channel,
              reminderCategory,
              scheduledFor,
              messageContent,
            ]
          );

          scheduled++;
        }
      } catch (scheduleError: unknown) {
        const message = scheduleError instanceof Error ? scheduleError.message : 'Unknown error';
        errors.push(`Failed to schedule reminder for schedule ${schedule.id}: ${message}`);
        logger.error('Error scheduling reminder', {
          scheduleId: schedule.id,
          appointmentId,
          error: message,
        });
      }
    }

    logger.info('Reminders scheduled for appointment', {
      appointmentId,
      scheduled,
      errors: errors.length,
    });

    return { scheduled, errors };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in scheduleReminders', { appointmentId, error: message });
    errors.push(message);
    return { scheduled, errors };
  }
}

/**
 * Process the reminder queue - send all due reminders
 */
export async function processReminderQueue(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get all pending reminders that are due
    const dueRemindersResult = await pool.query(
      `SELECT
        rq.id,
        rq.tenant_id as "tenantId",
        rq.appointment_id as "appointmentId",
        rq.patient_id as "patientId",
        rq.reminder_type as "reminderType",
        rq.reminder_category as "reminderCategory",
        rq.scheduled_for as "scheduledFor",
        rq.message_content as "messageContent",
        rq.retry_count as "retryCount",
        rq.max_retries as "maxRetries",
        p.phone as "patientPhone",
        p.email as "patientEmail",
        p.first_name || ' ' || p.last_name as "patientName",
        a.status as "appointmentStatus",
        s.twilio_phone_number as "twilioPhone",
        s.is_active as "smsActive"
      FROM reminder_queue rq
      JOIN patients p ON rq.patient_id = p.id
      JOIN appointments a ON rq.appointment_id = a.id
      LEFT JOIN sms_settings s ON rq.tenant_id = s.tenant_id
      WHERE rq.status = 'pending'
        AND rq.scheduled_for <= NOW()
      ORDER BY rq.scheduled_for ASC
      LIMIT 100`
    );

    const dueReminders = dueRemindersResult.rows;

    for (const reminder of dueReminders) {
      processed++;

      try {
        // Check if appointment is still valid
        if (reminder.appointmentStatus === 'cancelled') {
          await pool.query(
            `UPDATE reminder_queue SET status = 'skipped', updated_at = NOW()
             WHERE id = $1`,
            [reminder.id]
          );
          skipped++;
          continue;
        }

        // Check patient preferences again
        const prefsResult = await pool.query(
          `SELECT opted_out, preferred_channel FROM patient_reminder_preferences
           WHERE tenant_id = $1 AND patient_id = $2`,
          [reminder.tenantId, reminder.patientId]
        );

        const prefs = prefsResult.rows[0];
        if (prefs?.opted_out) {
          await pool.query(
            `UPDATE reminder_queue SET status = 'skipped', updated_at = NOW()
             WHERE id = $1`,
            [reminder.id]
          );
          skipped++;
          continue;
        }

        // Attempt to send the reminder
        let sendSuccess = false;
        let externalMessageId: string | null = null;
        let errorMessage: string | null = null;

        if (reminder.reminderType === 'sms') {
          // Check if we have required info for SMS
          if (!reminder.patientPhone) {
            errorMessage = 'Patient has no phone number';
          } else if (!reminder.smsActive) {
            errorMessage = 'SMS is not configured for this tenant';
          } else {
            // In production, this would call the actual SMS service
            // For now, we mark it as sent
            sendSuccess = true;
            externalMessageId = `mock_sms_${crypto.randomUUID()}`;

            logger.info('SMS reminder sent', {
              reminderId: reminder.id,
              patientPhone: reminder.patientPhone,
              message: reminder.messageContent?.substring(0, 50),
            });
          }
        } else if (reminder.reminderType === 'email') {
          if (!reminder.patientEmail) {
            errorMessage = 'Patient has no email address';
          } else {
            // In production, this would call the actual email service
            sendSuccess = true;
            externalMessageId = `mock_email_${crypto.randomUUID()}`;

            logger.info('Email reminder sent', {
              reminderId: reminder.id,
              patientEmail: reminder.patientEmail,
            });
          }
        }

        if (sendSuccess) {
          await pool.query(
            `UPDATE reminder_queue
             SET status = 'sent', sent_at = NOW(), delivery_status = 'sent',
                 external_message_id = $2, updated_at = NOW()
             WHERE id = $1`,
            [reminder.id, externalMessageId]
          );
          sent++;
        } else {
          const newRetryCount = (reminder.retryCount || 0) + 1;
          const shouldRetry = newRetryCount < (reminder.maxRetries || 3);

          if (shouldRetry) {
            const nextRetry = new Date();
            nextRetry.setMinutes(nextRetry.getMinutes() + 15 * newRetryCount);

            await pool.query(
              `UPDATE reminder_queue
               SET retry_count = $2, next_retry_at = $3, error_message = $4, updated_at = NOW()
               WHERE id = $1`,
              [reminder.id, newRetryCount, nextRetry, errorMessage]
            );
          } else {
            await pool.query(
              `UPDATE reminder_queue
               SET status = 'failed', error_message = $2, retry_count = $3, updated_at = NOW()
               WHERE id = $1`,
              [reminder.id, errorMessage, newRetryCount]
            );
          }
          failed++;
        }
      } catch (sendError: unknown) {
        const message = sendError instanceof Error ? sendError.message : 'Unknown error';
        logger.error('Error processing reminder', {
          reminderId: reminder.id,
          error: message,
        });

        await pool.query(
          `UPDATE reminder_queue
           SET status = 'failed', error_message = $2, updated_at = NOW()
           WHERE id = $1`,
          [reminder.id, message]
        );
        failed++;
      }
    }

    logger.info('Reminder queue processed', {
      processed,
      sent,
      failed,
      skipped,
    });

    return { processed, sent, failed, skipped };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in processReminderQueue', { error: message });
    return { processed, sent, failed, skipped };
  }
}

/**
 * Handle a confirmation response from a patient
 */
export async function handleConfirmation(
  tenantId: string,
  appointmentId: string,
  response: 'confirmed' | 'cancelled' | 'rescheduled',
  rawResponse?: string,
  channel?: 'sms' | 'email' | 'phone' | 'portal'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the most recent reminder for this appointment
    const reminderResult = await pool.query(
      `SELECT id, patient_id FROM reminder_queue
       WHERE appointment_id = $1 AND tenant_id = $2 AND status = 'sent'
       ORDER BY sent_at DESC
       LIMIT 1`,
      [appointmentId, tenantId]
    );

    const reminder = reminderResult.rows[0];
    if (!reminder) {
      return { success: false, error: 'No sent reminder found for this appointment' };
    }

    // Create response record
    const responseId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO reminder_responses
       (id, tenant_id, reminder_id, appointment_id, patient_id, response_type,
        response_channel, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        responseId,
        tenantId,
        reminder.id,
        appointmentId,
        reminder.patient_id,
        response,
        channel || 'sms',
        rawResponse || null,
      ]
    );

    // Update appointment status based on response
    if (response === 'confirmed') {
      await pool.query(
        `UPDATE appointments SET confirmation_status = 'confirmed', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );
    } else if (response === 'cancelled') {
      await pool.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(),
         cancellation_reason = 'Patient cancelled via reminder response', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );
    }

    // Mark response as processed
    await pool.query(
      `UPDATE reminder_responses SET processed = true, processed_at = NOW()
       WHERE id = $1`,
      [responseId]
    );

    logger.info('Confirmation response processed', {
      appointmentId,
      response,
      channel,
    });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error handling confirmation', { appointmentId, error: message });
    return { success: false, error: message };
  }
}

/**
 * Cancel all pending reminders for an appointment
 */
export async function cancelReminders(
  tenantId: string,
  appointmentId: string
): Promise<{ cancelled: number }> {
  try {
    const result = await pool.query(
      `UPDATE reminder_queue
       SET status = 'cancelled', updated_at = NOW()
       WHERE appointment_id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING id`,
      [appointmentId, tenantId]
    );

    logger.info('Reminders cancelled', {
      appointmentId,
      cancelled: result.rowCount,
    });

    return { cancelled: result.rowCount || 0 };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error cancelling reminders', { appointmentId, error: message });
    return { cancelled: 0 };
  }
}

/**
 * Schedule no-show follow-up reminder
 */
export async function scheduleNoShowFollowup(
  tenantId: string,
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get appointment and patient info
    const appointmentResult = await pool.query(
      `SELECT
        a.id as "appointmentId",
        a.patient_id as "patientId",
        p.first_name || ' ' || p.last_name as "patientName",
        p.phone as "patientPhone",
        p.email as "patientEmail",
        u.name as "providerName",
        l.phone as "clinicPhone"
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN users u ON a.provider_id = u.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE a.id = $1 AND a.tenant_id = $2 AND a.status = 'no_show'`,
      [appointmentId, tenantId]
    );

    if (appointmentResult.rows.length === 0) {
      return { success: false, error: 'Appointment not found or not marked as no-show' };
    }

    const appointment = appointmentResult.rows[0];

    // Check patient preferences
    const prefsResult = await pool.query(
      `SELECT opted_out, receive_no_show_followup, preferred_channel
       FROM patient_reminder_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, appointment.patientId]
    );

    const prefs = prefsResult.rows[0];
    if (prefs?.opted_out || prefs?.receive_no_show_followup === false) {
      return { success: false, error: 'Patient opted out of no-show follow-ups' };
    }

    // Get no-show template
    const templateResult = await pool.query(
      `SELECT body FROM reminder_templates
       WHERE tenant_id = $1 AND template_type = 'no_show_followup' AND channel = 'sms' AND is_active = true
       ORDER BY is_default DESC
       LIMIT 1`,
      [tenantId]
    );

    const template = templateResult.rows[0];
    let messageContent = template?.body ||
      'We missed you today! Please call {clinic_phone} to reschedule your appointment.';

    messageContent = messageContent
      .replace('{clinic_phone}', appointment.clinicPhone || 'us')
      .replace('{provider_name}', appointment.providerName);

    // Schedule follow-up for 2 hours after appointment
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + 2);

    const reminderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO reminder_queue
       (id, tenant_id, appointment_id, patient_id, reminder_type, reminder_category,
        scheduled_for, status, message_content)
       VALUES ($1, $2, $3, $4, 'sms', 'no_show_followup', $5, 'pending', $6)`,
      [
        reminderId,
        tenantId,
        appointmentId,
        appointment.patientId,
        scheduledFor,
        messageContent,
      ]
    );

    logger.info('No-show follow-up scheduled', {
      appointmentId,
      scheduledFor,
    });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error scheduling no-show follow-up', { appointmentId, error: message });
    return { success: false, error: message };
  }
}

/**
 * Get reminder statistics for a date range
 */
export async function getReminderStats(
  tenantId: string,
  dateRange: DateRange
): Promise<ReminderStats> {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'sent', 'failed', 'skipped')) as "totalScheduled",
        COUNT(*) FILTER (WHERE status = 'sent') as "totalSent",
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as "totalDelivered",
        COUNT(*) FILTER (WHERE status = 'failed') as "totalFailed"
      FROM reminder_queue
      WHERE tenant_id = $1
        AND created_at >= $2 AND created_at <= $3`,
      [tenantId, dateRange.startDate, dateRange.endDate]
    );

    const responseResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE response_type = 'confirmed') as "totalConfirmed",
        COUNT(*) FILTER (WHERE response_type = 'cancelled') as "totalCancelled"
      FROM reminder_responses
      WHERE tenant_id = $1
        AND created_at >= $2 AND created_at <= $3`,
      [tenantId, dateRange.startDate, dateRange.endDate]
    );

    const noShowResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE a.status = 'no_show') as "totalNoShows",
        COUNT(*) FILTER (WHERE a.status != 'no_show' AND a.status != 'cancelled') as "totalCompleted"
      FROM appointments a
      WHERE a.tenant_id = $1
        AND a.start_time >= $2 AND a.start_time <= $3`,
      [tenantId, dateRange.startDate, dateRange.endDate]
    );

    const stats = result.rows[0];
    const responses = responseResult.rows[0];
    const noShows = noShowResult.rows[0];

    const totalScheduled = parseInt(stats?.totalScheduled || '0');
    const totalSent = parseInt(stats?.totalSent || '0');
    const totalDelivered = parseInt(stats?.totalDelivered || '0');
    const totalFailed = parseInt(stats?.totalFailed || '0');
    const totalConfirmed = parseInt(responses?.totalConfirmed || '0');
    const totalCancelled = parseInt(responses?.totalCancelled || '0');
    const totalNoShows = parseInt(noShows?.totalNoShows || '0');
    const totalCompleted = parseInt(noShows?.totalCompleted || '0');

    const confirmationRate = totalSent > 0 ? (totalConfirmed / totalSent) * 100 : 0;
    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    const noShowReductionRate = totalCompleted > 0
      ? 100 - (totalNoShows / (totalNoShows + totalCompleted)) * 100
      : 0;

    return {
      totalScheduled,
      totalSent,
      totalDelivered,
      totalFailed,
      totalConfirmed,
      totalCancelled,
      totalNoShows,
      confirmationRate: Math.round(confirmationRate * 10) / 10,
      deliveryRate: Math.round(deliveryRate * 10) / 10,
      noShowReductionRate: Math.round(noShowReductionRate * 10) / 10,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting reminder stats', { tenantId, error: message });
    return {
      totalScheduled: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalConfirmed: 0,
      totalCancelled: 0,
      totalNoShows: 0,
      confirmationRate: 0,
      deliveryRate: 0,
      noShowReductionRate: 0,
    };
  }
}

/**
 * Get reminder queue for display
 */
export async function getReminderQueue(
  tenantId: string,
  options: {
    status?: string;
    reminderType?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ reminders: QueuedReminder[]; total: number }> {
  try {
    const { status, reminderType, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        rq.id,
        rq.tenant_id as "tenantId",
        rq.appointment_id as "appointmentId",
        rq.patient_id as "patientId",
        rq.schedule_id as "scheduleId",
        rq.reminder_type as "reminderType",
        rq.reminder_category as "reminderCategory",
        rq.scheduled_for as "scheduledFor",
        rq.sent_at as "sentAt",
        rq.status,
        rq.delivery_status as "deliveryStatus",
        rq.message_content as "messageContent",
        rq.external_message_id as "externalMessageId",
        rq.error_message as "errorMessage",
        rq.retry_count as "retryCount",
        rq.max_retries as "maxRetries",
        rq.next_retry_at as "nextRetryAt",
        p.first_name || ' ' || p.last_name as "patientName",
        a.start_time as "appointmentTime"
      FROM reminder_queue rq
      JOIN patients p ON rq.patient_id = p.id
      JOIN appointments a ON rq.appointment_id = a.id
      WHERE rq.tenant_id = $1
    `;

    const params: (string | number)[] = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND rq.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (reminderType) {
      query += ` AND rq.reminder_type = $${paramIndex}`;
      params.push(reminderType);
      paramIndex++;
    }

    query += ` ORDER BY rq.scheduled_for DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM reminder_queue rq WHERE rq.tenant_id = $1`;
    const countParams: string[] = [tenantId];
    let countParamIndex = 2;

    if (status) {
      countQuery += ` AND rq.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (reminderType) {
      countQuery += ` AND rq.reminder_type = $${countParamIndex}`;
      countParams.push(reminderType);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.total || '0');

    return { reminders: result.rows, total };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting reminder queue', { tenantId, error: message });
    return { reminders: [], total: 0 };
  }
}

/**
 * Update patient reminder preferences
 */
export async function updatePatientPreferences(
  tenantId: string,
  patientId: string,
  preferences: Partial<PatientReminderPreferences>
): Promise<{ success: boolean; error?: string }> {
  try {
    const existingResult = await pool.query(
      `SELECT id FROM patient_reminder_preferences WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (existingResult.rows.length === 0) {
      // Create new preferences
      const prefId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO patient_reminder_preferences
         (id, tenant_id, patient_id, preferred_channel, quiet_hours_start, quiet_hours_end,
          opted_out, preferred_language, advance_notice_hours, receive_no_show_followup)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          prefId,
          tenantId,
          patientId,
          preferences.preferredChannel || 'both',
          preferences.quietHoursStart || null,
          preferences.quietHoursEnd || null,
          preferences.optedOut || false,
          preferences.preferredLanguage || 'en',
          preferences.advanceNoticeHours || 24,
          preferences.receiveNoShowFollowup !== false,
        ]
      );
    } else {
      // Update existing preferences
      const updates: string[] = [];
      const params: (string | boolean | number | null)[] = [];
      let paramIndex = 1;

      if (preferences.preferredChannel !== undefined) {
        updates.push(`preferred_channel = $${paramIndex}`);
        params.push(preferences.preferredChannel);
        paramIndex++;
      }

      if (preferences.quietHoursStart !== undefined) {
        updates.push(`quiet_hours_start = $${paramIndex}`);
        params.push(preferences.quietHoursStart);
        paramIndex++;
      }

      if (preferences.quietHoursEnd !== undefined) {
        updates.push(`quiet_hours_end = $${paramIndex}`);
        params.push(preferences.quietHoursEnd);
        paramIndex++;
      }

      if (preferences.optedOut !== undefined) {
        updates.push(`opted_out = $${paramIndex}`);
        params.push(preferences.optedOut);
        paramIndex++;

        if (preferences.optedOut) {
          updates.push(`opted_out_at = NOW()`);
        } else {
          updates.push(`opted_out_at = NULL`);
        }
      }

      if (preferences.preferredLanguage !== undefined) {
        updates.push(`preferred_language = $${paramIndex}`);
        params.push(preferences.preferredLanguage);
        paramIndex++;
      }

      if (preferences.advanceNoticeHours !== undefined) {
        updates.push(`advance_notice_hours = $${paramIndex}`);
        params.push(preferences.advanceNoticeHours);
        paramIndex++;
      }

      if (preferences.receiveNoShowFollowup !== undefined) {
        updates.push(`receive_no_show_followup = $${paramIndex}`);
        params.push(preferences.receiveNoShowFollowup);
        paramIndex++;
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        params.push(tenantId, patientId);

        await pool.query(
          `UPDATE patient_reminder_preferences SET ${updates.join(', ')}
           WHERE tenant_id = $${paramIndex} AND patient_id = $${paramIndex + 1}`,
          params
        );
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating patient preferences', { patientId, error: message });
    return { success: false, error: message };
  }
}

/**
 * Get patient reminder preferences
 */
export async function getPatientPreferences(
  tenantId: string,
  patientId: string
): Promise<PatientReminderPreferences | null> {
  try {
    const result = await pool.query(
      `SELECT
        id,
        tenant_id as "tenantId",
        patient_id as "patientId",
        preferred_channel as "preferredChannel",
        quiet_hours_start as "quietHoursStart",
        quiet_hours_end as "quietHoursEnd",
        opted_out as "optedOut",
        preferred_language as "preferredLanguage",
        advance_notice_hours as "advanceNoticeHours",
        receive_no_show_followup as "receiveNoShowFollowup"
      FROM patient_reminder_preferences
      WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    return result.rows[0] || null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting patient preferences', { patientId, error: message });
    return null;
  }
}
