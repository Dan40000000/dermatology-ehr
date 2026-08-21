import request from "supertest";
import express from "express";
import { collectionsRouter } from "../collections";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import * as collectionsService from "../../services/collectionsService";
import * as costEstimator from "../../services/costEstimator";
import { logger } from "../../lib/logger";

const mockAuthUser = { id: "user-1", tenantId: "tenant-1", role: "admin" };

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = mockAuthUser;
    return next();
  },
}));

// Exercise the route's real role middleware so denied staff roles cannot be
// hidden by a permissive test-only mock.
jest.mock("../../middleware/rbac", () => jest.requireActual("../../middleware/rbac"));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/collectionsService", () => ({
  getPatientBalance: jest.fn(),
  getCollectionTalkingPoints: jest.fn(),
  processPayment: jest.fn(),
  recordCollectionAttempt: jest.fn(),
  getAgingReport: jest.fn(),
  getPatientCollectionActivity: jest.fn(),
  createCollectionContactAttempt: jest.fn(),
  getCollectionStats: jest.fn(),
  updateCollectionStats: jest.fn(),
}));

jest.mock("../../services/costEstimator", () => ({
  createCostEstimate: jest.fn(),
  getEstimateByAppointment: jest.fn(),
  shareEstimateWithPatient: jest.fn(),
  revokeEstimate: jest.fn(),
  reviseEstimate: jest.fn(),
  recordEstimateEvent: jest.fn(),
  calculateEstimateReconciliation: jest.fn(),
  quickEstimate: jest.fn(),
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
app.use("/collections", collectionsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const collectionsMock = collectionsService as jest.Mocked<typeof collectionsService>;
const costEstimatorMock = costEstimator as jest.Mocked<typeof costEstimator>;
const loggerMock = logger as jest.Mocked<typeof logger>;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  mockAuthUser.role = "admin";
  queryMock.mockReset();
  connectMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  collectionsMock.getPatientBalance.mockReset();
  collectionsMock.getCollectionTalkingPoints.mockReset();
  collectionsMock.processPayment.mockReset();
  collectionsMock.recordCollectionAttempt.mockReset();
  collectionsMock.getAgingReport.mockReset();
  collectionsMock.getPatientCollectionActivity.mockReset();
  collectionsMock.createCollectionContactAttempt.mockReset();
  collectionsMock.getCollectionStats.mockReset();
  collectionsMock.updateCollectionStats.mockReset();
  costEstimatorMock.createCostEstimate.mockReset();
  costEstimatorMock.getEstimateByAppointment.mockReset();
  costEstimatorMock.shareEstimateWithPatient.mockReset();
  costEstimatorMock.revokeEstimate.mockReset();
  costEstimatorMock.reviseEstimate.mockReset();
  costEstimatorMock.recordEstimateEvent.mockReset();
  costEstimatorMock.calculateEstimateReconciliation.mockReset();
  costEstimatorMock.quickEstimate.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Collections routes", () => {
  it("GET /collections/patient/:id/balance logs sanitized Error failures", async () => {
    collectionsMock.getPatientBalance.mockRejectedValueOnce(new Error("balance query failed"));

    const res = await request(app).get("/collections/patient/p1/balance");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch patient balance");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient balance:", {
      error: "balance query failed",
    });
  });

  it("GET /collections/patient/:id/balance masks non-Error failures", async () => {
    collectionsMock.getPatientBalance.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const res = await request(app).get("/collections/patient/p1/balance");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch patient balance");
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient balance:", {
      error: "Unknown error",
    });
  });

  it("GET /collections/patient/:id/balance returns defaults when no balance", async () => {
    collectionsMock.getPatientBalance.mockResolvedValueOnce(null);
    const res = await request(app).get("/collections/patient/p1/balance");
    expect(res.status).toBe(200);
    expect(res.body.totalBalance).toBe(0);
    expect(res.body.hasPaymentPlan).toBe(false);
  });

  it("GET /collections/patient/:id/balance returns balance with talking points", async () => {
    collectionsMock.getPatientBalance.mockResolvedValueOnce({
      patientId: "p1",
      totalBalance: 100,
      currentBalance: 60,
      balance31_60: 20,
      balance61_90: 10,
      balanceOver90: 10,
      oldestChargeDate: "2025-01-01",
      lastPaymentDate: "2025-01-10",
      lastPaymentAmount: 50,
      hasPaymentPlan: true,
      hasAutopay: false,
    } as any);
    collectionsMock.getCollectionTalkingPoints.mockReturnValueOnce(["Call patient"]);
    const res = await request(app).get("/collections/patient/p1/balance");
    expect(res.status).toBe(200);
    expect(res.body.talkingPoints).toHaveLength(1);
  });

  it("POST /collections/payment rejects invalid payload", async () => {
    const res = await request(app).post("/collections/payment").send({});
    expect(res.status).toBe(400);
  });

  it("POST /collections/payment processes payment", async () => {
    collectionsMock.processPayment.mockResolvedValueOnce({
      paymentId: "pay-1",
      receiptNumber: "rcpt-1",
    } as any);
    collectionsMock.recordCollectionAttempt.mockResolvedValueOnce(undefined);

    const res = await request(app).post("/collections/payment").send({
      patientId: "p1",
      amount: 125,
      paymentMethod: "card",
      cardLastFour: "4242",
    });
    expect(res.status).toBe(200);
    expect(res.body.paymentId).toBe("pay-1");
    expect(auditLog).toHaveBeenCalled();
  });

  it("POST /collections/estimate rejects invalid payload", async () => {
    const res = await request(app).post("/collections/estimate").send({ patientId: "p1" });
    expect(res.status).toBe(400);
  });

  it("POST /collections/estimate creates estimate", async () => {
    costEstimatorMock.createCostEstimate.mockResolvedValueOnce({ id: "est-1" } as any);
    const res = await request(app).post("/collections/estimate").send({
      patientId: "p1",
      serviceType: "office",
      cptCodes: ["11111"],
    });
    expect(res.status).toBe(200);
    expect(res.body.estimate.id).toBe("est-1");
  });

  it("POST /collections/estimate identifies CPT codes without configured fees", async () => {
    const error = new Error("No fee is configured for CPT code: 99999") as Error & { codes: string[] };
    error.name = "UnpricedCptCodesError";
    error.codes = ["99999"];
    costEstimatorMock.createCostEstimate.mockRejectedValueOnce(error);

    const res = await request(app).post("/collections/estimate").send({
      patientId: "p1",
      serviceType: "office",
      cptCodes: ["99213", "99999"],
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "No fee is configured for CPT code: 99999",
      codes: ["99999"],
    });
  });

  it("GET /collections/estimate/:appointmentId returns 404 when missing", async () => {
    costEstimatorMock.getEstimateByAppointment.mockResolvedValueOnce(null);
    const res = await request(app).get("/collections/estimate/appt-1");
    expect(res.status).toBe(404);
  });

  it("GET /collections/estimate/:appointmentId returns estimate", async () => {
    costEstimatorMock.getEstimateByAppointment.mockResolvedValueOnce({ id: "est-2" } as any);
    const res = await request(app).get("/collections/estimate/appt-1");
    expect(res.status).toBe(200);
    expect(res.body.estimate.id).toBe("est-2");
  });

  it("POST /collections/estimate/:estimateId/share publishes the estimate to the patient portal", async () => {
    costEstimatorMock.shareEstimateWithPatient.mockResolvedValueOnce({
      patientId: "p1",
      sharedAt: "2026-08-03T18:00:00.000Z",
    });

    const res = await request(app).post("/collections/estimate/est-1/share").send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      estimateId: "est-1",
      patientId: "p1",
    });
    expect(costEstimatorMock.shareEstimateWithPatient).toHaveBeenCalledWith("tenant-1", "est-1", "user-1");
    expect(auditLog).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "cost_estimate_shared_with_patient",
      "cost_estimate",
      "est-1"
    );
  });

  it("POST /collections/estimate/:estimateId/share does not expose another tenant's estimate", async () => {
    costEstimatorMock.shareEstimateWithPatient.mockResolvedValueOnce(null);

    const res = await request(app).post("/collections/estimate/missing/share").send({});

    expect(res.status).toBe(404);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("POST /collections/estimate/:estimateId/revoke requires a reason and revokes", async () => {
    costEstimatorMock.revokeEstimate.mockResolvedValueOnce({ patientId: "p1" });
    const res = await request(app).post("/collections/estimate/est-1/revoke").send({ reason: "Procedure changed" });
    expect(res.status).toBe(200);
    expect(costEstimatorMock.revokeEstimate).toHaveBeenCalledWith("tenant-1", "est-1", "user-1", "Procedure changed");
  });

  it("POST /collections/estimate/:estimateId/revise creates a versioned replacement", async () => {
    costEstimatorMock.reviseEstimate.mockResolvedValueOnce({ id: "est-2", version: 2 } as any);
    const res = await request(app).post("/collections/estimate/est-1/revise").send({ cptCodes: ["99213"] });
    expect(res.status).toBe(201);
    expect(res.body.estimate).toMatchObject({ id: "est-2", version: 2 });
  });

  it.each([
    ["/collections/estimate", { patientId: "p1", serviceType: "office", cptCodes: ["11111"] }],
    ["/collections/estimate/est-1/share", {}],
    ["/collections/estimate/est-1/revoke", { reason: "Procedure changed" }],
    ["/collections/estimate/est-1/revise", { cptCodes: ["99213"] }],
  ])("rejects unauthorized estimate mutation at %s for a nurse", async (path, body) => {
    mockAuthUser.role = "nurse";

    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(403);
    expect(costEstimatorMock.createCostEstimate).not.toHaveBeenCalled();
    expect(costEstimatorMock.shareEstimateWithPatient).not.toHaveBeenCalled();
    expect(costEstimatorMock.revokeEstimate).not.toHaveBeenCalled();
    expect(costEstimatorMock.reviseEstimate).not.toHaveBeenCalled();
  });

  it("GET /collections/patient/:id/estimates scopes both tenant and patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/collections/patient/patient-b/estimates");

    expect(res.status).toBe(200);
    expect(res.body.estimates).toEqual([]);
    expect(queryMock.mock.calls[0][0]).toMatch(/WHERE ce\.tenant_id = \$1 AND ce\.patient_id = \$2/i);
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "patient-b"]);
  });

  it("GET /collections/estimate/:id/events scopes estimate history to the signed-in tenant", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/collections/estimate/estimate-from-other-tenant/events");

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    expect(queryMock.mock.calls[0][0]).toMatch(/e\.tenant_id = \$1 AND e\.estimate_id = \$2/i);
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "estimate-from-other-tenant"]);
  });

  it("POST /collections/estimate/quick requires patient and procedure", async () => {
    const res = await request(app).post("/collections/estimate/quick").send({});
    expect(res.status).toBe(400);
  });

  it("POST /collections/estimate/quick returns estimate", async () => {
    costEstimatorMock.quickEstimate.mockResolvedValueOnce({ total: 200 } as any);
    const res = await request(app).post("/collections/estimate/quick").send({
      patientId: "p1",
      procedureType: "biopsy",
    });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(200);
  });

  it("POST /collections/payment-plan rejects invalid payload", async () => {
    const res = await request(app).post("/collections/payment-plan").send({ patientId: "p1" });
    expect(res.status).toBe(400);
  });

  it("POST /collections/payment-plan creates payment plan", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/collections/payment-plan").send({
      patientId: "p1",
      totalAmount: 600,
      monthlyPayment: 100,
      numberOfPayments: 6,
      startDate: "2025-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /collections/payment-plans returns plans", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "plan-1" }] });
    const res = await request(app).get("/collections/payment-plans");
    expect(res.status).toBe(200);
    expect(res.body.paymentPlans).toHaveLength(1);
  });

  it("GET /collections/aging returns aging report", async () => {
    collectionsMock.getAgingReport.mockResolvedValueOnce({ total: 10 } as any);
    const res = await request(app).get("/collections/aging");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
  });

  it("GET /collections/patient/:id/activity returns collection timeline", async () => {
    collectionsMock.getPatientCollectionActivity.mockResolvedValueOnce({
      balance: { patientId: "p1", totalBalance: 125 },
      attempts: [{ id: "attempt-1", outcome: "promise_to_pay" }],
    } as any);

    const res = await request(app).get("/collections/patient/p1/activity");

    expect(res.status).toBe(200);
    expect(res.body.attempts).toHaveLength(1);
    expect(collectionsMock.getPatientCollectionActivity).toHaveBeenCalledWith("tenant-1", "p1");
  });

  it("POST /collections/patient/:id/contact-attempts rejects invalid payload", async () => {
    const res = await request(app).post("/collections/patient/p1/contact-attempts").send({
      contactMethod: "fax",
      outcome: "spoke_patient",
    });

    expect(res.status).toBe(400);
  });

  it("POST /collections/patient/:id/contact-attempts creates a contact note", async () => {
    collectionsMock.createCollectionContactAttempt.mockResolvedValueOnce("attempt-1");

    const res = await request(app).post("/collections/patient/p1/contact-attempts").send({
      contactMethod: "phone",
      contactDirection: "outbound",
      outcome: "promise_to_pay",
      patientResponse: "Patient will pay Friday",
      notes: "Follow up if not paid",
      nextFollowUpDate: "2026-07-20",
      patientPromisedAmount: 75,
      patientPromisedDate: "2026-07-17",
      paymentPlanDiscussed: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("attempt-1");
    expect(collectionsMock.createCollectionContactAttempt).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        patientId: "p1",
        attemptedBy: "user-1",
        outcome: "promise_to_pay",
      })
    );
    expect(auditLog).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "collection_contact_attempt_create",
      "collection_attempt",
      "attempt-1"
    );
  });

  it("GET /collections/stats requires dates", async () => {
    const res = await request(app).get("/collections/stats");
    expect(res.status).toBe(400);
  });

  it("GET /collections/stats returns summary", async () => {
    collectionsMock.getCollectionStats.mockResolvedValueOnce([
      {
        totalCharges: 1000,
        totalCollected: 600,
        collectedAtCheckin: 200,
        collectedAtCheckout: 100,
      },
    ] as any);
    const res = await request(app).get("/collections/stats?startDate=2025-01-01&endDate=2025-01-31");
    expect(res.status).toBe(200);
    expect(res.body.summary.totalCollected).toBe(600);
    expect(res.body.summary.overallCollectionRate).toBeGreaterThan(0);
  });

  it("POST /collections/stats/update requires date", async () => {
    const res = await request(app).post("/collections/stats/update").send({});
    expect(res.status).toBe(400);
  });

  it("POST /collections/stats/update triggers update", async () => {
    collectionsMock.updateCollectionStats.mockResolvedValueOnce(undefined);
    const res = await request(app).post("/collections/stats/update").send({ date: "2025-01-01" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /collections/statement/:patientId rejects when no balance", async () => {
    collectionsMock.getPatientBalance.mockResolvedValueOnce(null);
    const res = await request(app).post("/collections/statement/p1").send({ deliveryMethod: "mail" });
    expect(res.status).toBe(400);
  });

  it("POST /collections/statement/:patientId creates statement", async () => {
    collectionsMock.getPatientBalance.mockResolvedValueOnce({
      totalBalance: 200,
      currentBalance: 100,
      balance31_60: 50,
      balance61_90: 25,
      balanceOver90: 25,
    } as any);
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/collections/statement/p1").send({ deliveryMethod: "email" });
    expect(res.status).toBe(201);
    expect(res.body.statementNumber).toBeTruthy();
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /collections/statements/:patientId returns statements", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "stmt-1" }] });
    const res = await request(app).get("/collections/statements/p1");
    expect(res.status).toBe(200);
    expect(res.body.statements).toHaveLength(1);
  });
});
