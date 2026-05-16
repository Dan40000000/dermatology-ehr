import path from 'path';
import { loadEnv } from './validate';

const envVars = loadEnv();

/**
 * Application Configuration
 * Centralized configuration management with validation
 */

const normalizeEnvironment = (value: string | undefined) => value?.trim().toLowerCase();
const runtimeEnvironment =
  normalizeEnvironment(envVars.DEPLOYMENT_ENV) ||
  normalizeEnvironment(envVars.APP_ENV) ||
  normalizeEnvironment(envVars.RAILWAY_ENVIRONMENT) ||
  normalizeEnvironment(envVars.NODE_ENV) ||
  'development';
const isProductionLikeEnvironment = runtimeEnvironment === 'production' || runtimeEnvironment === 'staging';

const localhostAliases = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLocalHostname(hostname: string | undefined): boolean {
  if (!hostname) return false;
  return localhostAliases.has(normalizeHostname(hostname));
}

function getDatabaseHostname(): string {
  try {
    return new URL(envVars.DATABASE_URL).hostname;
  } catch {
    return envVars.DB_HOST;
  }
}

function isLocalOrigin(origin: string): boolean {
  if (origin === '*') return false;
  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

const databaseUrlHasSslMode = /sslmode=(require|verify-full)|ssl=true/i.test(envVars.DATABASE_URL);
const isLocalDatabaseTarget = isLocalHostname(getDatabaseHostname());
const effectiveDbSslEnabled =
  envVars.DB_SSL_ENABLED || databaseUrlHasSslMode || (isProductionLikeEnvironment && !isLocalDatabaseTarget);

export const config = {
  // Environment
  env: envVars.NODE_ENV,
  runtimeEnvironment,
  isDevelopment: runtimeEnvironment === 'development' && envVars.NODE_ENV !== 'test',
  isProduction: runtimeEnvironment === 'production',
  isStaging: runtimeEnvironment === 'staging',
  isProductionLike: isProductionLikeEnvironment,
  isTest: envVars.NODE_ENV === 'test',

  // Server
  port: envVars.PORT,
  apiUrl: envVars.API_URL,
  frontendUrl: envVars.FRONTEND_URL,

  // Database
  database: {
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    name: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD || '',
    maxConnections: envVars.DB_MAX_CONNECTIONS,
    idleTimeout: envVars.DB_IDLE_TIMEOUT,
    ssl: {
      enabled: effectiveDbSslEnabled,
      rejectUnauthorized: envVars.DB_SSL_REJECT_UNAUTHORIZED,
    },
  },

  // Authentication
  jwt: {
    secret: envVars.JWT_SECRET || '',
    expiry: envVars.JWT_EXPIRY,
    refreshExpiry: envVars.REFRESH_TOKEN_EXPIRY,
  },

  session: {
    secret: envVars.SESSION_SECRET || '',
    maxAge: envVars.SESSION_MAX_AGE,
  },

  // Security
  security: {
    csrfSecret: envVars.CSRF_SECRET || '',
    encryptionKey: envVars.ENCRYPTION_KEY || '',
    phiEncryptionEnabled: envVars.PHI_ENCRYPTION_ENABLED || envVars.ENABLE_PHI_ENCRYPTION,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW * 60 * 1000,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },

  // Redis
  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD,
  },

  // Storage
  storage: {
    provider: envVars.STORAGE_PROVIDER,
    uploadDir: envVars.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
    maxFileSize: envVars.MAX_FILE_SIZE, // 50MB
    aws: {
      region: envVars.AWS_REGION,
      bucket: envVars.AWS_S3_BUCKET || '',
      accessKeyId: envVars.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY || '',
      endpoint: envVars.AWS_S3_ENDPOINT || envVars.S3_ENDPOINT || '',
      forcePathStyle: envVars.AWS_S3_FORCE_PATH_STYLE || envVars.S3_FORCE_PATH_STYLE,
    },
  },

  // Email
  email: {
    smtp: {
      host: envVars.SMTP_HOST || envVars.SENDGRID_SMTP_HOST || 'smtp.sendgrid.net',
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE,
      user: envVars.SMTP_USER || envVars.SENDGRID_SMTP_USERNAME || '',
      password: envVars.SMTP_PASSWORD || envVars.SENDGRID_API_KEY || envVars.SENDGRID_SMTP_API_KEY || envVars.TWILIO_SENDGRID_API_KEY || '',
    },
    ses: {
      region: envVars.AWS_SES_REGION || envVars.AWS_REGION,
    },
    from: {
      email: envVars.FROM_EMAIL || envVars.EMAIL_FROM || 'noreply@example.com',
      name: envVars.FROM_NAME,
    },
    notificationOnly: envVars.EMAIL_NOTIFICATION_ONLY,
  },

  // Monitoring
  monitoring: {
    sentryDsn: envVars.SENTRY_DSN || '',
    sentryEnvironment: envVars.SENTRY_ENVIRONMENT,
    sentryTracesSampleRate: envVars.SENTRY_TRACES_SAMPLE_RATE,
    logLevel: envVars.LOG_LEVEL,
  },

  // HIPAA Compliance
  hipaa: {
    auditLogRetentionDays: envVars.AUDIT_LOG_RETENTION_DAYS, // 7 years
    virusScanEnabled: envVars.VIRUS_SCAN_ENABLED,
    clamav: {
      host: envVars.CLAMAV_HOST || 'localhost',
      port: envVars.CLAMAV_PORT,
    },
  },

  // Backup
  backup: {
    enabled: envVars.BACKUP_ENABLED,
    schedule: envVars.BACKUP_SCHEDULE,
    retentionDays: envVars.BACKUP_RETENTION_DAYS,
    bucket: envVars.BACKUP_BUCKET || '',
  },

  // Feature Flags
  features: {
    patientPortal: envVars.ENABLE_PATIENT_PORTAL,
    telehealth: envVars.ENABLE_TELEHEALTH,
    messaging: envVars.ENABLE_MESSAGING,
    documentExport: envVars.ENABLE_DOCUMENT_EXPORT,
    emailDelivery: envVars.ENABLE_EMAIL_DELIVERY,
  },

  // CORS
  cors: {
    origin: (() => {
      const origins = new Set<string>();
      const addOrigin = (origin: string) => {
        const trimmed = origin.trim();
        if (trimmed) {
          if (isProductionLikeEnvironment && isLocalOrigin(trimmed)) {
            return;
          }
          origins.add(trimmed);
        }
      };

      if (envVars.CORS_ORIGIN) {
        envVars.CORS_ORIGIN.split(',').forEach(addOrigin);
      }

      if (envVars.FRONTEND_URL) {
        addOrigin(envVars.FRONTEND_URL);
      }

      if (!isProductionLikeEnvironment) {
        [
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5174',
          'http://localhost:5175',
          'http://127.0.0.1:5175',
        ].forEach(addOrigin);
      }

      return Array.from(origins);
    })(),
    credentials: envVars.CORS_CREDENTIALS,
  },

  // SSL/TLS
  ssl: {
    enabled: envVars.SSL_ENABLED,
    certPath: envVars.SSL_CERT_PATH || '',
    keyPath: envVars.SSL_KEY_PATH || '',
  },

  // External Services
  external: {
    twilio: {
      accountSid: envVars.TWILIO_ACCOUNT_SID || '',
      authToken: envVars.TWILIO_AUTH_TOKEN || '',
      phoneNumber: envVars.TWILIO_PHONE_NUMBER || '',
      messagingServiceSid: envVars.TWILIO_MESSAGING_SERVICE_SID || '',
    },
    stripe: {
      secretKey: envVars.STRIPE_SECRET_KEY || '',
      publishableKey: envVars.STRIPE_PUBLISHABLE_KEY || '',
    },
    phaxio: {
      apiKey: envVars.PHAXIO_API_KEY || '',
      apiSecret: envVars.PHAXIO_API_SECRET || '',
      fromNumber: envVars.PHAXIO_FROM_NUMBER || '',
      baseUrl: envVars.PHAXIO_BASE_URL || 'https://api.phaxio.com/v2',
    },
  },

  // Debug
  debug: {
    enabled: envVars.DEBUG,
    apiDocs: envVars.ENABLE_API_DOCS,
    playground: envVars.ENABLE_PLAYGROUND,
  },
};

/**
 * Validate required environment variables
 */
function validateConfig(): void {
  const errors: string[] = [];

  const requireEnv = (key: string, condition = true) => {
    if (condition && !process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  };

  // Required in production
  if (config.isProductionLike) {
    requireEnv('JWT_SECRET');
    requireEnv('CSRF_SECRET');
    requireEnv('SESSION_SECRET');

    if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
      errors.push('Missing required environment variable: DB_PASSWORD (or DATABASE_URL)');
    }

    if (config.isProduction && isLocalDatabaseTarget) {
      errors.push('Production database target must not point to localhost');
    }

    if (!config.database.ssl.enabled && !(config.isStaging && isLocalDatabaseTarget)) {
      errors.push('DB_SSL_ENABLED must be true (or DATABASE_URL must enforce sslmode=require) in production-like environments');
    }

    if (config.isStaging && isLocalDatabaseTarget && !config.database.ssl.enabled) {
      console.warn('WARNING: DEPLOYMENT_ENV=staging is using a local database target; DB TLS cannot be validated locally.');
    }

    // Warn about secure configuration
    if (config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters in production');
    }

    if (config.security.csrfSecret.length < 32) {
      errors.push('CSRF_SECRET should be at least 32 characters in production');
    }

    if (config.security.encryptionKey.length > 0 && config.security.encryptionKey.length < 32) {
      errors.push('ENCRYPTION_KEY should be at least 32 characters in production');
    }

    if (!config.security.phiEncryptionEnabled) {
      errors.push('PHI_ENCRYPTION_ENABLED must be true in production-like environments');
    }

    if (!config.ssl.enabled && config.apiUrl.startsWith('https')) {
      console.warn('WARNING: SSL is not enabled but API_URL uses HTTPS');
    }

    if (!process.env.SENTRY_DSN) {
      console.warn('WARNING: SENTRY_DSN is not set in production; error forensics will be limited.');
    }

    if (config.storage.provider === 's3' && !config.storage.aws.bucket) {
      errors.push('AWS_S3_BUCKET is required when STORAGE_PROVIDER is s3');
    }

    if (config.cors.origin.length === 0) {
      errors.push('CORS_ORIGIN must include at least one non-localhost origin in production-like environments');
    }

    if (config.cors.origin.includes('*')) {
      errors.push('CORS_ORIGIN must not include wildcard (*) in production-like environments');
    }
  }

  if (config.security.phiEncryptionEnabled) {
    if (!config.security.encryptionKey) {
      errors.push('ENCRYPTION_KEY is required when PHI_ENCRYPTION_ENABLED is true');
    } else if (config.security.encryptionKey.length < 32) {
      errors.push('ENCRYPTION_KEY should be at least 32 characters when PHI encryption is enabled');
    }
  }

  if (!config.isProductionLike) {
    if (!process.env.JWT_SECRET) {
      console.warn('WARNING: JWT_SECRET is not set; using defaults is unsafe outside development.');
    }
    if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
      console.warn('WARNING: DB_PASSWORD or DATABASE_URL is not set; defaults may not work.');
    }
  }

  // Throw error if validation fails
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  // Log configuration in development
  if (config.isDevelopment) {
    console.log('Configuration loaded:', {
      env: config.env,
      runtimeEnvironment: config.runtimeEnvironment,
      port: config.port,
      database: `${config.database.host}:${config.database.port}/${config.database.name}`,
      redis: config.redis.url,
      storage: config.storage.provider,
    });
  }
}

// Validate configuration on load
validateConfig();

export default config;
