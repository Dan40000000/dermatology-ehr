import request from "supertest";
import express from "express";
import { consentsRouter } from "../consents";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import * as consentService from "../../services/consentService";

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
  auditLog: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../services/consentService", () => ({
  getRequiredConsents: jest.fn(),
  createConsentSession: jest.fn(),
  getSessionByToken: jest.fn(),
  updateSessionFieldValues: jest.fn(),
  captureSignature: jest.fn(),
  generateSignedPDF: jest.fn(),
  validateSignature: jest.fn(),
  getPatientConsentHistory: jest.fn(),
  getConsentById: jest.fn(),
  revokeConsent: jest.fn(),
  getTemplateWithFields: jest.fn(),
  logConsentAction: jest.fn(),
  getConsentAuditHistory: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/consents", consentsRouter);

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;
const captureSignatureMock = consentService.captureSignature as jest.Mock;
const generateSignedPDFMock = consentService.generateSignedPDF as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  captureSignatureMock.mockReset();
  captureSignatureMock.mockResolvedValue({ id: "consent-1" });
  generateSignedPDFMock.mockReset();
  generateSignedPDFMock.mockResolvedValue(undefined);
  loggerMock.error.mockReset();
});

describe("Consents routes", () => {
  it("GET /consents/templates logs sanitized Error messages", async () => {
    queryMock.mockRejectedValueOnce(new Error("db fail"));

    const res = await request(app).get("/consents/templates");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch consent templates");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching consent templates", {
      error: "db fail",
    });
  });

  it("GET /consents/templates masks non-Error thrown values", async () => {
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe", encounterId: "enc-1" });

    const res = await request(app).get("/consents/templates");

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching consent templates", {
      error: "Unknown error",
    });
  });

  it("POST /consents/sign logs safe message when PDF generation fails", async () => {
    generateSignedPDFMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).post("/consents/sign").send({
      sessionId: "2f0c2f0b-7b3a-4a4a-8dd3-2f2f0f0f0f0f",
      signatureData: "base64-signature",
    });

    expect(res.status).toBe(200);
    expect(res.body.consent.id).toBe("consent-1");
    expect(loggerMock.error).toHaveBeenCalledWith("Error generating PDF", {
      error: "Unknown error",
    });
  });

  it("POST /consents/sign logs sanitized service failures", async () => {
    captureSignatureMock.mockRejectedValueOnce(new Error("sign fail"));

    const res = await request(app).post("/consents/sign").send({
      sessionId: "2f0c2f0b-7b3a-4a4a-8dd3-2f2f0f0f0f0f",
      signatureData: "base64-signature",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("sign fail");
    expect(loggerMock.error).toHaveBeenCalledWith("Error signing consent", {
      error: "sign fail",
    });
  });
});
