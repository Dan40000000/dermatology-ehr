/**
 * MockTwilioService - SMS mock for development and testing
 *
 * This mock provides an in-memory implementation of Twilio SMS operations.
 * All sent messages are stored in memory and can be retrieved for test assertions.
 * Supports simulated delays, failure rates, and phone number validation.
 *
 * @example
 * ```typescript
 * const mockTwilio = new MockTwilioService();
 * await mockTwilio.sendSMS({ to: '+1234567890', from: '+0987654321', body: 'Hello!' });
 * const messages = mockTwilio.getSentMessages();
 * ```
 */

import crypto from "crypto";

/**
 * Configuration options for MockTwilioService
 */
export interface MockTwilioConfig {
  /** Simulated delay in milliseconds for operations (default: 0) */
  simulatedDelay?: number;
  /** Probability of failure (0-1) for chaos testing (default: 0) */
  failureRate?: number;
  /** Custom error message when failure is triggered */
  failureMessage?: string;
  /** Whether to validate phone number format (default: true) */
  validatePhoneNumbers?: boolean;
  /** Simulated account SID */
  accountSid?: string;
}

/**
 * Parameters for sending an SMS
 */
export interface SendSMSParams {
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

/**
 * Result from sending an SMS
 */
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

/**
 * Parameters for appointment reminder
 */
export interface AppointmentReminderParams {
  patientPhone: string;
  patientName: string;
  providerName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicPhone: string;
  template: string;
}

/**
 * Stored message with metadata
 */
export interface StoredMessage {
  sid: string;
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
  status: "queued" | "sent" | "delivered" | "failed";
  numSegments: number;
  price: string;
  sentAt: Date;
  deliveredAt?: Date;
  errorCode?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Operation log entry for debugging and test assertions
 */
export interface TwilioOperationLog {
  operation: "sendSMS" | "sendAppointmentReminder" | "getMessageDetails" | "testConnection";
  timestamp: Date;
  success: boolean;
  error?: string;
  params?: Record<string, any>;
  result?: Record<string, any>;
}

/**
 * In-memory Twilio mock service for development and testing
 */
export class MockTwilioService {
  private messages: StoredMessage[] = [];
  private operationLog: TwilioOperationLog[] = [];
  private config: Required<MockTwilioConfig>;

  constructor(config: MockTwilioConfig = {}) {
    this.config = {
      simulatedDelay: config.simulatedDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      failureMessage: config.failureMessage ?? "Simulated Twilio failure",
      validatePhoneNumbers: config.validatePhoneNumbers ?? true,
      accountSid: config.accountSid ?? "AC_mock_account_sid",
    };
  }

  /**
   * Simulate delay if configured
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.simulatedDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulatedDelay));
    }
  }

  /**
   * Check if operation should fail (for chaos testing)
   */
  private shouldFail(): boolean {
    return Math.random() < this.config.failureRate;
  }

  /**
   * Generate a mock message SID
   */
  private generateSid(): string {
    return `SM${crypto.randomBytes(16).toString("hex")}`;
  }

  /**
   * Validate phone number format (E.164)
   */
  private validatePhoneNumber(phone: string): string {
    if (!this.config.validatePhoneNumbers) {
      return phone;
    }

    // Basic E.164 validation: starts with + followed by 10-15 digits
    // E.164 format allows digits 0-9 after the country code
    const cleaned = phone.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{10,15}$/.test(cleaned)) {
      throw new Error(`Invalid phone number format: ${phone}`);
    }

    // Ensure + prefix
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  }

  /**
   * Calculate SMS segment count based on content
   */
  private calculateSegmentCount(body: string): number {
    // Check for unicode
    const hasUnicode = /[^\x00-\x7F]/.test(body);
    const charsPerSegment = hasUnicode ? 70 : 160;
    return Math.ceil(body.length / charsPerSegment);
  }

  /**
   * Log an operation for debugging and test assertions
   */
  private logOperation(
    operation: TwilioOperationLog["operation"],
    success: boolean,
    error?: string,
    params?: Record<string, any>,
    result?: Record<string, any>
  ): void {
    this.operationLog.push({
      operation,
      timestamp: new Date(),
      success,
      error,
      params,
      result,
    });

    const status = success ? "SUCCESS" : "FAILED";
    console.log(`[MockTwilioService] ${operation} - ${status}${error ? `: ${error}` : ""}`);
  }

  /**
   * Send an SMS or MMS message
   *
   * @param params - SMS parameters (to, from, body, mediaUrls, statusCallback)
   * @returns SMS result with SID and status
   */
  async sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("sendSMS", false, this.config.failureMessage, params);
      throw new Error(this.config.failureMessage);
    }

    try {
      const toPhone = this.validatePhoneNumber(params.to);
      const fromPhone = this.validatePhoneNumber(params.from);

      const sid = this.generateSid();
      const numSegments = this.calculateSegmentCount(params.body);

      const storedMessage: StoredMessage = {
        sid,
        to: toPhone,
        from: fromPhone,
        body: params.body,
        mediaUrls: params.mediaUrls,
        statusCallback: params.statusCallback,
        status: "sent",
        numSegments,
        price: (numSegments * 0.0079).toFixed(4),
        sentAt: new Date(),
      };

      this.messages.push(storedMessage);

      const result: SendSMSResult = {
        sid,
        status: "sent",
        to: toPhone,
        from: fromPhone,
        body: params.body,
        numSegments,
        price: storedMessage.price,
      };

      this.logOperation("sendSMS", true, undefined, params, { sid, status: "sent" });

      return result;
    } catch (error: any) {
      this.logOperation("sendSMS", false, error.message, params);
      throw error;
    }
  }

  /**
   * Send appointment reminder with template variables
   *
   * @param fromPhone - Sender phone number
   * @param params - Appointment reminder parameters
   * @param statusCallback - Optional status callback URL
   * @returns SMS result
   */
  async sendAppointmentReminder(
    fromPhone: string,
    params: AppointmentReminderParams,
    statusCallback?: string
  ): Promise<SendSMSResult> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("sendAppointmentReminder", false, this.config.failureMessage, params);
      throw new Error(this.config.failureMessage);
    }

    // Replace template variables
    const body = this.replaceTemplateVars(params.template, {
      patientName: params.patientName,
      providerName: params.providerName,
      appointmentDate: params.appointmentDate,
      appointmentTime: params.appointmentTime,
      clinicPhone: params.clinicPhone,
    });

    const result = await this.sendSMS({
      to: params.patientPhone,
      from: fromPhone,
      body,
      statusCallback,
    });

    this.logOperation("sendAppointmentReminder", true, undefined, params, { sid: result.sid });

    return result;
  }

  /**
   * Replace template variables in message text
   */
  private replaceTemplateVars(template: string, vars: Record<string, string>): string {
    let result = template;
    Object.entries(vars).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, "g");
      result = result.replace(regex, value || "");
    });
    return result;
  }

  /**
   * Get message details by SID
   *
   * @param messageSid - The message SID
   * @returns Message details or null if not found
   */
  async getMessageDetails(messageSid: string): Promise<StoredMessage | null> {
    await this.simulateDelay();

    const message = this.messages.find((m) => m.sid === messageSid);

    if (!message) {
      this.logOperation("getMessageDetails", false, "Message not found", { messageSid });
      return null;
    }

    this.logOperation("getMessageDetails", true, undefined, { messageSid });
    return message;
  }

  /**
   * Test connection (always succeeds for mock)
   */
  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("testConnection", false, this.config.failureMessage);
      return { success: false, error: this.config.failureMessage };
    }

    this.logOperation("testConnection", true);
    return {
      success: true,
      accountName: "Mock Twilio Account",
    };
  }

  /**
   * Validate webhook signature (mock implementation)
   */
  validateWebhookSignature(signature: string, url: string, params: Record<string, any>): boolean {
    // In mock, we accept any non-empty signature
    return signature.length > 0;
  }

  /**
   * Calculate SMS segment count (exposed for testing)
   */
  calculateSegmentCountPublic(messageBody: string): number {
    return this.calculateSegmentCount(messageBody);
  }

  /**
   * Estimate SMS cost
   */
  estimateSMSCost(messageBody: string, isInternational = false): number {
    const segments = this.calculateSegmentCount(messageBody);
    const costPerSegment = isInternational ? 0.02 : 0.0079;
    return segments * costPerSegment;
  }

  // ============================================================
  // Test Helper Methods
  // ============================================================

  /**
   * Get all sent messages for test assertions
   */
  getSentMessages(): StoredMessage[] {
    return [...this.messages];
  }

  /**
   * Get messages filtered by recipient
   */
  getMessagesByRecipient(to: string): StoredMessage[] {
    const normalized = to.startsWith("+") ? to : `+${to}`;
    return this.messages.filter((m) => m.to === normalized);
  }

  /**
   * Get messages filtered by sender
   */
  getMessagesBySender(from: string): StoredMessage[] {
    const normalized = from.startsWith("+") ? from : `+${from}`;
    return this.messages.filter((m) => m.from === normalized);
  }

  /**
   * Get the last sent message
   */
  getLastMessage(): StoredMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Get total message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages (reset for tests)
   */
  clearMessages(): void {
    this.messages = [];
    console.log("[MockTwilioService] Messages cleared");
  }

  /**
   * Get all operation logs for test assertions
   */
  getOperationLog(): TwilioOperationLog[] {
    return [...this.operationLog];
  }

  /**
   * Get operations filtered by type
   */
  getOperationsByType(operation: TwilioOperationLog["operation"]): TwilioOperationLog[] {
    return this.operationLog.filter((log) => log.operation === operation);
  }

  /**
   * Clear all operation logs
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }

  /**
   * Reset all state (messages and logs)
   */
  reset(): void {
    this.messages = [];
    this.operationLog = [];
    console.log("[MockTwilioService] Full reset completed");
  }

  /**
   * Simulate message delivery (update status)
   */
  simulateDelivery(messageSid: string): boolean {
    const message = this.messages.find((m) => m.sid === messageSid);
    if (message) {
      message.status = "delivered";
      message.deliveredAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Simulate message failure
   */
  simulateFailure(messageSid: string, errorCode: number, errorMessage: string): boolean {
    const message = this.messages.find((m) => m.sid === messageSid);
    if (message) {
      message.status = "failed";
      message.errorCode = errorCode;
      message.errorMessage = errorMessage;
      return true;
    }
    return false;
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<MockTwilioConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MockTwilioConfig> {
    return { ...this.config };
  }
}

/**
 * Create a pre-configured mock Twilio service instance
 */
export function createMockTwilioService(config?: MockTwilioConfig): MockTwilioService {
  return new MockTwilioService(config);
}

/**
 * Default singleton instance for simple usage
 */
export const mockTwilioService = new MockTwilioService();
