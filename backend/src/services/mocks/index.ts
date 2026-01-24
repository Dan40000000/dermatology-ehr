/**
 * Mock Services Index
 *
 * This module exports all mock service adapters for development and testing.
 * Mock services provide in-memory implementations of external services like
 * S3, Twilio, Slack, Teams, and ClamAV, allowing development without credentials
 * and enabling comprehensive unit/integration testing.
 *
 * @example
 * ```typescript
 * // Import individual mocks
 * import { MockS3Service, MockTwilioService } from './services/mocks';
 *
 * // Use factory function
 * import { createMockServices } from './services/mocks';
 * const mocks = createMockServices({ simulatedDelay: 50 });
 *
 * // Use singleton instances
 * import { mockS3Service, mockTwilioService } from './services/mocks';
 * ```
 */

// ============================================================
// S3 Mock Service
// ============================================================
export {
  MockS3Service,
  createMockS3Service,
  mockS3Service,
  type MockS3Config,
  type StoredObject,
  type PutObjectResult,
  type ListObjectsResult,
  type S3OperationLog,
} from "./MockS3Service";

// ============================================================
// Twilio Mock Service
// ============================================================
export {
  MockTwilioService,
  createMockTwilioService,
  mockTwilioService,
  type MockTwilioConfig,
  type SendSMSParams,
  type SendSMSResult,
  type AppointmentReminderParams,
  type StoredMessage,
  type TwilioOperationLog,
} from "./MockTwilioService";

// ============================================================
// Slack Mock Service
// ============================================================
export {
  MockSlackService,
  createMockSlackService,
  mockSlackService,
  type MockSlackConfig,
  type NotificationContext as SlackNotificationContext,
  type SlackMessage,
  type SlackBlock,
  type StoredNotification as SlackStoredNotification,
  type SlackOperationLog,
  type NotificationType as SlackNotificationType,
} from "./MockSlackService";

// ============================================================
// Teams Mock Service
// ============================================================
export {
  MockTeamsService,
  createMockTeamsService,
  mockTeamsService,
  type MockTeamsConfig,
  type NotificationContext as TeamsNotificationContext,
  type TeamsMessage,
  type AdaptiveCard,
  type StoredNotification as TeamsStoredNotification,
  type TeamsOperationLog,
  type NotificationType as TeamsNotificationType,
} from "./MockTeamsService";

// ============================================================
// ClamAV Mock Service
// ============================================================
export {
  MockClamAVService,
  createMockClamAVService,
  mockClamAVService,
  type MockClamAVConfig,
  type ScanResult,
  type StoredScan,
  type ClamAVOperationLog,
} from "./MockClamAVService";

// ============================================================
// Common Types
// ============================================================

/**
 * Common notification type used by both Slack and Teams
 */
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

/**
 * Common notification context
 */
export interface NotificationContext {
  tenantId: string;
  notificationType: NotificationType;
  data: any;
}

// ============================================================
// Factory Configuration
// ============================================================

/**
 * Configuration for creating all mock services at once
 */
export interface MockServicesConfig {
  /** Simulated delay in milliseconds for all services (default: 0) */
  simulatedDelay?: number;
  /** Probability of failure (0-1) for all services (default: 0) */
  failureRate?: number;

  /** S3-specific configuration */
  s3?: {
    maxFileSize?: number;
    bucketName?: string;
  };

  /** Twilio-specific configuration */
  twilio?: {
    validatePhoneNumbers?: boolean;
    accountSid?: string;
  };

  /** Slack-specific configuration */
  slack?: {
    validateWebhookUrl?: boolean;
  };

  /** Teams-specific configuration */
  teams?: {
    validateWebhookUrl?: boolean;
  };

  /** ClamAV-specific configuration */
  clamav?: {
    available?: boolean;
    additionalInfectedPatterns?: string[];
    additionalInfectedFilenames?: string[];
  };
}

/**
 * Container for all mock service instances
 */
export interface MockServices {
  s3: import("./MockS3Service").MockS3Service;
  twilio: import("./MockTwilioService").MockTwilioService;
  slack: import("./MockSlackService").MockSlackService;
  teams: import("./MockTeamsService").MockTeamsService;
  clamav: import("./MockClamAVService").MockClamAVService;

  /**
   * Reset all services (clear stored data and logs)
   */
  resetAll(): void;

  /**
   * Clear all stored data (keep logs)
   */
  clearAllData(): void;

  /**
   * Clear all operation logs (keep data)
   */
  clearAllLogs(): void;

  /**
   * Set failure rate for all services
   */
  setFailureRate(rate: number): void;

  /**
   * Set simulated delay for all services
   */
  setSimulatedDelay(delay: number): void;
}

/**
 * Create all mock services with shared configuration
 *
 * @param config - Configuration options for all services
 * @returns Container with all mock service instances
 *
 * @example
 * ```typescript
 * const mocks = createMockServices({ simulatedDelay: 50, failureRate: 0.1 });
 *
 * // Use individual services
 * await mocks.s3.putObject(buffer, 'image/png', 'test.png');
 * await mocks.twilio.sendSMS({ to: '+1234567890', from: '+0987654321', body: 'Test' });
 *
 * // Reset all services between tests
 * mocks.resetAll();
 * ```
 */
export function createMockServices(config: MockServicesConfig = {}): MockServices {
  const { MockS3Service } = require("./MockS3Service");
  const { MockTwilioService } = require("./MockTwilioService");
  const { MockSlackService } = require("./MockSlackService");
  const { MockTeamsService } = require("./MockTeamsService");
  const { MockClamAVService } = require("./MockClamAVService");

  const s3 = new MockS3Service({
    simulatedDelay: config.simulatedDelay,
    failureRate: config.failureRate,
    ...config.s3,
  });

  const twilio = new MockTwilioService({
    simulatedDelay: config.simulatedDelay,
    failureRate: config.failureRate,
    ...config.twilio,
  });

  const slack = new MockSlackService({
    simulatedDelay: config.simulatedDelay,
    failureRate: config.failureRate,
    ...config.slack,
  });

  const teams = new MockTeamsService({
    simulatedDelay: config.simulatedDelay,
    failureRate: config.failureRate,
    ...config.teams,
  });

  const clamav = new MockClamAVService({
    simulatedDelay: config.simulatedDelay,
    failureRate: config.failureRate,
    ...config.clamav,
  });

  return {
    s3,
    twilio,
    slack,
    teams,
    clamav,

    resetAll() {
      s3.reset();
      twilio.reset();
      slack.reset();
      teams.reset();
      clamav.reset();
    },

    clearAllData() {
      s3.clearStorage();
      twilio.clearMessages();
      slack.clearNotifications();
      teams.clearNotifications();
      clamav.clearScans();
    },

    clearAllLogs() {
      s3.clearOperationLog();
      twilio.clearOperationLog();
      slack.clearOperationLog();
      teams.clearOperationLog();
      clamav.clearOperationLog();
    },

    setFailureRate(rate: number) {
      s3.setConfig({ failureRate: rate });
      twilio.setConfig({ failureRate: rate });
      slack.setConfig({ failureRate: rate });
      teams.setConfig({ failureRate: rate });
      clamav.setConfig({ failureRate: rate });
    },

    setSimulatedDelay(delay: number) {
      s3.setConfig({ simulatedDelay: delay });
      twilio.setConfig({ simulatedDelay: delay });
      slack.setConfig({ simulatedDelay: delay });
      teams.setConfig({ simulatedDelay: delay });
      clamav.setConfig({ simulatedDelay: delay });
    },
  };
}

/**
 * Get default singleton instances of all mock services
 *
 * @returns Container with default singleton mock service instances
 *
 * @example
 * ```typescript
 * const mocks = getDefaultMocks();
 * await mocks.s3.putObject(buffer, 'image/png', 'test.png');
 * ```
 */
export function getDefaultMocks(): MockServices {
  const { mockS3Service } = require("./MockS3Service");
  const { mockTwilioService } = require("./MockTwilioService");
  const { mockSlackService } = require("./MockSlackService");
  const { mockTeamsService } = require("./MockTeamsService");
  const { mockClamAVService } = require("./MockClamAVService");

  return {
    s3: mockS3Service,
    twilio: mockTwilioService,
    slack: mockSlackService,
    teams: mockTeamsService,
    clamav: mockClamAVService,

    resetAll() {
      mockS3Service.reset();
      mockTwilioService.reset();
      mockSlackService.reset();
      mockTeamsService.reset();
      mockClamAVService.reset();
    },

    clearAllData() {
      mockS3Service.clearStorage();
      mockTwilioService.clearMessages();
      mockSlackService.clearNotifications();
      mockTeamsService.clearNotifications();
      mockClamAVService.clearScans();
    },

    clearAllLogs() {
      mockS3Service.clearOperationLog();
      mockTwilioService.clearOperationLog();
      mockSlackService.clearOperationLog();
      mockTeamsService.clearOperationLog();
      mockClamAVService.clearOperationLog();
    },

    setFailureRate(rate: number) {
      mockS3Service.setConfig({ failureRate: rate });
      mockTwilioService.setConfig({ failureRate: rate });
      mockSlackService.setConfig({ failureRate: rate });
      mockTeamsService.setConfig({ failureRate: rate });
      mockClamAVService.setConfig({ failureRate: rate });
    },

    setSimulatedDelay(delay: number) {
      mockS3Service.setConfig({ simulatedDelay: delay });
      mockTwilioService.setConfig({ simulatedDelay: delay });
      mockSlackService.setConfig({ simulatedDelay: delay });
      mockTeamsService.setConfig({ simulatedDelay: delay });
      mockClamAVService.setConfig({ simulatedDelay: delay });
    },
  };
}

/**
 * Convenience function to check if we should use mocks
 * Based on NODE_ENV or USE_MOCK_SERVICES environment variable
 */
export function shouldUseMocks(): boolean {
  const env = process.env.NODE_ENV || "development";
  const forceMocks = process.env.USE_MOCK_SERVICES === "true";
  return forceMocks || env === "test" || env === "development";
}
