/**
 * SMS/Voice Reminder Scheduler Service
 * Cron job that sends automated appointment reminders.
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { TwilioService, createTwilioService } from './twilioService';
import { formatPhoneE164, formatPhoneDisplay } from '../utils/phone';
import { assertSmsContentSafe, normalizeSmsTemplateForMinimumNecessary } from '../utils/smsPrivacyGuard';
import { getPracticeTimeZone } from '../lib/practiceTimeZone';
import crypto from 'crypto';

export interface AppointmentToRemind {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientFirstName?: string;
  patientPhone: string;
  providerName: string;
  appointmentDate: Date;
  appointmentTime: string;
  clinicPhone: string;
  tenantId: string;
}

export type ReminderChannel = 'sms' | 'voice';

const DEFAULT_CLINIC_NUMBER = '+15555550100';
const REMINDER_TIME_ZONE = getPracticeTimeZone();
const DEFAULT_SMS_TEMPLATE =
  'Hi {firstName}, this is a reminder for your appointment on {appointmentDate} at {appointmentTime}. Reply C to confirm, R to reschedule, or X to cancel.';

interface ReminderTenantSettings {
  tenant_id: string;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  reminder_hours_before: number;
  reminder_template: string | null;
  appointmentReminderChannel: ReminderChannel | null;
  is_test_mode: boolean;
}

interface ReminderSendResult {
  sid: string;
  status: string;
  body: string;
  numSegments: number;
}

function formatReminderDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatReminderTime(value: Date): string {
  return value.toLocaleTimeString('en-US', {
    timeZone: REMINDER_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getDefaultReminderChannel(): ReminderChannel {
  const configured = (process.env.APPOINTMENT_REMINDER_CHANNEL || 'sms').toLowerCase();
  if (configured === 'voice') {
    return 'voice';
  }
  if (configured !== 'sms') {
    logger.warn('Invalid APPOINTMENT_REMINDER_CHANNEL, defaulting to sms', { configured });
  }
  return 'sms';
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
  const defaultChannel = getDefaultReminderChannel();
  logger.info('Starting scheduled reminder job', { defaultChannel });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get all tenants with reminder capability enabled
    const tenants = await getTenantsWithRemindersEnabled();

    for (const tenant of tenants) {
      try {
        // Get appointments that need reminders
        const appointments = await getAppointmentsNeedingReminders(
          tenant.tenant_id,
          tenant.reminder_hours_before
        );
        const reminderChannel = getReminderChannelForTenant(tenant, defaultChannel);

        logger.info(`Found ${appointments.length} appointments needing reminders`, {
          tenantId: tenant.tenant_id,
          reminderChannel,
        });

        const twilioService = buildTwilioServiceForTenant(tenant);

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

            if (reminderChannel === 'voice') {
              await sendAppointmentVoiceReminder(twilioService, tenant, appt);
            } else {
              await sendAppointmentReminder(twilioService, tenant, appt);
            }

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

    logger.info('Reminder job completed', {
      sent,
      failed,
      skipped,
      defaultChannel,
    });

    return { sent, failed, skipped };
  } catch (error: any) {
    logger.error('Reminder job failed', {
      error: error.message,
      defaultChannel,
    });
    throw error;
  }
}

/**
 * Get tenants with reminders enabled
 */
async function getTenantsWithRemindersEnabled(): Promise<ReminderTenantSettings[]> {
  const result = await pool.query(
    `SELECT
      tenant_id,
      twilio_account_sid,
      twilio_auth_token,
      twilio_phone_number,
      reminder_hours_before,
      reminder_template,
      appointment_reminder_channel as "appointmentReminderChannel",
      is_test_mode
     FROM sms_settings
     WHERE is_active = true
       AND appointment_reminders_enabled = true
       AND (
         is_test_mode = true
         OR (
           twilio_account_sid IS NOT NULL
           AND twilio_auth_token IS NOT NULL
           AND twilio_phone_number IS NOT NULL
         )
       )`
  );

  return result.rows;
}

function getReminderChannelForTenant(
  tenant: ReminderTenantSettings,
  defaultChannel: ReminderChannel
): ReminderChannel {
  if (tenant.appointmentReminderChannel === 'sms' || tenant.appointmentReminderChannel === 'voice') {
    return tenant.appointmentReminderChannel;
  }
  if (tenant.appointmentReminderChannel && tenant.appointmentReminderChannel !== defaultChannel) {
    logger.warn('Invalid tenant reminder channel, using default', {
      tenantId: tenant.tenant_id,
      channel: tenant.appointmentReminderChannel,
      defaultChannel,
    });
  }
  return defaultChannel;
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
      p.first_name as "patientFirstName",
      p.first_name || ' ' || p.last_name as "patientName",
      p.phone as "patientPhone",
      pr.full_name as "providerName",
      COALESCE(a.scheduled_start, a.start_time) as "appointmentDate",
      TO_CHAR(COALESCE(a.scheduled_start, a.start_time), 'HH12:MI AM') as "appointmentTime",
      a.tenant_id as "tenantId",
      COALESCE(l.phone, '(555) 123-4567') as "clinicPhone"
     FROM appointments a
     JOIN patients p ON a.patient_id = p.id
     LEFT JOIN providers pr ON a.provider_id = pr.id AND a.tenant_id = pr.tenant_id
     JOIN tenants t ON a.tenant_id = t.id
     LEFT JOIN locations l ON a.location_id = l.id
     WHERE a.tenant_id = $1
       AND a.status = 'scheduled'
       AND COALESCE(a.scheduled_start, a.start_time) BETWEEN $2 AND $3
       AND p.phone IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM appointment_sms_reminders r
         WHERE r.appointment_id = a.id
           AND r.status IN ('sent', 'scheduled')
       )
     ORDER BY COALESCE(a.scheduled_start, a.start_time)`,
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
  twilioService: TwilioService | null,
  tenant: ReminderTenantSettings,
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
    const formattedDate = formatReminderDate(appointmentDate);
    const formattedTime = formatReminderTime(appointmentDate);

    // Create reminder record (scheduled)
    const reminderId = crypto.randomUUID();
    await client.query(
      `INSERT INTO appointment_sms_reminders
       (id, tenant_id, appointment_id, patient_id, scheduled_send_time, status)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'scheduled')`,
      [reminderId, tenant.tenant_id, appointment.appointmentId, appointment.patientId]
    );

    const reminderBody = applyReminderTemplate(tenant.reminder_template, {
      firstName: appointment.patientFirstName || appointment.patientName.split(/\s+/)[0] || 'there',
      patientName: appointment.patientName,
      providerName: appointment.providerName,
      appointmentDate: formattedDate,
      appointmentTime: formattedTime,
      clinicPhone: appointment.clinicPhone,
    });

    let result: ReminderSendResult;
    if (tenant.is_test_mode) {
      result = {
        sid: `mock_sms_${crypto.randomUUID()}`,
        status: 'sent',
        body: reminderBody,
        numSegments: 1,
      };
    } else {
      if (!twilioService || !tenant.twilio_phone_number) {
        throw new Error('Twilio SMS is not configured');
      }
      const twilioResult = await twilioService.sendAppointmentReminder(
        tenant.twilio_phone_number,
        {
          patientPhone,
          firstName: appointment.patientFirstName || appointment.patientName.split(/\s+/)[0] || 'there',
          patientName: appointment.patientName,
          providerName: appointment.providerName,
          appointmentDate: formattedDate,
          appointmentTime: formattedTime,
          clinicPhone: appointment.clinicPhone,
          template: tenant.reminder_template || DEFAULT_SMS_TEMPLATE,
        }
      );
      result = {
        sid: twilioResult.sid,
        status: twilioResult.status,
        body: twilioResult.body,
        numSegments: twilioResult.numSegments,
      };
    }

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
        tenant.twilio_phone_number || DEFAULT_CLINIC_NUMBER,
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

async function sendAppointmentVoiceReminder(
  twilioService: TwilioService | null,
  tenant: ReminderTenantSettings,
  appointment: AppointmentToRemind
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const patientPhone = formatPhoneE164(appointment.patientPhone);
    if (!patientPhone) {
      throw new Error(`Invalid patient phone number: ${appointment.patientPhone}`);
    }

    const appointmentDate = new Date(appointment.appointmentDate);
    const formattedDate = formatReminderDate(appointmentDate);
    const formattedTime = formatReminderTime(appointmentDate);

    const voiceMessage = `Hello ${appointment.patientFirstName || appointment.patientName.split(/\s+/)[0] || 'there'}. This is a reminder from your dermatology clinic. You have an appointment on ${formattedDate} at ${formattedTime}. If you need to reschedule, please call ${appointment.clinicPhone}.`;

    const callResult = tenant.is_test_mode
      ? {
          sid: `mock_call_${crypto.randomUUID()}`,
          status: 'queued',
        }
      : await placeVoiceReminderCall(twilioService, tenant, patientPhone, voiceMessage);

    const messageId = crypto.randomUUID();
    await client.query(
      `INSERT INTO sms_messages
       (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
        patient_id, message_body, status, message_type, related_appointment_id,
        sent_at, segment_count, created_at)
       VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'reminder_call', $9, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)`,
      [
        messageId,
        tenant.tenant_id,
        callResult.sid,
        tenant.twilio_phone_number || DEFAULT_CLINIC_NUMBER,
        patientPhone,
        appointment.patientId,
        voiceMessage,
        callResult.status,
        appointment.appointmentId,
      ]
    );

    const reminderId = crypto.randomUUID();
    await client.query(
      `INSERT INTO appointment_sms_reminders
       (id, tenant_id, appointment_id, patient_id, scheduled_send_time, status, sent_message_id, sent_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'sent', $5, CURRENT_TIMESTAMP)
       ON CONFLICT (appointment_id) DO UPDATE SET
         status = EXCLUDED.status,
         sent_message_id = EXCLUDED.sent_message_id,
         sent_at = EXCLUDED.sent_at,
         failed_at = NULL,
         failure_reason = NULL`,
      [reminderId, tenant.tenant_id, appointment.appointmentId, appointment.patientId, messageId]
    );

    await client.query('COMMIT');

    logger.info('Appointment reminder call placed', {
      appointmentId: appointment.appointmentId,
      patientId: appointment.patientId,
      patientPhone: formatPhoneDisplay(patientPhone),
      callSid: callResult.sid,
      isTestMode: tenant.is_test_mode,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    try {
      await client.query(
        `UPDATE appointment_sms_reminders
         SET status = 'failed', failed_at = CURRENT_TIMESTAMP, failure_reason = $1
         WHERE appointment_id = $2`,
        [error.message, appointment.appointmentId]
      );
    } catch (_updateError) {
      // Best effort logging only.
    }

    throw error;
  } finally {
    client.release();
  }
}

async function placeVoiceReminderCall(
  twilioService: TwilioService | null,
  tenant: ReminderTenantSettings,
  patientPhone: string,
  voiceMessage: string
) {
  if (!twilioService || !tenant.twilio_phone_number) {
    throw new Error('Twilio voice calling is not configured');
  }

  return twilioService.placeVoiceCall({
    to: patientPhone,
    from: tenant.twilio_phone_number,
    message: voiceMessage,
  });
}

function buildTwilioServiceForTenant(tenant: ReminderTenantSettings): TwilioService | null {
  if (tenant.is_test_mode) {
    return null;
  }
  if (!tenant.twilio_account_sid || !tenant.twilio_auth_token) {
    throw new Error('Twilio credentials missing for active reminder tenant');
  }
  return createTwilioService(tenant.twilio_account_sid, tenant.twilio_auth_token);
}

function applyReminderTemplate(
  template: string | null,
  vars: Record<string, string>
): string {
  let result = normalizeSmsTemplateForMinimumNecessary(template || DEFAULT_SMS_TEMPLATE);
  assertSmsContentSafe(result);
  for (const [key, value] of Object.entries(vars)) {
    const token = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(token, value || '');
  }
  assertSmsContentSafe(result);
  return result;
}

/**
 * Send immediate reminder for a specific appointment (manual trigger)
 */
export async function sendImmediateReminder(
  tenantId: string,
  appointmentId: string,
  channel: ReminderChannel = 'sms'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get tenant SMS settings
    const tenantResult = await pool.query(
      `SELECT
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        reminder_template,
        is_test_mode,
        reminder_hours_before,
        tenant_id
       FROM sms_settings
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return { success: false, error: 'SMS not configured for tenant' };
    }

    const tenant: ReminderTenantSettings = {
      ...tenantResult.rows[0],
      tenant_id: tenantId,
    };

    // Get appointment details
    const apptResult = await pool.query(
      `SELECT
        a.id as "appointmentId",
        a.patient_id as "patientId",
        p.first_name as "patientFirstName",
        p.first_name || ' ' || p.last_name as "patientName",
        p.phone as "patientPhone",
        pr.full_name as "providerName",
        COALESCE(a.scheduled_start, a.start_time) as "appointmentDate",
        TO_CHAR(COALESCE(a.scheduled_start, a.start_time), 'HH12:MI AM') as "appointmentTime",
        COALESCE(l.phone, '(555) 123-4567') as "clinicPhone"
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN providers pr ON a.provider_id = pr.id AND a.tenant_id = pr.tenant_id
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

    const twilioService = buildTwilioServiceForTenant(tenant);
    if (channel === 'voice') {
      await sendAppointmentVoiceReminder(twilioService, tenant, appt);
    } else {
      await sendAppointmentReminder(twilioService, tenant, appt);
    }

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to send immediate reminder', {
      error: error.message,
      tenantId,
      appointmentId,
      channel,
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

  logger.info('Reminder scheduler started (runs every hour)', {
    channel: getDefaultReminderChannel(),
  });
}
