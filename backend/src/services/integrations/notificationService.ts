import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { slackService } from "./slackService";
import { teamsService } from "./teamsService";
import { Integration, NotificationContext, NotificationType } from "./types";

export class NotificationService {
  /**
   * Send notification to all enabled integrations for a tenant
   */
  async sendNotification(context: NotificationContext): Promise<void> {
    try {
      // Get all enabled integrations for this tenant and notification type
      const integrations = await this.getEnabledIntegrations(
        context.tenantId,
        context.notificationType
      );

      if (integrations.length === 0) {
        logger.debug("No integrations configured for notification", {
          tenantId: context.tenantId,
          notificationType: context.notificationType,
        });
        return;
      }

      // Send to all integrations in parallel
      const results = await Promise.allSettled(
        integrations.map((integration) =>
          this.sendToIntegration(integration, context)
        )
      );

      // Log results
      results.forEach((result, index) => {
        const integration = integrations[index]!;
        if (result.status === "fulfilled") {
          logger.info("Notification sent successfully", {
            integrationId: integration.id,
            type: integration.type,
            notificationType: context.notificationType,
          });
        } else {
          logger.error("Failed to send notification", {
            integrationId: integration.id,
            type: integration.type,
            notificationType: context.notificationType,
            error: result.reason,
          });
        }
      });
    } catch (error: any) {
      logger.error("Error in notification service", {
        error: error.message,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
    }
  }

  /**
   * Send notification to a specific integration
   */
  private async sendToIntegration(
    integration: Integration,
    context: NotificationContext
  ): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let errorMessage: string | undefined;

    try {
      if (integration.type === "slack") {
        await slackService.sendNotification(integration.webhookUrl, context);
      } else if (integration.type === "teams") {
        await teamsService.sendNotification(integration.webhookUrl, context);
      } else {
        throw new Error(`Unknown integration type: ${integration.type}`);
      }

      success = true;
    } catch (error: any) {
      success = false;
      errorMessage = error.message;
      throw error;
    } finally {
      // Log the notification attempt
      await this.logNotification({
        integrationId: integration.id,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
        success,
        errorMessage,
        payload: context.data,
      });

      const duration = Date.now() - startTime;
      logger.debug("Notification attempt completed", {
        integrationId: integration.id,
        duration,
        success,
      });
    }
  }

  /**
   * Get enabled integrations for a tenant and notification type
   */
  private async getEnabledIntegrations(
    tenantId: string,
    notificationType: NotificationType
  ): Promise<Integration[]> {
    const result = await pool.query<Integration>(
      `SELECT id, tenant_id, type, webhook_url, channel_name, enabled,
              notification_types, created_at, updated_at
       FROM integrations
       WHERE tenant_id = $1
         AND enabled = true
         AND $2 = ANY(notification_types)
       ORDER BY created_at ASC`,
      [tenantId, notificationType]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      type: row.type,
      webhookUrl: row.webhook_url,
      channelName: row.channel_name,
      enabled: row.enabled,
      notificationTypes: row.notification_types,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Log notification attempt to database
   */
  private async logNotification(data: {
    integrationId: string;
    tenantId: string;
    notificationType: NotificationType;
    success: boolean;
    errorMessage?: string;
    payload: any;
  }): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO integration_notification_logs
         (integration_id, tenant_id, notification_type, success, error_message, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.integrationId,
          data.tenantId,
          data.notificationType,
          data.success,
          data.errorMessage,
          JSON.stringify(data.payload),
        ]
      );
    } catch (error: any) {
      logger.error("Failed to log notification", {
        error: error.message,
        integrationId: data.integrationId,
      });
      // Don't throw - logging failure shouldn't break notification flow
    }
  }

  /**
   * Get notification logs for a tenant
   */
  async getNotificationLogs(
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      integrationId?: string;
      success?: boolean;
    } = {}
  ): Promise<{ logs: any[]; total: number }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let whereClause = "WHERE tenant_id = $1";
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (options.integrationId) {
      whereClause += ` AND integration_id = $${paramIndex}`;
      params.push(options.integrationId);
      paramIndex++;
    }

    if (options.success !== undefined) {
      whereClause += ` AND success = $${paramIndex}`;
      params.push(options.success);
      paramIndex++;
    }

    // Get logs
    const logsResult = await pool.query(
      `SELECT inl.*, i.type as integration_type, i.channel_name
       FROM integration_notification_logs inl
       LEFT JOIN integrations i ON inl.integration_id = i.id
       ${whereClause}
       ORDER BY inl.sent_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM integration_notification_logs
       ${whereClause}`,
      params
    );

    return {
      logs: logsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Test an integration webhook
   */
  async testIntegration(
    integrationId: string,
    tenantId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await pool.query<any>(
        `SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2`,
        [integrationId, tenantId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: "Integration not found" };
      }

      const integration = result.rows[0]!;
      let testSuccess = false;

      if (integration.type === "slack") {
        testSuccess = await slackService.testConnection(integration.webhook_url);
      } else if (integration.type === "teams") {
        testSuccess = await teamsService.testConnection(integration.webhook_url);
      } else {
        return { success: false, error: "Unknown integration type" };
      }

      // Log the test
      await this.logNotification({
        integrationId: integration.id,
        tenantId,
        notificationType: "appointment_booked", // Use a dummy type for tests
        success: testSuccess,
        errorMessage: testSuccess ? undefined : "Connection test failed",
        payload: { test: true },
      });

      return { success: testSuccess };
    } catch (error: any) {
      logger.error("Integration test failed", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get integration statistics for a tenant
   */
  async getIntegrationStats(tenantId: string, integrationId?: string): Promise<any> {
    let whereClause = "WHERE tenant_id = $1";
    const params: any[] = [tenantId];

    if (integrationId) {
      whereClause += " AND integration_id = $2";
      params.push(integrationId);
    }

    const result = await pool.query(
      `SELECT
         COUNT(*) as total_notifications,
         COUNT(*) FILTER (WHERE success = true) as successful_notifications,
         COUNT(*) FILTER (WHERE success = false) as failed_notifications,
         COUNT(DISTINCT notification_type) as notification_types_used,
         MIN(sent_at) as first_notification,
         MAX(sent_at) as last_notification
       FROM integration_notification_logs
       ${whereClause}`,
      params
    );

    return result.rows[0];
  }
}

export const notificationService = new NotificationService();
