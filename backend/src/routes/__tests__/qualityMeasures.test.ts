import request from "supertest";
import express from "express";
import { qualityMeasuresRouter } from "../qualityMeasures";
import { pool } from "../../db/pool";
import { qualityMeasuresService } from "../../services/qualityMeasuresService";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/qualityMeasuresService", () => ({
  qualityMeasuresService: {
    getDermatologyMeasures: jest.fn(),
    calculateMeasureRate: jest.fn(),
    getMIPSDashboard: jest.fn(),
    generateQRDAReport: jest.fn(),
    generateQuarterlyReport: jest.fn(),
    getPatientCareGaps: jest.fn(),
  },
  DERM_MEASURES: {},
  PI_MEASURES: {},
}));

const app = express();
app.use(express.json());
app.use("/quality", qualityMeasuresRouter);

const queryMock = pool.query as jest.Mock;
const serviceMock = qualityMeasuresService as jest.Mocked<typeof qualityMeasuresService>;
const auditLogMock = auditLog as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  serviceMock.getDermatologyMeasures.mockReset();
  serviceMock.calculateMeasureRate.mockReset();
  serviceMock.getMIPSDashboard.mockReset();
  serviceMock.generateQRDAReport.mockReset();
  serviceMock.generateQuarterlyReport.mockReset();
  serviceMock.getPatientCareGaps.mockReset();
  auditLogMock.mockReset();
});

describe("Quality measures routes", () => {
  it("GET /quality/measures returns filtered measures payload", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "measure-1" }] });

    const res = await request(app).get("/quality/measures?category=prevention&active=true");

    expect(res.status).toBe(200);
    expect(res.body.measures).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  it("GET /quality/performance returns cached performance payload", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ measure_code: "measure-1", performance_rate: "88.50" }],
    });

    const res = await request(app).get("/quality/performance?year=2024&quarter=1");

    expect(res.status).toBe(200);
    expect(res.body.performance).toHaveLength(1);
    expect(res.body.performance[0].measure_code).toBe("measure-1");
  });

  it("GET /quality/performance calculates when cache is missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ measure_id: "Q1", id: "db-1" }, { measure_id: "Q2", id: "db-2" }],
      });

    serviceMock.calculateMeasureRate
      .mockResolvedValueOnce({
        numeratorCount: 1,
        denominatorCount: 2,
        exclusionCount: 0,
        performanceRate: "50.00",
      } as any)
      .mockResolvedValueOnce({
        numeratorCount: 0,
        denominatorCount: 0,
        exclusionCount: 0,
        performanceRate: "0.00",
      } as any);

    const res = await request(app).get(
      "/quality/performance?startDate=2025-01-01&endDate=2025-12-31"
    );

    expect(res.status).toBe(200);
    expect(res.body.calculated).toBe(true);
    expect(res.body.performance).toHaveLength(2);
    expect(res.body.performance[0].performanceRate).toBe("50.00");
  });

  it("POST /quality/submit rejects invalid payload", async () => {
    const res = await request(app).post("/quality/submit").send({ year: 1900 });

    expect(res.status).toBe(400);
  });

  it("POST /quality/submit creates submission payload", async () => {
    serviceMock.getMIPSDashboard.mockResolvedValueOnce({
      qualityScore: 82,
      piScore: 74,
      iaScore: 90,
      costScore: 60,
      estimatedFinalScore: 78,
      paymentAdjustment: 0.5,
      measures: [],
      recommendations: [],
      careGaps: [],
    } as any);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/quality/submit").send({ year: 2024 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.submissionId).toBeTruthy();
    expect(res.body.confirmationNumber).toContain("MIPS-2024");
  });

  it("GET /quality/reports/quarterly returns service report", async () => {
    serviceMock.generateQuarterlyReport.mockResolvedValueOnce({ reportId: "report-1" } as any);

    const res = await request(app).get("/quality/reports/quarterly?year=2024&quarter=2");

    expect(res.status).toBe(200);
    expect(res.body.reportId).toBe("report-1");
  });

  it("GET /quality/gaps returns open gaps by default", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "gap-1" }] });

    const res = await request(app).get("/quality/gaps?priority=high");

    expect(res.status).toBe(200);
    expect(res.body.gaps).toHaveLength(1);
    expect(res.body.gaps[0].id).toBe("gap-1");
  });

  it("POST /quality/gaps/:id/close returns 404 when gap missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post("/quality/gaps/gap-1/close")
      .send({ interventionNotes: "done" });

    expect(res.status).toBe(404);
  });

  it("POST /quality/gaps/:id/close closes gap", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "gap-1", status: "closed" }], rowCount: 1 });

    const res = await request(app)
      .post("/quality/gaps/gap-1/close")
      .send({ interventionNotes: "done" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.gap.status).toBe("closed");
  });

  it("POST /quality/recalculate requires date range", async () => {
    const res = await request(app).post("/quality/recalculate").send({ startDate: "2025-01-01" });

    expect(res.status).toBe(400);
  });

  it("POST /quality/recalculate recalculates active measures", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "measure-db-1", measure_id: "Q1" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    serviceMock.calculateMeasureRate.mockResolvedValueOnce({
      numeratorCount: 1,
      denominatorCount: 2,
      exclusionCount: 0,
      performanceRate: "50.00",
    } as any);

    const res = await request(app).post("/quality/recalculate").send({
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    expect(res.status).toBe(200);
    expect(res.body.recalculated).toBe(1);
    expect(res.body.results[0].performanceRate).toBe("50.00");
  });
});
