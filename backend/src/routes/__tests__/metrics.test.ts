import request from "supertest";
import express from "express";
import metricsRouter from "../metrics";
import { metricsService } from "../../services/metricsService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

let authUser: any = { id: "user-1", tenantId: "tenant-1", role: "provider" };

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authUser;
    return next();
  },
}));

jest.mock("../../services/metricsService", () => ({
  metricsService: {
    logEvents: jest.fn(),
    calculateEncounterMetrics: jest.fn(),
    saveEncounterMetrics: jest.fn(),
    getSummary: jest.fn(),
    getProviderMetrics: jest.fn(),
    getTrends: jest.fn(),
    getFeatureUsage: jest.fn(),
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

const app = express();
app.use(express.json());
app.use("/metrics", metricsRouter);

const metricsMock = metricsService as jest.Mocked<typeof metricsService>;
const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  authUser = { id: "user-1", tenantId: "tenant-1", role: "provider" };
  metricsMock.logEvents.mockReset();
  metricsMock.calculateEncounterMetrics.mockReset();
  metricsMock.saveEncounterMetrics.mockReset();
  metricsMock.getSummary.mockReset();
  metricsMock.getProviderMetrics.mockReset();
  metricsMock.getTrends.mockReset();
  metricsMock.getFeatureUsage.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Metrics routes", () => {
  it("POST /metrics/events rejects empty events", async () => {
    const res = await request(app)
      .post("/metrics/events")
      .set("x-tenant-id", "tenant-1")
      .send({ sessionId: "s1", events: [] });
    expect(res.status).toBe(400);
  });

  it("POST /metrics/events logs events and saves encounter metrics", async () => {
    metricsMock.logEvents.mockResolvedValueOnce(undefined);
    metricsMock.calculateEncounterMetrics.mockResolvedValueOnce({
      encounterId: "enc-1",
      tenantId: "tenant-1",
      providerId: "prov-1",
      patientId: "pat-1",
      totalDurationSeconds: 100,
      documentationDurationSeconds: 50,
      clickCount: 2,
      pageViews: 1,
      navigationCount: 1,
      timeInNotesSeconds: 10,
      timeInOrdersSeconds: 5,
      timeInPhotosSeconds: 0,
      timeInPrescriptionsSeconds: 0,
      timeInBillingSeconds: 0,
      timeInProceduresSeconds: 0,
      encounterType: "follow-up",
      isNewPatient: false,
      encounterStartedAt: new Date(),
      encounterCompletedAt: new Date(),
    });
    metricsMock.saveEncounterMetrics.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/metrics/events")
      .set("x-tenant-id", "tenant-1")
      .send({
        sessionId: "s1",
        events: [
          {
            userId: "user-1",
            eventType: "task_end",
            eventTarget: "encounter",
            timestamp: new Date().toISOString(),
            encounterId: "enc-1",
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.eventsLogged).toBe(1);
    expect(metricsMock.saveEncounterMetrics).toHaveBeenCalled();
  });

  it("GET /metrics/summary returns summary", async () => {
    metricsMock.getSummary.mockResolvedValueOnce({ total_encounters: 3 } as any);
    const res = await request(app).get("/metrics/summary?period=7d").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body.total_encounters).toBe(3);
  });

  it("GET /metrics/summary logs sanitized Error failures", async () => {
    metricsMock.getSummary.mockRejectedValueOnce(new Error("summary failed"));

    const res = await request(app).get("/metrics/summary").set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch summary");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching summary:", {
      error: "summary failed",
    });
  });

  it("GET /metrics/summary masks non-Error failures", async () => {
    metricsMock.getSummary.mockRejectedValueOnce({ tenantId: "tenant-1" });

    const res = await request(app).get("/metrics/summary").set("x-tenant-id", "tenant-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch summary");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching summary:", {
      error: "Unknown error",
    });
  });

  it("GET /metrics/providers returns providers", async () => {
    metricsMock.getProviderMetrics.mockResolvedValueOnce([{ providerId: "p1" }] as any);
    const res = await request(app).get("/metrics/providers").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /metrics/trends returns trends", async () => {
    metricsMock.getTrends.mockResolvedValueOnce([{ date: "2025-01-01" }] as any);
    const res = await request(app).get("/metrics/trends").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /metrics/features returns features", async () => {
    metricsMock.getFeatureUsage.mockResolvedValueOnce([{ featureName: "notes" }] as any);
    const res = await request(app).get("/metrics/features").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /metrics/encounters/:encounterId/summary returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/metrics/encounters/enc-1/summary").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(404);
  });

  it("GET /metrics/encounters/:encounterId/summary returns summary", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            encounter_id: "enc-1",
            total_duration_seconds: 100,
            click_count: 5,
            navigation_count: 2,
            page_views: 3,
            user_avg_duration: 120,
            user_avg_clicks: 10,
            encounters_today: 2,
            time_saved_today: 30,
            efficiency_score: 90,
            efficiency_rank: 1,
            provider_id: "prov-1",
            tenant_id: "tenant-1",
            encounter_type: "follow-up",
            is_new_patient: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            target_duration_seconds: 180,
            average_duration_seconds: 200,
            industry_average_duration_seconds: 240,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ type: "speed" }] });

    const res = await request(app).get("/metrics/encounters/enc-1/summary").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body.encounterId).toBe("enc-1");
    expect(res.body.achievementsEarned).toHaveLength(1);
  });

  it("GET /metrics/user/:userId returns metrics", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ encounters_completed: "5" }] });
    const res = await request(app).get("/metrics/user/user-1").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body.encounters_completed).toBe("5");
  });

  it("GET /metrics/achievements/:userId returns achievements", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ type: "speed" }] });
    const res = await request(app).get("/metrics/achievements/user-1").set("x-tenant-id", "tenant-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("POST /metrics/benchmarks requires admin role", async () => {
    authUser = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    const res = await request(app)
      .post("/metrics/benchmarks")
      .set("x-tenant-id", "tenant-1")
      .send({ encounterType: "follow-up", isNewPatient: false, targetDuration: 180, targetClicks: 12 });
    expect(res.status).toBe(403);
  });

  it("POST /metrics/benchmarks updates benchmark", async () => {
    authUser = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/metrics/benchmarks")
      .set("x-tenant-id", "tenant-1")
      .send({ encounterType: "follow-up", isNewPatient: false, targetDuration: 180, targetClicks: 12 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
