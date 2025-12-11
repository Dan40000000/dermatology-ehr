/**
 * SMS Reminder Scheduler Service
 * Cron job that sends automated appointment reminders via SMS
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { TwilioService, createTwilioService } from './twilioService';
import { formatPhoneE164, formatPhoneDisplay } from '../utils/phone';
import crypto from 'crypto';

export interface AppointmentToRemind {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  providerName: string;
  appointmentDate: Date;
  appointmentTime: string;
  clinicPhone: string;
  tenantId: string;
}

/**
 * Main scheduler function - runs every hour via cron
 * Finds appointments that need reminders and sends them
 */
export async function sendScheduledReminders(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Starting scheduled SMS reminder job');

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get all tenants with SMS enabled
    const tenants = await getTenantsWithSMSEnabled();

    for (const tenant of tenants) {
      try {
        // Get appointments that need reminders
        const appointments = await getAppointmentsNeedingReminders(
          tenant.tenant_id,
          tenant.reminder_hours_before
        );

        logger.info(`Found ${appointments.length} appointments needing reminders`, {
          tenantId: tenant.tenant_id,
        });

        // Create Twilio service for tenant
        const twilioService = createTwilioService(
          tenant.twilio_account_sid,
          tenant.twilio_auth_token
        );

        // Send reminders
        for (const appt of appointments) {
          try {
            // Check if patient is opted in
            const shouldSend = await shouldSendReminder(tenant.tenant_id, appt.patientId);

            if (!shouldSend) {
              logger.info('Skipping reminder - patient opted out', {
                patientId: appt.patientId,
                appointmentId: appt.appointmentId,
              });
              skipped++;
              continue;
            }

            // Send reminder
            await sendAppointmentReminder(
              twilioService,
              tenant,
              appt
            );

            sent++;
          } catch (error: any) {
            logger.error('Failed to send reminder', {
              error: error.message,
              appointmentId: appt.appointmentId,
              patientId: appt.patientId,
            });
            failed++;
          }
        }
      } catch (error: any) {
        logger.error('Error processing tenant reminders', {
          error: error.message,
          tenantId: tenant.tenant_id,
        });
      }
    }

    logger.info('SMS reminder job completed', {
      sent,
      failed,
      skipped,
    });

    return { sent, failed, skipped };
  } catch (error: any) {
    logger.error('SMS reminder job failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get tenants with SMS reminders enabled
 */
async function getTenantsWithSMSEnabled(): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      tenant_id,
      twilio_account_sid,
      twilio_auth_token,
      twilio_phone_number,
      reminder_hours_before,
      reminder_template
     FROM sms_settings
     WHERE is_active = true
       AND appointment_reminders_enabled = true
       AND twilio_account_sid IS NOT NULL
       AND twilio_auth_token IS NOT NULL
       AND twilio_phone_number IS NOT NULL`
  );

  return result.rows;
}

/**
 * Get appointments that need reminders sent
 */
async function getAppointmentsNeedingReminders(
  tenantId: string,
  hoursBeforereminder: number
): Promise<AppointmentToRemind[]> {
  // Calculate reminder window
  const reminderStartTime = new Date();
  reminderStartTime.setHours(reminderStartTime.getHours() + hoursBeforereminder);

  const reminderEndTime = new Date(reminderStartTime);
  reminderEndTime.setHours(reminderEndTime.getHours() + 1); // 1-hour window

  const result = await pool.query(
    `SELECT
      a.id as "appointmentId",
      a.patient_id as "patientId",
      p.first_name || ' ' || p.last_name as "patientName",
      p.phone as "patientPhone",
      u.name as "providerName",
      a.start_time as "appointmentDate",
      TO_CHAR(a.start_time, 'HH12:MI AM') as "appointmentTime",
      t.tenant_id,
      COALESCE(l.phone, '(555) 123-4567') as "clinicPhone"
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     JOIN users u ON a.provider_id = u.id
     JOIN tenants t ON a.tenant_id = t.id
     LEFT JOIN locations l ON a.location_id = l.id
     WHERE a.tenant_id = $1
       AND a.status = 'scheduled'
       AND a.start_time BETWEEN $2 AND $3
       AND p.phone IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM appointment_sms_reminders r
         WHERE r.appointment_id = a.id
           AND r.status IN ('sent', 'scheduled')
       )
     ORDER BY a.start_time`,
    [tenantId, reminderStartTime, reminderEndTime]
  );

  return result.rows;
}

/**
 * Check if reminder should be sent to patient
 */
async function shouldSendReminder(tenantId: string, patientId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT opted_in, appointment_reminders
     FROM patient_sms_preferences
     WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, patientId]
  );

  if (result.rows.length === 0) {
    // No preference record - default to opted in
    return true;
  }

  const prefs = result.rows[0];
  return prefs.opted_in && prefs.appointment_reminders;
}

/**
 * Send appointment reminder SMS
 */
async function sendAppointmentReminder(
  twilioService: TwilioService,
  tenant: any,
  appointment: AppointmentToRemind
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Format phone number
    const patientPhone = formatPhoneE164(appointment.patientPhone);
    if (!patientPhone) {
      throw new Error(`Invalid patient phone number: ${appointment.patientPhone}`);
    }

    // Format appointment date
    const appointmentDate = new Date(appointment.appointmentDate);
    const formattedDate = appointmentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    // Create reminder record (scheduled)
    const reminderId = crypto.randomUUID();
    await client.query(
      `INSERT INTO appointment_sms_reminders
       (id, tenant_id, appointment_id, patient_id, scheduled_send_time, status)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'scheduled')`,
      [reminderId, tenant.tenant_id, appointment.appointmentId, appointment.patientId]
    );

    // Send SMS via Twilio
    const result = await twilioService.sendAppointmentReminder(
      tenant.twilio_phone_number,
      {
        patientPhone: patientPhone,
        patientName: appointment.patientName,
        providerName: appointment.providerName,
        appointmentDate: formattedDate,
        appointmentTime: appointment.appointmentTime,
        clinicPhone: appointment.clinicPhone,
        template: tenant.reminder_template,
      }
    );

    // Log SMS message
    const smsMessageId = crypto.randomUUID();
    await client.query(
      `INSERT INTO sms_messages
       (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
        patient_id, message_body, status, message_type, related_appointment_id,
        sent_at, segment_count, created_at)
       VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'reminder', $9, CURRENT_TIMESTAMP, $10, CURRENT_TIMESTAMP)`,
      [
        smsMessageId,
        tenant.tenant_id,
        result.sid,
        tenant.twilio_phone_number,
        patientPhone,
        appointment.patientId,
        result.body,
        result.status,
        appointment.appointmentId,
        result.numSegments,
      ]
    );

    // Update reminder record
    await client.query(
      `UPDATE appointment_sms_reminders
       SET status = 'sent', sent_message_id = $1, sent_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [smsMessageId, reminderId]
    );

    await client.query('COMMIT');

    logger.info('Appointment reminder sent', {
      appointmentId: appointment.appointmentId,
      patientId: appointment.patientId,
      patientPhone: formatPhoneDisplay(patientPhone),
      twilioSid: result.sid,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Mark reminder as failed
    try {
      await client.query(
        `UPDATE appointment_sms_reminders
         SET status = 'failed', failed_at = CURRENT_TIMESTAMP, failure_reason = $1
         WHERE appointment_id = $2 AND status = 'scheduled'`,
        [error.message, appointment.appointmentId]
      );
    } catch (updateError) {
      // Ignore update errors
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send immediate reminder for a specific appointment (manual trigger)
 */
export async function sendImmediateReminder(
  tenantId: string,
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get tenant SMS settings
    const tenantResult = await pool.query(
      `SELECT
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        reminder_template
       FROM sms_settings
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return { success: false, error: 'SMS not configured for tenant' };
    }

    const tenant = tenantResult.rows[0];

    // Get appointment details
    const apptResult = await pool.query(
      `SELECT
        a.id as "appointmentId",
        a.patient_id as "patientId",
        p.first_name || ' ' || p.last_name as "patientName",
        p.phone as "patientPhone",
        u.name as "providerName",
        a.start_time as "appointmentDate",
        TO_CHAR(a.start_time, 'HH12:MI AM') as "appointmentTime",
        COALESCE(l.phone, '(555) 123-4567') as "clinicPhone"
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users u ON a.provider_id = u.id
       LEFT JOIN locations l ON a.location_id = l.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (apptResult.rows.length === 0) {
      return { success: false, error: 'Appointment not found' };
    }

    const appt: AppointmentToRemind = {
      ...apptResult.rows[0],
      tenantId,
    };

    // Check if patient is opted in
    const shouldSend = await shouldSendReminder(tenantId, appt.patientId);
    if (!shouldSend) {
      return { success: false, error: 'Patient has opted out of SMS' };
    }

    // Create Twilio service and send
    const twilioService = createTwilioService(
      tenant.twilio_account_sid,
      tenant.twilio_auth_token
    );

    await sendAppointmentReminder(twilioService, tenant, appt);

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to send immediate reminder', {
      error: error.message,
      tenantId,
      appointmentId,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Schedule a cron job to run every hour
 * In production, use node-cron or a proper job scheduler
 */
export function startReminderScheduler() {
  // Run immediately on startup
  sendScheduledReminders().catch((error) => {
    logger.error('Initial reminder job failed', { error: error.message });
  });

  // Run every hour
  setInterval(() => {
    sendScheduledReminders().catch((error) => {
      logger.error('Scheduled reminder job failed', { error: error.message });
    });
  }, 60 * 60 * 1000); // 1 hour

  logger.info('SMS reminder scheduler started (runs every hour)');
}
