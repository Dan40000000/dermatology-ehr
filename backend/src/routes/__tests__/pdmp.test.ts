import request from "supertest";
import express from "express";
import { pdmpRouter } from "../pdmp";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
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

const app = express();
app.use(express.json());
app.use("/pdmp", pdmpRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("PDMP routes", () => {
  it("POST /pdmp/check rejects missing patientId", async () => {
    const res = await request(app).post("/pdmp/check").send({ medication: "Hydrocodone" });
    expect(res.status).toBe(400);
  });

  it("POST /pdmp/check returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/pdmp/check").send({ patientId: "patient-1" });

    expect(res.status).toBe(404);
  });

  it("POST /pdmp/check returns PDMP result", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1", first_name: "Pat", last_name: "Ent", dob: "1990-01-01" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "rx-1", details: "Hydrocodone\nTake 1", created_at: "2025-01-01", provider_name: "Dr A" },
          { id: "rx-2", details: "Hydrocodone\nTake 1", created_at: "2025-01-02", provider_name: "Dr B" },
          { id: "rx-3", details: "Hydrocodone\nTake 1", created_at: "2025-01-03", provider_name: "Dr C" },
          { id: "rx-4", details: "Hydrocodone\nTake 1", created_at: "2025-01-04", provider_name: "Dr D" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/pdmp/check").send({
      patientId: "patient-1",
      medication: "Hydrocodone",
    });

    expect(res.status).toBe(200);
    expect(res.body.isControlled).toBe(true);
    expect(res.body.schedule).toBe("Schedule II");
    expect(res.body.riskScore).toBe("Moderate");
    expect(res.body.flags.length).toBe(1);
  });

  it("POST /pdmp/check handles errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/pdmp/check").send({
      patientId: "patient-1",
    });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error checking PDMP:", {
      error: "boom",
    });
  });

  it("POST /pdmp/check masks non-Error failures", async () => {
    queryMock.mockRejectedValueOnce({ patientDob: "1990-01-01" });

    const res = await request(app).post("/pdmp/check").send({
      patientId: "patient-1",
    });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error checking PDMP:", {
      error: "Unknown error",
    });
  });

  it("GET /pdmp/patients/:patientId/last-check returns null when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/pdmp/patients/patient-1/last-check");

    expect(res.status).toBe(200);
    expect(res.body.lastCheck).toBeNull();
  });

  it("GET /pdmp/patients/:patientId/last-check returns record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "check-1" }] });

    const res = await request(app).get("/pdmp/patients/patient-1/last-check");

    expect(res.status).toBe(200);
    expect(res.body.lastCheck.id).toBe("check-1");
  });

  it("GET /pdmp/patients/:patientId/history returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "check-1" }] });

    const res = await request(app).get("/pdmp/patients/patient-1/history");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});
