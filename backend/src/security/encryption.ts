import crypto from "crypto";
import config from "../config";
import { logger } from "../lib/logger";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

let warnedPhiDisabled = false;

function deriveKey(secret: string): Buffer {
  if (secret.length === 32) {
    return Buffer.from(secret, "utf8");
  }

  if (secret.length === 64 && /^[0-9a-f]+$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function getEncryptionKey(): Buffer {
  const key = config.security.encryptionKey;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required for PHI encryption");
  }
  if (config.isProduction && key.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters in production");
  }
  return deriveKey(key);
}

export function encryptString(value: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), encrypted.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptString(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted payload format");
  }
  const [, ivB64, dataB64, tagB64] = parts;
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function buildSsnFields(ssn?: string | null): { ssnLast4: string | null; ssnEncrypted: string | null } {
  if (!ssn) return { ssnLast4: null, ssnEncrypted: null };
  const digits = normalizeDigits(ssn);
  if (!digits) return { ssnLast4: null, ssnEncrypted: null };

  const ssnLast4 = digits.slice(-4);
  let ssnEncrypted: string | null = null;

  if (digits.length > 4) {
    if (config.security.phiEncryptionEnabled) {
      ssnEncrypted = encryptString(digits);
    } else if (!warnedPhiDisabled) {
      warnedPhiDisabled = true;
      logger.warn("PHI encryption is disabled; storing SSN last 4 only.");
    }
  }

  return { ssnLast4, ssnEncrypted };
}
