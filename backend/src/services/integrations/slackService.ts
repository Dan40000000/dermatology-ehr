import axios from "axios";
import { logger } from "../../lib/logger";
import { SlackMessage, SlackBlock, NotificationContext } from "./types";
import { messageTemplates } from "./messageTemplates";

export class SlackService {
  /**
   * Send a notification to Slack
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

      logger.info("Slack notification sent successfully", {
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
    } catch (error: any) {
      logger.error("Failed to send Slack notification", {
        error: error.message,
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      });
      throw error;
    }
  }

  /**
   * Test Slack webhook connection
   */
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
        timeout: 10000,
      });

      return true;
    } catch (error: any) {
      logger.error("Slack connection test failed", { error: error.message });
      return false;
    }
  }

  /**
   * Build Slack message based on notification type
   */
  private buildMessage(context: NotificationContext): SlackMessage {
    const template = messageTemplates[context.notificationType];

    if (!template) {
      throw new Error(`No template found for notification type: ${context.notificationType}`);
    }

    return template.buildSlackMessage(context.data);
  }

  /**
   * Create a Slack block with header and fields
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
   * Create a Slack context block (for timestamps, metadata)
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
}

export const slackService = new SlackService();
