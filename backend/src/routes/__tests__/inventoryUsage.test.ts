import request from "supertest";
import express from "express";
import { inventoryUsageRouter } from "../inventoryUsage";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/inventory-usage", inventoryUsageRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditMock = auditLog as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  auditMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Inventory usage routes", () => {
  it("POST /inventory-usage rejects invalid payload", async () => {
    const res = await request(app).post("/inventory-usage").send({});
    expect(res.status).toBe(400);
  });

  it("POST /inventory-usage returns 404 when item missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).post("/inventory-usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      patientId: "p1",
      providerId: "prov-1",
      quantityUsed: 1,
    });
    expect(res.status).toBe(404);
  });

  it("POST /inventory-usage returns 400 on insufficient inventory", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ unit_cost_cents: 100, quantity: 0 }], rowCount: 1 });
    const res = await request(app).post("/inventory-usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      patientId: "p1",
      providerId: "prov-1",
      quantityUsed: 1,
    });
    expect(res.status).toBe(400);
  });

  it("POST /inventory-usage records usage", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ unit_cost_cents: 100, quantity: 5 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "usage-1" }] });
    const res = await request(app).post("/inventory-usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      patientId: "p1",
      providerId: "prov-1",
      quantityUsed: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("usage-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /inventory-usage stores sample and sell price flags", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ unit_cost_cents: 100, quantity: 5 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "usage-2" }] });

    const res = await request(app).post("/inventory-usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      patientId: "p1",
      providerId: "prov-1",
      quantityUsed: 1,
      givenAsSample: true,
      sellPriceCents: 5000,
    });

    expect(res.status).toBe(201);
    const insertParams = queryMock.mock.calls[1]?.[1];
    expect(insertParams[8]).toBe(0);
    expect(insertParams[9]).toBe(true);
  });

  it("POST /inventory-usage returns 400 on trigger error", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ unit_cost_cents: 100, quantity: 5 }], rowCount: 1 })
      .mockRejectedValueOnce(new Error("Insufficient inventory"));
    const res = await request(app).post("/inventory-usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      patientId: "p1",
      providerId: "prov-1",
      quantityUsed: 1,
    });
    expect(res.status).toBe(400);
  });

  it("POST /inventory-usage/batch rejects invalid payload", async () => {
    const res = await request(app).post("/inventory-usage/batch").send({});
    expect(res.status).toBe(400);
  });

  it("POST /inventory-usage/batch returns 400 when item missing", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory-usage/batch").send({
      patientId: "p1",
      providerId: "prov-1",
      items: [{ itemId: "00000000-0000-0000-0000-000000000000", quantityUsed: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("POST /inventory-usage/batch records usage", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ unit_cost_cents: 100, quantity: 5 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "usage-1" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory-usage/batch").send({
      patientId: "p1",
      providerId: "prov-1",
      items: [{ itemId: "00000000-0000-0000-0000-000000000000", quantityUsed: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /inventory-usage returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "usage-1" }] });
    const res = await request(app).get("/inventory-usage?patientId=p1&limit=5");
    expect(res.status).toBe(200);
    expect(res.body.usage).toHaveLength(1);
  });

  it("GET /inventory-usage/encounter/:id returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "usage-1" }] });
    const res = await request(app).get("/inventory-usage/encounter/enc-1");
    expect(res.status).toBe(200);
    expect(res.body.usage).toHaveLength(1);
  });

  it("GET /inventory-usage/patient/:id/stats returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ itemId: "item-1" }] });
    const res = await request(app).get("/inventory-usage/patient/p1/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(1);
  });

  it("GET /inventory-usage/stats/by-category returns stats", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ category: "supply" }] });
    const res = await request(app).get("/inventory-usage/stats/by-category?startDate=2024-01-01");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveLength(1);
  });

  it("GET /inventory-usage/stats/top-items returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ itemId: "item-1" }] });
    const res = await request(app).get("/inventory-usage/stats/top-items?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("DELETE /inventory-usage/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).delete("/inventory-usage/usage-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /inventory-usage/:id deletes usage", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ item_id: "item-1", quantity_used: 2 }], rowCount: 1 });

    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // DELETE usage
      .mockResolvedValueOnce({ rows: [] }) // UPDATE inventory
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/inventory-usage/usage-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });
});
