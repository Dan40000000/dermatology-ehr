import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import config from '../config';
import { redactPHI, redactError, isPHIField } from '../utils/phiRedaction';

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

    // Filter sensitive data and PHI
    beforeSend(event, hint) {
      // Don't send errors in test environment
      if (config.isTest) {
        return null;
      }

      // Remove sensitive data from error reports
      if (event.request) {
        delete event.request.cookies;

        // Redact Authorization headers
        if (event.request.headers) {
          event.request.headers['authorization'] = '[Redacted]';
          event.request.headers['cookie'] = '[Redacted]';
          event.request.headers['x-api-key'] = '[Redacted]';
        }

        // Redact query parameters that might contain PHI
        if (event.request.query_string) {
          event.request.query_string = '[Redacted]';
        }

        // Redact request body data
        if (event.request.data) {
          if (typeof event.request.data === 'object') {
            event.request.data = redactPHI(event.request.data);
          } else if (typeof event.request.data === 'string') {
            event.request.data = '[Request Body Redacted]';
          }
        }
      }

      // Redact PHI from exception messages and values
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map(exception => {
          if (exception.value) {
            exception.value = redactError(new Error(exception.value)).message;
          }
          if (exception.stacktrace?.frames) {
            exception.stacktrace.frames = exception.stacktrace.frames.map(frame => {
              // Redact local variables that might contain PHI
              if (frame.vars) {
                const redactedVars: Record<string, any> = {};
                Object.entries(frame.vars).forEach(([key, value]) => {
                  if (isPHIField(key)) {
                    redactedVars[key] = '[Redacted]';
                  } else if (typeof value === 'object') {
                    redactedVars[key] = redactPHI(value);
                  } else {
                    redactedVars[key] = value;
                  }
                });
                frame.vars = redactedVars;
              }
              return frame;
            });
          }
          return exception;
        });
      }

      // Redact PHI from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.message) {
            breadcrumb.message = redactError(new Error(breadcrumb.message)).message;
          }
          if (breadcrumb.data) {
            breadcrumb.data = redactPHI(breadcrumb.data);
          }
          return breadcrumb;
        });
      }

      // Redact PHI from contexts
      if (event.contexts) {
        Object.keys(event.contexts).forEach(contextKey => {
          if (event.contexts![contextKey]) {
            event.contexts![contextKey] = redactPHI(event.contexts![contextKey]);
          }
        });
      }

      // Redact extra data
      if (event.extra) {
        event.extra = redactPHI(event.extra);
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
 * Capture an exception with Sentry (with PHI redaction)
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  // Redact PHI from context before sending to Sentry
  if (context) {
    const redactedContext = redactPHI(context);
    Sentry.setContext('custom', redactedContext);
  }

  // Redact PHI from error message
  const redactedError = redactError(error);
  Sentry.captureException(redactedError);
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
 * Add breadcrumb for debugging (with PHI redaction)
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, any>): void {
  // Redact PHI from breadcrumb data
  const redactedData = data ? redactPHI(data) : undefined;
  const redactedMessage = redactError(new Error(message)).message;

  Sentry.addBreadcrumb({
    message: redactedMessage,
    category,
    level: 'info',
    ...(redactedData ? { data: redactedData } : {}),
  });
}

export { Sentry };
