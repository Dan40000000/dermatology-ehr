import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import crmRouter from "../crm";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: "staff-admin-1",
      tenantId: "tenant-demo",
      role: "admin",
      roles: ["admin"],
      email: "admin@demo.practice",
      fullName: "Dr. Rachel Kim",
    };
    next();
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

jest.mock("bcryptjs", () => ({
  compareSync: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/crm", crmRouter);

const queryMock = pool.query as jest.Mock;
const compareMock = bcrypt.compareSync as jest.Mock;

const ownerRow = {
  id: "crm-user-owner",
  client_id: null,
  email: "dan@perrysoftwarellc.com",
  full_name: "Daniel Perry",
  phone: "5412318693",
  role: "owner",
  password_hash: "owner-hash",
  force_password_reset: false,
};

const clientUserRow = {
  id: "crm-user-clean",
  client_id: "crm-client-clean",
  email: "pilot-empty@perrysoftwarellc.com",
  full_name: "Clean Pilot Admin",
  phone: null,
  role: "client_admin",
  password_hash: "client-hash",
  force_password_reset: false,
};

const clientRows = [
  {
    id: "crm-client-clean",
    linked_tenant_id: "tenant-demo",
    account_name: "Derm Pilot - Clean Environment",
    legal_name: "Perry Software Pilot Clean",
    contact_name: "Daniel Perry",
    contact_email: "dan@perrysoftwarellc.com",
    contact_phone: "5412318693",
    status: "pilot",
    plan_name: "Test Pilot",
    monthly_fee_cents: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: "trialing",
    implementation_stage: "Clean environment validation",
    environment_name: "pilot-live",
    product_url: "https://derm-frontend-pilot-live.up.railway.app",
    notes: "Clean test account.",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
  },
  {
    id: "crm-client-test-data",
    linked_tenant_id: "tenant-demo-test",
    account_name: "Derm Pilot - Test Data Environment",
    legal_name: "Perry Software Pilot Test Data",
    contact_name: "Daniel Perry",
    contact_email: "dan@perrysoftwarellc.com",
    contact_phone: "5412318693",
    status: "pilot",
    plan_name: "Test Pilot",
    monthly_fee_cents: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: "trialing",
    implementation_stage: "Synthetic data validation",
    environment_name: "production",
    product_url: "https://derm-frontend-production.up.railway.app",
    notes: "Synthetic data account.",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
  },
];

const subscriptionRows = [
  {
    id: "sub-openai",
    client_id: "crm-client-clean",
    vendor: "OpenAI",
    description: "OpenAI usage budget",
    category: "ai",
    amount_cents: 2500,
    billing_cycle: "monthly",
    paid_by: "perry_software",
    status: "active",
    next_renewal_date: "2026-07-01",
    notes: "Tracked in audit log.",
  },
  {
    id: "sub-aws",
    client_id: "crm-client-clean",
    vendor: "Amazon Voice",
    description: "HealthScribe voice usage",
    category: "voice_ai",
    amount_cents: 1500,
    billing_cycle: "usage",
    paid_by: "perry_software",
    status: "active",
    next_renewal_date: null,
    notes: "Separate from OpenAI spend.",
  },
  {
    id: "sub-twilio",
    client_id: "crm-client-test-data",
    vendor: "Twilio",
    description: "SMS messaging",
    category: "messaging",
    amount_cents: 500,
    billing_cycle: "monthly",
    paid_by: "perry_software",
    status: "active",
    next_renewal_date: null,
    notes: "A2P verified.",
  },
];

const aiKeyRows = [
  {
    id: "key-openai",
    client_id: "crm-client-clean",
    provider: "openai",
    label: "OpenAI project key",
    key_reference: "Railway OPENAI_API_KEY",
    masked_key: "sk-...railway",
    environment: "pilot-live",
    status: "active",
    monthly_budget_cents: 2000,
    last_rotated_at: null,
    notes: "Raw key is not stored here.",
  },
  {
    id: "key-aws",
    client_id: "crm-client-clean",
    provider: "aws_healthscribe",
    label: "Amazon Voice credentials",
    key_reference: "Railway AWS env vars",
    masked_key: "aws-...railway",
    environment: "pilot-live",
    status: "active",
    monthly_budget_cents: null,
    last_rotated_at: null,
    notes: "Voice spend tracked separately.",
  },
];

const usageRows = [
  {
    tenant_id: "tenant-demo",
    provider: "openai",
    requests: 6,
    total_tokens: 1200,
    estimated_audio_seconds: 0,
    estimated_cost_cents: 42,
    last_used_at: "2026-06-22T15:00:00.000Z",
  },
  {
    tenant_id: "tenant-demo",
    provider: "aws_healthscribe",
    requests: 2,
    total_tokens: 0,
    estimated_audio_seconds: 180,
    estimated_cost_cents: 36,
    last_used_at: "2026-06-22T15:05:00.000Z",
  },
];

function installCrmQueryMock(loginUser = ownerRow) {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM crm_client_users") && sql.includes("lower(email)")) {
      return { rows: [loginUser], rowCount: 1 };
    }
    if (sql.includes("UPDATE crm_client_users")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM crm_client_users") && sql.includes("WHERE id = $1")) {
      const userId = params?.[0];
      return {
        rows: [ownerRow, clientUserRow].filter((row) => row.id === userId),
        rowCount: userId === ownerRow.id || userId === clientUserRow.id ? 1 : 0,
      };
    }
    if (sql.includes("FROM crm_clients")) {
      if (sql.includes("WHERE id = $1")) {
        const clientId = params?.[0];
        const rows = clientRows.filter((row) => row.id === clientId);
        return { rows, rowCount: rows.length };
      }
      return { rows: clientRows, rowCount: clientRows.length };
    }
    if (sql.includes("FROM crm_client_subscriptions")) {
      const clientIds = (params?.[0] as string[]) || [];
      const rows = subscriptionRows.filter((row) => clientIds.includes(row.client_id));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM crm_client_ai_keys")) {
      const clientIds = (params?.[0] as string[]) || [];
      const rows = aiKeyRows.filter((row) => clientIds.includes(row.client_id));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM openai_usage_audit")) {
      const tenantIds = (params?.[0] as string[]) || [];
      const rows = usageRows.filter((row) => tenantIds.includes(row.tenant_id));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  compareMock.mockReset();
  compareMock.mockReturnValue(true);
  installCrmQueryMock();
});

describe("CRM routes", () => {
  it("logs in the Perry owner with a CRM token", async () => {
    const res = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "dan@perrysoftwarellc.com", password: "PerryCRM-2026!" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("owner");
    expect(res.body.token).toEqual(expect.any(String));
    expect(compareMock).toHaveBeenCalledWith("PerryCRM-2026!", "owner-hash");
  });

  it("rejects invalid CRM credentials", async () => {
    compareMock.mockReturnValueOnce(false);

    const res = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "dan@perrysoftwarellc.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid CRM login");
  });

  it("returns owner overview with client subscriptions and separated AI spend", async () => {
    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "dan@perrysoftwarellc.com", password: "PerryCRM-2026!" });

    const res = await request(app)
      .get("/api/crm/client/account")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("owner");
    expect(res.body.clients).toHaveLength(2);
    expect(res.body.summary.openAiSpendCents).toBe(42);
    expect(res.body.summary.amazonVoiceSpendCents).toBe(36);
    expect(res.body.clients[0].aiKeys[0].maskedKey).toBe("sk-...railway");
  });

  it("returns only the linked client account to a client login", async () => {
    installCrmQueryMock(clientUserRow);

    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "pilot-empty@perrysoftwarellc.com", password: "PilotCRM-2026!" });

    const res = await request(app)
      .get("/api/crm/client/account")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("client");
    expect(res.body.client.id).toBe("crm-client-clean");
    expect(res.body.client.metrics.openAiSpendCents).toBe(42);
    expect(res.body.client.metrics.amazonVoiceSpendCents).toBe(36);
  });
});
