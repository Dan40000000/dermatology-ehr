import winston from 'winston';
import path from 'path';
import { redactPHI, redactValue } from '../utils/phiRedaction';

// PHI redaction format - applied before any other formatting
const phiRedactionFormat = winston.format((info) => {
  // Redact message if it contains PHI patterns
  if (info.message && typeof info.message === 'string') {
    info.message = redactValue(info.message);
  }

  // Redact metadata
  const keysToCheck = Object.keys(info).filter(
    key => !['level', 'timestamp', 'message', 'stack'].includes(key)
  );

  keysToCheck.forEach(key => {
    if (info[key] && typeof info[key] === 'object') {
      info[key] = redactPHI(info[key]);
    } else if (info[key] && typeof info[key] === 'string') {
      info[key] = redactValue(info[key]);
    }
  });

  // Redact stack traces
  if (info.stack && typeof info.stack === 'string') {
    info.stack = redactValue(info.stack);
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
