import request from "supertest";
import express from "express";
import { portalBillingRouter } from "../portalBilling";
import { pool } from "../../db/pool";

// Mock crypto with requireActual to preserve createHash
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "mock-uuid-billing-1234"),
  randomBytes: jest.fn((size: number) => ({
    toString: (encoding: string) => "a".repeat(size * 2),
  })),
}));

jest.mock("../../middleware/patientPortalAuth", () => ({
  requirePatientAuth: (req: any, _res: any, next: any) => {
    req.patient = {
      accountId: "account-1",
      patientId: "patient-1",
      tenantId: "tenant-1",
      email: "patient@example.com",
    };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/portal-billing", portalBillingRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Portal Billing routes", () => {
  describe("GET /portal-billing/balance", () => {
    it("returns patient balance", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            totalCharges: 500.0,
            totalPayments: 200.0,
            totalAdjustments: 50.0,
            currentBalance: 250.0,
            lastPaymentDate: "2024-01-15",
            lastPaymentAmount: 100.0,
          },
        ],
      });

      const res = await request(app).get("/portal-billing/balance");

      expect(res.status).toBe(200);
      expect(res.body.totalCharges).toBe(500.0);
      expect(res.body.currentBalance).toBe(250.0);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("FROM portal_patient_balances"),
        ["patient-1", "tenant-1"]
      );
    });

    it("initializes balance when not found", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/balance");

      expect(res.status).toBe(200);
      expect(res.body.totalCharges).toBe(0);
      expect(res.body.currentBalance).toBe(0);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_patient_balances"),
        ["tenant-1", "patient-1", 0, 0, 0]
      );
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/balance");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get balance");
    });
  });

  describe("GET /portal-billing/charges", () => {
    it("returns patient charges with provider info", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "charge-1",
            serviceDate: "2024-01-10",
            description: "Office Visit",
            amount: 150.0,
            transactionType: "charge",
            providerName: "Dr. Smith",
          },
          {
            id: "charge-2",
            serviceDate: "2024-01-05",
            description: "Lab Work",
            amount: 75.0,
            transactionType: "charge",
            providerName: "Dr. Jones",
          },
        ],
      });

      const res = await request(app).get("/portal-billing/charges");

      expect(res.status).toBe(200);
      expect(res.body.charges).toHaveLength(2);
      expect(res.body.charges[0].id).toBe("charge-1");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("FROM charges c"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns empty array when no charges", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/charges");

      expect(res.status).toBe(200);
      expect(res.body.charges).toHaveLength(0);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/charges");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get charges");
    });
  });

  describe("GET /portal-billing/payment-methods", () => {
    it("returns saved payment methods", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pm-1",
            paymentType: "credit_card",
            lastFour: "4242",
            cardBrand: "visa",
            cardholderName: "John Doe",
            expiryMonth: 12,
            expiryYear: 2025,
            isDefault: true,
          },
          {
            id: "pm-2",
            paymentType: "bank_account",
            lastFour: "1234",
            bankName: "Chase",
            accountType: "checking",
            isDefault: false,
          },
        ],
      });

      const res = await request(app).get("/portal-billing/payment-methods");

      expect(res.status).toBe(200);
      expect(res.body.paymentMethods).toHaveLength(2);
      expect(res.body.paymentMethods[0].isDefault).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("WHERE patient_id = $1 AND tenant_id = $2 AND is_active = true"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns empty array when no payment methods", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/payment-methods");

      expect(res.status).toBe(200);
      expect(res.body.paymentMethods).toHaveLength(0);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/payment-methods");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get payment methods");
    });
  });

  describe("POST /portal-billing/payment-methods", () => {
    const validCreditCardPayload = {
      paymentType: "credit_card",
      cardNumber: "4242424242424242",
      cardBrand: "visa",
      expiryMonth: 12,
      expiryYear: 2025,
      cardholderName: "John Doe",
      billingAddress: {
        street: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        country: "US",
      },
      setAsDefault: false,
    };

    it("adds a credit card payment method", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "pm-123",
            paymentType: "credit_card",
            lastFour: "4242",
            cardBrand: "visa",
            isDefault: false,
          },
        ],
      });

      const res = await request(app)
        .post("/portal-billing/payment-methods")
        .send(validCreditCardPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("pm-123");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_payment_methods"),
        expect.arrayContaining([
          "tenant-1",
          "patient-1",
          "credit_card",
          expect.stringMatching(/^tok_/),
          "stripe",
          "4242",
          "visa",
          undefined,
          undefined,
          "John Doe",
          12,
          2025,
          expect.any(String),
          false,
        ])
      );
    });

    it("adds ACH/bank account payment method", async () => {
      const achPayload = {
        paymentType: "ach",
        accountType: "checking",
        bankName: "Chase Bank",
        routingNumber: "110000000",
        accountNumber: "000123456789",
        cardholderName: "John Doe",
        billingAddress: {
          street: "123 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
        },
      };

      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pm-456", paymentType: "ach" }],
      });

      const res = await request(app)
        .post("/portal-billing/payment-methods")
        .send(achPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("pm-456");
    });

    it("sets as default and unsets other defaults", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] }) // unset defaults
        .mockResolvedValueOnce({
          rows: [{ id: "pm-789", isDefault: true }],
        });

      const res = await request(app)
        .post("/portal-billing/payment-methods")
        .send({ ...validCreditCardPayload, setAsDefault: true });

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE portal_payment_methods"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns 400 for missing required fields", async () => {
      const res = await request(app).post("/portal-billing/payment-methods").send({
        paymentType: "credit_card",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid input");
    });

    it("returns 400 for invalid payment type", async () => {
      const res = await request(app).post("/portal-billing/payment-methods").send({
        ...validCreditCardPayload,
        paymentType: "invalid",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid expiry month", async () => {
      const res = await request(app).post("/portal-billing/payment-methods").send({
        ...validCreditCardPayload,
        expiryMonth: 13,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid expiry year", async () => {
      const res = await request(app).post("/portal-billing/payment-methods").send({
        ...validCreditCardPayload,
        expiryYear: 2020,
      });

      expect(res.status).toBe(400);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/portal-billing/payment-methods")
        .send(validCreditCardPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to add payment method");
    });
  });

  describe("DELETE /portal-billing/payment-methods/:id", () => {
    it("deletes a payment method", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "pm-1" }],
      });

      const res = await request(app).delete("/portal-billing/payment-methods/pm-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE portal_payment_methods"),
        ["pm-1", "patient-1", "tenant-1"]
      );
    });

    it("returns 404 when payment method not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/portal-billing/payment-methods/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Payment method not found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).delete("/portal-billing/payment-methods/pm-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to delete payment method");
    });
  });

  describe("POST /portal-billing/payments", () => {
    const validPaymentWithExisting = {
      amount: 100.0,
      paymentMethodId: "pm-1",
      description: "Payment for office visit",
    };

    const validPaymentWithNew = {
      amount: 150.0,
      newPaymentMethod: {
        paymentType: "credit_card",
        cardNumber: "4242424242424242",
        cardBrand: "visa",
        expiryMonth: 12,
        expiryYear: 2025,
        cardholderName: "John Doe",
        cvv: "123",
        billingAddress: {
          street: "123 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
        },
      },
      savePaymentMethod: false,
    };

    it("processes payment with existing payment method", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ token: "tok_existing123" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "txn-123" }],
        })
        .mockResolvedValueOnce({ rows: [] }) // update transaction
        .mockResolvedValueOnce({ rows: [] }); // update balance

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithExisting);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactionId).toBe("txn-123");
      expect(res.body.receiptNumber).toMatch(/^RCP-/);
    });

    it("processes payment with new card and saves it", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "pm-new" }],
        }) // save payment method
        .mockResolvedValueOnce({
          rows: [{ id: "txn-456" }],
        }) // create transaction
        .mockResolvedValueOnce({ rows: [] }) // update transaction
        .mockResolvedValueOnce({ rows: [] }); // update balance

      const res = await request(app)
        .post("/portal-billing/payments")
        .send({ ...validPaymentWithNew, savePaymentMethod: true });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_payment_methods"),
        expect.any(Array)
      );
    });

    it("processes payment with new card without saving", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "txn-789" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithNew);

      expect(res.status).toBe(200);
      // Should not save payment method
      expect(queryMock).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_payment_methods"),
        expect.any(Array)
      );
    });

    it("associates payment with specific charges", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ token: "tok_123" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "txn-abc" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/portal-billing/payments").send({
        ...validPaymentWithExisting,
        chargeIds: ["charge-1", "charge-2"],
      });

      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_payment_transactions"),
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          JSON.stringify(["charge-1", "charge-2"]),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ])
      );
    });

    it("returns 400 when no payment method provided", async () => {
      const res = await request(app).post("/portal-billing/payments").send({
        amount: 100.0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Payment method required");
    });

    it("returns 404 when payment method not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithExisting);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Payment method not found");
    });

    it("returns 400 for invalid amount", async () => {
      const res = await request(app).post("/portal-billing/payments").send({
        amount: -10,
        paymentMethodId: "pm-1",
      });

      expect(res.status).toBe(400);
    });

    it("returns 402 when payment fails", async () => {
      // Mock random to force payment failure
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.01); // < 0.05 = failure

      queryMock
        .mockResolvedValueOnce({
          rows: [{ token: "tok_123" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "txn-fail" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithExisting);

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Payment failed");

      Math.random = originalRandom;
    });

    it("marks transaction as failed on payment error", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ token: "tok_123" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "txn-error" }],
        })
        .mockRejectedValueOnce(new Error("Payment processing error"))
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithExisting);

      expect(res.status).toBe(500);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE portal_payment_transactions"),
        ["txn-error"]
      );
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app)
        .post("/portal-billing/payments")
        .send(validPaymentWithExisting);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Payment processing failed");
    });
  });

  describe("GET /portal-billing/payment-history", () => {
    it("returns payment history", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "txn-1",
            amount: 100.0,
            currency: "USD",
            status: "completed",
            paymentMethodType: "credit_card",
            receiptNumber: "RCP-123",
            receiptUrl: "https://example.com/receipt",
            createdAt: "2024-01-15",
            completedAt: "2024-01-15",
          },
          {
            id: "txn-2",
            amount: 50.0,
            currency: "USD",
            status: "completed",
            paymentMethodType: "debit_card",
            receiptNumber: "RCP-124",
            createdAt: "2024-01-10",
            completedAt: "2024-01-10",
          },
        ],
      });

      const res = await request(app).get("/portal-billing/payment-history");

      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(2);
      expect(res.body.payments[0].id).toBe("txn-1");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("FROM portal_payment_transactions"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns empty array when no payment history", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/payment-history");

      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(0);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/payment-history");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get payment history");
    });
  });

  describe("GET /portal-billing/payment-plans", () => {
    it("returns payment plans", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "plan-1",
            totalAmount: 1000.0,
            amountPaid: 400.0,
            installmentAmount: 200.0,
            installmentFrequency: "monthly",
            numberOfInstallments: 5,
            startDate: "2024-01-01",
            nextPaymentDate: "2024-03-01",
            status: "active",
            autoPay: true,
          },
        ],
      });

      const res = await request(app).get("/portal-billing/payment-plans");

      expect(res.status).toBe(200);
      expect(res.body.paymentPlans).toHaveLength(1);
      expect(res.body.paymentPlans[0].id).toBe("plan-1");
    });

    it("returns empty array when no payment plans", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/payment-plans");

      expect(res.status).toBe(200);
      expect(res.body.paymentPlans).toHaveLength(0);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/payment-plans");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get payment plans");
    });
  });

  describe("GET /portal-billing/payment-plans/:id/installments", () => {
    it("returns installments for a payment plan", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "plan-1" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "inst-1",
              installmentNumber: 1,
              amount: 200.0,
              dueDate: "2024-01-01",
              status: "paid",
              paidAmount: 200.0,
              paidAt: "2024-01-01",
            },
            {
              id: "inst-2",
              installmentNumber: 2,
              amount: 200.0,
              dueDate: "2024-02-01",
              status: "pending",
              paidAmount: null,
              paidAt: null,
            },
          ],
        });

      const res = await request(app).get("/portal-billing/payment-plans/plan-1/installments");

      expect(res.status).toBe(200);
      expect(res.body.installments).toHaveLength(2);
      expect(res.body.installments[0].status).toBe("paid");
    });

    it("returns 404 when payment plan not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/payment-plans/nonexistent/installments");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Payment plan not found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/payment-plans/plan-1/installments");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get installments");
    });
  });

  describe("GET /portal-billing/autopay", () => {
    it("returns autopay enrollment with payment method", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "ae-1",
            paymentMethodId: "pm-1",
            isActive: true,
            chargeDay: 15,
            chargeAllBalances: true,
            minimumAmount: 25.0,
            notifyBeforeCharge: true,
            notificationDays: 3,
            enrolledAt: "2024-01-01",
            lastChargeDate: "2024-02-15",
            lastChargeAmount: 100.0,
            paymentType: "credit_card",
            lastFour: "4242",
            cardBrand: "visa",
          },
        ],
      });

      const res = await request(app).get("/portal-billing/autopay");

      expect(res.status).toBe(200);
      expect(res.body.enrolled).toBe(true);
      expect(res.body.isActive).toBe(true);
      expect(res.body.chargeDay).toBe(15);
    });

    it("returns not enrolled when no active enrollment", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/portal-billing/autopay");

      expect(res.status).toBe(200);
      expect(res.body.enrolled).toBe(false);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).get("/portal-billing/autopay");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to get autopay enrollment");
    });
  });

  describe("POST /portal-billing/autopay", () => {
    const validAutopayPayload = {
      paymentMethodId: "pm-1",
      chargeDay: 15,
      chargeAllBalances: true,
      minimumAmount: 25.0,
      notifyBeforeCharge: true,
      notificationDays: 3,
      termsAccepted: true,
    };

    it("enrolls in autopay", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "pm-1" }],
        })
        .mockResolvedValueOnce({ rows: [] }) // cancel existing
        .mockResolvedValueOnce({
          rows: [{ id: "ae-123", enrolledAt: "2024-01-15" }],
        });

      const res = await request(app).post("/portal-billing/autopay").send(validAutopayPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("ae-123");
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO portal_autopay_enrollments"),
        expect.arrayContaining([
          "tenant-1",
          "patient-1",
          "pm-1",
          15,
          true,
          25.0,
          true,
          3,
          true,
        ])
      );
    });

    it("cancels existing enrollments before creating new one", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ id: "pm-1" }],
        })
        .mockResolvedValueOnce({ rows: [{ id: "ae-old" }] })
        .mockResolvedValueOnce({
          rows: [{ id: "ae-new" }],
        });

      const res = await request(app).post("/portal-billing/autopay").send(validAutopayPayload);

      expect(res.status).toBe(201);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE portal_autopay_enrollments"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns 400 when payment method not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/portal-billing/autopay").send(validAutopayPayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Payment method not found");
    });

    it("returns 400 for invalid charge day", async () => {
      const res = await request(app).post("/portal-billing/autopay").send({
        ...validAutopayPayload,
        chargeDay: 0,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for charge day > 28", async () => {
      const res = await request(app).post("/portal-billing/autopay").send({
        ...validAutopayPayload,
        chargeDay: 29,
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when terms not accepted", async () => {
      const res = await request(app).post("/portal-billing/autopay").send({
        ...validAutopayPayload,
        termsAccepted: false,
      });

      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    it("returns 400 for missing required fields", async () => {
      const res = await request(app).post("/portal-billing/autopay").send({
        chargeDay: 15,
      });

      expect(res.status).toBe(400);
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).post("/portal-billing/autopay").send(validAutopayPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to enroll in auto-pay");
    });
  });

  describe("DELETE /portal-billing/autopay", () => {
    it("cancels autopay enrollment", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ id: "ae-1" }],
      });

      const res = await request(app).delete("/portal-billing/autopay");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE portal_autopay_enrollments"),
        ["patient-1", "tenant-1"]
      );
    });

    it("returns 404 when no active enrollment", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/portal-billing/autopay");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No active auto-pay enrollment found");
    });

    it("returns 500 on database error", async () => {
      queryMock.mockRejectedValueOnce(new Error("Database error"));

      const res = await request(app).delete("/portal-billing/autopay");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to cancel auto-pay");
    });
  });
});
