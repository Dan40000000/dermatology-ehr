import request from "supertest";
import express from "express";
import telehealthRouter from "../telehealth";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 101, tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/telehealth", telehealthRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Telehealth routes", () => {
  it("POST /telehealth/sessions rejects invalid payload", async () => {
    const res = await request(app).post("/telehealth/sessions").send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it("POST /telehealth/sessions creates a session", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "license-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "session-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/sessions").send({
      patientId: 1,
      providerId: 2,
      patientState: "CO",
      recordingConsent: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("session-1");
  });

  it("GET /telehealth/sessions/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/telehealth/sessions/session-1");

    expect(res.status).toBe(404);
  });

  it("GET /telehealth/sessions/:id returns session", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "session-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("session-1");
  });

  it("GET /telehealth/sessions returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "session-1" }] });

    const res = await request(app).get("/telehealth/sessions");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("PATCH /telehealth/sessions/:id/status updates status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "session-1", status: "completed" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/telehealth/sessions/session-1/status")
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("GET /telehealth/stats returns statistics", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          in_progress_count: "5",
          completed_count: "10",
          unassigned_count: "2",
        },
      ],
    });

    const res = await request(app).get("/telehealth/stats");

    expect(res.status).toBe(200);
    expect(res.body.myInProgress).toBe(5);
    expect(res.body.myCompleted).toBe(10);
    expect(res.body.unassignedCases).toBe(2);
    expect(res.body.myUnreadMessages).toBe(0);
  });

  it("GET /telehealth/stats supports date filtering", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          in_progress_count: "3",
          completed_count: "7",
          unassigned_count: "1",
        },
      ],
    });

    const res = await request(app)
      .get("/telehealth/stats")
      .query({ startDate: "2024-01-01", endDate: "2024-12-31" });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ts.created_at >="),
      expect.arrayContaining(["tenant-1", 101, "2024-01-01", "2024-12-31"])
    );
  });

  it("POST /telehealth/sessions accepts reason and assignedTo", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "license-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "session-1", reason: "Acne", assigned_to: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/sessions").send({
      patientId: 1,
      providerId: 2,
      patientState: "CO",
      recordingConsent: true,
      reason: "Acne",
      assignedTo: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.reason).toBe("Acne");
    expect(res.body.assigned_to).toBe(5);
  });

  it("GET /telehealth/sessions filters by reason", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "session-1", reason: "Rash" }],
    });

    const res = await request(app).get("/telehealth/sessions").query({ reason: "Rash" });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ts.reason ="),
      expect.arrayContaining(["tenant-1", "Rash"])
    );
  });

  it("GET /telehealth/sessions filters by assignedTo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "session-1", assigned_to: 5 }],
    });

    const res = await request(app).get("/telehealth/sessions").query({ assignedTo: "5" });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ts.assigned_to ="),
      expect.arrayContaining(["tenant-1", "5"])
    );
  });

  it("GET /telehealth/sessions filters by physician", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "session-1", provider_id: 3 }],
    });

    const res = await request(app).get("/telehealth/sessions").query({ physicianId: "3" });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("ts.provider_id ="),
      expect.arrayContaining(["tenant-1", "3"])
    );
  });

  it("POST /telehealth/waiting-room/join adds entry", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "wr-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/waiting-room/join").send({
      sessionId: "session-1",
      patientId: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("wr-1");
  });

  it("PATCH /telehealth/waiting-room/:id/equipment-check updates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "wr-1" }] });

    const res = await request(app)
      .patch("/telehealth/waiting-room/wr-1/equipment-check")
      .send({ camera: true, microphone: true, speaker: true, bandwidth: true, browser: true });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("wr-1");
  });

  it("POST /telehealth/waiting-room/:id/chat adds message", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "wr-1" }] });

    const res = await request(app)
      .post("/telehealth/waiting-room/wr-1/chat")
      .send({ message: "Hello", sender: "patient" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("wr-1");
  });

  it("GET /telehealth/waiting-room returns queue", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "wr-1" }] });

    const res = await request(app).get("/telehealth/waiting-room");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/waiting-room/:id/call updates status", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "wr-1", session_id: "session-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/waiting-room/wr-1/call");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("wr-1");
  });

  it("POST /telehealth/sessions/:id/notes creates notes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "note-1" }] });

    const res = await request(app).post("/telehealth/sessions/session-1/notes").send({
      chiefComplaint: "Rash",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("note-1");
  });

  it("POST /telehealth/sessions/:id/notes updates notes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "note-1" }] }).mockResolvedValueOnce({ rows: [{ id: "note-1" }] });

    const res = await request(app).post("/telehealth/sessions/session-1/notes").send({
      assessment: "Dermatitis",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("note-1");
  });

  it("GET /telehealth/sessions/:id/notes returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/telehealth/sessions/session-1/notes");

    expect(res.status).toBe(404);
  });

  it("GET /telehealth/sessions/:id/notes returns notes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "note-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1/notes");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("note-1");
  });

  it("POST /telehealth/sessions/:id/notes/finalize finalizes notes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "note-1", finalized: true }] });

    const res = await request(app).post("/telehealth/sessions/session-1/notes/finalize");

    expect(res.status).toBe(200);
    expect(res.body.finalized).toBe(true);
  });

  it("POST /telehealth/sessions/:id/metrics saves metrics", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "metric-1" }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/sessions/session-1/metrics").send({
      participantType: "patient",
      bitrateKbps: 1200,
      packetLossPercent: 0.5,
      jitterMs: 5,
      latencyMs: 80,
      videoResolution: "720p",
      videoFps: 30,
      audioQuality: "good",
      connectionType: "wifi",
      bandwidthUpMbps: 5,
      bandwidthDownMbps: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("metric-1");
  });

  it("GET /telehealth/sessions/:id/metrics returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "metric-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1/metrics");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/sessions/:id/recordings/start rejects when no consent", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ recording_consent: false }] });

    const res = await request(app).post("/telehealth/sessions/session-1/recordings/start");

    expect(res.status).toBe(403);
  });

  it("POST /telehealth/sessions/:id/recordings/start creates recording", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ recording_consent: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "rec-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/sessions/session-1/recordings/start");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("rec-1");
  });

  it("POST /telehealth/recordings/:id/stop updates recording", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rec-1" }] });

    const res = await request(app).post("/telehealth/recordings/rec-1/stop").send({
      durationSeconds: 60,
      fileSizeBytes: 2048,
      resolution: "720p",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("rec-1");
  });

  it("GET /telehealth/sessions/:id/recordings returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rec-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1/recordings");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/sessions/:id/photos returns 404 when session missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/sessions/session-1/photos").send({
      filePath: "path.jpg",
    });

    expect(res.status).toBe(404);
  });

  it("POST /telehealth/sessions/:id/photos captures photo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ patient_id: 55 }] }).mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).post("/telehealth/sessions/session-1/photos").send({
      filePath: "path.jpg",
      bodySite: "arm",
      viewType: "close",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("photo-1");
  });

  it("GET /telehealth/sessions/:id/photos returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1/photos");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/provider-licenses adds license", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "license-1" }] });

    const res = await request(app).post("/telehealth/provider-licenses").send({
      providerId: 2,
      stateCode: "CO",
      licenseNumber: "ABC",
      licenseType: "MD",
      issueDate: "2024-01-01",
      expirationDate: "2026-01-01",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("license-1");
  });

  it("GET /telehealth/providers/:id/licenses returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "license-1" }] });

    const res = await request(app).get("/telehealth/providers/2/licenses");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /telehealth/educational-content returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "content-1" }] });

    const res = await request(app).get("/telehealth/educational-content");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/educational-content/:id/view tracks view", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/telehealth/educational-content/content-1/view");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /telehealth/sessions/:id/events returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "event-1" }] });

    const res = await request(app).get("/telehealth/sessions/session-1/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /telehealth/sessions/:id/events logs event", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "event-1" }] });

    const res = await request(app).post("/telehealth/sessions/session-1/events").send({
      eventType: "custom",
      eventData: { note: "test" },
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("event-1");
  });
});
