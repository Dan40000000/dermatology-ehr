import request from "supertest";
import express from "express";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { clinicalDecisionSupportService } from "../../services/clinicalDecisionSupport";
import { logger } from "../../lib/logger";

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

jest.mock("../../services/clinicalDecisionSupport", () => ({
  clinicalDecisionSupportService: {
    runCDSChecks: jest.fn(),
    getPatientAlerts: jest.fn(),
    dismissAlert: jest.fn(),
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

const cdsRouter = require("../cds").default;

const app = express();
app.use(express.json());
app.use("/cds", cdsRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const cdsMock = clinicalDecisionSupportService as jest.Mocked<typeof clinicalDecisionSupportService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  authUser = { id: "user-1", tenantId: "tenant-1", role: "provider" };
  queryMock.mockReset();
  auditMock.mockReset();
  cdsMock.runCDSChecks.mockReset();
  cdsMock.getPatientAlerts.mockReset();
  cdsMock.dismissAlert.mockReset();
  loggerMock.error.mockReset();
});

describe("CDS routes", () => {
  it("POST /cds/check/:patientId returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/cds/check/p1").send({ encounterId: "e1" });
    expect(res.status).toBe(404);
  });

  it("POST /cds/check/:patientId returns alerts summary", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "p1" }] });
    cdsMock.runCDSChecks.mockResolvedValueOnce([
      { severity: "critical" },
      { severity: "warning" },
      { severity: "info" },
    ] as any);

    const res = await request(app).post("/cds/check/p1").send({ encounterId: "e1" });
    expect(res.status).toBe(200);
    expect(res.body.totalAlerts).toBe(3);
    expect(res.body.criticalAlerts).toBe(1);
    expect(res.body.warningAlerts).toBe(1);
    expect(res.body.infoAlerts).toBe(1);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /cds/check/:patientId returns 500 on error", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "p1" }] });
    cdsMock.runCDSChecks.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/cds/check/p1").send({});
    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("CDS check error:", {
      error: "boom",
    });
  });

  it("POST /cds/check/:patientId masks non-Error failures", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "p1" }] });
    cdsMock.runCDSChecks.mockRejectedValueOnce({ patientId: "p1" });
    const res = await request(app).post("/cds/check/p1").send({});
    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("CDS check error:", {
      error: "Unknown error",
    });
  });

  it("GET /cds/alerts/:patientId returns alerts", async () => {
    cdsMock.getPatientAlerts.mockResolvedValueOnce([{ id: "a1" }] as any);
    const res = await request(app).get("/cds/alerts/p1");
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
  });

  it("GET /cds/alerts/:patientId returns 500 on error", async () => {
    cdsMock.getPatientAlerts.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/cds/alerts/p1");
    expect(res.status).toBe(500);
  });

  it("GET /cds/alerts returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "a1" }, { id: "a2" }] });
    const res = await request(app).get("/cds/alerts?severity=critical&actionRequired=true");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("GET /cds/alerts returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/cds/alerts");
    expect(res.status).toBe(500);
  });

  it("POST /cds/alerts/:alertId/dismiss dismisses alert", async () => {
    cdsMock.dismissAlert.mockResolvedValueOnce(undefined);
    const res = await request(app).post("/cds/alerts/a1/dismiss").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /cds/alerts/:alertId/dismiss returns 500 on error", async () => {
    cdsMock.dismissAlert.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/cds/alerts/a1/dismiss").send({});
    expect(res.status).toBe(500);
  });

  it("GET /cds/stats returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ totalAlerts: "1" }] });
    const res = await request(app).get("/cds/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalAlerts).toBe("1");
  });

  it("GET /cds/stats returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/cds/stats");
    expect(res.status).toBe(500);
  });

  it("POST /cds/batch-check validates patientIds", async () => {
    const res = await request(app).post("/cds/batch-check").send({});
    expect(res.status).toBe(400);
  });

  it("POST /cds/batch-check rejects large batches", async () => {
    const res = await request(app).post("/cds/batch-check").send({ patientIds: Array.from({ length: 101 }, (_, i) => `p${i}`) });
    expect(res.status).toBe(400);
  });

  it("POST /cds/batch-check returns results", async () => {
    cdsMock.runCDSChecks
      .mockResolvedValueOnce([{ severity: "info" }] as any)
      .mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post("/cds/batch-check").send({ patientIds: ["p1", "p2"] });
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBe(2);
    expect(res.body.successCount).toBe(1);
  });
});
