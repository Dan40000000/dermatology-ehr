import request from "supertest";
import express from "express";
import { encountersRouter } from "../encounters";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { recordEncounterLearning } from "../../services/learningService";

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

jest.mock("../../services/learningService", () => ({
  recordEncounterLearning: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/encounters", encountersRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const learningMock = recordEncounterLearning as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  learningMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Encounters routes", () => {
  it("GET /encounters returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "enc-1" }] });
    const res = await request(app).get("/encounters");
    expect(res.status).toBe(200);
    expect(res.body.encounters).toHaveLength(1);
  });

  it("POST /encounters rejects invalid payload", async () => {
    const res = await request(app).post("/encounters").send({ providerId: "prov-1" });
    expect(res.status).toBe(400);
  });

  it("POST /encounters creates encounter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/encounters").send({
      patientId: "pat-1",
      providerId: "prov-1",
      chiefComplaint: "Rash",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(404);
  });

  it("POST /encounters/:id returns 409 when locked", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "locked" }] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(409);
  });

  it("POST /encounters/:id updates encounter", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "draft" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/encounters/enc-1").send({ chiefComplaint: "Update" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /encounters/:id/status rejects invalid payload", async () => {
    const res = await request(app).post("/encounters/enc-1/status").send({});
    expect(res.status).toBe(400);
  });

  it("POST /encounters/:id/status updates status and triggers learning", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    learningMock.mockResolvedValueOnce(undefined);
    const res = await request(app).post("/encounters/enc-1/status").send({ status: "locked" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(learningMock).toHaveBeenCalledWith("enc-1");
  });

  it("POST /encounters/:id/status ignores learning errors", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    learningMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/encounters/enc-1/status").send({ status: "finalized" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /encounters/:id/superbill returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).get("/encounters/enc-1/superbill");
    expect(res.status).toBe(404);
  });

  it("GET /encounters/:id/superbill returns HTML", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "enc-1",
            patientFirstName: "Ava",
            patientLastName: "Jones",
            practicePhone: "555-1111",
            providerName: "Dr. Smith",
            providerNpi: "123",
            practiceName: "Derm Clinic",
            practiceAddress: "123 Main",
            practiceCity: "City",
            practiceState: "CA",
            practiceZip: "12345",
            practiceNpi: "987",
            practiceTaxId: "11-1111111",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "dx-1", icd10Code: "L40.0" }] })
      .mockResolvedValueOnce({ rows: [{ id: "chg-1", cptCode: "11100", feeCents: 10000, quantity: 1 }] });

    const res = await request(app).get("/encounters/enc-1/superbill");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Superbill - Jones, Ava");
    expect(auditMock).toHaveBeenCalled();
  });
});
