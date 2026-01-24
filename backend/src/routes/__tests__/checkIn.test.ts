import request from "supertest";
import express from "express";
import { checkInRouter } from "../checkIn";
import { pool } from "../../db/pool";
import {
  getPatientEligibilityForCheckIn,
  refreshEligibilityAtCheckIn,
  completeCheckIn,
  getCheckInStatus,
  calculateEstimatedResponsibility,
} from "../../services/checkInService";
import { createAuditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "front_desk" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/checkInService", () => ({
  getPatientEligibilityForCheckIn: jest.fn(),
  refreshEligibilityAtCheckIn: jest.fn(),
  completeCheckIn: jest.fn(),
  getCheckInStatus: jest.fn(),
  calculateEstimatedResponsibility: jest.fn(),
}));

jest.mock("../../services/audit", () => ({
  createAuditLog: jest.fn(),
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
app.use("/check-in", checkInRouter);

const queryMock = pool.query as jest.Mock;
const eligibilityMock = getPatientEligibilityForCheckIn as jest.Mock;
const refreshMock = refreshEligibilityAtCheckIn as jest.Mock;
const completeMock = completeCheckIn as jest.Mock;
const statusMock = getCheckInStatus as jest.Mock;
const estimateMock = calculateEstimatedResponsibility as jest.Mock;
const auditMock = createAuditLog as jest.Mock;
const patientId = "11111111-1111-1111-8111-111111111111";

beforeEach(() => {
  queryMock.mockReset();
  eligibilityMock.mockReset();
  refreshMock.mockReset();
  completeMock.mockReset();
  statusMock.mockReset();
  estimateMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Check-in routes", () => {
  it("POST /check-in/eligibility returns eligibility", async () => {
    eligibilityMock.mockResolvedValueOnce({ status: "active" });

    const res = await request(app)
      .post(`/check-in/eligibility/${patientId}?appointmentId=apt-1`)
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(eligibilityMock).toHaveBeenCalledWith(patientId, "tenant-1", "apt-1");
  });

  it("POST /check-in/eligibility handles errors", async () => {
    eligibilityMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post(`/check-in/eligibility/${patientId}`)
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(500);
  });

  it("POST /check-in/refresh-eligibility returns verification", async () => {
    refreshMock.mockResolvedValueOnce({ id: "ver-1", verificationStatus: "active" });

    const res = await request(app)
      .post(`/check-in/refresh-eligibility/${patientId}?appointmentId=apt-1`)
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(res.body.verification.id).toBe("ver-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /check-in/refresh-eligibility handles errors", async () => {
    refreshMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post(`/check-in/refresh-eligibility/${patientId}`)
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(500);
  });

  it("POST /check-in/complete rejects invalid payload", async () => {
    const res = await request(app)
      .post("/check-in/complete")
      .set("x-tenant-id", "tenant-1")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /check-in/complete completes check-in", async () => {
    eligibilityMock.mockResolvedValueOnce({ eligibilityStatus: "active" });
    completeMock.mockResolvedValueOnce({
      checkInId: "check-1",
      eligibilityRefreshed: true,
      copayCollected: true,
      insuranceUpdated: false,
    });

    const res = await request(app)
      .post("/check-in/complete")
      .set("x-tenant-id", "tenant-1")
      .send({ patientId });

    expect(res.status).toBe(200);
    expect(res.body.result.checkInId).toBe("check-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /check-in/complete handles errors", async () => {
    eligibilityMock.mockResolvedValueOnce({ eligibilityStatus: "active" });
    completeMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/check-in/complete")
      .set("x-tenant-id", "tenant-1")
      .send({ patientId });

    expect(res.status).toBe(500);
  });

  it("GET /check-in/status returns status and checkedIn true", async () => {
    statusMock.mockResolvedValueOnce({ id: "status-1" });

    const res = await request(app)
      .get("/check-in/status/apt-1")
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(res.body.checkedIn).toBe(true);
  });

  it("GET /check-in/status returns checkedIn false when missing", async () => {
    statusMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/check-in/status/apt-1")
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(res.body.checkedIn).toBe(false);
  });

  it("GET /check-in/today returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "check-1" }] });

    const res = await request(app)
      .get("/check-in/today")
      .set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it("POST /check-in/estimate-responsibility returns 404 when missing patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/check-in/estimate-responsibility")
      .set("x-tenant-id", "tenant-1")
      .send({ patientId, estimatedServiceCostCents: 1000 });

    expect(res.status).toBe(404);
  });

  it("POST /check-in/estimate-responsibility returns estimate", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ copay_amount_cents: 200, deductible_remaining_cents: 0, coinsurance_percent: 0 }] });
    estimateMock.mockReturnValueOnce({ patientOwesCents: 200 });

    const res = await request(app)
      .post("/check-in/estimate-responsibility")
      .set("x-tenant-id", "tenant-1")
      .send({ patientId, estimatedServiceCostCents: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.estimate.patientOwesCents).toBe(200);
  });

  it("POST /check-in/estimate-responsibility handles errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/check-in/estimate-responsibility")
      .set("x-tenant-id", "tenant-1")
      .send({ patientId, estimatedServiceCostCents: 1000 });

    expect(res.status).toBe(500);
  });
});
