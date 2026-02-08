export type IntegrationType = "slack" | "teams";

export type NotificationType =
  | "appointment_booked"
  | "appointment_cancelled"
  | "patient_checked_in"
  | "prior_auth_approved"
  | "prior_auth_denied"
  | "prior_auth_needed"
  | "lab_results_ready"
  | "critical_lab_result"
  | "urgent_message"
  | "daily_schedule_summary"
  | "end_of_day_report"
  | "claim_created"
  | "claim_scrub_error"
  | "claim_denied"
  | "claim_paid"
  | "payment_received";

export interface Integration {
  id: string;
  tenantId: string;
  type: IntegrationType;
  webhookUrl: string;
  channelName?: string;
  enabled: boolean;
  notificationTypes: NotificationType[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationLog {
  id: string;
  integrationId: string;
  tenantId: string;
  notificationType: NotificationType;
  success: boolean;
  errorMessage?: string;
  sentAt: Date;
}

export interface NotificationContext {
  tenantId: string;
  notificationType: NotificationType;
  data: any;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

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

export interface TeamsMessage {
  type: string;
  attachments: Array<{
    contentType: string;
    content: any;
  }>;
}

export interface AdaptiveCard {
  type: string;
  version: string;
  body: any[];
  actions?: any[];
}
