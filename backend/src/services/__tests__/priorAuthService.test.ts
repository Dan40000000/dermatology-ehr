import { PriorAuthService } from "../priorAuthService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  (logger.info as jest.Mock).mockReset();
});

describe("PriorAuthService", () => {
  it("generateReferenceNumber uses date + sequence", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2025-01-02T12:00:00Z"));
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const ref = await PriorAuthService.generateReferenceNumber("tenant-1");
    expect(ref).toBe("PA-20250102-000001");

    jest.useRealTimers();
  });

  it("getDashboardStats returns zeros when no rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const stats = await PriorAuthService.getDashboardStats("tenant-1");
    expect(stats.total).toBe(0);
  });

  it("getDashboardStats parses row values", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          total: "5",
          pending: "2",
          approved: "2",
          denied: "1",
          expiring_soon: "1",
          expiring_urgent: "0",
          avg_days_pending: "3",
          total_resubmissions: "1",
          success_rate: "80",
        },
      ],
    });
    const stats = await PriorAuthService.getDashboardStats("tenant-1");
    expect(stats.approved).toBe(2);
    expect(stats.success_rate).toBe("80.0");
  });

  it("getExpiringPAs returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pa-1" }] });
    const result = await PriorAuthService.getExpiringPAs("tenant-1", 30);
    expect(result).toHaveLength(1);
  });

  it("updateStatus writes status history", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    await PriorAuthService.updateStatus(
      "pa-1",
      "tenant-1",
      "approved",
      null,
      null,
      null,
      null,
      "user-1"
    );
    expect(client.query).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it("addCommunicationLog updates record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await PriorAuthService.addCommunicationLog(
      "pa-1",
      "tenant-1",
      { type: "phone", direction: "outbound", notes: "Called" },
      "user-1"
    );
    expect(queryMock).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it("checkExpirations builds notifications", async () => {
    jest.spyOn(PriorAuthService, "getExpiringPAs").mockResolvedValueOnce([
      {
        id: "pa-1",
        patient_name: "Test",
        medication_name: "Med",
        procedure_code: "",
        expiration_date: "2025-01-10",
        days_until_expiration: 5,
        auth_number: "A1",
        payer_name: "Payer",
      },
    ]);

    const notifications = await PriorAuthService.checkExpirations("tenant-1");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].urgency).toBe("high");
  });

  it("getSuccessMetrics returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_submissions: "2" }] });
    const result = await PriorAuthService.getSuccessMetrics(
      "tenant-1",
      new Date("2025-01-01"),
      new Date("2025-01-31")
    );
    expect(result).toHaveLength(1);
  });

  it("getPatientPAs returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pa-1" }] });
    const result = await PriorAuthService.getPatientPAs("patient-1", "tenant-1");
    expect(result).toHaveLength(1);
  });

  it("expireOutdatedPAs returns count and logs", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pa-1" }] });
    const count = await PriorAuthService.expireOutdatedPAs("tenant-1");
    expect(count).toBe(1);
    expect(logger.info).toHaveBeenCalled();
  });

  it("getSuggestedTemplates returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "tpl-1" }] });
    const result = await PriorAuthService.getSuggestedTemplates("tenant-1", "med", "Drug");
    expect(result).toHaveLength(1);
  });

  it("incrementTemplateUsage updates template", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await PriorAuthService.incrementTemplateUsage("tpl-1");
    expect(queryMock).toHaveBeenCalled();
  });
});
