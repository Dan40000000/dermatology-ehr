/**
 * Slack Notification Adapter
 *
 * Adapter that wraps Slack webhook integration to implement INotificationService interface.
 */

import axios from "axios";
import { INotificationService, NotificationContext } from "../../types/services";
import { logger } from "../../logger";

interface SlackBlock {
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
  elements?: unknown[];
}

interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

export class SlackNotificationAdapter implements INotificationService {
  private timeout: number;

  constructor(timeoutMs = 10000) {
    this.timeout = timeoutMs;
    logger.info("SlackNotificationAdapter initialized");
  }

  async sendNotification(webhookUrl: string, context: NotificationContext): Promise<void> {
    try {
      const message = this.buildMessage(context);

      await axios.post(webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      logger.info("Slack notification sent successfully", {
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Failed to send Slack notification", {
        error: err.message,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
      throw error;
    }
  }

  async testConnection(webhookUrl: string): Promise<boolean> {
    try {
      const testMessage: SlackMessage = {
        text: "Test notification from Dermatology EHR",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":white_check_mark: *Connection Test Successful*\n\nYour Slack integration is working correctly!",
            },
          },
        ],
      };

      await axios.post(webhookUrl, testMessage, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      return true;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Slack connection test failed", { error: err.message });
      return false;
    }
  }

  /**
   * Build Slack message based on notification type
   */
  private buildMessage(context: NotificationContext): SlackMessage {
    const data = context.data as Record<string, string>;
    const blocks: SlackBlock[] = [];

    // Add header based on notification type
    const { icon, title } = this.getNotificationHeader(context.notificationType);
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `${icon} ${title}`,
        emoji: true,
      },
    });

    // Add content section
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: this.getNotificationContent(context.notificationType, data),
      },
    });

    // Add divider
    blocks.push({ type: "divider" });

    // Add timestamp context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Sent at ${new Date().toISOString()} | Tenant: ${context.tenantId}`,
        },
      ],
    });

    return {
      text: title,
      blocks,
    };
  }

  private getNotificationHeader(type: string): { icon: string; title: string } {
    const headers: Record<string, { icon: string; title: string }> = {
      appointment_booked: { icon: ":calendar:", title: "New Appointment Booked" },
      appointment_cancelled: { icon: ":x:", title: "Appointment Cancelled" },
      patient_checked_in: { icon: ":wave:", title: "Patient Checked In" },
      prior_auth_approved: { icon: ":white_check_mark:", title: "Prior Authorization Approved" },
      prior_auth_denied: { icon: ":no_entry:", title: "Prior Authorization Denied" },
      lab_results_ready: { icon: ":test_tube:", title: "Lab Results Ready" },
      urgent_message: { icon: ":rotating_light:", title: "Urgent Message" },
      daily_schedule_summary: { icon: ":clipboard:", title: "Daily Schedule Summary" },
      end_of_day_report: { icon: ":chart_with_upwards_trend:", title: "End of Day Report" },
    };

    return headers[type] || { icon: ":bell:", title: "Notification" };
  }

  private getNotificationContent(type: string, data: Record<string, string>): string {
    switch (type) {
      case "appointment_booked":
        return `*Patient:* ${data.patientName || "N/A"}\n*Provider:* ${data.providerName || "N/A"}\n*Date:* ${data.appointmentDate || "N/A"} at ${data.appointmentTime || "N/A"}`;
      case "appointment_cancelled":
        return `*Patient:* ${data.patientName || "N/A"}\n*Reason:* ${data.reason || "Not specified"}`;
      case "patient_checked_in":
        return `*Patient:* ${data.patientName || "N/A"}\n*Appointment Time:* ${data.appointmentTime || "N/A"}`;
      case "prior_auth_approved":
      case "prior_auth_denied":
        return `*Patient:* ${data.patientName || "N/A"}\n*Procedure:* ${data.procedure || "N/A"}\n*Insurance:* ${data.insurance || "N/A"}`;
      case "lab_results_ready":
        return `*Patient:* ${data.patientName || "N/A"}\n*Test:* ${data.testName || "N/A"}`;
      case "urgent_message":
        return `*From:* ${data.from || "N/A"}\n*Message:* ${data.message || "N/A"}`;
      default:
        return JSON.stringify(data, null, 2);
    }
  }
}
