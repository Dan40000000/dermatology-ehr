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
    expect(res.text).toContain("CPT Code,Description,Fee");
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
});
