/**
 * Mock SMS Service
 *
 * In-memory implementation of ISmsService for testing and development.
 * Logs SMS messages instead of sending them via Twilio.
 */

import crypto from "crypto";
import { ISmsService, SendSMSParams, SendSMSResult } from "../../types/services";
import { logger } from "../../logger";

export interface SentMessage extends SendSMSResult {
  sentAt: Date;
}

export class MockSmsService implements ISmsService {
  private sentMessages: SentMessage[] = [];
  private simulateFailure = false;
  private failureMessage = "Simulated SMS failure";

  constructor() {
    logger.info("MockSmsService initialized");
  }

  async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    if (this.simulateFailure) {
      logger.warn("Mock SMS: simulating failure", { to: params.to });
      throw new Error(this.failureMessage);
    }

    const sid = `SM${crypto.randomUUID().replace(/-/g, "").substring(0, 32)}`;
    const numSegments = this.calculateSegmentCount(params.body);

    const result: SendSMSResult = {
      sid,
      status: "sent",
      to: params.to,
      from: params.from,
      body: params.body,
      numSegments,
      price: (numSegments * 0.0079).toFixed(4),
    };

    this.sentMessages.push({
      ...result,
      sentAt: new Date(),
    });

    logger.info("Mock SMS sent", {
      sid,
      to: params.to,
      from: params.from,
      bodyLength: params.body.length,
      segments: numSegments,
    });

    return result;
  }

  validateWebhookSignature(signature: string, url: string, params: Record<string, unknown>): boolean {
    // In mock mode, accept any signature that starts with "valid_"
    const isValid = signature.startsWith("valid_");

    logger.debug("Mock SMS: webhook signature validation", { signature, isValid });

    return isValid;
  }

  async getMessageDetails(messageSid: string): Promise<SendSMSResult> {
    const message = this.sentMessages.find((m) => m.sid === messageSid);

    if (!message) {
      throw new Error(`Message not found: ${messageSid}`);
    }

    return message;
  }

  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    if (this.simulateFailure) {
      return {
        success: false,
        error: "Mock connection test failed (simulated)",
      };
    }

    return {
      success: true,
      accountName: "Mock Twilio Account",
    };
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

  // =========================================================================
  // Test Helper Methods
  // =========================================================================

  /**
   * Get all sent messages (for testing)
   */
  getSentMessages(): SentMessage[] {
    return [...this.sentMessages];
  }

  /**
   * Get the last sent message (for testing)
   */
  getLastMessage(): SentMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Clear all sent messages (for testing)
   */
  clearMessages(): void {
    this.sentMessages = [];
    logger.debug("Mock SMS: cleared all messages");
  }

  /**
   * Set whether to simulate failures (for testing)
   */
  setSimulateFailure(shouldFail: boolean, message = "Simulated SMS failure"): void {
    this.simulateFailure = shouldFail;
    this.failureMessage = message;
    logger.debug("Mock SMS: simulate failure set", { shouldFail, message });
  }

  /**
   * Get message count (for testing)
   */
  getMessageCount(): number {
    return this.sentMessages.length;
  }

  /**
   * Find messages by recipient (for testing)
   */
  findMessagesByRecipient(to: string): SentMessage[] {
    return this.sentMessages.filter((m) => m.to === to);
  }
}
