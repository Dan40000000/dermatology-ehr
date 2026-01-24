/**
 * Mock Notification Service
 *
 * In-memory implementation of INotificationService for testing and development.
 * Logs notifications instead of sending them to Slack/Teams.
 */

import crypto from "crypto";
import { INotificationService, NotificationContext } from "../../types/services";
import { logger } from "../../logger";

export interface SentNotification {
  id: string;
  webhookUrl: string;
  context: NotificationContext;
  sentAt: Date;
}

export class MockNotificationService implements INotificationService {
  private sentNotifications: SentNotification[] = [];
  private simulateFailure = false;
  private failureMessage = "Simulated notification failure";
  private serviceName: string;

  constructor(serviceName = "mock") {
    this.serviceName = serviceName;
    logger.info(`Mock${serviceName}NotificationService initialized`);
  }

  async sendNotification(webhookUrl: string, context: NotificationContext): Promise<void> {
    if (this.simulateFailure) {
      logger.warn(`Mock ${this.serviceName}: simulating failure`, {
        webhookUrl: this.maskWebhookUrl(webhookUrl),
        notificationType: context.notificationType,
      });
      throw new Error(this.failureMessage);
    }

    const notification: SentNotification = {
      id: crypto.randomUUID(),
      webhookUrl,
      context,
      sentAt: new Date(),
    };

    this.sentNotifications.push(notification);

    logger.info(`Mock ${this.serviceName} notification sent`, {
      id: notification.id,
      tenantId: context.tenantId,
      notificationType: context.notificationType,
    });
  }

  async testConnection(webhookUrl: string): Promise<boolean> {
    if (this.simulateFailure) {
      logger.warn(`Mock ${this.serviceName}: connection test failed (simulated)`);
      return false;
    }

    logger.info(`Mock ${this.serviceName}: connection test successful`, {
      webhookUrl: this.maskWebhookUrl(webhookUrl),
    });

    return true;
  }

  /**
   * Mask webhook URL for logging (don't expose full URL)
   */
  private maskWebhookUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/...`;
    } catch {
      return "invalid-url";
    }
  }

  // =========================================================================
  // Test Helper Methods
  // =========================================================================

  /**
   * Get all sent notifications (for testing)
   */
  getSentNotifications(): SentNotification[] {
    return [...this.sentNotifications];
  }

  /**
   * Get the last sent notification (for testing)
   */
  getLastNotification(): SentNotification | undefined {
    return this.sentNotifications[this.sentNotifications.length - 1];
  }

  /**
   * Clear all sent notifications (for testing)
   */
  clearNotifications(): void {
    this.sentNotifications = [];
    logger.debug(`Mock ${this.serviceName}: cleared all notifications`);
  }

  /**
   * Set whether to simulate failures (for testing)
   */
  setSimulateFailure(shouldFail: boolean, message = "Simulated notification failure"): void {
    this.simulateFailure = shouldFail;
    this.failureMessage = message;
    logger.debug(`Mock ${this.serviceName}: simulate failure set`, { shouldFail });
  }

  /**
   * Get notification count (for testing)
   */
  getNotificationCount(): number {
    return this.sentNotifications.length;
  }

  /**
   * Find notifications by type (for testing)
   */
  findNotificationsByType(type: string): SentNotification[] {
    return this.sentNotifications.filter((n) => n.context.notificationType === type);
  }

  /**
   * Find notifications by tenant (for testing)
   */
  findNotificationsByTenant(tenantId: string): SentNotification[] {
    return this.sentNotifications.filter((n) => n.context.tenantId === tenantId);
  }
}
