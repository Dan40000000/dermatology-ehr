/**
 * Global Service Container
 *
 * Pre-configured container instance that is initialized on import.
 * Services are lazily initialized on first access.
 *
 * Usage:
 *   import { container } from '@/lib/container';
 *
 *   const smsService = container.get<ISmsService>('sms');
 *   await smsService.sendSMS(params);
 *
 * Testing:
 *   import { container, resetContainer, getContainer } from '@/lib/container';
 *
 *   beforeEach(() => {
 *     resetContainer(); // Reset to fresh state
 *   });
 *
 *   // Or create isolated test container:
 *   import { createTestContainer } from '@/lib/ServiceProvider';
 *   const testContainer = createTestContainer();
 */

import { ServiceContainer } from "./ServiceContainer";
import { registerServices, createTestContainer } from "./ServiceProvider";
import {
  SERVICE_NAMES,
  ServiceName,
  ServiceTypeMap,
  IStorageService,
  ISmsService,
  INotificationService,
  IVirusScanService,
  IEmailService,
} from "./types/services";

// Global container instance
let globalContainer: ServiceContainer | null = null;

/**
 * Initialize the global container if not already initialized
 */
function ensureInitialized(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
    registerServices(globalContainer);
  }
  return globalContainer;
}

/**
 * Get the global container instance
 *
 * Initializes the container on first call if not already initialized.
 */
export function getContainer(): ServiceContainer {
  return ensureInitialized();
}

/**
 * Reset the global container
 *
 * Clears all registrations and re-registers services.
 * Primarily used for testing.
 */
export function resetContainer(): void {
  if (globalContainer) {
    globalContainer.reset();
  }
  globalContainer = new ServiceContainer();
  registerServices(globalContainer);
}

/**
 * Reset only singleton instances (keep registrations)
 *
 * Useful for testing when you want fresh instances
 * but keep the same service registrations.
 */
export function resetContainerInstances(): void {
  if (globalContainer) {
    globalContainer.resetInstances();
  }
}

/**
 * Replace the global container with a custom one
 *
 * Useful for testing with custom mock configurations.
 *
 * @param customContainer - Custom container to use
 */
export function setContainer(customContainer: ServiceContainer): void {
  globalContainer = customContainer;
}

/**
 * Type-safe service getter
 *
 * @param name - Service name from SERVICE_NAMES
 * @returns Typed service instance
 */
export function getService<K extends ServiceName>(name: K): ServiceTypeMap[K] {
  return ensureInitialized().get<ServiceTypeMap[K]>(name);
}

// ============================================================================
// Convenience Accessors
// ============================================================================

/**
 * Get storage service (S3 or mock)
 */
export function getStorageService(): IStorageService {
  return getService(SERVICE_NAMES.STORAGE);
}

/**
 * Get SMS service (Twilio or mock)
 */
export function getSmsService(): ISmsService {
  return getService(SERVICE_NAMES.SMS);
}

/**
 * Get Slack notification service
 */
export function getSlackNotificationService(): INotificationService {
  return getService(SERVICE_NAMES.NOTIFICATION_SLACK);
}

/**
 * Get Teams notification service
 */
export function getTeamsNotificationService(): INotificationService {
  return getService(SERVICE_NAMES.NOTIFICATION_TEAMS);
}

/**
 * Get virus scan service (ClamAV or mock)
 */
export function getVirusScanService(): IVirusScanService {
  return getService(SERVICE_NAMES.VIRUS_SCAN);
}

/**
 * Get email service (SMTP or mock)
 */
export function getEmailService(): IEmailService {
  return getService(SERVICE_NAMES.EMAIL);
}

// ============================================================================
// Proxy Container Export
// ============================================================================

/**
 * Proxy object that lazily initializes the container
 *
 * This allows importing `container` without triggering initialization
 * until a method is actually called.
 */
export const container: ServiceContainer = new Proxy({} as ServiceContainer, {
  get(_target, prop: keyof ServiceContainer) {
    const realContainer = ensureInitialized();
    const value = realContainer[prop];
    if (typeof value === "function") {
      return value.bind(realContainer);
    }
    return value;
  },
});

// Re-export for convenience
export { SERVICE_NAMES, createTestContainer };
export type {
  ServiceName,
  ServiceTypeMap,
  IStorageService,
  ISmsService,
  INotificationService,
  IVirusScanService,
  IEmailService,
};
