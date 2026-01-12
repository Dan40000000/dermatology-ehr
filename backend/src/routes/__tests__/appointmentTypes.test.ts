import request from "supertest";
import express from "express";
import { appointmentTypesRouter } from "../appointmentTypes";
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
app.use("/appointment-types", appointmentTypesRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Appointment types routes", () => {
  it("GET /appointment-types returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "type-1" }] });
    const res = await request(app).get("/appointment-types");
    expect(res.status).toBe(200);
    expect(res.body.appointmentTypes).toHaveLength(1);
  });
});
