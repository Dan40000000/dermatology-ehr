import request from "supertest";
import express from "express";
import { claimsRouter } from "../claims";
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

const app = express();
app.use(express.json());
app.use("/claims", claimsRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Claims routes", () => {
  it("GET /claims returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "claim-1" }] });
    const res = await request(app).get("/claims");
    expect(res.status).toBe(200);
    expect(res.body.claims).toHaveLength(1);
  });

  it("GET /claims/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get("/claims/claim-1");
    expect(res.status).toBe(404);
  });

  it("GET /claims/:id returns claim details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "claim-1", encounterId: "enc-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "diag-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "charge-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pay-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "hist-1" }] });
    const res = await request(app).get("/claims/claim-1");
    expect(res.status).toBe(200);
    expect(res.body.claim.id).toBe("claim-1");
    expect(res.body.diagnoses).toHaveLength(1);
    expect(res.body.charges).toHaveLength(1);
  });

  it("POST /claims rejects invalid payload", async () => {
    const res = await request(app).post("/claims").send({});
    expect(res.status).toBe(400);
  });

  it("POST /claims creates claim", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 10000 }] }) // sum charges
      .mockResolvedValueOnce({ rows: [] }) // insert claim
      .mockResolvedValueOnce({ rows: [] }); // status history

    const res = await request(app).post("/claims").send({
      patientId: "patient-1",
      encounterId: "enc-1",
      payer: "Test Payer",
      payerId: "payer-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });

  it("PUT /claims/:id/status rejects invalid payload", async () => {
    const res = await request(app).put("/claims/claim-1/status").send({ status: "bad" });
    expect(res.status).toBe(400);
  });

  it("PUT /claims/:id/status returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).put("/claims/claim-1/status").send({ status: "submitted" });
    expect(res.status).toBe(404);
  });

  it("PUT /claims/:id/status updates claim", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "claim-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/claims/claim-1/status").send({ status: "submitted", notes: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /claims/:id/payments returns 404 when claim missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post("/claims/claim-1/payments").send({
      amountCents: 1000,
      paymentDate: "2025-01-01",
    });
    expect(res.status).toBe(404);
  });

  it("POST /claims/:id/payments posts payment", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "submitted" }] })
      .mockResolvedValueOnce({ rows: [] }) // insert payment
      .mockResolvedValueOnce({ rows: [{ totalPaid: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ totalCents: 1000 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/claims/claim-1/payments").send({
      amountCents: 1000,
      paymentDate: "2025-01-01",
      paymentMethod: "check",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });
});
