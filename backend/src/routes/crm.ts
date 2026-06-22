import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";

const router = Router();

type CrmUser = {
  id: string;
  clientId: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  role: "owner" | "client_admin" | "client_user";
  forcePasswordReset: boolean;
};

type CrmAuthedRequest = Request & {
  crmUser?: CrmUser;
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const clientUpsertSchema = z.object({
  accountName: z.string().trim().min(1).max(180),
  legalName: z.string().trim().max(180).nullable().optional(),
  linkedTenantId: z.string().trim().max(120).nullable().optional(),
  contactName: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["lead", "pilot", "onboarding", "active", "at_risk", "paused", "cancelled"]).optional(),
  planName: z.string().trim().max(120).optional(),
  monthlyFeeCents: z.number().int().min(0).optional(),
  stripeCustomerId: z.string().trim().max(160).nullable().optional(),
  stripeSubscriptionId: z.string().trim().max(160).nullable().optional(),
  subscriptionStatus: z.string().trim().max(80).optional(),
  implementationStage: z.string().trim().max(160).optional(),
  environmentName: z.string().trim().max(80).nullable().optional(),
  productUrl: z.string().trim().url().nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
});

const subscriptionSchema = z.object({
  vendor: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  category: z.string().trim().max(80).optional(),
  amountCents: z.number().int().min(0).optional(),
  billingCycle: z.enum(["monthly", "annual", "usage", "one_time"]).optional(),
  paidBy: z.enum(["perry_software", "client", "included"]).optional(),
  status: z.enum(["active", "trialing", "paused", "cancelled"]).optional(),
  nextRenewalDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const aiKeySchema = z.object({
  provider: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  keyReference: z.string().trim().max(180).nullable().optional(),
  maskedKey: z.string().trim().max(120).nullable().optional(),
  environment: z.string().trim().max(80).optional(),
  status: z.enum(["active", "needs_rotation", "disabled", "not_configured"]).optional(),
  monthlyBudgetCents: z.number().int().min(0).nullable().optional(),
  lastRotatedAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function mapCrmUser(row: any): CrmUser {
  return {
    id: row.id,
    clientId: row.client_id || null,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone || null,
    role: row.role,
    forcePasswordReset: Boolean(row.force_password_reset),
  };
}

function signCrmToken(user: CrmUser): string {
  return jwt.sign(
    {
      crmUserId: user.id,
      clientId: user.clientId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tokenType: "crm",
    },
    env.jwtSecret,
    { expiresIn: "8h" }
  );
}

async function requireCrmAuth(req: CrmAuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.replace("Bearer ", "").trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Missing CRM token" });
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as any;
    if (decoded?.tokenType !== "crm" || !decoded.crmUserId) {
      return res.status(401).json({ error: "Invalid CRM token" });
    }

    const result = await pool.query(
      `SELECT id, client_id, email, full_name, phone, role, force_password_reset
       FROM crm_client_users
       WHERE id = $1`,
      [decoded.crmUserId]
    );

    const row = result.rows[0];
    if (!row) {
      return res.status(401).json({ error: "CRM user not found" });
    }

    req.crmUser = mapCrmUser(row);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid CRM token" });
  }
}

function cents(rowValue: unknown): number {
  const value = Number(rowValue);
  return Number.isFinite(value) ? value : 0;
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function daysSince(value: unknown): number | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function ageLabel(days: number | null): string {
  if (days === null) return "Unknown";
  if (days < 1) return "Today";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  return remainingMonths ? `${years}y ${remainingMonths}m` : `${years} year${years === 1 ? "" : "s"}`;
}

function isRetainedStatus(status: string): boolean {
  return ["active", "pilot", "onboarding", "at_risk"].includes(status);
}

function mapClient(row: any) {
  return {
    id: row.id,
    linkedTenantId: row.linked_tenant_id || null,
    accountName: row.account_name,
    legalName: row.legal_name || null,
    contactName: row.contact_name || null,
    contactEmail: row.contact_email || null,
    contactPhone: row.contact_phone || null,
    status: row.status,
    planName: row.plan_name,
    monthlyFeeCents: cents(row.monthly_fee_cents),
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    subscriptionStatus: row.subscription_status,
    implementationStage: row.implementation_stage,
    environmentName: row.environment_name || null,
    productUrl: row.product_url || null,
    notes: row.notes || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function getClientsWithDetails(clientId?: string) {
  const clientParams: unknown[] = [];
  let clientWhere = "";
  if (clientId) {
    clientParams.push(clientId);
    clientWhere = "WHERE id = $1";
  }

  const clientResult = await pool.query(
    `SELECT *
     FROM crm_clients
     ${clientWhere}
     ORDER BY
       CASE status
         WHEN 'active' THEN 1
         WHEN 'pilot' THEN 2
         WHEN 'onboarding' THEN 3
         WHEN 'lead' THEN 4
         ELSE 5
       END,
       account_name`,
    clientParams
  );

  const clients = clientResult.rows.map(mapClient);
  if (!clients.length) return [];

  const clientIds = clients.map((client) => client.id);
  const tenantIds = Array.from(new Set(clients.map((client) => client.linkedTenantId).filter(Boolean))) as string[];

  const [subscriptionsResult, aiKeysResult, usageResult, providerCountsResult] = await Promise.all([
    pool.query(
      `SELECT *
       FROM crm_client_subscriptions
       WHERE client_id = ANY($1::text[])
       ORDER BY status, vendor, description`,
      [clientIds]
    ),
    pool.query(
      `SELECT *
       FROM crm_client_ai_keys
       WHERE client_id = ANY($1::text[])
       ORDER BY provider, environment, label`,
      [clientIds]
    ),
    tenantIds.length
      ? pool.query(
          `SELECT
             tenant_id,
             provider,
             COUNT(*)::int AS requests,
             COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
             COALESCE(SUM(estimated_audio_seconds), 0)::float AS estimated_audio_seconds,
             COALESCE(SUM(estimated_cost_cents), 0)::float AS estimated_cost_cents,
             MAX(created_at) AS last_used_at
           FROM openai_usage_audit
           WHERE tenant_id = ANY($1::text[])
             AND created_at >= date_trunc('month', NOW())
           GROUP BY tenant_id, provider`,
          [tenantIds]
        )
      : Promise.resolve({ rows: [] } as any),
    tenantIds.length
      ? pool.query(
          `SELECT
             tenant_id,
             COUNT(*)::int AS provider_count,
             COUNT(*) FILTER (WHERE COALESCE(is_active, TRUE))::int AS active_provider_count
           FROM providers
           WHERE tenant_id = ANY($1::text[])
           GROUP BY tenant_id`,
          [tenantIds]
        )
      : Promise.resolve({ rows: [] } as any),
  ]);

  const subscriptionsByClient = new Map<string, any[]>();
  for (const row of subscriptionsResult.rows) {
    const list = subscriptionsByClient.get(row.client_id) || [];
    list.push({
      id: row.id,
      vendor: row.vendor,
      description: row.description,
      category: row.category,
      amountCents: cents(row.amount_cents),
      billingCycle: row.billing_cycle,
      paidBy: row.paid_by,
      status: row.status,
      nextRenewalDate: toIsoDate(row.next_renewal_date),
      notes: row.notes || null,
    });
    subscriptionsByClient.set(row.client_id, list);
  }

  const aiKeysByClient = new Map<string, any[]>();
  for (const row of aiKeysResult.rows) {
    const list = aiKeysByClient.get(row.client_id) || [];
    list.push({
      id: row.id,
      provider: row.provider,
      label: row.label,
      keyReference: row.key_reference || null,
      maskedKey: row.masked_key || null,
      environment: row.environment,
      status: row.status,
      monthlyBudgetCents: row.monthly_budget_cents === null || row.monthly_budget_cents === undefined ? null : cents(row.monthly_budget_cents),
      lastRotatedAt: row.last_rotated_at ? new Date(row.last_rotated_at).toISOString() : null,
      notes: row.notes || null,
    });
    aiKeysByClient.set(row.client_id, list);
  }

  const usageByTenant = new Map<string, any[]>();
  for (const row of usageResult.rows) {
    const list = usageByTenant.get(row.tenant_id) || [];
    list.push({
      provider: row.provider || "openai",
      requests: cents(row.requests),
      totalTokens: cents(row.total_tokens),
      estimatedAudioSeconds: Number(row.estimated_audio_seconds || 0),
      estimatedCostCents: Number(row.estimated_cost_cents || 0),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    });
    usageByTenant.set(row.tenant_id, list);
  }

  const providerCountsByTenant = new Map<string, { providerCount: number; activeProviderCount: number }>();
  for (const row of providerCountsResult.rows) {
    providerCountsByTenant.set(row.tenant_id, {
      providerCount: cents(row.provider_count),
      activeProviderCount: cents(row.active_provider_count),
    });
  }

  return clients.map((client) => {
    const subscriptions = subscriptionsByClient.get(client.id) || [];
    const aiKeys = aiKeysByClient.get(client.id) || [];
    const aiUsage = client.linkedTenantId ? usageByTenant.get(client.linkedTenantId) || [] : [];
    const providerCounts = client.linkedTenantId
      ? providerCountsByTenant.get(client.linkedTenantId) || { providerCount: 0, activeProviderCount: 0 }
      : { providerCount: 0, activeProviderCount: 0 };
    const accountAgeDays = daysSince(client.createdAt);
    const perryPaidSubscriptionCents = subscriptions
      .filter((item) => item.paidBy === "perry_software" && item.status !== "cancelled")
      .reduce((sum, item) => sum + item.amountCents, 0);
    const aiSpendCents = aiUsage.reduce((sum, item) => sum + item.estimatedCostCents, 0);
    return {
      ...client,
      subscriptions,
      aiKeys,
      aiUsage,
      metrics: {
        perryPaidSubscriptionCents,
        aiSpendCents,
        openAiSpendCents: aiUsage.filter((item) => item.provider === "openai").reduce((sum, item) => sum + item.estimatedCostCents, 0),
        amazonVoiceSpendCents: aiUsage.filter((item) => item.provider === "aws_healthscribe").reduce((sum, item) => sum + item.estimatedCostCents, 0),
        activeSubscriptions: subscriptions.filter((item) => item.status === "active" || item.status === "trialing").length,
        activeAiKeys: aiKeys.filter((item) => item.status === "active").length,
        providerCount: providerCounts.providerCount,
        activeProviderCount: providerCounts.activeProviderCount,
        accountAgeDays,
        accountAgeLabel: ageLabel(accountAgeDays),
        isNewClient: accountAgeDays !== null && accountAgeDays <= 30,
        isRetainedClient: isRetainedStatus(client.status),
      },
    };
  });
}

async function getOverview() {
  const clients = await getClientsWithDetails();
  const retainedClients = clients.filter((client: any) => client.metrics.isRetainedClient);
  const totalProviderCount = Array.from(
    clients.reduce((map: Map<string, number>, client: any) => {
      const key = client.linkedTenantId || client.id;
      map.set(key, Math.max(map.get(key) || 0, client.metrics.providerCount || 0));
      return map;
    }, new Map<string, number>()).values()
  ).reduce((sum: number, count: number) => sum + count, 0);
  const activeProviderCount = Array.from(
    clients.reduce((map: Map<string, number>, client: any) => {
      const key = client.linkedTenantId || client.id;
      map.set(key, Math.max(map.get(key) || 0, client.metrics.activeProviderCount || 0));
      return map;
    }, new Map<string, number>()).values()
  ).reduce((sum: number, count: number) => sum + count, 0);
  const knownAges = clients
    .map((client: any) => client.metrics.accountAgeDays)
    .filter((days: number | null) => typeof days === "number") as number[];
  const statusCounts = clients.reduce((counts: Record<string, number>, client: any) => {
    counts[client.status] = (counts[client.status] || 0) + 1;
    return counts;
  }, {});

  return {
    clients,
    summary: {
      totalClients: clients.length,
      activeClients: retainedClients.length,
      newClients30d: clients.filter((client: any) => client.metrics.isNewClient && client.status !== "cancelled").length,
      retainingClients: retainedClients.length,
      atRiskClients: clients.filter((client: any) => client.status === "at_risk").length,
      pausedClients: clients.filter((client: any) => client.status === "paused").length,
      cancelledClients: clients.filter((client: any) => client.status === "cancelled").length,
      totalProviders: totalProviderCount,
      activeProviders: activeProviderCount,
      averageClientAgeDays: knownAges.length ? Math.round(knownAges.reduce((sum, days) => sum + days, 0) / knownAges.length) : null,
      averageClientAgeLabel: knownAges.length ? ageLabel(Math.round(knownAges.reduce((sum, days) => sum + days, 0) / knownAges.length)) : "Unknown",
      averageProvidersPerClient: clients.length ? Number((clients.reduce((sum: number, client: any) => sum + (client.metrics.providerCount || 0), 0) / clients.length).toFixed(1)) : 0,
      statusCounts,
      monthlyRecurringRevenueCents: clients
        .filter((client: any) => client.status !== "cancelled")
        .reduce((sum: number, client: any) => sum + client.monthlyFeeCents, 0),
      annualRunRateCents: clients
        .filter((client: any) => client.status !== "cancelled")
        .reduce((sum: number, client: any) => sum + client.monthlyFeeCents, 0) * 12,
      perryPaidSubscriptionCents: clients.reduce((sum: number, client: any) => sum + client.metrics.perryPaidSubscriptionCents, 0),
      aiSpendCents: clients.reduce((sum: number, client: any) => sum + client.metrics.aiSpendCents, 0),
      openAiSpendCents: clients.reduce((sum: number, client: any) => sum + client.metrics.openAiSpendCents, 0),
      amazonVoiceSpendCents: clients.reduce((sum: number, client: any) => sum + client.metrics.amazonVoiceSpendCents, 0),
      activeAiKeys: clients.reduce((sum: number, client: any) => sum + client.metrics.activeAiKeys, 0),
    },
  };
}

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload" });
  }

  const result = await pool.query(
    `SELECT id, client_id, email, full_name, phone, role, password_hash, force_password_reset
     FROM crm_client_users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [parsed.data.email]
  );

  const row = result.rows[0];
  if (!row || !bcrypt.compareSync(parsed.data.password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid CRM login" });
  }

  await pool.query(
    `UPDATE crm_client_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [row.id]
  );

  const user = mapCrmUser(row);
  res.json({ token: signCrmToken(user), user });
});

router.get("/auth/me", requireCrmAuth, (req: CrmAuthedRequest, res) => {
  res.json({ user: req.crmUser });
});

router.get("/client/account", requireCrmAuth, async (req: CrmAuthedRequest, res) => {
  if (req.crmUser?.role === "owner") {
    return res.json({ mode: "owner", ...(await getOverview()) });
  }

  if (!req.crmUser?.clientId) {
    return res.status(403).json({ error: "No client account linked" });
  }

  const clients = await getClientsWithDetails(req.crmUser.clientId);
  const client = clients[0];
  if (!client) {
    return res.status(404).json({ error: "Client account not found" });
  }

  res.json({ mode: "client", client });
});

router.get("/admin/overview", requireAuth, requireRoles(["admin"]), async (_req: AuthedRequest, res) => {
  res.json(await getOverview());
});

router.get("/admin/clients", requireAuth, requireRoles(["admin"]), async (_req: AuthedRequest, res) => {
  res.json({ clients: await getClientsWithDetails() });
});

router.post("/admin/clients", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = clientUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid client payload", details: parsed.error.format() });
  }

  const data = parsed.data;
  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO crm_clients (
       id, linked_tenant_id, account_name, legal_name, contact_name, contact_email, contact_phone,
       status, plan_name, monthly_fee_cents, stripe_customer_id, stripe_subscription_id,
       subscription_status, implementation_stage, environment_name, product_url, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      id,
      data.linkedTenantId || null,
      data.accountName,
      data.legalName || null,
      data.contactName || null,
      data.contactEmail || null,
      data.contactPhone || null,
      data.status || "lead",
      data.planName || "Pilot",
      data.monthlyFeeCents || 0,
      data.stripeCustomerId || null,
      data.stripeSubscriptionId || null,
      data.subscriptionStatus || "trialing",
      data.implementationStage || "New client",
      data.environmentName || null,
      data.productUrl || null,
      data.notes || null,
    ]
  );

  res.status(201).json({ client: (await getClientsWithDetails(result.rows[0].id))[0] });
});

router.put("/admin/clients/:id", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = clientUpsertSchema.partial({ accountName: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid client payload", details: parsed.error.format() });
  }

  const { id } = req.params;
  const current = await pool.query(`SELECT * FROM crm_clients WHERE id = $1`, [id]);
  if (!current.rowCount) {
    return res.status(404).json({ error: "Client not found" });
  }

  const data = parsed.data;
  await pool.query(
    `UPDATE crm_clients
     SET linked_tenant_id = COALESCE($1, linked_tenant_id),
         account_name = COALESCE($2, account_name),
         legal_name = COALESCE($3, legal_name),
         contact_name = COALESCE($4, contact_name),
         contact_email = COALESCE($5, contact_email),
         contact_phone = COALESCE($6, contact_phone),
         status = COALESCE($7, status),
         plan_name = COALESCE($8, plan_name),
         monthly_fee_cents = COALESCE($9, monthly_fee_cents),
         stripe_customer_id = COALESCE($10, stripe_customer_id),
         stripe_subscription_id = COALESCE($11, stripe_subscription_id),
         subscription_status = COALESCE($12, subscription_status),
         implementation_stage = COALESCE($13, implementation_stage),
         environment_name = COALESCE($14, environment_name),
         product_url = COALESCE($15, product_url),
         notes = COALESCE($16, notes),
         updated_at = NOW()
     WHERE id = $17`,
    [
      data.linkedTenantId ?? null,
      data.accountName ?? null,
      data.legalName ?? null,
      data.contactName ?? null,
      data.contactEmail ?? null,
      data.contactPhone ?? null,
      data.status ?? null,
      data.planName ?? null,
      data.monthlyFeeCents ?? null,
      data.stripeCustomerId ?? null,
      data.stripeSubscriptionId ?? null,
      data.subscriptionStatus ?? null,
      data.implementationStage ?? null,
      data.environmentName ?? null,
      data.productUrl ?? null,
      data.notes ?? null,
      id,
    ]
  );

  res.json({ client: (await getClientsWithDetails(id))[0] });
});

router.post("/admin/clients/:id/subscriptions", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid subscription payload", details: parsed.error.format() });
  }

  const clientId = req.params.id;
  const client = await pool.query(`SELECT id FROM crm_clients WHERE id = $1`, [clientId]);
  if (!client.rowCount) return res.status(404).json({ error: "Client not found" });

  const data = parsed.data;
  await pool.query(
    `INSERT INTO crm_client_subscriptions (
       id, client_id, vendor, description, category, amount_cents, billing_cycle, paid_by,
       status, next_renewal_date, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11)`,
    [
      randomUUID(),
      clientId,
      data.vendor,
      data.description,
      data.category || "software",
      data.amountCents || 0,
      data.billingCycle || "monthly",
      data.paidBy || "perry_software",
      data.status || "active",
      data.nextRenewalDate || null,
      data.notes || null,
    ]
  );

  res.status(201).json({ client: (await getClientsWithDetails(clientId))[0] });
});

router.post("/admin/clients/:id/ai-keys", requireAuth, requireRoles(["admin"]), async (req: AuthedRequest, res) => {
  const parsed = aiKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid AI key payload", details: parsed.error.format() });
  }

  const clientId = req.params.id;
  const client = await pool.query(`SELECT id FROM crm_clients WHERE id = $1`, [clientId]);
  if (!client.rowCount) return res.status(404).json({ error: "Client not found" });

  const data = parsed.data;
  await pool.query(
    `INSERT INTO crm_client_ai_keys (
       id, client_id, provider, label, key_reference, masked_key, environment,
       status, monthly_budget_cents, last_rotated_at, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)`,
    [
      randomUUID(),
      clientId,
      data.provider,
      data.label,
      data.keyReference || null,
      data.maskedKey || null,
      data.environment || "production",
      data.status || "active",
      data.monthlyBudgetCents ?? null,
      data.lastRotatedAt || null,
      data.notes || null,
    ]
  );

  res.status(201).json({ client: (await getClientsWithDetails(clientId))[0] });
});

export default router;
