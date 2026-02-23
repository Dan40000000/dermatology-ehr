import request from "supertest";
import express from "express";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: () => "order-1",
}));

let authUser: any = { id: "user-1", tenantId: "tenant-1", role: "provider" };

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authUser;
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

const { ordersRouter } = require("../orders");

const app = express();
app.use(express.json());
app.use("/orders", ordersRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  authUser = { id: "user-1", tenantId: "tenant-1", role: "provider" };
});

describe("Orders routes", () => {
  it("GET /orders returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).get("/orders");
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
  });

  it("GET /orders supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).get(
      "/orders?orderTypes=lab,imaging&statuses=draft,completed&priorities=stat&search=cbc&patientId=patient-1"
    );
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("o.type = ANY"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("o.status = ANY"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("o.priority = ANY"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("o.details ilike"));
    expect(queryMock.mock.calls[0][0]).toEqual(expect.stringContaining("o.patient_id"));
  });

  it("POST /orders rejects invalid payload", async () => {
    const res = await request(app).post("/orders").send({});
    expect(res.status).toBe(400);
  });

  it("POST /orders creates order", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "prov-1", full_name: "Dr. Demo" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/orders").send({
      patientId: "p1",
      providerId: "prov-1",
      type: "lab",
      details: "CBC",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /orders uses default provider when missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "prov-1", full_name: "Dr. Demo" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/orders").send({
      patientId: "p1",
      type: "lab",
      details: "CBC",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-1");
  });

  it("POST /orders falls back to default provider when provided providerId is invalid", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // invalid provided providerId
      .mockResolvedValueOnce({ rows: [{ id: "prov-2", full_name: "Dr. Fallback" }] }) // default provider
      .mockResolvedValueOnce({ rows: [] }); // insert

    const res = await request(app).post("/orders").send({
      patientId: "p1",
      providerId: "user-1",
      type: "lab",
      details: "Shave biopsy",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-1");
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("select id, full_name from providers where tenant_id = $1"),
      ["tenant-1"]
    );
  });

  it("POST /orders returns 400 when no providers available", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/orders").send({
      patientId: "p1",
      type: "lab",
    });

    expect(res.status).toBe(400);
  });

  it("POST /orders/:id/status rejects invalid payload", async () => {
    const res = await request(app).post("/orders/order-1/status").send({});
    expect(res.status).toBe(400);
  });

  it("POST /orders/:id/status updates status", async () => {
    authUser = { tenantId: "tenant-1", role: "provider" };
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/orders/order-1/status").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /orders/erx/send rejects invalid payload", async () => {
    const res = await request(app).post("/orders/erx/send").send({ orderId: 123 });
    expect(res.status).toBe(400);
  });

  it("POST /orders/erx/send accepts stub", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/orders/erx/send").send({
      orderId: "order-1",
      pharmacy: "CVS",
      sig: "Apply daily",
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });
});
