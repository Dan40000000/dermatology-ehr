import { billingService } from "../billingService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { scrubClaim } from "../claimScrubber";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../encounterFinancialsService", () => ({
  ensureEncounterBill: jest.fn().mockResolvedValue({
    billId: "bill-1",
    billNumber: "BILL-1",
    totalChargesCents: 200,
    insuranceResponsibilityCents: 0,
    patientResponsibilityCents: 200,
    balanceCents: 200,
    chargeCount: 2,
    payerName: "ACME",
  }),
  normalizeEncounterCharges: jest.fn().mockResolvedValue([]),
}));

jest.mock("../claimScrubber", () => ({
  scrubClaim: jest.fn(),
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const scrubMock = scrubClaim as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  scrubMock.mockReset();
  scrubMock.mockResolvedValue({
    status: "clean",
    errors: [],
    warnings: [],
    info: [],
    canSubmit: true,
  });
  (logger.info as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

describe("billingService", () => {
  it("createClaimFromCharges throws when encounter missing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      billingService.createClaimFromCharges("tenant-1", "enc-1", "user-1")
    ).rejects.toThrow("Encounter not found");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("createClaimFromCharges returns existing claim", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ patient_id: "patient-1", insurance_details: {} }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "claim-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "claim-1",
            tenant_id: "tenant-1",
            encounter_id: "enc-1",
            patient_id: "patient-1",
            claim_number: "CLM-1",
            total_cents: 1000,
            status: "draft",
            payer: "ACME",
            payer_id: "P1",
            submitted_at: null,
            created_at: "2025-01-01",
            updated_at: "2025-01-01",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await billingService.createClaimFromCharges("tenant-1", "enc-1", "user-1");

    expect(result.id).toBe("claim-1");
    expect(result.claimNumber).toBe("CLM-1");
  });

  it("createClaimFromCharges builds claim and line items", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            patient_id: "patient-1",
            insurance_details: { primary: { planName: "ACME", payerId: "P1" } },
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            id: "charge-1",
            cpt_code: "11100",
            description: "desc",
            quantity: 1,
            fee_cents: 100,
            icd_codes: ["L20"],
          },
          {
            id: "charge-2",
            cpt_code: "11101",
            description: "desc2",
            quantity: 2,
            fee_cents: 50,
            icd_codes: ["L21.9"],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "claim-1",
            tenant_id: "tenant-1",
            encounter_id: "enc-1",
            patient_id: "patient-1",
            claim_number: "CLM-2025-000001",
            total_cents: 200,
            status: "coding_review",
            payer: "ACME",
            payer_id: "P1",
            submitted_at: null,
            created_at: "2025-01-01",
            updated_at: "2025-01-01",
          },
        ],
      });
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const result = await billingService.createClaimFromCharges("tenant-1", "enc-1", "user-1");

    expect(result.totalCents).toBe(200);
    expect(result.payer).toBe("ACME");
    expect(result.status).toBe("coding_review");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO claims"),
      expect.arrayContaining(["coding_review"])
    );
    expect(logger.info).toHaveBeenCalled();
  });

  it("createClaimFromCharges rejects insurance charges without diagnoses", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            patient_id: "patient-1",
            insurance_details: { primary: { planName: "ACME", payerId: "P1" } },
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "charge-1",
            cpt_code: "11100",
            description: "biopsy",
            quantity: 1,
            fee_cents: 100,
            icd_codes: [],
          },
        ],
      });

    await expect(
      billingService.createClaimFromCharges("tenant-1", "enc-1", "user-1")
    ).rejects.toThrow("Diagnosis code is required");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("submitClaim throws when claim missing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      billingService.submitClaim("tenant-1", "claim-1", "user-1")
    ).rejects.toThrow("Claim not found");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("submitClaim throws when payer missing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "ready", payer: null, payer_id: null }],
      });

    await expect(
      billingService.submitClaim("tenant-1", "claim-1", "user-1")
    ).rejects.toThrow("Claim missing payer information");
  });

  it("submitClaim rejects claims still in coding review", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "coding_review", payer: "ACME", payer_id: "P1" }],
      });

    await expect(
      billingService.submitClaim("tenant-1", "claim-1", "user-1")
    ).rejects.toThrow("coding review");
  });

  it("submitClaim updates status when ready", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "ready", payer: "ACME", payer_id: "P1" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "claim-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          service_date: "2025-01-01",
          line_items: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 }],
          payer_id: "P1",
          payer_name: "ACME",
          payer: "ACME",
          is_cosmetic: false,
          patient_first_name: "Ava",
          patient_last_name: "Jones",
          patient_dob: "1990-01-01",
          patient_address: "1 Main",
          patient_city: "Denver",
          patient_state: "CO",
          patient_zip: "80202",
          legacy_insurance_member_id: "M123",
          primary_insurance_member_id: null,
          provider_id: "provider-1",
          provider_name: "Dr. Demo",
          provider_npi: "1234567890",
          encounter_place_of_service: "11",
          superbill_place_of_service: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await billingService.submitClaim("tenant-1", "claim-1", "user-1");

    expect(logger.info).toHaveBeenCalled();
    expect(scrubMock).toHaveBeenCalledWith(expect.objectContaining({ id: "claim-1", patientId: "patient-1" }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE claims"),
      ["claim-1", "tenant-1"]
    );
  });

  it("submitClaim uses primary insurance member ID and office POS fallback for scrubbing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "ready", payer: "ACME", payer_id: "P1" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "claim-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          service_date: "2025-01-01",
          line_items: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 }],
          payer_id: null,
          payer_name: null,
          payer: "ACME",
          primary_payer_id: "P1",
          primary_payer_name: "ACME Primary",
          primary_plan_name: "ACME Gold",
          is_cosmetic: false,
          patient_first_name: "Ava",
          patient_last_name: "Jones",
          patient_dob: "1990-01-01",
          patient_address: "1 Main",
          patient_city: "Denver",
          patient_state: "CO",
          patient_zip: "80202",
          legacy_insurance_member_id: null,
          primary_insurance_member_id: "PRIMARY-123",
          provider_id: "provider-1",
          provider_name: "Dr. Demo",
          provider_npi: "1234567890",
          encounter_place_of_service: null,
          superbill_place_of_service: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await billingService.submitClaim("tenant-1", "claim-1", "user-1");

    expect(scrubMock).toHaveBeenCalledWith(expect.objectContaining({
      payerId: "P1",
      patient: expect.objectContaining({ insuranceMemberId: "PRIMARY-123" }),
      placeOfService: "11",
    }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("patient_insurance"),
      ["claim-1", "tenant-1"],
    );
  });

  it("submitClaim blocks unresolved scrubber errors", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    scrubMock.mockResolvedValueOnce({
      status: "errors",
      errors: [{ severity: "error", ruleCode: "missing_dx", ruleName: "Missing diagnosis", message: "Missing diagnosis" }],
      warnings: [],
      info: [],
      canSubmit: false,
    });
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "ready", payer: "ACME", payer_id: "P1" }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "claim-1",
          tenant_id: "tenant-1",
          patient_id: "patient-1",
          service_date: "2025-01-01",
          line_items: [{ cpt: "99213", dx: [], units: 1, charge: 100 }],
          payer_id: "P1",
          payer_name: "ACME",
          payer: "ACME",
          is_cosmetic: false,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      billingService.submitClaim("tenant-1", "claim-1", "user-1")
    ).rejects.toThrow("readiness errors");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("getClaimDetails returns null when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await billingService.getClaimDetails("tenant-1", "claim-1");

    expect(result).toBeNull();
  });

  it("getClaimDetails returns claim with line items", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "claim-1",
            tenant_id: "tenant-1",
            encounter_id: "enc-1",
            patient_id: "patient-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "line-1" }] });

    const result = await billingService.getClaimDetails("tenant-1", "claim-1");

    expect(result.lineItems).toHaveLength(1);
  });

  it("getClaimsByEncounter returns mapped claims", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "claim-1",
          tenant_id: "tenant-1",
          encounter_id: "enc-1",
          patient_id: "patient-1",
          claim_number: "CLM-1",
          total_cents: 100,
          status: "draft",
          payer: "ACME",
          payer_id: "P1",
          submitted_at: null,
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
      ],
    });

    const result = await billingService.getClaimsByEncounter("tenant-1", "enc-1");

    expect(result[0].claimNumber).toBe("CLM-1");
  });

  it("updateClaimStatus updates claim and audit log", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await billingService.updateClaimStatus("tenant-1", "claim-1", "denied", "user-1");

    expect(logger.info).toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE claims"),
      ["denied", "claim-1", "tenant-1"]
    );
  });

  it("updateClaimStatus blocks legacy ready/submitted transitions", async () => {
    await expect(
      billingService.updateClaimStatus("tenant-1", "claim-1", "submitted", "user-1")
    ).rejects.toThrow("release/submission workflow");

    expect(queryMock).not.toHaveBeenCalled();
  });
});
