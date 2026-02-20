import request from "supertest";
import express from "express";
import { superbillsRouter } from "../superbills";
import { superbillService } from "../../services/superbillService";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "billing" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/superbillService", () => ({
  superbillService: {
    getSuperbillDetails: jest.fn(),
  },
  SuperbillStatus: {
    DRAFT: "draft",
    PENDING_REVIEW: "pending_review",
    APPROVED: "approved",
    FINALIZED: "finalized",
    SUBMITTED: "submitted",
    VOID: "void",
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
app.use("/superbills", superbillsRouter);

const superbillServiceMock = superbillService as jest.Mocked<typeof superbillService>;
const loggerMock = logger as jest.Mocked<typeof logger>;

describe("Superbills routes", () => {
  beforeEach(() => {
    superbillServiceMock.getSuperbillDetails.mockReset();
    loggerMock.error.mockReset();
  });

  it("GET /superbills/:id logs sanitized Error failures", async () => {
    superbillServiceMock.getSuperbillDetails.mockRejectedValueOnce(new Error("superbill lookup failed"));

    const res = await request(app).get("/superbills/sb-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch superbill");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching superbill:", {
      error: "superbill lookup failed",
    });
  });

  it("GET /superbills/:id masks non-Error failures", async () => {
    superbillServiceMock.getSuperbillDetails.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/superbills/sb-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch superbill");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching superbill:", {
      error: "Unknown error",
    });
  });
});
