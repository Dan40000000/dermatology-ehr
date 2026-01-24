/**
 * ServiceProvider - Service Registration
 *
 * Configures all services based on environment variables.
 * Determines whether to use real or mock implementations.
 *
 * Environment Variables:
 * - NODE_ENV: 'test' uses mocks by default
 * - USE_MOCK_SERVICES: 'true' forces mock implementations
 * - USE_REAL_SERVICES: 'true' forces real implementations (overrides USE_MOCK_SERVICES)
 *
 * Individual service mocks can be controlled with:
 * - USE_MOCK_STORAGE: 'true' to mock S3
 * - USE_MOCK_SMS: 'true' to mock Twilio
 * - USE_MOCK_NOTIFICATIONS: 'true' to mock Slack/Teams
 * - USE_MOCK_VIRUS_SCAN: 'true' to mock ClamAV
 * - USE_MOCK_EMAIL: 'true' to mock email
 *
 * Legacy aliases (still supported):
 * - USE_MOCK_TWILIO, USE_MOCK_SLACK, USE_MOCK_TEAMS, USE_MOCK_CLAMAV
 */

import { ServiceContainer } from "./ServiceContainer";
import { SERVICE_NAMES, IStorageService, ISmsService, INotificationService, IVirusScanService, IEmailService } from "./types/services";
import { logger } from "./logger";

// Mock implementations
import { MockStorageService } from "./services/mocks/MockStorageService";
import { MockSmsService } from "./services/mocks/MockSmsService";
import { MockNotificationService } from "./services/mocks/MockNotificationService";
import { MockVirusScanService } from "./services/mocks/MockVirusScanService";
import { MockEmailService } from "./services/mocks/MockEmailService";

// Real implementations
import { S3StorageAdapter } from "./services/adapters/S3StorageAdapter";
import { TwilioSmsAdapter } from "./services/adapters/TwilioSmsAdapter";
import { SlackNotificationAdapter } from "./services/adapters/SlackNotificationAdapter";
import { TeamsNotificationAdapter } from "./services/adapters/TeamsNotificationAdapter";
import { ClamAVVirusScanAdapter } from "./services/adapters/ClamAVVirusScanAdapter";
import { SmtpEmailAdapter } from "./services/adapters/SmtpEmailAdapter";

import { env } from "../config/env";
import { config } from "../config";

/**
 * Determine if mock services should be used
 */
function shouldUseMocks(): boolean {
  // Force real services if explicitly requested
  if (process.env.USE_REAL_SERVICES === "true") {
    return false;
  }

  // Force mock services if explicitly requested
  if (process.env.USE_MOCK_SERVICES === "true") {
    return true;
  }

  // Default to mocks in test environment
  return process.env.NODE_ENV === "test";
}

/**
 * Check if a specific service should use mock implementation
 */
function shouldMockService(serviceEnvVar: string | string[]): boolean {
  const globalMock = shouldUseMocks();

  const envVars = Array.isArray(serviceEnvVar) ? serviceEnvVar : [serviceEnvVar];
  const overrides = envVars
    .map((name) => process.env[name])
    .filter((value): value is string => value !== undefined);

  if (overrides.some((value) => value === "true")) {
    return true;
  }
  if (overrides.some((value) => value === "false")) {
    return false;
  }

  return globalMock;
}

/**
 * Check if required credentials are available for a service
 */
function hasCredentials(keys: string[]): boolean {
  return keys.every((key) => {
    const value = process.env[key];
    return value !== undefined && value !== "";
  });
}

/**
 * Register all services in the container
 */
export function registerServices(container: ServiceContainer): void {
  logger.info("Registering services", {
    environment: process.env.NODE_ENV,
    useMocks: shouldUseMocks(),
  });

  registerStorageService(container);
  registerSmsService(container);
  registerNotificationServices(container);
  registerVirusScanService(container);
  registerEmailService(container);

  logger.info("All services registered", {
    services: container.getRegisteredServices(),
  });
}

/**
 * Register storage service (S3 or mock)
 */
function registerStorageService(container: ServiceContainer): void {
  const useMock = shouldMockService("USE_MOCK_STORAGE");
  const hasS3Config = hasCredentials(["AWS_S3_BUCKET"]) && (hasCredentials(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) || env.s3Region);

  if (useMock || !hasS3Config) {
    if (!useMock && !hasS3Config) {
      logger.warn("S3 credentials not configured, using mock storage service");
    }

    container.registerSingleton<IStorageService>(SERVICE_NAMES.STORAGE, () => new MockStorageService());
    logger.debug("Registered MockStorageService");
  } else {
    container.registerSingleton<IStorageService>(SERVICE_NAMES.STORAGE, () => new S3StorageAdapter());
    logger.debug("Registered S3StorageAdapter");
  }
}

/**
 * Register SMS service (Twilio or mock)
 */
function registerSmsService(container: ServiceContainer): void {
  const useMock = shouldMockService(["USE_MOCK_SMS", "USE_MOCK_TWILIO"]);
  const hasTwilioConfig = hasCredentials(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);

  if (useMock || !hasTwilioConfig) {
    if (!useMock && !hasTwilioConfig) {
      logger.warn("Twilio credentials not configured, using mock SMS service");
    }

    container.registerSingleton<ISmsService>(SERVICE_NAMES.SMS, () => new MockSmsService());
    logger.debug("Registered MockSmsService");
  } else {
    container.registerSingleton<ISmsService>(SERVICE_NAMES.SMS, () =>
      new TwilioSmsAdapter({
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
      })
    );
    logger.debug("Registered TwilioSmsAdapter");
  }
}

/**
 * Register notification services (Slack/Teams or mocks)
 */
function registerNotificationServices(container: ServiceContainer): void {
  const useMock = shouldMockService(["USE_MOCK_NOTIFICATIONS", "USE_MOCK_SLACK", "USE_MOCK_TEAMS"]);

  // Slack notification service
  if (useMock) {
    container.registerSingleton<INotificationService>(
      SERVICE_NAMES.NOTIFICATION_SLACK,
      () => new MockNotificationService("Slack")
    );
    logger.debug("Registered MockNotificationService (Slack)");
  } else {
    container.registerSingleton<INotificationService>(
      SERVICE_NAMES.NOTIFICATION_SLACK,
      () => new SlackNotificationAdapter()
    );
    logger.debug("Registered SlackNotificationAdapter");
  }

  // Teams notification service
  if (useMock) {
    container.registerSingleton<INotificationService>(
      SERVICE_NAMES.NOTIFICATION_TEAMS,
      () => new MockNotificationService("Teams")
    );
    logger.debug("Registered MockNotificationService (Teams)");
  } else {
    container.registerSingleton<INotificationService>(
      SERVICE_NAMES.NOTIFICATION_TEAMS,
      () => new TeamsNotificationAdapter()
    );
    logger.debug("Registered TeamsNotificationAdapter");
  }
}

/**
 * Register virus scan service (ClamAV or mock)
 */
function registerVirusScanService(container: ServiceContainer): void {
  const useMock = shouldMockService(["USE_MOCK_VIRUS_SCAN", "USE_MOCK_CLAMAV"]);
  const hasClamAVConfig = env.clamavHost !== undefined && env.clamavHost !== "";

  if (useMock || !hasClamAVConfig) {
    if (!useMock && !hasClamAVConfig) {
      logger.warn("ClamAV not configured, using mock virus scan service");
    }

    container.registerSingleton<IVirusScanService>(SERVICE_NAMES.VIRUS_SCAN, () => new MockVirusScanService());
    logger.debug("Registered MockVirusScanService");
  } else {
    container.registerSingleton<IVirusScanService>(SERVICE_NAMES.VIRUS_SCAN, () => new ClamAVVirusScanAdapter());
    logger.debug("Registered ClamAVVirusScanAdapter");
  }
}

/**
 * Register email service (SMTP or mock)
 */
function registerEmailService(container: ServiceContainer): void {
  const useMock = shouldMockService("USE_MOCK_EMAIL");
  const hasSmtpConfig = hasCredentials(["SMTP_HOST"]);

  if (useMock || !hasSmtpConfig) {
    if (!useMock && !hasSmtpConfig) {
      logger.warn("SMTP not configured, using mock email service");
    }

    container.registerSingleton<IEmailService>(SERVICE_NAMES.EMAIL, () => new MockEmailService());
    logger.debug("Registered MockEmailService");
  } else {
    container.registerSingleton<IEmailService>(SERVICE_NAMES.EMAIL, () => new SmtpEmailAdapter());
    logger.debug("Registered SmtpEmailAdapter");
  }
}

/**
 * Create a test container with all mock services
 */
export function createTestContainer(): ServiceContainer {
  const testContainer = new ServiceContainer();

  testContainer.registerSingleton<IStorageService>(SERVICE_NAMES.STORAGE, () => new MockStorageService());
  testContainer.registerSingleton<ISmsService>(SERVICE_NAMES.SMS, () => new MockSmsService());
  testContainer.registerSingleton<INotificationService>(SERVICE_NAMES.NOTIFICATION_SLACK, () => new MockNotificationService("Slack"));
  testContainer.registerSingleton<INotificationService>(SERVICE_NAMES.NOTIFICATION_TEAMS, () => new MockNotificationService("Teams"));
  testContainer.registerSingleton<IVirusScanService>(SERVICE_NAMES.VIRUS_SCAN, () => new MockVirusScanService());
  testContainer.registerSingleton<IEmailService>(SERVICE_NAMES.EMAIL, () => new MockEmailService());

  return testContainer;
}
