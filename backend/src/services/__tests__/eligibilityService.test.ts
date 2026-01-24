import {
  verifyPatientEligibility,
  batchVerifyEligibility,
  getVerificationHistory,
  getLatestVerificationByPatients,
  getPatientsWithIssues,
  getPatientsNeedingVerification,
  getTomorrowsPatients,
} from "../eligibilityService";
import { pool } from "../../db/pool";
import { mockEligibilityCheck, mockBatchEligibilityCheck } from "../availityMock";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../availityMock", () => ({
  mockEligibilityCheck: jest.fn(),
  mockBatchEligibilityCheck: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const baseEligibilityResponse = {
  success: true,
  transactionId: "txn-1",
  timestamp: "2025-01-01T00:00:00Z",
  patient: {
    firstName: "Jane",
    lastName: "Doe",
    dob: "1980-01-01",
    memberId: "MEM123",
    groupNumber: "GRP1",
  },
  payer: {
    payerId: "BCBS",
    payerName: "Blue Cross",
  },
  coverage: {
    status: "active" as const,
    effectiveDate: "2020-01-01",
    planName: "Gold Plan",
    planType: "PPO",
    coverageLevel: "individual",
    coordinationOfBenefits: "primary" as const,
  },
  benefits: {
    copays: {
      specialist: 2500,
      primaryCare: 1500,
      emergency: 5000,
      urgentCare: 3000,
    },
    deductible: {
      individual: {
        total: 100000,
        met: 20000,
        remaining: 80000,
      },
    },
    coinsurance: {
      percentage: 20,
    },
    outOfPocketMax: {
      individual: {
        total: 500000,
        met: 100000,
        remaining: 400000,
      },
    },
    priorAuth: {
      required: false,
      services: [],
      phone: null,
    },
    referral: {
      required: false,
    },
  },
  network: {
    inNetwork: true,
    networkName: "Preferred",
  },
  pcp: {
    required: false,
  },
  messages: [
    {
      type: "info" as const,
      code: "OK",
      message: "Verified",
    },
  ],
};

describe("eligibilityService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when patient is not found", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    await expect(verifyPatientEligibility("patient-1", "tenant-1")).rejects.toThrow(
      "Patient not found"
    );

    expect(logger.error).toHaveBeenCalled();
  });

  it("creates error verification when insurance is missing", async () => {
    const patientRow = {
      id: "patient-1",
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1980-01-01",
      insurance_provider: "BCBS",
      insurance_member_id: null,
      insurance_group_number: null,
      insurance_payer_id: "BCBS",
    };

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [patientRow] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ver-1",
            verification_status: "error",
            verified_at: new Date(),
            payer_name: "Unknown",
            has_issues: true,
            issue_notes: "Patient has no insurance information on file",
          },
        ],
      });

    const result = await verifyPatientEligibility("patient-1", "tenant-1", "user-1", "appt-1");

    expect(result.verificationStatus).toBe("error");
    expect(result.issueNotes).toBe("Patient has no insurance information on file");
  });

  it("stores eligibility verification results when insurance exists", async () => {
    const patientRow = {
      id: "patient-1",
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1980-01-01",
      insurance_provider: "BCBS",
      insurance_member_id: "MEM123",
      insurance_group_number: "GRP1",
      insurance_payer_id: "BCBS",
    };

    (mockEligibilityCheck as jest.Mock).mockResolvedValue(baseEligibilityResponse);

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [patientRow] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "ver-2",
            verification_status: "active",
            verified_at: new Date(),
            payer_name: "Blue Cross",
            has_issues: false,
            issue_notes: null,
          },
        ],
      });

    const result = await verifyPatientEligibility("patient-1", "tenant-1", "user-1");

    expect(mockEligibilityCheck).toHaveBeenCalled();
    expect(result.verificationStatus).toBe("active");
    expect(result.hasIssues).toBe(false);
  });

  it("batch verifies eligible patients and maps responses to insured patients", async () => {
    const queryMock = pool.query as jest.Mock;
    let capturedPatientId: string | null = null;

    const patients = [
      {
        id: "patient-no-insurance",
        first_name: "Skip",
        last_name: "Me",
        date_of_birth: "1990-01-01",
        insurance_member_id: null,
        insurance_payer_id: "BCBS",
      },
      {
        id: "patient-verified",
        first_name: "Veri",
        last_name: "Fied",
        date_of_birth: "1985-02-02",
        insurance_member_id: "MEM123",
        insurance_payer_id: "BCBS",
      },
    ];

    queryMock.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes("INSERT INTO eligibility_batch_runs")) {
        return { rows: [{ id: "batch-1" }] };
      }
      if (sql.includes("FROM patients")) {
        return { rows: patients };
      }
      if (sql.includes("INSERT INTO insurance_verifications")) {
        capturedPatientId = params?.[1];
        return {
          rows: [
            {
              id: "ver-3",
              verification_status: "active",
              verified_at: new Date(),
              payer_name: "Blue Cross",
              has_issues: false,
              issue_notes: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    (mockBatchEligibilityCheck as jest.Mock).mockResolvedValue([baseEligibilityResponse]);

    const result = await batchVerifyEligibility({
      patientIds: ["patient-no-insurance", "patient-verified"],
      tenantId: "tenant-1",
      initiatedBy: "user-1",
      batchName: "Batch 1",
    });

    expect(capturedPatientId).toBe("patient-verified");
    expect(result.verifiedCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it("returns verification history", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: "ver-1" }] });

    const rows = await getVerificationHistory("patient-1", "tenant-1");

    expect(rows).toEqual([{ id: "ver-1" }]);
  });

  it("returns latest verification history by patient", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ patient_id: "patient-1", id: "ver-2" }],
    });

    const history = await getLatestVerificationByPatients(["patient-1", "patient-2"], "tenant-1");

    expect(history).toEqual({
      "patient-1": { patient_id: "patient-1", id: "ver-2" },
      "patient-2": null,
    });
  });

  it("returns patients with issues", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ patient_id: "p1" }] });

    const rows = await getPatientsWithIssues("tenant-1");

    expect(rows).toEqual([{ patient_id: "p1" }]);
  });

  it("returns patients needing verification", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ patient_id: "p2" }] });

    const rows = await getPatientsNeedingVerification("tenant-1", 15);

    expect(rows).toEqual([{ patient_id: "p2" }]);
  });

  it("returns tomorrow's patient ids", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ patient_id: "p3" }, { patient_id: "p4" }],
    });

    const ids = await getTomorrowsPatients("tenant-1");

    expect(ids).toEqual(["p3", "p4"]);
  });
});
