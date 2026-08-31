import fs from "fs";
import { VoiceTranscriptionService } from "../voiceTranscription";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const existsSyncMock = fs.existsSync as jest.Mock;
const unlinkSyncMock = fs.unlinkSync as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const originalApiKey = process.env.OPENAI_API_KEY;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  existsSyncMock.mockReset();
  unlinkSyncMock.mockReset();
  process.env.NODE_ENV = "test";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_CALLS_ENABLED;
  delete process.env.EXTERNAL_AI_API_CALLS_ENABLED;
  delete process.env.OPENAI_BAA_ENABLED;
  delete process.env.OPENAI_BAA_APPROVED_ENDPOINTS;
  delete process.env.OPENAI_BAA_APPROVED_MODELS;
  delete process.env.HIPAA_AI_ENABLED;
  delete process.env.OPENAI_RAW_AUDIO_ALLOWED;
  loggerMock.error.mockReset();
});

afterAll(() => {
  if (originalApiKey) {
    process.env.OPENAI_API_KEY = originalApiKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("VoiceTranscriptionService", () => {
  it("transcribeAudio uses mock transcription without API key", async () => {
    const service = new VoiceTranscriptionService();
    const result = await service.transcribeAudio({
      audioFile: "/tmp/audio.wav",
      tenantId: "tenant-1",
      userId: "user-1",
      encounterId: "enc-1",
    });

    expect(result.text).toContain("Patient presents");
    expect(queryMock).toHaveBeenCalled();
  });

  it("blocks raw OpenAI audio without provider BAA attestation and does not fabricate production text", async () => {
    process.env.NODE_ENV = "production";
    process.env.OPENAI_API_KEY = "live-openai-key";
    process.env.OPENAI_API_CALLS_ENABLED = "true";
    process.env.HIPAA_AI_ENABLED = "true";
    process.env.OPENAI_RAW_AUDIO_ALLOWED = "true";
    const originalFetch = global.fetch;
    global.fetch = jest.fn();
    const service = new VoiceTranscriptionService();

    await expect(service.transcribeAudio({
      audioFile: "/tmp/patient-audio.wav",
      tenantId: "tenant-1",
      userId: "user-1",
    })).rejects.toThrow("Failed to transcribe audio");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });

  it("blocks raw OpenAI audio when the BAA is attested but audio scope is not", async () => {
    process.env.NODE_ENV = "production";
    process.env.OPENAI_API_KEY = "live-openai-key";
    process.env.OPENAI_API_CALLS_ENABLED = "true";
    process.env.OPENAI_BAA_ENABLED = "true";
    process.env.OPENAI_BAA_APPROVED_ENDPOINTS = "/v1/audio/transcriptions";
    process.env.OPENAI_BAA_APPROVED_MODELS = "gpt-4o-transcribe";
    const originalFetch = global.fetch;
    global.fetch = jest.fn();
    const service = new VoiceTranscriptionService();

    await expect(service.transcribeAudio({
      audioFile: "/tmp/patient-audio.wav",
      tenantId: "tenant-1",
      userId: "user-1",
    })).rejects.toThrow("Failed to transcribe audio");

    expect(global.fetch).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });

  it("transcribeAudio logs safe errors when persistence fails", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      service.transcribeAudio({
        audioFile: "/tmp/audio.wav",
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.toThrow("Failed to transcribe audio");

    expect(loggerMock.error).toHaveBeenCalledWith("Transcription error:", {
      error: "insert failed",
    });
  });

  it("transcribeAudio masks non-Error failures", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockRejectedValueOnce({ detail: "bad insert" });

    await expect(
      service.transcribeAudio({
        audioFile: "/tmp/audio.wav",
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.toThrow("Failed to transcribe audio");

    expect(loggerMock.error).toHaveBeenCalledWith("Transcription error:", {
      error: "Unknown error",
    });
  });

  it("getTranscription returns null when missing", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await service.getTranscription("tx-1", "tenant-1");
    expect(result).toBeNull();
  });

  it("getTranscription returns record", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tx-1" }] });
    const result = await service.getTranscription("tx-1", "tenant-1");
    expect(result?.id).toBe("tx-1");
  });

  it("getEncounterTranscriptions returns rows", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tx-1" }] });
    const result = await service.getEncounterTranscriptions("enc-1", "tenant-1");
    expect(result).toHaveLength(1);
  });

  it("transcriptionToNoteSections extracts sections", async () => {
    const service = new VoiceTranscriptionService();
    const text = "Chief Complaint: itching. History started two weeks ago. On examination: erythema. Assessment: dermatitis. Plan: topical steroid.";
    const sections = await service.transcriptionToNoteSections(text);
    expect(sections.chiefComplaint).toBe("itching");
    expect(sections.exam).toContain("erythema");
    expect(sections.assessment).toContain("dermatitis");
    expect(sections.plan).toContain("topical steroid");
  });

  it("getTranscriptionStats returns stats", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ totalTranscriptions: "2" }] });
    const result = await service.getTranscriptionStats("tenant-1", "user-1");
    expect(result.totalTranscriptions).toBe("2");
  });

  it("deleteTranscription returns false when missing", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await service.deleteTranscription("tx-1", "tenant-1");
    expect(result).toBe(false);
  });

  it("deleteTranscription deletes local file", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ audio_url: "/uploads/audio.wav" }], rowCount: 1 });
    existsSyncMock.mockReturnValueOnce(true);

    const result = await service.deleteTranscription("tx-1", "tenant-1");

    expect(result).toBe(true);
    expect(existsSyncMock).toHaveBeenCalled();
    expect(unlinkSyncMock).toHaveBeenCalled();
  });

  it("deleteTranscription logs safe errors when local file delete fails", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ audio_url: "/uploads/audio.wav" }], rowCount: 1 });
    existsSyncMock.mockReturnValueOnce(true);
    unlinkSyncMock.mockImplementationOnce(() => {
      throw new Error("unlink failed");
    });

    const result = await service.deleteTranscription("tx-1", "tenant-1");

    expect(result).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith("Failed to delete audio file:", {
      error: "unlink failed",
    });
  });

  it("deleteTranscription masks non-Error delete failures", async () => {
    const service = new VoiceTranscriptionService();
    queryMock.mockResolvedValueOnce({ rows: [{ audio_url: "/uploads/audio.wav" }], rowCount: 1 });
    existsSyncMock.mockReturnValueOnce(true);
    unlinkSyncMock.mockImplementationOnce(() => {
      throw { path: "/uploads/audio.wav" };
    });

    const result = await service.deleteTranscription("tx-1", "tenant-1");

    expect(result).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith("Failed to delete audio file:", {
      error: "Unknown error",
    });
  });
});
