import request from "supertest";
import express from "express";
import { eligibilityRouter } from "../eligibility";
import {
  getLatestVerificationByPatients,
  getVerificationHistory,
  verifyPatientEligibility,
} from "../../services/eligibilityService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = String(req.headers["x-test-role"] || "ma");
    req.user = { id: "user-1", tenantId: "tenant-1", role };
    return next();
  },
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
app.use("/api/eligibility", eligibilityRouter);

const historyMock = getVerificationHistory as jest.Mock;
const batchHistoryMock = getLatestVerificationByPatients as jest.Mock;
const verifyMock = verifyPatientEligibility as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  historyMock.mockResolvedValue([]);
  batchHistoryMock.mockResolvedValue({});
  verifyMock.mockResolvedValue({ id: "verification-1", verificationStatus: "active", hasIssues: false });
});

describe("Eligibility route authz", () => {
  it("allows MA users to read eligibility history used by clinical worklists", async () => {
    const res = await request(app)
      .get("/api/eligibility/history/patient-1")
      .set("x-test-role", "ma")
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(historyMock).toHaveBeenCalledWith("patient-1", "tenant-1");
  });

  it("allows MA users to read batch eligibility history used by Labs", async () => {
    const res = await request(app)
      .post("/api/eligibility/history/batch")
      .set("x-test-role", "ma")
      .set("x-tenant-id", "tenant-1")
      .send({ patientIds: ["patient-1", "patient-2"] });

    expect(res.status).toBe(200);
    expect(batchHistoryMock).toHaveBeenCalledWith(["patient-1", "patient-2"], "tenant-1");
  });

  it("still blocks MA users from initiating a live eligibility verification", async () => {
    const res = await request(app)
      .post("/api/eligibility/verify/patient-1")
      .set("x-test-role", "ma")
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(403);
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
