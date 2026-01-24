import request from "supertest";
import express from "express";
import { prescriptionsRouter } from "../prescriptions";
import { pool } from "../../db/pool";
import {
  validatePrescription,
  checkDrugInteractions,
  checkAllergies,
} from "../../services/prescriptionValidator";
import {
  sendNewRx,
  checkFormulary,
  getPatientBenefits,
} from "../../services/surescriptsService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1" };
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

jest.mock("../../services/prescriptionValidator", () => ({
  validatePrescription: jest.fn(),
  checkDrugInteractions: jest.fn(),
  checkAllergies: jest.fn(),
}));

jest.mock("../../services/surescriptsService", () => ({
  sendNewRx: jest.fn(),
  checkFormulary: jest.fn(),
  getPatientBenefits: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/prescriptions", prescriptionsRouter);

const queryMock = pool.query as jest.Mock;
const validateMock = validatePrescription as jest.Mock;
const interactionsMock = checkDrugInteractions as jest.Mock;
const allergiesMock = checkAllergies as jest.Mock;
const sendNewRxMock = sendNewRx as jest.Mock;
const checkFormularyMock = checkFormulary as jest.Mock;
const getBenefitsMock = getPatientBenefits as jest.Mock;

const uuid = "11111111-1111-1111-8111-111111111111";
const uuid2 = "22222222-2222-2222-8222-222222222222";
const uuid3 = "33333333-3333-3333-8333-333333333333";

beforeEach(() => {
  queryMock.mockReset();
  validateMock.mockReset();
  interactionsMock.mockReset();
  allergiesMock.mockReset();
  sendNewRxMock.mockReset();
  checkFormularyMock.mockReset();
  getBenefitsMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  validateMock.mockReturnValue({ valid: true, errors: [], warnings: [] });
  interactionsMock.mockResolvedValue([]);
  allergiesMock.mockResolvedValue([]);
  sendNewRxMock.mockResolvedValue({ success: true, messageId: "msg-1" });
  checkFormularyMock.mockResolvedValue({ covered: true });
  getBenefitsMock.mockResolvedValue({ plan: "basic" });
});

describe("Prescription routes", () => {
  it("GET /prescriptions returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get("/prescriptions").query({ patientId: uuid });

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
  });

  it("GET /prescriptions/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/prescriptions/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("GET /prescriptions/:id returns prescription", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get(`/prescriptions/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.prescription.id).toBe("rx-1");
  });

  it("GET /prescriptions/patient/:patientId returns list", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get(`/prescriptions/patient/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
  });

  it("POST /prescriptions validates body", async () => {
    const res = await request(app).post("/prescriptions").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/prescriptions").send({
      patientId: uuid,
      medicationName: "Test Med",
      sig: "Take 1",
      quantity: 30,
      refills: 1,
    });

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions returns 400 when encounter mismatch", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [{ id: uuid2, patient_id: uuid3 }] });

    const res = await request(app).post("/prescriptions").send({
      patientId: uuid,
      encounterId: uuid2,
      medicationName: "Test Med",
      sig: "Take 1",
      quantity: 30,
      refills: 1,
    });

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions returns validation errors", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: uuid }] });
    validateMock.mockReturnValueOnce({ valid: false, errors: ["bad"], warnings: ["warn"] });

    const res = await request(app).post("/prescriptions").send({
      patientId: uuid,
      medicationName: "Test Med",
      sig: "Take 1",
      quantity: 30,
      refills: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.validationErrors).toEqual(["bad"]);
  });

  it("POST /prescriptions creates prescription with warnings", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [{ id: uuid2, patient_id: uuid }] })
      .mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "med-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    validateMock.mockReturnValueOnce({ valid: true, errors: [], warnings: [] });
    interactionsMock.mockResolvedValueOnce(["interaction"]);
    allergiesMock.mockResolvedValueOnce(["allergy"]);

    const res = await request(app).post("/prescriptions").send({
      patientId: uuid,
      encounterId: uuid2,
      medicationId: uuid3,
      medicationName: "Test Med",
      sig: "Take 1",
      quantity: 30,
      refills: 1,
      pharmacyId: uuid,
    });

    expect(res.status).toBe(201);
    expect(res.body.validationWarnings).toEqual(["interaction", "allergy"]);
  });

  it("PUT /prescriptions/:id rejects empty updates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "pending" }] });

    const res = await request(app).put(`/prescriptions/${uuid}`).send({});

    expect(res.status).toBe(400);
  });

  it("PUT /prescriptions/:id rejects sent prescriptions", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "sent" }] });

    const res = await request(app).put(`/prescriptions/${uuid}`).send({ sig: "Take 2" });

    expect(res.status).toBe(400);
  });

  it("PUT /prescriptions/:id updates prescription", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put(`/prescriptions/${uuid}`).send({
      sig: "Take 2",
      pharmacyId: uuid,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("DELETE /prescriptions/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete(`/prescriptions/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("DELETE /prescriptions/:id cancels prescription", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete(`/prescriptions/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /prescriptions/send-erx requires fields", async () => {
    const res = await request(app).post("/prescriptions/send-erx").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/send-erx returns 404 when missing prescription", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/prescriptions/send-erx").send({
      prescriptionId: uuid,
      pharmacyNcpdp: "NCPDP1",
    });

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/send-erx rejects cancelled prescriptions", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ status: "cancelled" }] });

    const res = await request(app).post("/prescriptions/send-erx").send({
      prescriptionId: uuid,
      pharmacyNcpdp: "NCPDP1",
    });

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/send-erx returns 404 when pharmacy missing", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: "pending",
            medication_name: "Med",
            sig: "Take 1",
            quantity: 1,
            quantity_unit: "each",
            refills: 1,
            days_supply: 30,
            daw: false,
            is_controlled: false,
            dea_schedule: null,
            first_name: "Pat",
            last_name: "Ent",
            date_of_birth: "1990-01-01",
            gender: "F",
            provider_name: "Dr",
            provider_npi: "1111111111",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/prescriptions/send-erx").send({
      prescriptionId: uuid,
      pharmacyNcpdp: "NCPDP1",
    });

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/send-erx handles transmission failure", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: "pending",
            medication_name: "Med",
            sig: "Take 1",
            quantity: 1,
            quantity_unit: "each",
            refills: 1,
            days_supply: 30,
            daw: false,
            is_controlled: false,
            dea_schedule: null,
            first_name: "Pat",
            last_name: "Ent",
            date_of_birth: "1990-01-01",
            gender: "F",
            provider_name: "Dr",
            provider_npi: "1111111111",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "pharm-1", name: "Pharmacy" }] })
      .mockResolvedValueOnce({ rows: [] });
    sendNewRxMock.mockResolvedValueOnce({ success: false, error: "fail" });

    const res = await request(app).post("/prescriptions/send-erx").send({
      prescriptionId: uuid,
      pharmacyNcpdp: "NCPDP1",
    });

    expect(res.status).toBe(500);
  });

  it("POST /prescriptions/send-erx sends prescription", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            status: "pending",
            medication_name: "Med",
            sig: "Take 1",
            quantity: 1,
            quantity_unit: "each",
            refills: 1,
            days_supply: 30,
            daw: false,
            is_controlled: false,
            dea_schedule: null,
            first_name: "Pat",
            last_name: "Ent",
            date_of_birth: "1990-01-01",
            gender: "F",
            provider_name: "Dr",
            provider_npi: "1111111111",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "pharm-1", name: "Pharmacy" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    sendNewRxMock.mockResolvedValueOnce({ success: true, messageId: "msg-1" });

    const res = await request(app).post("/prescriptions/send-erx").send({
      prescriptionId: uuid,
      pharmacyNcpdp: "NCPDP1",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /prescriptions/check-formulary requires medication name", async () => {
    const res = await request(app).post("/prescriptions/check-formulary").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/check-formulary returns formulary", async () => {
    checkFormularyMock.mockResolvedValueOnce({ covered: true, tier: 1 });

    const res = await request(app).post("/prescriptions/check-formulary").send({
      medicationName: "Test Med",
      payerId: "payer-1",
    });

    expect(res.status).toBe(200);
    expect(res.body.covered).toBe(true);
  });

  it("GET /prescriptions/patient-benefits/:patientId returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/prescriptions/patient-benefits/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("GET /prescriptions/patient-benefits/:patientId returns 404 when no benefits", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: uuid }] });
    getBenefitsMock.mockResolvedValueOnce(null);

    const res = await request(app).get(`/prescriptions/patient-benefits/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("GET /prescriptions/patient-benefits/:patientId returns benefits", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: uuid }] });
    getBenefitsMock.mockResolvedValueOnce({ plan: "basic" });

    const res = await request(app).get(`/prescriptions/patient-benefits/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe("basic");
  });

  it("POST /prescriptions/:id/send returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/send`);

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/:id/send requires pharmacy NCPDP", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: uuid, ncpdp_id: null, pharmacy_ncpdp: null }],
    });

    const res = await request(app).post(`/prescriptions/${uuid}/send`);

    expect(res.status).toBe(400);
  });

  it("GET /prescriptions/refill-requests returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get("/prescriptions/refill-requests");

    expect(res.status).toBe(200);
    expect(res.body.refillRequests).toHaveLength(1);
  });

  it("POST /prescriptions/:id/refill-deny requires reason", async () => {
    const res = await request(app).post(`/prescriptions/${uuid}/refill-deny`).send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/:id/refill-deny returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/refill-deny`).send({ reason: "No" });

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/:id/refill-deny denies refill", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/refill-deny`).send({ reason: "No" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /prescriptions/:id/change-request requires details", async () => {
    const res = await request(app).post(`/prescriptions/${uuid}/change-request`).send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/:id/change-request returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/change-request`).send({
      changeType: "dose",
      details: "Update dose",
    });

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/:id/change-request submits change request", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/change-request`).send({
      changeType: "dose",
      details: "Update dose",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /prescriptions/:id/audit-confirm returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/audit-confirm`);

    expect(res.status).toBe(404);
  });

  it("POST /prescriptions/:id/audit-confirm records audit", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post(`/prescriptions/${uuid}/audit-confirm`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /prescriptions supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get("/prescriptions").query({
      patientId: uuid,
      status: "pending",
      providerId: uuid2,
      erxStatus: "success",
      isControlled: "true",
      writtenDateFrom: "2024-01-01",
      writtenDateTo: "2024-02-01",
      startDate: "2024-01-01",
      endDate: "2024-02-01",
      search: "test",
    });

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
  });

  it("GET /prescriptions/refill-requests supports filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app)
      .get("/prescriptions/refill-requests")
      .query({ status: "pending", patientId: uuid });

    expect(res.status).toBe(200);
    expect(res.body.refillRequests).toHaveLength(1);
  });

  it("GET /prescriptions/encounter/:encounterId returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/prescriptions/encounter/${uuid}`);

    expect(res.status).toBe(404);
  });

  it("GET /prescriptions/encounter/:encounterId returns list", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: uuid }] })
      .mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });

    const res = await request(app).get(`/prescriptions/encounter/${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
  });

  it("GET /prescriptions/:id/refill-history returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/prescriptions/${uuid}/refill-history`);

    expect(res.status).toBe(404);
  });

  it("GET /prescriptions/:id/refill-history returns history", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: uuid,
            patient_id: uuid2,
            medication_name: "Test Med",
            refills: 2,
            refills_remaining: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ filled_date: "2024-01-01" }] });

    const res = await request(app).get(`/prescriptions/${uuid}/refill-history`);

    expect(res.status).toBe(200);
    expect(res.body.refills).toHaveLength(1);
    expect(res.body.summary.refillsUsed).toBe(1);
  });

  it("POST /prescriptions/:id/send returns redirect details", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: uuid, ncpdp_id: "NCPDP1", pharmacy_ncpdp: null }],
    });

    const res = await request(app).post(`/prescriptions/${uuid}/send`);

    expect(res.status).toBe(200);
    expect(res.body.redirectTo).toBe("/api/prescriptions/send-erx");
    expect(res.body.body.prescriptionId).toBe(uuid);
  });

  it("POST /prescriptions/bulk/send-erx validates payload", async () => {
    const res = await request(app).post("/prescriptions/bulk/send-erx").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/send-erx rejects too many", async () => {
    const res = await request(app)
      .post("/prescriptions/bulk/send-erx")
      .send({ prescriptionIds: Array.from({ length: 51 }, (_, i) => `rx-${i}`) });

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/send-erx returns mixed results", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // insert batch
      .mockResolvedValueOnce({ rows: [] }) // missing
      .mockResolvedValueOnce({ rows: [{ ncpdp_id: null, pharmacy_ncpdp: null, status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ ncpdp_id: "N1", pharmacy_ncpdp: null, status: "cancelled" }] })
      .mockResolvedValueOnce({ rows: [{ ncpdp_id: "N1", pharmacy_ncpdp: null, status: "sent" }] })
      .mockResolvedValueOnce({ rows: [{ ncpdp_id: "N1", pharmacy_ncpdp: null, status: "pending" }] })
      .mockResolvedValueOnce({ rows: [] }) // update success
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // update batch

    const res = await request(app).post("/prescriptions/bulk/send-erx").send({
      prescriptionIds: ["missing", "no-ncpdp", "cancelled", "sent", "ok"],
    });

    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(1);
    expect(res.body.failureCount).toBe(4);
  });

  it("POST /prescriptions/bulk/print validates payload", async () => {
    const res = await request(app).post("/prescriptions/bulk/print").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/print rejects too many", async () => {
    const res = await request(app)
      .post("/prescriptions/bulk/print")
      .send({ prescriptionIds: Array.from({ length: 101 }, (_, i) => `rx-${i}`) });

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/print returns success", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/prescriptions/bulk/print").send({
      prescriptionIds: ["rx-1", "rx-2"],
    });

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(2);
  });

  it("POST /prescriptions/bulk/refill validates payload", async () => {
    const res = await request(app).post("/prescriptions/bulk/refill").send({});

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/refill rejects too many", async () => {
    const res = await request(app)
      .post("/prescriptions/bulk/refill")
      .send({ prescriptionIds: Array.from({ length: 51 }, (_, i) => `rx-${i}`) });

    expect(res.status).toBe(400);
  });

  it("POST /prescriptions/bulk/refill returns mixed results", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // insert batch
      .mockResolvedValueOnce({ rows: [] }) // missing
      .mockResolvedValueOnce({ rows: [{ refills: 0 }] }) // no refills
      .mockResolvedValueOnce({ rows: [{ refills: 2 }] }) // ok
      .mockResolvedValueOnce({ rows: [] }) // insert new
      .mockResolvedValueOnce({ rows: [] }); // update batch

    const res = await request(app).post("/prescriptions/bulk/refill").send({
      prescriptionIds: ["missing", "no-refills", "ok"],
    });

    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(1);
    expect(res.body.failureCount).toBe(2);
  });
});
