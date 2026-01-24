import * as checkInService from "../checkInService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";
import { verifyPatientEligibility } from "../eligibilityService";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../eligibilityService", () => ({
  verifyPatientEligibility: jest.fn(),
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1234"),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const verifyMock = verifyPatientEligibility as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  verifyMock.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.warn as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

describe("checkInService", () => {
  it("getPatientEligibilityForCheckIn throws when missing patient", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      checkInService.getPatientEligibilityForCheckIn("patient-1", "tenant-1")
    ).rejects.toThrow("Patient not found");
  });

  it("getPatientEligibilityForCheckIn returns eligibility and refresh needed", async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "patient-1",
          eligibility_status: "verified",
          eligibility_checked_at: oldDate,
          copay_amount_cents: 2500,
          deductible_remaining_cents: 5000,
          coinsurance_percent: 20,
          payer_name: "ACME",
          has_issues: true,
          issue_notes: "Needs verification",
        },
      ],
    });

    const result = await checkInService.getPatientEligibilityForCheckIn(
      "patient-1",
      "tenant-1",
      "appt-1"
    );

    expect(result.insuranceNeedsUpdate).toBe(true);
    expect(result.eligibilityStatus?.status).toBe("verified");
    expect(result.eligibilityStatus?.payerName).toBe("ACME");
    expect(result.appointmentId).toBe("appt-1");
  });

  it("getPatientEligibilityForCheckIn returns undefined eligibility when missing", async () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "patient-1",
          eligibility_status: null,
          eligibility_checked_at: recentDate,
        },
      ],
    });

    const result = await checkInService.getPatientEligibilityForCheckIn(
      "patient-1",
      "tenant-1"
    );

    expect(result.insuranceNeedsUpdate).toBe(false);
    expect(result.eligibilityStatus).toBeUndefined();
  });

  it("refreshEligibilityAtCheckIn proxies to verification service", async () => {
    verifyMock.mockResolvedValueOnce({ id: "verification-1" });

    const result = await checkInService.refreshEligibilityAtCheckIn(
      "patient-1",
      "tenant-1",
      "appt-1",
      "user-1"
    );

    expect(verifyMock).toHaveBeenCalledWith("patient-1", "tenant-1", "user-1", "appt-1");
    expect(result.id).toBe("verification-1");
  });

  it("completeCheckIn records updates and payments", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);

    const result = await checkInService.completeCheckIn(
      {
        patientId: "patient-1",
        appointmentId: "appt-1",
        tenantId: "tenant-1",
        insuranceNeedsUpdate: false,
        copayCollected: true,
        copayAmountCents: 2500,
        paymentMethod: "card",
        insuranceUpdates: {
          insuranceProvider: "ACME",
          insuranceMemberId: "MEM-1",
        },
      },
      "user-1"
    );

    expect(result.success).toBe(true);
    expect(result.copayCollected).toBe(true);
    expect(result.insuranceUpdated).toBe(true);
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO patient_payments"),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("completeCheckIn continues when eligibility refresh fails", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    verifyMock.mockRejectedValueOnce(new Error("eligibility failure"));

    const result = await checkInService.completeCheckIn(
      {
        patientId: "patient-1",
        appointmentId: "appt-1",
        tenantId: "tenant-1",
        insuranceNeedsUpdate: true,
      },
      "user-1"
    );

    expect(result.success).toBe(true);
    expect(result.eligibilityRefreshed).toBe(false);
    expect(result.warnings).toContain("Failed to refresh insurance eligibility");
  });

  it("getCheckInStatus returns row or null", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "checkin-1" }] });
    const result = await checkInService.getCheckInStatus("appt-1", "tenant-1");
    expect(result?.id).toBe("checkin-1");
  });

  it("calculateEstimatedResponsibility applies deductible and coinsurance", () => {
    const result = checkInService.calculateEstimatedResponsibility(
      {
        copay_amount_cents: 2500,
        deductible_remaining_cents: 10000,
        coinsurance_percent: 20,
      },
      20000
    );

    expect(result).toEqual({
      copay: 2500,
      deductible: 10000,
      coinsurance: 2000,
      total: 14500,
    });
  });
});
