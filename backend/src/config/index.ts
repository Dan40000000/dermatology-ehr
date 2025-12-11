import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Application Configuration
 * Centralized configuration management with validation
 */

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'derm_db',
    user: process.env.DB_USER || 'derm_user',
    password: process.env.DB_PASSWORD || '',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  },

  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiry: process.env.JWT_EXPIRY || '15m',
    refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  },

  session: {
    secret: process.env.SESSION_SECRET || '',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
  },

  // Security
  security: {
    csrfSecret: process.env.CSRF_SECRET || '',
    encryptionKey: process.env.ENCRYPTION_KEY || '',
    phiEncryptionEnabled: process.env.PHI_ENCRYPTION_ENABLED === 'true',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10) * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
  },

  // Storage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET || '',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  },

  // Email
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
    },
    from: {
      email: process.env.FROM_EMAIL || 'noreply@example.com',
      name: process.env.FROM_NAME || 'Dermatology EHR',
    },
  },

  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || '',
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT || 'production',
    sentryTracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '1.0'),
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // HIPAA Compliance
  hipaa: {
    auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '2555', 10), // 7 years
    virusScanEnabled: process.env.VIRUS_SCAN_ENABLED === 'true',
    clamav: {
      host: process.env.CLAMAV_HOST || 'localhost',
      port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
    },
  },

  // Backup
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '90', 10),
    bucket: process.env.BACKUP_BUCKET || '',
  },

  // Feature Flags
  features: {
    patientPortal: process.env.ENABLE_PATIENT_PORTAL === 'true',
    telehealth: process.env.ENABLE_TELEHEALTH === 'true',
    messaging: process.env.ENABLE_MESSAGING === 'true',
    documentExport: process.env.ENABLE_DOCUMENT_EXPORT === 'true',
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // SSL/TLS
  ssl: {
    enabled: process.env.SSL_ENABLED === 'true',
    certPath: process.env.SSL_CERT_PATH || '',
    keyPath: process.env.SSL_KEY_PATH || '',
  },

  // External Services
  external: {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    },
  },

  // Debug
  debug: {
    enabled: process.env.DEBUG === 'true',
    apiDocs: process.env.ENABLE_API_DOCS === 'true',
    playground: process.env.ENABLE_PLAYGROUND === 'true',
  },
};

/**
 * Validate required environment variables
 */
function validateConfig(): void {
  const errors: string[] = [];

  // Required in all environments
  const required = [
    'DB_PASSWORD',
    'JWT_SECRET',
  ];

  // Required in production
  if (config.isProduction) {
    required.push(
      'CSRF_SECRET',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'SENTRY_DSN',
    );

    // Warn about secure configuration
    if (config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters in production');
    }

    if (config.security.csrfSecret.length < 32) {
      errors.push('CSRF_SECRET should be at least 32 characters in production');
    }

    if (!config.ssl.enabled && config.apiUrl.startsWith('https')) {
      console.warn('WARNING: SSL is not enabled but API_URL uses HTTPS');
    }

    if (config.storage.provider === 's3' && !config.storage.aws.bucket) {
      errors.push('AWS_S3_BUCKET is required when STORAGE_PROVIDER is s3');
    }
  }

  // Check for required variables
  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
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
