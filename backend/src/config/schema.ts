import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const stringOptional = z.preprocess(emptyToUndefined, z.string().optional());
const stringDefault = (defaultValue: string) =>
  z.preprocess(emptyToUndefined, z.string().default(defaultValue));

const numberDefault = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return defaultValue;
    return typeof value === "string" ? Number(value) : value;
  }, z.number());

const booleanDefault = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return value;
  }, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: numberDefault(4000),
  API_URL: stringDefault("http://localhost:4000"),
  FRONTEND_URL: stringDefault("http://localhost:5173"),

  DATABASE_URL: stringDefault("postgres://derm_user:derm_pass@localhost:5432/derm_db"),
  DB_HOST: stringDefault("localhost"),
  DB_PORT: numberDefault(5432),
  DB_NAME: stringDefault("derm_db"),
  DB_USER: stringDefault("derm_user"),
  DB_PASSWORD: stringOptional,
  DB_MAX_CONNECTIONS: numberDefault(20),
  DB_IDLE_TIMEOUT: numberDefault(30000),

  JWT_SECRET: stringOptional,
  JWT_ISSUER: stringDefault("derm-app"),
  ACCESS_TOKEN_TTL_SEC: numberDefault(900),
  REFRESH_TOKEN_TTL_SEC: numberDefault(1209600),
  JWT_EXPIRY: stringDefault("15m"),
  REFRESH_TOKEN_EXPIRY: stringDefault("7d"),

  SESSION_SECRET: stringOptional,
  SESSION_MAX_AGE: numberDefault(86400000),
  CSRF_SECRET: stringOptional,
  ENCRYPTION_KEY: stringOptional,
  PHI_ENCRYPTION_ENABLED: booleanDefault(false),
  ENABLE_PHI_ENCRYPTION: booleanDefault(false),
  INIT_SECRET: stringOptional,

  RATE_LIMIT_WINDOW: numberDefault(15),
  RATE_LIMIT_MAX_REQUESTS: numberDefault(100),
  DISABLE_RATE_LIMIT: booleanDefault(false),

  REDIS_URL: stringDefault("redis://localhost:6379"),
  REDIS_PASSWORD: stringOptional,

  STORAGE_PROVIDER: stringDefault("local"),
  UPLOAD_DIR: stringOptional,
  MAX_FILE_SIZE: numberDefault(52428800),
  AWS_REGION: stringDefault("us-east-1"),
  AWS_S3_BUCKET: stringOptional,
  AWS_ACCESS_KEY_ID: stringOptional,
  AWS_SECRET_ACCESS_KEY: stringOptional,
  AWS_S3_ENDPOINT: stringOptional,
  AWS_S3_FORCE_PATH_STYLE: booleanDefault(false),
  S3_ENDPOINT: stringOptional,
  S3_FORCE_PATH_STYLE: booleanDefault(false),

  SMTP_HOST: stringDefault("smtp.sendgrid.net"),
  SMTP_PORT: numberDefault(587),
  SMTP_SECURE: booleanDefault(false),
  SMTP_USER: stringOptional,
  SMTP_PASSWORD: stringOptional,
  FROM_EMAIL: stringDefault("noreply@example.com"),
  FROM_NAME: stringDefault("Dermatology EHR"),
  EMAIL_FROM: stringOptional,

  SENTRY_DSN: stringOptional,
  SENTRY_ENVIRONMENT: stringDefault("production"),
  SENTRY_TRACES_SAMPLE_RATE: numberDefault(1.0),
  LOG_LEVEL: stringDefault("info"),

  AUDIT_LOG_RETENTION_DAYS: numberDefault(2555),
  VIRUS_SCAN_ENABLED: booleanDefault(false),
  CLAMAV_HOST: stringOptional,
  CLAMAV_PORT: numberDefault(3310),
  CLAMAV_TIMEOUT_MS: numberDefault(4000),

  BACKUP_ENABLED: booleanDefault(false),
  BACKUP_SCHEDULE: stringDefault("0 2 * * *"),
  BACKUP_RETENTION_DAYS: numberDefault(90),
  BACKUP_BUCKET: stringOptional,

  ENABLE_PATIENT_PORTAL: booleanDefault(false),
  ENABLE_TELEHEALTH: booleanDefault(false),
  ENABLE_MESSAGING: booleanDefault(false),
  ENABLE_DOCUMENT_EXPORT: booleanDefault(false),

  CORS_ORIGIN: stringOptional,
  CORS_CREDENTIALS: booleanDefault(false),

  SSL_ENABLED: booleanDefault(false),
  SSL_CERT_PATH: stringOptional,
  SSL_KEY_PATH: stringOptional,

  TWILIO_ACCOUNT_SID: stringOptional,
  TWILIO_AUTH_TOKEN: stringOptional,
  TWILIO_PHONE_NUMBER: stringOptional,

  STRIPE_SECRET_KEY: stringOptional,
  STRIPE_PUBLISHABLE_KEY: stringOptional,

  DEBUG: booleanDefault(false),
  ENABLE_API_DOCS: booleanDefault(false),
  ENABLE_PLAYGROUND: booleanDefault(false),

  TENANT_HEADER: stringDefault("x-tenant-id"),
  DEFAULT_USER_PASSWORD: stringDefault("Password123!"),

  USE_REAL_SERVICES: booleanDefault(false),
  USE_MOCK_SERVICES: booleanDefault(false),
  USE_MOCK_STORAGE: booleanDefault(false),
  USE_MOCK_SMS: booleanDefault(false),
  USE_MOCK_NOTIFICATIONS: booleanDefault(false),
  USE_MOCK_VIRUS_SCAN: booleanDefault(false),
  USE_MOCK_EMAIL: booleanDefault(false),
  USE_MOCK_TWILIO: booleanDefault(false),
  USE_MOCK_SLACK: booleanDefault(false),
  USE_MOCK_TEAMS: booleanDefault(false),
  USE_MOCK_CLAMAV: booleanDefault(false),

  OPENAI_API_KEY: stringOptional,
  OPENAI_NOTE_MODEL: stringOptional,
  OPENAI_TRANSCRIBE_MODEL: stringOptional,
  ANTHROPIC_API_KEY: stringOptional,
  ANTHROPIC_NOTE_MODEL: stringOptional,
  AMBIENT_AI_MOCK_DELAY_MS: numberDefault(0),
  AMBIENT_LIVE_TRANSCRIBE_ENABLED: booleanDefault(true),
  AMBIENT_LIVE_TRANSCRIBE_MIN_INTERVAL_MS: numberDefault(5000),
  AMBIENT_LIVE_TRANSCRIBE_MODEL: stringOptional,

  RUN_E2E: booleanDefault(false),
  RUN_PERF: booleanDefault(false),
}).passthrough();

export type EnvSchema = z.infer<typeof envSchema>;
