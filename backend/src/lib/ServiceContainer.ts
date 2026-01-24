/**
 * ServiceContainer - Dependency Injection Container
 *
 * A lightweight, type-safe dependency injection container that supports:
 * - Lazy initialization (services are created on first access)
 * - Singleton and transient service lifetimes
 * - Easy swapping for testing
 * - TypeScript generics for type safety
 *
 * Usage:
 *   import { container } from '@/lib/container';
 *   const smsService = container.get<ISmsService>('sms');
 */

import { logger } from "./logger";

/**
 * Factory function type for creating service instances
 */
export type ServiceFactory<T> = () => T;

/**
 * Service registration entry
 */
interface ServiceRegistration<T = unknown> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * ServiceContainer class
 *
 * Manages service registration and resolution with support for:
 * - Transient services (new instance each time)
 * - Singleton services (cached instance)
 * - Lazy initialization
 */
export class ServiceContainer {
  private services: Map<string, ServiceRegistration> = new Map();
  private resolving: Set<string> = new Set();

  /**
   * Register a transient service (new instance created on each get())
   *
   * @param name - Unique service identifier
   * @param factory - Factory function that creates the service instance
   *
   * @example
   * container.register<IStorageService>('storage', () => new S3StorageService());
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.services.has(name)) {
      logger.warn(`Service '${name}' is being overwritten`);
    }

    this.services.set(name, {
      factory,
      singleton: false,
    });
  }

  /**
   * Register a singleton service (instance cached after first creation)
   *
   * The factory is called lazily on first get() call.
   * Subsequent get() calls return the cached instance.
   *
   * @param name - Unique service identifier
   * @param factory - Factory function that creates the service instance
   *
   * @example
   * container.registerSingleton<ISmsService>('sms', () => {
   *   return new TwilioSmsService(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
   * });
   */
  registerSingleton<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.services.has(name)) {
      logger.warn(`Singleton service '${name}' is being overwritten`);
    }

    this.services.set(name, {
      factory,
      singleton: true,
      instance: undefined,
    });
  }

  /**
   * Register a pre-created instance as a singleton
   *
   * Useful for:
   * - Registering existing service instances
   * - Testing with mock objects
   *
   * @param name - Unique service identifier
   * @param instance - Pre-created service instance
   *
   * @example
   * container.registerInstance<ISmsService>('sms', mockSmsService);
   */
  registerInstance<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      logger.warn(`Service instance '${name}' is being overwritten`);
    }

    this.services.set(name, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  /**
   * Get a service by name
   *
   * For singletons, returns cached instance or creates one.
   * For transient services, always creates a new instance.
   *
   * @param name - Service identifier
   * @returns Service instance
   * @throws Error if service is not registered or circular dependency detected
   *
   * @example
   * const sms = container.get<ISmsService>('sms');
   * await sms.sendSMS({ to: '+1234567890', from: '+0987654321', body: 'Hello!' });
   */
  get<T>(name: string): T {
    const registration = this.services.get(name);

    if (!registration) {
      throw new Error(
        `Service '${name}' is not registered. ` +
          `Available services: ${Array.from(this.services.keys()).join(", ") || "(none)"}`
      );
    }

    // Detect circular dependencies
    if (this.resolving.has(name)) {
      throw new Error(
        `Circular dependency detected while resolving '${name}'. ` +
          `Resolution chain: ${Array.from(this.resolving).join(" -> ")} -> ${name}`
      );
    }

    // For singletons, return cached instance if available
    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance as T;
    }

    // Mark as resolving to detect circular dependencies
    this.resolving.add(name);

    try {
      const instance = registration.factory() as T;

      // Cache singleton instances
      if (registration.singleton) {
        registration.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Try to get a service, returning undefined if not registered
   *
   * @param name - Service identifier
   * @returns Service instance or undefined
   *
   * @example
   * const sms = container.tryGet<ISmsService>('sms');
   * if (sms) {
   *   await sms.sendSMS(params);
   * }
   */
  tryGet<T>(name: string): T | undefined {
    try {
      return this.has(name) ? this.get<T>(name) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a service is registered
   *
   * @param name - Service identifier
   * @returns true if service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Remove a service registration
   *
   * @param name - Service identifier
   * @returns true if service was removed
   */
  unregister(name: string): boolean {
    return this.services.delete(name);
  }

  /**
   * Get all registered service names
   *
   * @returns Array of service names
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Check if a service is registered as a singleton
   *
   * @param name - Service identifier
   * @returns true if service is a singleton
   */
  isSingleton(name: string): boolean {
    const registration = this.services.get(name);
    return registration?.singleton ?? false;
  }

  /**
   * Check if a singleton service has been instantiated
   *
   * @param name - Service identifier
   * @returns true if singleton instance exists
   */
  isInstantiated(name: string): boolean {
    const registration = this.services.get(name);
    return registration?.singleton === true && registration.instance !== undefined;
  }

  /**
   * Reset the container
   *
   * Clears all registrations and singleton instances.
   * Primarily used for testing.
   */
  reset(): void {
    this.services.clear();
    this.resolving.clear();
    logger.debug("ServiceContainer reset");
  }

  /**
   * Reset only singleton instances (keep registrations)
   *
   * Useful for testing when you want to reuse registrations
   * but get fresh instances.
   */
  resetInstances(): void {
    for (const registration of this.services.values()) {
      if (registration.singleton) {
        registration.instance = undefined;
      }
    }
    logger.debug("ServiceContainer instances reset");
  }

  /**
   * Create a child container that inherits from this container
   *
   * The child can override registrations without affecting the parent.
   * Useful for scoped dependencies or testing.
   *
   * @returns New ServiceContainer with inherited registrations
   */
  createChild(): ServiceContainer {
    const child = new ServiceContainer();

    // Copy all registrations (but not singleton instances)
    for (const [name, registration] of this.services.entries()) {
      child.services.set(name, {
        factory: registration.factory,
        singleton: registration.singleton,
        instance: undefined, // Don't share instances
      });
    }

    return child;
  }
}
