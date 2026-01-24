import request from "supertest";
import express from "express";
import { smsConsentRouter } from "../smsConsent";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
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

beforeEach(() => {
  queryMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("SMS consent routes", () => {
  it("GET /sms-consent/:patientId returns no consent", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/sms-consent/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.hasConsent).toBe(false);
  });

  it("GET /sms-consent/:patientId returns consent and expiration", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          consentGiven: true,
          consentRevoked: false,
          expirationDate: futureDate,
        },
      ],
    });

    const res = await request(app).get("/sms-consent/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.hasConsent).toBe(true);
    expect(typeof res.body.daysUntilExpiration).toBe("number");
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

  it("POST /sms-consent/:patientId/revoke returns 404 when missing record", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/sms-consent/patient-1/revoke")
      .send({ reason: "No longer wants texts" });

    expect(res.status).toBe(404);
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
});
