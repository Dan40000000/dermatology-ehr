import express from "express";
import request from "supertest";
import { openAiAuditRouter } from "../openAiAudit";
import {
  getOpenAiUsageSettings,
  getOpenAiUsageSummary,
  listOpenAiUsageLogs,
  updateOpenAiUsageSettings,
} from "../../services/openAiUsageAuditService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: "admin-1",
      tenantId: "tenant-1",
      role: "admin",
      roles: ["admin"],
      email: "admin@example.com",
      fullName: "Admin",
    };
    next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/openAiUsageAuditService", () => ({
  getOpenAiUsageSettings: jest.fn(),
  getOpenAiUsageSummary: jest.fn(),
  listOpenAiUsageLogs: jest.fn(),
  updateOpenAiUsageSettings: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/openai-audit", openAiAuditRouter);

beforeEach(() => {
  jest.resetAllMocks();
});

describe("OpenAI audit routes", () => {
  it("returns usage summary for the authenticated tenant", async () => {
    (getOpenAiUsageSummary as jest.Mock).mockResolvedValueOnce({
      summary: { totalRequests: 1 },
      byFeature: [],
      byModel: [],
      daily: [],
    });

    const res = await request(app)
      .get("/api/openai-audit/summary?startDate=2026-05-01&endDate=2026-05-29");

    expect(res.status).toBe(200);
    expect(res.body.summary.totalRequests).toBe(1);
    expect(getOpenAiUsageSummary).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      })
    );
  });

  it("rejects invalid ranges", async () => {
    const res = await request(app)
      .get("/api/openai-audit/summary?startDate=2026-05-30&endDate=2026-05-01");

    expect(res.status).toBe(400);
    expect(getOpenAiUsageSummary).not.toHaveBeenCalled();
  });

  it("returns paginated logs", async () => {
    (listOpenAiUsageLogs as jest.Mock).mockResolvedValueOnce({ logs: [], total: 0, limit: 25, offset: 0 });

    const res = await request(app)
      .get("/api/openai-audit/logs?feature=clinical_copilot&limit=25");

    expect(res.status).toBe(200);
    expect(listOpenAiUsageLogs).toHaveBeenCalledWith(
      "tenant-1",
      expect.any(Object),
      expect.objectContaining({ feature: "clinical_copilot", limit: 25 })
    );
  });

  it("updates settings", async () => {
    (updateOpenAiUsageSettings as jest.Mock).mockResolvedValueOnce({
      monthlyBudgetCents: 2000,
      startingBalanceCents: 1500,
      balancePeriodStart: "2026-05-01",
    });

    const res = await request(app)
      .put("/api/openai-audit/settings")
      .send({ monthlyBudgetCents: 2000, startingBalanceCents: 1500, balancePeriodStart: "2026-05-01" });

    expect(res.status).toBe(200);
    expect(res.body.settings.monthlyBudgetCents).toBe(2000);
    expect(updateOpenAiUsageSettings).toHaveBeenCalledWith("tenant-1", {
      monthlyBudgetCents: 2000,
      startingBalanceCents: 1500,
      balancePeriodStart: "2026-05-01",
    });
  });

  it("returns settings", async () => {
    (getOpenAiUsageSettings as jest.Mock).mockResolvedValueOnce({
      monthlyBudgetCents: null,
      startingBalanceCents: null,
      balancePeriodStart: "2026-05-01",
    });

    const res = await request(app).get("/api/openai-audit/settings");

    expect(res.status).toBe(200);
    expect(getOpenAiUsageSettings).toHaveBeenCalledWith("tenant-1");
  });
});
