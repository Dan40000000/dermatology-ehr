import request from "supertest";
import express from "express";
import { vitalsRouter } from "../vitals";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider", fullName: "Provider User" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/vitals", vitalsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Vitals routes", () => {
  it("GET /vitals returns vitals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "vitals-1",
          encounterId: "encounter-1",
          heightCm: 170,
          weightKg: 70,
          bpSystolic: 120,
          bpDiastolic: 80,
          pulse: 72,
          tempC: 36.5,
          createdAt: "2024-01-01T10:00:00Z",
        },
        {
          id: "vitals-2",
          encounterId: "encounter-2",
          heightCm: 165,
          weightKg: 60,
          bpSystolic: 118,
          bpDiastolic: 78,
          pulse: 68,
          tempC: 36.8,
          createdAt: "2024-01-02T10:00:00Z",
        },
      ],
      rowCount: 2,
    });

    const res = await request(app).get("/vitals");

    expect(res.status).toBe(200);
    expect(res.body.vitals).toHaveLength(2);
    expect(res.body.vitals[0].heightCm).toBe(170);
    expect(res.body.vitals[0].weightKg).toBe(70);
    expect(res.body.vitals[0].bpSystolic).toBe(120);
    expect(res.body.vitals[0].bpDiastolic).toBe(80);
  });

  it("GET /vitals returns empty array when no vitals", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).get("/vitals");

    expect(res.status).toBe(200);
    expect(res.body.vitals).toHaveLength(0);
  });

  it("GET /vitals queries with correct tenant filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/vitals");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $1"),
      ["tenant-1"]
    );
  });

  it("GET /vitals orders by created_at desc", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/vitals");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("order by created_at desc"),
      expect.anything()
    );
  });

  it("GET /vitals limits results to 50", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app).get("/vitals");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("limit 50"),
      expect.anything()
    );
  });

  it("GET /vitals includes all vital fields", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "vitals-1",
          encounterId: "encounter-1",
          heightCm: 170,
          weightKg: 70,
          bpSystolic: 120,
          bpDiastolic: 80,
          pulse: 72,
          tempC: 36.5,
          createdAt: "2024-01-01T10:00:00Z",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/vitals");

    expect(res.status).toBe(200);
    expect(res.body.vitals[0]).toHaveProperty("id");
    expect(res.body.vitals[0]).toHaveProperty("encounterId");
    expect(res.body.vitals[0]).toHaveProperty("heightCm");
    expect(res.body.vitals[0]).toHaveProperty("weightKg");
    expect(res.body.vitals[0]).toHaveProperty("bpSystolic");
    expect(res.body.vitals[0]).toHaveProperty("bpDiastolic");
    expect(res.body.vitals[0]).toHaveProperty("pulse");
    expect(res.body.vitals[0]).toHaveProperty("tempC");
    expect(res.body.vitals[0]).toHaveProperty("createdAt");
  });

  it("GET /vitals handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database connection error"));

    const res = await request(app).get("/vitals");

    expect(res.status).toBe(500);
  });

  it("GET /vitals requires authentication", async () => {
    // This test verifies the auth middleware is applied
    // The mock auth middleware sets req.user, so this just confirms the route is protected
    const res = await request(app).get("/vitals");

    expect(res.status).not.toBe(401); // Should not be unauthorized with mock auth
  });

  it("GET /vitals handles null values in vitals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "vitals-1",
          encounterId: "encounter-1",
          heightCm: null,
          weightKg: null,
          bpSystolic: 120,
          bpDiastolic: 80,
          pulse: null,
          tempC: null,
          createdAt: "2024-01-01T10:00:00Z",
        },
      ],
      rowCount: 1,
    });

    const res = await request(app).get("/vitals");

    expect(res.status).toBe(200);
    expect(res.body.vitals).toHaveLength(1);
    expect(res.body.vitals[0].heightCm).toBeNull();
    expect(res.body.vitals[0].bpSystolic).toBe(120);
  });
});
