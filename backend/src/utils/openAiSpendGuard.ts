import { logger } from "../lib/logger";
import { recordOpenAiUsageAudit } from "../services/openAiUsageAuditService";
import { isOpenAiApiCallsEnabled } from "./externalAiGate";
import { redactValue } from "./phiRedaction";

export class OpenAiSpendGuardError extends Error {
  readonly code = "OPENAI_SPEND_GUARD_BLOCKED";

  constructor(message: string) {
    super(message);
    this.name = "OpenAiSpendGuardError";
  }
}

type OpenAiFeature =
  | "ai_image_analysis"
  | "ai_lesion_analysis"
  | "ai_note_drafting"
  | "ambient_live_insights"
  | "ambient_live_transcription"
  | "ambient_note_generation"
  | "ambient_transcription"
  | "clinical_copilot"
  | "voice_transcription";

type OpenAiSpendGuardOptions = {
  feature: OpenAiFeature;
  model?: string;
  estimatedAudioSeconds?: number;
  tenantId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

type RequestRecord = {
  at: number;
  feature: OpenAiFeature;
  audioSeconds: number;
};

const records: RequestRecord[] = [];
const lastFeatureRequestAt = new Map<OpenAiFeature, number>();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_MAX_REQUESTS_PER_HOUR = 20;
const DEFAULT_MAX_REQUESTS_PER_DAY = 100;
const DEFAULT_MAX_AUDIO_SECONDS_PER_HOUR = 15 * 60;
const DEFAULT_MAX_AUDIO_SECONDS_PER_DAY = 60 * 60;
const DEFAULT_LIVE_INSIGHTS_MIN_INTERVAL_MS = 30 * 1000;
const DEFAULT_LIVE_TRANSCRIPTION_MIN_INTERVAL_MS = 10 * 1000;

function isTrueEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function featureEnvName(feature: OpenAiFeature, suffix: string): string {
  return `OPENAI_${feature.toUpperCase()}_${suffix}`;
}

function getFeatureMaxPerHour(feature: OpenAiFeature): number {
  return envNumber(
    featureEnvName(feature, "MAX_REQUESTS_PER_HOUR"),
    envNumber("OPENAI_MAX_REQUESTS_PER_HOUR", DEFAULT_MAX_REQUESTS_PER_HOUR),
  );
}

function getFeatureMinIntervalMs(feature: OpenAiFeature): number {
  const fallback =
    feature === "ambient_live_insights"
      ? DEFAULT_LIVE_INSIGHTS_MIN_INTERVAL_MS
      : feature === "ambient_live_transcription"
        ? DEFAULT_LIVE_TRANSCRIPTION_MIN_INTERVAL_MS
        : 0;

  return envNumber(
    featureEnvName(feature, "MIN_INTERVAL_MS"),
    envNumber("OPENAI_MIN_REQUEST_INTERVAL_MS", fallback),
  );
}

function prune(now: number): void {
  const cutoff = now - DAY_MS;
  while (records.length > 0 && records[0]!.at < cutoff) {
    records.shift();
  }
}

function countRequests(since: number, feature?: OpenAiFeature): number {
  return records.filter((record) => record.at >= since && (!feature || record.feature === feature)).length;
}

function sumAudioSeconds(since: number): number {
  return records
    .filter((record) => record.at >= since)
    .reduce((sum, record) => sum + record.audioSeconds, 0);
}

function assertAllowed(options: OpenAiSpendGuardOptions): void {
  if (!isOpenAiApiCallsEnabled()) {
    throw new OpenAiSpendGuardError("OpenAI calls are disabled by OPENAI_API_CALLS_ENABLED");
  }

  if (isTrueEnv(process.env.OPENAI_SPEND_GUARD_DISABLED)) {
    return;
  }

  const now = Date.now();
  prune(now);

  const hourStart = now - HOUR_MS;
  const dayStart = now - DAY_MS;
  const hourlyLimit = envNumber("OPENAI_MAX_REQUESTS_PER_HOUR", DEFAULT_MAX_REQUESTS_PER_HOUR);
  const dailyLimit = envNumber("OPENAI_MAX_REQUESTS_PER_DAY", DEFAULT_MAX_REQUESTS_PER_DAY);
  const featureHourlyLimit = getFeatureMaxPerHour(options.feature);
  const hourlyCount = countRequests(hourStart);
  const dailyCount = countRequests(dayStart);
  const featureHourlyCount = countRequests(hourStart, options.feature);

  if (hourlyCount >= hourlyLimit) {
    throw new OpenAiSpendGuardError(`OpenAI hourly request cap reached (${hourlyCount}/${hourlyLimit})`);
  }

  if (dailyCount >= dailyLimit) {
    throw new OpenAiSpendGuardError(`OpenAI daily request cap reached (${dailyCount}/${dailyLimit})`);
  }

  if (featureHourlyCount >= featureHourlyLimit) {
    throw new OpenAiSpendGuardError(
      `OpenAI ${options.feature} hourly request cap reached (${featureHourlyCount}/${featureHourlyLimit})`,
    );
  }

  const minIntervalMs = getFeatureMinIntervalMs(options.feature);
  const lastAt = lastFeatureRequestAt.get(options.feature);
  if (minIntervalMs > 0 && lastAt && now - lastAt < minIntervalMs) {
    throw new OpenAiSpendGuardError(`OpenAI ${options.feature} called too frequently`);
  }

  const estimatedAudioSeconds = Math.max(0, options.estimatedAudioSeconds || 0);
  if (estimatedAudioSeconds > 0) {
    const hourAudioLimit = envNumber("OPENAI_MAX_AUDIO_SECONDS_PER_HOUR", DEFAULT_MAX_AUDIO_SECONDS_PER_HOUR);
    const dayAudioLimit = envNumber("OPENAI_MAX_AUDIO_SECONDS_PER_DAY", DEFAULT_MAX_AUDIO_SECONDS_PER_DAY);
    const hourAudioSeconds = sumAudioSeconds(hourStart);
    const dayAudioSeconds = sumAudioSeconds(dayStart);

    if (hourAudioSeconds + estimatedAudioSeconds > hourAudioLimit) {
      throw new OpenAiSpendGuardError(
        `OpenAI hourly audio cap reached (${Math.round(hourAudioSeconds)}/${hourAudioLimit}s)`,
      );
    }

    if (dayAudioSeconds + estimatedAudioSeconds > dayAudioLimit) {
      throw new OpenAiSpendGuardError(
        `OpenAI daily audio cap reached (${Math.round(dayAudioSeconds)}/${dayAudioLimit}s)`,
      );
    }
  }
}

function recordAllowed(options: OpenAiSpendGuardOptions): void {
  const now = Date.now();
  records.push({
    at: now,
    feature: options.feature,
    audioSeconds: Math.max(0, options.estimatedAudioSeconds || 0),
  });
  lastFeatureRequestAt.set(options.feature, now);
}

async function readUsageFromClone(response: Response): Promise<unknown> {
  const headers = response.headers as Headers | undefined;
  const contentType = typeof headers?.get === "function" ? headers.get("content-type") || "" : "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    const clone = typeof response.clone === "function" ? response.clone() : undefined;
    if (!clone || typeof clone.json !== "function") {
      return undefined;
    }
    const payload = await clone.json() as { usage?: unknown };
    return payload?.usage;
  } catch {
    return undefined;
  }
}

function getEndpoint(input: Parameters<typeof fetch>[0]): string | undefined {
  try {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : typeof (input as Request | undefined)?.url === "string"
          ? (input as Request).url
          : "";
    if (!url) return undefined;
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return undefined;
  }
}

export async function meteredOpenAiFetch(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  options: OpenAiSpendGuardOptions,
): Promise<Response> {
  assertAllowed(options);
  recordAllowed(options);

  const startedAt = Date.now();
  const response = await fetch(input, init);
  const durationMs = Date.now() - startedAt;
  const headers = response.headers as Headers | undefined;
  const requestId = typeof headers?.get === "function" ? headers.get("x-request-id") || undefined : undefined;
  const usage = await readUsageFromClone(response);

  logger.info("OpenAI API request completed", {
    feature: options.feature,
    model: options.model,
    status: response.status,
    ok: response.ok,
    durationMs,
    requestId,
    usage: usage ? redactValue(usage) : undefined,
  });

  void recordOpenAiUsageAudit({
    tenantId: options.tenantId,
    userId: options.userId,
    feature: options.feature,
    model: options.model,
    endpoint: getEndpoint(input),
    requestId,
    statusCode: response.status,
    ok: response.ok,
    durationMs,
    usage,
    estimatedAudioSeconds: options.estimatedAudioSeconds,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    metadata: options.metadata,
  });

  return response;
}

export function resetOpenAiSpendGuardForTests(): void {
  records.splice(0, records.length);
  lastFeatureRequestAt.clear();
}
