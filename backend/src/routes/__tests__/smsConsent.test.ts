import request from "supertest";
import express from "express";
import { smsConsentRouter } from "../smsConsent";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { createTwilioService } from "../../services/twilioService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/twilioService", () => ({
  createTwilioService: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/sms-consent", smsConsentRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const createTwilioServiceMock = createTwilioService as jest.Mock;
const transactionalQueryMock = jest.fn();
const twilioServiceMock = {
  sendSMS: jest.fn(),
};

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  createTwilioServiceMock.mockReset();
  transactionalQueryMock.mockReset();
  twilioServiceMock.sendSMS.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  transactionalQueryMock.mockImplementation(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  connectMock.mockResolvedValue({
    query: transactionalQueryMock,
    release: jest.fn(),
  });
  createTwilioServiceMock.mockReturnValue(twilioServiceMock);
  twilioServiceMock.sendSMS.mockResolvedValue({ sid: "sms-1", status: "sent", numSegments: 1 });
});

describe("SMS consent routes", () => {
  it("GET /sms-consent/:patientId returns no consent", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/sms-consent/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.hasConsent).toBe(false);
  });

  it("GET /sms-consent/:patientId returns consent and expiration", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            consentGiven: true,
            consentRevoked: false,
            expirationDate: futureDate,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ optedIn: true }] });

    const res = await request(app).get("/sms-consent/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.hasConsent).toBe(true);
    expect(typeof res.body.daysUntilExpiration).toBe("number");
  });

  it("GET /sms-consent/:patientId returns pending request state", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            consentGiven: false,
            consentRevoked: false,
            createdAt: "2026-03-11T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/sms-consent/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.hasConsent).toBe(false);
    expect(res.body.pendingRequest).toBe(true);
    expect(res.body.requestedAt).toBe("2026-03-11T12:00:00.000Z");
  });

  it("POST /sms-consent/:patientId rejects invalid payload", async () => {
    const res = await request(app).post("/sms-consent/patient-1").send({});

    expect(res.status).toBe(400);
  });

  it("POST /sms-consent/:patientId returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/sms-consent/patient-1").send({
      consentMethod: "verbal",
      obtainedByName: "Staff",
    });

    expect(res.status).toBe(404);
  });

  it("POST /sms-consent/:patientId records consent", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/sms-consent/patient-1").send({
      consentMethod: "verbal",
      obtainedByName: "Staff",
      expirationDate: "2030-01-01",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /sms-consent/:patientId/revoke rejects invalid payload", async () => {
    const res = await request(app)
      .post("/sms-consent/patient-1/revoke")
      .send({ reason: 123 });

    expect(res.status).toBe(400);
  });

  it("POST /sms-consent/:patientId/revoke revokes consent", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "consent-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/sms-consent/patient-1/revoke")
      .send({ reason: "No longer wants texts" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /sms-consent/:patientId/revoke creates audit state when prior record is missing", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/sms-consent/patient-1/revoke")
      .send({ reason: "No longer wants texts" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /sms-consent/:patientId/request sends opt-in text and saves pending consent", async () => {
    const transactionalQuery = jest.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM patients")) {
        return { rows: [{ phone: "541-231-8693", first_name: "Dan", last_name: "Perry" }] };
      }
      if (sql.includes("FROM sms_consent")) {
        return { rows: [] };
      }
      if (sql.includes("FROM patient_sms_preferences")) {
        return { rows: [] };
      }
      if (sql.includes("FROM sms_settings")) {
        return {
          rows: [{ twilio_account_sid: "sid", twilio_auth_token: "token", twilio_phone_number: "+15551234567", is_active: true, is_test_mode: false }],
        };
      }
      if (sql.includes("FROM tenants")) {
        return { rows: [{ practiceName: "Test Medical", practicePhone: "5412318693" }] };
      }
      return { rows: [], rowCount: 1 };
    });
    connectMock.mockResolvedValueOnce({
      query: transactionalQuery,
      release: jest.fn(),
    });

    const res = await request(app).post("/sms-consent/patient-1/request").send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(twilioServiceMock.sendSMS).toHaveBeenCalled();
  });
});
