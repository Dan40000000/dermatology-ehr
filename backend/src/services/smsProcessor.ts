/**
 * SMS Processor Service
 * Handles incoming SMS messages, keyword matching, auto-responses, and conversation threading
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { formatPhoneE164 } from '../utils/phone';
import { TwilioService } from './twilioService';
import { auditLog } from './audit';
import { processWaitlistSMSReply } from './waitlistNotificationService';
import crypto from 'crypto';

export interface IncomingSMSParams {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia?: number;
  mediaUrls?: string[];
  tenantId: string;
}

export interface ProcessSMSResult {
  success: boolean;
  messageId: string;
  autoResponseSent?: boolean;
  autoResponseText?: string;
  actionPerformed?: string;
  error?: string;
}

/**
 * Process an incoming SMS message
 */
export async function processIncomingSMS(
  params: IncomingSMSParams,
  twilioService: TwilioService
): Promise<ProcessSMSResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Format phone numbers
    const fromPhone = formatPhoneE164(params.from);
    const toPhone = formatPhoneE164(params.to);

    if (!fromPhone || !toPhone) {
      throw new Error('Invalid phone numbers');
    }

    logger.info('Processing incoming SMS', {
      from: fromPhone,
      to: toPhone,
      bodyLength: params.body.length,
      tenantId: params.tenantId,
    });

    // 1. Find patient by phone number
    const patient = await findPatientByPhone(params.tenantId, fromPhone, client);

    if (!patient) {
      logger.warn('Incoming SMS from unknown number', {
        from: fromPhone,
        tenantId: params.tenantId,
      });
      // Still log the message but mark as unmatched
    }

    // 2. Check for waitlist confirmation (YES/NO replies)
    if (patient) {
      const waitlistReply = await processWaitlistSMSReply(
        params.tenantId,
        fromPhone,
        params.body
      );

      if (waitlistReply.matched) {
        // Log the message
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'waitlist_confirmation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        // Send confirmation message
        try {
          let confirmationMessage = '';
          if (waitlistReply.action === 'accepted') {
            confirmationMessage = `Thank you for confirming! We'll contact you shortly to finalize your appointment. If you have questions, please call our office.`;
          } else if (waitlistReply.action === 'declined') {
            confirmationMessage = `Thanks for letting us know. We'll keep you on the waitlist and notify you of other available appointments.`;
          }

          if (confirmationMessage) {
            const response = await twilioService.sendSMS({
              to: fromPhone,
              from: toPhone,
              body: confirmationMessage,
            });

            // Log outgoing confirmation
            await logSMSMessage(
              {
                tenantId: params.tenantId,
                twilioSid: response.sid,
                direction: 'outbound',
                from: toPhone,
                to: fromPhone,
                body: confirmationMessage,
                status: response.status,
                messageType: 'auto_response',
                patientId: patient.id,
                inResponseTo: messageId,
              },
              client
            );
          }
        } catch (error: any) {
          logger.error('Failed to send waitlist confirmation message', {
            error: error.message,
            patientId: patient.id,
          });
        }

        await client.query('COMMIT');

        return {
          success: true,
          messageId,
          autoResponseSent: true,
          actionPerformed: `waitlist_${waitlistReply.action}`,
        };
      }
    }

    // 3. Check if patient has opted out
    if (patient) {
      const optedOut = await isPatientOptedOut(params.tenantId, patient.id, client);
      if (optedOut) {
        logger.info('SMS from opted-out patient', {
          patientId: patient.id,
          from: fromPhone,
        });
        // Don't process further, but log the message
        const messageId = await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: params.messageSid,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            body: params.body,
            status: 'received',
            messageType: 'conversation',
            patientId: patient.id,
            mediaUrls: params.mediaUrls,
          },
          client
        );

        await client.query('COMMIT');
        return { success: true, messageId };
      }
    }

    // 4. Check for keyword auto-responses
    const keyword = extractKeyword(params.body);
    const autoResponse = await findAutoResponse(params.tenantId, keyword, client);

    let autoResponseSent = false;
    let actionPerformed: string | undefined;

    if (autoResponse) {
      logger.info('Keyword matched', {
        keyword: keyword,
        action: autoResponse.action,
        patientId: patient?.id,
      });

      // Execute action based on keyword
      if (patient) {
        actionPerformed = await executeAutoResponseAction(
          params.tenantId,
          autoResponse.action,
          patient.id,
          fromPhone,
          client
        );
      }

      // Log incoming message
      const messageId = await logSMSMessage(
        {
          tenantId: params.tenantId,
          twilioSid: params.messageSid,
          direction: 'inbound',
          from: fromPhone,
          to: toPhone,
          body: params.body,
          status: 'received',
          messageType: 'conversation',
          patientId: patient?.id,
          keywordMatched: keyword,
          mediaUrls: params.mediaUrls,
        },
        client
      );

      // Send auto-reply
      try {
        const response = await twilioService.sendSMS({
          to: fromPhone,
          from: toPhone,
          body: autoResponse.response_text,
        });

        // Log outgoing auto-response
        await logSMSMessage(
          {
            tenantId: params.tenantId,
            twilioSid: response.sid,
            direction: 'outbound',
            from: toPhone,
            to: fromPhone,
            body: autoResponse.response_text,
            status: response.status,
            messageType: 'auto_response',
            patientId: patient?.id,
            inResponseTo: messageId,
          },
          client
        );

        autoResponseSent = true;

        logger.info('Auto-response sent', {
          keyword: keyword,
          action: autoResponse.action,
          patientId: patient?.id,
        });
      } catch (error: any) {
        logger.error('Failed to send auto-response', {
          error: error.message,
          keyword: keyword,
        });
        // Continue even if auto-response fails
      }

      await client.query('COMMIT');

      return {
        success: true,
        messageId,
        autoResponseSent,
        autoResponseText: autoResponse.response_text,
        actionPerformed,
      };
    }

    // 5. No keyword match - create or update message thread
    if (patient) {
      // Find existing open thread or create new one
      const thread = await findOrCreateMessageThread(
        params.tenantId,
        patient.id,
        params.body,
        client
      );

      // Log incoming message
      const messageId = await logSMSMessage(
        {
          tenantId: params.tenantId,
          twilioSid: params.messageSid,
          direction: 'inbound',
          from: fromPhone,
          to: toPhone,
          body: params.body,
          status: 'received',
          messageType: 'conversation',
          patientId: patient.id,
          relatedThreadId: thread.id,
          mediaUrls: params.mediaUrls,
        },
        client
      );

      // Add message to thread
      await addMessageToThread(
        thread.id,
        'patient',
        patient.id,
        `${patient.first_name} ${patient.last_name}`,
        params.body,
        client
      );

      // Mark thread as unread by staff
      await markThreadUnreadByStaff(thread.id, client);

      // Notify staff (in a real system, this would trigger email/push notifications)
      await notifyStaffOfIncomingSMS(params.tenantId, thread.id, patient.id, client);

      await client.query('COMMIT');

      logger.info('SMS added to message thread', {
        threadId: thread.id,
        patientId: patient.id,
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    }

    // 6. Unknown patient - log message but no action
    const messageId = await logSMSMessage(
      {
        tenantId: params.tenantId,
        twilioSid: params.messageSid,
        direction: 'inbound',
        from: fromPhone,
        to: toPhone,
        body: params.body,
        status: 'received',
        messageType: 'conversation',
        mediaUrls: params.mediaUrls,
      },
      client
    );

    await client.query('COMMIT');

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error processing incoming SMS', {
      error: error.message,
      from: params.from,
      tenantId: params.tenantId,
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Find patient by phone number
 */
async function findPatientByPhone(tenantId: string, phoneNumber: string, client: any): Promise<any> {
  const result = await client.query(
    `SELECT id, first_name, last_name, email, phone
     FROM patients
     WHERE tenant_id = $1 AND phone = $2
     LIMIT 1`,
    [tenantId, phoneNumber]
  );

  return result.rows[0] || null;
}

/**
 * Check if patient has opted out of SMS
 */
async function isPatientOptedOut(tenantId: string, patientId: string, client: any): Promise<boolean> {
  const result = await client.query(
    `SELECT opted_in FROM patient_sms_preferences
     WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, patientId]
  );

  if (result.rows.length === 0) {
    return false; // No preference record means opted in by default
  }

  return !result.rows[0].opted_in;
}

/**
 * Extract keyword from message body
 * Returns first word in uppercase
 */
function extractKeyword(messageBody: string): string {
  const trimmed = messageBody.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord.toUpperCase();
}

/**
 * Find auto-response by keyword
 */
async function findAutoResponse(tenantId: string, keyword: string, client: any): Promise<any> {
  const result = await client.query(
    `SELECT * FROM sms_auto_responses
     WHERE tenant_id = $1 AND keyword = $2 AND is_active = true
     ORDER BY priority DESC
     LIMIT 1`,
    [tenantId, keyword]
  );

  return result.rows[0] || null;
}

/**
 * Execute action based on auto-response keyword
 */
async function executeAutoResponseAction(
  tenantId: string,
  action: string,
  patientId: string,
  phoneNumber: string,
  client: any
): Promise<string> {
  switch (action) {
    case 'opt_out':
      await client.query(
        `INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in, opted_out_at, opted_out_via)
         VALUES ($1, $2, false, CURRENT_TIMESTAMP, 'sms')
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET opted_in = false, opted_out_at = CURRENT_TIMESTAMP, opted_out_via = 'sms', updated_at = CURRENT_TIMESTAMP`,
        [tenantId, patientId]
      );
      logger.info('Patient opted out via SMS', { patientId });
      return 'opted_out';

    case 'opt_in':
      await client.query(
        `INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in)
         VALUES ($1, $2, true)
         ON CONFLICT (tenant_id, patient_id)
         DO UPDATE SET opted_in = true, opted_out_at = NULL, updated_at = CURRENT_TIMESTAMP`,
        [tenantId, patientId]
      );
      logger.info('Patient opted in via SMS', { patientId });
      return 'opted_in';

    case 'confirm_appointment':
      // Find most recent upcoming appointment
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'confirmed', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment confirmed via SMS', { patientId });
      return 'appointment_confirmed';

    case 'cancel_appointment':
      // Mark appointment as patient-requested cancellation
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'cancelled', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment cancellation requested via SMS', { patientId });
      return 'appointment_cancel_requested';

    case 'request_reschedule':
      // Mark appointment as reschedule requested
      await client.query(
        `UPDATE appointment_sms_reminders
         SET patient_responded = true, response_type = 'reschedule_requested', response_received_at = CURRENT_TIMESTAMP
         WHERE patient_id = $1 AND status = 'sent'
         AND scheduled_send_time >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
         ORDER BY scheduled_send_time DESC
         LIMIT 1`,
        [patientId]
      );
      logger.info('Appointment reschedule requested via SMS', { patientId });
      return 'appointment_reschedule_requested';

    case 'help':
      return 'help_sent';

    default:
      return 'no_action';
  }
}

/**
 * Find or create message thread for patient
 */
async function findOrCreateMessageThread(
  tenantId: string,
  patientId: string,
  messagePreview: string,
  client: any
): Promise<any> {
  // Look for open thread
  const existingThread = await client.query(
    `SELECT id FROM patient_message_threads
     WHERE tenant_id = $1 AND patient_id = $2 AND status != 'closed'
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (existingThread.rows.length > 0) {
    return existingThread.rows[0];
  }

  // Create new thread
  const threadId = crypto.randomUUID();
  const subject = messagePreview.substring(0, 100); // Use first 100 chars as subject

  await client.query(
    `INSERT INTO patient_message_threads
     (id, tenant_id, patient_id, subject, category, status, created_by_patient, last_message_by, last_message_at)
     VALUES ($1, $2, $3, $4, 'general', 'open', true, 'patient', CURRENT_TIMESTAMP)`,
    [threadId, tenantId, patientId, subject]
  );

  return { id: threadId };
}

/**
 * Add message to thread
 */
async function addMessageToThread(
  threadId: string,
  senderType: string,
  senderId: string,
  senderName: string,
  messageText: string,
  client: any
): Promise<string> {
  const messageId = crypto.randomUUID();

  await client.query(
    `INSERT INTO patient_messages
     (id, thread_id, sender_type, sender_patient_id, sender_name, message_text, delivered_to_patient)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [messageId, threadId, senderType, senderId, senderName, messageText]
  );

  // Update thread last message time
  await client.query(
    `UPDATE patient_message_threads
     SET last_message_at = CURRENT_TIMESTAMP, last_message_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    ['patient', threadId]
  );

  return messageId;
}

/**
 * Mark thread as unread by staff
 */
async function markThreadUnreadByStaff(threadId: string, client: any): Promise<void> {
  await client.query(
    `UPDATE patient_message_threads
     SET is_read_by_staff = false
     WHERE id = $1`,
    [threadId]
  );
}

/**
 * Notify staff of incoming SMS
 */
async function notifyStaffOfIncomingSMS(
  tenantId: string,
  threadId: string,
  patientId: string,
  client: any
): Promise<void> {
  // In production, this would trigger email/push notifications to staff
  // For now, just log it
  logger.info('Staff notification triggered', {
    tenantId,
    threadId,
    patientId,
    type: 'incoming_sms',
  });
}

/**
 * Log SMS message to database
 */
async function logSMSMessage(
  params: {
    tenantId: string;
    twilioSid?: string;
    direction: string;
    from: string;
    to: string;
    body: string;
    status: string;
    messageType: string;
    patientId?: string;
    relatedAppointmentId?: string;
    relatedThreadId?: string;
    inResponseTo?: string;
    keywordMatched?: string;
    mediaUrls?: string[];
  },
  client: any
): Promise<string> {
  const messageId = crypto.randomUUID();

  await client.query(
    `INSERT INTO sms_messages
     (id, tenant_id, twilio_message_sid, direction, from_number, to_number, patient_id,
      message_body, status, message_type, related_appointment_id, related_thread_id,
      in_response_to, keyword_matched, media_urls, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
    [
      messageId,
      params.tenantId,
      params.twilioSid || null,
      params.direction,
      params.from,
      params.to,
      params.patientId || null,
      params.body,
      params.status,
      params.messageType,
      params.relatedAppointmentId || null,
      params.relatedThreadId || null,
      params.inResponseTo || null,
      params.keywordMatched || null,
      params.mediaUrls ? JSON.stringify(params.mediaUrls) : null,
    ]
  );

  return messageId;
}

/**
 * Update SMS message status (called from webhook)
 */
export async function updateSMSStatus(
  twilioSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const updateFields: string[] = ['status = $1'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (status === 'delivered') {
      updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
    } else if (status === 'failed' || status === 'undelivered') {
      updateFields.push(`failed_at = CURRENT_TIMESTAMP`);
    }

    if (errorCode) {
      updateFields.push(`error_code = $${paramIndex}`);
      params.push(errorCode);
      paramIndex++;
    }

    if (errorMessage) {
      updateFields.push(`error_message = $${paramIndex}`);
      params.push(errorMessage);
      paramIndex++;
    }

    params.push(twilioSid);

    await pool.query(
      `UPDATE sms_messages
       SET ${updateFields.join(', ')}
       WHERE twilio_message_sid = $${paramIndex}`,
      params
    );

    logger.info('SMS status updated', {
      twilioSid,
      status,
      errorCode,
    });
  } catch (error: any) {
    logger.error('Failed to update SMS status', {
      error: error.message,
      twilioSid,
      status,
    });
    throw error;
  }
}
