import { randomUUID } from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

export type OpenAiUsageAuditInput = {
  tenantId?: string | null;
  userId?: string | null;
  feature: string;
  model?: string | null;
  endpoint?: string | null;
  requestId?: string | null;
  statusCode?: number | null;
  ok?: boolean | null;
  durationMs?: number | null;
  usage?: unknown;
  estimatedAudioSeconds?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OpenAiUsageRange = {
  startDate: Date;
  endDate: Date;
};

export type OpenAiUsageSettingsInput = {
  monthlyBudgetCents?: number | null;
  startingBalanceCents?: number | null;
  balancePeriodStart?: string | null;
};

type NormalizedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
};

type ModelPricing = {
  inputCentsPerMillion?: number;
  cachedInputCentsPerMillion?: number;
  outputCentsPerMillion?: number;
  audioInputCentsPerMillion?: number;
  audioOutputCentsPerMillion?: number;
  audioCentsPerMinute?: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5": { inputCentsPerMillion: 125, cachedInputCentsPerMillion: 12.5, outputCentsPerMillion: 1000 },
  "gpt-5-mini": { inputCentsPerMillion: 25, cachedInputCentsPerMillion: 2.5, outputCentsPerMillion: 200 },
  "gpt-5-nano": { inputCentsPerMillion: 5, cachedInputCentsPerMillion: 0.5, outputCentsPerMillion: 40 },
  "gpt-4.1": { inputCentsPerMillion: 200, cachedInputCentsPerMillion: 50, outputCentsPerMillion: 800 },
  "gpt-4.1-mini": { inputCentsPerMillion: 40, cachedInputCentsPerMillion: 10, outputCentsPerMillion: 160 },
  "gpt-4.1-nano": { inputCentsPerMillion: 10, cachedInputCentsPerMillion: 2.5, outputCentsPerMillion: 40 },
  "gpt-4o": { inputCentsPerMillion: 250, cachedInputCentsPerMillion: 125, outputCentsPerMillion: 1000 },
  "gpt-4o-mini": { inputCentsPerMillion: 15, cachedInputCentsPerMillion: 7.5, outputCentsPerMillion: 60 },
  "gpt-4o-transcribe": {
    inputCentsPerMillion: 250,
    outputCentsPerMillion: 1000,
    audioInputCentsPerMillion: 600,
    audioCentsPerMinute: 0.6,
  },
  "gpt-4o-transcribe-diarize": {
    inputCentsPerMillion: 250,
    outputCentsPerMillion: 1000,
    audioInputCentsPerMillion: 600,
    audioCentsPerMinute: 0.6,
  },
  "gpt-4o-mini-transcribe": {
    inputCentsPerMillion: 15,
    outputCentsPerMillion: 60,
    audioInputCentsPerMillion: 600,
    audioCentsPerMinute: 0.6,
  },
  "whisper-1": { audioCentsPerMinute: 0.6 },
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toNullableString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function getNestedNumber(value: unknown, path: string[]): number {
  let current = value as Record<string, unknown> | undefined;
  for (const key of path) {
    if (!current || typeof current !== "object") return 0;
    current = current[key] as Record<string, unknown> | undefined;
  }
  return toNumber(current);
}

export function normalizeOpenAiUsage(usage: unknown): NormalizedUsage {
  if (!usage || typeof usage !== "object") {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      audioInputTokens: 0,
      audioOutputTokens: 0,
    };
  }

  const usageObject = usage as Record<string, unknown>;
  const promptTokens = toNumber(usageObject.prompt_tokens);
  const completionTokens = toNumber(usageObject.completion_tokens);
  const inputTokens = toNumber(usageObject.input_tokens) || promptTokens;
  const outputTokens = toNumber(usageObject.output_tokens) || completionTokens;
  const totalTokens = toNumber(usageObject.total_tokens) || inputTokens + outputTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    inputTokens,
    outputTokens,
    cachedInputTokens:
      getNestedNumber(usageObject, ["prompt_tokens_details", "cached_tokens"]) ||
      getNestedNumber(usageObject, ["input_token_details", "cached_tokens"]),
    audioInputTokens:
      getNestedNumber(usageObject, ["prompt_tokens_details", "audio_tokens"]) ||
      getNestedNumber(usageObject, ["input_token_details", "audio_tokens"]),
    audioOutputTokens:
      getNestedNumber(usageObject, ["completion_tokens_details", "audio_tokens"]) ||
      getNestedNumber(usageObject, ["output_token_details", "audio_tokens"]),
  };
}

function normalizeModel(model?: string | null): string {
  const value = String(model || "").trim().toLowerCase();
  if (!value) return "unknown";
  const exact = MODEL_PRICING[value];
  if (exact) return value;

  const knownPrefixes = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  return knownPrefixes.find((prefix) => value === prefix || value.startsWith(`${prefix}-`)) || value;
}

export function estimateOpenAiCostCents(
  model: string | null | undefined,
  usage: NormalizedUsage,
  estimatedAudioSeconds = 0
): number {
  const pricing = MODEL_PRICING[normalizeModel(model)];
  if (!pricing) {
    return 0;
  }

  const billableInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens - usage.audioInputTokens);
  const inputCost = (billableInputTokens / 1_000_000) * (pricing.inputCentsPerMillion || 0);
  const cachedInputCost = (usage.cachedInputTokens / 1_000_000) * (pricing.cachedInputCentsPerMillion || pricing.inputCentsPerMillion || 0);
  const outputCost = (usage.outputTokens / 1_000_000) * (pricing.outputCentsPerMillion || 0);
  const audioInputTokenCost = (usage.audioInputTokens / 1_000_000) * (pricing.audioInputCentsPerMillion || 0);
  const audioOutputTokenCost = (usage.audioOutputTokens / 1_000_000) * (pricing.audioOutputCentsPerMillion || 0);
  const audioDurationCost =
    usage.audioInputTokens > 0
      ? 0
      : (Math.max(0, estimatedAudioSeconds) / 60) * (pricing.audioCentsPerMinute || 0);

  return Number(
    (inputCost + cachedInputCost + outputCost + audioInputTokenCost + audioOutputTokenCost + audioDurationCost).toFixed(6)
  );
}

function sanitizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key.slice(0, 80)] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  return safe;
}

function mapSettingsRow(row: any) {
  return {
    monthlyBudgetCents: row?.monthly_budget_cents === null || row?.monthly_budget_cents === undefined
      ? null
      : Number(row.monthly_budget_cents),
    startingBalanceCents: row?.starting_balance_cents === null || row?.starting_balance_cents === undefined
      ? null
      : Number(row.starting_balance_cents),
    balancePeriodStart: row?.balance_period_start
      ? new Date(row.balance_period_start).toISOString().slice(0, 10)
      : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10),
  };
}

export async function recordOpenAiUsageAudit(input: OpenAiUsageAuditInput): Promise<void> {
  const usage = normalizeOpenAiUsage(input.usage);
  const estimatedAudioSeconds = toNumber(input.estimatedAudioSeconds);
  const estimatedCostCents = estimateOpenAiCostCents(input.model, usage, estimatedAudioSeconds);

  try {
    await pool.query(
      `INSERT INTO openai_usage_audit (
        id,
        tenant_id,
        user_id,
        feature,
        model,
        endpoint,
        request_id,
        status_code,
        ok,
        duration_ms,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        input_tokens,
        output_tokens,
        cached_input_tokens,
        audio_input_tokens,
        audio_output_tokens,
        estimated_audio_seconds,
        estimated_cost_cents,
        resource_type,
        resource_id,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23
      )`,
      [
        randomUUID(),
        toNullableString(input.tenantId, 80),
        toNullableString(input.userId, 80),
        toNullableString(input.feature, 120) || "unknown",
        toNullableString(input.model, 120),
        toNullableString(input.endpoint, 200),
        toNullableString(input.requestId, 120),
        toNullableNumber(input.statusCode),
        typeof input.ok === "boolean" ? input.ok : null,
        toNullableNumber(input.durationMs),
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        usage.inputTokens,
        usage.outputTokens,
        usage.cachedInputTokens,
        usage.audioInputTokens,
        usage.audioOutputTokens,
        estimatedAudioSeconds,
        estimatedCostCents,
        toNullableString(input.resourceType, 80),
        toNullableString(input.resourceId, 120),
        JSON.stringify(sanitizeMetadata(input.metadata)),
      ]
    );
  } catch (error) {
    logger.warn("OpenAI usage audit write failed", {
      error: error instanceof Error ? error.message : String(error),
      feature: input.feature,
      model: input.model,
      tenantId: input.tenantId || undefined,
    });
  }
}

export async function getOpenAiUsageSettings(tenantId: string) {
  const result = await pool.query(
    `SELECT monthly_budget_cents, starting_balance_cents, balance_period_start
     FROM openai_usage_settings
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return mapSettingsRow(result.rows[0]);
}

export async function updateOpenAiUsageSettings(
  tenantId: string,
  settings: OpenAiUsageSettingsInput
) {
  const current = await getOpenAiUsageSettings(tenantId);
  const next = {
    monthlyBudgetCents: settings.monthlyBudgetCents === undefined ? current.monthlyBudgetCents : settings.monthlyBudgetCents,
    startingBalanceCents: settings.startingBalanceCents === undefined ? current.startingBalanceCents : settings.startingBalanceCents,
    balancePeriodStart: settings.balancePeriodStart === undefined ? current.balancePeriodStart : settings.balancePeriodStart,
  };

  const result = await pool.query(
    `INSERT INTO openai_usage_settings (
       tenant_id,
       monthly_budget_cents,
       starting_balance_cents,
       balance_period_start,
       updated_at
     ) VALUES ($1, $2, $3, COALESCE($4::date, date_trunc('month', now())::date), NOW())
     ON CONFLICT (tenant_id) DO UPDATE
       SET monthly_budget_cents = EXCLUDED.monthly_budget_cents,
           starting_balance_cents = EXCLUDED.starting_balance_cents,
           balance_period_start = EXCLUDED.balance_period_start,
           updated_at = NOW()
     RETURNING monthly_budget_cents, starting_balance_cents, balance_period_start`,
    [
      tenantId,
      next.monthlyBudgetCents === null ? null : toNullableNumber(next.monthlyBudgetCents),
      next.startingBalanceCents === null ? null : toNullableNumber(next.startingBalanceCents),
      next.balancePeriodStart || null,
    ]
  );

  return mapSettingsRow(result.rows[0]);
}

export async function getOpenAiUsageSummary(tenantId: string, range: OpenAiUsageRange) {
  const [summaryResult, featureResult, modelResult, dailyResult, settings] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_requests,
         COUNT(*) FILTER (WHERE ok = true)::int AS successful_requests,
         COUNT(*) FILTER (WHERE ok = false)::int AS failed_requests,
         COALESCE(SUM(prompt_tokens), 0)::bigint AS total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0)::bigint AS total_completion_tokens,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COALESCE(SUM(estimated_audio_seconds), 0)::float AS estimated_audio_seconds,
         COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents
       FROM openai_usage_audit
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [tenantId, range.startDate, range.endDate]
    ),
    pool.query(
      `SELECT
         feature,
         COUNT(*)::int AS requests,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COALESCE(SUM(estimated_audio_seconds), 0)::float AS estimated_audio_seconds,
         COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents,
         MAX(created_at) AS last_used_at
       FROM openai_usage_audit
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY feature
       ORDER BY estimated_cost_cents DESC, requests DESC`,
      [tenantId, range.startDate, range.endDate]
    ),
    pool.query(
      `SELECT
         COALESCE(model, 'unknown') AS model,
         COUNT(*)::int AS requests,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COALESCE(SUM(estimated_audio_seconds), 0)::float AS estimated_audio_seconds,
         COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents
       FROM openai_usage_audit
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY COALESCE(model, 'unknown')
       ORDER BY estimated_cost_cents DESC, requests DESC`,
      [tenantId, range.startDate, range.endDate]
    ),
    pool.query(
      `SELECT
         created_at::date AS usage_date,
         COUNT(*)::int AS requests,
         COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
         COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents
       FROM openai_usage_audit
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY created_at::date
       ORDER BY usage_date ASC`,
      [tenantId, range.startDate, range.endDate]
    ),
    getOpenAiUsageSettings(tenantId),
  ]);

  const balanceStartDate = new Date(`${settings.balancePeriodStart}T00:00:00.000Z`);
  const balanceUsageResult = await pool.query(
    `SELECT COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents
     FROM openai_usage_audit
     WHERE tenant_id = $1 AND created_at >= $2`,
    [tenantId, balanceStartDate]
  );

  const row = summaryResult.rows[0] || {};
  const estimatedCostCents = toNumber(row.estimated_cost_cents);
  const balancePeriodUsageCents = toNumber(balanceUsageResult.rows[0]?.estimated_cost_cents);
  const monthlyBudgetCents = settings.monthlyBudgetCents;
  const startingBalanceCents = settings.startingBalanceCents;

  return {
    range: {
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
    },
    settings,
    summary: {
      totalRequests: toNumber(row.total_requests),
      successfulRequests: toNumber(row.successful_requests),
      failedRequests: toNumber(row.failed_requests),
      totalPromptTokens: toNumber(row.total_prompt_tokens),
      totalCompletionTokens: toNumber(row.total_completion_tokens),
      totalTokens: toNumber(row.total_tokens),
      estimatedAudioSeconds: toNumber(row.estimated_audio_seconds),
      estimatedCostCents,
      monthlyBudgetCents,
      startingBalanceCents,
      balancePeriodUsageCents,
      estimatedRemainingBudgetCents:
        monthlyBudgetCents === null ? null : Math.max(0, monthlyBudgetCents - estimatedCostCents),
      estimatedRemainingBalanceCents:
        startingBalanceCents === null ? null : startingBalanceCents - balancePeriodUsageCents,
    },
    byFeature: featureResult.rows.map((featureRow) => ({
      feature: featureRow.feature,
      requests: toNumber(featureRow.requests),
      totalTokens: toNumber(featureRow.total_tokens),
      estimatedAudioSeconds: toNumber(featureRow.estimated_audio_seconds),
      estimatedCostCents: toNumber(featureRow.estimated_cost_cents),
      lastUsedAt: featureRow.last_used_at ? new Date(featureRow.last_used_at).toISOString() : null,
    })),
    byModel: modelResult.rows.map((modelRow) => ({
      model: modelRow.model,
      requests: toNumber(modelRow.requests),
      totalTokens: toNumber(modelRow.total_tokens),
      estimatedAudioSeconds: toNumber(modelRow.estimated_audio_seconds),
      estimatedCostCents: toNumber(modelRow.estimated_cost_cents),
    })),
    daily: dailyResult.rows.map((dailyRow) => ({
      date: new Date(dailyRow.usage_date).toISOString().slice(0, 10),
      requests: toNumber(dailyRow.requests),
      totalTokens: toNumber(dailyRow.total_tokens),
      estimatedCostCents: toNumber(dailyRow.estimated_cost_cents),
    })),
  };
}

export async function listOpenAiUsageLogs(
  tenantId: string,
  range: OpenAiUsageRange,
  filters?: { feature?: string; model?: string; limit?: number; offset?: number }
) {
  const params: unknown[] = [tenantId, range.startDate, range.endDate];
  const where = ["tenant_id = $1", "created_at >= $2", "created_at <= $3"];

  if (filters?.feature) {
    params.push(filters.feature);
    where.push(`feature = $${params.length}`);
  }
  if (filters?.model) {
    params.push(filters.model);
    where.push(`model = $${params.length}`);
  }

  const limit = Math.min(Math.max(filters?.limit || 50, 1), 200);
  const offset = Math.max(filters?.offset || 0, 0);
  params.push(limit, offset);
  const limitParam = params.length - 1;
  const offsetParam = params.length;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT
         id,
         feature,
         model,
         endpoint,
         request_id,
         status_code,
         ok,
         duration_ms,
         prompt_tokens,
         completion_tokens,
         total_tokens,
         input_tokens,
         output_tokens,
         cached_input_tokens,
         audio_input_tokens,
         audio_output_tokens,
         estimated_audio_seconds,
         estimated_cost_cents,
         resource_type,
         resource_id,
         metadata,
         created_at
       FROM openai_usage_audit
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM openai_usage_audit
       WHERE ${where.join(" AND ")}`,
      params.slice(0, params.length - 2)
    ),
  ]);

  return {
    logs: rowsResult.rows.map((row) => ({
      id: row.id,
      feature: row.feature,
      model: row.model,
      endpoint: row.endpoint,
      requestId: row.request_id,
      statusCode: row.status_code === null || row.status_code === undefined ? null : Number(row.status_code),
      ok: row.ok,
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
      promptTokens: toNumber(row.prompt_tokens),
      completionTokens: toNumber(row.completion_tokens),
      totalTokens: toNumber(row.total_tokens),
      inputTokens: toNumber(row.input_tokens),
      outputTokens: toNumber(row.output_tokens),
      cachedInputTokens: toNumber(row.cached_input_tokens),
      audioInputTokens: toNumber(row.audio_input_tokens),
      audioOutputTokens: toNumber(row.audio_output_tokens),
      estimatedAudioSeconds: toNumber(row.estimated_audio_seconds),
      estimatedCostCents: toNumber(row.estimated_cost_cents),
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata || {},
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
    total: toNumber(countResult.rows[0]?.total),
    limit,
    offset,
  };
}
