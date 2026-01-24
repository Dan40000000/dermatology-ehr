import request from "supertest";
import express from "express";
import { billsRouter } from "../bills";
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
app.use("/bills", billsRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  connectMock.mockReset();
  jest.clearAllMocks();
});

describe("Bills Routes", () => {
  describe("GET /bills", () => {
    it("should list all bills", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "bill-1",
            billNumber: "BILL-2024-000001",
            totalChargesCents: 100000,
            patientResponsibilityCents: 20000,
            balanceCents: 20000,
            status: "new",
          },
        ],
      });

      const res = await request(app).get("/bills");

      expect(res.status).toBe(200);
      expect(res.body.bills).toHaveLength(1);
    });

    it("should filter by patientId", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/bills?patientId=patient-1");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.patient_id = $2"),
        expect.arrayContaining(["tenant-1", "patient-1"])
      );
    });

    it("should filter by status", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/bills?status=paid");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.status = $2"),
        expect.arrayContaining(["tenant-1", "paid"])
      );
    });

    it("should filter by date range", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/bills?startDate=2024-01-01&endDate=2024-01-31");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.bill_date >= $2"),
        expect.arrayContaining(["tenant-1", "2024-01-01", "2024-01-31"])
      );
    });
  });

  describe("GET /bills/:id", () => {
    it("should return bill with line items", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "bill-1",
              billNumber: "BILL-2024-000001",
              totalChargesCents: 100000,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "line-1",
              cptCode: "99213",
              description: "Office visit",
              totalCents: 50000,
            },
            {
              id: "line-2",
              cptCode: "11100",
              description: "Biopsy",
              totalCents: 50000,
            },
          ],
        });

      const res = await request(app).get("/bills/bill-1");

      expect(res.status).toBe(200);
      expect(res.body.bill.id).toBe("bill-1");
      expect(res.body.lineItems).toHaveLength(2);
    });

    it("should return 404 when bill not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app).get("/bills/bill-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Bill not found");
    });
  });

  describe("POST /bills", () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      connectMock.mockResolvedValue(mockClient);
      mockClient.query.mockReset();
      mockClient.release.mockReset();
    });

    it("should create a new bill with line items", async () => {
      const currentYear = new Date().getFullYear();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // count query
        .mockResolvedValueOnce({ rows: [] }) // insert bill
        .mockResolvedValueOnce({ rows: [] }) // insert line item 1
        .mockResolvedValueOnce({ rows: [] }) // insert line item 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/bills")
        .send({
          patientId: "patient-1",
          billDate: "2024-01-15",
          totalChargesCents: 100000,
          insuranceResponsibilityCents: 80000,
          patientResponsibilityCents: 20000,
          lineItems: [
            {
              serviceDate: "2024-01-15",
              cptCode: "99213",
              description: "Office visit",
              unitPriceCents: 50000,
              totalCents: 50000,
            },
            {
              serviceDate: "2024-01-15",
              cptCode: "11100",
              description: "Biopsy",
              unitPriceCents: 50000,
              totalCents: 50000,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.billNumber).toBe(`BILL-${currentYear}-000001`);
      expect(auditLog).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should create bill without line items", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // count query
        .mockResolvedValueOnce({ rows: [] }) // insert bill
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app)
        .post("/bills")
        .send({
          patientId: "patient-1",
          billDate: "2024-01-15",
          totalChargesCents: 100000,
          patientResponsibilityCents: 20000,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
    });

    it("should reject invalid payload", async () => {
      const res = await request(app).post("/bills").send({
        billDate: "2024-01-15",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should rollback on error", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // count query
        .mockRejectedValueOnce(new Error("DB error")); // insert bill fails

      const res = await request(app).post("/bills").send({
        patientId: "patient-1",
        billDate: "2024-01-15",
        totalChargesCents: 100000,
        patientResponsibilityCents: 20000,
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to create bill");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("PUT /bills/:id", () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      connectMock.mockResolvedValue(mockClient);
      mockClient.query.mockReset();
      mockClient.release.mockReset();
    });

    it("should update a bill", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              patient_responsibility_cents: 20000,
              paid_amount_cents: 0,
              adjustment_amount_cents: 0,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(app).put("/bills/bill-1").send({
        status: "paid",
        paidAmountCents: 20000,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLog).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should recalculate balance correctly", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              patient_responsibility_cents: 20000,
              paid_amount_cents: 0,
              adjustment_amount_cents: 0,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await request(app).put("/bills/bill-1").send({
        paidAmountCents: 15000,
        adjustmentAmountCents: 3000,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("balance_cents = $3"),
        expect.arrayContaining([15000, 3000, 2000, "bill-1", "tenant-1"])
      );
    });

    it("should return 404 when bill not found", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // select

      const res = await request(app).put("/bills/bill-1").send({
        status: "paid",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Bill not found");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("should reject invalid payload", async () => {
      const res = await request(app).put("/bills/bill-1").send({
        status: "invalid-status",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should rollback on error", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              patient_responsibility_cents: 20000,
              paid_amount_cents: 0,
              adjustment_amount_cents: 0,
            },
          ],
          rowCount: 1,
        })
        .mockRejectedValueOnce(new Error("DB error")); // update fails

      const res = await request(app).put("/bills/bill-1").send({
        status: "paid",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Failed to update bill");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("DELETE /bills/:id", () => {
    it("should delete a bill", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/bills/bill-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("delete from bills"),
        ["bill-1", "tenant-1"]
      );
      expect(auditLog).toHaveBeenCalledWith("tenant-1", "user-1", "bill_delete", "bill", "bill-1");
    });
  });
});
