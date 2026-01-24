import { billingService } from "../billingService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

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

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
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
            icd_codes: [],
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
            status: "draft",
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
    expect(logger.info).toHaveBeenCalled();
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
        rows: [{ id: "claim-1", status: "draft", payer: null, payer_id: null }],
      });

    await expect(
      billingService.submitClaim("tenant-1", "claim-1", "user-1")
    ).rejects.toThrow("Claim missing payer information");
  });

  it("submitClaim updates status when ready", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "claim-1", status: "draft", payer: "ACME", payer_id: "P1" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await billingService.submitClaim("tenant-1", "claim-1", "user-1");

    expect(logger.info).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE claims"),
      ["claim-1", "tenant-1"]
    );
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
});
