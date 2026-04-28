import express from "express";
import request from "supertest";
import { appointmentsRouter } from "../appointments";
import { priorAuthRouter } from "../priorAuth";
import { protocolsRouter } from "../protocols";
import { templatesRouter } from "../templates";
import telehealthRouter from "../telehealth";
import { smsRouter } from "../sms";
import { messagingRouter } from "../messaging";
import { faxRouter } from "../fax";
import { documentsRouter } from "../documents";
import { inventoryRouter } from "../inventory";
import handoutsRouter from "../handouts";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = String(req.headers["x-test-role"] || "provider");
    req.user = {
      id: "user-1",
      tenantId: "tenant-1",
      role,
      email: "user@example.com",
      fullName: "Test User",
    };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/twilioService", () => ({
  createTwilioService: jest.fn(() => ({
    sendSMS: jest.fn(),
    testConnection: jest.fn(),
    validateWebhookSignature: jest.fn(() => true),
  })),
}));

jest.mock("../../services/smsProcessor", () => ({
  addMessageToThread: jest.fn(),
  findOrCreateMessageThread: jest.fn(),
  markThreadReadByStaff: jest.fn(),
  markThreadUnreadByPatient: jest.fn(),
  processIncomingSMS: jest.fn(),
  updateMessageThreadRoute: jest.fn(),
  updateSMSStatus: jest.fn(),
}));

jest.mock("../../services/smsReminderScheduler", () => ({
  sendImmediateReminder: jest.fn(),
}));

jest.mock("../../services/smsWorkflowService", () => ({
  processScheduledReminders: jest.fn(),
  processFollowUpReminders: jest.fn(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../lib/container", () => ({
  getEmailService: () => ({ sendEmail: jest.fn() }),
}));

const app = express();
app.use(express.json());
app.use("/api/appointments", appointmentsRouter);
app.use("/api/prior-auth", priorAuthRouter);
app.use("/api/protocols", protocolsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/telehealth", telehealthRouter);
app.use("/api/sms", smsRouter);
app.use("/api/messaging", messagingRouter);
app.use("/api/fax", faxRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/handouts", handoutsRouter);

const queryMock = pool.query as jest.Mock;

const ALL_ROLES = [
  "admin",
  "provider",
  "ma",
  "front_desk",
  "billing",
  "nurse",
  "manager",
  "scheduler",
  "compliance_officer",
  "staff",
  "hr",
] as const;

const CASES = [
  {
    path: "/api/appointments",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
  {
    path: "/api/prior-auth",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager", "compliance_officer"],
  },
  {
    path: "/api/protocols",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager"],
  },
  {
    path: "/api/templates/notes",
    allowedRoles: ["admin", "provider", "ma", "manager"],
  },
  {
    path: "/api/telehealth/stats",
    allowedRoles: ["admin", "provider", "ma", "nurse", "manager"],
  },
  {
    path: "/api/sms/settings",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler"],
  },
  {
    path: "/api/messaging/threads?filter=inbox",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler"],
  },
  {
    path: "/api/fax/inbox",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler"],
  },
  {
    path: "/api/documents?limit=1",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
  {
    path: "/api/inventory",
    allowedRoles: ["admin", "ma", "front_desk", "manager"],
  },
  {
    path: "/api/handouts",
    allowedRoles: ["admin", "provider", "ma", "front_desk", "billing", "nurse", "manager", "scheduler", "compliance_officer"],
  },
] as const;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Module read endpoint authz", () => {
  it.each(
    CASES.flatMap(({ path, allowedRoles }) =>
      ALL_ROLES.map((role) => ({ path, role, allowed: allowedRoles.includes(role as any) })),
    ),
  )("enforces module authz for %s on %s", async ({ path, role, allowed }) => {
    queryMock.mockClear();

    const res = await request(app).get(path).set("x-test-role", role);

    if (allowed) {
      expect(res.status).not.toBe(403);
      return;
    }

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Insufficient role");
    expect(queryMock).not.toHaveBeenCalled();
  });
});
