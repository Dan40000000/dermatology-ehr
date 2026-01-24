import request from "supertest";
import express from "express";
import { integrationsRouter } from "../integrations";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { notificationService } from "../../services/integrations/notificationService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
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

jest.mock("../../services/integrations/notificationService", () => ({
  notificationService: {
    getIntegrationStats: jest.fn(),
    getNotificationLogs: jest.fn(),
    testIntegration: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/integrations", integrationsRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const statsMock = notificationService.getIntegrationStats as jest.Mock;
const logsMock = notificationService.getNotificationLogs as jest.Mock;
const testMock = notificationService.testIntegration as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  statsMock.mockReset();
  logsMock.mockReset();
  testMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Integrations routes", () => {
  it("GET /integrations returns integrations with stats", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "int-1",
          type: "slack",
          webhook_url: "https://hooks.slack.com/services/test",
          channel_name: "alerts",
          enabled: true,
          notification_types: ["appointment_booked"],
          created_at: "2025-01-01",
          updated_at: "2025-01-02",
        },
      ],
    });
    statsMock.mockResolvedValueOnce({ total_notifications: "1" });

    const res = await request(app).get("/integrations");

    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(1);
    expect(res.body.integrations[0].stats.total_notifications).toBe("1");
    expect(statsMock).toHaveBeenCalledWith("tenant-1", "int-1");
  });

  it("POST /integrations/slack rejects invalid webhook", async () => {
    const res = await request(app).post("/integrations/slack").send({
      webhookUrl: "https://example.com",
      notificationTypes: ["appointment_booked"],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /integrations/slack rejects duplicates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "int-1" }] });

    const res = await request(app).post("/integrations/slack").send({
      webhookUrl: "https://hooks.slack.com/services/test",
      channelName: "alerts",
      notificationTypes: ["appointment_booked"],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("already exists");
  });

  it("POST /integrations/slack creates integration", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "int-1" }] });

    const res = await request(app).post("/integrations/slack").send({
      webhookUrl: "https://hooks.slack.com/services/test",
      channelName: "alerts",
      notificationTypes: ["appointment_booked"],
    });

    expect(res.status).toBe(201);
    expect(res.body.integration.id).toBe("int-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "integration.created",
      "integration",
      "int-1"
    );
  });

  it("POST /integrations/teams rejects invalid webhook", async () => {
    const res = await request(app).post("/integrations/teams").send({
      webhookUrl: "https://teams.example.com",
      notificationTypes: ["appointment_booked"],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("PATCH /integrations/:id rejects empty updates", async () => {
    const res = await request(app).patch("/integrations/int-1").send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /integrations/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/integrations/int-1").send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it("PATCH /integrations/:id updates integration", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "int-1" }] });

    const res = await request(app).patch("/integrations/int-1").send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.integration.id).toBe("int-1");
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "integration.updated",
      "integration",
      "int-1"
    );
  });

  it("DELETE /integrations/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/integrations/int-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /integrations/:id deletes integration", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ type: "slack" }] });
    const res = await request(app).delete("/integrations/int-1");
    expect(res.status).toBe(200);
    expect(auditMock).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "integration.deleted",
      "integration",
      "int-1"
    );
  });

  it("POST /integrations/:id/test returns success", async () => {
    testMock.mockResolvedValueOnce({ success: true });
    const res = await request(app).post("/integrations/int-1/test");
    expect(res.status).toBe(200);
  });

  it("POST /integrations/:id/test returns error", async () => {
    testMock.mockResolvedValueOnce({ success: false, error: "nope" });
    const res = await request(app).post("/integrations/int-1/test");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("nope");
  });

  it("GET /integrations/logs returns logs with filters", async () => {
    logsMock.mockResolvedValueOnce({ logs: [{ id: "log-1" }], total: 1 });

    const res = await request(app).get(
      "/integrations/logs?limit=10&offset=5&success=true&integrationId=int-1"
    );

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(logsMock).toHaveBeenCalledWith("tenant-1", {
      limit: 10,
      offset: 5,
      integrationId: "int-1",
      success: true,
    });
  });

  it("GET /integrations/stats returns stats", async () => {
    statsMock.mockResolvedValueOnce({ total_notifications: "3" });

    const res = await request(app).get("/integrations/stats?integrationId=int-1");

    expect(res.status).toBe(200);
    expect(res.body.stats.total_notifications).toBe("3");
    expect(statsMock).toHaveBeenCalledWith("tenant-1", "int-1");
  });
});
