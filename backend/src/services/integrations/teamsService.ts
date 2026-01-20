import axios from "axios";
import { logger } from "../../lib/logger";
import { TeamsMessage, AdaptiveCard, NotificationContext } from "./types";
import { messageTemplates } from "./messageTemplates";

export class TeamsService {
  /**
   * Send a notification to Microsoft Teams
   */
  async sendNotification(
    webhookUrl: string,
    context: NotificationContext
  ): Promise<void> {
    try {
      const message = this.buildMessage(context);

      await axios.post(webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      logger.info("Teams notification sent successfully", {
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
    } catch (error: any) {
      logger.error("Failed to send Teams notification", {
        error: error.message,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
      throw error;
    }
  }

  /**
   * Test Teams webhook connection
   */
  async testConnection(webhookUrl: string): Promise<boolean> {
    try {
      const testCard = this.createAdaptiveCard({
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
            content: testCard,
          },
        ],
      };

      await axios.post(webhookUrl, message, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      return true;
    } catch (error: any) {
      logger.error("Teams connection test failed", { error: error.message });
      return false;
    }
  }

  /**
   * Build Teams message based on notification type
   */
  private buildMessage(context: NotificationContext): TeamsMessage {
    const template = messageTemplates[context.notificationType];

    if (!template) {
      throw new Error(`No template found for notification type: ${context.notificationType}`);
    }

    return template.buildTeamsMessage(context.data);
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
}

export const teamsService = new TeamsService();
