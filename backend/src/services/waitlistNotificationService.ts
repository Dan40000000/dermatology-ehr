/**
 * Waitlist Notification Service
 *
 * Handles automated notifications when waitlist entries are matched to available appointments.
 * Includes rate limiting, confirmation handling, and audit trail.
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { TwilioService } from './twilioService';
import { auditLog, createAuditLog } from './audit';
import { randomUUID } from 'crypto';

export interface WaitlistNotificationParams {
  waitlistId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  providerName: string;
  appointmentDate: string;
  appointmentTime: string;
  slotId?: string;
  tenantId: string;
}

export interface NotificationRateLimitConfig {
  maxNotificationsPerDay: number;
  maxNotificationsPerHour: number;
  cooldownMinutes: number;
}

const DEFAULT_RATE_LIMIT: NotificationRateLimitConfig = {
  maxNotificationsPerDay: 3,
  maxNotificationsPerHour: 1,
  cooldownMinutes: 60,
};

/**
 * Send waitlist notification with rate limiting
 */
export async function sendWaitlistNotification(
  params: WaitlistNotificationParams,
  twilioService: TwilioService,
  rateLimitConfig: NotificationRateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check rate limits
    const rateLimitCheck = await checkRateLimit(
      params.tenantId,
      params.patientId,
      rateLimitConfig,
      client
    );

    if (!rateLimitCheck.allowed) {
      logger.warn('Rate limit exceeded for waitlist notification', {
        patientId: params.patientId,
        waitlistId: params.waitlistId,
        reason: rateLimitCheck.reason,
      });

      await client.query('COMMIT');
      return {
        success: false,
        error: rateLimitCheck.reason || 'Rate limit exceeded',
      };
    }

    // Create notification record
    const notificationId = randomUUID();
    await client.query(
      `INSERT INTO waitlist_notifications (
        id, tenant_id, waitlist_id, patient_id, provider_name,
        appointment_date, appointment_time, notification_method, slot_id,
        status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        notificationId,
        params.tenantId,
        params.waitlistId,
        params.patientId,
        params.providerName,
        params.appointmentDate,
        params.appointmentTime,
        'sms',
        params.slotId || null,
        'sent',
        new Date().toISOString(),
      ]
    );

    // Send SMS notification
    if (params.patientPhone) {
      try {
        const message = formatWaitlistSMSMessage(
          params.patientName.split(' ')[0] || params.patientName, // First name
          params.providerName,
          params.appointmentDate,
          params.appointmentTime
        );

        const fromPhone = process.env.TWILIO_PHONE_NUMBER || '';
        const result = await twilioService.sendSMS({
          to: params.patientPhone,
          from: fromPhone,
          body: message,
        });

        // Update notification with Twilio SID
        await client.query(
          `UPDATE waitlist_notifications
           SET twilio_sid = $1, sent_at = $2
           WHERE id = $3`,
          [result.sid, new Date().toISOString(), notificationId]
        );

        logger.info('Waitlist notification sent successfully', {
          notificationId,
          waitlistId: params.waitlistId,
          patientId: params.patientId,
          twilioSid: result.sid,
        });
      } catch (error: any) {
        logger.error('Failed to send waitlist SMS', {
          error: error.message,
          notificationId,
          waitlistId: params.waitlistId,
        });

        // Update notification status to failed
        await client.query(
          `UPDATE waitlist_notifications
           SET status = 'failed', error_message = $1
           WHERE id = $2`,
          [error.message, notificationId]
        );

        await client.query('COMMIT');
        return {
          success: false,
          error: error.message,
        };
      }
    }

    // Send email notification (if email provided)
    if (params.patientEmail) {
      await logEmailNotification(
        params.tenantId,
        notificationId,
        params.patientEmail,
        params.patientName,
        params.providerName,
        params.appointmentDate,
        params.appointmentTime,
        client
      );
    }

    // Update waitlist entry status
    await client.query(
      `UPDATE waitlist
       SET status = 'contacted',
           patient_notified_at = $1,
           notification_method = 'sms',
           updated_at = $1
       WHERE id = $2 AND tenant_id = $3`,
      [new Date().toISOString(), params.waitlistId, params.tenantId]
    );

    // Audit log
    await createAuditLog({
      tenantId: params.tenantId,
      userId: 'system',
      action: 'waitlist_notification_sent',
      resourceType: 'waitlist',
      resourceId: params.waitlistId,
      metadata: {
        notificationId,
        patientId: params.patientId,
        appointmentDate: params.appointmentDate,
        appointmentTime: params.appointmentTime,
      }
    });

    await client.query('COMMIT');

    return {
      success: true,
      notificationId,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error sending waitlist notification', {
      error: error.message,
      waitlistId: params.waitlistId,
      patientId: params.patientId,
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if patient is within rate limits for notifications
 */
async function checkRateLimit(
  tenantId: string,
  patientId: string,
  config: NotificationRateLimitConfig,
  client: any
): Promise<{ allowed: boolean; reason?: string }> {
  // Check hourly limit
  const hourlyResult = await client.query(
    `SELECT COUNT(*) as count
     FROM waitlist_notifications
     WHERE tenant_id = $1
       AND patient_id = $2
       AND created_at >= NOW() - INTERVAL '1 hour'
       AND status != 'failed'`,
    [tenantId, patientId]
  );

  const hourlyCount = parseInt(hourlyResult.rows[0].count);
  if (hourlyCount >= config.maxNotificationsPerHour) {
    return {
      allowed: false,
      reason: `Hourly limit exceeded (${hourlyCount}/${config.maxNotificationsPerHour})`,
    };
  }

  // Check daily limit
  const dailyResult = await client.query(
    `SELECT COUNT(*) as count
     FROM waitlist_notifications
     WHERE tenant_id = $1
       AND patient_id = $2
       AND created_at >= NOW() - INTERVAL '24 hours'
       AND status != 'failed'`,
    [tenantId, patientId]
  );

  const dailyCount = parseInt(dailyResult.rows[0].count);
  if (dailyCount >= config.maxNotificationsPerDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded (${dailyCount}/${config.maxNotificationsPerDay})`,
    };
  }

  // Check cooldown period (time since last notification)
  const lastNotificationResult = await client.query(
    `SELECT created_at
     FROM waitlist_notifications
     WHERE tenant_id = $1
       AND patient_id = $2
       AND status != 'failed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (lastNotificationResult.rows.length > 0) {
    const lastNotificationTime = new Date(lastNotificationResult.rows[0].created_at);
    const minutesSinceLastNotification =
      (Date.now() - lastNotificationTime.getTime()) / 1000 / 60;

    if (minutesSinceLastNotification < config.cooldownMinutes) {
      return {
        allowed: false,
        reason: `Cooldown period active (${Math.floor(minutesSinceLastNotification)}/${config.cooldownMinutes} minutes)`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Format waitlist SMS message
 */
function formatWaitlistSMSMessage(
  patientFirstName: string,
  providerName: string,
  appointmentDate: string,
  appointmentTime: string
): string {
  const formattedDate = formatDate(appointmentDate);
  const formattedTime = formatTime(appointmentTime);

  return `Hi ${patientFirstName}, an appointment slot opened on ${formattedDate} at ${formattedTime} with Dr. ${providerName}. Reply YES to book or call us to schedule.`;
}

/**
 * Process SMS reply for waitlist confirmation
 */
export async function processWaitlistSMSReply(
  tenantId: string,
  patientPhone: string,
  messageBody: string
): Promise<{ matched: boolean; action?: string; waitlistId?: string; notificationId?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find patient by phone
    const patientResult = await client.query(
      `SELECT id, first_name, last_name
       FROM patients
       WHERE tenant_id = $1 AND phone = $2
       LIMIT 1`,
      [tenantId, patientPhone]
    );

    if (patientResult.rows.length === 0) {
      await client.query('COMMIT');
      return { matched: false };
    }

    const patient = patientResult.rows[0];
    const normalizedMessage = messageBody.trim().toUpperCase();

    // Check for YES/ACCEPT confirmation
    if (normalizedMessage === 'YES' || normalizedMessage === 'ACCEPT' || normalizedMessage === 'Y') {
      // Find most recent waitlist notification for this patient
      const notificationResult = await client.query(
        `SELECT wn.id, wn.waitlist_id, wn.appointment_date, wn.appointment_time,
                wn.provider_name, wn.slot_id, w.patient_id
         FROM waitlist_notifications wn
         JOIN waitlist w ON wn.waitlist_id = w.id
         WHERE wn.tenant_id = $1
           AND wn.patient_id = $2
           AND wn.status = 'sent'
           AND wn.patient_response IS NULL
           AND wn.created_at >= NOW() - INTERVAL '48 hours'
         ORDER BY wn.created_at DESC
         LIMIT 1`,
        [tenantId, patient.id]
      );

      if (notificationResult.rows.length === 0) {
        await client.query('COMMIT');
        return { matched: false };
      }

      const notification = notificationResult.rows[0];

      // Update notification with patient response
      await client.query(
        `UPDATE waitlist_notifications
         SET patient_response = 'accepted',
             responded_at = $1,
             status = 'accepted'
         WHERE id = $2`,
        [new Date().toISOString(), notification.id]
      );

      // Update waitlist entry to matched status
      await client.query(
        `UPDATE waitlist
         SET status = 'matched',
             updated_at = $1
         WHERE id = $2 AND tenant_id = $3`,
        [new Date().toISOString(), notification.waitlist_id, tenantId]
      );

      // Audit log
      await createAuditLog({
        tenantId,
        userId: patient.id,
        action: 'waitlist_notification_accepted',
        resourceType: 'waitlist',
        resourceId: notification.waitlist_id,
        metadata: {
          notificationId: notification.id,
          response: 'accepted',
        }
      });

      logger.info('Waitlist notification accepted by patient', {
        patientId: patient.id,
        waitlistId: notification.waitlist_id,
        notificationId: notification.id,
      });

      await client.query('COMMIT');

      return {
        matched: true,
        action: 'accepted',
        waitlistId: notification.waitlist_id,
        notificationId: notification.id,
      };
    }

    // Check for NO/DECLINE
    if (normalizedMessage === 'NO' || normalizedMessage === 'DECLINE' || normalizedMessage === 'N') {
      const notificationResult = await client.query(
        `SELECT wn.id, wn.waitlist_id
         FROM waitlist_notifications wn
         WHERE wn.tenant_id = $1
           AND wn.patient_id = $2
           AND wn.status = 'sent'
           AND wn.patient_response IS NULL
           AND wn.created_at >= NOW() - INTERVAL '48 hours'
         ORDER BY wn.created_at DESC
         LIMIT 1`,
        [tenantId, patient.id]
      );

      if (notificationResult.rows.length > 0) {
        const notification = notificationResult.rows[0];

        // Update notification with patient response
        await client.query(
          `UPDATE waitlist_notifications
           SET patient_response = 'declined',
               responded_at = $1,
               status = 'declined'
           WHERE id = $2`,
          [new Date().toISOString(), notification.id]
        );

        // Keep waitlist entry active for future matches
        await createAuditLog({
          tenantId,
          userId: patient.id,
          action: 'waitlist_notification_declined',
          resourceType: 'waitlist',
          resourceId: notification.waitlist_id,
          metadata: {
            notificationId: notification.id,
            response: 'declined',
          }
        });

        logger.info('Waitlist notification declined by patient', {
          patientId: patient.id,
          waitlistId: notification.waitlist_id,
          notificationId: notification.id,
        });

        await client.query('COMMIT');

        return {
          matched: true,
          action: 'declined',
          waitlistId: notification.waitlist_id,
          notificationId: notification.id,
        };
      }
    }

    await client.query('COMMIT');
    return { matched: false };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error processing waitlist SMS reply', {
      error: error.message,
      tenantId,
      patientPhone,
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Log email notification (simulated for now)
 */
async function logEmailNotification(
  tenantId: string,
  notificationId: string,
  email: string,
  patientName: string,
  providerName: string,
  appointmentDate: string,
  appointmentTime: string,
  client: any
): Promise<void> {
  const formattedDate = formatDate(appointmentDate);
  const formattedTime = formatTime(appointmentTime);

  const emailSubject = 'Appointment Slot Available';
  const emailBody = `
Dear ${patientName.split(' ')[0]},

Good news! An appointment slot has opened up that matches your waitlist preferences.

Appointment Details:
- Provider: Dr. ${providerName}
- Date: ${formattedDate}
- Time: ${formattedTime}

Please contact our office as soon as possible to confirm this appointment, as it will be offered to other patients if not claimed within 24 hours.

To schedule, please call us or log in to your patient portal.

Thank you,
Your Healthcare Team
  `.trim();

  logger.info('Waitlist email notification', {
    tenantId,
    notificationId,
    to: email,
    subject: emailSubject,
  });
}

/**
 * Get notification history for a waitlist entry
 */
export async function getWaitlistNotificationHistory(
  tenantId: string,
  waitlistId: string
): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      wn.id,
      wn.notification_method,
      wn.appointment_date,
      wn.appointment_time,
      wn.provider_name,
      wn.status,
      wn.patient_response,
      wn.created_at,
      wn.sent_at,
      wn.responded_at,
      wn.error_message
     FROM waitlist_notifications wn
     WHERE wn.tenant_id = $1 AND wn.waitlist_id = $2
     ORDER BY wn.created_at DESC`,
    [tenantId, waitlistId]
  );

  return result.rows;
}

/**
 * Helper functions
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeString: string): string {
  // Handle time strings like "09:00" or full ISO timestamps
  if (timeString.includes('T')) {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours || '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}
