import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  databaseUrl: process.env.DATABASE_URL || "postgres://derm_user:derm_pass@localhost:5432/derm_db",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtIssuer: process.env.JWT_ISSUER || "derm-app",
  accessTokenTtlSec: parseInt(process.env.ACCESS_TOKEN_TTL_SEC || "900", 10), // 15m
  refreshTokenTtlSec: parseInt(process.env.REFRESH_TOKEN_TTL_SEC || "1209600", 10), // 14d
  tenantHeader: process.env.TENANT_HEADER || "x-tenant-id",
  storageProvider: process.env.STORAGE_PROVIDER || "s3", // s3 by default; falls back to local when bucket missing
  s3Bucket: process.env.S3_BUCKET || "",
  s3Region: process.env.S3_REGION || "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  clamavHost: process.env.CLAMAV_HOST,
  clamavPort: parseInt(process.env.CLAMAV_PORT || "3310", 10),
  clamavTimeoutMs: parseInt(process.env.CLAMAV_TIMEOUT_MS || "4000", 10),
};

if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("⚠️  Using default JWT secret. Set JWT_SECRET in env for non-dev use.");
}
