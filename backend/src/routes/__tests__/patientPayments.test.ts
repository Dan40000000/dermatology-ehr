import request from "supertest";
import express from "express";
import { patientPaymentsRouter } from "../patientPayments";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

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

const app = express();
app.use(express.json());
app.use("/patient-payments", patientPaymentsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  (auditLog as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Patient payments routes", () => {
  it("GET /patient-payments returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }] });
    const res = await request(app).get("/patient-payments");
    expect(res.status).toBe(200);
    expect(res.body.patientPayments).toHaveLength(1);
  });

  it("GET /patient-payments supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }] });
    const res = await request(app).get("/patient-payments").query({
      patientId: "patient-1",
      status: "posted",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      paymentMethod: "credit",
      batchId: "batch-1",
    });
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("pp.batch_id"),
      expect.arrayContaining(["tenant-1", "patient-1", "posted", "2025-01-01", "2025-01-31", "credit", "batch-1"])
    );
  });

  it("GET /patient-payments/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get("/patient-payments/pay-1");
    expect(res.status).toBe(404);
  });

  it("GET /patient-payments/:id returns payment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }], rowCount: 1 });
    const res = await request(app).get("/patient-payments/pay-1");
    expect(res.status).toBe(200);
    expect(res.body.payment.id).toBe("pay-1");
  });

  it("POST /patient-payments rejects invalid payload", async () => {
    const res = await request(app).post("/patient-payments").send({ patientId: "patient-1" });
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments creates payment with claim and batch updates", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // receipt count
      .mockResolvedValueOnce({ rows: [] }) // insert payment
      .mockResolvedValueOnce({ rows: [{ totalCents: 1000 }], rowCount: 1 }) // claim total
      .mockResolvedValueOnce({ rows: [{ totalPaid: "1000" }] }) // claim payments
      .mockResolvedValueOnce({ rows: [] }) // update claim status
      .mockResolvedValueOnce({ rows: [] }) // insert claim history
      .mockResolvedValueOnce({ rows: [] }) // update batch count
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/patient-payments").send({
      patientId: "patient-1",
      paymentDate: "2025-01-01",
      amountCents: 1000,
      paymentMethod: "credit",
      appliedToClaimId: "claim-1",
      batchId: "batch-1",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.receiptNumber).toBeTruthy();
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /patient-payments/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).put("/patient-payments/pay-1").send({ notes: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT /patient-payments/:id rejects empty updates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }], rowCount: 1 });
    const res = await request(app).put("/patient-payments/pay-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /patient-payments/:id updates payment", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/patient-payments/pay-1").send({ notes: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("PUT /patient-payments/:id updates all fields", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pay-1" }], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/patient-payments/pay-1").send({
      paymentDate: "2025-01-02",
      amountCents: 1500,
      paymentMethod: "debit",
      cardLastFour: "1234",
      checkNumber: "CHK-1",
      referenceNumber: "REF-1",
      status: "posted",
      notes: "Updated",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /patient-payments/:id returns 404 when missing", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // payment info
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/patient-payments/pay-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /patient-payments/:id voids payment and recalculates claim", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ batch_id: "batch-1", applied_to_claim_id: "claim-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] }) // void payment
      .mockResolvedValueOnce({ rows: [] }) // update batch
      .mockResolvedValueOnce({ rows: [{ totalCents: 500 }], rowCount: 1 }) // claim total
      .mockResolvedValueOnce({ rows: [{ totalPaid: "200" }] }) // total paid
      .mockResolvedValueOnce({ rows: [] }) // update claim status
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/patient-payments/pay-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLog).toHaveBeenCalled();
  });

  it("GET /patient-payments/plans/list returns plans", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "plan-1" }] });
    const res = await request(app).get("/patient-payments/plans/list");
    expect(res.status).toBe(200);
    expect(res.body.paymentPlans).toHaveLength(1);
  });

  it("GET /patient-payments/plans/list handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).get("/patient-payments/plans/list");
    expect(res.status).toBe(500);
  });

  it("POST /patient-payments/plans rejects invalid payload", async () => {
    const res = await request(app).post("/patient-payments/plans").send({ patientId: "patient-1" });
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/plans creates plan", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/patient-payments/plans").send({
      patientId: "patient-1",
      totalAmountCents: 1000,
      installmentAmountCents: 250,
      frequency: "monthly",
      startDate: "2025-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /patient-payments/plans handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).post("/patient-payments/plans").send({
      patientId: "patient-1",
      totalAmountCents: 1000,
      installmentAmountCents: 250,
      frequency: "monthly",
      startDate: "2025-01-01",
    });
    expect(res.status).toBe(500);
  });

  it("POST /patient-payments/plans/:id/pay validates amount", async () => {
    const res = await request(app).post("/patient-payments/plans/plan-1/pay").send({ amountCents: 0 });
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/plans/:id/pay returns 404 when plan missing", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // plan lookup
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/patient-payments/plans/plan-1/pay").send({ amountCents: 100 });
    expect(res.status).toBe(404);
  });

  it("POST /patient-payments/plans/:id/pay rejects inactive plan", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: "cancelled" }], rowCount: 1 }) // plan lookup
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/patient-payments/plans/plan-1/pay").send({ amountCents: 100 });
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/plans/:id/pay processes payment", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            status: "active",
            patient_id: "patient-1",
            paid_amount_cents: 500,
            remaining_amount_cents: 500,
            frequency: "monthly",
            next_payment_date: "2025-01-01",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] }) // insert payment
      .mockResolvedValueOnce({ rows: [] }) // update plan
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/patient-payments/plans/plan-1/pay").send({
      amountCents: 500,
      paymentMethod: "credit",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.planStatus).toBe("completed");
  });

  it("PUT /patient-payments/plans/:id/cancel returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).put("/patient-payments/plans/plan-1/cancel").send({});
    expect(res.status).toBe(404);
  });

  it("PUT /patient-payments/plans/:id/cancel cancels plan", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "plan-1" }], rowCount: 1 });
    const res = await request(app).put("/patient-payments/plans/plan-1/cancel").send({ reason: "Patient request" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /patient-payments/text-to-pay/send validates required fields", async () => {
    const res = await request(app).post("/patient-payments/text-to-pay/send").send({});
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/text-to-pay/send returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).post("/patient-payments/text-to-pay/send").send({
      patientId: "patient-1",
      amountCents: 100,
    });
    expect(res.status).toBe(404);
  });

  it("POST /patient-payments/text-to-pay/send rejects missing phone", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1", phone: null }], rowCount: 1 });
    const res = await request(app).post("/patient-payments/text-to-pay/send").send({
      patientId: "patient-1",
      amountCents: 100,
    });
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/text-to-pay/send creates link", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1", phone: "555-111-2222" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/patient-payments/text-to-pay/send").send({
      patientId: "patient-1",
      amountCents: 100,
      message: "Pay now",
    });
    expect(res.status).toBe(200);
    expect(res.body.paymentLink).toContain("https://pay.dermapp.com/");
    expect(res.body.sentTo).toBe("555-111-2222");
  });

  it("GET /patient-payments/text-to-pay/list returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "link-1" }] });
    const res = await request(app).get("/patient-payments/text-to-pay/list");
    expect(res.status).toBe(200);
    expect(res.body.textToPayLinks).toHaveLength(1);
  });

  it("GET /patient-payments/saved-methods/:patientId returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "method-1" }] });
    const res = await request(app).get("/patient-payments/saved-methods/patient-1");
    expect(res.status).toBe(200);
    expect(res.body.savedMethods).toHaveLength(1);
  });

  it("POST /patient-payments/saved-methods validates required fields", async () => {
    const res = await request(app).post("/patient-payments/saved-methods").send({});
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/saved-methods creates method", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // unset defaults
      .mockResolvedValueOnce({ rows: [] }) // insert method
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/patient-payments/saved-methods").send({
      patientId: "patient-1",
      methodType: "card",
      lastFour: "1234",
      isDefault: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("PUT /patient-payments/saved-methods/:id/autopay returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).put("/patient-payments/saved-methods/method-1/autopay").send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it("PUT /patient-payments/saved-methods/:id/autopay toggles", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "method-1" }], rowCount: 1 });
    const res = await request(app).put("/patient-payments/saved-methods/method-1/autopay").send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /patient-payments/saved-methods/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).delete("/patient-payments/saved-methods/method-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /patient-payments/saved-methods/:id deactivates method", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "method-1" }], rowCount: 1 });
    const res = await request(app).delete("/patient-payments/saved-methods/method-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /patient-payments/quick-pay/create validates required fields", async () => {
    const res = await request(app).post("/patient-payments/quick-pay/create").send({});
    expect(res.status).toBe(400);
  });

  it("POST /patient-payments/quick-pay/create creates link", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/patient-payments/quick-pay/create").send({
      patientId: "patient-1",
      amountCents: 250,
      description: "Follow-up copay",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.linkCode).toBeTruthy();
    expect(res.body.paymentLink).toContain("https://pay.dermapp.com/q/");
  });

  it("GET /patient-payments/quick-pay/list returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "link-1" }] });
    const res = await request(app).get("/patient-payments/quick-pay/list");
    expect(res.status).toBe(200);
    expect(res.body.quickPayLinks).toHaveLength(1);
  });
});
