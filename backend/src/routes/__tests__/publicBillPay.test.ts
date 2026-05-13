import request from "supertest";
import express from "express";
import { publicBillPayRouter } from "../publicBillPay";
import { pool } from "../../db/pool";

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "public-payment-uuid"),
  randomBytes: jest.fn((size: number) => ({
    toString: () => "b".repeat(size * 2),
  })),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
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
app.use("/public-bill-pay", publicBillPayRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const clientQueryMock = jest.fn();
const clientReleaseMock = jest.fn();

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  clientQueryMock.mockReset();
  clientReleaseMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  clientQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  connectMock.mockResolvedValue({ query: clientQueryMock, release: clientReleaseMock });
});

describe("Public bill pay routes", () => {
  it("looks up a bill by pay code", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        billNumber: "BILL-2026-000001",
        billPayCode: "1000029",
        billDate: "2026-05-11",
        dueDate: "2026-06-10",
        patientResponsibilityCents: 12500,
        paidAmountCents: 2500,
        balanceCents: 10000,
        status: "partial",
        patientFirstName: "Mason",
        patientLastName: "Ramirez",
        accountNumber: "ACCT-000059",
      }],
    });

    const res = await request(app).get("/public-bill-pay/lookup?code=100-0029&accountVerifier=0059");

    expect(res.status).toBe(200);
    expect(res.body.bill.billPayCode).toBe("1000029");
    expect(res.body.bill.balanceCents).toBe(10000);
    expect(res.body.bill.patientDisplayName).toBe("M. Ramirez");
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("b.bill_pay_code = $1"), ["1000029", "0059"]);
  });

  it("requires account verification for lookup", async () => {
    const res = await request(app).get("/public-bill-pay/lookup?code=1000029");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("posts a public payment to the bill ledger", async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          billId: "bill-1",
          tenantId: "tenant-1",
          patientId: "patient-1",
          billNumber: "BILL-2026-000001",
          billPayCode: "1000029",
          balanceCents: 10000,
          patientResponsibilityCents: 12500,
          paidAmountCents: 2500,
          status: "partial",
          patientFirstName: "Mason",
          patientLastName: "Ramirez",
          accountNumber: "ACCT-000059",
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // portal transaction
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "bill-1",
          patient_responsibility_cents: 12500,
          paid_amount_cents: 2500,
          adjustment_amount_cents: 0,
          balance_cents: 10000,
        }],
      }) // ledger bill lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // patient payment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // bill update
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          billNumber: "BILL-2026-000001",
          billPayCode: "1000029",
          balanceCents: 5000,
          patientResponsibilityCents: 12500,
          paidAmountCents: 7500,
          status: "partial",
          patientFirstName: "Mason",
          patientLastName: "Ramirez",
          accountNumber: "ACCT-000059",
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const res = await request(app)
      .post("/public-bill-pay/pay")
      .send({ code: "1000029", accountVerifier: "0059", amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bill.balanceCents).toBe(5000);
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO patient_payments"),
      expect.arrayContaining(["tenant-1", "patient-1", 5000]),
    );
  });

  it("requires account verification before posting payment", async () => {
    const res = await request(app)
      .post("/public-bill-pay/pay")
      .send({ code: "1000029", amount: 50 });

    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
