/**
 * Microsoft Teams Notification Adapter
 *
 * Adapter that wraps Teams webhook integration to implement INotificationService interface.
 */

import axios from "axios";
import { INotificationService, NotificationContext } from "../../types/services";
import { logger } from "../../logger";

interface AdaptiveCard {
  type: string;
  version: string;
  body: unknown[];
  actions?: unknown[];
}

interface TeamsMessage {
  type: string;
  attachments: Array<{
    contentType: string;
    content: AdaptiveCard;
  }>;
}

export class TeamsNotificationAdapter implements INotificationService {
  private timeout: number;

  constructor(timeoutMs = 10000) {
    this.timeout = timeoutMs;
    logger.info("TeamsNotificationAdapter initialized");
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

      logger.info("Teams notification sent successfully", {
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Failed to send Teams notification", {
        error: err.message,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
      throw error;
    }
  }

  async testConnection(webhookUrl: string): Promise<boolean> {
    try {
      const card = this.createAdaptiveCard({
        title: "Connection Test Successful",
        subtitle: "Dermatology EHR Integration",
        text: "Your Microsoft Teams integration is working correctly!",
        themeColor: "00C851",
      });

      const message: TeamsMessage = {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: card,
          },
        ],
      };

      await axios.post(webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      return true;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Teams connection test failed", { error: err.message });
      return false;
    }
  }

  /**
   * Build Teams message based on notification type
   */
  private buildMessage(context: NotificationContext): TeamsMessage {
    const data = context.data as Record<string, string>;
    const { title, themeColor } = this.getNotificationHeader(context.notificationType);

    const card = this.createAdaptiveCard({
      title,
      subtitle: `Tenant: ${context.tenantId}`,
      text: this.getNotificationContent(context.notificationType, data),
      themeColor,
      facts: this.getNotificationFacts(context.notificationType, data),
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

  private createAdaptiveCard(config: {
    title: string;
    subtitle?: string;
    text: string;
    themeColor?: string;
    facts?: Array<{ title: string; value: string }>;
    actions?: Array<{ type: string; title: string; url: string }>;
  }): AdaptiveCard {
    const body: unknown[] = [
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

    // Add timestamp
    body.push({
      type: "TextBlock",
      text: `Sent: ${new Date().toISOString()}`,
      size: "Small",
      color: "Light",
      spacing: "Medium",
    });

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

  private getNotificationHeader(type: string): { title: string; themeColor: string } {
    const headers: Record<string, { title: string; themeColor: string }> = {
      appointment_booked: { title: "New Appointment Booked", themeColor: "0078D7" },
      appointment_cancelled: { title: "Appointment Cancelled", themeColor: "FF4444" },
      patient_checked_in: { title: "Patient Checked In", themeColor: "00C851" },
      prior_auth_approved: { title: "Prior Authorization Approved", themeColor: "00C851" },
      prior_auth_denied: { title: "Prior Authorization Denied", themeColor: "FF4444" },
      lab_results_ready: { title: "Lab Results Ready", themeColor: "FFBB33" },
      urgent_message: { title: "Urgent Message", themeColor: "FF4444" },
      daily_schedule_summary: { title: "Daily Schedule Summary", themeColor: "0078D7" },
      end_of_day_report: { title: "End of Day Report", themeColor: "0078D7" },
    };

    return headers[type] || { title: "Notification", themeColor: "0078D7" };
  }

  private getNotificationContent(type: string, data: Record<string, string>): string {
    switch (type) {
      case "appointment_booked":
        return `A new appointment has been scheduled for ${data.patientName || "a patient"}.`;
      case "appointment_cancelled":
        return `An appointment for ${data.patientName || "a patient"} has been cancelled.`;
      case "patient_checked_in":
        return `${data.patientName || "A patient"} has checked in for their appointment.`;
      case "prior_auth_approved":
        return `Prior authorization has been approved for ${data.patientName || "a patient"}.`;
      case "prior_auth_denied":
        return `Prior authorization has been denied for ${data.patientName || "a patient"}.`;
      case "lab_results_ready":
        return `Lab results are ready for ${data.patientName || "a patient"}.`;
      case "urgent_message":
        return data.message || "An urgent message requires your attention.";
      default:
        return "A new notification requires your attention.";
    }
  }

  private getNotificationFacts(type: string, data: Record<string, string>): Array<{ title: string; value: string }> {
    const facts: Array<{ title: string; value: string }> = [];

    if (data.patientName) {
      facts.push({ title: "Patient", value: data.patientName });
    }

    if (data.providerName) {
      facts.push({ title: "Provider", value: data.providerName });
    }

    if (data.appointmentDate) {
      facts.push({ title: "Date", value: data.appointmentDate });
    }

    if (data.appointmentTime) {
      facts.push({ title: "Time", value: data.appointmentTime });
    }

    if (data.reason) {
      facts.push({ title: "Reason", value: data.reason });
    }

    if (data.procedure) {
      facts.push({ title: "Procedure", value: data.procedure });
    }

    if (data.insurance) {
      facts.push({ title: "Insurance", value: data.insurance });
    }

    return facts;
  }
}
