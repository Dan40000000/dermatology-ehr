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

  it("POST /appointment-types creates an appointment type", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "type-1",
            name: "General Dermatology Visit",
            durationMinutes: 30,
            isActive: true,
          },
        ],
      });

    const res = await request(app)
      .post("/appointment-types")
      .send({ name: "General Dermatology Visit", durationMinutes: 30 });

    expect(res.status).toBe(201);
    expect(res.body.appointmentType).toMatchObject({
      id: "type-1",
      name: "General Dermatology Visit",
      durationMinutes: 30,
    });
    expect(queryMock.mock.calls[1][0]).toContain("INSERT INTO appointment_types");
  });

  it("POST /appointment-types rejects duplicate names", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "type-1" }], rowCount: 1 });

    const res = await request(app)
      .post("/appointment-types")
      .send({ name: "General Dermatology Visit", durationMinutes: 30 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });
});
