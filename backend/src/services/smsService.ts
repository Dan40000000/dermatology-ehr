/**
 * SMS Service
 * Core service for two-way patient SMS/texting functionality
 * Provides high-level API for sending, receiving, and managing SMS communications
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { createTwilioService, TwilioService } from './twilioService';
import { formatPhoneE164, formatPhoneDisplay } from '../utils/phone';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SMSConversation {
  id: string;
  patientId: string;
  phoneNumber: string;
  status: 'active' | 'archived' | 'blocked';
  lastMessageAt: Date | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  patientName?: string;
  patientMrn?: string;
}

export interface SMSMessage {
  id: string;
  conversationId: string | null;
  direction: 'inbound' | 'outbound';
  messageBody: string;
  status: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  sentByUserId: string | null;
  templateId: string | null;
  createdAt: Date;
}

export interface SMSTemplate {
  id: string;
  name: string;
  description: string | null;
  messageBody: string;
  category: string;
  variables: string[];
  isSystemTemplate: boolean;
  isActive: boolean;
  usageCount: number;
  shortcutKey: string | null;
}

export interface SendSMSOptions {
  patientId: string;
  message: string;
  templateId?: string;
  userId?: string;
  messageType?: 'notification' | 'conversation' | 'confirmation' | 'reminder';
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  twilioSid?: string;
  error?: string;
}

export interface SMSProviderConfig {
  providerName: 'twilio' | 'bandwidth' | 'vonage' | 'mock';
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  webhookUrl?: string;
  isActive: boolean;
}

// ============================================================================
// SMS SERVICE CLASS
// ============================================================================

export class SMSService {
  private tenantId: string;
  private twilioService: TwilioService | null = null;
  private fromNumber: string | null = null;
  private isInitialized: boolean = false;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Initialize the SMS service with provider credentials
   */
  async initialize(): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT
          twilio_account_sid,
          twilio_auth_token,
          twilio_phone_number,
          is_active
         FROM sms_settings
         WHERE tenant_id = $1`,
        [this.tenantId]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        logger.warn('SMS not configured or not active for tenant', { tenantId: this.tenantId });
        return false;
      }

      const settings = result.rows[0];

      if (!settings.twilio_account_sid || !settings.twilio_auth_token) {
        logger.warn('Twilio credentials not configured', { tenantId: this.tenantId });
        return false;
      }

      this.twilioService = createTwilioService(
        settings.twilio_account_sid,
        settings.twilio_auth_token
      );
      this.fromNumber = settings.twilio_phone_number;
      this.isInitialized = true;

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize SMS service', {
        error: errorMessage,
        tenantId: this.tenantId
      });
      return false;
    }
  }

  /**
   * Send SMS to a patient
   */
  async sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.twilioService || !this.fromNumber) {
      return { success: false, error: 'SMS service not initialized' };
    }

    const { patientId, message, templateId, userId, messageType = 'conversation' } = options;

    try {
      // Get patient phone number
      const patientResult = await pool.query(
        `SELECT id, phone, first_name, last_name FROM patients
         WHERE id = $1 AND tenant_id = $2`,
        [patientId, this.tenantId]
      );

      if (patientResult.rows.length === 0) {
        return { success: false, error: 'Patient not found' };
      }

      const patient = patientResult.rows[0];

      if (!patient.phone) {
        return { success: false, error: 'Patient has no phone number' };
      }

      // Check opt-out status
      const optOutResult = await pool.query(
        `SELECT is_active FROM sms_opt_out
         WHERE tenant_id = $1 AND phone_number = $2 AND is_active = true`,
        [this.tenantId, formatPhoneE164(patient.phone)]
      );

      if (optOutResult.rows.length > 0) {
        return { success: false, error: 'Patient has opted out of SMS' };
      }

      // Check patient preferences
      const prefsResult = await pool.query(
        `SELECT opted_in FROM patient_sms_preferences
         WHERE tenant_id = $1 AND patient_id = $2`,
        [this.tenantId, patientId]
      );

      if (prefsResult.rows.length > 0 && !prefsResult.rows[0].opted_in) {
        return { success: false, error: 'Patient has opted out of SMS' };
      }

      // Send the SMS
      const result = await this.twilioService.sendSMS({
        to: patient.phone,
        from: this.fromNumber,
        body: message,
      });

      // Log the message
      const messageId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_messages
         (id, tenant_id, twilio_message_sid, direction, from_number, to_number,
          patient_id, message_body, status, message_type, sent_at, segment_count,
          sent_by_user_id, template_id)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12)`,
        [
          messageId,
          this.tenantId,
          result.sid,
          this.fromNumber,
          formatPhoneE164(patient.phone),
          patientId,
          message,
          result.status,
          messageType,
          result.numSegments,
          userId || null,
          templateId || null,
        ]
      );

      // Update template usage
      if (templateId) {
        await pool.query(
          `UPDATE sms_message_templates
           SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2`,
          [templateId, this.tenantId]
        );
      }

      logger.info('SMS sent successfully', {
        messageId,
        patientId,
        tenantId: this.tenantId,
      });

      return {
        success: true,
        messageId,
        twilioSid: result.sid,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send SMS', {
        error: errorMessage,
        patientId,
        tenantId: this.tenantId,
      });

      return { success: false, error: `Failed to send SMS: ${errorMessage}` };
    }
  }

  /**
   * Process incoming SMS
   */
  async receiveInbound(fromNumber: string, messageBody: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const formattedPhone = formatPhoneE164(fromNumber);
      if (!formattedPhone) {
        return { success: false, error: 'Invalid phone number' };
      }

      // Find patient by phone number
      const patientResult = await pool.query(
        `SELECT id, first_name, last_name FROM patients
         WHERE tenant_id = $1 AND phone = $2
         LIMIT 1`,
        [this.tenantId, formattedPhone]
      );

      const patient = patientResult.rows[0];

      // Log the message
      const messageId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO sms_messages
         (id, tenant_id, direction, from_number, to_number, patient_id,
          message_body, status, message_type, created_at)
         VALUES ($1, $2, 'inbound', $3, $4, $5, $6, 'received', 'conversation', CURRENT_TIMESTAMP)`,
        [
          messageId,
          this.tenantId,
          formattedPhone,
          this.fromNumber || '',
          patient?.id || null,
          messageBody,
        ]
      );

      logger.info('Inbound SMS received', {
        messageId,
        patientId: patient?.id,
        tenantId: this.tenantId,
      });

      return { success: true, messageId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process inbound SMS', {
        error: errorMessage,
        fromNumber,
        tenantId: this.tenantId,
      });

      return { success: false, error: `Failed to process inbound SMS: ${errorMessage}` };
    }
  }

  /**
   * Get conversation history for a patient
   */
  async getConversation(patientId: string): Promise<{ conversation: SMSConversation | null; messages: SMSMessage[] }> {
    try {
      // Get conversation
      const conversationResult = await pool.query(
        `SELECT
          c.id,
          c.patient_id as "patientId",
          c.phone_number as "phoneNumber",
          c.status,
          c.last_message_at as "lastMessageAt",
          c.last_message_direction as "lastMessageDirection",
          c.last_message_preview as "lastMessagePreview",
          c.unread_count as "unreadCount",
          p.first_name || ' ' || p.last_name as "patientName",
          p.mrn as "patientMrn"
         FROM sms_conversations c
         JOIN patients p ON p.id = c.patient_id
         WHERE c.tenant_id = $1 AND c.patient_id = $2`,
        [this.tenantId, patientId]
      );

      const conversation = conversationResult.rows[0] || null;

      // Get messages
      const messagesResult = await pool.query(
        `SELECT
          id,
          conversation_id as "conversationId",
          direction,
          message_body as "messageBody",
          status,
          sent_at as "sentAt",
          delivered_at as "deliveredAt",
          sent_by_user_id as "sentByUserId",
          template_id as "templateId",
          created_at as "createdAt"
         FROM sms_messages
         WHERE tenant_id = $1 AND patient_id = $2
         ORDER BY created_at ASC`,
        [this.tenantId, patientId]
      );

      return {
        conversation,
        messages: messagesResult.rows,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get conversation', {
        error: errorMessage,
        patientId,
        tenantId: this.tenantId,
      });

      return { conversation: null, messages: [] };
    }
  }

  /**
   * Send appointment reminder
   */
  async sendAppointmentReminder(appointmentId: string, reminderType: '24h' | '2h' = '24h'): Promise<SendSMSResult> {
    try {
      // Get appointment details
      const appointmentResult = await pool.query(
        `SELECT
          a.id,
          a.patient_id,
          a.provider_id,
          a.start_time,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.phone as patient_phone,
          u.full_name as provider_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = a.provider_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, this.tenantId]
      );

      if (appointmentResult.rows.length === 0) {
        return { success: false, error: 'Appointment not found' };
      }

      const appt = appointmentResult.rows[0];

      if (!appt.patient_phone) {
        return { success: false, error: 'Patient has no phone number' };
      }

      // Get appropriate template
      const templateName = reminderType === '24h' ? 'Appointment Reminder 24hr' : 'Appointment Reminder 2hr';
      const templateResult = await pool.query(
        `SELECT id, message_body FROM sms_message_templates
         WHERE tenant_id = $1 AND name = $2 AND is_active = true
         LIMIT 1`,
        [this.tenantId, templateName]
      );

      // Get clinic info
      const clinicResult = await pool.query(
        `SELECT phone FROM sms_settings WHERE tenant_id = $1`,
        [this.tenantId]
      );

      const clinicPhone = clinicResult.rows[0]?.twilio_phone_number || '(555) 123-4567';

      // Format the message
      const appointmentDate = new Date(appt.start_time);
      const dateStr = appointmentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = appointmentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      let messageBody: string;
      if (templateResult.rows.length > 0) {
        messageBody = templateResult.rows[0].message_body
          .replace(/{firstName}/g, appt.patient_first_name)
          .replace(/{lastName}/g, appt.patient_last_name)
          .replace(/{patientName}/g, `${appt.patient_first_name} ${appt.patient_last_name}`)
          .replace(/{providerName}/g, appt.provider_name || 'your provider')
          .replace(/{appointmentDate}/g, dateStr)
          .replace(/{appointmentTime}/g, timeStr)
          .replace(/{clinicPhone}/g, formatPhoneDisplay(clinicPhone) || clinicPhone);
      } else {
        messageBody = reminderType === '24h'
          ? `Hi ${appt.patient_first_name}, reminder: Your appointment is tomorrow at ${timeStr} with ${appt.provider_name || 'your provider'}. Reply C to confirm.`
          : `Hi ${appt.patient_first_name}, your appointment is in 2 hours at ${timeStr}. We look forward to seeing you!`;
      }

      // Send the reminder
      return this.sendSMS({
        patientId: appt.patient_id,
        message: messageBody,
        templateId: templateResult.rows[0]?.id,
        messageType: 'reminder',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send appointment reminder', {
        error: errorMessage,
        appointmentId,
        tenantId: this.tenantId,
      });

      return { success: false, error: `Failed to send reminder: ${errorMessage}` };
    }
  }

  /**
   * Send "running late" notice to patient
   */
  async sendRunningLateNotice(appointmentId: string, minutes: number): Promise<SendSMSResult> {
    try {
      // Get appointment details
      const appointmentResult = await pool.query(
        `SELECT
          a.id,
          a.patient_id,
          a.provider_id,
          p.first_name as patient_first_name,
          p.phone as patient_phone,
          u.full_name as provider_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = a.provider_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, this.tenantId]
      );

      if (appointmentResult.rows.length === 0) {
        return { success: false, error: 'Appointment not found' };
      }

      const appt = appointmentResult.rows[0];

      if (!appt.patient_phone) {
        return { success: false, error: 'Patient has no phone number' };
      }

      // Get template
      const templateResult = await pool.query(
        `SELECT id, message_body FROM sms_message_templates
         WHERE tenant_id = $1 AND name = 'Running Late Notice' AND is_active = true
         LIMIT 1`,
        [this.tenantId]
      );

      // Get clinic phone
      const clinicResult = await pool.query(
        `SELECT twilio_phone_number FROM sms_settings WHERE tenant_id = $1`,
        [this.tenantId]
      );

      const clinicPhone = clinicResult.rows[0]?.twilio_phone_number || '(555) 123-4567';

      let messageBody: string;
      if (templateResult.rows.length > 0) {
        messageBody = templateResult.rows[0].message_body
          .replace(/{firstName}/g, appt.patient_first_name)
          .replace(/{providerName}/g, appt.provider_name || 'Your provider')
          .replace(/{minutes}/g, String(minutes))
          .replace(/{clinicPhone}/g, formatPhoneDisplay(clinicPhone) || clinicPhone);
      } else {
        messageBody = `Hi ${appt.patient_first_name}, we apologize - ${appt.provider_name || 'your provider'} is running approximately ${minutes} minutes behind schedule. Thank you for your patience.`;
      }

      return this.sendSMS({
        patientId: appt.patient_id,
        message: messageBody,
        templateId: templateResult.rows[0]?.id,
        messageType: 'notification',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send running late notice', {
        error: errorMessage,
        appointmentId,
        minutes,
        tenantId: this.tenantId,
      });

      return { success: false, error: `Failed to send notice: ${errorMessage}` };
    }
  }

  /**
   * Get all conversations for the inbox
   */
  async getAllConversations(options?: {
    status?: 'active' | 'archived' | 'blocked';
    limit?: number;
    offset?: number;
  }): Promise<SMSConversation[]> {
    try {
      const { status, limit = 50, offset = 0 } = options || {};

      let query = `
        SELECT
          c.id,
          c.patient_id as "patientId",
          c.phone_number as "phoneNumber",
          c.status,
          c.last_message_at as "lastMessageAt",
          c.last_message_direction as "lastMessageDirection",
          c.last_message_preview as "lastMessagePreview",
          c.unread_count as "unreadCount",
          p.first_name || ' ' || p.last_name as "patientName",
          p.mrn as "patientMrn"
         FROM sms_conversations c
         JOIN patients p ON p.id = c.patient_id
         WHERE c.tenant_id = $1
      `;

      const params: (string | number)[] = [this.tenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND c.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY c.last_message_at DESC NULLS LAST`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get conversations', {
        error: errorMessage,
        tenantId: this.tenantId,
      });

      return [];
    }
  }

  /**
   * Mark conversation as read
   */
  async markConversationRead(patientId: string, userId: string): Promise<boolean> {
    try {
      await pool.query(
        `UPDATE sms_conversations
         SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP, last_read_by = $1
         WHERE tenant_id = $2 AND patient_id = $3`,
        [userId, this.tenantId, patientId]
      );

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to mark conversation read', {
        error: errorMessage,
        patientId,
        tenantId: this.tenantId,
      });

      return false;
    }
  }

  /**
   * Get all templates
   */
  async getTemplates(category?: string): Promise<SMSTemplate[]> {
    try {
      let query = `
        SELECT
          id,
          name,
          description,
          message_body as "messageBody",
          category,
          variables,
          is_system_template as "isSystemTemplate",
          is_active as "isActive",
          usage_count as "usageCount",
          shortcut_key as "shortcutKey"
         FROM sms_message_templates
         WHERE tenant_id = $1 AND is_active = true
      `;

      const params: string[] = [this.tenantId];

      if (category) {
        query += ` AND category = $2`;
        params.push(category);
      }

      query += ` ORDER BY category, usage_count DESC, name`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get templates', {
        error: errorMessage,
        tenantId: this.tenantId,
      });

      return [];
    }
  }

  /**
   * Opt out a patient from SMS
   */
  async optOutPatient(patientId: string, reason?: string): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get patient phone
      const patientResult = await client.query(
        `SELECT phone FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, this.tenantId]
      );

      if (patientResult.rows.length === 0 || !patientResult.rows[0].phone) {
        await client.query('ROLLBACK');
        return false;
      }

      const phoneNumber = formatPhoneE164(patientResult.rows[0].phone);
      if (!phoneNumber) {
        await client.query('ROLLBACK');
        return false;
      }

      // Add to opt-out table
      await client.query(
        `INSERT INTO sms_opt_out (tenant_id, phone_number, patient_id, reason, opted_out_via)
         VALUES ($1, $2, $3, $4, 'staff')
         ON CONFLICT (tenant_id, phone_number) DO UPDATE SET
           is_active = true,
           opted_out_at = CURRENT_TIMESTAMP,
           reason = $4,
           opted_in_at = NULL`,
        [this.tenantId, phoneNumber, patientId, reason || 'Staff action']
      );

      // Update patient preferences
      await client.query(
        `INSERT INTO patient_sms_preferences (tenant_id, patient_id, opted_in, opted_out_at, opted_out_via)
         VALUES ($1, $2, false, CURRENT_TIMESTAMP, 'staff')
         ON CONFLICT (tenant_id, patient_id) DO UPDATE SET
           opted_in = false,
           opted_out_at = CURRENT_TIMESTAMP,
           opted_out_via = 'staff',
           updated_at = CURRENT_TIMESTAMP`,
        [this.tenantId, patientId]
      );

      await client.query('COMMIT');

      logger.info('Patient opted out of SMS', {
        patientId,
        tenantId: this.tenantId,
      });

      return true;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to opt out patient', {
        error: errorMessage,
        patientId,
        tenantId: this.tenantId,
      });

      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get unread count across all conversations
   */
  async getTotalUnreadCount(): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COALESCE(SUM(unread_count), 0) as total
         FROM sms_conversations
         WHERE tenant_id = $1 AND status = 'active'`,
        [this.tenantId]
      );

      return parseInt(result.rows[0]?.total || '0', 10);
    } catch (error: unknown) {
      logger.error('Failed to get total unread count', {
        tenantId: this.tenantId,
      });

      return 0;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an SMS service instance for a tenant
 */
export function createSMSService(tenantId: string): SMSService {
  return new SMSService(tenantId);
}

// ============================================================================
// MOCK PROVIDER FOR TESTING
// ============================================================================

export class MockSMSProvider {
  private messages: Array<{ to: string; from: string; body: string; sid: string }> = [];

  async sendSMS(params: { to: string; from: string; body: string }): Promise<{ sid: string; status: string; numSegments: number }> {
    const sid = `MOCK_${crypto.randomUUID().substring(0, 8)}`;
    this.messages.push({ ...params, sid });

    logger.info('Mock SMS sent', { to: params.to, sid });

    return {
      sid,
      status: 'sent',
      numSegments: Math.ceil(params.body.length / 160),
    };
  }

  getMessages(): Array<{ to: string; from: string; body: string; sid: string }> {
    return this.messages;
  }

  clearMessages(): void {
    this.messages = [];
  }
}
