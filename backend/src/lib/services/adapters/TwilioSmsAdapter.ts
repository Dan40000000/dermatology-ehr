/**
 * Twilio SMS Adapter
 *
 * Adapter that wraps Twilio client to implement ISmsService interface.
 */

import twilio, { Twilio } from "twilio";
import { ISmsService, SendSMSParams, SendSMSResult } from "../../types/services";
import { logger } from "../../logger";
import { formatPhoneE164, validateAndFormatPhone } from "../../../utils/phone";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
}

export class TwilioSmsAdapter implements ISmsService {
  private client: Twilio;
  private authToken: string;

  constructor(config: TwilioConfig) {
    if (!config.accountSid || !config.authToken) {
      throw new Error("Twilio credentials are required");
    }

    this.authToken = config.authToken;
    this.client = twilio(config.accountSid, config.authToken);

    logger.info("TwilioSmsAdapter initialized", {
      accountSid: config.accountSid.substring(0, 8) + "...",
    });
  }

  async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    try {
      const toPhone = validateAndFormatPhone(params.to);
      const fromPhone = validateAndFormatPhone(params.from);

      logger.info("Sending SMS", {
        to: toPhone,
        from: fromPhone,
        bodyLength: params.body.length,
        hasMedia: !!params.mediaUrls,
      });

      const message = await this.client.messages.create({
        to: toPhone,
        from: fromPhone,
        body: params.body,
        mediaUrl: params.mediaUrls,
        statusCallback: params.statusCallback,
      });

      logger.info("SMS sent successfully", {
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
        numSegments: parseInt(message.numSegments || "1"),
        price: message.price || undefined,
        errorCode: message.errorCode || undefined,
        errorMessage: message.errorMessage || undefined,
      };
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; status?: number };
      logger.error("Failed to send SMS", {
        error: err.message,
        code: err.code,
        status: err.status,
        to: params.to,
      });

      throw new Error(`Failed to send SMS: ${err.message}`);
    }
  }

  validateWebhookSignature(signature: string, url: string, params: Record<string, unknown>): boolean {
    try {
      return twilio.validateRequest(this.authToken, signature, url, params as Record<string, string>);
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Webhook signature validation failed", {
        error: err.message,
        url,
      });
      return false;
    }
  }

  async getMessageDetails(messageSid: string): Promise<SendSMSResult> {
    try {
      const message = await this.client.messages(messageSid).fetch();

      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body || "",
        numSegments: parseInt(message.numSegments || "1"),
        price: message.price || undefined,
        errorCode: message.errorCode || undefined,
        errorMessage: message.errorMessage || undefined,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Failed to fetch message details", {
        error: err.message,
        messageSid,
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      const account = await this.client.api.accounts(this.client.accountSid).fetch();

      logger.info("Twilio connection test successful", {
        accountName: account.friendlyName,
      });

      return {
        success: true,
        accountName: account.friendlyName,
      };
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string };
      logger.error("Twilio connection test failed", {
        error: err.message,
        code: err.code,
      });

      return {
        success: false,
        error: err.message,
      };
    }
  }

  calculateSegmentCount(messageBody: string): number {
    if (!messageBody) return 0;

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
}
