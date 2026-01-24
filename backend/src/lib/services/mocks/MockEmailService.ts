/**
 * Mock Email Service
 *
 * In-memory implementation of IEmailService for testing and development.
 * Logs emails instead of sending them via SMTP/SendGrid/SES.
 */

import crypto from "crypto";
import { IEmailService, SendEmailParams, SendEmailResult } from "../../types/services";
import { logger } from "../../logger";

export interface SentEmail extends SendEmailParams {
  id: string;
  sentAt: Date;
}

export class MockEmailService implements IEmailService {
  private sentEmails: SentEmail[] = [];
  private simulateFailure = false;
  private failureMessage = "Simulated email failure";
  private templates: Map<string, (variables: Record<string, unknown>) => { subject: string; html: string }> =
    new Map();

  constructor() {
    logger.info("MockEmailService initialized");
    this.registerDefaultTemplates();
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    if (this.simulateFailure) {
      logger.warn("Mock email: simulating failure", { to: params.to });
      throw new Error(this.failureMessage);
    }

    const to = Array.isArray(params.to) ? params.to : [params.to];
    const messageId = `<${crypto.randomUUID()}@mock.dermatologyehr.com>`;

    const email: SentEmail = {
      ...params,
      id: messageId,
      sentAt: new Date(),
    };

    this.sentEmails.push(email);

    logger.info("Mock email sent", {
      messageId,
      to,
      subject: params.subject,
      hasHtml: !!params.html,
      hasAttachments: !!params.attachments?.length,
    });

    return {
      messageId,
      accepted: to,
      rejected: [],
    };
  }

  async sendTemplatedEmail(
    templateId: string,
    to: string | string[],
    variables: Record<string, unknown>
  ): Promise<SendEmailResult> {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Email template not found: ${templateId}`);
    }

    const { subject, html } = template(variables);

    return this.sendEmail({
      to,
      subject,
      html,
    });
  }

  async verifyConnection(): Promise<boolean> {
    if (this.simulateFailure) {
      logger.warn("Mock email: connection verification failed (simulated)");
      return false;
    }

    logger.info("Mock email: connection verified");
    return true;
  }

  /**
   * Register default email templates
   */
  private registerDefaultTemplates(): void {
    // Appointment reminder template
    this.templates.set("appointment_reminder", (vars) => ({
      subject: `Appointment Reminder - ${vars.appointmentDate as string}`,
      html: `
        <h1>Appointment Reminder</h1>
        <p>Dear ${vars.patientName as string},</p>
        <p>This is a reminder for your upcoming appointment:</p>
        <ul>
          <li>Date: ${vars.appointmentDate as string}</li>
          <li>Time: ${vars.appointmentTime as string}</li>
          <li>Provider: ${vars.providerName as string}</li>
        </ul>
        <p>If you need to reschedule, please call ${vars.clinicPhone as string}.</p>
      `,
    }));

    // Password reset template
    this.templates.set("password_reset", (vars) => ({
      subject: "Password Reset Request",
      html: `
        <h1>Password Reset</h1>
        <p>You requested a password reset. Click the link below:</p>
        <p><a href="${vars.resetLink as string}">Reset Password</a></p>
        <p>This link expires in ${vars.expiresIn as string}.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    }));

    // New message notification template
    this.templates.set("new_message", (vars) => ({
      subject: "You have a new message",
      html: `
        <h1>New Message</h1>
        <p>Dear ${vars.recipientName as string},</p>
        <p>You have received a new message from your healthcare provider.</p>
        <p>Please log in to your patient portal to view the message.</p>
      `,
    }));
  }

  // =========================================================================
  // Test Helper Methods
  // =========================================================================

  /**
   * Register a custom template (for testing)
   */
  registerTemplate(
    templateId: string,
    builder: (variables: Record<string, unknown>) => { subject: string; html: string }
  ): void {
    this.templates.set(templateId, builder);
    logger.debug("Mock email: template registered", { templateId });
  }

  /**
   * Get all sent emails (for testing)
   */
  getSentEmails(): SentEmail[] {
    return [...this.sentEmails];
  }

  /**
   * Get the last sent email (for testing)
   */
  getLastEmail(): SentEmail | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  /**
   * Clear all sent emails (for testing)
   */
  clearEmails(): void {
    this.sentEmails = [];
    logger.debug("Mock email: cleared all emails");
  }

  /**
   * Set whether to simulate failures (for testing)
   */
  setSimulateFailure(shouldFail: boolean, message = "Simulated email failure"): void {
    this.simulateFailure = shouldFail;
    this.failureMessage = message;
    logger.debug("Mock email: simulate failure set", { shouldFail });
  }

  /**
   * Get email count (for testing)
   */
  getEmailCount(): number {
    return this.sentEmails.length;
  }

  /**
   * Find emails by recipient (for testing)
   */
  findEmailsByRecipient(email: string): SentEmail[] {
    return this.sentEmails.filter((e) => {
      const to = Array.isArray(e.to) ? e.to : [e.to];
      return to.includes(email);
    });
  }

  /**
   * Find emails by subject (for testing)
   */
  findEmailsBySubject(subject: string): SentEmail[] {
    return this.sentEmails.filter((e) => e.subject.includes(subject));
  }
}
