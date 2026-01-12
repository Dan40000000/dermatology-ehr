import request from "supertest";
import express from "express";
import { auditRouter } from "../audit";
import { pool } from "../../db/pool";
import { createAuditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  createAuditLog: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/audit", auditRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = createAuditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Audit routes", () => {
  it("GET /audit/appointments returns history", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "hist-1" }] });
    const res = await request(app).get("/audit/appointments");
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
  });

  it("GET /audit/log returns audit log", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "log-1" }] });
    const res = await request(app).get("/audit/log");
    expect(res.status).toBe(200);
    expect(res.body.audit).toHaveLength(1);
  });

  it("GET /audit returns paged logs", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "log-1" }, { id: "log-2" }] });
    const res = await request(app).get("/audit?userId=user-1&limit=2&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.logs).toHaveLength(2);
  });

  it("GET /audit/user/:userId returns user logs", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "log-1" }] });
    const res = await request(app).get("/audit/user/user-1?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
  });

  it("GET /audit/resource/:type/:id returns resource logs", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "log-1" }] });
    const res = await request(app).get("/audit/resource/patient/p-1?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
  });

  it("GET /audit/summary returns stats", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // total
      .mockResolvedValueOnce({ rows: [{ count: "3" }] }) // users
      .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // failed
      .mockResolvedValueOnce({ rows: [{ count: "4" }] }) // accesses
      .mockResolvedValueOnce({ rows: [{ action: "view", count: 2 }] }) // actions
      .mockResolvedValueOnce({ rows: [{ resourceType: "patient", count: 2 }] }); // resources
    const res = await request(app).get("/audit/summary");
    expect(res.status).toBe(200);
    expect(res.body.totalEvents).toBe(10);
  });

  it("POST /audit/export returns 404 when no rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/audit/export").send({ filters: {} });
    expect(res.status).toBe(404);
  });

  it("POST /audit/export returns csv", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "row-1", "User ID": "u1", Action: "view" }] });
    auditLogMock.mockResolvedValueOnce({});
    const res = await request(app).post("/audit/export").send({ filters: { action: "view" } });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });
});
