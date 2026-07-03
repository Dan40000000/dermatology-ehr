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

const invoiceRows = [
  {
    id: "invoice-clean-open",
    client_id: "crm-client-clean",
    invoice_number: "INV-CLEAN-001",
    description: "Pilot account",
    amount_cents: 9900,
    status: "open",
    due_date: "2026-06-30",
    paid_at: null,
    stripe_invoice_url: null,
    notes: "Pilot bill.",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
  },
  {
    id: "invoice-test-overdue",
    client_id: "crm-client-test-data",
    invoice_number: "INV-DATA-001",
    description: "Test data account",
    amount_cents: 12500,
    status: "overdue",
    due_date: "2026-06-10",
    paid_at: null,
    stripe_invoice_url: "https://pay.stripe.test/inv-data",
    notes: "Synthetic overdue balance.",
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:00.000Z",
  },
];

const requestRows = [
  {
    id: "request-clean-provider",
    client_id: "crm-client-clean",
    requested_by_user_id: "crm-user-clean",
    requested_by_name: "Clean Pilot Admin",
    requested_by_email: "pilot-empty@perrysoftwarellc.com",
    client_name: "Derm Pilot - Clean Environment",
    category: "provider_onboarding",
    title: "Add provider: Dr. New Provider",
    description: "New provider needs access.",
    priority: "normal",
    status: "new",
    provider_full_name: "Dr. New Provider",
    provider_specialty: "Dermatology",
    provider_email: "new.provider@example.com",
    provider_phone: "5415551212",
    requested_start_date: "2026-07-01",
    owner_notes: null,
    completed_at: null,
    created_at: "2026-06-20T12:00:00.000Z",
    updated_at: "2026-06-20T12:00:00.000Z",
  },
  {
    id: "request-test-integration",
    client_id: "crm-client-test-data",
    requested_by_user_id: "crm-user-test",
    requested_by_name: "Test Data Pilot Client",
    requested_by_email: "pilot-testdata@perrysoftwarellc.com",
    client_name: "Derm Pilot - Test Data Environment",
    category: "integration",
    title: "Monitor Twilio A2P verification",
    description: "Carrier registration watch item.",
    priority: "high",
    status: "waiting_on_client",
    provider_full_name: null,
    provider_specialty: null,
    provider_email: null,
    provider_phone: null,
    requested_start_date: null,
    owner_notes: "Waiting on carrier approval.",
    completed_at: null,
    created_at: "2026-06-19T12:00:00.000Z",
    updated_at: "2026-06-19T12:00:00.000Z",
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

const providerCountRows = [
  {
    tenant_id: "tenant-demo",
    provider_count: 3,
    active_provider_count: 2,
  },
  {
    tenant_id: "tenant-demo-test",
    provider_count: 5,
    active_provider_count: 4,
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
    if (sql.includes("FROM crm_client_invoices i") && sql.includes("JOIN crm_clients")) {
      const invoiceId = params?.[0];
      const invoice = invoiceRows.find((row) => row.id === invoiceId);
      if (!invoice) return { rows: [], rowCount: 0 };
      const client = clientRows.find((row) => row.id === invoice.client_id);
      return {
        rows: [{
          ...invoice,
          account_name: client?.account_name,
          legal_name: client?.legal_name,
          contact_name: client?.contact_name,
          contact_email: client?.contact_email,
          contact_phone: client?.contact_phone,
          stripe_customer_id: client?.stripe_customer_id,
        }],
        rowCount: 1,
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
    if (sql.includes("FROM crm_client_invoices")) {
      const clientIds = (params?.[0] as string[]) || [];
      const rows = invoiceRows.filter((row) => clientIds.includes(row.client_id));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("UPDATE crm_client_invoices")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM crm_client_requests")) {
      const clientIds = (params?.[0] as string[]) || [];
      const rows = requestRows.filter((row) => clientIds.includes(row.client_id));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("INSERT INTO crm_client_requests")) {
      if (sql.includes("provider_full_name")) {
        const [
          id,
          clientId,
          requestedByUserId,
          title,
          description,
          providerFullName,
          providerSpecialty,
          providerEmail,
          providerPhone,
          requestedStartDate,
        ] = (params || []) as string[];
        return {
          rows: [{
            id,
            client_id: clientId,
            requested_by_user_id: requestedByUserId,
            category: "provider_onboarding",
            title,
            description,
            priority: "normal",
            status: "new",
            provider_full_name: providerFullName,
            provider_specialty: providerSpecialty,
            provider_email: providerEmail,
            provider_phone: providerPhone,
            requested_start_date: requestedStartDate,
            owner_notes: null,
            completed_at: null,
            created_at: "2026-06-22T12:00:00.000Z",
            updated_at: "2026-06-22T12:00:00.000Z",
          }],
          rowCount: 1,
        };
      }

      const [id, clientId, requestedByUserId, category, title, description, priority] = (params || []) as string[];
      return {
        rows: [{
          id,
          client_id: clientId,
          requested_by_user_id: requestedByUserId,
          category,
          title,
          description,
          priority,
          status: "new",
          provider_full_name: null,
          provider_specialty: null,
          provider_email: null,
          provider_phone: null,
          requested_start_date: null,
          owner_notes: null,
          completed_at: null,
          created_at: "2026-06-22T12:00:00.000Z",
          updated_at: "2026-06-22T12:00:00.000Z",
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE crm_client_requests")) {
      const [status, priority, ownerNotes, requestId] = (params || []) as string[];
      const base = requestRows.find((row) => row.id === requestId) || requestRows[0];
      return {
        rows: [{
          ...base,
          status: status || base.status,
          priority: priority || base.priority,
          owner_notes: ownerNotes || base.owner_notes,
          completed_at: status === "completed" ? "2026-06-22T12:30:00.000Z" : null,
          updated_at: "2026-06-22T12:30:00.000Z",
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM openai_usage_audit")) {
      const tenantIds = (params?.[0] as string[]) || [];
      const rows = usageRows.filter((row) => tenantIds.includes(row.tenant_id));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM providers")) {
      const tenantIds = (params?.[0] as string[]) || [];
      const rows = providerCountRows.filter((row) => tenantIds.includes(row.tenant_id));
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
    expect(res.body.summary.newClients30d).toEqual(expect.any(Number));
    expect(res.body.summary.retainingClients).toBe(2);
    expect(res.body.summary.totalProviders).toBe(8);
    expect(res.body.summary.activeProviders).toBe(6);
    expect(res.body.summary.averageProvidersPerClient).toBe(4);
    expect(res.body.summary.openAiSpendCents).toBe(42);
    expect(res.body.summary.amazonVoiceSpendCents).toBe(36);
    expect(res.body.summary.openRequestCount).toBe(2);
    expect(res.body.summary.providerOnboardingRequests).toBe(1);
    expect(res.body.summary.highPriorityRequests).toBe(1);
    expect(res.body.summary.openInvoiceCents).toBe(22400);
    expect(res.body.summary.overdueInvoiceCents).toBe(12500);
    expect(res.body.requests).toHaveLength(2);
    expect(res.body.invoices).toHaveLength(2);
    expect(res.body.clients[0].metrics.providerCount).toBe(3);
    expect(res.body.clients[0].metrics.openRequestCount).toBe(1);
    expect(res.body.clients[0].metrics.accountAgeLabel).toEqual(expect.any(String));
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
    expect(res.body.client.metrics.providerCount).toBe(3);
    expect(res.body.client.metrics.openAiSpendCents).toBe(42);
    expect(res.body.client.metrics.amazonVoiceSpendCents).toBe(36);
    expect(res.body.client.invoices).toHaveLength(1);
    expect(res.body.client.requests).toHaveLength(1);
    expect(res.body.client.metrics.openRequestCount).toBe(1);
  });

  it("lets a client submit an add-provider request", async () => {
    installCrmQueryMock(clientUserRow);

    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "pilot-empty@perrysoftwarellc.com", password: "PilotCRM-2026!" });

    const res = await request(app)
      .post("/api/crm/client/provider-requests")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        providerFullName: "Dr. Jordan Lee",
        providerSpecialty: "Dermatology",
        providerEmail: "jordan.lee@example.com",
        providerPhone: "5415550000",
        requestedStartDate: "2026-07-15",
        notes: "Needs first-time login and schedule access.",
      });

    expect(res.status).toBe(201);
    expect(res.body.request.category).toBe("provider_onboarding");
    expect(res.body.request.status).toBe("new");
    expect(res.body.request.providerFullName).toBe("Dr. Jordan Lee");
    expect(res.body.request.title).toBe("Add provider: Dr. Jordan Lee");
  });

  it("lets a client submit a support or billing request", async () => {
    installCrmQueryMock(clientUserRow);

    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "pilot-empty@perrysoftwarellc.com", password: "PilotCRM-2026!" });

    const res = await request(app)
      .post("/api/crm/client/requests")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        category: "billing",
        title: "Need invoice help",
        description: "Please explain the latest platform invoice.",
        priority: "high",
      });

    expect(res.status).toBe(201);
    expect(res.body.request.category).toBe("billing");
    expect(res.body.request.priority).toBe("high");
    expect(res.body.request.status).toBe("new");
    expect(res.body.request.title).toBe("Need invoice help");
  });

  it("lets a client start checkout for their own open invoice", async () => {
    installCrmQueryMock(clientUserRow);

    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "pilot-empty@perrysoftwarellc.com", password: "PilotCRM-2026!" });

    const res = await request(app)
      .post("/api/crm/client/invoices/invoice-clean-open/checkout")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        successUrl: "https://perrysoftwarellc.com/account/",
        cancelUrl: "https://perrysoftwarellc.com/account/",
      });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("mock");
    expect(res.body.url).toContain("payment=success");
    expect(res.body.url).toContain("invoiceId=invoice-clean-open");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE crm_client_invoices"),
      expect.arrayContaining(["invoice-clean-open"])
    );
  });

  it("blocks a client from starting checkout for another client invoice", async () => {
    installCrmQueryMock(clientUserRow);

    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "pilot-empty@perrysoftwarellc.com", password: "PilotCRM-2026!" });

    const res = await request(app)
      .post("/api/crm/client/invoices/invoice-test-overdue/checkout")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        successUrl: "https://perrysoftwarellc.com/account/",
        cancelUrl: "https://perrysoftwarellc.com/account/",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Invoice does not belong to this client account");
  });

  it("lets the Perry owner update a client request status", async () => {
    const login = await request(app)
      .post("/api/crm/auth/login")
      .send({ email: "dan@perrysoftwarellc.com", password: "PerryCRM-2026!" });

    const res = await request(app)
      .patch("/api/crm/owner/requests/request-clean-provider")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({
        status: "scheduled",
        ownerNotes: "Provider kickoff scheduled.",
      });

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe("scheduled");
    expect(res.body.request.ownerNotes).toBe("Provider kickoff scheduled.");
  });
});
