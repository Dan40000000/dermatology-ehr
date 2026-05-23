import request from "supertest";
import express from "express";
import { claimsRouter } from "../claims";
import { pool } from "../../db/pool";
import { auditLog } from "../../services/audit";
import { scrubClaim, applyAutoFixes, getPassedChecks } from "../../services/claimScrubber";
import { suggestModifiers, getAllModifierRules, getModifierInfo } from "../../services/modifierEngine";
import { billingService } from "../../services/billingService";

jest.mock("../../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", tenantId: "tenant-1", role: "provider" };
    return next();
  },
}));

jest.mock("../../middleware/rbac", () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../services/audit", () => ({
  auditLog: jest.fn(),
}));

jest.mock("../../services/claimScrubber", () => ({
  scrubClaim: jest.fn(),
  applyAutoFixes: jest.fn(),
  getPassedChecks: jest.fn(),
}));

jest.mock("../../services/modifierEngine", () => ({
  suggestModifiers: jest.fn(),
  getAllModifierRules: jest.fn(),
  getModifierInfo: jest.fn(),
}));

jest.mock("../../services/billingService", () => ({
  billingService: {
    createClaimFromCharges: jest.fn(),
  },
}));

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/claims", claimsRouter);

const queryMock = pool.query as jest.Mock;
const auditMock = auditLog as jest.Mock;
const scrubMock = scrubClaim as jest.Mock;
const applyFixesMock = applyAutoFixes as jest.Mock;
const passedChecksMock = getPassedChecks as jest.Mock;
const suggestModifiersMock = suggestModifiers as jest.Mock;
const getAllModifierRulesMock = getAllModifierRules as jest.Mock;
const getModifierInfoMock = getModifierInfo as jest.Mock;
const createClaimFromChargesMock = billingService.createClaimFromCharges as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  auditMock.mockReset();
  scrubMock.mockReset();
  applyFixesMock.mockReset();
  passedChecksMock.mockReset();
  suggestModifiersMock.mockReset();
  getAllModifierRulesMock.mockReset();
  getModifierInfoMock.mockReset();
  createClaimFromChargesMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  passedChecksMock.mockReturnValue([]);
  suggestModifiersMock.mockResolvedValue([]);
  getAllModifierRulesMock.mockResolvedValue([]);
  getModifierInfoMock.mockResolvedValue(null);
});

const readyClaimScrubRow = {
  id: "claim-1",
  tenant_id: "tenant-1",
  patient_id: "patient-1",
  service_date: "2025-01-01",
  line_items: [
    {
      cpt: "99213",
      dx: ["L70.0"],
      diagnosisPointers: ["A"],
      units: 1,
      charge: 100,
      billingRoute: "insurance",
    },
  ],
  payer_id: "payer-1",
  payer_name: "Payer",
  payer: "Payer",
  is_cosmetic: false,
  patient_first_name: "Ava",
  patient_last_name: "Jones",
  patient_dob: "1990-01-01",
  patient_address: "1 Main St",
  patient_city: "Denver",
  patient_state: "CO",
  patient_zip: "80202",
  insurance_member_id: "M123",
  provider_id: "provider-1",
  provider_name: "Dr. Demo",
  provider_npi: "1234567890",
  place_of_service: "11",
};

const cleanScrubResult = {
  status: "clean",
  errors: [],
  warnings: [],
  info: [],
  canSubmit: true,
};

describe("Claims routes", () => {
  it("GET /claims returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "claim-1" }] });
    const res = await request(app).get("/claims");
    expect(res.status).toBe(200);
    expect(res.body.claims).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('iv.verification_status as "eligibilityStatus"'),
      ["tenant-1"],
    );
  });

  it("GET /claims/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get("/claims/claim-1");
    expect(res.status).toBe(404);
  });

  it("GET /claims/:id returns claim details", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "claim-1", encounterId: "enc-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "diag-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "charge-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "pay-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "hist-1" }] });
    const res = await request(app).get("/claims/claim-1");
    expect(res.status).toBe(200);
    expect(res.body.claim.id).toBe("claim-1");
    expect(res.body.diagnoses).toHaveLength(1);
    expect(res.body.charges).toHaveLength(1);
  });

  it("POST /claims rejects invalid payload", async () => {
    const res = await request(app).post("/claims").send({});
    expect(res.status).toBe(400);
  });

  it("POST /claims creates encounter claim through billing service", async () => {
    createClaimFromChargesMock.mockResolvedValueOnce({
      id: "claim-from-billing",
      claimNumber: "CLM-1",
    });

    const res = await request(app).post("/claims").send({
      patientId: "patient-1",
      encounterId: "enc-1",
      payer: "Test Payer",
      payerId: "payer-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("claim-from-billing");
    expect(createClaimFromChargesMock).toHaveBeenCalledWith("tenant-1", "enc-1", "user-1");
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining("insert into claims"), expect.anything());
  });

  it("POST /claims creates manual line-item claim", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // insurance lookup
      .mockResolvedValueOnce({ rows: [] }) // insert claim
      .mockResolvedValueOnce({ rows: [] }) // diagnosis
      .mockResolvedValueOnce({ rows: [] }) // claim line
      .mockResolvedValueOnce({ rows: [] }) // claim charge
      .mockResolvedValueOnce({ rows: [] }); // status history

    const res = await request(app).post("/claims").send({
      patientId: "patient-1",
      payer: "Test Payer",
      payerId: "payer-1",
      lineItems: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100, description: "Office visit" }],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(createClaimFromChargesMock).not.toHaveBeenCalled();
    const insertClaimCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("insert into claims"),
    );
    expect(insertClaimCall?.[1]).toEqual(expect.arrayContaining(["coding_review"]));
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /claims falls back to legacy patient insurance for manual line-item claims", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          insurance_payer_id: null,
          insurance_plan_name: null,
          insurance: "Blue Cross Blue Shield of Colorado",
          insurance_details: null,
          payer_name: null,
          payer_id: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/claims").send({
      patientId: "patient-1",
      lineItems: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100, description: "Office visit" }],
    });

    expect(res.status).toBe(201);
    const insertClaimCall = queryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("insert into claims"),
    );
    expect(insertClaimCall?.[1]).toEqual(expect.arrayContaining(["Blue Cross Blue Shield of Colorado"]));
  });

  it("PUT /claims/:id/status rejects invalid payload", async () => {
    const res = await request(app).put("/claims/claim-1/status").send({ status: "bad" });
    expect(res.status).toBe(400);
  });

  it("PUT /claims/:id/status returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).put("/claims/claim-1/status").send({ status: "submitted" });
    expect(res.status).toBe(404);
  });

  it("PUT /claims/:id/status updates claim", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "claim-1", status: "ready" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [readyClaimScrubRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    scrubMock.mockResolvedValueOnce(cleanScrubResult);
    const res = await request(app).put("/claims/claim-1/status").send({ status: "submitted", notes: "ok" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PUT /claims/:id/status blocks submission before coding release", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "claim-1", status: "coding_review" }] });
    const res = await request(app).put("/claims/claim-1/status").send({ status: "submitted" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("coding review");
  });

  it("POST /claims/:id/release releases claim for submission", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "coding_review", scrub_status: "clean", payer: "Payer" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [readyClaimScrubRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    scrubMock.mockResolvedValueOnce(cleanScrubResult);

    const res = await request(app).post("/claims/claim-1/release").send({ notes: "reviewed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(auditMock).toHaveBeenCalledWith("tenant-1", "user-1", "claim_coding_review_released", "claim", "claim-1");
  });

  it("POST /claims/:id/release hydrates missing payer from patient insurance before release", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "coding_review", scrub_status: "clean", payer: null, payer_id: null, payer_name: null }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", patient_id: "patient-1", payer: null, payer_id: null, payer_name: null }],
      })
      .mockResolvedValueOnce({
        rows: [{
          insurance_payer_id: null,
          insurance_plan_name: null,
          insurance: "United Healthcare",
          insurance_details: null,
          payer_name: null,
          payer_id: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "claim-1", patient_id: "patient-1", payer: "United Healthcare", payer_id: null, payer_name: "United Healthcare" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [readyClaimScrubRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    scrubMock.mockResolvedValueOnce(cleanScrubResult);

    const res = await request(app).post("/claims/claim-1/release").send({ notes: "reviewed" });

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("SET payer = COALESCE"),
      expect.arrayContaining(["United Healthcare"]),
    );
  });

  it("POST /claims/:id/payments returns 404 when claim missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post("/claims/claim-1/payments").send({
      amountCents: 1000,
      paymentDate: "2025-01-01",
    });
    expect(res.status).toBe(404);
  });

  it("POST /claims/:id/payments posts payment", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "submitted" }] })
      .mockResolvedValueOnce({ rows: [] }) // insert payment
      .mockResolvedValueOnce({ rows: [{ totalPaid: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ totalCents: 1000 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post("/claims/claim-1/payments").send({
      amountCents: 1000,
      paymentDate: "2025-01-01",
      paymentMethod: "check",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /claims/diagnosis-codes applies filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "dx-1" }] });

    const res = await request(app).get("/claims/diagnosis-codes?search=mel&category=skin&common=true");

    expect(res.status).toBe(200);
    expect(res.body.diagnosisCodes).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("is_common = true"),
      ["skin", "%mel%"]
    );
  });

  it("PUT /claims/:id returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).put("/claims/claim-1").send({
      lineItems: [{ cpt: "11111", dx: ["D1"], units: 1, charge: 50 }],
    });

    expect(res.status).toBe(404);
  });

  it("PUT /claims/:id updates claim", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "claim-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put("/claims/claim-1").send({
      lineItems: [{ cpt: "11111", dx: ["D1"], units: 2, charge: 50 }],
      isCosmetic: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("POST /claims/scrub returns 404 when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app).post("/claims/scrub").send({ claimId: "claim-1" });

    expect(res.status).toBe(404);
  });

  it("POST /claims/scrub returns scrub results", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "claim-1",
            tenant_id: "tenant-1",
            patient_id: "patient-1",
            service_date: "2025-01-01",
            line_items: [],
            payer_id: "payer-1",
            payer_name: "Payer",
            is_cosmetic: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    scrubMock.mockResolvedValueOnce({
      status: "warnings",
      errors: [],
      warnings: ["w1"],
      info: [],
    });
    passedChecksMock.mockReturnValueOnce(["check-1"]);

    const res = await request(app).post("/claims/scrub").send({ claimId: "claim-1" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("warnings");
    expect(res.body.passedChecks).toEqual(["check-1"]);
  });

  it("POST /claims/scrub auto-fixes issues", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "claim-1",
            tenant_id: "tenant-1",
            patient_id: "patient-1",
            service_date: "2025-01-01",
            line_items: [],
            payer_id: "payer-1",
            payer_name: "Payer",
            is_cosmetic: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    scrubMock
      .mockResolvedValueOnce({
        status: "errors",
        errors: [{ autoFixable: true }],
        warnings: [],
        info: [],
      })
      .mockResolvedValueOnce({
        status: "clean",
        errors: [],
        warnings: [],
        info: [],
      });
    applyFixesMock.mockReturnValueOnce({
      id: "claim-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      serviceDate: "2025-01-01",
      lineItems: [{ cpt: "11111", dx: ["D1"], units: 1, charge: 50 }],
    });
    passedChecksMock.mockReturnValueOnce(["check-2"]);

    const res = await request(app).post("/claims/scrub").send({ claimId: "claim-1", autoFix: true });

    expect(res.status).toBe(200);
    expect(res.body.autoFixed).toBe(true);
    expect(res.body.updatedLineItems).toHaveLength(1);
  });

  it("POST /claims/submit returns batch results", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "ready", scrub_status: "clean" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ...readyClaimScrubRow, id: "claim-2" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    scrubMock.mockResolvedValueOnce(cleanScrubResult);

    const res = await request(app).post("/claims/submit").send({ claimIds: ["claim-1", "claim-2"] });

    expect(res.status).toBe(200);
    expect(res.body.submitted).toEqual(["claim-2"]);
    expect(res.body.errors).toHaveLength(1);
  });

  it("POST /claims/submit rejects unreleased coding review claims", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "coding_review", scrub_status: "clean" }] });

    const res = await request(app).post("/claims/submit").send({ claimIds: ["claim-1"] });

    expect(res.status).toBe(200);
    expect(res.body.submitted).toEqual([]);
    expect(res.body.errors[0].error).toContain("coding review");
  });

  it("GET /claims/denials returns list", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "claim-1" }] });

    const res = await request(app).get("/claims/denials");

    expect(res.status).toBe(200);
    expect(res.body.denials).toHaveLength(1);
  });

  it("POST /claims/:id/appeal rejects non-denied claims", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "submitted" }] });

    const res = await request(app).post("/claims/claim-1/appeal").send({ appealNotes: "fix" });

    expect(res.status).toBe(400);
  });

  it("POST /claims/:id/appeal submits appeal", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "denied" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/claims/claim-1/appeal")
      .send({ appealNotes: "Details", denialReason: "Missing info" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalled();
  });

  it("GET /claims/metrics returns dashboard metrics", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ draftCount: "1" }] })
      .mockResolvedValueOnce({ rows: [{ age_0_30: "2" }] })
      .mockResolvedValueOnce({ rows: [{ avgDaysToPayment: "5" }] })
      .mockResolvedValueOnce({ rows: [{ totalCharges: "100" }] })
      .mockResolvedValueOnce({ rows: [{ totalSubmitted: "3" }] });

    const res = await request(app).get("/claims/metrics");

    expect(res.status).toBe(200);
    expect(res.body.counts).toBeTruthy();
    expect(res.body.aging).toBeTruthy();
  });

  it("GET /claims/analytics returns analytics", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ submitted: "1" }] })
      .mockResolvedValueOnce({ rows: [{ denial_category: "A", count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ payer_name: "Payer", denied: "1" }] })
      .mockResolvedValueOnce({ rows: [{ providerName: "Dr" }] })
      .mockResolvedValueOnce({ rows: [{ successRate: "50" }] });

    const res = await request(app).get("/claims/analytics");

    expect(res.status).toBe(200);
    expect(res.body.topDenialReasons).toHaveLength(1);
  });

  it("GET /claims/era resolves the ERA list route before claim detail", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "era-1" }], rowCount: 1 });

    const res = await request(app).get("/claims/era");

    expect(res.status).toBe(200);
    expect(res.body.eraImports).toHaveLength(1);
  });

  it("GET /claims/modifiers returns empty rules when modifier tables are missing", async () => {
    getAllModifierRulesMock.mockRejectedValueOnce(Object.assign(new Error("missing modifier_rules"), { code: "42P01" }));

    const res = await request(app).get("/claims/modifiers");

    expect(res.status).toBe(200);
    expect(res.body.modifiers).toEqual([]);
  });

  it("GET /claims/modifiers returns rules", async () => {
    getAllModifierRulesMock.mockResolvedValueOnce([{ modifier_code: "25" }]);

    const res = await request(app).get("/claims/modifiers");

    expect(res.status).toBe(200);
    expect(res.body.modifiers).toHaveLength(1);
  });

  it("GET /claims/modifiers/:code returns 404 when missing", async () => {
    getModifierInfoMock.mockResolvedValueOnce(null);

    const res = await request(app).get("/claims/modifiers/25");

    expect(res.status).toBe(404);
  });

  it("GET /claims/modifiers/:code returns info", async () => {
    getModifierInfoMock.mockResolvedValueOnce({ code: "25" });

    const res = await request(app).get("/claims/modifiers/25");

    expect(res.status).toBe(200);
    expect(res.body.code).toBe("25");
  });

  it("POST /claims/:id/suggest-modifiers returns suggestions", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ line_items: [{ cpt: "11111" }] }] });
    suggestModifiersMock.mockResolvedValueOnce([{ modifier: "25" }]);

    const res = await request(app).post("/claims/claim-1/suggest-modifiers");

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
  });
});
