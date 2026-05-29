import { pool } from "../../db/pool";
import {
  estimateAwsHealthScribeCostCents,
  estimateOpenAiCostCents,
  getOpenAiUsageSummary,
  normalizeOpenAiUsage,
  recordAwsHealthScribeUsageAudit,
  recordOpenAiUsageAudit,
  updateOpenAiUsageSettings,
} from "../openAiUsageAuditService";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
});

describe("openAiUsageAuditService", () => {
  it("normalizes chat and responses usage shapes", () => {
    expect(normalizeOpenAiUsage({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_token_details: { cached_tokens: 10, audio_tokens: 5 },
    })).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 120,
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 10,
      audioInputTokens: 5,
      audioOutputTokens: 0,
    });
  });

  it("estimates gpt-4o-mini costs in cents", () => {
    const usage = normalizeOpenAiUsage({
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      total_tokens: 2_000_000,
    });

    expect(estimateOpenAiCostCents("gpt-4o-mini", usage)).toBe(75);
  });

  it("estimates AWS HealthScribe costs in cents", () => {
    expect(estimateAwsHealthScribeCostCents(90)).toBe(15);
  });

  it("writes audit rows without storing prompt content", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await recordOpenAiUsageAudit({
      tenantId: "tenant-1",
      userId: "user-1",
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
      endpoint: "/v1/chat/completions",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      metadata: { safe: true, prompt: { nested: "ignored" } as any },
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO openai_usage_audit"),
      expect.arrayContaining([
        "tenant-1",
        "user-1",
        "clinical_copilot",
        "gpt-4o-mini",
        "/v1/chat/completions",
      ])
    );
    const params = queryMock.mock.calls[0][1];
    expect(params[1]).toBe("openai");
    expect(params[11]).toBe(10);
    expect(params[12]).toBe(5);
    expect(params[13]).toBe(15);
    expect(JSON.parse(params[23])).toEqual({ safe: true, provider: "openai" });
  });

  it("writes AWS HealthScribe rows as Amazon voice usage", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await recordAwsHealthScribeUsageAudit({
      tenantId: "tenant-1",
      userId: "user-1",
      estimatedAudioSeconds: 120,
      resourceId: "recording-1",
    });

    const params = queryMock.mock.calls[0][1];
    expect(params[1]).toBe("aws_healthscribe");
    expect(params[4]).toBe("amazon_voice_transcription");
    expect(params[5]).toBe("AWS HealthScribe");
    expect(params[19]).toBe(120);
    expect(params[20]).toBe(20);
  });

  it("returns summary with balance settings", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          total_requests: 2,
          successful_requests: 2,
          failed_requests: 0,
          total_prompt_tokens: 100,
          total_completion_tokens: 25,
          total_tokens: 125,
          estimated_audio_seconds: 60,
          estimated_cost_cents: 1.25,
          openai_cost_cents: 0.75,
          amazon_voice_cost_cents: 0.5,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          provider: "openai",
          feature: "clinical_copilot",
          requests: 2,
          total_tokens: 125,
          estimated_audio_seconds: 0,
          estimated_cost_cents: 1.25,
          last_used_at: new Date("2026-05-29T12:00:00Z"),
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          monthly_budget_cents: 1000,
          starting_balance_cents: 500,
          balance_period_start: "2026-05-01",
        }],
      })
      .mockResolvedValueOnce({ rows: [{ estimated_cost_cents: 125 }] });

    const result = await getOpenAiUsageSummary("tenant-1", {
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-31T23:59:59Z"),
    });

    expect(result.summary.totalRequests).toBe(2);
    expect(result.summary.openAiCostCents).toBe(0.75);
    expect(result.summary.amazonVoiceCostCents).toBe(0.5);
    expect(result.summary.estimatedRemainingBudgetCents).toBe(998.75);
    expect(result.summary.estimatedRemainingBalanceCents).toBe(375);
    expect(result.byFeature[0].feature).toBe("clinical_copilot");
    expect(result.byFeature[0].providerLabel).toBe("OpenAI");
  });

  it("upserts usage settings", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ monthly_budget_cents: null, starting_balance_cents: null, balance_period_start: "2026-05-01" }] })
      .mockResolvedValueOnce({ rows: [{ monthly_budget_cents: 2000, starting_balance_cents: 1500, balance_period_start: "2026-05-01" }] });

    const result = await updateOpenAiUsageSettings("tenant-1", {
      monthlyBudgetCents: 2000,
      startingBalanceCents: 1500,
    });

    expect(result.monthlyBudgetCents).toBe(2000);
    expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO openai_usage_settings"), [
      "tenant-1",
      2000,
      1500,
      "2026-05-01",
    ]);
  });
});
