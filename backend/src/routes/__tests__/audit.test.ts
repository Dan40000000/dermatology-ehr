import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { auditRouter } from "../audit";
import { pool } from "../../db/pool";
import { createAuditLog } from "../../services/audit";
import { logger } from "../../lib/logger";

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
  createAuditLog: jest.fn(),
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
app.use("/audit", auditRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;
const authToken = jwt.sign(
  { id: "user-1", tenantId: "tenant-1", role: "admin" },
  process.env.JWT_SECRET || "test-secret-key-for-testing-only",
);
const authHeaders = {
  Authorization: `Bearer ${authToken}`,
  "X-Tenant-Id": "tenant-1",
};
const authGet = (path: string) => request(app).get(path).set(authHeaders);
const authPost = (path: string) => request(app).post(path).set(authHeaders);

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Audit Routes", () => {
  describe("GET /audit/appointments", () => {
    it("should return appointment status history", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "history-1",
            appointmentId: "appt-1",
            status: "confirmed",
            changedBy: "user-1",
            changedAt: new Date(),
          },
        ],
      });

      const res = await authGet("/audit/appointments");

      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(1);
    });
  });

  describe("GET /audit/log", () => {
    it("should return basic audit log", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            userId: "user-1",
            action: "create",
            resourceType: "patient",
            resourceId: "patient-1",
            createdAt: new Date(),
          },
        ],
      });

      const res = await authGet("/audit/log");

      expect(res.status).toBe(200);
      expect(res.body.audit).toHaveLength(1);
    });
  });

  describe("GET /audit", () => {
    it("should return filtered audit logs", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "log-1",
              userId: "user-1",
              action: "view",
              resourceType: "patient",
              createdAt: new Date(),
            },
          ],
        });

      const res = await authGet("/audit");

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.total).toBe(10);
    });

    it("should filter by userId", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await authGet("/audit?userId=user-2");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("user_id = $2"),
        expect.arrayContaining(["tenant-1", "user-2"])
      );
    });

    it("should filter by action", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await authGet("/audit?action=create");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("action = $2"),
        expect.arrayContaining(["tenant-1", "create"])
      );
    });

    it("should filter by date range", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await authGet("/audit?startDate=2024-01-01&endDate=2024-01-31");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("created_at >= $2"),
        expect.arrayContaining(["tenant-1", "2024-01-01", "2024-01-31"])
      );
    });

    it("should support search", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await authGet("/audit?search=patient");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("ILIKE"),
        expect.arrayContaining(["tenant-1", "%patient%"])
      );
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await authGet("/audit");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch audit logs");
      expect(loggerMock.error).toHaveBeenCalledWith("Error fetching audit logs:", {
        error: "DB error",
      });
    });

    it("should mask non-Error failures", async () => {
      queryMock.mockRejectedValueOnce({ userEmail: "secret@example.com" });

      const res = await authGet("/audit");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch audit logs");
      expect(loggerMock.error).toHaveBeenCalledWith("Error fetching audit logs:", {
        error: "Unknown error",
      });
    });
  });

  describe("GET /audit/user/:userId", () => {
    it("should return user activity timeline", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            action: "view",
            resourceType: "patient",
            createdAt: new Date(),
          },
        ],
      });

      const res = await authGet("/audit/user/user-2");

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
    });

    it("should filter by date range", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await authGet("/audit/user/user-2?startDate=2024-01-01");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("created_at >= $3"),
        expect.arrayContaining(["tenant-1", "user-2", "2024-01-01"])
      );
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await authGet("/audit/user/user-2");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch user activity");
    });
  });

  describe("GET /audit/resource/:type/:id", () => {
    it("should return resource access log", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            userId: "user-1",
            action: "view",
            createdAt: new Date(),
          },
        ],
      });

      const res = await authGet("/audit/resource/patient/patient-1");

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await authGet("/audit/resource/patient/patient-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch resource access log");
    });
  });

  describe("GET /audit/summary", () => {
    it("should return audit summary statistics", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({ rows: [{ count: 25 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: 50 }] })
        .mockResolvedValueOnce({
          rows: [
            { action: "view", count: 40 },
            { action: "create", count: 10 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { resourceType: "patient", count: 60 },
            { resourceType: "encounter", count: 20 },
          ],
        });

      const res = await authGet("/audit/summary");

      expect(res.status).toBe(200);
      expect(res.body.totalEvents).toBe(100);
      expect(res.body.uniqueUsers).toBe(25);
      expect(res.body.failedLogins).toBe(5);
      expect(res.body.resourceAccesses).toBe(50);
      expect(res.body.actionBreakdown).toHaveLength(2);
      expect(res.body.resourceBreakdown).toHaveLength(2);
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await authGet("/audit/summary");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to fetch audit summary");
    });
  });

  describe("POST /audit/export", () => {
    it("should export audit logs as CSV", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            "User ID": "user-1",
            "User Name": "John Doe",
            "User Email": "john@example.com",
            Action: "view",
            "Resource Type": "patient",
            "Resource ID": "patient-1",
            "IP Address": "192.168.1.1",
            Severity: "info",
            Status: "success",
            Timestamp: new Date("2024-01-01"),
          },
        ],
      });

      const res = await authPost("/audit/export").send({ filters: {} });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("Audit_Log_");
      expect(res.text).toContain("User Name,User Email,Action");
      expect(createAuditLog).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        userId: "user-1",
        action: "export",
        resourceType: "audit_log",
        resourceId: "full_export",
        ipAddress: expect.any(String),
        metadata: { recordCount: 1, filters: {} },
        severity: "warning",
        status: "success",
      });
    });

    it("should filter exports", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/audit/export")
        .send({
          filters: {
            userId: "user-2",
            action: "create",
            startDate: "2024-01-01",
          },
        });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("user_id = $2"),
        expect.arrayContaining(["tenant-1", "user-2", "create", "2024-01-01"])
      );
    });

    it("should return 404 when no logs found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await authPost("/audit/export").send({ filters: {} });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No audit logs found for export");
    });

    it("should handle CSV escaping", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "log-1",
            "User Name": 'John "Doc" Doe',
            "User Email": "john@example.com",
            Action: "view,edit",
            "Resource Type": "patient",
            "Resource ID": "patient-1",
            "IP Address": "192.168.1.1",
            Severity: "info",
            Status: "success",
            Timestamp: new Date(),
          },
        ],
      });

      const res = await authPost("/audit/export").send({ filters: {} });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"John ""Doc"" Doe"');
      expect(res.text).toContain('"view,edit"');
    });

    it("should handle errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));

      const res = await authPost("/audit/export").send({ filters: {} });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to export audit logs");
    });
  });
});
