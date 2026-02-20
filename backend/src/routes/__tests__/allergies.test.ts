import request from "supertest";
import express from "express";
import { allergiesRouter } from "../allergies";
import { allergyAlertService } from "../../services/allergyAlertService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/allergyAlertService", () => ({
  allergyAlertService: {
    getPatientAllergies: jest.fn(),
  },
  AllergenType: {},
  AllergySeverity: {},
  AllergyStatus: {},
  AlertAction: {},
  AlertType: {},
  AlertSeverity: {},
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
app.use("/allergies", allergiesRouter);

const allergyAlertServiceMock = allergyAlertService as jest.Mocked<typeof allergyAlertService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

describe("Allergies routes", () => {
  beforeEach(() => {
    allergyAlertServiceMock.getPatientAllergies.mockReset();
    loggerMock.error.mockReset();
  });

  it("GET /allergies/patient/:patientId logs sanitized Error failures", async () => {
    allergyAlertServiceMock.getPatientAllergies.mockRejectedValueOnce(new Error("allergy lookup failed"));

    const res = await request(app).get("/allergies/patient/patient-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch patient allergies");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient allergies:", {
      error: "allergy lookup failed",
    });
  });

  it("GET /allergies/patient/:patientId masks non-Error failures", async () => {
    allergyAlertServiceMock.getPatientAllergies.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/allergies/patient/patient-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch patient allergies");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient allergies:", {
      error: "Unknown error",
    });
  });
});
