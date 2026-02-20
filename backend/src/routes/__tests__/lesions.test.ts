import request from "supertest";
import express from "express";
import crypto from "crypto";
import lesionsRouter from "../lesions";
import { pool } from "../../db/pool";
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

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
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
app.use("/lesions", lesionsRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  auditLogMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Lesions routes", () => {
  it("GET /lesions returns lesions list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] });

    const res = await request(app).get("/lesions");

    expect(res.status).toBe(200);
    expect(res.body.lesions).toHaveLength(1);
  });

  it("GET /lesions logs sanitized Error failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("lesion lookup failed"));

    const res = await request(app).get("/lesions");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to retrieve lesions");
    expect(loggerMock.error).toHaveBeenCalledWith("Get lesions error:", {
      error: "lesion lookup failed",
    });
  });

  it("GET /lesions masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/lesions");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to retrieve lesions");
    expect(loggerMock.error).toHaveBeenCalledWith("Get lesions error:", {
      error: "Unknown error",
    });
  });

  it("GET /lesions/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/lesions/lesion-1");

    expect(res.status).toBe(404);
  });

  it("GET /lesions/:id returns details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "measure-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "dermo-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).get("/lesions/lesion-1");

    expect(res.status).toBe(200);
    expect(res.body.lesion.id).toBe("lesion-1");
    expect(res.body.measurements).toHaveLength(1);
    expect(res.body.dermoscopy).toHaveLength(1);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.photos).toHaveLength(1);
  });

  it("POST /lesions rejects invalid payload", async () => {
    const res = await request(app).post("/lesions").send({});

    expect(res.status).toBe(400);
  });

  it("POST /lesions creates lesion", async () => {
    randomUUIDMock
      .mockReturnValueOnce("lesion-1")
      .mockReturnValueOnce("event-1");

    const res = await request(app).post("/lesions").send({
      patientId: "patient-1",
      lesionCode: "L-100",
      bodyLocation: "Arm",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("lesion-1");
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /lesions/:id/measurements updates concern on high score", async () => {
    randomUUIDMock.mockReturnValueOnce("measure-1");

    const res = await request(app)
      .post("/lesions/lesion-1/measurements")
      .send({
        lesionId: "lesion-1",
        abcdeScore: {
          asymmetry: 1,
          border: 1,
          color: 1,
          diameter: 0,
          evolving: 0,
          totalScore: 3,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("measure-1");
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /lesions/:id/dermoscopy adds exam", async () => {
    randomUUIDMock.mockReturnValueOnce("dermo-1");

    const res = await request(app)
      .post("/lesions/lesion-1/dermoscopy")
      .send({ lesionId: "lesion-1", dermoscopyScore: 2 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("dermo-1");
  });

  it("POST /lesions/:id/events adds event", async () => {
    randomUUIDMock.mockReturnValueOnce("event-1");

    const res = await request(app)
      .post("/lesions/lesion-1/events")
      .send({ lesionId: "lesion-1", eventType: "note", description: "Updated" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("event-1");
  });

  it("GET /lesions/:id/progression calculates growth", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { length_mm: 2, width_mm: 2 },
        { length_mm: 4, width_mm: 2 },
      ],
    });

    const res = await request(app).get("/lesions/lesion-1/progression");

    expect(res.status).toBe(200);
    expect(res.body.progression).toHaveLength(2);
    expect(res.body.progression[1].growthRate).toBeGreaterThan(0);
  });

  it("PUT /lesions/:id/biopsy records biopsy", async () => {
    randomUUIDMock.mockReturnValueOnce("event-1");

    const res = await request(app)
      .put("/lesions/lesion-1/biopsy")
      .send({ biopsyDate: "2025-01-01", biopsyResult: "Benign" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PUT /lesions/:id/status updates status", async () => {
    randomUUIDMock.mockReturnValueOnce("event-1");

    const res = await request(app)
      .put("/lesions/lesion-1/status")
      .send({ status: "resolved", reason: "Healed" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /lesions/:id/biopsies returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });

    const res = await request(app).get("/lesions/lesion-1/biopsies");

    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("GET /lesions/:id/photos returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).get("/lesions/lesion-1/photos");

    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(1);
  });

  it("GET /lesions/:id/timeline returns timeline", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "timeline-1" }] });

    const res = await request(app).get("/lesions/lesion-1/timeline");

    expect(res.status).toBe(200);
    expect(res.body.timeline).toHaveLength(1);
  });
});
