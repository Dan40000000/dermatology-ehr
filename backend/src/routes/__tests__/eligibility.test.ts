import request from "supertest";
import express from "express";
import { eligibilityRouter } from "../eligibility";
import { pool } from "../../db/pool";
import { createAuditLog } from "../../services/audit";
import {
  verifyPatientEligibility,
  batchVerifyEligibility,
  getVerificationHistory,
  getLatestVerificationByPatients,
  getPatientsWithIssues,
  getPatientsNeedingVerification,
  getTomorrowsPatients,
} from "../../services/eligibilityService";

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

jest.mock("../../services/eligibilityService", () => ({
  verifyPatientEligibility: jest.fn(),
  batchVerifyEligibility: jest.fn(),
  getVerificationHistory: jest.fn(),
  getLatestVerificationByPatients: jest.fn(),
  getPatientsWithIssues: jest.fn(),
  getPatientsNeedingVerification: jest.fn(),
  getTomorrowsPatients: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/eligibility", eligibilityRouter);

const queryMock = pool.query as jest.Mock;
const verifyMock = verifyPatientEligibility as jest.Mock;
const batchMock = batchVerifyEligibility as jest.Mock;
const historyMock = getVerificationHistory as jest.Mock;
const batchHistoryMock = getLatestVerificationByPatients as jest.Mock;
const issuesMock = getPatientsWithIssues as jest.Mock;
const pendingMock = getPatientsNeedingVerification as jest.Mock;
const tomorrowsMock = getTomorrowsPatients as jest.Mock;

const authHeaders = {
  Authorization: "Bearer test-token",
  "x-tenant-id": "tenant-1",
};
const authPost = (path: string) => request(app).post(path).set(authHeaders);
const authGet = (path: string) => request(app).get(path).set(authHeaders);
const authPatch = (path: string) => request(app).patch(path).set(authHeaders);

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Eligibility Routes", () => {
  describe("POST /eligibility/verify/:patientId", () => {
    it("verifies a patient", async () => {
      verifyMock.mockResolvedValueOnce({
        id: "ver-1",
        verificationStatus: "active",
        hasIssues: false,
      });

      const res = await authPost("/eligibility/verify/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.verification.id).toBe("ver-1");
      expect(createAuditLog).toHaveBeenCalled();
    });

    it("returns 500 on service error", async () => {
      verifyMock.mockRejectedValueOnce(new Error("boom"));

      const res = await authPost("/eligibility/verify/patient-1");

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe("POST /eligibility/batch", () => {
    it("rejects invalid payload", async () => {
      const res = await authPost("/eligibility/batch").send({});
      expect(res.status).toBe(400);
    });

    it("runs batch verification", async () => {
      batchMock.mockResolvedValueOnce({
        batchRunId: "batch-1",
        totalPatients: 2,
        verifiedCount: 2,
        activeCount: 2,
        issueCount: 0,
        results: [],
      });

      const res = await authPost("/eligibility/batch").send({ patientIds: ["p1", "p2"] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.batch.batchRunId).toBe("batch-1");
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe("POST /eligibility/batch/tomorrow", () => {
    it("returns empty batch when no appointments", async () => {
      tomorrowsMock.mockResolvedValueOnce([]);

      const res = await authPost("/eligibility/batch/tomorrow");

      expect(res.status).toBe(200);
      expect(res.body.batch.totalPatients).toBe(0);
    });

    it("verifies tomorrow's patients", async () => {
      tomorrowsMock.mockResolvedValueOnce(["patient-1"]);
      batchMock.mockResolvedValueOnce({
        batchRunId: "batch-2",
        totalPatients: 1,
        verifiedCount: 1,
        activeCount: 1,
        issueCount: 0,
        results: [],
      });

      const res = await authPost("/eligibility/batch/tomorrow");

      expect(res.status).toBe(200);
      expect(res.body.batch.batchRunId).toBe("batch-2");
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe("GET /eligibility/history/:patientId", () => {
    it("returns verification history", async () => {
      historyMock.mockResolvedValueOnce([{ id: "hist-1" }]);

      const res = await authGet("/eligibility/history/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(1);
    });
  });

  describe("POST /eligibility/history/batch", () => {
    it("rejects invalid payload", async () => {
      const res = await authPost("/eligibility/history/batch").send({});
      expect(res.status).toBe(400);
    });

    it("returns latest verification history by patient", async () => {
      batchHistoryMock.mockResolvedValueOnce({
        "patient-1": { id: "hist-1" },
        "patient-2": null,
      });

      const res = await authPost("/eligibility/history/batch").send({ patientIds: ["patient-1", "patient-2"] });

      expect(res.status).toBe(200);
      expect(res.body.history["patient-1"].id).toBe("hist-1");
      expect(res.body.history["patient-2"]).toBeNull();
    });
  });

  describe("GET /eligibility/issues", () => {
    it("returns patients with issues", async () => {
      issuesMock.mockResolvedValueOnce([{ id: "patient-1" }]);

      const res = await authGet("/eligibility/issues");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe("GET /eligibility/pending", () => {
    it("returns patients needing verification", async () => {
      pendingMock.mockResolvedValueOnce([{ id: "patient-1" }]);

      const res = await authGet("/eligibility/pending?daysThreshold=10");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe("PATCH /eligibility/resolve/:verificationId", () => {
    it("returns 404 when verification not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await authPatch("/eligibility/resolve/ver-1").send({ resolutionNotes: "ok" });

      expect(res.status).toBe(404);
    });

    it("marks issue resolved", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "ver-1", patient_id: "patient-1" }] });

      const res = await authPatch("/eligibility/resolve/ver-1").send({ resolutionNotes: "ok" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe("GET /eligibility/auto-verify/stats", () => {
    it("returns stats payload", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ value: "true" }] })
        .mockResolvedValueOnce({ rows: [{ last_run: "2025-01-01" }] })
        .mockResolvedValueOnce({ rows: [{ count: "2" }] })
        .mockResolvedValueOnce({ rows: [{ count: "3" }] });

      const res = await authGet("/eligibility/auto-verify/stats");

      expect(res.status).toBe(200);
      expect(res.body.stats.todayCount).toBe(2);
      expect(res.body.stats.tomorrowScheduled).toBe(3);
    });
  });

  describe("POST /eligibility/auto-verify/toggle", () => {
    it("toggles auto-verify setting", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ last_run: "2025-01-02", today_count: "1", tomorrow_scheduled: "4" }],
        });

      const res = await authPost("/eligibility/auto-verify/toggle").send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.stats.enabled).toBe(false);
      expect(createAuditLog).toHaveBeenCalled();
    });
  });

  describe("GET /eligibility/benefits/:patientId", () => {
    it("returns 404 when no verification found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await authGet("/eligibility/benefits/patient-1");

      expect(res.status).toBe(404);
    });

    it("returns benefits details", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            patient_id: "patient-1",
            payer_name: "Aetna",
            plan_name: "Gold",
            copay_amount: 20,
            deductible_total: 500,
            deductible_met: 200,
            deductible_remaining: 300,
            oop_max: 2000,
            oop_met: 500,
            oop_remaining: 1500,
            coinsurance_percent: 20,
            effective_date: "2024-01-01",
            termination_date: null,
            verification_status: "active",
          },
        ],
      });

      const res = await authGet("/eligibility/benefits/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.benefits.payerName).toBe("Aetna");
      expect(res.body.benefits.patientId).toBe("patient-1");
    });
  });

  describe("GET /eligibility/prior-auth/:cptCode", () => {
    it("returns default requirement for known codes", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await authGet("/eligibility/prior-auth/17311");

      expect(res.status).toBe(200);
      expect(res.body.requirement.requiresAuth).toBe(true);
      expect(res.body.requirement.cptCode).toBe("17311");
    });
  });
});
