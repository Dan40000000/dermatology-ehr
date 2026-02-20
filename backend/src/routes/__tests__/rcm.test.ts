import request from "supertest";
import express from "express";
import { rcmRouter } from "../rcm";
import { RCMAnalyticsService } from "../../services/rcmAnalytics";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../services/rcmAnalytics", () => ({
  RCMAnalyticsService: {
    calculateKPIs: jest.fn(),
    getARAgingData: jest.fn(),
    getDenialAnalysis: jest.fn(),
    getBenchmarks: jest.fn(),
    generateAlerts: jest.fn(),
    getCollectionsTrend: jest.fn(),
    getPayerPerformance: jest.fn(),
    getProviderProductivity: jest.fn(),
    getActionItems: jest.fn(),
    getFinancialEvents: jest.fn(),
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

const app = express();
app.use(express.json());
app.use("/rcm", rcmRouter);

const rcmMock = RCMAnalyticsService as jest.Mocked<typeof RCMAnalyticsService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  rcmMock.calculateKPIs.mockReset();
  rcmMock.getARAgingData.mockReset();
  rcmMock.getDenialAnalysis.mockReset();
  rcmMock.getBenchmarks.mockReset();
  rcmMock.generateAlerts.mockReset();
  rcmMock.getCollectionsTrend.mockReset();
  rcmMock.getPayerPerformance.mockReset();
  rcmMock.getProviderProductivity.mockReset();
  rcmMock.getActionItems.mockReset();
  rcmMock.getFinancialEvents.mockReset();
  loggerMock.error.mockReset();
});

describe("RCM routes", () => {
  it("GET /rcm/dashboard returns dashboard data", async () => {
    rcmMock.calculateKPIs.mockResolvedValueOnce({
      current: { arDays: 30 },
      previous: { arDays: 35 },
    } as any);
    rcmMock.getARAgingData.mockResolvedValueOnce({ buckets: [] } as any);
    rcmMock.getDenialAnalysis.mockResolvedValueOnce({ reasons: [] } as any);
    rcmMock.getBenchmarks.mockResolvedValueOnce({ target: 25 } as any);
    rcmMock.generateAlerts.mockReturnValueOnce(["Alert"]);

    const res = await request(app).get("/rcm/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.kpis.arDays).toBe(30);
    expect(res.body.alerts).toHaveLength(1);
  });

  it("GET /rcm/dashboard logs sanitized Error failures", async () => {
    rcmMock.calculateKPIs.mockRejectedValueOnce(new Error("dashboard failed"));

    const res = await request(app).get("/rcm/dashboard");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch RCM dashboard data");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching RCM dashboard:", {
      error: "dashboard failed",
    });
  });

  it("GET /rcm/dashboard masks non-Error failures", async () => {
    rcmMock.calculateKPIs.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/rcm/dashboard");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch RCM dashboard data");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching RCM dashboard:", {
      error: "Unknown error",
    });
  });

  it("GET /rcm/kpis requires date ranges", async () => {
    const res = await request(app).get("/rcm/kpis");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/kpis returns KPI data", async () => {
    rcmMock.calculateKPIs.mockResolvedValueOnce({
      current: { arDays: 20 },
      previous: { arDays: 25 },
    } as any);
    rcmMock.getBenchmarks.mockResolvedValueOnce({ target: 22 } as any);

    const res = await request(app).get(
      "/rcm/kpis?startDate=2025-01-01&endDate=2025-01-31&compareStartDate=2024-01-01&compareEndDate=2024-01-31"
    );
    expect(res.status).toBe(200);
    expect(res.body.current.arDays).toBe(20);
  });

  it("GET /rcm/aging returns aging data", async () => {
    rcmMock.getARAgingData.mockResolvedValueOnce({ buckets: [] } as any);
    const res = await request(app).get("/rcm/aging");
    expect(res.status).toBe(200);
    expect(res.body.aging).toBeTruthy();
  });

  it("GET /rcm/collections requires dates", async () => {
    const res = await request(app).get("/rcm/collections");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/collections returns trend", async () => {
    rcmMock.getCollectionsTrend.mockResolvedValueOnce([{ date: "2025-01-01", total: 100 } as any]);
    const res = await request(app).get("/rcm/collections?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.trend).toHaveLength(1);
  });

  it("GET /rcm/denials requires dates", async () => {
    const res = await request(app).get("/rcm/denials");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/denials returns analysis", async () => {
    rcmMock.getDenialAnalysis.mockResolvedValueOnce({ reasons: [] } as any);
    const res = await request(app).get("/rcm/denials?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.reasons).toBeDefined();
  });

  it("GET /rcm/payer-mix requires dates", async () => {
    const res = await request(app).get("/rcm/payer-mix");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/payer-mix returns payers", async () => {
    rcmMock.getPayerPerformance.mockResolvedValueOnce([{ payer: "A" } as any]);
    const res = await request(app).get("/rcm/payer-mix?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.payers).toHaveLength(1);
  });

  it("GET /rcm/provider-stats requires dates", async () => {
    const res = await request(app).get("/rcm/provider-stats");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/provider-stats returns providers", async () => {
    rcmMock.getProviderProductivity.mockResolvedValueOnce([{ providerId: "p1" } as any]);
    const res = await request(app).get("/rcm/provider-stats?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.providers).toHaveLength(1);
  });

  it("GET /rcm/trends returns trend data", async () => {
    rcmMock.getCollectionsTrend.mockResolvedValueOnce([{ date: "2025-01-01", total: 100 } as any]);
    const res = await request(app).get("/rcm/trends?months=3");
    expect(res.status).toBe(200);
    expect(res.body.collections).toHaveLength(1);
  });

  it("GET /rcm/action-items returns items", async () => {
    rcmMock.getActionItems.mockResolvedValueOnce([{ id: "item-1" } as any]);
    const res = await request(app).get("/rcm/action-items?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it("GET /rcm/calendar requires dates", async () => {
    const res = await request(app).get("/rcm/calendar");
    expect(res.status).toBe(400);
  });

  it("GET /rcm/calendar returns events", async () => {
    rcmMock.getFinancialEvents.mockResolvedValueOnce([{ id: "event-1" } as any]);
    const res = await request(app).get("/rcm/calendar?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });

  it("GET /rcm/benchmarks returns benchmarks", async () => {
    rcmMock.getBenchmarks.mockResolvedValueOnce({ target: 25 } as any);
    const res = await request(app).get("/rcm/benchmarks?specialty=Dermatology");
    expect(res.status).toBe(200);
    expect(res.body.benchmarks.target).toBe(25);
  });
});
