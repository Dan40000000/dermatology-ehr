import request from "supertest";
import express from "express";
import { cosmeticRouter } from "../cosmetic";
import { cosmeticService } from "../../services/cosmeticService";
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

jest.mock("../../services/cosmeticService", () => ({
  cosmeticService: {
    getServices: jest.fn(),
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
app.use("/cosmetic", cosmeticRouter);

const cosmeticServiceMock = cosmeticService as jest.Mocked<typeof cosmeticService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

describe("Cosmetic routes", () => {
  beforeEach(() => {
    cosmeticServiceMock.getServices.mockReset();
    loggerMock.error.mockReset();
  });

  it("GET /cosmetic/services returns services", async () => {
    cosmeticServiceMock.getServices.mockResolvedValueOnce([{ id: "svc-1", name: "Botox" }] as any);

    const res = await request(app).get("/cosmetic/services");

    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
  });

  it("GET /cosmetic/services logs sanitized Error failures", async () => {
    cosmeticServiceMock.getServices.mockRejectedValueOnce(new Error("service lookup failed"));

    const res = await request(app).get("/cosmetic/services");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("service lookup failed");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching cosmetic services:", {
      error: "service lookup failed",
    });
  });

  it("GET /cosmetic/services masks non-Error failures", async () => {
    cosmeticServiceMock.getServices.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/cosmetic/services");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Unknown error");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching cosmetic services:", {
      error: "Unknown error",
    });
  });
});
