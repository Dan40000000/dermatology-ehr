import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import {
  getOpenAiUsageSettings,
  getOpenAiUsageSummary,
  listOpenAiUsageLogs,
  updateOpenAiUsageSettings,
} from "../services/openAiUsageAuditService";

export const openAiAuditRouter = Router();

openAiAuditRouter.use(requireAuth);
openAiAuditRouter.use(requireRoles(["admin"]));

const usageQuerySchema = z.object({
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

const logsQuerySchema = usageQuerySchema.extend({
  feature: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const settingsSchema = z.object({
  monthlyBudgetCents: z.number().int().min(0).nullable().optional(),
  startingBalanceCents: z.number().int().min(0).nullable().optional(),
  balancePeriodStart: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function defaultStartDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function defaultEndDate(): Date {
  return new Date();
}

function parseRange(query: { startDate?: string; endDate?: string }) {
  const startDate = query.startDate
    ? new Date(`${query.startDate.slice(0, 10)}T00:00:00.000Z`)
    : defaultStartDate();
  const endDate = query.endDate
    ? new Date(`${query.endDate.slice(0, 10)}T23:59:59.999Z`)
    : defaultEndDate();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return null;
  }

  return { startDate, endDate };
}

openAiAuditRouter.get("/summary", async (req: AuthedRequest, res) => {
  const parsed = usageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid usage query", details: parsed.error.format() });
  }

  const range = parseRange(parsed.data);
  if (!range) {
    return res.status(400).json({ error: "Invalid date range" });
  }

  const summary = await getOpenAiUsageSummary(req.user!.tenantId, range);
  res.json(summary);
});

openAiAuditRouter.get("/logs", async (req: AuthedRequest, res) => {
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid log query", details: parsed.error.format() });
  }

  const range = parseRange(parsed.data);
  if (!range) {
    return res.status(400).json({ error: "Invalid date range" });
  }

  const logs = await listOpenAiUsageLogs(req.user!.tenantId, range, {
    feature: parsed.data.feature,
    model: parsed.data.model,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });
  res.json(logs);
});

openAiAuditRouter.get("/settings", async (req: AuthedRequest, res) => {
  const settings = await getOpenAiUsageSettings(req.user!.tenantId);
  res.json({ settings });
});

openAiAuditRouter.put("/settings", async (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid settings", details: parsed.error.format() });
  }

  const settings = await updateOpenAiUsageSettings(req.user!.tenantId, parsed.data);
  res.json({ settings });
});
