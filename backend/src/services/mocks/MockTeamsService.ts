/**
 * MockTeamsService - Microsoft Teams webhook mock for development and testing
 *
 * This mock provides an in-memory implementation of Teams webhook operations.
 * All notifications are stored in memory and can be retrieved for test assertions.
 * Matches the interface of the real TeamsService.
 *
 * @example
 * ```typescript
 * const mockTeams = new MockTeamsService();
 * await mockTeams.sendNotification('https://webhook.url', context);
 * const notifications = mockTeams.getNotifications();
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
 * Configuration options for MockTeamsService
 */
export interface MockTeamsConfig {
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
 * Teams message structure
 */
export interface TeamsMessage {
  type: string;
  attachments: Array<{
    contentType: string;
    content: any;
  }>;
}

/**
 * Adaptive Card structure
 */
export interface AdaptiveCard {
  type: string;
  version: string;
  body: any[];
  actions?: any[];
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
  message?: TeamsMessage;
  sentAt: Date;
  success: boolean;
  error?: string;
}

/**
 * Operation log entry for debugging and test assertions
 */
export interface TeamsOperationLog {
  operation: "sendNotification" | "testConnection";
  timestamp: Date;
  success: boolean;
  error?: string;
  webhookUrl?: string;
  context?: NotificationContext;
}

/**
 * In-memory Teams mock service for development and testing
 */
export class MockTeamsService {
  private notifications: StoredNotification[] = [];
  private operationLog: TeamsOperationLog[] = [];
  private config: Required<MockTeamsConfig>;

  constructor(config: MockTeamsConfig = {}) {
    this.config = {
      simulatedDelay: config.simulatedDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      failureMessage: config.failureMessage ?? "Simulated Teams failure",
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
    return `teams_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
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
    operation: TeamsOperationLog["operation"],
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
    console.log(`[MockTeamsService] ${operation} - ${status}${error ? `: ${error}` : ""}`);
  }

  /**
   * Get theme color for notification type
   */
  private getThemeColor(type: NotificationType): string {
    const colors: Record<NotificationType, string> = {
      appointment_booked: "0078D7", // Blue
      appointment_cancelled: "FF6B6B", // Red
      patient_checked_in: "00C851", // Green
      prior_auth_approved: "00C851", // Green
      prior_auth_denied: "FF4444", // Red
      lab_results_ready: "9C27B0", // Purple
      urgent_message: "FF8800", // Orange
      daily_schedule_summary: "2196F3", // Light Blue
      end_of_day_report: "607D8B", // Grey
    };
    return colors[type] || "0078D7";
  }

  /**
   * Format notification type for display
   */
  private formatNotificationType(type: NotificationType): string {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Build a mock Teams message from context
   */
  private buildMessage(context: NotificationContext): TeamsMessage {
    const card = this.createAdaptiveCard({
      title: this.formatNotificationType(context.notificationType),
      subtitle: `Tenant: ${context.tenantId}`,
      text: `Notification data included below`,
      themeColor: this.getThemeColor(context.notificationType),
      facts: context.data
        ? Object.entries(context.data)
            .slice(0, 10)
            .map(([key, value]) => ({
              title: key,
              value: String(value),
            }))
        : undefined,
    });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
    };
  }

  /**
   * Send a notification to Teams (mock implementation)
   *
   * @param webhookUrl - Teams webhook URL
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
   * Test Teams webhook connection (mock implementation)
   *
   * @param webhookUrl - Teams webhook URL
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

  /**
   * Create an Adaptive Card
   */
  createAdaptiveCard(config: {
    title: string;
    subtitle?: string;
    text: string;
    themeColor?: string;
    facts?: Array<{ title: string; value: string }>;
    actions?: Array<{ type: string; title: string; url: string }>;
  }): AdaptiveCard {
    const body: any[] = [
      {
        type: "TextBlock",
        text: config.title,
        weight: "Bolder",
        size: "Large",
        wrap: true,
      },
    ];

    if (config.subtitle) {
      body.push({
        type: "TextBlock",
        text: config.subtitle,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
        color: "Accent",
      });
    }

    body.push({
      type: "TextBlock",
      text: config.text,
      wrap: true,
      spacing: "Medium",
    });

    if (config.facts && config.facts.length > 0) {
      body.push({
        type: "FactSet",
        facts: config.facts,
        spacing: "Medium",
      });
    }

    const card: AdaptiveCard = {
      type: "AdaptiveCard",
      version: "1.4",
      body,
    };

    if (config.actions && config.actions.length > 0) {
      card.actions = config.actions.map((action) => ({
        type: action.type,
        title: action.title,
        url: action.url,
      }));
    }

    return card;
  }

  // ============================================================
  // Static Helper Methods (matching real service)
  // ============================================================

  /**
   * Create a container block for grouping elements
   */
  static createContainer(items: any[], style?: string): any {
    return {
      type: "Container",
      items,
      style: style || "default",
    };
  }

  /**
   * Create a column set for side-by-side layout
   */
  static createColumnSet(columns: Array<{ width: string; items: any[] }>): any {
    return {
      type: "ColumnSet",
      columns: columns.map((col) => ({
        type: "Column",
        width: col.width,
        items: col.items,
      })),
    };
  }

  /**
   * Create an action button
   */
  static createAction(title: string, url: string, style?: string): any {
    return {
      type: "Action.OpenUrl",
      title,
      url,
      style: style || "default",
    };
  }

  /**
   * Create a fact (key-value pair)
   */
  static createFact(title: string, value: string): { title: string; value: string } {
    return { title, value };
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
    console.log("[MockTeamsService] Notifications cleared");
  }

  /**
   * Get all operation logs
   */
  getOperationLog(): TeamsOperationLog[] {
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
    console.log("[MockTeamsService] Full reset completed");
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<MockTeamsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MockTeamsConfig> {
    return { ...this.config };
  }
}

/**
 * Create a pre-configured mock Teams service instance
 */
export function createMockTeamsService(config?: MockTeamsConfig): MockTeamsService {
  return new MockTeamsService(config);
}

/**
 * Default singleton instance for simple usage
 */
export const mockTeamsService = new MockTeamsService();
