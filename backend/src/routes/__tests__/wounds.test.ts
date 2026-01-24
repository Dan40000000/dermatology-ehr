import request from "supertest";
import express from "express";
import crypto from "crypto";
import woundsRouter from "../wounds";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

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

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/wounds", woundsRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Wound routes", () => {
  it("GET /wounds returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "wound-1" }] });

    const res = await request(app).get("/wounds");

    expect(res.status).toBe(200);
    expect(res.body.wounds).toHaveLength(1);
  });

  it("GET /wounds/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/wounds/wound-1");

    expect(res.status).toBe(404);
  });

  it("GET /wounds/:id returns details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "wound-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "assessment-1" }] })
      .mockResolvedValueOnce({ rows: [{ rate: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).get("/wounds/wound-1");

    expect(res.status).toBe(200);
    expect(res.body.wound.id).toBe("wound-1");
    expect(res.body.assessments).toHaveLength(1);
    expect(res.body.photos).toHaveLength(1);
  });

  it("POST /wounds rejects invalid payload", async () => {
    const res = await request(app).post("/wounds").send({});

    expect(res.status).toBe(400);
  });

  it("POST /wounds creates wound", async () => {
    randomUUIDMock.mockReturnValueOnce("wound-1");

    const res = await request(app).post("/wounds").send({
      patientId: "patient-1",
      woundType: "surgical",
      bodyRegion: "Arm",
      onsetDate: "2025-01-01",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("wound-1");
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("PUT /wounds/:id rejects empty update", async () => {
    const res = await request(app).put("/wounds/wound-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /wounds/:id updates wound", async () => {
    const res = await request(app)
      .put("/wounds/wound-1")
      .send({ notes: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it("POST /wounds/:id/assessments returns 404 when wound missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/wounds/wound-1/assessments")
      .send({ woundId: "wound-1", healingTrend: "stable" });

    expect(res.status).toBe(404);
  });

  it("POST /wounds/:id/assessments creates assessment", async () => {
    randomUUIDMock.mockReturnValueOnce("assessment-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ patient_id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/wounds/wound-1/assessments")
      .send({ woundId: "wound-1", healingTrend: "stable" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("assessment-1");
  });

  it("GET /wounds/:id/assessments returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "assessment-1" }] });

    const res = await request(app).get("/wounds/wound-1/assessments");

    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(1);
  });

  it("GET /wounds/:id/healing-metrics returns metrics", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "wound-1" }] })
      .mockResolvedValueOnce({ rows: [{ rate: 1 }] });

    const res = await request(app).get("/wounds/wound-1/healing-metrics");

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
  });

  it("GET /wounds/patient/:id/active returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "wound-1" }] });

    const res = await request(app).get("/wounds/patient/patient-1/active");

    expect(res.status).toBe(200);
    expect(res.body.wounds).toHaveLength(1);
  });

  it("PUT /wounds/:id/status rejects invalid status", async () => {
    const res = await request(app)
      .put("/wounds/wound-1/status")
      .send({ status: "bad-status" });

    expect(res.status).toBe(400);
  });

  it("PUT /wounds/:id/status updates status", async () => {
    const res = await request(app)
      .put("/wounds/wound-1/status")
      .send({ status: "healed", notes: "Done" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /wounds/:id deletes wound", async () => {
    const res = await request(app).delete("/wounds/wound-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
