/**
 * Twilio Service for SMS/MMS messaging
 * Handles all Twilio API interactions for sending and receiving text messages
 */

import twilio, { Twilio } from 'twilio';
import { logger } from '../lib/logger';
import { formatPhoneE164, validateAndFormatPhone } from '../utils/phone';

export interface SendSMSParams {
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

export interface SendSMSResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  numSegments: number;
  price?: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface AppointmentReminderParams {
  patientPhone: string;
  patientName: string;
  providerName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicPhone: string;
  template: string;
}

export class TwilioService {
  private client: Twilio;
  private accountSid: string;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are required');
    }

    this.accountSid = accountSid;
    this.authToken = authToken;
    this.client = twilio(accountSid, authToken);
  }

  /**
   * Send an SMS or MMS message
   */
  async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    try {
      // Validate and format phone numbers
      const toPhone = validateAndFormatPhone(params.to);
      const fromPhone = validateAndFormatPhone(params.from);

      logger.info('Sending SMS', {
        to: toPhone,
        from: fromPhone,
        bodyLength: params.body.length,
        hasMedia: !!params.mediaUrls,
      });

      // Send via Twilio
      const message = await this.client.messages.create({
        to: toPhone,
        from: fromPhone,
        body: params.body,
        mediaUrl: params.mediaUrls,
        statusCallback: params.statusCallback,
      });

      logger.info('SMS sent successfully', {
        sid: message.sid,
        status: message.status,
        to: toPhone,
      });

      return {
        sid: message.sid,
        status: message.status,
        to: toPhone,
        from: fromPhone,
        body: params.body,
        numSegments: parseInt(message.numSegments || '1'),
        price: message.price || undefined,
        errorCode: message.errorCode || undefined,
        errorMessage: message.errorMessage || undefined,
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', {
        error: error.message,
        code: error.code,
        status: error.status,
        to: params.to,
      });

      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send appointment reminder with template variables
   */
  async sendAppointmentReminder(
    fromPhone: string,
    params: AppointmentReminderParams,
    statusCallback?: string
  ): Promise<SendSMSResult> {
    // Replace template variables
    const body = this.replaceTemplateVars(params.template, {
      patientName: params.patientName,
      providerName: params.providerName,
      appointmentDate: params.appointmentDate,
      appointmentTime: params.appointmentTime,
      clinicPhone: params.clinicPhone,
    });

    return this.sendSMS({
      to: params.patientPhone,
      from: fromPhone,
      body,
      statusCallback,
    });
  }

  /**
   * Replace template variables in message text
   * Variables: {patientName}, {providerName}, {appointmentDate}, {appointmentTime}, {clinicPhone}
   */
  private replaceTemplateVars(template: string, vars: Record<string, string>): string {
    let result = template;

    Object.entries(vars).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value || '');
    });

    return result;
  }

  /**
   * Validate Twilio webhook signature
   * CRITICAL for security - ensures webhook requests actually come from Twilio
   */
  validateWebhookSignature(signature: string, url: string, params: Record<string, any>): boolean {
    try {
      return twilio.validateRequest(this.authToken, signature, url, params);
    } catch (error: any) {
      logger.error('Webhook signature validation failed', {
        error: error.message,
        url,
      });
      return false;
    }
  }

  /**
   * Get message details from Twilio
   */
  async getMessageDetails(messageSid: string): Promise<any> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        numSegments: message.numSegments,
        price: message.price,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated,
      };
    } catch (error: any) {
      logger.error('Failed to fetch message details', {
        error: error.message,
        messageSid,
      });
      throw error;
    }
  }

  /**
   * Test Twilio connection and credentials
   */
  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      const account = await this.client.api.accounts(this.accountSid).fetch();

      logger.info('Twilio connection test successful', {
        accountSid: this.accountSid,
        accountName: account.friendlyName,
      });

      return {
        success: true,
        accountName: account.friendlyName,
      };
    } catch (error: any) {
      logger.error('Twilio connection test failed', {
        error: error.message,
        code: error.code,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get phone number details
   */
  async getPhoneNumberInfo(phoneNumber: string): Promise<any> {
    try {
      const formattedPhone = validateAndFormatPhone(phoneNumber);
      const number = await this.client.incomingPhoneNumbers.list({
        phoneNumber: formattedPhone,
        limit: 1,
      });

      if (number.length === 0) {
        throw new Error('Phone number not found in Twilio account');
      }

      return {
        phoneNumber: number[0].phoneNumber,
        friendlyName: number[0].friendlyName,
        capabilities: number[0].capabilities,
        smsUrl: number[0].smsUrl,
        statusCallback: number[0].statusCallback,
      };
    } catch (error: any) {
      logger.error('Failed to fetch phone number info', {
        error: error.message,
        phoneNumber,
      });
      throw error;
    }
  }

  /**
   * Calculate SMS segment count (for cost estimation)
   * Standard SMS: 160 characters per segment
   * Unicode SMS: 70 characters per segment
   */
  calculateSegmentCount(messageBody: string): number {
    // Check if message contains unicode characters
    const hasUnicode = /[^\x00-\x7F]/.test(messageBody);

    if (hasUnicode) {
      // Unicode SMS: 70 chars per segment
      return Math.ceil(messageBody.length / 70);
    } else {
      // Standard SMS: 160 chars per segment
      return Math.ceil(messageBody.length / 160);
    }
  }

  /**
   * Estimate SMS cost (US rates)
   * Twilio US SMS: $0.0079 per segment (as of 2024)
   */
  estimateSMSCost(messageBody: string, isInternational: boolean = false): number {
    const segments = this.calculateSegmentCount(messageBody);
    const costPerSegment = isInternational ? 0.02 : 0.0079; // Rough estimates
    return segments * costPerSegment;
  }
}

/**
 * Create a Twilio service instance
 */
export function createTwilioService(accountSid: string, authToken: string): TwilioService {
  return new TwilioService(accountSid, authToken);
}

/**
 * Get Twilio service from environment variables
 */
export function getTwilioServiceFromEnv(): TwilioService {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured in environment');
  }

  return createTwilioService(accountSid, authToken);
}
