/**
 * SMS Workflow Service
 * Integrates SMS messaging with workflow events for automated patient communication
 *
 * Sends texts for:
 * - Appointment confirmations
 * - Appointment reminders (24h, 2h)
 * - Follow-up scheduling
 * - Lab results ready
 * - Prescription sent to pharmacy
 * - Prior auth updates
 * - Balance due notifications
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { TwilioService, createTwilioService } from './twilioService';
import { formatPhoneE164, formatPhoneDisplay } from '../utils/phone';
import crypto from 'crypto';

// ============================================
// SMS TEMPLATES
// ============================================

export const SMS_TEMPLATES = {
  // Appointment Templates
  APPOINTMENT_CONFIRMATION:
    `Hi {patientName}! Your appointment at {clinicName} is confirmed for {appointmentDate} at {appointmentTime} with {providerName}. Reply C to confirm or call {clinicPhone} to reschedule. Reply STOP to opt out.`,

  APPOINTMENT_REMINDER_24H:
    `Reminder: {patientName}, you have an appointment tomorrow ({appointmentDate}) at {appointmentTime} with {providerName}. Please arrive 15 min early. Reply C to confirm, R to reschedule. Call {clinicPhone} with questions.`,

  APPOINTMENT_REMINDER_2H:
    `{patientName}, your appointment is in 2 hours at {appointmentTime} with {providerName}. We look forward to seeing you! Call {clinicPhone} if running late.`,

  // Follow-up Templates
  FOLLOWUP_REMINDER:
    `Hi {patientName}! It's time to schedule your follow-up appointment at {clinicName}. Please call {clinicPhone} or visit our patient portal to book. Reply STOP to opt out.`,

  RECALL_REMINDER:
    `{patientName}, you're due for your {recallType} at {clinicName}. Please call {clinicPhone} to schedule your appointment. Your skin health matters!`,

  // Clinical Templates
  LAB_RESULTS_READY:
    `{patientName}, your lab results are now available. Please log into the patient portal or call {clinicPhone} to discuss with your provider.`,

  PRESCRIPTION_SENT:
    `{patientName}, your prescription has been sent to {pharmacyName}. It should be ready for pickup within 1-2 hours. Questions? Call {clinicPhone}.`,

  // Prior Auth Templates
  PRIOR_AUTH_APPROVED:
    `Good news, {patientName}! Your prior authorization for {itemName} has been approved. Please call {clinicPhone} to schedule if needed.`,

  PRIOR_AUTH_DENIED:
    `{patientName}, unfortunately your prior authorization for {itemName} was not approved. Please call {clinicPhone} to discuss alternatives with your provider.`,

  // Billing Templates
  BALANCE_DUE:
    `{patientName}, you have a balance of {balanceAmount} due at {clinicName}. Pay online at {portalUrl} or call {clinicPhone}. Reply STOP to opt out of texts.`,

  APPOINTMENT_CANCELLED:
    `{patientName}, your appointment on {appointmentDate} at {appointmentTime} has been cancelled. Please call {clinicPhone} to reschedule.`,

  // ============================================
  // PATIENT ENGAGEMENT TEMPLATES
  // ============================================

  // Birthday/Anniversary Messages
  BIRTHDAY_MESSAGE:
    `Happy Birthday, {patientName}! The team at {clinicName} wishes you a wonderful day! As our gift, enjoy {offer} on your next visit. Call {clinicPhone} to schedule. Reply STOP to opt out.`,

  ANNIVERSARY_MESSAGE:
    `Happy {years} year anniversary with {clinicName}, {patientName}! Thank you for trusting us with your skin health. Enjoy {offer} as our thank you gift!`,

  // Survey/Review Requests
  SURVEY_REQUEST:
    `Hi {patientName}! We hope your recent visit to {clinicName} went well. We'd love your feedback! Please take a quick survey: {surveyLink}. Your opinion helps us improve!`,

  REVIEW_REQUEST:
    `{patientName}, thank you for choosing {clinicName}! If you had a great experience, we'd appreciate a review on Google: {reviewLink}. It helps others find quality care!`,

  // Adherence Reminders
  ADHERENCE_REMINDER:
    `Hi {patientName}! This is a friendly reminder from {clinicName} to {reminderAction}. Consistency is key to great results! Questions? Call {clinicPhone}.`,

  PRODUCT_REORDER:
    `{patientName}, it's time to reorder your {productName} from {clinicName}! Running low on skincare essentials? Call {clinicPhone} or visit our online store.`,

  // Loyalty Program
  LOYALTY_MILESTONE:
    `Congratulations, {patientName}! You've reached {tierName} status in the {clinicName} Loyalty Program! Enjoy {benefits}. Thank you for your loyalty!`,

  LOYALTY_POINTS_EARNED:
    `{patientName}, you earned {points} loyalty points at {clinicName}! Current balance: {balance} pts. {tierMessage}`,

  // Seasonal Alerts
  SEASONAL_ALERT:
    `{patientName}, {seasonalMessage} Schedule your {appointmentType} at {clinicName}: {clinicPhone}. Your skin health matters!`,

  // Educational Content
  EDUCATIONAL_CONTENT:
    `{patientName}, we have helpful information about {topic} from {clinicName}. Learn more: {contentLink}. Questions? Call {clinicPhone}.`,
};

// ============================================
// INTERFACES
// ============================================

interface SMSWorkflowConfig {
  tenantId: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  clinicName?: string;
  clinicPhone?: string;
  portalUrl?: string;
}

interface SendWorkflowSMSParams {
  tenantId: string;
  patientId: string;
  template: string;
  variables: Record<string, string>;
  messageType: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

// ============================================
// SMS WORKFLOW SERVICE CLASS
// ============================================

export class SMSWorkflowService {

  /**
   * Get SMS configuration for a tenant
   */
  private async getTenantSMSConfig(tenantId: string): Promise<SMSWorkflowConfig | null> {
    const result = await pool.query(
      `SELECT
        tenant_id,
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        clinic_name,
        clinic_phone,
        portal_url
       FROM sms_settings
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      tenantId: row.tenant_id,
      twilioAccountSid: row.twilio_account_sid,
      twilioAuthToken: row.twilio_auth_token,
      twilioPhoneNumber: row.twilio_phone_number,
      clinicName: row.clinic_name || 'Our Clinic',
      clinicPhone: row.clinic_phone || '',
      portalUrl: row.portal_url || '',
    };
  }

  /**
   * Check if patient has opted in to SMS
   */
  private async isPatientOptedIn(tenantId: string, patientId: string, messageType: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT opted_in, appointment_reminders, lab_results, billing_notifications, marketing
       FROM patient_sms_preferences
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (!result.rowCount) {
      // No preference record - default to opted in for transactional messages
      return true;
    }

    const prefs = result.rows[0];

    // Must be globally opted in
    if (!prefs.opted_in) return false;

    // Check specific category
    switch (messageType) {
      case 'appointment_confirmation':
      case 'appointment_reminder':
      case 'appointment_cancelled':
        return prefs.appointment_reminders !== false;
      case 'lab_results':
        return prefs.lab_results !== false;
      case 'balance_due':
        return prefs.billing_notifications !== false;
      case 'followup_reminder':
      case 'recall_reminder':
        return prefs.marketing !== false;
      default:
        return true; // Allow other transactional messages
    }
  }

  /**
   * Get patient contact info
   */
  private async getPatientInfo(tenantId: string, patientId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT id, first_name, last_name, phone, email
       FROM patients
       WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Replace template variables
   */
  private replaceTemplateVars(template: string, variables: Record<string, string>): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value || '');
    });
    return result;
  }

  /**
   * Send workflow SMS
   */
  async sendWorkflowSMS(params: SendWorkflowSMSParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { tenantId, patientId, template, variables, messageType, relatedEntityType, relatedEntityId } = params;

    try {
      // 1. Get tenant SMS config
      const config = await this.getTenantSMSConfig(tenantId);
      if (!config || !config.twilioAccountSid || !config.twilioAuthToken || !config.twilioPhoneNumber) {
        logger.debug('SMS not configured for tenant', { tenantId });
        return { success: false, error: 'SMS not configured' };
      }

      // 2. Check patient opt-in
      const optedIn = await this.isPatientOptedIn(tenantId, patientId, messageType);
      if (!optedIn) {
        logger.debug('Patient opted out of SMS', { patientId, messageType });
        return { success: false, error: 'Patient opted out' };
      }

      // 3. Get patient info
      const patient = await this.getPatientInfo(tenantId, patientId);
      if (!patient || !patient.phone) {
        logger.debug('Patient has no phone number', { patientId });
        return { success: false, error: 'No phone number' };
      }

      // 4. Format phone number
      const patientPhone = formatPhoneE164(patient.phone);
      if (!patientPhone) {
        logger.debug('Invalid patient phone number', { patientId, phone: patient.phone });
        return { success: false, error: 'Invalid phone number' };
      }

      // 5. Build message with template variables
      const allVariables = {
        ...variables,
        patientName: patient.first_name,
        clinicName: config.clinicName || 'Our Clinic',
        clinicPhone: config.clinicPhone || '',
        portalUrl: config.portalUrl || '',
      };
      const messageBody = this.replaceTemplateVars(template, allVariables);

      // 6. Create Twilio service and send
      const twilioService = createTwilioService(config.twilioAccountSid!, config.twilioAuthToken!);
      const result = await twilioService.sendSMS({
        to: patientPhone,
        from: config.twilioPhoneNumber!,
        body: messageBody,
      });

      // 7. Log the message
      const messageId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_messages
         (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
          patient_id, message_body, status, message_type, related_appointment_id,
          sent_at, segment_count, created_at)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, $10, NOW(), $11, NOW())`,
        [
          messageId,
          tenantId,
          result.sid,
          config.twilioPhoneNumber,
          patientPhone,
          patientId,
          messageBody,
          result.status,
          messageType,
          relatedEntityType === 'appointment' ? relatedEntityId : null,
          result.numSegments,
        ]
      );

      logger.info('Workflow SMS sent', {
        messageId,
        patientId,
        messageType,
        twilioSid: result.sid,
      });

      return { success: true, messageId };
    } catch (error: any) {
      logger.error('Failed to send workflow SMS', {
        error: error.message,
        tenantId,
        patientId,
        messageType,
      });
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // APPOINTMENT SMS METHODS
  // ============================================

  /**
   * Send appointment confirmation SMS
   */
  async sendAppointmentConfirmation(
    tenantId: string,
    appointmentId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Get appointment details
    const apptResult = await pool.query(
      `SELECT a.id, a.patient_id, a.start_time,
              p.first_name, p.last_name, p.phone,
              pr.full_name as provider_name,
              l.name as location_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (!apptResult.rowCount) {
      return { success: false, error: 'Appointment not found' };
    }

    const appt = apptResult.rows[0];
    const appointmentDate = new Date(appt.start_time);

    return this.sendWorkflowSMS({
      tenantId,
      patientId: appt.patient_id,
      template: SMS_TEMPLATES.APPOINTMENT_CONFIRMATION,
      variables: {
        providerName: appt.provider_name,
        appointmentDate: appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        appointmentTime: appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      },
      messageType: 'appointment_confirmation',
      relatedEntityType: 'appointment',
      relatedEntityId: appointmentId,
    });
  }

  /**
   * Send appointment reminder SMS (24h or 2h before)
   */
  async sendAppointmentReminder(
    tenantId: string,
    appointmentId: string,
    reminderType: '24h' | '2h'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Get appointment details
    const apptResult = await pool.query(
      `SELECT a.id, a.patient_id, a.start_time,
              p.first_name, p.last_name, p.phone,
              pr.full_name as provider_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (!apptResult.rowCount) {
      return { success: false, error: 'Appointment not found' };
    }

    const appt = apptResult.rows[0];
    const appointmentDate = new Date(appt.start_time);

    const template = reminderType === '24h'
      ? SMS_TEMPLATES.APPOINTMENT_REMINDER_24H
      : SMS_TEMPLATES.APPOINTMENT_REMINDER_2H;

    const result = await this.sendWorkflowSMS({
      tenantId,
      patientId: appt.patient_id,
      template,
      variables: {
        providerName: appt.provider_name,
        appointmentDate: appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        appointmentTime: appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      },
      messageType: 'appointment_reminder',
      relatedEntityType: 'appointment',
      relatedEntityId: appointmentId,
    });

    // Update scheduled_reminders table if exists
    if (result.success) {
      await pool.query(
        `UPDATE scheduled_reminders
         SET status = 'sent', sent_at = NOW()
         WHERE appointment_id = $1 AND reminder_type = $2 AND tenant_id = $3`,
        [appointmentId, reminderType, tenantId]
      );
    }

    return result;
  }

  /**
   * Send appointment cancelled SMS
   */
  async sendAppointmentCancelled(
    tenantId: string,
    appointmentId: string,
    appointmentDate: Date,
    providerName: string,
    patientId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.APPOINTMENT_CANCELLED,
      variables: {
        providerName,
        appointmentDate: appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        appointmentTime: appointmentDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      },
      messageType: 'appointment_cancelled',
      relatedEntityType: 'appointment',
      relatedEntityId: appointmentId,
    });
  }

  // ============================================
  // FOLLOW-UP & RECALL SMS METHODS
  // ============================================

  /**
   * Send follow-up reminder SMS
   */
  async sendFollowUpReminder(
    tenantId: string,
    patientId: string,
    followUpType: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.FOLLOWUP_REMINDER,
      variables: {},
      messageType: 'followup_reminder',
    });
  }

  /**
   * Send recall reminder SMS
   */
  async sendRecallReminder(
    tenantId: string,
    patientId: string,
    recallType: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const recallTypeDisplay = recallType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.RECALL_REMINDER,
      variables: {
        recallType: recallTypeDisplay,
      },
      messageType: 'recall_reminder',
    });
  }

  // ============================================
  // CLINICAL SMS METHODS
  // ============================================

  /**
   * Send lab results ready SMS
   */
  async sendLabResultsReady(
    tenantId: string,
    patientId: string,
    resultId: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.LAB_RESULTS_READY,
      variables: {},
      messageType: 'lab_results',
      relatedEntityType: 'lab_result',
      relatedEntityId: resultId,
    });
  }

  /**
   * Send prescription sent SMS
   */
  async sendPrescriptionSent(
    tenantId: string,
    patientId: string,
    prescriptionId: string,
    pharmacyName: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.PRESCRIPTION_SENT,
      variables: {
        pharmacyName,
      },
      messageType: 'prescription_sent',
      relatedEntityType: 'prescription',
      relatedEntityId: prescriptionId,
    });
  }

  // ============================================
  // PRIOR AUTH SMS METHODS
  // ============================================

  /**
   * Send prior auth approved SMS
   */
  async sendPriorAuthApproved(
    tenantId: string,
    patientId: string,
    priorAuthId: string,
    itemName: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.PRIOR_AUTH_APPROVED,
      variables: {
        itemName,
      },
      messageType: 'prior_auth_approved',
      relatedEntityType: 'prior_auth',
      relatedEntityId: priorAuthId,
    });
  }

  /**
   * Send prior auth denied SMS
   */
  async sendPriorAuthDenied(
    tenantId: string,
    patientId: string,
    priorAuthId: string,
    itemName: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.PRIOR_AUTH_DENIED,
      variables: {
        itemName,
      },
      messageType: 'prior_auth_denied',
      relatedEntityType: 'prior_auth',
      relatedEntityId: priorAuthId,
    });
  }

  // ============================================
  // BILLING SMS METHODS
  // ============================================

  /**
   * Send balance due SMS
   */
  async sendBalanceDue(
    tenantId: string,
    patientId: string,
    balanceAmount: number,
    statementId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendWorkflowSMS({
      tenantId,
      patientId,
      template: SMS_TEMPLATES.BALANCE_DUE,
      variables: {
        balanceAmount: balanceAmount.toFixed(2),
      },
      messageType: 'balance_due',
      relatedEntityType: statementId ? 'statement' : undefined,
      relatedEntityId: statementId,
    });
  }
}

// Export singleton instance
export const smsWorkflowService = new SMSWorkflowService();

// ============================================
// SCHEDULED REMINDER PROCESSOR
// ============================================

/**
 * Process scheduled reminders - run this as a cron job
 */
export async function processScheduledReminders(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  logger.info('Processing scheduled SMS reminders');

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get reminders that are due
    const remindersResult = await pool.query(
      `SELECT sr.id, sr.tenant_id, sr.appointment_id, sr.reminder_type,
              a.patient_id, a.status as appointment_status
       FROM scheduled_reminders sr
       JOIN appointments a ON a.id = sr.appointment_id
       WHERE sr.status = 'scheduled'
         AND sr.scheduled_time <= NOW()
         AND sr.scheduled_time >= NOW() - INTERVAL '1 hour'
       ORDER BY sr.scheduled_time
       LIMIT 100`
    );

    for (const reminder of remindersResult.rows) {
      try {
        // Skip if appointment was cancelled
        if (reminder.appointment_status === 'cancelled') {
          await pool.query(
            `UPDATE scheduled_reminders SET status = 'cancelled' WHERE id = $1`,
            [reminder.id]
          );
          skipped++;
          continue;
        }

        // Send reminder
        const result = await smsWorkflowService.sendAppointmentReminder(
          reminder.tenant_id,
          reminder.appointment_id,
          reminder.reminder_type
        );

        if (result.success) {
          sent++;
        } else {
          // Mark as failed
          await pool.query(
            `UPDATE scheduled_reminders SET status = 'failed', error_message = $1 WHERE id = $2`,
            [result.error, reminder.id]
          );
          failed++;
        }
      } catch (error: any) {
        logger.error('Error processing reminder', {
          reminderId: reminder.id,
          error: error.message,
        });
        failed++;
      }
    }

    logger.info('Scheduled reminders processed', { sent, failed, skipped });
    return { sent, failed, skipped };
  } catch (error: any) {
    logger.error('Error in scheduled reminder processor', { error: error.message });
    throw error;
  }
}

/**
 * Process follow-up and recall reminders
 */
export async function processFollowUpReminders(): Promise<{
  sent: number;
  failed: number;
}> {
  logger.info('Processing follow-up reminders');

  let sent = 0;
  let failed = 0;

  try {
    // Get follow-ups that are due for contact
    const followUpsResult = await pool.query(
      `SELECT fq.id, fq.tenant_id, fq.patient_id, fq.follow_up_type,
              fq.contact_attempts, fq.source_appointment_id
       FROM follow_up_queue fq
       WHERE fq.status = 'pending'
         AND fq.target_date <= CURRENT_DATE + INTERVAL '7 days'
         AND fq.contact_attempts < 3
         AND (fq.last_contacted_at IS NULL OR fq.last_contacted_at < NOW() - INTERVAL '3 days')
       ORDER BY fq.target_date
       LIMIT 50`
    );

    for (const followUp of followUpsResult.rows) {
      try {
        const result = await smsWorkflowService.sendFollowUpReminder(
          followUp.tenant_id,
          followUp.patient_id,
          followUp.follow_up_type
        );

        // Update contact attempt
        await pool.query(
          `UPDATE follow_up_queue
           SET contact_attempts = contact_attempts + 1,
               last_contacted_at = NOW(),
               status = CASE WHEN contact_attempts >= 2 THEN 'contacted' ELSE status END
           WHERE id = $1`,
          [followUp.id]
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      } catch (error: any) {
        logger.error('Error sending follow-up reminder', {
          followUpId: followUp.id,
          error: error.message,
        });
        failed++;
      }
    }

    // Process recalls
    const recallsResult = await pool.query(
      `SELECT rq.id, rq.tenant_id, rq.patient_id, rq.recall_type,
              rq.contact_attempts
       FROM recall_queue rq
       WHERE rq.status = 'pending'
         AND rq.due_date <= CURRENT_DATE + INTERVAL '14 days'
         AND rq.contact_attempts < 3
         AND (rq.last_contacted_at IS NULL OR rq.last_contacted_at < NOW() - INTERVAL '7 days')
       ORDER BY rq.due_date
       LIMIT 50`
    );

    for (const recall of recallsResult.rows) {
      try {
        const result = await smsWorkflowService.sendRecallReminder(
          recall.tenant_id,
          recall.patient_id,
          recall.recall_type
        );

        // Update contact attempt
        await pool.query(
          `UPDATE recall_queue
           SET contact_attempts = contact_attempts + 1,
               last_contacted_at = NOW(),
               status = CASE WHEN contact_attempts >= 2 THEN 'contacted' ELSE status END
           WHERE id = $1`,
          [recall.id]
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      } catch (error: any) {
        logger.error('Error sending recall reminder', {
          recallId: recall.id,
          error: error.message,
        });
        failed++;
      }
    }

    logger.info('Follow-up reminders processed', { sent, failed });
    return { sent, failed };
  } catch (error: any) {
    logger.error('Error in follow-up reminder processor', { error: error.message });
    throw error;
  }
}
