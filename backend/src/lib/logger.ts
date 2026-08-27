import winston from 'winston';
import path from 'path';
import { sanitizeLogValue, safeErrorCode } from '../utils/phiRedaction';

function sanitizeLoggerValue(value: unknown, key: string): unknown {
  // Keep lightweight test/mocked phi-redaction modules from reintroducing raw
  // error fields when this logger is imported in isolation.
  if (typeof sanitizeLogValue === 'function') {
    return sanitizeLogValue(value, key);
  }
  if (value instanceof Error && typeof safeErrorCode === 'function') {
    return safeErrorCode(value);
  }
  if (/^(?:error|err|exception|cause|reason|failure|stack|trace)$/i.test(key)) {
    return typeof safeErrorCode === 'function' ? safeErrorCode(value) : '[REDACTED]';
  }
  return value;
}

// PHI redaction format - applied before any other formatting
const phiRedactionFormat = winston.format((info) => {
  // Sanitize every field before Winston fans the record out to file, console,
  // or a transport supplied by an integration.  In particular, values under
  // error/reason/exception/stack fields become opaque codes; retaining a
  // provider's original message or stack is an easy PHI exfiltration path.
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp') {
      continue;
    }
    info[key] = sanitizeLoggerValue(info[key], key);
  }

  // Winston's errors format may expose the Error under the message property.
  if (info.message instanceof Error) {
    info.message = safeErrorCode(info.message);
  }

  return info;
});

// Custom log format
const logFormat = winston.format.combine(
  phiRedactionFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (for development)
const consoleFormat = winston.format.combine(
  phiRedactionFormat(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
    }),
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Create audit logger for HIPAA compliance
// Note: Audit logs use PHI redaction format to ensure no PHI in file logs
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    phiRedactionFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Helper methods for common logging patterns
export const logSecurityEvent = (event: string, details: any) => {
  auditLogger.info('SECURITY_EVENT', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export const logDataAccess = (userId: string, resource: string, action: string, details?: any) => {
  auditLogger.info('DATA_ACCESS', {
    userId,
    resource,
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export const logAuthEvent = (event: string, email: string, success: boolean, details?: any) => {
  auditLogger.info('AUTH_EVENT', {
    event,
    email,
    success,
    timestamp: new Date().toISOString(),
    ...details,
  });
};
