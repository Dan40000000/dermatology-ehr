import request from "supertest";
import express from "express";
import { billingRouter } from "../billing";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { billingService } from "../../services/billingService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "billing" };
    return next();
  },
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

jest.mock("../../services/billingService", () => ({
  billingService: {
    getClaimDetails: jest.fn(),
    submitClaim: jest.fn(),
    updateClaimStatus: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/billing", billingRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const billingMock = billingService as jest.Mocked<typeof billingService>;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  billingMock.getClaimDetails.mockReset();
  billingMock.submitClaim.mockReset();
  billingMock.updateClaimStatus.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Billing routes", () => {
  it("GET /billing/claims returns list with filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "claim-1" }, { id: "claim-2" }] });

    const res = await request(app).get(
      "/billing/claims?status=submitted&patientId=patient-1&limit=5"
    );

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      "tenant-1",
      "submitted",
      "patient-1",
      5,
    ]);
  });

  it("GET /billing/claims returns 500 on db error", async () => {
    queryMock.mockRejectedValueOnce(new Error("db"));

    const res = await request(app).get("/billing/claims");

    expect(res.status).toBe(500);
  });

  it("GET /billing/claims/:id returns 404 when missing", async () => {
    billingMock.getClaimDetails.mockResolvedValueOnce(null);

    const res = await request(app).get("/billing/claims/claim-1");

    expect(res.status).toBe(404);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("GET /billing/claims/:id returns claim details", async () => {
    billingMock.getClaimDetails.mockResolvedValueOnce({ id: "claim-1" });

    const res = await request(app).get("/billing/claims/claim-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("claim-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "claim_viewed",
      "claim",
      "claim-1"
    );
  });

  it("POST /billing/claims/:id/submit submits claim", async () => {
    billingMock.submitClaim.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/billing/claims/claim-1/submit");

    expect(res.status).toBe(200);
    expect(res.body.claimId).toBe("claim-1");
  });

  it("POST /billing/claims/:id/submit handles errors", async () => {
    billingMock.submitClaim.mockRejectedValueOnce(new Error("nope"));

    const res = await request(app).post("/billing/claims/claim-1/submit");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("nope");
  });

  it("POST /billing/claims/:id/status rejects invalid payload", async () => {
    const res = await request(app).post("/billing/claims/claim-1/status").send({});

    expect(res.status).toBe(400);
  });

  it("POST /billing/claims/:id/status updates status", async () => {
    billingMock.updateClaimStatus.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/billing/claims/claim-1/status")
      .send({ status: "denied" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("denied");
  });

  it("POST /billing/claims/:id/status handles errors", async () => {
    billingMock.updateClaimStatus.mockRejectedValueOnce(new Error("bad"));

    const res = await request(app)
      .post("/billing/claims/claim-1/status")
      .send({ status: "denied" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("bad");
  });

  it("GET /billing/charges returns list and totals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: "charge-1", feeCents: 100, quantity: 2 },
        { id: "charge-2", feeCents: 50, quantity: 1 },
      ],
    });

    const res = await request(app).get(
      "/billing/charges?status=pending&encounterId=enc-1&limit=10"
    );

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.totalCents).toBe(250);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      "tenant-1",
      "pending",
      "enc-1",
      10,
    ]);
  });

  it("GET /billing/charges returns 500 on db error", async () => {
    queryMock.mockRejectedValueOnce(new Error("db"));

    const res = await request(app).get("/billing/charges");

    expect(res.status).toBe(500);
  });

  it("GET /billing/dashboard returns stats", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total_claims: "1" }] })
      .mockResolvedValueOnce({ rows: [{ unbilled_count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ month: "2025-01-01", revenue_cents: "1000" }] });

    const res = await request(app).get("/billing/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.claimStats.total_claims).toBe("1");
    expect(res.body.monthlyRevenue).toHaveLength(1);
  });
});
