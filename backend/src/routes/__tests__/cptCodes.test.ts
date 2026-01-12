import request from "supertest";
import express from "express";
import { cptCodesRouter } from "../cptCodes";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "admin" };
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
app.use("/cpt-codes", cptCodesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("CPT codes routes", () => {
  it("GET /cpt-codes returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cpt-1" }] });
    const res = await request(app).get("/cpt-codes?search=111&category=biopsy&common_only=true");
    expect(res.status).toBe(200);
    expect(res.body.cptCodes).toHaveLength(1);
  });

  it("GET /cpt-codes returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/cpt-codes");
    expect(res.status).toBe(500);
  });

  it("GET /cpt-codes/:code returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/cpt-codes/11100");
    expect(res.status).toBe(404);
  });

  it("GET /cpt-codes/:code returns detail", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "cpt-1", code: "11100" }] });
    const res = await request(app).get("/cpt-codes/11100");
    expect(res.status).toBe(200);
    expect(res.body.cptCode.code).toBe("11100");
  });

  it("GET /cpt-codes/:code returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/cpt-codes/11100");
    expect(res.status).toBe(500);
  });
});
