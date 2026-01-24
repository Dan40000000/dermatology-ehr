/**
 * MockSlackService - Slack webhook mock for development and testing
 *
 * This mock provides an in-memory implementation of Slack webhook operations.
 * All notifications are stored in memory and can be retrieved for test assertions.
 * Matches the interface of the real SlackService.
 *
 * @example
 * ```typescript
 * const mockSlack = new MockSlackService();
 * await mockSlack.sendNotification('https://webhook.url', context);
 * const notifications = mockSlack.getNotifications();
 * ```
 */

import crypto from "crypto";

/**
 * Notification type definitions (matching the real service)
 */
export type NotificationType =
  | "appointment_booked"
  | "appointment_cancelled"
  | "patient_checked_in"
  | "prior_auth_approved"
  | "prior_auth_denied"
  | "lab_results_ready"
  | "urgent_message"
  | "daily_schedule_summary"
  | "end_of_day_report";

/**
 * Configuration options for MockSlackService
 */
export interface MockSlackConfig {
  /** Simulated delay in milliseconds for operations (default: 0) */
  simulatedDelay?: number;
  /** Probability of failure (0-1) for chaos testing (default: 0) */
  failureRate?: number;
  /** Custom error message when failure is triggered */
  failureMessage?: string;
  /** Validate webhook URL format (default: true) */
  validateWebhookUrl?: boolean;
}

/**
 * Notification context (matching the real service)
 */
export interface NotificationContext {
  tenantId: string;
  notificationType: NotificationType;
  data: any;
}

/**
 * Slack message structure
 */
export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

/**
 * Slack block structure
 */
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: any[];
  accessory?: any;
}

/**
 * Stored notification with metadata
 */
export interface StoredNotification {
  id: string;
  webhookUrl: string;
  tenantId: string;
  notificationType: NotificationType;
  data: any;
  message?: SlackMessage;
  sentAt: Date;
  success: boolean;
  error?: string;
}

/**
 * Operation log entry for debugging and test assertions
 */
export interface SlackOperationLog {
  operation: "sendNotification" | "testConnection";
  timestamp: Date;
  success: boolean;
  error?: string;
  webhookUrl?: string;
  context?: NotificationContext;
}

/**
 * In-memory Slack mock service for development and testing
 */
export class MockSlackService {
  private notifications: StoredNotification[] = [];
  private operationLog: SlackOperationLog[] = [];
  private config: Required<MockSlackConfig>;

  constructor(config: MockSlackConfig = {}) {
    this.config = {
      simulatedDelay: config.simulatedDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      failureMessage: config.failureMessage ?? "Simulated Slack failure",
      validateWebhookUrl: config.validateWebhookUrl ?? true,
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
   * Generate a unique notification ID
   */
  private generateId(): string {
    return `slack_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Validate webhook URL format
   */
  private validateWebhookUrl(url: string): void {
    if (!this.config.validateWebhookUrl) return;

    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("Invalid protocol");
      }
    } catch {
      throw new Error(`Invalid webhook URL: ${url}`);
    }
  }

  /**
   * Log an operation for debugging and test assertions
   */
  private logOperation(
    operation: SlackOperationLog["operation"],
    success: boolean,
    error?: string,
    webhookUrl?: string,
    context?: NotificationContext
  ): void {
    this.operationLog.push({
      operation,
      timestamp: new Date(),
      success,
      error,
      webhookUrl,
      context,
    });

    const status = success ? "SUCCESS" : "FAILED";
    console.log(`[MockSlackService] ${operation} - ${status}${error ? `: ${error}` : ""}`);
  }

  /**
   * Build a mock Slack message from context
   */
  private buildMessage(context: NotificationContext): SlackMessage {
    // Create a simple message representation
    const text = `[${context.notificationType}] Notification for tenant ${context.tenantId}`;

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: this.formatNotificationType(context.notificationType),
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Tenant:* ${context.tenantId}`,
        },
      },
    ];

    // Add data as fields if present
    if (context.data && typeof context.data === "object") {
      const fields = Object.entries(context.data)
        .slice(0, 10) // Limit to 10 fields
        .map(([key, value]) => ({
          type: "mrkdwn" as const,
          text: `*${key}:* ${String(value)}`,
        }));

      if (fields.length > 0) {
        blocks.push({
          type: "section",
          fields,
        });
      }
    }

    return { text, blocks };
  }

  /**
   * Format notification type for display
   */
  private formatNotificationType(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      appointment_booked: "calendar",
      appointment_cancelled: "x",
      patient_checked_in: "white_check_mark",
      prior_auth_approved: "heavy_check_mark",
      prior_auth_denied: "no_entry",
      lab_results_ready: "microscope",
      urgent_message: "rotating_light",
      daily_schedule_summary: "clipboard",
      end_of_day_report: "chart_with_upwards_trend",
    };

    const icon = icons[type] || "bell";
    const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    return `:${icon}: ${label}`;
  }

  /**
   * Send a notification to Slack (mock implementation)
   *
   * @param webhookUrl - Slack webhook URL
   * @param context - Notification context
   */
  async sendNotification(webhookUrl: string, context: NotificationContext): Promise<void> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      const notification: StoredNotification = {
        id: this.generateId(),
        webhookUrl,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
        data: context.data,
        sentAt: new Date(),
        success: false,
        error: this.config.failureMessage,
      };
      this.notifications.push(notification);
      this.logOperation("sendNotification", false, this.config.failureMessage, webhookUrl, context);
      throw new Error(this.config.failureMessage);
    }

    try {
      this.validateWebhookUrl(webhookUrl);

      const message = this.buildMessage(context);

      const notification: StoredNotification = {
        id: this.generateId(),
        webhookUrl,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
        data: context.data,
        message,
        sentAt: new Date(),
        success: true,
      };

      this.notifications.push(notification);

      this.logOperation("sendNotification", true, undefined, webhookUrl, context);
    } catch (error: any) {
      const notification: StoredNotification = {
        id: this.generateId(),
        webhookUrl,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
        data: context.data,
        sentAt: new Date(),
        success: false,
        error: error.message,
      };
      this.notifications.push(notification);
      this.logOperation("sendNotification", false, error.message, webhookUrl, context);
      throw error;
    }
  }

  /**
   * Test Slack webhook connection (mock implementation)
   *
   * @param webhookUrl - Slack webhook URL
   * @returns true if connection test succeeds
   */
  async testConnection(webhookUrl: string): Promise<boolean> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("testConnection", false, this.config.failureMessage, webhookUrl);
      return false;
    }

    try {
      this.validateWebhookUrl(webhookUrl);
      this.logOperation("testConnection", true, undefined, webhookUrl);
      return true;
    } catch (error: any) {
      this.logOperation("testConnection", false, error.message, webhookUrl);
      return false;
    }
  }

  // ============================================================
  // Static Helper Methods (matching real service)
  // ============================================================

  /**
   * Create a Slack block with header
   */
  static createHeaderBlock(icon: string, title: string): SlackBlock {
    return {
      type: "header",
      text: {
        type: "plain_text",
        text: `${icon} ${title}`,
        emoji: true,
      },
    };
  }

  /**
   * Create a Slack section block with fields
   */
  static createFieldsBlock(fields: Array<{ label: string; value: string }>): SlackBlock {
    return {
      type: "section",
      fields: fields.map((field) => ({
        type: "mrkdwn",
        text: `*${field.label}:*\n${field.value}`,
      })),
    };
  }

  /**
   * Create a Slack divider block
   */
  static createDivider(): SlackBlock {
    return {
      type: "divider",
    };
  }

  /**
   * Create a Slack context block
   */
  static createContext(text: string): SlackBlock {
    return {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text,
        },
      ],
    };
  }

  /**
   * Create a Slack actions block with buttons
   */
  static createActionsBlock(actions: Array<{ text: string; url: string; style?: string }>): SlackBlock {
    return {
      type: "actions",
      elements: actions.map((action) => ({
        type: "button",
        text: {
          type: "plain_text",
          text: action.text,
          emoji: true,
        },
        url: action.url,
        style: action.style,
      })),
    };
  }

  // ============================================================
  // Test Helper Methods
  // ============================================================

  /**
   * Get all notifications for test assertions
   */
  getNotifications(): StoredNotification[] {
    return [...this.notifications];
  }

  /**
   * Get notifications filtered by tenant
   */
  getNotificationsByTenant(tenantId: string): StoredNotification[] {
    return this.notifications.filter((n) => n.tenantId === tenantId);
  }

  /**
   * Get notifications filtered by type
   */
  getNotificationsByType(type: NotificationType): StoredNotification[] {
    return this.notifications.filter((n) => n.notificationType === type);
  }

  /**
   * Get successful notifications only
   */
  getSuccessfulNotifications(): StoredNotification[] {
    return this.notifications.filter((n) => n.success);
  }

  /**
   * Get failed notifications only
   */
  getFailedNotifications(): StoredNotification[] {
    return this.notifications.filter((n) => !n.success);
  }

  /**
   * Get the last notification
   */
  getLastNotification(): StoredNotification | undefined {
    return this.notifications[this.notifications.length - 1];
  }

  /**
   * Get notification count
   */
  getNotificationCount(): number {
    return this.notifications.length;
  }

  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    this.notifications = [];
    console.log("[MockSlackService] Notifications cleared");
  }

  /**
   * Get all operation logs
   */
  getOperationLog(): SlackOperationLog[] {
    return [...this.operationLog];
  }

  /**
   * Clear all operation logs
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.notifications = [];
    this.operationLog = [];
    console.log("[MockSlackService] Full reset completed");
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<MockSlackConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MockSlackConfig> {
    return { ...this.config };
  }
}

/**
 * Create a pre-configured mock Slack service instance
 */
export function createMockSlackService(config?: MockSlackConfig): MockSlackService {
  return new MockSlackService(config);
}

/**
 * Default singleton instance for simple usage
 */
export const mockSlackService = new MockSlackService();
