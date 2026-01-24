import request from "supertest";
import express from "express";
import { diseaseRegistryRouter } from "../diseaseRegistry";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/moduleAccess", () => ({
  requireModuleAccess: () => (_req: any, _res: any, next: any) => next(),
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
app.use("/disease-registry", diseaseRegistryRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Disease registry routes", () => {
  it("GET /disease-registry/dashboard returns metrics", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ registry_type: "melanoma", name: "Melanoma", patient_count: "3" }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ melanoma_staging_rate: 50 }] });

    const res = await request(app).get("/disease-registry/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.registryCounts).toHaveLength(1);
    expect(res.body.alerts.melanomaDue).toBe(2);
    expect(res.body.alerts.labsOverdue).toBe(5);
    expect(res.body.alerts.pregnancyTestsDue).toBe(1);
    expect(res.body.qualityMetrics.melanoma_staging_rate).toBe(50);
  });

  it("GET /disease-registry/dashboard returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/disease-registry/dashboard");

    expect(res.status).toBe(500);
  });

  it("GET /disease-registry/melanoma returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "mel-1" }] });

    const res = await request(app).get("/disease-registry/melanoma");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /disease-registry/melanoma validates payload", async () => {
    const res = await request(app).post("/disease-registry/melanoma").send({});

    expect(res.status).toBe(400);
  });

  it("POST /disease-registry/melanoma updates existing entry", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "mel-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/disease-registry/melanoma")
      .send({ patientId: "patient-1", ajccStage: "II", notes: "ok" });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
  });

  it("POST /disease-registry/melanoma creates entry", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/disease-registry/melanoma")
      .send({ patientId: "patient-1", diagnosisDate: "2024-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /disease-registry/psoriasis returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "psor-1" }] });

    const res = await request(app).get("/disease-registry/psoriasis");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /disease-registry/psoriasis updates existing entry and history", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "psor-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/disease-registry/psoriasis")
      .send({ patientId: "patient-1", currentPasiScore: 8, currentBsaPercent: 2 });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
  });

  it("POST /disease-registry/psoriasis creates entry", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/disease-registry/psoriasis")
      .send({ patientId: "patient-1", diagnosisDate: "2024-02-01" });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /disease-registry/acne supports isotretinoin filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "acne-1" }] });

    const res = await request(app).get("/disease-registry/acne?onIsotretinoin=true");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("on_isotretinoin = true"),
      ["tenant-1"]
    );
  });

  it("GET /disease-registry/chronic-therapy returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "ct-1" }] });

    const res = await request(app).get("/disease-registry/chronic-therapy");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("POST /disease-registry/chronic-therapy validates payload", async () => {
    const res = await request(app).post("/disease-registry/chronic-therapy").send({});

    expect(res.status).toBe(400);
  });

  it("POST /disease-registry/chronic-therapy creates entry", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/disease-registry/chronic-therapy")
      .send({
        patientId: "patient-1",
        primaryDiagnosis: "Dx",
        medicationName: "Med",
        medicationClass: "Class",
        startDate: "2024-01-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /disease-registry/pasi-history/:patientId returns history", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "hist-1" }] });

    const res = await request(app).get("/disease-registry/pasi-history/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /disease-registry/alerts returns merged alerts", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "mel-alert" }] })
      .mockResolvedValueOnce({ rows: [{ id: "lab-alert" }] })
      .mockResolvedValueOnce({ rows: [{ id: "preg-alert" }] });

    const res = await request(app).get("/disease-registry/alerts");

    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(3);
  });
});
