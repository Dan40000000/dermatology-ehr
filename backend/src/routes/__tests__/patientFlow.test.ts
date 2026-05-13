import request from "supertest";
import express from "express";
import { patientFlowRouter } from "../patientFlow";
import { patientFlowService } from "../../services/patientFlowService";
import { auditLog } from "../../services/audit";
import { pool } from "../../db/pool";
import { workflowOrchestrator } from "../../services/workflowOrchestrator";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    req.tenantId = "tenant-1";
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/patientFlowService", () => ({
  patientFlowService: {
    updatePatientStatus: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/workflowOrchestrator", () => ({
  workflowOrchestrator: {
    processEvent: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/patient-flow", patientFlowRouter);

const serviceMock = patientFlowService as jest.Mocked<typeof patientFlowService>;
const queryMock = pool.query as jest.Mock;
const workflowMock = workflowOrchestrator as jest.Mocked<typeof workflowOrchestrator>;

beforeEach(() => {
  serviceMock.updatePatientStatus.mockReset();
  queryMock.mockReset();
  workflowMock.processEvent.mockReset();
  (auditLog as jest.Mock).mockReset();
});

describe("Patient flow routes", () => {
  it("moves completed requests to checkout first", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "with_provider" }], rowCount: 1 });
    serviceMock.updatePatientStatus.mockResolvedValueOnce({
      id: "flow-1",
      status: "checkout",
    } as any);

    const res = await request(app)
      .put("/patient-flow/apt-1/status")
      .send({ status: "completed", notes: "Provider done" });

    expect(res.status).toBe(200);
    expect(res.body.requiresCheckoutReview).toBe(true);
    expect(res.body.flow.status).toBe("checkout");
    expect(serviceMock.updatePatientStatus).toHaveBeenCalledWith("tenant-1", "apt-1", "checkout", {
      roomId: undefined,
      userId: "user-1",
      notes: "Provider done",
    });
    expect(workflowMock.processEvent).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "checkout_required_before_completion",
      "patient_flow",
      "flow-1",
    );
  });

  it("completes only after the appointment is already in checkout", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "checkout" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ bill_count: 0, balance_cents: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ balance_cents: 0 }], rowCount: 1 });
    serviceMock.updatePatientStatus.mockResolvedValueOnce({
      id: "flow-1",
      status: "completed",
    } as any);
    workflowMock.processEvent.mockResolvedValueOnce(undefined as any);

    const res = await request(app).put("/patient-flow/apt-1/status").send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(serviceMock.updatePatientStatus).toHaveBeenCalledWith("tenant-1", "apt-1", "completed", {
      roomId: undefined,
      userId: "user-1",
      notes: undefined,
    });
    expect(workflowMock.processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "appointment_checkout",
        entityId: "apt-1",
      }),
    );
    expect(auditLog).toHaveBeenCalledWith("tenant-1", "user-1", "update_flow_status", "patient_flow", "flow-1");
  });

  it("blocks completion from checkout when a balance is still due", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "checkout" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ bill_count: 1, balance_cents: 7500 }], rowCount: 1 });

    const res = await request(app).put("/patient-flow/apt-1/status").send({ status: "completed" });

    expect(res.status).toBe(409);
    expect(res.body.requiresPayment).toBe(true);
    expect(res.body.paymentDueCents).toBe(7500);
    expect(serviceMock.updatePatientStatus).not.toHaveBeenCalled();
  });
});
