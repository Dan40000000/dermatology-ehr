import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import config from '../config';

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
export function initSentry(): void {
  if (!config.monitoring.sentryDsn) {
    console.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: config.monitoring.sentryDsn,
    environment: config.monitoring.sentryEnvironment,

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: config.monitoring.sentryTracesSampleRate,

    // Profiling
    profilesSampleRate: config.isProduction ? 0.1 : 1.0,
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Release tracking
    ...(process.env.npm_package_version ? { release: process.env.npm_package_version } : {}),

    // Filter sensitive data
    beforeSend(event, hint) {
      // Remove sensitive data from error reports
      if (event.request) {
        delete event.request.cookies;

        // Redact Authorization headers
        if (event.request.headers) {
          event.request.headers['authorization'] = '[Redacted]';
          event.request.headers['cookie'] = '[Redacted]';
        }
      }

      // Don't send errors in test environment
      if (config.isTest) {
        return null;
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      'Non-Error exception captured',
      'Non-Error promise rejection captured',
    ],
  });

  console.log('Sentry initialized:', {
    environment: config.monitoring.sentryEnvironment,
    release: process.env.npm_package_version,
  });
}

/**
 * Capture an exception with Sentry
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (context) {
    Sentry.setContext('custom', context);
  }
  Sentry.captureException(error);
}

/**
 * Capture a message with Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; role?: string }): void {
  Sentry.setUser({
    id: user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(user.role ? { role: user.role } : {}),
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, any>): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    ...(data ? { data } : {}),
  });
}

export { Sentry };
