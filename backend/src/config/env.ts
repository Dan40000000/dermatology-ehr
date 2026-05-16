import { loadEnv } from "./validate";

const envVars = loadEnv();
const runtimeEnvironment = (
  envVars.DEPLOYMENT_ENV ||
  envVars.APP_ENV ||
  envVars.RAILWAY_ENVIRONMENT ||
  envVars.NODE_ENV ||
  "development"
).toLowerCase();
const isProductionLike = runtimeEnvironment === "production" || runtimeEnvironment === "staging";

export const env = {
  nodeEnv: envVars.NODE_ENV,
  runtimeEnvironment,
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  jwtSecret:
    envVars.JWT_SECRET ||
    (isProductionLike ? "" : "dev-secret-change-me"),
  jwtIssuer: envVars.JWT_ISSUER,
  accessTokenTtlSec: envVars.ACCESS_TOKEN_TTL_SEC, // 15m
  refreshTokenTtlSec: envVars.REFRESH_TOKEN_TTL_SEC, // 14d
  tenantHeader: envVars.TENANT_HEADER,
  storageProvider: envVars.STORAGE_PROVIDER,
  s3Bucket: envVars.AWS_S3_BUCKET || "",
  s3Region: envVars.AWS_REGION,
  s3AccessKeyId: envVars.AWS_ACCESS_KEY_ID || "",
  s3SecretAccessKey: envVars.AWS_SECRET_ACCESS_KEY || "",
  s3Endpoint: envVars.AWS_S3_ENDPOINT || envVars.S3_ENDPOINT || "",
  s3ForcePathStyle: envVars.AWS_S3_FORCE_PATH_STYLE || envVars.S3_FORCE_PATH_STYLE,
  clamavHost: envVars.CLAMAV_HOST,
  clamavPort: envVars.CLAMAV_PORT,
  clamavTimeoutMs: envVars.CLAMAV_TIMEOUT_MS,
};

if (!process.env.JWT_SECRET && !isProductionLike) {
  // eslint-disable-next-line no-console
  console.warn("⚠️  Using default JWT secret. Set JWT_SECRET in env for non-dev use.");
}
