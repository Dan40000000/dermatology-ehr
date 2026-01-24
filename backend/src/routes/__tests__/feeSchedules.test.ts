import request from "supertest";
import express from "express";
import feeSchedulesRouter from "../feeSchedules";
import { pool } from "../../db/pool";

jest.mock("uuid", () => ({
  __esModule: true,
  v4: () => "uuid-1",
}));

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

const app = express();
app.use(express.json());
app.use("/fee-schedules", feeSchedulesRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Fee schedules routes", () => {
  it("GET /fee-schedules returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fs-1" }] });
    const res = await request(app).get("/fee-schedules");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("GET /fee-schedules handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).get("/fee-schedules");
    expect(res.status).toBe(500);
  });

  it("GET /fee-schedules/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fee-schedules/fs-1");
    expect(res.status).toBe(404);
  });

  it("GET /fee-schedules/:id returns schedule", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/fee-schedules/fs-1");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /fee-schedules/:id handles database errors", async () => {
    queryMock.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).get("/fee-schedules/fs-1");
    expect(res.status).toBe(500);
  });

  it("POST /fee-schedules rejects missing name", async () => {
    const res = await request(app).post("/fee-schedules").send({});
    expect(res.status).toBe(400);
  });

  it("POST /fee-schedules creates schedule", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "fs-1", name: "Default" }] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] }); // items
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/fee-schedules").send({ name: "Default" });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
  });

  it("POST /fee-schedules creates default and clones items", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // unset defaults
      .mockResolvedValueOnce({ rows: [{ id: "fs-2", name: "Clone" }] }) // insert
      .mockResolvedValueOnce({ rows: [] }) // clone items
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] }); // items
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/fee-schedules").send({
      name: "Clone",
      isDefault: true,
      cloneFromId: "fs-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
  });

  it("POST /fee-schedules handles database errors", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).post("/fee-schedules").send({ name: "Default" });
    expect(res.status).toBe(500);
  });

  it("PUT /fee-schedules/:id returns 404", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/fee-schedules/fs-1").send({ name: "Update" });
    expect(res.status).toBe(404);
  });

  it("PUT /fee-schedules/:id rejects empty updates", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/fee-schedules/fs-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /fee-schedules/:id updates schedule", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/fee-schedules/fs-1").send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("fs-1");
  });

  it("PUT /fee-schedules/:id updates default flag", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
      .mockResolvedValueOnce({ rows: [] }) // unset defaults
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // update
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/fee-schedules/fs-1").send({ isDefault: true, name: "Default" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("fs-1");
  });

  it("PUT /fee-schedules/:id handles database errors", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).put("/fee-schedules/fs-1").send({ name: "Updated" });
    expect(res.status).toBe(500);
  });

  it("DELETE /fee-schedules/:id returns 404", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/fee-schedules/fs-1");
    expect(res.status).toBe(404);
  });

  it("DELETE /fee-schedules/:id rejects default schedule", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_default: true }] }) // check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/fee-schedules/fs-1");
    expect(res.status).toBe(400);
  });

  it("DELETE /fee-schedules/:id deletes schedule", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ is_default: false }] }) // check
      .mockResolvedValueOnce({ rows: [] }) // delete items
      .mockResolvedValueOnce({ rows: [] }) // delete schedule
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/fee-schedules/fs-1");
    expect(res.status).toBe(204);
  });

  it("DELETE /fee-schedules/:id handles database errors", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app).delete("/fee-schedules/fs-1");
    expect(res.status).toBe(500);
  });

  it("GET /fee-schedules/:id/items returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fee-schedules/fs-1/items");
    expect(res.status).toBe(404);
  });

  it("GET /fee-schedules/:id/items returns list", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/fee-schedules/fs-1/items");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("PUT /fee-schedules/:id/items/:cptCode rejects invalid fee", async () => {
    const res = await request(app).put("/fee-schedules/fs-1/items/11100").send({ feeCents: -1 });
    expect(res.status).toBe(400);
  });

  it("PUT /fee-schedules/:id/items/:cptCode returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/fee-schedules/fs-1/items/11100").send({ feeCents: 1000 });
    expect(res.status).toBe(404);
  });

  it("PUT /fee-schedules/:id/items/:cptCode upserts item", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).put("/fee-schedules/fs-1/items/11100").send({ feeCents: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("item-1");
  });

  it("DELETE /fee-schedules/:id/items/:cptCode returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/fee-schedules/fs-1/items/11100");
    expect(res.status).toBe(404);
  });

  it("DELETE /fee-schedules/:id/items/:cptCode deletes item", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "fs-1" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/fee-schedules/fs-1/items/11100");
    expect(res.status).toBe(204);
  });

  it("POST /fee-schedules/:id/items/import rejects missing items", async () => {
    const res = await request(app).post("/fee-schedules/fs-1/items/import").send({});
    expect(res.status).toBe(400);
  });

  it("POST /fee-schedules/:id/items/import returns 404", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // check
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app)
      .post("/fee-schedules/fs-1/items/import")
      .send({ items: [{ cptCode: "11100", fee: 10 }] });
    expect(res.status).toBe(404);
  });

  it("POST /fee-schedules/:id/items/import imports items", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
      .mockResolvedValueOnce({ rows: [] }) // insert item
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    connectMock.mockResolvedValueOnce(client);

    const res = await request(app)
      .post("/fee-schedules/fs-1/items/import")
      .send({ items: [{ cptCode: "11100", fee: 10, description: "Biopsy" }] });
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
  });

  it("GET /fee-schedules/:id/export returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fee-schedules/fs-1/export");
    expect(res.status).toBe(404);
  });

  it("GET /fee-schedules/:id/export returns csv", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ name: "Default" }] })
      .mockResolvedValueOnce({ rows: [{ cpt_code: "11100", cpt_description: "Biopsy", fee_cents: 1000 }] });
    const res = await request(app).get("/fee-schedules/fs-1/export");
    expect(res.status).toBe(200);
    expect(res.text).toContain("CPT Code,Category,Description,Fee");
  });

  it("GET /fee-schedules/default/schedule returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fee-schedules/default/schedule");
    expect(res.status).toBe(404);
  });

  it("GET /fee-schedules/default/schedule returns schedule", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
    const res = await request(app).get("/fee-schedules/default/schedule");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("GET /fee-schedules/default/fee/:cptCode returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/fee-schedules/default/fee/11100");
    expect(res.status).toBe(404);
  });

  it("GET /fee-schedules/default/fee/:cptCode returns fee", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ cpt_code: "11100" }] });
    const res = await request(app).get("/fee-schedules/default/fee/11100");
    expect(res.status).toBe(200);
    expect(res.body.cpt_code).toBe("11100");
  });

  describe("Payer contracts", () => {
    it("GET /fee-schedules/contracts/list returns list", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1" }] });
      const res = await request(app).get("/fee-schedules/contracts/list");
      expect(res.status).toBe(200);
      expect(res.body.contracts).toHaveLength(1);
    });

    it("GET /fee-schedules/contracts/list supports status filter", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1" }] });
      const res = await request(app).get("/fee-schedules/contracts/list?status=inactive");
      expect(res.status).toBe(200);
      expect(res.body.contracts).toHaveLength(1);
    });

    it("GET /fee-schedules/contracts/:id returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(404);
    });

    it("GET /fee-schedules/contracts/:id returns contract", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1" }] });
      const res = await request(app).get("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("pc-1");
    });

    it("POST /fee-schedules/contracts rejects missing fields", async () => {
      const res = await request(app).post("/fee-schedules/contracts").send({ payerName: "Aetna" });
      expect(res.status).toBe(400);
    });

    it("POST /fee-schedules/contracts creates contract", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1", payer_name: "Aetna" }] });
      const res = await request(app)
        .post("/fee-schedules/contracts")
        .send({ payerName: "Aetna", effectiveDate: "2024-01-01" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe("pc-1");
    });

    it("PUT /fee-schedules/contracts/:id rejects empty update", async () => {
      const res = await request(app).put("/fee-schedules/contracts/pc-1").send({});
      expect(res.status).toBe(400);
    });

    it("PUT /fee-schedules/contracts/:id returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put("/fee-schedules/contracts/pc-1").send({ payerName: "Updated" });
      expect(res.status).toBe(404);
    });

    it("PUT /fee-schedules/contracts/:id updates contract", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1", payer_name: "Updated" }] });
      const res = await request(app).put("/fee-schedules/contracts/pc-1").send({ payerName: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.payer_name).toBe("Updated");
    });

    it("DELETE /fee-schedules/contracts/:id returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(404);
    });

    it("DELETE /fee-schedules/contracts/:id deletes contract", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1" }] });
      const res = await request(app).delete("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(204);
    });
  });

  describe("Service packages", () => {
    it("GET /fee-schedules/packages/list returns list", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] });
      const res = await request(app).get("/fee-schedules/packages/list?isActive=true");
      expect(res.status).toBe(200);
      expect(res.body.packages).toHaveLength(1);
    });

    it("GET /fee-schedules/packages/:id returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(404);
    });

    it("GET /fee-schedules/packages/:id returns package with items", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
      const res = await request(app).get("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it("POST /fee-schedules/packages rejects missing fields", async () => {
      const res = await request(app).post("/fee-schedules/packages").send({ name: "Starter" });
      expect(res.status).toBe(400);
    });

    it("POST /fee-schedules/packages creates package", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // insert package
        .mockResolvedValueOnce({ rows: [] }) // insert item
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1", name: "Starter" }] }) // select package
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] }); // select items
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post("/fee-schedules/packages")
        .send({
          name: "Starter",
          packagePriceCents: 15000,
          regularPriceCents: 20000,
          items: [{ cptCode: "11100", individualPriceCents: 15000 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.items).toHaveLength(1);
    });

    it("PUT /fee-schedules/packages/:id rejects empty update", async () => {
      const res = await request(app).put("/fee-schedules/packages/pkg-1").send({});
      expect(res.status).toBe(400);
    });

    it("PUT /fee-schedules/packages/:id returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).put("/fee-schedules/packages/pkg-1").send({ name: "Updated" });
      expect(res.status).toBe(404);
    });

    it("PUT /fee-schedules/packages/:id updates package", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pkg-1", name: "Updated" }] });
      const res = await request(app).put("/fee-schedules/packages/pkg-1").send({ name: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    it("POST /fee-schedules/packages/:id/items rejects missing fields", async () => {
      const res = await request(app).post("/fee-schedules/packages/pkg-1/items").send({});
      expect(res.status).toBe(400);
    });

    it("POST /fee-schedules/packages/:id/items returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post("/fee-schedules/packages/pkg-1/items")
        .send({ cptCode: "11100", individualPriceCents: 1000 });
      expect(res.status).toBe(404);
    });

    it("POST /fee-schedules/packages/:id/items creates item", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1" }] });
      const res = await request(app)
        .post("/fee-schedules/packages/pkg-1/items")
        .send({ cptCode: "11100", individualPriceCents: 1000 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe("item-1");
    });

    it("DELETE /fee-schedules/packages/:packageId/items/:itemId returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete("/fee-schedules/packages/pkg-1/items/item-1");
      expect(res.status).toBe(404);
    });

    it("DELETE /fee-schedules/packages/:packageId/items/:itemId removes item", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).delete("/fee-schedules/packages/pkg-1/items/item-1");
      expect(res.status).toBe(204);
    });

    it("DELETE /fee-schedules/packages/:id returns 404", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // delete items
        .mockResolvedValueOnce({ rows: [] }) // delete package
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app).delete("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(404);
    });

    it("DELETE /fee-schedules/packages/:id deletes package", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // delete items
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] }) // delete package
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app).delete("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(204);
    });
  });

  describe("Cosmetic fee schedules", () => {
    it("GET /fee-schedules/cosmetic/procedures returns list", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ cpt_code: "A1" }] });
      const res = await request(app).get("/fee-schedules/cosmetic/procedures");
      expect(res.status).toBe(200);
      expect(res.body.procedures).toHaveLength(1);
    });

    it("GET /fee-schedules/cosmetic/categories returns list", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "cat-1" }] });
      const res = await request(app).get("/fee-schedules/cosmetic/categories");
      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(1);
    });

    it("GET /fee-schedules/cosmetic/pricing returns list", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ cpt_code: "A1" }] });
      const res = await request(app).get("/fee-schedules/cosmetic/pricing?category=face&search=laser");
      expect(res.status).toBe(200);
      expect(res.body.procedures).toHaveLength(1);
    });

    it("PUT /fee-schedules/cosmetic/procedures/:cptCode rejects missing schedule", async () => {
      const res = await request(app).put("/fee-schedules/cosmetic/procedures/A1").send({});
      expect(res.status).toBe(400);
    });

    it("PUT /fee-schedules/cosmetic/procedures/:cptCode returns 404", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .put("/fee-schedules/cosmetic/procedures/A1")
        .send({ feeScheduleId: "fs-1", feeCents: 1000 });
      expect(res.status).toBe(404);
    });

    it("PUT /fee-schedules/cosmetic/procedures/:cptCode upserts procedure", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "item-1", cpt_code: "A1" }] });
      const res = await request(app)
        .put("/fee-schedules/cosmetic/procedures/A1")
        .send({ feeScheduleId: "fs-1", feeCents: 1000, cptDescription: "Laser" });
      expect(res.status).toBe(200);
      expect(res.body.cpt_code).toBe("A1");
    });
  });

  describe("Additional coverage", () => {
    it("PUT /fee-schedules/:id updates description", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
        .mockResolvedValueOnce({ rows: [{ id: "fs-1", description: "Updated" }] }) // update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app).put("/fee-schedules/fs-1").send({ description: "Updated" });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe("Updated");
    });

    it("GET /fee-schedules/:id/items handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/fs-1/items");
      expect(res.status).toBe(500);
    });

    it("PUT /fee-schedules/:id/items/:cptCode handles database errors", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
        .mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).put("/fee-schedules/fs-1/items/11100").send({ feeCents: 1000 });
      expect(res.status).toBe(500);
    });

    it("DELETE /fee-schedules/:id/items/:cptCode handles database errors", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
        .mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).delete("/fee-schedules/fs-1/items/11100");
      expect(res.status).toBe(500);
    });

    it("POST /fee-schedules/:id/items/import captures item errors", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] }) // check
        .mockRejectedValueOnce(new Error("Insert failed")) // insert for item 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post("/fee-schedules/fs-1/items/import")
        .send({
          items: [
            { cptCode: "11100", fee: -1 },
            { cptCode: "22200", fee: 10 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(2);
    });

    it("POST /fee-schedules/:id/items/import handles database errors", async () => {
      const client = makeClient();
      client.query
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post("/fee-schedules/fs-1/items/import")
        .send({ items: [{ cptCode: "11100", fee: 10 }] });
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/:id/export handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/fs-1/export");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/default/schedule handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/default/schedule");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/default/fee/:cptCode handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/default/fee/11100");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/contracts/list handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/contracts/list");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/contracts/:id handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(500);
    });

    it("POST /fee-schedules/contracts handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app)
        .post("/fee-schedules/contracts")
        .send({ payerName: "Aetna", effectiveDate: "2024-01-01" });
      expect(res.status).toBe(500);
    });

    it("PUT /fee-schedules/contracts/:id updates all fields", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pc-1", payer_name: "Updated" }] });
      const res = await request(app)
        .put("/fee-schedules/contracts/pc-1")
        .send({
          payerName: "Updated",
          payerId: "PAYER1",
          contractNumber: "CN-1",
          feeScheduleId: "fs-1",
          effectiveDate: "2024-01-01",
          terminationDate: "2025-01-01",
          status: "inactive",
          reimbursementType: "percent",
          reimbursementPercentage: 85,
          medicarePercentage: 90,
          timelyFilingDays: 120,
          notes: "Updated",
        });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("pc-1");
    });

    it("PUT /fee-schedules/contracts/:id handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app)
        .put("/fee-schedules/contracts/pc-1")
        .send({ payerName: "Updated" });
      expect(res.status).toBe(500);
    });

    it("DELETE /fee-schedules/contracts/:id handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).delete("/fee-schedules/contracts/pc-1");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/packages/list handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/packages/list");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/packages/:id handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(500);
    });

    it("POST /fee-schedules/packages handles database errors", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("DB error")) // insert
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app)
        .post("/fee-schedules/packages")
        .send({ name: "Starter", packagePriceCents: 15000, regularPriceCents: 20000 });
      expect(res.status).toBe(500);
    });

    it("PUT /fee-schedules/packages/:id updates all fields", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: "pkg-1", name: "Updated" }] });
      const res = await request(app)
        .put("/fee-schedules/packages/pkg-1")
        .send({
          name: "Updated",
          description: "Updated",
          packagePriceCents: 1000,
          regularPriceCents: 1500,
          isActive: false,
          validFrom: "2024-01-01",
          validUntil: "2024-12-31",
          maxUses: 3,
        });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("pkg-1");
    });

    it("PUT /fee-schedules/packages/:id handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).put("/fee-schedules/packages/pkg-1").send({ name: "Updated" });
      expect(res.status).toBe(500);
    });

    it("POST /fee-schedules/packages/:id/items handles database errors", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] })
        .mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app)
        .post("/fee-schedules/packages/pkg-1/items")
        .send({ cptCode: "11100", individualPriceCents: 1000 });
      expect(res.status).toBe(500);
    });

    it("DELETE /fee-schedules/packages/:packageId/items/:itemId handles database errors", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "pkg-1" }] })
        .mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).delete("/fee-schedules/packages/pkg-1/items/item-1");
      expect(res.status).toBe(500);
    });

    it("DELETE /fee-schedules/packages/:id handles database errors", async () => {
      const client = makeClient();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("DB error")) // delete items
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      connectMock.mockResolvedValueOnce(client);

      const res = await request(app).delete("/fee-schedules/packages/pkg-1");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/cosmetic/procedures handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/cosmetic/procedures");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/cosmetic/categories handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/cosmetic/categories");
      expect(res.status).toBe(500);
    });

    it("GET /fee-schedules/cosmetic/pricing handles database errors", async () => {
      queryMock.mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app).get("/fee-schedules/cosmetic/pricing");
      expect(res.status).toBe(500);
    });

    it("PUT /fee-schedules/cosmetic/procedures/:cptCode handles database errors", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
        .mockRejectedValueOnce(new Error("DB error"));
      const res = await request(app)
        .put("/fee-schedules/cosmetic/procedures/A1")
        .send({ feeScheduleId: "fs-1", feeCents: 1000, cptDescription: "Laser" });
      expect(res.status).toBe(500);
    });
  });
});
