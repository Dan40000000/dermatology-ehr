import request from "supertest";
import express from "express";
import { collectionsRouter } from "../collections";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import * as collectionsService from "../../services/collectionsService";
import * as costEstimator from "../../services/costEstimator";
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
  getCollectionStats: jest.fn(),
  updateCollectionStats: jest.fn(),
}));

jest.mock("../../services/costEstimator", () => ({
  createCostEstimate: jest.fn(),
  getEstimateByAppointment: jest.fn(),
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
  queryMock.mockReset();
  connectMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  collectionsMock.getPatientBalance.mockReset();
  collectionsMock.getCollectionTalkingPoints.mockReset();
  collectionsMock.processPayment.mockReset();
  collectionsMock.recordCollectionAttempt.mockReset();
  collectionsMock.getAgingReport.mockReset();
  collectionsMock.getCollectionStats.mockReset();
  collectionsMock.updateCollectionStats.mockReset();
  costEstimatorMock.createCostEstimate.mockReset();
  costEstimatorMock.getEstimateByAppointment.mockReset();
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
