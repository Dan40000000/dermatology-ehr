import {
  logAuditEvent,
  auditMiddleware,
  logPHIAccess,
  logSecurityEvent,
  logDataExport,
  logConfigurationChange,
  getAuditLog,
  getUserActivityLog,
  getSecurityEvents,
  generateAuditReport,
} from "../auditLogger";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: { query: jest.fn() },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  (logger.info as jest.Mock).mockReset();
  (logger.warn as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

describe("auditLogger utilities", () => {
  it("logAuditEvent writes to db", async () => {
    await logAuditEvent({ tenantId: "t1", userId: "u1", action: "patient_view" });
    expect(queryMock).toHaveBeenCalled();
  });

  it("logAuditEvent handles db errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    await logAuditEvent({ tenantId: "t1", userId: "u1", action: "patient_view" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("auditMiddleware logs on success", async () => {
    const req: any = { method: "GET", params: { id: "p1" }, query: {}, ip: "1.1.1.1", get: jest.fn(), path: "/patients/1", user: { id: "u1", tenantId: "t1" } };
    const res: any = { statusCode: 200, json: jest.fn() };
    const next = jest.fn();
    const middleware = auditMiddleware("patient_view", "patient");
    await middleware(req, res, next);
    res.json({ id: "p1" });
    expect(queryMock).toHaveBeenCalled();
  });

  it("logPHIAccess writes audit event", async () => {
    await logPHIAccess("u1", "t1", "p1", "view", { source: "test" });
    expect(queryMock).toHaveBeenCalled();
  });

  it("logSecurityEvent writes audit event", async () => {
    await logSecurityEvent("login_failed", "high", { reason: "bad" }, "u1", "t1");
    expect(queryMock).toHaveBeenCalled();
  });

  it("logDataExport writes audit event", async () => {
    await logDataExport("u1", "t1", "audit", 10, { status: "ok" });
    expect(queryMock).toHaveBeenCalled();
  });

  it("logConfigurationChange writes audit event", async () => {
    await logConfigurationChange("u1", "t1", "setting", "old", "new");
    expect(queryMock).toHaveBeenCalled();
  });

  it("getAuditLog returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "row-1" }] });
    const rows = await getAuditLog("patient", "p1", 5);
    expect(rows).toHaveLength(1);
  });

  it("getUserActivityLog returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "row-1" }] });
    const rows = await getUserActivityLog("u1", 5);
    expect(rows).toHaveLength(1);
  });

  it("getSecurityEvents handles since", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "row-1" }] });
    const rows = await getSecurityEvents("t1", new Date(), 5);
    expect(rows).toHaveLength(1);
  });

  it("generateAuditReport returns summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ action: "view", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "sec-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "phi-1" }] });
    const report = await generateAuditReport("t1", new Date("2024-01-01"), new Date("2024-01-02"));
    expect(report.summary.view).toBe(2);
    expect(report.events).toHaveLength(1);
  });
});
