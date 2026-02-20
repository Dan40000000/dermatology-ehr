import request from "supertest";
import express from "express";
import path from "path";
import fs from "fs";
import voiceTranscriptionRouter from "../voiceTranscription";
import { voiceTranscriptionService } from "../../services/voiceTranscription";
import { auditLog } from "../../services/audit";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/voiceTranscription", () => ({
  voiceTranscriptionService: {
    transcribeAudio: jest.fn(),
    getTranscription: jest.fn(),
    getEncounterTranscriptions: jest.fn(),
    transcriptionToNoteSections: jest.fn(),
    getTranscriptionStats: jest.fn(),
    deleteTranscription: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/voice", voiceTranscriptionRouter);

const serviceMock = voiceTranscriptionService as jest.Mocked<typeof voiceTranscriptionService>;
const auditMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const uploadsDir = path.join(process.cwd(), "uploads", "audio");
const fixturePath = path.join(__dirname, "fixtures", "test-audio.wav");

beforeAll(() => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
});

afterEach(() => {
  serviceMock.transcribeAudio.mockReset();
  serviceMock.getTranscription.mockReset();
  serviceMock.getEncounterTranscriptions.mockReset();
  serviceMock.transcriptionToNoteSections.mockReset();
  serviceMock.getTranscriptionStats.mockReset();
  serviceMock.deleteTranscription.mockReset();
  auditMock.mockReset();
  loggerMock.error.mockReset();

  if (fs.existsSync(uploadsDir)) {
    for (const file of fs.readdirSync(uploadsDir)) {
      if (file.startsWith("audio-")) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
    }
  }
});

describe("Voice transcription routes", () => {
  it("POST /voice/transcribe logs sanitized Error failures", async () => {
    serviceMock.transcribeAudio.mockRejectedValueOnce(new Error("transcribe failed"));

    const res = await request(app).post("/voice/transcribe").attach("audio", fixturePath);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("transcribe failed");
    expect(loggerMock.error).toHaveBeenCalledWith("Transcription error", {
      error: "transcribe failed",
    });
  });

  it("POST /voice/transcribe masks non-Error failures in logs", async () => {
    serviceMock.transcribeAudio.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).post("/voice/transcribe").attach("audio", fixturePath);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to transcribe audio");
    expect(loggerMock.error).toHaveBeenCalledWith("Transcription error", {
      error: "Unknown error",
    });
  });

  it("POST /voice/transcribe rejects missing file", async () => {
    const res = await request(app).post("/voice/transcribe");

    expect(res.status).toBe(400);
  });

  it("POST /voice/transcribe uploads and transcribes audio", async () => {
    serviceMock.transcribeAudio.mockResolvedValueOnce({
      id: "trans-1",
      transcriptionText: "Hello",
    } as any);

    const res = await request(app)
      .post("/voice/transcribe")
      .attach("audio", fixturePath)
      .field("language", "en");

    expect(res.status).toBe(200);
    expect(res.body.transcription.id).toBe("trans-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /voice/transcriptions/:id returns 404 when missing", async () => {
    serviceMock.getTranscription.mockResolvedValueOnce(null as any);

    const res = await request(app).get("/voice/transcriptions/trans-1");

    expect(res.status).toBe(404);
  });

  it("GET /voice/transcriptions/:id returns transcription", async () => {
    serviceMock.getTranscription.mockResolvedValueOnce({ id: "trans-1" } as any);

    const res = await request(app).get("/voice/transcriptions/trans-1");

    expect(res.status).toBe(200);
    expect(res.body.transcription.id).toBe("trans-1");
  });

  it("GET /voice/encounters/:encounterId returns list", async () => {
    serviceMock.getEncounterTranscriptions.mockResolvedValueOnce([{ id: "t1" } as any]);

    const res = await request(app).get("/voice/encounters/enc-1");

    expect(res.status).toBe(200);
    expect(res.body.transcriptions).toHaveLength(1);
  });

  it("POST /voice/transcriptions/:id/to-note returns 404 when missing", async () => {
    serviceMock.getTranscription.mockResolvedValueOnce(null as any);

    const res = await request(app).post("/voice/transcriptions/trans-1/to-note");

    expect(res.status).toBe(404);
  });

  it("POST /voice/transcriptions/:id/to-note returns note sections", async () => {
    serviceMock.getTranscription.mockResolvedValueOnce({
      transcriptionText: "Some notes",
    } as any);
    serviceMock.transcriptionToNoteSections.mockResolvedValueOnce([{ title: "HPI" }] as any);

    const res = await request(app).post("/voice/transcriptions/trans-1/to-note");

    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(1);
  });

  it("GET /voice/stats returns stats with minutes", async () => {
    serviceMock.getTranscriptionStats.mockResolvedValueOnce({
      totalDurationSeconds: 125,
      totalTranscriptions: 2,
    } as any);

    const res = await request(app).get("/voice/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalDurationMinutes).toBe(2);
  });

  it("DELETE /voice/transcriptions/:id returns 404 when missing", async () => {
    serviceMock.deleteTranscription.mockResolvedValueOnce(false as any);

    const res = await request(app).delete("/voice/transcriptions/trans-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /voice/transcriptions/:id deletes transcription", async () => {
    serviceMock.deleteTranscription.mockResolvedValueOnce(true as any);

    const res = await request(app).delete("/voice/transcriptions/trans-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });
});
