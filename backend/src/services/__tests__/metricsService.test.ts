import { MetricsService } from "../metricsService";
import { pool } from "../../db/pool";

jest.mock("../../db/pool", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  connectMock.mockReset();
});

describe("MetricsService", () => {
  it("logEvents returns early for empty events", async () => {
    const service = new MetricsService();
    await service.logEvents([]);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("logEvents inserts events in a transaction", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    const service = new MetricsService();

    await service.logEvents([
      {
        tenantId: "tenant-1",
        userId: "user-1",
        sessionId: "sess-1",
        eventType: "click",
        timestamp: new Date(),
      },
    ]);

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("calculateEncounterMetrics returns null when encounter missing", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.calculateEncounterMetrics("enc-1", "tenant-1");
    expect(result).toBeNull();
  });

  it("calculateEncounterMetrics builds metrics from events", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "enc-1",
            tenant_id: "tenant-1",
            provider_id: "prov-1",
            patient_id: "pat-1",
            encounter_type: "follow-up",
            created_at: new Date("2025-01-01T00:00:00Z"),
            updated_at: new Date("2025-01-01T00:10:00Z"),
            is_new_patient: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_type: "task_start",
            event_target: "encounter",
            event_metadata: null,
            timestamp: new Date("2025-01-01T00:00:00Z"),
          },
          {
            event_type: "click",
            event_target: "button",
            event_metadata: null,
            timestamp: new Date("2025-01-01T00:01:00Z"),
          },
          {
            event_type: "task_end",
            event_target: "encounter",
            event_metadata: { sectionTimes: { notes: 60000 } },
            timestamp: new Date("2025-01-01T00:05:00Z"),
          },
        ],
      });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.calculateEncounterMetrics("enc-1", "tenant-1");
    expect(result?.totalDurationSeconds).toBe(300);
    expect(result?.clickCount).toBe(1);
    expect(result?.documentationDurationSeconds).toBe(60);
  });

  it("saveEncounterMetrics writes metrics and checks achievements", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // benchmark
      .mockResolvedValueOnce({ rows: [] }) // insert metrics
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // speed demon
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // click minimalist
      .mockResolvedValueOnce({ rows: [{ avg_score: 0 }] }); // efficiency expert
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    await service.saveEncounterMetrics({
      encounterId: "enc-1",
      tenantId: "tenant-1",
      providerId: "prov-1",
      patientId: "pat-1",
      totalDurationSeconds: 100,
      documentationDurationSeconds: 50,
      clickCount: 5,
      pageViews: 1,
      navigationCount: 1,
      timeInNotesSeconds: 10,
      timeInOrdersSeconds: 0,
      timeInPhotosSeconds: 0,
      timeInPrescriptionsSeconds: 0,
      timeInBillingSeconds: 0,
      timeInProceduresSeconds: 0,
      encounterType: "follow-up",
      isNewPatient: false,
      encounterStartedAt: new Date(),
      encounterCompletedAt: new Date(),
    });

    expect(client.query).toHaveBeenCalled();
  });

  it("getSummary returns stats", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [{ total_encounters: "2" }] });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.getSummary("tenant-1", "7d");
    expect(result.total_encounters).toBe("2");
  });

  it("getProviderMetrics returns providers", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [{ providerId: "p1" }] });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.getProviderMetrics("tenant-1", "7d");
    expect(result).toHaveLength(1);
  });

  it("getTrends returns trend rows", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [{ date: "2025-01-01" }] });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.getTrends("tenant-1", "7d");
    expect(result).toHaveLength(1);
  });

  it("getFeatureUsage returns feature stats", async () => {
    const client = makeClient();
    client.query.mockResolvedValueOnce({ rows: [{ featureName: "notes" }] });
    connectMock.mockResolvedValueOnce(client);

    const service = new MetricsService();
    const result = await service.getFeatureUsage("tenant-1", "7d");
    expect(result).toHaveLength(1);
  });
});
