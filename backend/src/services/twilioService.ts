/**
 * Twilio Service for SMS/MMS messaging
 * Handles all Twilio API interactions for sending and receiving text messages
 */

import twilio, { Twilio } from 'twilio';
import { logger } from '../lib/logger';
import { formatPhoneE164, validateAndFormatPhone } from '../utils/phone';
import { assertSmsContentSafe, normalizeSmsTemplateForMinimumNecessary } from '../utils/smsPrivacyGuard';

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
  firstName?: string;
  patientName: string;
  providerName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicPhone: string;
  template: string;
}

export interface PlaceVoiceCallParams {
  to: string;
  from: string;
  message: string;
  statusCallback?: string;
}

export interface PlaceVoiceCallResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  direction?: string;
  price?: string;
}

export interface TwilioMessagingServiceCampaign {
  sid: string;
  sidSuffix: string;
  campaignStatus: string;
  campaignId?: string;
  brandRegistrationSid?: string;
  usecase?: string;
  description?: string;
  errors?: any[];
  dateUpdated?: Date;
}

export interface TwilioMessagingServiceSummary {
  sid: string;
  sidSuffix: string;
  friendlyName?: string;
  usecase?: string;
  usAppToPersonRegistered?: boolean;
  inboundRequestUrl?: string | null;
  statusCallback?: string | null;
  includesConfiguredPhone?: boolean;
  phoneNumbers: Array<{
    phoneNumber: string;
    capabilities?: string[];
  }>;
  campaigns: TwilioMessagingServiceCampaign[];
  errors?: string[];
}

export interface TwilioBrandRegistrationSummary {
  sid: string;
  sidSuffix: string;
  status?: string;
  identityStatus?: string;
  brandType?: string;
  failureReason?: string;
  errors?: any[];
  dateUpdated?: Date;
}

export interface TwilioMessagingReadiness {
  services: TwilioMessagingServiceSummary[];
  brandRegistrations: TwilioBrandRegistrationSummary[];
  errors: string[];
}

export class TwilioService {
  private client: Twilio;
  private accountSid: string;
  private authToken: string;
  private messagingServiceSid?: string;

  constructor(accountSid: string, authToken: string, messagingServiceSid?: string) {
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are required');
    }

    this.accountSid = accountSid;
    this.authToken = authToken;
    this.messagingServiceSid = messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
    this.client = twilio(accountSid, authToken);
  }

  /**
   * Send an SMS or MMS message
   */
  async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    try {
      assertSmsContentSafe(params.body);

      // Validate and format phone numbers
      const toPhone = validateAndFormatPhone(params.to);
      const fromPhone = this.messagingServiceSid ? undefined : validateAndFormatPhone(params.from);

      logger.info('Sending SMS', {
        to: toPhone,
        from: fromPhone || params.from,
        messagingServiceSid: this.messagingServiceSid || null,
        bodyLength: params.body.length,
        hasMedia: !!params.mediaUrls,
      });

      const createPayload: Record<string, any> = {
        to: toPhone,
        body: params.body,
        mediaUrl: params.mediaUrls,
      };

      const statusCallback = this.resolveStatusCallback(
        params.statusCallback || process.env.TWILIO_STATUS_CALLBACK_URL
      );
      if (statusCallback) {
        createPayload.statusCallback = statusCallback;
      }

      if (this.messagingServiceSid) {
        createPayload.messagingServiceSid = this.messagingServiceSid;
      } else {
        createPayload.from = fromPhone;
      }

      // Send via Twilio
      const message = await this.client.messages.create(createPayload as any);

      logger.info('SMS sent successfully', {
        sid: message.sid,
        status: message.status,
        to: toPhone,
      });

      return {
        sid: message.sid,
        status: message.status,
        to: toPhone,
        from: message.from || fromPhone || params.from,
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
    const safeTemplate = normalizeSmsTemplateForMinimumNecessary(params.template);
    assertSmsContentSafe(safeTemplate);

    const body = this.replaceTemplateVars(safeTemplate, {
      firstName: params.firstName || params.patientName.split(/\s+/)[0] || 'there',
      patientName: params.patientName,
      providerName: params.providerName,
      appointmentDate: params.appointmentDate,
      appointmentTime: params.appointmentTime,
      clinicPhone: params.clinicPhone,
    });
    assertSmsContentSafe(body);

    return this.sendSMS({
      to: params.patientPhone,
      from: fromPhone,
      body,
      statusCallback,
    });
  }

  /**
   * Place an automated appointment reminder call
   */
  async placeVoiceCall(params: PlaceVoiceCallParams): Promise<PlaceVoiceCallResult> {
    try {
      const toPhone = validateAndFormatPhone(params.to);
      const fromPhone = validateAndFormatPhone(params.from);
      const safeMessage = escapeForTwiml(params.message);
      const twiml = `<Response><Pause length="1"/><Say voice="alice">${safeMessage}</Say></Response>`;
      const statusCallback = this.resolveStatusCallback(params.statusCallback);

      logger.info('Placing appointment reminder call', {
        to: toPhone,
        from: fromPhone,
        messageLength: params.message.length,
      });

      const call = await this.client.calls.create({
        to: toPhone,
        from: fromPhone,
        twiml,
        statusCallback,
      });

      logger.info('Appointment reminder call created', {
        sid: call.sid,
        status: call.status,
        to: toPhone,
      });

      return {
        sid: call.sid,
        status: call.status ?? 'queued',
        to: toPhone,
        from: fromPhone,
        direction: call.direction ?? undefined,
        price: call.price ?? undefined,
      };
    } catch (error: any) {
      logger.error('Failed to place reminder call', {
        error: error.message,
        code: error.code,
        status: error.status,
        to: params.to,
      });
      throw new Error(`Failed to place reminder call: ${error.message}`);
    }
  }

  /**
   * Replace template variables in message text
   * Variables: {firstName}, {appointmentDate}, {appointmentTime}, {clinicPhone}
   */
  private replaceTemplateVars(template: string, vars: Record<string, string>): string {
    let result = template;

    Object.entries(vars).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value || '');
    });

    return result;
  }

  private resolveStatusCallback(statusCallback?: string): string | undefined {
    if (!statusCallback) {
      return undefined;
    }

    try {
      const parsed = new URL(statusCallback);
      const hostname = parsed.hostname.toLowerCase();
      const isLocalHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local');

      if (!['http:', 'https:'].includes(parsed.protocol) || isLocalHost) {
        logger.warn('Skipping invalid Twilio status callback URL', {
          statusCallback,
        });
        return undefined;
      }

      return parsed.toString();
    } catch {
      logger.warn('Skipping invalid Twilio status callback URL', {
        statusCallback,
      });
      return undefined;
    }
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

      if (!number || number.length === 0) {
        throw new Error('Phone number not found in Twilio account');
      }

      const phoneNumberInfo = number[0];
      if (!phoneNumberInfo) {
        throw new Error('Phone number not found in Twilio account');
      }

      return {
        phoneNumber: phoneNumberInfo.phoneNumber,
        friendlyName: phoneNumberInfo.friendlyName || undefined,
        capabilities: phoneNumberInfo.capabilities || undefined,
        smsUrl: phoneNumberInfo.smsUrl || undefined,
        statusCallback: phoneNumberInfo.statusCallback || undefined,
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
   * Fetch non-secret messaging registration details for production readiness checks.
   */
  async getMessagingReadiness(configuredPhoneNumber?: string): Promise<TwilioMessagingReadiness> {
    const errors: string[] = [];
    const configuredDigits = normalizePhoneDigits(configuredPhoneNumber);

    let brandRegistrations: TwilioBrandRegistrationSummary[] = [];
    try {
      const brands = await this.client.messaging.v1.brandRegistrations.list({ limit: 20 });
      brandRegistrations = brands.map((brand: any) => ({
        sid: brand.sid,
        sidSuffix: sidSuffix(brand.sid),
        status: brand.status,
        identityStatus: brand.identityStatus,
        brandType: brand.brandType,
        failureReason: brand.failureReason || undefined,
        errors: brand.errors || [],
        dateUpdated: brand.dateUpdated,
      }));
    } catch (error: any) {
      errors.push(`Brand registration lookup failed: ${error.message}`);
    }

    let services: any[] = [];
    try {
      services = await this.client.messaging.v1.services.list({ limit: 20 });
    } catch (error: any) {
      errors.push(`Messaging service lookup failed: ${error.message}`);
    }

    const serviceSummaries = await Promise.all(
      services.map(async (service: any): Promise<TwilioMessagingServiceSummary> => {
        const serviceErrors: string[] = [];
        let phoneNumbers: Array<{ phoneNumber: string; capabilities?: string[] }> = [];
        let campaigns: TwilioMessagingServiceCampaign[] = [];

        try {
          const servicePhoneNumbers = await this.client.messaging.v1
            .services(service.sid)
            .phoneNumbers.list({ limit: 50 });
          phoneNumbers = servicePhoneNumbers.map((phoneNumber: any) => ({
            phoneNumber: phoneNumber.phoneNumber,
            capabilities: phoneNumber.capabilities,
          }));
        } catch (error: any) {
          serviceErrors.push(`Phone number lookup failed: ${error.message}`);
        }

        try {
          const serviceCampaigns = await this.client.messaging.v1
            .services(service.sid)
            .usAppToPerson.list({ limit: 20 });
          campaigns = serviceCampaigns.map((campaign: any) => ({
            sid: campaign.sid,
            sidSuffix: sidSuffix(campaign.sid),
            campaignStatus: campaign.campaignStatus,
            campaignId: campaign.campaignId,
            brandRegistrationSid: campaign.brandRegistrationSid,
            usecase: campaign.usAppToPersonUsecase,
            description: campaign.description,
            errors: campaign.errors || [],
            dateUpdated: campaign.dateUpdated,
          }));
        } catch (error: any) {
          serviceErrors.push(`A2P campaign lookup failed: ${error.message}`);
        }

        return {
          sid: service.sid,
          sidSuffix: sidSuffix(service.sid),
          friendlyName: service.friendlyName,
          usecase: service.usecase,
          usAppToPersonRegistered: service.usAppToPersonRegistered,
          inboundRequestUrl: service.inboundRequestUrl || null,
          statusCallback: service.statusCallback || null,
          includesConfiguredPhone: configuredDigits
            ? phoneNumbers.some((phoneNumber) => normalizePhoneDigits(phoneNumber.phoneNumber) === configuredDigits)
            : undefined,
          phoneNumbers,
          campaigns,
          errors: serviceErrors,
        };
      })
    );

    return {
      services: serviceSummaries,
      brandRegistrations,
      errors,
    };
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
  return new TwilioService(
    accountSid,
    authToken,
    process.env.TWILIO_MESSAGING_SERVICE_SID || undefined
  );
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

function escapeForTwiml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sidSuffix(sid?: string | null): string {
  const value = sid || '';
  return value.length > 6 ? value.slice(-6) : value;
}

function normalizePhoneDigits(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}
