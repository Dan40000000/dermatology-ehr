/**
 * Service Adapters Index
 *
 * Export all real service adapter implementations.
 */

export { S3StorageAdapter, type S3StorageConfig } from "./S3StorageAdapter";
export { TwilioSmsAdapter, type TwilioConfig } from "./TwilioSmsAdapter";
export { SlackNotificationAdapter } from "./SlackNotificationAdapter";
export { TeamsNotificationAdapter } from "./TeamsNotificationAdapter";
export { ClamAVVirusScanAdapter, type ClamAVConfig } from "./ClamAVVirusScanAdapter";
export { SmtpEmailAdapter, type SmtpConfig } from "./SmtpEmailAdapter";
