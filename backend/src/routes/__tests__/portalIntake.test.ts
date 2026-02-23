import request from "supertest";
import express from "express";
import { portalIntakeRouter } from "../portalIntake";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/patientPortalAuth", () => ({
  requirePatientAuth: (req: any, _res: any, next: any) => {
    req.patient = {
      patientId: "patient-1",
      tenantId: "tenant-1",
      accountId: "account-1",
      email: "patient@example.com",
    };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
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
app.use("/intake", portalIntakeRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  loggerMock.error.mockReset();
});

describe("Patient portal intake routes", () => {
  it("GET /intake/forms returns assigned forms", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ assignment_id: "assign-1" }] });

    const res = await request(app).get("/intake/forms");

    expect(res.status).toBe(200);
    expect(res.body.forms).toHaveLength(1);
  });

  it("GET /intake/forms logs sanitized error message on query failure", async () => {
    queryMock.mockRejectedValueOnce(new Error("db boom"));

    const res = await request(app).get("/intake/forms");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to get intake forms");
    expect(loggerMock.error).toHaveBeenCalledWith("Get intake forms error", { error: "db boom" });
  });

  it("GET /intake/forms masks non-Error thrown values", async () => {
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe", diagnosis: "eczema" });

    const res = await request(app).get("/intake/forms");

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Get intake forms error", { error: "Unknown error" });
  });

  it("GET /intake/forms/:assignmentId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/intake/forms/assign-1");

    expect(res.status).toBe(404);
  });

  it("GET /intake/forms/:assignmentId returns form details", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ assignment_id: "assign-1", status: "pending" }] });

    const res = await request(app).get("/intake/forms/assign-1");

    expect(res.status).toBe(200);
    expect(res.body.assignment_id).toBe("assign-1");
  });

  it("POST /intake/forms/:assignmentId/start returns existing response", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "assign-1", form_template_id: "template-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "response-1" }] });

    const res = await request(app).post("/intake/forms/assign-1/start");

    expect(res.status).toBe(200);
    expect(res.body.responseId).toBe("response-1");
  });

  it("POST /intake/forms/:assignmentId/start creates draft response", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "assign-1", form_template_id: "template-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "response-2" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/intake/forms/assign-1/start");

    expect(res.status).toBe(201);
    expect(res.body.responseId).toBe("response-2");
  });

  it("PUT /intake/responses/:responseId rejects invalid input", async () => {
    const res = await request(app).put("/intake/responses/response-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /intake/responses/:responseId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/intake/responses/response-1")
      .send({ responseData: { field_1: "value" }, submit: false });

    expect(res.status).toBe(404);
  });

  it("PUT /intake/responses/:responseId submits response and updates assignment", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "response-1",
            assignment_id: "assign-1",
            started_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "response-1", status: "submitted" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/intake/responses/response-1")
      .send({ responseData: { field_1: "value" }, submit: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
  });

  it("GET /intake/history returns completed forms", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "history-1" }] });

    const res = await request(app).get("/intake/history");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
  });

  it("GET /intake/consents returns consents", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM portal_consent_forms") && sql.includes("ORDER BY is_required DESC")) {
        return Promise.resolve({ rows: [{ id: "consent-1" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/intake/consents");

    expect(res.status).toBe(200);
    expect(res.body.consents).toHaveLength(1);
  });

  it("GET /intake/consents/required returns required consents", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM portal_consent_forms cf") && sql.includes("is_required = true")) {
        return Promise.resolve({ rows: [{ id: "consent-1" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/intake/consents/required");

    expect(res.status).toBe(200);
    expect(res.body.requiredConsents).toHaveLength(1);
  });

  it("POST /intake/consents/:consentId/sign requires witness when needed", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "consent-1", content: "text", version: 1, requires_witness: true }],
    });

    const res = await request(app).post("/intake/consents/consent-1/sign").send({
      signatureData: "sig",
      signerName: "Pat",
      signerRelationship: "self",
    });

    expect(res.status).toBe(400);
  });

  it("POST /intake/consents/:consentId/sign stores signature", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "consent-1", content: "text", version: 1, requires_witness: false }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "sig-1", signedAt: new Date().toISOString() }] });

    const res = await request(app).post("/intake/consents/consent-1/sign").send({
      signatureData: "sig",
      signerName: "Pat",
      signerRelationship: "self",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("sig-1");
  });

  it("GET /intake/consents/signed returns signed consents", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM portal_consent_signatures")) {
        return Promise.resolve({
          rows: [
            {
              id: "signed-1",
              consentTitle: "HIPAA",
              consentType: "hipaa",
              signerName: "Pat",
              signerRelationship: "self",
              version: "1.0",
              signedAt: new Date().toISOString(),
              isValid: true,
            },
          ],
        });
      }
      if (sql.includes("information_schema.columns")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/intake/consents/signed");

    expect(res.status).toBe(200);
    expect(res.body.signedConsents).toHaveLength(1);
  });

  it("POST /intake/checkin rejects invalid payload", async () => {
    const res = await request(app).post("/intake/checkin").send({ appointmentId: "bad" });

    expect(res.status).toBe(400);
  });

  it("POST /intake/checkin returns 404 when appointment not eligible", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/intake/checkin")
      .send({ appointmentId: "2f0c2f0b-7b3a-4a4a-8dd3-2f2f0f0f0f0f" });

    expect(res.status).toBe(404);
  });

  it("POST /intake/checkin returns existing session", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "appt-1", location_id: "loc-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "session-1", status: "started" }] });

    const res = await request(app)
      .post("/intake/checkin")
      .send({ appointmentId: "2f0c2f0b-7b3a-4a4a-8dd3-2f2f0f0f0f0f" });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe("session-1");
  });

  it("POST /intake/checkin creates session", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "appt-1", location_id: "loc-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "session-2", status: "started", startedAt: new Date().toISOString() }],
      });

    const res = await request(app)
      .post("/intake/checkin")
      .send({ appointmentId: "2f0c2f0b-7b3a-4a4a-8dd3-2f2f0f0f0f0f" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("session-2");
  });

  it("PUT /intake/checkin/:sessionId rejects empty updates", async () => {
    const res = await request(app).put("/intake/checkin/session-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /intake/checkin/:sessionId completes session", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM portal_checkin_sessions") && sql.includes("appointment_id as")) {
        return Promise.resolve({ rows: [{ id: "session-1", appointmentId: "appt-1" }] });
      }
      if (sql.includes("FROM portal_consent_forms cf") && sql.includes("is_required = true")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("FROM portal_intake_form_assignments")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("UPDATE portal_checkin_sessions")) {
        return Promise.resolve({
          rows: [{ id: "session-1", status: "completed", completedAt: new Date().toISOString() }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .put("/intake/checkin/session-1")
      .send({ complete: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("POST /intake/checkin/:sessionId/upload-insurance returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/intake/checkin/session-1/upload-insurance")
      .send({ frontImageUrl: "front", backImageUrl: "back" });

    expect(res.status).toBe(404);
  });

  it("POST /intake/checkin/:sessionId/upload-insurance updates insurance cards", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "session-1" }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/intake/checkin/session-1/upload-insurance")
      .send({ frontImageUrl: "front", backImageUrl: "back" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
