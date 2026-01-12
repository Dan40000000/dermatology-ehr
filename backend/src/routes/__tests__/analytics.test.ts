import request from "supertest";
import express from "express";
import { analyticsRouter } from "../analytics";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: { query: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use("/analytics", analyticsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ count: "1" }] });
});

describe("Analytics routes", () => {
  it("GET /analytics/summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ count: "4" }] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ count: "6" }] })
      .mockResolvedValueOnce({ rows: [{ total: "700" }] });
    const res = await request(app).get("/analytics/summary");
    expect(res.status).toBe(200);
    expect(res.body.counts.patients).toBe(2);
  });

  it("GET /analytics/appointments-by-day", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", count: "1" }] });
    const res = await request(app).get("/analytics/appointments-by-day?startDate=2025-01-01");
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(1);
  });

  it("GET /analytics/appointments-by-provider", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ provider: "Dr", count: "2" }] });
    const res = await request(app).get("/analytics/appointments-by-provider");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/status-counts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "scheduled", count: "2" }] });
    const res = await request(app).get("/analytics/status-counts");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/revenue-by-day", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", amount: "100" }] });
    const res = await request(app).get("/analytics/revenue-by-day");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/dashboard", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ total: "900" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });
    const res = await request(app).get("/analytics/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBe(10);
  });

  it("GET /analytics/appointments/trend", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", count: "1" }] });
    const res = await request(app).get("/analytics/appointments/trend");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/revenue/trend", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ day: "2025-01-01", amount: "100" }] });
    const res = await request(app).get("/analytics/revenue/trend");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/top-diagnoses", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "L20.9", count: "1" }] });
    const res = await request(app).get("/analytics/top-diagnoses");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/top-procedures", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "11100", count: "1" }] });
    const res = await request(app).get("/analytics/top-procedures");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/provider-productivity", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ provider: "Dr", count: "1" }] });
    const res = await request(app).get("/analytics/provider-productivity");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/patient-demographics", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ label: "18-24", count: "1" }] });
    const res = await request(app).get("/analytics/patient-demographics");
    expect(res.status).toBe(200);
  });

  it("GET /analytics/appointment-types", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ name: "Consult", count: "1" }] });
    const res = await request(app).get("/analytics/appointment-types");
    expect(res.status).toBe(200);
  });
});
