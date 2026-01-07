import request from "supertest";
import express from "express";
import { availabilityRouter } from "../availability";
import { pool } from "../../db/pool";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
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
app.use("/availability", availabilityRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("Availability routes", () => {
  it("GET /availability returns availability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "avail-1", providerId: "provider-1", dayOfWeek: 1 }],
    });

    const res = await request(app).get("/availability");

    expect(res.status).toBe(200);
    expect(res.body.availability).toHaveLength(1);
  });
});
