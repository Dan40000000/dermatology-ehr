import dotenv from "dotenv";
import { envSchema, type EnvSchema } from "./schema";

// Load environment variables from .env files if present.
dotenv.config();

let cachedEnv: EnvSchema | null = null;

export function loadEnv(): EnvSchema {
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.VITEST !== undefined;
  if (cachedEnv && !isTestEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  if (!isTestEnv) {
    cachedEnv = parsed.data;
  }
  return parsed.data;
}

export function clearEnvCache(): void {
  cachedEnv = null;
}
