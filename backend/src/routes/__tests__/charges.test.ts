import request from "supertest";
import express from "express";
import { chargesRouter } from "../charges";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
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

const app = express();
app.use(express.json());
app.use("/charges", chargesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Charges routes", () => {
  it("GET /charges returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "charge-1" }] });
    const res = await request(app).get("/charges");
    expect(res.status).toBe(200);
    expect(res.body.charges).toHaveLength(1);
  });

  it("GET /charges/encounter/:id returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "charge-1" }] });
    const res = await request(app).get("/charges/encounter/enc-1");
    expect(res.status).toBe(200);
    expect(res.body.charges).toHaveLength(1);
  });

  it("POST /charges rejects invalid payload", async () => {
    const res = await request(app).post("/charges").send({ amountCents: 100 });
    expect(res.status).toBe(400);
  });

  it("POST /charges creates charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/charges").send({
      cptCode: "11100",
      amountCents: 12000,
      description: "Biopsy",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /charges accepts self_pay status for cosmetic work", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/charges").send({
      cptCode: "COSLHR",
      amountCents: 32000,
      description: "Laser hair removal - Full Face",
      status: "self_pay",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("PUT /charges/:id rejects empty updates", async () => {
    const res = await request(app).put("/charges/charge-1").send({});
    expect(res.status).toBe(400);
  });

  it("PUT /charges/:id updates charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/charges/charge-1").send({ status: "paid" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /charges/:id deletes charge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/charges/charge-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /charges/search/cpt rejects missing query", async () => {
    const res = await request(app).get("/charges/search/cpt");
    expect(res.status).toBe(400);
  });

  it("GET /charges/search/cpt returns codes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "11100" }] });
    const res = await request(app).get("/charges/search/cpt?q=111");
    expect(res.status).toBe(200);
    expect(res.body.codes).toHaveLength(1);
  });
});
