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

jest.mock("../../services/audit", () => ({
  auditPatientDataAccess: jest.fn(),
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

  it("GET /patients allows larger page sizes for the roster view", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ count: "825" }], rowCount: 1 });
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }], rowCount: 1 });

    const res = await request(app).get("/patients?limit=1000");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("limit $2 offset $3"),
      ["tenant-1", 1000, 0],
    );
    expect(res.body.meta.limit).toBe(1000);
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

  it("POST /patients accepts full SSN input for encrypted storage", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/patients").send({
      firstName: "Jane",
      lastName: "Doe",
      ssn: "123-45-6789",
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it("POST /patients rejects invalid SSN format", async () => {
    const res = await request(app).post("/patients").send({
      firstName: "Jane",
      lastName: "Doe",
      ssn: "12",
    });

    expect(res.status).toBe(400);
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

  it("POST /patients stores accessibility profile for visit prep", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const accessibilityProfile = {
      interpreterNeeded: true,
      interpreterLanguage: "ASL",
      accessibleRoomRequired: true,
      accessibleEquipment: ["height_adjustable_exam_table"],
      extendedVisit: true,
      extraVisitMinutes: 20,
    };

    const res = await request(app).post("/patients").send({
      firstName: "Riley",
      lastName: "Access",
      accessibilityProfile,
    });

    expect(res.status).toBe(201);
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("accessibility_profile"),
      expect.arrayContaining([accessibilityProfile]),
    );
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

  it("PUT /patients/:id rejects invalid SSN format", async () => {
    const res = await request(app).put("/patients/patient-1").send({ ssn: "abc" });
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

  it("PUT /patients/:id updates accessibility profile", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "patient-1" }] });

    const res = await request(app).put("/patients/patient-1").send({
      accessibilityProfile: {
        communicationSupport: ["large_print"],
        mobilityAssistance: true,
      },
    });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("accessibility_profile = $1"),
      expect.arrayContaining([
        expect.objectContaining({
          communicationSupport: ["large_print"],
          mobilityAssistance: true,
        }),
      ]),
    );
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

  it("GET /patients/:id/clinical-summary returns diagnoses and recalls", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: "dx-1", icd10Code: "C43.9", description: "Malignant melanoma" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "recall-1", recallType: "Melanoma Surveillance", status: "pending" }],
      });

    const res = await request(app).get("/patients/patient-1/clinical-summary");

    expect(res.status).toBe(200);
    expect(res.body.diagnoses).toHaveLength(1);
    expect(res.body.recalls).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain("FROM encounter_diagnoses ed");
    expect(queryMock.mock.calls[1][0]).toContain("FROM patient_recalls pr");
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
      .mockResolvedValueOnce({
        rows: [{ billed_charges: "120", outstanding_balance: "120", past_due_balance: "20" }],
      })
      .mockResolvedValueOnce({ rows: [{ unbilled_charges: "30" }] })
      .mockResolvedValueOnce({ rows: [{ total_payments: "50" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pay-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "charge-1", amount: "50" }] });

    const res = await request(app).get("/patients/patient-1/balance");

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(150);
    expect(res.body.currentBalance).toBe(130);
    expect(res.body.pastDueBalance).toBe(20);
    expect(res.body.recentPayments).toHaveLength(1);
    expect(res.body.recentCharges).toHaveLength(1);
    expect(queryMock.mock.calls[1][0]).toContain("LEFT JOIN encounters e");
    expect(queryMock.mock.calls[1][0]).toContain("COALESCE(e.patient_id, NULLIF(to_jsonb(c)->>'patient_id', '')) = $1");
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
