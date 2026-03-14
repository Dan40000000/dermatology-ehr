import request from "supertest";
import express from "express";
import { financialMetricsRouter } from "../financialMetrics";
import { pool } from "../../db/pool";
import { getFinancialSnapshots } from "../../services/financialSnapshotService";

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

jest.mock("../../services/financialSnapshotService", () => ({
  getFinancialSnapshots: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/financial-metrics", financialMetricsRouter);

const queryMock = pool.query as jest.Mock;
const getFinancialSnapshotsMock = getFinancialSnapshots as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  getFinancialSnapshotsMock.mockReset();
  getFinancialSnapshotsMock.mockResolvedValue({
    daily: {
      key: "daily",
      label: "Daily Snapshot",
      rangeLabel: "Today",
      completedAppointments: 0,
      actualRevenueCents: 0,
      benchmarkRevenueCents: 0,
      totalRevenueCents: 0,
      collectionsCents: 0,
      avgRevenuePerVisitCents: 0,
      benchmarkVisitsCount: 0,
      collectionRate: 0,
    },
    weekly: {
      key: "weekly",
      label: "Weekly Snapshot",
      rangeLabel: "Last 7 Days",
      completedAppointments: 0,
      actualRevenueCents: 0,
      benchmarkRevenueCents: 0,
      totalRevenueCents: 0,
      collectionsCents: 0,
      avgRevenuePerVisitCents: 0,
      benchmarkVisitsCount: 0,
      collectionRate: 0,
    },
    monthly: {
      key: "monthly",
      label: "Monthly Snapshot",
      rangeLabel: "Month to Date",
      completedAppointments: 0,
      actualRevenueCents: 0,
      benchmarkRevenueCents: 0,
      totalRevenueCents: 0,
      collectionsCents: 0,
      avgRevenuePerVisitCents: 0,
      benchmarkVisitsCount: 0,
      collectionRate: 0,
    },
    sourceNote: "note",
  });
});

describe("Financial metrics routes", () => {
  it("GET /financial-metrics/dashboard returns metrics", async () => {
    getFinancialSnapshotsMock.mockResolvedValueOnce({
      daily: {
        key: "daily",
        label: "Daily Snapshot",
        rangeLabel: "Today",
        completedAppointments: 3,
        actualRevenueCents: 0,
        benchmarkRevenueCents: 500,
        totalRevenueCents: 500,
        collectionsCents: 1200,
        avgRevenuePerVisitCents: 167,
        benchmarkVisitsCount: 2,
        collectionRate: 25,
      },
      weekly: {
        key: "weekly",
        label: "Weekly Snapshot",
        rangeLabel: "Last 7 Days",
        completedAppointments: 5,
        actualRevenueCents: 0,
        benchmarkRevenueCents: 2000,
        totalRevenueCents: 2000,
        collectionsCents: 2200,
        avgRevenuePerVisitCents: 400,
        benchmarkVisitsCount: 4,
        collectionRate: 110,
      },
      monthly: {
        key: "monthly",
        label: "Monthly Snapshot",
        rangeLabel: "Month to Date",
        completedAppointments: 8,
        actualRevenueCents: 0,
        benchmarkRevenueCents: 4000,
        totalRevenueCents: 4000,
        collectionsCents: 5000,
        avgRevenuePerVisitCents: 500,
        benchmarkVisitsCount: 6,
        collectionRate: 125,
      },
      sourceNote: "note",
    });
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
      paymentsCollectedTodayCents: 1200,
      revenueEarnedTodayCents: 500,
      lateFeesThisMonthCents: 50,
      overdueCount: 1,
      collectionRate: 25,
    });
    expect(res.body.snapshots?.daily?.completedAppointments).toBe(3);
  });

  it("GET /financial-metrics/collections-trend returns trend and summary", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          date: "2026-02-01",
          patient_payments_cents: "1000",
          payer_payments_cents: "2000",
          payments_collected_cents: "3000",
          revenue_earned_cents: "5000",
          payment_count: "2",
          bill_count: "1",
        },
        {
          date: "2026-02-02",
          patient_payments_cents: "1500",
          payer_payments_cents: "2500",
          payments_collected_cents: "4000",
          revenue_earned_cents: "6000",
          payment_count: "3",
          bill_count: "2",
        },
      ],
    });

    const res = await request(app).get(
      "/financial-metrics/collections-trend?startDate=2026-02-01&endDate=2026-02-02&granularity=day",
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.summary).toMatchObject({
      totalPaymentsCollectedCents: 7000,
      totalRevenueEarnedCents: 11000,
      totalPatientPaymentsCents: 2500,
      totalPayerPaymentsCents: 4500,
      totalPaymentCount: 5,
      totalBillCount: 3,
      dayCount: 2,
      collectionRate: 64,
    });
  });

  it("GET /financial-metrics/collections-trend rejects invalid date range", async () => {
    const res = await request(app).get(
      "/financial-metrics/collections-trend?startDate=2026-02-10&endDate=2026-02-01",
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("startDate");
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

  it("GET /financial-metrics/ar-aging rejects invalid asOfDate", async () => {
    const res = await request(app).get("/financial-metrics/ar-aging?asOfDate=02-15-2026");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("asOfDate");
  });

  it("GET /financial-metrics/ar-aging returns overall and split buckets", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          bucketKey: "0_30",
          billCount: 1,
          totalBalanceCents: 1000,
          patientBalanceCents: 400,
          insuranceBalanceCents: 600,
        },
        {
          bucketKey: "31_60",
          billCount: 2,
          totalBalanceCents: 500,
          patientBalanceCents: 100,
          insuranceBalanceCents: 400,
        },
        {
          bucketKey: "91_120",
          billCount: 1,
          totalBalanceCents: 250,
          patientBalanceCents: 50,
          insuranceBalanceCents: 200,
        },
        {
          bucketKey: "120_plus",
          billCount: 1,
          totalBalanceCents: 250,
          patientBalanceCents: 0,
          insuranceBalanceCents: 250,
        },
      ],
    });

    const res = await request(app).get("/financial-metrics/ar-aging?asOfDate=2026-02-15");

    expect(res.status).toBe(200);
    expect(res.body.asOfDate).toBe("2026-02-15");
    expect(res.body.totals).toMatchObject({
      totalBalanceCents: 2000,
      patientBalanceCents: 550,
      insuranceBalanceCents: 1450,
      over90BalanceCents: 500,
      patientSharePercent: 27.5,
      insuranceSharePercent: 72.5,
      over90Percent: 25,
    });
    expect(res.body.buckets).toHaveLength(5);
    expect(res.body.buckets.find((bucket: any) => bucket.key === "61_90")).toMatchObject({
      totalBalanceCents: 0,
      billCount: 0,
    });
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
