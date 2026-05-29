import request from "supertest";
import express from "express";
import { smsAuditRouter } from "../smsAudit";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { getTableColumns } from "../../db/schema";

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

jest.mock("../../db/schema", () => ({
  getTableColumns: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/sms-audit", smsAuditRouter);

const queryMock = pool.query as jest.Mock;
const loggerErrorMock = logger.error as jest.Mock;
const getTableColumnsMock = getTableColumns as jest.Mock;

const modernSmsAuditColumns = new Set([
  "id",
  "tenant_id",
  "event_type",
  "patient_id",
  "patient_name",
  "user_id",
  "user_name",
  "message_id",
  "message_preview",
  "direction",
  "status",
  "metadata",
  "created_at",
]);

const legacySmsAuditColumns = new Set([
  "id",
  "tenant_id",
  "patient_id",
  "message_id",
  "action",
  "performed_by_user_id",
  "performed_by_name",
  "details",
  "created_at",
]);

beforeEach(() => {
  queryMock.mockReset();
  loggerErrorMock.mockReset();
  getTableColumnsMock.mockReset();
  getTableColumnsMock.mockResolvedValue(modernSmsAuditColumns);
  queryMock.mockResolvedValue({ rows: [] });
});

describe("SMS audit routes", () => {
  it("GET /sms-audit returns logs with pagination", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "log-1" }] })
      .mockResolvedValueOnce({ rows: [{ total: "5" }] });

    const res = await request(app).get(
      "/sms-audit?patientId=patient-1&eventType=message_sent&startDate=2025-01-01&endDate=2025-01-31&limit=2&offset=0"
    );

    expect(res.status).toBe(200);
    expect(res.body.auditLogs).toHaveLength(1);
    expect(res.body.pagination.total).toBe(5);
    expect(queryMock.mock.calls[0][0]).toContain("event_type as \"eventType\"");
  });

  it("GET /sms-audit/export returns CSV", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          event_type: "message_sent",
          patient_name: "Pat",
          user_name: "Staff",
          message_preview: "Hello",
          direction: "outbound",
          status: "delivered",
          timestamp: "2025-01-01 10:00:00",
        },
      ],
    });

    const res = await request(app).get("/sms-audit/export?patientId=patient-1");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Event Type,Patient Name");
    expect(res.text).toContain("message_sent");
  });

  it("GET /sms-audit/summary returns summary", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          messagesSent: "3",
          messagesReceived: "2",
          consentsObtained: "1",
          consentsRevoked: "0",
          optOuts: "0",
          uniquePatients: "2",
        },
      ],
    });

    const res = await request(app).get("/sms-audit/summary?startDate=2025-01-01");

    expect(res.status).toBe(200);
    expect(res.body.messagesSent).toBe("3");
  });

  it("GET /sms-audit/summary supports the legacy production audit schema", async () => {
    getTableColumnsMock.mockResolvedValueOnce(legacySmsAuditColumns);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          messagesSent: "0",
          messagesReceived: "0",
          consentsObtained: "0",
          consentsRevoked: "0",
          optOuts: "0",
          uniquePatients: "0",
        },
      ],
    });

    const res = await request(app).get("/sms-audit/summary?startDate=2026-05-25&endDate=2026-05-29");

    expect(res.status).toBe(200);
    expect(res.body.uniquePatients).toBe("0");
    expect(queryMock.mock.calls[0][0]).toContain("WHERE action = 'message_sent'");
    expect(queryMock.mock.calls[0][0]).toContain("created_at < ($3::date + interval '1 day')");
  });

  it("GET /sms-audit list supports legacy details fields", async () => {
    getTableColumnsMock.mockResolvedValueOnce(legacySmsAuditColumns);
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });

    const res = await request(app).get("/sms-audit?eventType=message_sent&startDate=2026-05-29&endDate=2026-05-29");

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][0]).toContain("action as \"eventType\"");
    expect(queryMock.mock.calls[0][0]).toContain("performed_by_user_id as \"userId\"");
    expect(queryMock.mock.calls[0][0]).toContain("COALESCE(details->>'direction', '') as direction");
  });

  it("GET /sms-audit handles errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("db"));

    const res = await request(app).get("/sms-audit");

    expect(res.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
