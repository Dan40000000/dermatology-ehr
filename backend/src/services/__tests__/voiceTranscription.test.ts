import fs from "fs";
import { VoiceTranscriptionService } from "../voiceTranscription";
import { pool } from "../../db/pool";

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

const queryMock = pool.query as jest.Mock;
const existsSyncMock = fs.existsSync as jest.Mock;
const unlinkSyncMock = fs.unlinkSync as jest.Mock;

const originalApiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  existsSyncMock.mockReset();
  unlinkSyncMock.mockReset();
  delete process.env.OPENAI_API_KEY;
});

afterAll(() => {
  if (originalApiKey) {
    process.env.OPENAI_API_KEY = originalApiKey;
  } else {
    delete process.env.OPENAI_API_KEY;
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
});
