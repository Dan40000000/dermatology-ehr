/**
 * Service Interface Definitions
 *
 * These interfaces define the contracts for all external services used in the application.
 * Both real implementations and mock implementations must adhere to these interfaces.
 *
 * This enables:
 * - Easy swapping between real and mock implementations
 * - Type-safe dependency injection
 * - Testability without external dependencies
 */

// ============================================================================
// Storage Service (S3/Local)
// ============================================================================

export interface StorageUploadResult {
  key: string;
  signedUrl: string;
}

export interface IStorageService {
  /**
   * Upload a file to storage
   * @param buffer - File content as Buffer
   * @param contentType - MIME type of the file
   * @param originalName - Original filename for key generation
   * @returns Upload result with storage key and signed URL
   */
  putObject(buffer: Buffer, contentType: string, originalName: string): Promise<StorageUploadResult>;

  /**
   * Get a signed URL for accessing a stored object
   * @param key - Storage key of the object
   * @param expiresInSeconds - URL expiration time (default 300)
   * @returns Signed URL string
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Fetch object content as a Buffer
   * @param key - Storage key of the object
   * @returns File content as Buffer
   */
  fetchObject(key: string): Promise<Buffer>;

  /**
   * Delete an object from storage
   * @param key - Storage key of the object
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Check if an object exists in storage
   * @param key - Storage key of the object
   * @returns true if object exists
   */
  exists(key: string): Promise<boolean>;
}

// ============================================================================
// SMS Service (Twilio)
// ============================================================================

export interface SendSMSParams {
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

export interface SendSMSResult {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  numSegments: number;
  price?: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface ISmsService {
  /**
   * Send an SMS or MMS message
   * @param params - SMS parameters including to, from, body
   * @returns SMS result with status and metadata
   */
  sendSMS(params: SendSMSParams): Promise<SendSMSResult>;

  /**
   * Validate webhook signature for incoming messages
   * @param signature - Twilio signature header
   * @param url - Full webhook URL
   * @param params - Request body parameters
   * @returns true if signature is valid
   */
  validateWebhookSignature(signature: string, url: string, params: Record<string, unknown>): boolean;

  /**
   * Get message details by SID
   * @param messageSid - Twilio message SID
   * @returns Message details
   */
  getMessageDetails(messageSid: string): Promise<SendSMSResult>;

  /**
   * Test connection to SMS provider
   * @returns Connection test result
   */
  testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }>;

  /**
   * Calculate segment count for SMS cost estimation
   * @param messageBody - Message text content
   * @returns Number of SMS segments
   */
  calculateSegmentCount(messageBody: string): number;
}

// ============================================================================
// Notification Service (Slack/Teams)
// ============================================================================

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

export interface NotificationContext {
  tenantId: string;
  notificationType: NotificationType;
  data: Record<string, unknown>;
}

export interface INotificationService {
  /**
   * Send notification to configured channels (Slack/Teams)
   * @param webhookUrl - Webhook URL for the notification channel
   * @param context - Notification context with type and data
   */
  sendNotification(webhookUrl: string, context: NotificationContext): Promise<void>;

  /**
   * Test webhook connection
   * @param webhookUrl - Webhook URL to test
   * @returns true if connection is successful
   */
  testConnection(webhookUrl: string): Promise<boolean>;
}

// ============================================================================
// Virus Scan Service (ClamAV)
// ============================================================================

export interface VirusScanResult {
  clean: boolean;
  malwareDetected?: string;
  scanTime: number;
  error?: string;
}

export interface IVirusScanService {
  /**
   * Scan a file buffer for viruses
   * @param buffer - File content to scan
   * @returns Scan result indicating if file is clean
   */
  scanBuffer(buffer: Buffer): Promise<VirusScanResult>;

  /**
   * Check if virus scanning is available
   * @returns true if ClamAV is reachable
   */
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Email Service
// ============================================================================

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface IEmailService {
  /**
   * Send an email
   * @param params - Email parameters
   * @returns Send result with message ID and delivery status
   */
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Send a templated email
   * @param templateId - Template identifier
   * @param to - Recipient email address(es)
   * @param variables - Template variables
   * @returns Send result
   */
  sendTemplatedEmail(
    templateId: string,
    to: string | string[],
    variables: Record<string, unknown>
  ): Promise<SendEmailResult>;

  /**
   * Verify email service connection
   * @returns true if service is available
   */
  verifyConnection(): Promise<boolean>;
}

// ============================================================================
// Service Names (for type-safe container access)
// ============================================================================

export const SERVICE_NAMES = {
  STORAGE: "storage",
  SMS: "sms",
  NOTIFICATION_SLACK: "notification:slack",
  NOTIFICATION_TEAMS: "notification:teams",
  VIRUS_SCAN: "virusScan",
  EMAIL: "email",
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

// ============================================================================
// Service Type Map (maps service names to their interfaces)
// ============================================================================

export interface ServiceTypeMap {
  [SERVICE_NAMES.STORAGE]: IStorageService;
  [SERVICE_NAMES.SMS]: ISmsService;
  [SERVICE_NAMES.NOTIFICATION_SLACK]: INotificationService;
  [SERVICE_NAMES.NOTIFICATION_TEAMS]: INotificationService;
  [SERVICE_NAMES.VIRUS_SCAN]: IVirusScanService;
  [SERVICE_NAMES.EMAIL]: IEmailService;
}
