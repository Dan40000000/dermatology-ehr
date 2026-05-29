import {
  meteredOpenAiFetch,
  OpenAiSpendGuardError,
  resetOpenAiSpendGuardForTests,
} from "../openAiSpendGuard";

describe("openAiSpendGuard", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MAX_REQUESTS_PER_HOUR: "20",
      OPENAI_MAX_REQUESTS_PER_DAY: "100",
      OPENAI_AMBIENT_LIVE_INSIGHTS_MIN_INTERVAL_MS: "30000",
    };
    resetOpenAiSpendGuardForTests();
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_test",
        },
      }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    resetOpenAiSpendGuardForTests();
  });

  it("blocks calls when OpenAI API calls are disabled", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_CALLS_ENABLED = "false";

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "clinical_copilot",
        model: "gpt-4o-mini",
      }),
    ).rejects.toBeInstanceOf(OpenAiSpendGuardError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("enforces the hourly request cap before the network call", async () => {
    process.env.OPENAI_MAX_REQUESTS_PER_HOUR = "2";

    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
    });
    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
      feature: "ai_note_drafting",
      model: "gpt-4o-mini",
    });

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "ambient_note_generation",
        model: "gpt-4o-mini",
      }),
    ).rejects.toBeInstanceOf(OpenAiSpendGuardError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throttles live insight loops by feature", async () => {
    process.env.OPENAI_MAX_REQUESTS_PER_HOUR = "20";
    process.env.OPENAI_AMBIENT_LIVE_INSIGHTS_MIN_INTERVAL_MS = "60000";

    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
      feature: "ambient_live_insights",
      model: "gpt-4o-mini",
    });

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "ambient_live_insights",
        model: "gpt-4o-mini",
      }),
    ).rejects.toBeInstanceOf(OpenAiSpendGuardError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
