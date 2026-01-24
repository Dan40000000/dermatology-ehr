import request from "supertest";
import express from "express";
import crypto from "crypto";
import { refillRequestsRouter } from "../refillRequests";
import { pool } from "../../db/pool";

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

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const app = express();
app.use(express.json());
app.use("/refill-requests", refillRequestsRouter);

const queryMock = pool.query as jest.Mock;
const randomUUIDMock = crypto.randomUUID as jest.Mock;

const patientId = "11111111-1111-4111-8111-111111111111";
const rxId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  queryMock.mockReset();
  randomUUIDMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  randomUUIDMock.mockReturnValue("uuid-1");
});

describe("Refill request routes", () => {
  it("GET /refill-requests returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).get("/refill-requests");

    expect(res.status).toBe(200);
    expect(res.body.refillRequests).toHaveLength(1);
  });

  it("GET /refill-requests/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/refill-requests/req-1");

    expect(res.status).toBe(404);
  });

  it("GET /refill-requests/:id returns record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).get("/refill-requests/req-1");

    expect(res.status).toBe(200);
    expect(res.body.refillRequest.id).toBe("req-1");
  });

  it("POST /refill-requests rejects invalid payload", async () => {
    const res = await request(app).post("/refill-requests").send({});

    expect(res.status).toBe(400);
  });

  it("POST /refill-requests returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/refill-requests").send({
      patientId,
      medicationName: "Med A",
    });

    expect(res.status).toBe(404);
  });

  it("POST /refill-requests creates request", async () => {
    randomUUIDMock.mockReturnValueOnce("req-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: patientId }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/refill-requests").send({
      patientId,
      medicationName: "Med A",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("req-1");
  });

  it("PUT /refill-requests/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/refill-requests/req-1")
      .send({ status: "approved" });

    expect(res.status).toBe(404);
  });

  it("PUT /refill-requests/:id updates request", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "req-1", status: "pending" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/refill-requests/req-1")
      .send({ status: "denied", denialReason: "Not due" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /refill-requests/:id/approve returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/refill-requests/req-1/approve");

    expect(res.status).toBe(404);
  });

  it("POST /refill-requests/:id/approve creates new prescription", async () => {
    randomUUIDMock.mockReturnValueOnce("new-rx-1");
    queryMock
      .mockResolvedValueOnce({ rows: [{ original_prescription_id: rxId }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/refill-requests/req-1/approve");

    expect(res.status).toBe(200);
    expect(res.body.newPrescriptionId).toBe("new-rx-1");
  });

  it("POST /refill-requests/:id/deny rejects missing reason", async () => {
    const res = await request(app).post("/refill-requests/req-1/deny").send({});

    expect(res.status).toBe(400);
  });

  it("POST /refill-requests/:id/deny updates status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/refill-requests/req-1/deny")
      .send({ denialReason: "Not due" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /refill-requests/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/refill-requests/req-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /refill-requests/:id deletes request", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });

    const res = await request(app).delete("/refill-requests/req-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
