import request from "supertest";
import express from "express";
import { icd10CodesRouter } from "../icd10Codes";
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
app.use("/icd10-codes", icd10CodesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("ICD-10 codes routes", () => {
  it("GET /icd10-codes returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "icd-1" }] });
    const res = await request(app).get("/icd10-codes?search=L40&category=Derm&common_only=true");
    expect(res.status).toBe(200);
    expect(res.body.icd10Codes).toHaveLength(1);
  });

  it("GET /icd10-codes returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/icd10-codes");
    expect(res.status).toBe(500);
  });

  it("GET /icd10-codes/:code returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/icd10-codes/L40.0");
    expect(res.status).toBe(404);
  });

  it("GET /icd10-codes/:code returns detail", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code: "L40.0" }] });
    const res = await request(app).get("/icd10-codes/L40.0");
    expect(res.status).toBe(200);
    expect(res.body.icd10Code.code).toBe("L40.0");
  });

  it("GET /icd10-codes/:code returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/icd10-codes/L40.0");
    expect(res.status).toBe(500);
  });
});
