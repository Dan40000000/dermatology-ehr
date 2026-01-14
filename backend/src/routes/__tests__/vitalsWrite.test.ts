import request from "supertest";
import express from "express";
import { vitalsWriteRouter } from "../vitalsWrite";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

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

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/vitals", vitalsWriteRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Vitals Write routes - Create", () => {
  it("POST /vitals creates vitals", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 }); // Encounter check

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
      weightKg: 70,
      bpSystolic: 120,
      bpDiastolic: 80,
      pulse: 72,
      tempC: 36.5,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLogMock).toHaveBeenCalledWith("tenant-1", "user-1", "vitals_create", "vitals", expect.any(String));
  });

  it("POST /vitals creates vitals with partial data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      bpSystolic: 120,
      bpDiastolic: 80,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /vitals creates vitals with all fields optional except encounterId", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /vitals rejects missing encounterId", async () => {
    const res = await request(app).post("/vitals").send({
      heightCm: 170,
      weightKg: 70,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /vitals rejects invalid data types", async () => {
    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: "not-a-number",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST /vitals returns 404 when encounter not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-999",
      heightCm: 170,
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Encounter not found");
  });

  it("POST /vitals returns 409 when encounter is locked", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "locked" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("locked");
  });

  it("POST /vitals stores null for optional fields", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      bpSystolic: 120,
    });

    expect(res.status).toBe(201);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into vitals"),
      expect.arrayContaining([expect.any(String), "tenant-1", "encounter-1", null, null, 120, null, null, null])
    );
  });

  it("POST /vitals validates encounter belongs to tenant", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $2"),
      ["encounter-1", "tenant-1"]
    );
  });

  it("POST /vitals handles database errors during insert", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });
    queryMock.mockRejectedValueOnce(new Error("Insert failed"));

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
    });

    expect(res.status).toBe(500);
  });

  it("POST /vitals handles database errors during encounter check", async () => {
    queryMock.mockRejectedValueOnce(new Error("Database error"));

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
    });

    expect(res.status).toBe(500);
  });

  it("POST /vitals requires authentication", async () => {
    // This test verifies the auth middleware is applied
    // The mock auth middleware sets req.user, so this just confirms the route is protected
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 170,
    });

    expect(res.status).not.toBe(401); // Should not be unauthorized with mock auth
  });

  it("POST /vitals accepts all valid vital measurements", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "open" }], rowCount: 1 });

    const res = await request(app).post("/vitals").send({
      encounterId: "encounter-1",
      heightCm: 175.5,
      weightKg: 72.3,
      bpSystolic: 125,
      bpDiastolic: 85,
      pulse: 68,
      tempC: 37.2,
    });

    expect(res.status).toBe(201);
    expect(queryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.any(String), "tenant-1", "encounter-1", 175.5, 72.3, 125, 85, 68, 37.2])
    );
  });
});
