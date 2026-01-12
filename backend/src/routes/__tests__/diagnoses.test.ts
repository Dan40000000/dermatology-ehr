import request from "supertest";
import express from "express";
import { diagnosesRouter } from "../diagnoses";
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
app.use("/diagnoses", diagnosesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Diagnoses routes", () => {
  it("GET /diagnoses/encounter/:id returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "dx-1" }] });
    const res = await request(app).get("/diagnoses/encounter/enc-1");
    expect(res.status).toBe(200);
    expect(res.body.diagnoses).toHaveLength(1);
  });

  it("POST /diagnoses rejects invalid payload", async () => {
    const res = await request(app).post("/diagnoses").send({ encounterId: "enc-1" });
    expect(res.status).toBe(400);
  });

  it("POST /diagnoses creates diagnosis", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/diagnoses").send({
      encounterId: "enc-1",
      icd10Code: "L40.0",
      description: "Psoriasis vulgaris",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /diagnoses marks primary and clears existing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post("/diagnoses").send({
      encounterId: "enc-1",
      icd10Code: "L20.9",
      description: "Atopic dermatitis",
      isPrimary: true,
    });
    expect(res.status).toBe(201);
  });

  it("PUT /diagnoses/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).put("/diagnoses/dx-1").send({ isPrimary: true });
    expect(res.status).toBe(404);
  });

  it("PUT /diagnoses/:id updates primary", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ encounter_id: "enc-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put("/diagnoses/dx-1").send({ isPrimary: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /diagnoses/:id deletes diagnosis", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete("/diagnoses/dx-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /diagnoses/search/icd10 rejects missing query", async () => {
    const res = await request(app).get("/diagnoses/search/icd10");
    expect(res.status).toBe(400);
  });

  it("GET /diagnoses/search/icd10 returns codes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "L40.0" }] });
    const res = await request(app).get("/diagnoses/search/icd10?q=psoriasis");
    expect(res.status).toBe(200);
    expect(res.body.codes).toHaveLength(1);
  });
});
