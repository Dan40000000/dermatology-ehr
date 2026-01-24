import request from "supertest";
import express from "express";
import { patientsRouter } from "../patients";
import { pool } from "../../db/pool";
import { emitPatientUpdated } from "../../websocket/emitter";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../websocket/emitter", () => ({
  emitPatientUpdated: jest.fn(),
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
const emitMock = emitPatientUpdated as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  emitMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("Patients routes", () => {
  it("GET /patients returns patients", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }], rowCount: 1 });

    const res = await request(app).get("/patients");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
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

  it("PUT /patients/:id emits patient update when data available", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "patient-1",
            first_name: "Jane",
            last_name: "Doe",
            dob: "1990-01-01",
            phone: "555-111-2222",
            email: "jane@example.com",
            insurance: "Plan",
          },
        ],
      });

    const res = await request(app).put("/patients/patient-1").send({ email: "jane@example.com" });

    expect(res.status).toBe(200);
    expect(emitMock).toHaveBeenCalled();
  });

  it("DELETE /patients/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete("/patients/patient-1");

    expect(res.status).toBe(404);
  });

  it("DELETE /patients/:id deletes patient", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: "patient-1", first_name: "Jane", last_name: "Doe" }],
    });

    const res = await request(app).delete("/patients/patient-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("Jane Doe");
  });

  it("GET /patients/:id/appointments returns appointments", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "appt-1" }] });

    const res = await request(app).get("/patients/patient-1/appointments");

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveLength(1);
  });

  it("GET /patients/:id/encounters returns encounters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "enc-1" }] });

    const res = await request(app).get("/patients/patient-1/encounters");

    expect(res.status).toBe(200);
    expect(res.body.encounters).toHaveLength(1);
  });

  it("GET /patients/:id/prescriptions returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/patients/patient-1/prescriptions");

    expect(res.status).toBe(404);
  });

  it("GET /patients/:id/prescriptions returns summary", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "patient-1" }] })
      .mockResolvedValueOnce({
        rows: [
          { status: "active", refillsRemaining: 1, isControlled: true },
          { status: "cancelled", refillsRemaining: 0, isControlled: false },
          { status: "sent", refillsRemaining: 0, isControlled: false },
          { status: "pending", refillsRemaining: null, isControlled: false },
        ],
      });

    const res = await request(app).get("/patients/patient-1/prescriptions");

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(4);
    expect(res.body.summary.active).toBe(2);
    expect(res.body.summary.inactive).toBe(2);
    expect(res.body.summary.controlled).toBe(1);
  });

  it("GET /patients/:id/prior-auths returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pa-1" }] });

    const res = await request(app).get("/patients/patient-1/prior-auths");

    expect(res.status).toBe(200);
    expect(res.body.priorAuths).toHaveLength(1);
  });

  it("GET /patients/:id/biopsies returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "bio-1" }] });

    const res = await request(app).get("/patients/patient-1/biopsies");

    expect(res.status).toBe(200);
    expect(res.body.biopsies).toHaveLength(1);
  });

  it("GET /patients/:id/balance returns totals", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total_charges: "150" }] })
      .mockResolvedValueOnce({ rows: [{ total_payments: "50" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pay-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] });

    const res = await request(app).get("/patients/patient-1/balance");

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(100);
    expect(res.body.recentPayments).toHaveLength(1);
  });

  it("GET /patients/:id/photos returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "photo-1" }] });

    const res = await request(app).get("/patients/patient-1/photos");

    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(1);
  });

  it("GET /patients/:id/body-map returns lesions", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "lesion-1" }] });

    const res = await request(app).get("/patients/patient-1/body-map");

    expect(res.status).toBe(200);
    expect(res.body.lesions).toHaveLength(1);
  });

  it("GET /patients/:id/insurance returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/patients/patient-1/insurance");

    expect(res.status).toBe(404);
  });

  it("GET /patients/:id/insurance returns insurance and eligibility", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ insurance: "Plan", insuranceId: "id-1", insuranceGroupNumber: "g1" }],
      })
      .mockResolvedValueOnce({
        rows: [{ status: "active", checkedAt: "2025-01-01" }],
      });

    const res = await request(app).get("/patients/patient-1/insurance");

    expect(res.status).toBe(200);
    expect(res.body.insurance.insurance).toBe("Plan");
    expect(res.body.eligibility.status).toBe("active");
  });
});
