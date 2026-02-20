import request from "supertest";
import express from "express";
import crypto from "crypto";
import { rxChangeRequestsRouter } from "../rxChangeRequests";
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
app.use("/rx-change-requests", rxChangeRequestsRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const patientId = "11111111-1111-4111-8111-111111111111";
const rxId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Rx change request routes", () => {
  it("GET /rx-change-requests returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).get("/rx-change-requests");

    expect(res.status).toBe(200);
    expect(res.body.rxChangeRequests).toHaveLength(1);
  });

  it("GET /rx-change-requests logs sanitized Error failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("rx change list failed"));

    const res = await request(app).get("/rx-change-requests");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch Rx change requests");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Rx change requests:", {
      error: "rx change list failed",
    });
  });

  it("GET /rx-change-requests masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ ssn: "123-45-6789" });

    const res = await request(app).get("/rx-change-requests");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch Rx change requests");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Rx change requests:", {
      error: "Unknown error",
    });
  });

  it("GET /rx-change-requests/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/rx-change-requests/req-1");

    expect(res.status).toBe(404);
  });

  it("GET /rx-change-requests/:id returns record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).get("/rx-change-requests/req-1");

    expect(res.status).toBe(200);
    expect(res.body.rxChangeRequest.id).toBe("req-1");
  });

  it("POST /rx-change-requests rejects invalid payload", async () => {
    const res = await request(app).post("/rx-change-requests").send({});

    expect(res.status).toBe(400);
  });

  it("POST /rx-change-requests returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/rx-change-requests").send({
      patientId,
      originalDrug: "Drug A",
      changeType: "formulary",
      pharmacyName: "Pharm",
    });

    expect(res.status).toBe(404);
  });

  it("POST /rx-change-requests creates request", async () => {
    randomUUIDMock.mockReturnValueOnce("req-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: patientId }] })
      .mockResolvedValueOnce({ rows: [{ provider_id: "prov-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/rx-change-requests").send({
      patientId,
      originalPrescriptionId: rxId,
      originalDrug: "Drug A",
      changeType: "formulary",
      pharmacyName: "Pharm",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("req-1");
  });

  it("PUT /rx-change-requests/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/rx-change-requests/req-1")
      .send({ status: "approved" });

    expect(res.status).toBe(404);
  });

  it("PUT /rx-change-requests/:id updates request", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "req-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/rx-change-requests/req-1")
      .send({ status: "approved", responseNotes: "OK" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /rx-change-requests/:id/approve returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/rx-change-requests/req-1/approve").send({});

    expect(res.status).toBe(404);
  });

  it("POST /rx-change-requests/:id/approve updates status", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "req-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/rx-change-requests/req-1/approve")
      .send({ responseNotes: "OK" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /rx-change-requests/:id/deny rejects missing notes", async () => {
    const res = await request(app).post("/rx-change-requests/req-1/deny").send({});

    expect(res.status).toBe(400);
  });

  it("POST /rx-change-requests/:id/deny updates status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/rx-change-requests/req-1/deny")
      .send({ responseNotes: "Denied" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /rx-change-requests/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/rx-change-requests/req-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /rx-change-requests/:id deletes request", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).delete("/rx-change-requests/req-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
