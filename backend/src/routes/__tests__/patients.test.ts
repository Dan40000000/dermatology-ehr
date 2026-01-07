import request from "supertest";
import express from "express";
import { patientsRouter } from "../patients";
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
app.use("/patients", patientsRouter);

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Patients routes", () => {
  it("GET /patients returns patients", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }], rowCount: 1 });

    const res = await request(app).get("/patients");

    expect(res.status).toBe(200);
    expect(res.body.patients).toHaveLength(1);
  });

  it("POST /patients rejects invalid payload", async () => {
    const res = await request(app).post("/patients").send({ lastName: "Doe" });

    expect(res.status).toBe(400);
  });

  it("POST /patients rejects invalid dob", async () => {
    const res = await request(app).post("/patients").send({
      firstName: "Jane",
      lastName: "Doe",
      dob: "not-a-date",
    });

    expect(res.status).toBe(400);
  });

  it("POST /patients rejects invalid phone", async () => {
    const res = await request(app).post("/patients").send({
      firstName: "Jane",
      lastName: "Doe",
      phone: "123",
    });

    expect(res.status).toBe(400);
  });

  it("POST /patients creates patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patients").send({
      firstName: "Jane",
      lastName: "Doe",
      dob: "1990-01-01",
      phone: "555-222-3333",
      email: "jane@example.com",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /patients creates patient with full details", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patients").send({
      firstName: "Sam",
      lastName: "Jones",
      address: "100 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      insurance: "Derm Care",
      allergies: "None",
      medications: "Topical steroid",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("GET /patients/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/patients/patient-1");

    expect(res.status).toBe(404);
  });

  it("GET /patients/:id returns patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1", firstName: "Jane" }] });

    const res = await request(app).get("/patients/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.patient.id).toBe("patient-1");
  });

  it("GET /patients/:id returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).get("/patients/patient-1");

    expect(res.status).toBe(500);
  });

  it("PUT /patients/:id rejects invalid payload", async () => {
    const res = await request(app).put("/patients/patient-1").send({ email: "bad-email" });

    expect(res.status).toBe(400);
  });

  it("PUT /patients/:id rejects empty updates", async () => {
    const res = await request(app).put("/patients/patient-1").send({});

    expect(res.status).toBe(400);
  });

  it("PUT /patients/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put("/patients/patient-1").send({ phone: "555-444-3333" });

    expect(res.status).toBe(404);
  });

  it("PUT /patients/:id returns 500 on error", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).put("/patients/patient-1").send({ phone: "555-444-3333" });

    expect(res.status).toBe(500);
  });

  it("PUT /patients/:id updates patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }] });

    const res = await request(app).put("/patients/patient-1").send({
      phone: "555-444-3333",
      emergencyContactName: "Dad",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe("patient-1");
  });
});
