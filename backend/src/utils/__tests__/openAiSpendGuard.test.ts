import {
  meteredOpenAiFetch,
  OpenAiSpendGuardError,
  resetOpenAiSpendGuardForTests,
} from "../openAiSpendGuard";
import { recordOpenAiUsageAudit } from "../../services/openAiUsageAuditService";

jest.mock("../../services/openAiUsageAuditService", () => ({
  recordOpenAiUsageAudit: jest.fn(),
}));

describe("openAiSpendGuard", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    (recordOpenAiUsageAudit as jest.Mock).mockReset();
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

  it("records usage metadata after a completed call", async () => {
    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
      tenantId: "tenant-1",
      userId: "user-1",
      resourceType: "encounter",
      resourceId: "enc-1",
    });

    expect(recordOpenAiUsageAudit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: "user-1",
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
      endpoint: "/v1/chat/completions",
      requestId: "req_test",
      statusCode: 200,
      ok: true,
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      resourceType: "encounter",
      resourceId: "enc-1",
    }));
  });

  it("forces non-persistence for OpenAI chat and Responses JSON requests", async () => {
    process.env.OPENAI_MAX_REQUESTS_PER_HOUR = "20";

    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o-mini", store: true, messages: [] }),
    }, {
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
    });

    await meteredOpenAiFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o-mini", input: "synthetic test" }),
    }, {
      feature: "ai_note_drafting",
      model: "gpt-4o-mini",
    });

    const firstInit = (global.fetch as jest.Mock).mock.calls[0]?.[1] as RequestInit;
    const secondInit = (global.fetch as jest.Mock).mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(firstInit.body))).toMatchObject({ store: false });
    expect(JSON.parse(String(secondInit.body))).toMatchObject({ store: false });
  });

  it("requires an executed BAA attestation in production before any OpenAI request", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEPLOYMENT_ENV = "pilot-live";
    process.env.OPENAI_API_CALLS_ENABLED = "true";

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "clinical_copilot",
        model: "gpt-4o-mini",
      }),
    ).rejects.toThrow("OpenAI BAA/Healthcare Addendum is not attested");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not let NODE_ENV=test override an explicit production deployment", async () => {
    process.env.NODE_ENV = "test";
    process.env.DEPLOYMENT_ENV = "production";
    delete process.env.JEST_WORKER_ID;
    process.env.OPENAI_API_CALLS_ENABLED = "true";

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "clinical_copilot",
        model: "gpt-4o-mini",
      }),
    ).rejects.toThrow("OpenAI BAA/Healthcare Addendum is not attested");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires exact endpoint and model attestations for production OpenAI requests", async () => {
    process.env.NODE_ENV = "production";
    process.env.OPENAI_API_CALLS_ENABLED = "true";
    process.env.OPENAI_BAA_ENABLED = "true";
    process.env.OPENAI_BAA_APPROVED_ENDPOINTS = "/v1/chat/completions";
    process.env.OPENAI_BAA_APPROVED_MODELS = "gpt-4o-mini";

    await meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
      feature: "clinical_copilot",
      model: "gpt-4o-mini",
    });

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/responses", { method: "POST" }, {
        feature: "ai_note_drafting",
        model: "gpt-4o-mini",
      }),
    ).rejects.toThrow("OpenAI endpoint is outside the attested BAA scope");

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }, {
        feature: "ai_note_drafting",
        model: "unreviewed-model",
      }),
    ).rejects.toThrow("OpenAI model is outside the attested BAA scope");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps OpenAI raw audio off unless that endpoint is separately attested", async () => {
    process.env.NODE_ENV = "production";
    process.env.OPENAI_API_CALLS_ENABLED = "true";
    process.env.OPENAI_BAA_ENABLED = "true";
    process.env.OPENAI_BAA_APPROVED_ENDPOINTS = "/v1/audio/transcriptions";
    process.env.OPENAI_BAA_APPROVED_MODELS = "gpt-4o-transcribe";

    await expect(
      meteredOpenAiFetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST" }, {
        feature: "voice_transcription",
        model: "gpt-4o-transcribe",
        estimatedAudioSeconds: 30,
      }),
    ).rejects.toThrow("OpenAI raw-audio processing is not separately attested");
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.OPENAI_RAW_AUDIO_ALLOWED = "true";
    await meteredOpenAiFetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST" }, {
      feature: "voice_transcription",
      model: "gpt-4o-transcribe",
      estimatedAudioSeconds: 30,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
