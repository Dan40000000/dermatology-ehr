import request from "supertest";
import express from "express";
import { labOrdersRouter } from "../labOrders";
import { pool } from "../../db/pool";
import { HL7Service } from "../../services/hl7Service";
import { logger } from "../../lib/logger";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../../services/hl7Service", () => ({
  HL7Service: {
    generateLabOrderMessage: jest.fn(),
    sendHL7Message: jest.fn(),
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/lab-orders", labOrdersRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const generateMock = HL7Service.generateLabOrderMessage as jest.Mock;
const sendMock = HL7Service.sendHL7Message as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  generateMock.mockReset();
  sendMock.mockReset();
  (logger.error as jest.Mock).mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Lab orders routes", () => {
  it("GET /lab-orders returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).get("/lab-orders?status=pending");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /lab-orders returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/lab-orders");
    expect(res.status).toBe(500);
  });

  it("GET /lab-orders/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/lab-orders/order-1");
    expect(res.status).toBe(404);
  });

  it("GET /lab-orders/:id returns order", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "order-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "test-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "result-1" }] });
    const res = await request(app).get("/lab-orders/order-1");
    expect(res.status).toBe(200);
    expect(res.body.tests).toHaveLength(1);
    expect(res.body.results).toHaveLength(1);
  });

  it("POST /lab-orders creates order", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "order-1" }] }) // insert order
      .mockResolvedValueOnce({ rows: [{ test_code: "T1", test_name: "Test" }] }) // test catalog
      .mockResolvedValueOnce({ rows: [] }) // insert order test
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1", tests: [] }] });

    const res = await request(app).post("/lab-orders").send({
      patient_id: "p1",
      ordering_provider_id: "prov-1",
      vendor_id: "vendor-1",
      tests: ["test-1"],
      clinical_indication: "rash",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("order-1");
  });

  it("POST /lab-orders/:id/submit returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/lab-orders/order-1/submit");
    expect(res.status).toBe(404);
  });

  it("POST /lab-orders/:id/submit returns 400 when vendor not enabled", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1", hl7_enabled: false }] });
    const res = await request(app).post("/lab-orders/order-1/submit");
    expect(res.status).toBe(400);
  });

  it("POST /lab-orders/:id/submit submits order", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            patient_uuid: "p1",
            provider_uuid: "prov-1",
            hl7_enabled: true,
            vendor_name: "Lab",
            api_endpoint: "mock://lab",
            priority: "routine",
            clinical_indication: "rash",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ test_code: "T1", test_name: "Test" }] })
      .mockResolvedValueOnce({ rows: [] });

    generateMock.mockReturnValueOnce("HL7MSG");
    sendMock.mockResolvedValueOnce({ acknowledgment: "ACK" });

    const res = await request(app).post("/lab-orders/order-1/submit");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(generateMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });

  it("PATCH /lab-orders/:id/specimen returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/lab-orders/order-1/specimen").send({ specimen_collected_at: "2025-01-01" });
    expect(res.status).toBe(404);
  });

  it("PATCH /lab-orders/:id/specimen updates specimen", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).patch("/lab-orders/order-1/specimen").send({ specimen_collected_at: "2025-01-01" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("order-1");
  });

  it("PATCH /lab-orders/:id/status rejects invalid status", async () => {
    const res = await request(app).patch("/lab-orders/order-1/status").send({ status: "bad" });
    expect(res.status).toBe(400);
  });

  it("PATCH /lab-orders/:id/status returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch("/lab-orders/order-1/status").send({ status: "pending" });
    expect(res.status).toBe(404);
  });

  it("PATCH /lab-orders/:id/status updates status", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).patch("/lab-orders/order-1/status").send({ status: "pending" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("order-1");
  });

  it("DELETE /lab-orders/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/lab-orders/order-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /lab-orders/:id cancels order", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "order-1" }] });
    const res = await request(app).delete("/lab-orders/order-1");
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("cancelled");
  });
});
