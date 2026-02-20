import request from "supertest";
import express from "express";
import crypto from "crypto";
import { visitSummariesRouter } from "../visitSummaries";
import { pool } from "../../db/pool";
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

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/visit-summaries", visitSummariesRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const encounterId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const providerId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Visit summary routes", () => {
  it("GET /visit-summaries returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "vs-1" }] });

    const res = await request(app).get("/visit-summaries?released=true");

    expect(res.status).toBe(200);
    expect(res.body.visitSummaries).toHaveLength(1);
    expect(String(queryMock.mock.calls[0]?.[0] || "")).toMatch(/\bpr\.full_name\b/);
  });

  it("GET /visit-summaries logs sanitized Error failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("visit summary list failed"));

    const res = await request(app).get("/visit-summaries");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get visit summaries");
    expect(loggerMock.error).toHaveBeenCalledWith("Get visit summaries error:", {
      error: "visit summary list failed",
    });
  });

  it("GET /visit-summaries masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/visit-summaries");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get visit summaries");
    expect(loggerMock.error).toHaveBeenCalledWith("Get visit summaries error:", {
      error: "Unknown error",
    });
  });

  it("GET /visit-summaries/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/visit-summaries/vs-1");

    expect(res.status).toBe(404);
  });

  it("GET /visit-summaries/:id returns record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "vs-1" }] });

    const res = await request(app).get("/visit-summaries/vs-1");

    expect(res.status).toBe(200);
    expect(res.body.visitSummary.id).toBe("vs-1");
  });

  it("POST /visit-summaries rejects invalid payload", async () => {
    const res = await request(app).post("/visit-summaries").send({});

    expect(res.status).toBe(400);
  });

  it("POST /visit-summaries returns 404 when encounter missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries").send({
      encounterId,
      patientId,
      providerId,
      visitDate: "2025-01-01",
    });

    expect(res.status).toBe(404);
  });

  it("POST /visit-summaries returns 400 when summary exists", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: encounterId }] })
      .mockResolvedValueOnce({ rows: [{ id: "vs-1" }] });

    const res = await request(app).post("/visit-summaries").send({
      encounterId,
      patientId,
      providerId,
      visitDate: "2025-01-01",
    });

    expect(res.status).toBe(400);
  });

  it("POST /visit-summaries creates summary", async () => {
    randomUUIDMock.mockReturnValueOnce("vs-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: encounterId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries").send({
      encounterId,
      patientId,
      providerId,
      visitDate: "2025-01-01",
      diagnoses: [{ code: "L12", description: "Test" }],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("vs-1");
  });

  it("POST /visit-summaries/auto-generate rejects missing encounterId", async () => {
    const res = await request(app).post("/visit-summaries/auto-generate").send({});

    expect(res.status).toBe(400);
  });

  it("POST /visit-summaries/auto-generate returns 404 when encounter missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/visit-summaries/auto-generate")
      .send({ encounterId });

    expect(res.status).toBe(404);
  });

  it("POST /visit-summaries/auto-generate creates summary", async () => {
    randomUUIDMock.mockReturnValueOnce("vs-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{
        id: encounterId,
        patient_id: patientId,
        provider_id: providerId,
        encounter_date: "2025-01-01",
        chief_complaint: "itch",
      }] })
      .mockResolvedValueOnce({ rows: [{ code: "L12" }] })
      .mockResolvedValueOnce({ rows: [{ code: "CPT" }] })
      .mockResolvedValueOnce({ rows: [{ name: "Rx" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/visit-summaries/auto-generate")
      .send({ encounterId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("vs-1");
    expect(String(queryMock.mock.calls[0]?.[0] || "")).toMatch(/COALESCE\(a\.scheduled_start,\s*e\.created_at\)\s+AS\s+encounter_date/i);
    expect(String(queryMock.mock.calls[0]?.[0] || "")).not.toMatch(/\be\.encounter_date\b/i);
  });

  it("PUT /visit-summaries/:id rejects empty update", async () => {
    const res = await request(app).put("/visit-summaries/vs-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /visit-summaries/:id returns 404 when missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/visit-summaries/vs-1")
      .send({ chiefComplaint: "Updated" });

    expect(res.status).toBe(404);
  });

  it("PUT /visit-summaries/:id updates summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "vs-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/visit-summaries/vs-1")
      .send({ chiefComplaint: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /visit-summaries/:id/release returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries/vs-1/release");

    expect(res.status).toBe(404);
  });

  it("POST /visit-summaries/:id/release releases summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ patient_id: patientId }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries/vs-1/release");

    expect(res.status).toBe(200);
  });

  it("POST /visit-summaries/:id/unrelease returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries/vs-1/unrelease");

    expect(res.status).toBe(404);
  });

  it("POST /visit-summaries/:id/unrelease hides summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "vs-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/visit-summaries/vs-1/unrelease");

    expect(res.status).toBe(200);
  });

  it("DELETE /visit-summaries/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/visit-summaries/vs-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /visit-summaries/:id deletes summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "vs-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/visit-summaries/vs-1");

    expect(res.status).toBe(200);
  });
});
