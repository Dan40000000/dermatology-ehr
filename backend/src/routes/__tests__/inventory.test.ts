import request from "supertest";
import express from "express";
import { inventoryRouter } from "../inventory";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { inventoryService } from "../../services/inventoryService";
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

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
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
app.use("/inventory", inventoryRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const auditMock = auditLog as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  auditMock.mockReset();
  loggerMock.error.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Inventory routes", () => {
  it("POST /inventory/:itemId/lots logs sanitized Error failures", async () => {
    const upsertLotSpy = jest
      .spyOn(inventoryService, "upsertLot")
      .mockRejectedValueOnce(new Error("lot create failed"));

    const res = await request(app).post("/inventory/item-1/lots").send({
      lotNumber: "LOT-1",
      quantity: 5,
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("lot create failed");
    expect(loggerMock.error).toHaveBeenCalledWith("Error creating lot:", {
      error: "lot create failed",
    });

    upsertLotSpy.mockRestore();
  });

  it("POST /inventory/:itemId/lots masks non-Error failures", async () => {
    const upsertLotSpy = jest
      .spyOn(inventoryService, "upsertLot")
      .mockRejectedValueOnce({ tenantId: "tenant-1" });

    const res = await request(app).post("/inventory/item-1/lots").send({
      lotNumber: "LOT-1",
      quantity: 5,
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to create lot");
    expect(loggerMock.error).toHaveBeenCalledWith("Error creating lot:", {
      error: "Unknown error",
    });

    upsertLotSpy.mockRestore();
  });

  it("GET /inventory returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/inventory?category=medication&lowStock=true");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /inventory/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get("/inventory/item-1");
    expect(res.status).toBe(404);
  });

  it("GET /inventory/:id returns item", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "item-1" }], rowCount: 1 });
    const res = await request(app).get("/inventory/item-1");
    expect(res.status).toBe(200);
    expect(res.body.item.id).toBe("item-1");
  });

  it("POST /inventory rejects invalid payload", async () => {
    const res = await request(app).post("/inventory").send({});
    expect(res.status).toBe(400);
  });

  it("POST /inventory creates item", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).post("/inventory").send({
      name: "Lidocaine",
      category: "medication",
      quantity: 10,
      reorderLevel: 2,
      unitCostCents: 500,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("item-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("PUT /inventory/:id rejects empty updates", async () => {
    const res = await request(app).put("/inventory/item-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /inventory/:id updates item", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/inventory/item-1").send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("DELETE /inventory/:id returns 409 when usage exists", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    const res = await request(app).delete("/inventory/item-1");
    expect(res.status).toBe(409);
  });

  it("DELETE /inventory/:id deletes item", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/inventory/item-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /inventory/adjust rejects invalid payload", async () => {
    const res = await request(app).post("/inventory/adjust").send({});
    expect(res.status).toBe(400);
  });

  it("POST /inventory/adjust returns 404 when item missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).post("/inventory/adjust").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      adjustmentQuantity: 1,
      reason: "received",
    });
    expect(res.status).toBe(404);
  });

  it("POST /inventory/adjust creates adjustment", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "item-1", name: "Item" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "adj-1" }] });
    const res = await request(app).post("/inventory/adjust").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      adjustmentQuantity: 5,
      reason: "received",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("adj-1");
  });

  it("GET /inventory/:id/adjustments returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "adj-1" }] });
    const res = await request(app).get("/inventory/item-1/adjustments");
    expect(res.status).toBe(200);
    expect(res.body.adjustments).toHaveLength(1);
  });

  it("GET /inventory/alerts/low-stock returns items", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/inventory/alerts/low-stock");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /inventory/alerts/expiring returns items", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/inventory/alerts/expiring?days=30");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /inventory/:id/usage returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "usage-1" }] });
    const res = await request(app).get("/inventory/item-1/usage?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.usage).toHaveLength(1);
  });

  it("GET /inventory/stats/summary returns stats", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });

    const res = await request(app).get("/inventory/stats/summary");
    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(5);
    expect(res.body.lowStockCount).toBe(2);
  });

  it("GET /inventory/procedure-templates returns templates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "template-1" }] });

    const res = await request(app).get("/inventory/procedure-templates?category=biopsy");

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it("GET /inventory/procedure-templates/:procedureName/items returns items", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ item_id: "item-1" }] });

    const res = await request(app).get("/inventory/procedure-templates/biopsy/items");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("POST /inventory/procedure-usage rejects invalid payload", async () => {
    const res = await request(app).post("/inventory/procedure-usage").send({});

    expect(res.status).toBe(400);
  });

  it("POST /inventory/procedure-usage records usage from template", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ item_id: "item-1", default_quantity: 2 }] })
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Item", quantity: 10, unit_cost_cents: 100 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "usage-1", used_at: "2025-01-01" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/procedure-usage").send({
      procedureName: "biopsy",
      patientId: "patient-1",
      providerId: "provider-1",
    });

    expect(res.status).toBe(201);
    expect(res.body.usageIds).toEqual(["usage-1"]);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /inventory/procedure-usage returns 400 on insufficient inventory", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ item_id: "item-1", default_quantity: 5 }] })
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Item", quantity: 1, unit_cost_cents: 100 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/procedure-usage").send({
      procedureName: "biopsy",
      patientId: "patient-1",
      providerId: "provider-1",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Insufficient inventory");
  });

  it("POST /inventory/usage rejects invalid payload", async () => {
    const res = await request(app).post("/inventory/usage").send({});
    expect(res.status).toBe(400);
  });

  it("POST /inventory/usage returns 404 when item missing", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // item check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      quantityUsed: 1,
      patientId: "p1",
      providerId: "prov-1",
    });
    expect(res.status).toBe(404);
  });

  it("POST /inventory/usage returns 400 on insufficient inventory", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Item", quantity: 1, unit_cost_cents: 100 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      quantityUsed: 3,
      patientId: "p1",
      providerId: "prov-1",
    });
    expect(res.status).toBe(400);
  });

  it("POST /inventory/usage records usage", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Item", quantity: 10, unit_cost_cents: 100 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "usage-1", used_at: "2025-01-01" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      quantityUsed: 1,
      patientId: "p1",
      providerId: "prov-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("usage-1");
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /inventory/usage stores sample and sell price flags", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Item", quantity: 10, unit_cost_cents: 100 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "usage-2", used_at: "2025-01-01" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      quantityUsed: 2,
      patientId: "p1",
      providerId: "prov-1",
      givenAsSample: true,
      sellPriceCents: 4200,
    });

    expect(res.status).toBe(201);

    const insertParams = client.query.mock.calls[2]?.[1];
    expect(insertParams[4]).toBe(0);
    expect(insertParams[5]).toBe(true);
  });

  it("POST /inventory/usage creates billing entries for billable usage", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", name: "Triamcinolone Cream", quantity: 20, unit_cost_cents: 500 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "usage-billable", used_at: "2025-01-01" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // open bill lookup
      .mockResolvedValueOnce({ rows: [] }) // insert bill
      .mockResolvedValueOnce({ rows: [] }) // insert bill line item
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/inventory/usage").send({
      itemId: "00000000-0000-0000-0000-000000000000",
      quantityUsed: 2,
      patientId: "p1",
      providerId: "prov-1",
      sellPriceCents: 2500,
      givenAsSample: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.patientChargeCents).toBe(5000);
    expect(res.body.billId).toBeTruthy();

    const queryTextList = client.query.mock.calls.map((call) => String(call[0]));
    expect(queryTextList.some((sql) => sql.includes("INSERT INTO bills"))).toBe(true);
    expect(queryTextList.some((sql) => sql.includes("INSERT INTO bill_line_items"))).toBe(true);
  });

  it("GET /inventory/usage returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "usage-1" }] });
    const res = await request(app).get("/inventory/usage?patientId=p1&limit=5");
    expect(res.status).toBe(200);
    expect(res.body.usage).toHaveLength(1);
  });

  it("GET /inventory/usage/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get("/inventory/usage/usage-1");
    expect(res.status).toBe(404);
  });

  it("GET /inventory/usage/:id returns usage", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "usage-1" }], rowCount: 1 });
    const res = await request(app).get("/inventory/usage/usage-1");
    expect(res.status).toBe(200);
    expect(res.body.usage.id).toBe("usage-1");
  });

  it("DELETE /inventory/usage/:id returns 404", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // select
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/inventory/usage/usage-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /inventory/usage/:id voids usage", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ item_id: "item-1", quantity_used: 2 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/inventory/usage/usage-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });
});
