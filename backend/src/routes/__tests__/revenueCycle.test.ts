import request from "supertest";
import express from "express";
import { revenueCycleRouter } from "../revenueCycle";
import { revenueCycleService } from "../../services/revenueCycleService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/revenueCycleService", () => ({
  revenueCycleService: {
    captureCharges: jest.fn(),
  },
  DenialCategory: {
    ELIGIBILITY: "eligibility",
    AUTHORIZATION: "authorization",
    CODING: "coding",
    DOCUMENTATION: "documentation",
    DUPLICATE: "duplicate",
    TIMELY_FILING: "timely_filing",
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
app.use("/revenue-cycle", revenueCycleRouter);

const revenueCycleServiceMock = revenueCycleService as jest.Mocked<typeof revenueCycleService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

const baseCapturePayload = {
  encounterId: "11111111-1111-4111-8111-111111111111",
  patientId: "22222222-2222-4222-8222-222222222222",
  cptCodes: [{ code: "99213", units: 1 }],
  icdCodes: [{ code: "L57.0", isPrimary: true }],
};

describe("Revenue cycle routes", () => {
  beforeEach(() => {
    revenueCycleServiceMock.captureCharges.mockReset();
    loggerMock.error.mockReset();
  });

  it("POST /revenue-cycle/charges logs sanitized Error failures", async () => {
    revenueCycleServiceMock.captureCharges.mockRejectedValueOnce(new Error("capture failed"));

    const res = await request(app).post("/revenue-cycle/charges").send(baseCapturePayload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("capture failed");
    expect(loggerMock.error).toHaveBeenCalledWith("Error capturing charges:", {
      error: "capture failed",
    });
  });

  it("POST /revenue-cycle/charges masks non-Error failures", async () => {
    revenueCycleServiceMock.captureCharges.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).post("/revenue-cycle/charges").send(baseCapturePayload);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to capture charges");
    expect(loggerMock.error).toHaveBeenCalledWith("Error capturing charges:", {
      error: "Unknown error",
    });
  });
});
