import request from "supertest";
import express from "express";
import { erxRouter } from "../erx";
import { pool } from "../../db/pool";
import { getRxHistory, checkFormulary, getPatientBenefits } from "../../services/surescriptsService";
import {
  checkDrugDrugInteractions,
  checkDrugAllergyInteractions,
  comprehensiveSafetyCheck,
} from "../../services/drugInteractionService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../services/surescriptsService", () => ({
  getRxHistory: jest.fn(),
  checkFormulary: jest.fn(),
  getPatientBenefits: jest.fn(),
}));

jest.mock("../../services/drugInteractionService", () => ({
  checkDrugDrugInteractions: jest.fn(),
  checkDrugAllergyInteractions: jest.fn(),
  comprehensiveSafetyCheck: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/erx", erxRouter);

const queryMock = pool.query as jest.Mock;
const historyMock = getRxHistory as jest.Mock;
const formularyMock = checkFormulary as jest.Mock;
const benefitsMock = getPatientBenefits as jest.Mock;
const drugInteractionMock = checkDrugDrugInteractions as jest.Mock;
const allergyInteractionMock = checkDrugAllergyInteractions as jest.Mock;
const safetyMock = comprehensiveSafetyCheck as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  historyMock.mockReset();
  formularyMock.mockReset();
  benefitsMock.mockReset();
  drugInteractionMock.mockReset();
  allergyInteractionMock.mockReset();
  safetyMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("eRx routes", () => {
  it("GET /erx/drugs/search rejects short query", async () => {
    const res = await request(app).get("/erx/drugs/search?q=a");
    expect(res.status).toBe(400);
  });

  it("GET /erx/drugs/search returns results", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "drug-1" }] });
    const res = await request(app).get("/erx/drugs/search?q=iso&category=Acne&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.drugs).toHaveLength(1);
  });

  it("GET /erx/drugs/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/erx/drugs/drug-1");
    expect(res.status).toBe(404);
  });

  it("GET /erx/drugs/:id returns detail", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "drug-1" }] });
    const res = await request(app).get("/erx/drugs/drug-1");
    expect(res.status).toBe(200);
    expect(res.body.drug.id).toBe("drug-1");
  });

  it("GET /erx/drugs/list/categories returns categories", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ category: "Acne" }] });
    const res = await request(app).get("/erx/drugs/list/categories");
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual(["Acne"]);
  });

  it("GET /erx/pharmacies/search uses proximity search", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] });
    const res = await request(app).get("/erx/pharmacies/search?lat=33.1&lon=-84.5&radius=5");
    expect(res.status).toBe(200);
    expect(res.body.searchType).toBe("proximity");
  });

  it("GET /erx/pharmacies/search uses text search", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] });
    const res = await request(app).get("/erx/pharmacies/search?q=CVS&city=City&state=GA");
    expect(res.status).toBe(200);
    expect(res.body.searchType).toBe("text");
  });

  it("GET /erx/pharmacies/preferred returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] });
    const res = await request(app).get("/erx/pharmacies/preferred");
    expect(res.status).toBe(200);
    expect(res.body.pharmacies).toHaveLength(1);
  });

  it("GET /erx/pharmacies/ncpdp/:id returns 404", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/erx/pharmacies/ncpdp/123");
    expect(res.status).toBe(404);
  });

  it("GET /erx/pharmacies/ncpdp/:id returns pharmacy", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "pharm-1" }] });
    const res = await request(app).get("/erx/pharmacies/ncpdp/123");
    expect(res.status).toBe(200);
    expect(res.body.pharmacy.id).toBe("pharm-1");
  });

  it("GET /erx/patients/:id/medication-history returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/erx/patients/p1/medication-history");
    expect(res.status).toBe(404);
  });

  it("GET /erx/patients/:id/medication-history returns history", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "p1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });
    historyMock.mockResolvedValueOnce({ medications: [{ id: "ext-1" }] });

    const res = await request(app).get("/erx/patients/p1/medication-history");
    expect(res.status).toBe(200);
    expect(res.body.combinedCount).toBe(2);
  });

  it("GET /erx/patients/:id/current-medications returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "rx-1" }] });
    const res = await request(app).get("/erx/patients/p1/current-medications");
    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(1);
  });

  it("POST /erx/check-interactions validates payload", async () => {
    const res = await request(app).post("/erx/check-interactions").send({});
    expect(res.status).toBe(400);
  });

  it("POST /erx/check-interactions returns interactions", async () => {
    drugInteractionMock.mockResolvedValueOnce([{ severity: "severe" }]);
    const res = await request(app)
      .post("/erx/check-interactions")
      .send({ medicationName: "Drug", patientId: "p1" });
    expect(res.status).toBe(200);
    expect(res.body.hasSevere).toBe(true);
  });

  it("POST /erx/check-allergies validates payload", async () => {
    const res = await request(app).post("/erx/check-allergies").send({});
    expect(res.status).toBe(400);
  });

  it("POST /erx/check-allergies returns allergies", async () => {
    allergyInteractionMock.mockResolvedValueOnce([{ allergen: "Peanut" }]);
    const res = await request(app)
      .post("/erx/check-allergies")
      .send({ medicationName: "Drug", patientId: "p1" });
    expect(res.status).toBe(200);
    expect(res.body.hasAllergy).toBe(true);
  });

  it("POST /erx/safety-check validates payload", async () => {
    const res = await request(app).post("/erx/safety-check").send({});
    expect(res.status).toBe(400);
  });

  it("POST /erx/safety-check returns response", async () => {
    safetyMock.mockResolvedValueOnce({ ok: true });
    const res = await request(app)
      .post("/erx/safety-check")
      .send({ medicationName: "Drug", patientId: "p1" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /erx/check-formulary validates payload", async () => {
    const res = await request(app).post("/erx/check-formulary").send({});
    expect(res.status).toBe(400);
  });

  it("POST /erx/check-formulary returns result", async () => {
    formularyMock.mockResolvedValueOnce({ covered: true });
    const res = await request(app)
      .post("/erx/check-formulary")
      .send({ medicationName: "Drug", payerId: "payer-1" });
    expect(res.status).toBe(200);
    expect(res.body.covered).toBe(true);
  });

  it("GET /erx/patients/:id/benefits returns 404 when patient missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/erx/patients/p1/benefits");
    expect(res.status).toBe(404);
  });

  it("GET /erx/patients/:id/benefits returns 404 when no benefits", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "p1" }] });
    benefitsMock.mockResolvedValueOnce(null);
    const res = await request(app).get("/erx/patients/p1/benefits");
    expect(res.status).toBe(404);
  });

  it("GET /erx/patients/:id/benefits returns benefits", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "p1" }] });
    benefitsMock.mockResolvedValueOnce({ coverage: "active" });
    const res = await request(app).get("/erx/patients/p1/benefits");
    expect(res.status).toBe(200);
    expect(res.body.coverage).toBe("active");
  });

  it("GET /erx/patients/:id/allergies returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "all-1" }] });
    const res = await request(app).get("/erx/patients/p1/allergies");
    expect(res.status).toBe(200);
    expect(res.body.allergies).toHaveLength(1);
  });
});
