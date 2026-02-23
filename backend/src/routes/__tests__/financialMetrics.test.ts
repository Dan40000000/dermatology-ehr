import request from "supertest";
import express from "express";
import { financialMetricsRouter } from "../financialMetrics";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/financial-metrics", financialMetricsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Financial metrics routes", () => {
  it("GET /financial-metrics/dashboard returns metrics", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] })
      .mockResolvedValueOnce({ rows: [{ total: "500" }] })
      .mockResolvedValueOnce({ rows: [{ total: "200" }] })
      .mockResolvedValueOnce({ rows: [{ total: "100" }] })
      .mockResolvedValueOnce({ rows: [{ total: "200" }] })
      .mockResolvedValueOnce({ rows: [{ total: "300" }] })
      .mockResolvedValueOnce({ rows: [{ total: "400" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] })
      .mockResolvedValueOnce({ rows: [{ total: "50" }] });

    const res = await request(app).get("/financial-metrics/dashboard");

    expect(res.status).toBe(200);
    expect(res.body.metrics).toMatchObject({
      newBillsCount: 2,
      inProgressBillsCount: 3,
      outstandingAmountCents: 1000,
      paymentsThisMonthCents: 700,
      lateFeesThisMonthCents: 50,
      overdueCount: 1,
      collectionRate: 70,
    });
  });

  it("GET /financial-metrics/payments-summary rejects missing params", async () => {
    const res = await request(app).get("/financial-metrics/payments-summary");

    expect(res.status).toBe(400);
  });

  it("GET /financial-metrics/payments-summary returns summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ paymentMethod: "card", count: 1, totalCents: 100 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1, totalCents: 200, appliedCents: 150, unappliedCents: 50 }] });

    const res = await request(app)
      .get("/financial-metrics/payments-summary?startDate=2025-01-01&endDate=2025-01-31");

    expect(res.status).toBe(200);
    expect(res.body.patientPaymentsByMethod).toHaveLength(1);
  });

  it("GET /financial-metrics/bills-summary rejects missing params", async () => {
    const res = await request(app).get("/financial-metrics/bills-summary");

    expect(res.status).toBe(400);
  });

  it("GET /financial-metrics/bills-summary returns summary", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "paid", count: 1 }] });

    const res = await request(app)
      .get("/financial-metrics/bills-summary?startDate=2025-01-01&endDate=2025-01-31");

    expect(res.status).toBe(200);
    expect(res.body.billsByStatus).toHaveLength(1);
  });

  it("GET /financial-metrics/rcm-dashboard returns metrics", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "500" }] })
      .mockResolvedValueOnce({ rows: [{ total: "200" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] })
      .mockResolvedValueOnce({ rows: [{ avg_days: 30 }] })
      .mockResolvedValueOnce({ rows: [{ total: "10" }] })
      .mockResolvedValueOnce({ rows: [{ accepted: "8" }] })
      .mockResolvedValueOnce({ rows: [{ denied: "1" }] })
      .mockResolvedValueOnce({ rows: [{ current: "100", days30_60: "50", days60_90: "25", days90_120: "10", days120_plus: "5" }] })
      .mockResolvedValueOnce({ rows: [{ month: "2025-01-01", collections: "100" }] });

    const res = await request(app).get("/financial-metrics/rcm-dashboard?period=mtd");

    expect(res.status).toBe(200);
    expect(res.body.metrics.totalClinicalCollections).toBe(700);
    expect(res.body.metrics.totalAR).toBe(190);
  });

  it("GET /financial-metrics/revenue-by-payer returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ payer: "Self-Pay", collections: 100 }] });

    const res = await request(app).get("/financial-metrics/revenue-by-payer");

    expect(res.status).toBe(200);
    expect(res.body.revenueByPayer).toHaveLength(1);
  });

  it("GET /financial-metrics/revenue-by-procedure returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ cptCode: "99213", revenue: 1000 }] });

    const res = await request(app).get("/financial-metrics/revenue-by-procedure");

    expect(res.status).toBe(200);
    expect(res.body.revenueByProcedure).toHaveLength(1);
  });

  it("GET /financial-metrics/provider-productivity returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ providerId: "prov-1", totalCharges: 1000 }] });

    const res = await request(app).get("/financial-metrics/provider-productivity");

    expect(res.status).toBe(200);
    expect(res.body.providerProductivity).toHaveLength(1);
  });

  it("GET /financial-metrics/em-distribution returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ cptCode: "99213", count: 2 }] });

    const res = await request(app).get("/financial-metrics/em-distribution");

    expect(res.status).toBe(200);
    expect(res.body.emDistribution).toHaveLength(1);
  });

  it("GET /financial-metrics/claims-aging returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ bucket: "Current", claim_count: 1 }] });

    const res = await request(app).get("/financial-metrics/claims-aging");

    expect(res.status).toBe(200);
    expect(res.body.claimsAging).toHaveLength(1);
  });

  it("GET /financial-metrics/patient-balances returns data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ patientId: "patient-1", balanceCents: 500 }] });

    const res = await request(app).get("/financial-metrics/patient-balances");

    expect(res.status).toBe(200);
    expect(res.body.patientBalances).toHaveLength(1);
  });
});
