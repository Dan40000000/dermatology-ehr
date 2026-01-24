import request from "supertest";
import express from "express";
import { batchesRouter } from "../batches";
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
  },
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/batches", batchesRouter);

const queryMock = pool.query as jest.Mock;
const currentYear = new Date().getFullYear();

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  jest.clearAllMocks();
});

describe("Batches Routes", () => {
  describe("GET /batches", () => {
    it("should list all batches", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: "batch-1",
            batchNumber: `BATCH-${currentYear}-000001`,
            batchType: "payer",
            totalAmountCents: 50000,
            status: "open",
          },
        ],
      });

      const res = await request(app).get("/batches");

      expect(res.status).toBe(200);
      expect(res.body.batches).toHaveLength(1);
    });

    it("should filter by batch type", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/batches?batchType=payer");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.batch_type = $2"),
        expect.arrayContaining(["tenant-1", "payer"])
      );
    });

    it("should filter by status", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/batches?status=closed");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.status = $2"),
        expect.arrayContaining(["tenant-1", "closed"])
      );
    });

    it("should filter by date range", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await request(app).get("/batches?startDate=2024-01-01&endDate=2024-01-31");

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("b.batch_date >= $2"),
        expect.arrayContaining(["tenant-1", "2024-01-01", "2024-01-31"])
      );
    });
  });

  describe("GET /batches/:id", () => {
    it("should return batch with associated payments", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              id: "batch-1",
              batchNumber: `BATCH-${currentYear}-000001`,
              totalAmountCents: 50000,
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "payer-payment-1",
              payerName: "Blue Cross",
              totalAmountCents: 30000,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "patient-payment-1",
              patientFirstName: "John",
              patientLastName: "Doe",
              amountCents: 20000,
            },
          ],
        });

      const res = await request(app).get("/batches/batch-1");

      expect(res.status).toBe(200);
      expect(res.body.batch.id).toBe("batch-1");
      expect(res.body.payerPayments).toHaveLength(1);
      expect(res.body.patientPayments).toHaveLength(1);
    });

    it("should return 404 when batch not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app).get("/batches/batch-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Batch not found");
    });
  });

  describe("POST /batches", () => {
    it("should create a new batch", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ count: 0 }] }).mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/batches").send({
        batchDate: "2024-01-15",
        batchType: "payer",
        totalAmountCents: 50000,
        notes: "Test batch",
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.batchNumber).toBe(`BATCH-${currentYear}-000001`);
      expect(auditLog).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "batch_create",
        "batch",
        expect.any(String)
      );
    });

    it("should reject invalid payload", async () => {
      const res = await request(app).post("/batches").send({
        batchDate: "2024-01-15",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should reject invalid batch type", async () => {
      const res = await request(app).post("/batches").send({
        batchDate: "2024-01-15",
        batchType: "invalid",
        totalAmountCents: 50000,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });
  });

  describe("PUT /batches/:id", () => {
    it("should update a batch", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).put("/batches/batch-1").send({
        totalAmountCents: 60000,
        status: "closed",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(auditLog).toHaveBeenCalled();
    });

    it("should reject invalid payload", async () => {
      const res = await request(app).put("/batches/batch-1").send({
        status: "invalid-status",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("should return error when no fields to update", async () => {
      const res = await request(app).put("/batches/batch-1").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No fields to update");
    });
  });

  describe("POST /batches/:id/close", () => {
    it("should close a batch", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/batches/batch-1/close");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("status = 'closed'"),
        ["user-1", "batch-1", "tenant-1"]
      );
      expect(auditLog).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "batch_close",
        "batch",
        "batch-1"
      );
    });
  });

  describe("POST /batches/:id/post", () => {
    it("should post a batch", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post("/batches/batch-1/post");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("status = 'posted'"),
        ["batch-1", "tenant-1"]
      );
      expect(auditLog).toHaveBeenCalledWith("tenant-1", "user-1", "batch_post", "batch", "batch-1");
    });
  });

  describe("DELETE /batches/:id", () => {
    it("should void batch with items", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ item_count: 5 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/batches/batch-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("status = 'voided'"),
        ["batch-1", "tenant-1"]
      );
      expect(auditLog).toHaveBeenCalled();
    });

    it("should delete batch without items", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [{ item_count: 0 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete("/batches/batch-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("delete from payment_batches"),
        ["batch-1", "tenant-1"]
      );
    });

    it("should return 404 when batch not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app).delete("/batches/batch-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Batch not found");
    });
  });
});
