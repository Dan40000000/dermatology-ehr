import request from "supertest";
import express from "express";
import auditReportsRouter from "../auditReports";
import * as auditReportService from "../../services/auditReportService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/auditReportService", () => ({
  generateAccessReport: jest.fn(),
  generateChangeReport: jest.fn(),
  detectSuspiciousActivity: jest.fn(),
  getPatientAccessHistory: jest.fn(),
  getUserActivitySummary: jest.fn(),
  createReportTemplate: jest.fn(),
  getReportTemplates: jest.fn(),
  getReportTemplate: jest.fn(),
  scheduleReport: jest.fn(),
  generateReport: jest.fn(),
  getReportRun: jest.fn(),
  getReportRuns: jest.fn(),
  getSuspiciousActivities: jest.fn(),
  reviewSuspiciousActivity: jest.fn(),
  logSuspiciousActivity: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/audit-reports", auditReportsRouter);

const generateAccessReportMock = auditReportService.generateAccessReport as jest.Mock;
const generateChangeReportMock = auditReportService.generateChangeReport as jest.Mock;
const reviewSuspiciousActivityMock = auditReportService.reviewSuspiciousActivity as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Audit reports routes", () => {
  it("GET /audit-reports/access requires startDate and endDate", async () => {
    const res = await request(app).get("/audit-reports/access");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("startDate and endDate are required");
  });

  it("GET /audit-reports/access returns report rows", async () => {
    generateAccessReportMock.mockResolvedValueOnce({ rows: [{ id: "a1" }], total: 1 });

    const res = await request(app).get(
      "/audit-reports/access?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z"
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(generateAccessReportMock).toHaveBeenCalled();
  });

  it("GET /audit-reports/access returns 500 on service error", async () => {
    generateAccessReportMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(app).get(
      "/audit-reports/access?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z"
    );

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch access logs");
  });

  it("GET /audit-reports/changes returns 500 on service error", async () => {
    generateChangeReportMock.mockRejectedValueOnce(new Error("DB error"));

    const res = await request(app).get(
      "/audit-reports/changes?startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z"
    );

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch change logs");
  });

  it("POST /audit-reports/suspicious/:activityId/review validates actionTaken", async () => {
    const res = await request(app).post("/audit-reports/suspicious/activity-1/review").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("actionTaken is required");
  });

  it("POST /audit-reports/suspicious/:activityId/review returns 404 when not found", async () => {
    reviewSuspiciousActivityMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/audit-reports/suspicious/activity-1/review")
      .send({ actionTaken: "dismissed" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Suspicious activity not found");
  });
});
