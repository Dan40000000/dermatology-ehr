import * as costEstimator from "../costEstimator";
import { pool } from "../../db/pool";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("costEstimator", () => {
  it("getInsuranceBenefits returns null when missing plan", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    const result = await costEstimator.getInsuranceBenefits("tenant-1", "patient-1");
    expect(result).toBeNull();
  });

  it("getInsuranceBenefits returns live verification benefits", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          planName: "Verified Plan",
          deductible: "1000",
          deductibleMet: "250",
          deductibleRemaining: "750",
          coinsurancePercent: 20,
          copay: "35",
          outOfPocketMax: "8000",
          outOfPocketMet: "500",
          isInNetwork: true,
        },
      ],
      rowCount: 1,
    });
    const result = await costEstimator.getInsuranceBenefits("tenant-1", "patient-1");
    expect(result?.planName).toBe("Verified Plan");
    expect(result?.deductibleRemaining).toBe(750);
    expect(result?.verified).toBe(true);
  });

  it("getInsuranceBenefits falls back to patient insurance fields", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            planName: "Plan A",
            deductible: 500,
            coinsurancePercent: 20,
            copay: 10,
          },
        ],
        rowCount: 1,
      });
    const result = await costEstimator.getInsuranceBenefits("tenant-1", "patient-1");
    expect(result?.planName).toBe("Plan A");
    expect(result?.deductibleRemaining).toBe(500);
    expect(result?.verified).toBe(false);
  });

  it("createCostEstimate handles cosmetic services", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ fee_cents: 10000, cpt_description: "Test" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const estimate = await costEstimator.createCostEstimate("tenant-1", "patient-1", {
      serviceType: "cosmetic",
      cptCodes: ["11111"],
      isCosmetic: true,
      userId: "user-1",
    });

    expect(estimate.isCosmetic).toBe(true);
    expect(estimate.patientResponsibility).toBe(100);
  });

  it("createCostEstimate handles no insurance", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ fee_cents: 5000, cpt_description: "Test" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] });

    const estimate = await costEstimator.createCostEstimate("tenant-1", "patient-1", {
      serviceType: "medical",
      cptCodes: ["11111"],
      userId: "user-1",
    });

    expect(estimate.insurancePays).toBe(0);
    expect(estimate.patientResponsibility).toBe(50);
  });

  it("createCostEstimate applies insurance math", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ fee_cents: 10000, cpt_description: "Test" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            planName: "Plan A",
            deductible: 10,
            coinsurancePercent: 20,
            copay: 5,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const estimate = await costEstimator.createCostEstimate("tenant-1", "patient-1", {
      serviceType: "medical",
      cptCodes: ["11111"],
      userId: "user-1",
    });

    expect(estimate.insuranceAllowedAmount).toBe(80);
    expect(estimate.patientResponsibility).toBeCloseTo(28, 1);
    expect(estimate.insurancePays).toBeCloseTo(52, 1);
    expect(estimate.breakdown.notCovered).toBe(0);
    expect(estimate.breakdown.contractualAdjustment).toBe(20);
  });

  it("uses an effective payer contract rate and reports high confidence", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ fee_cents: 10000, cpt_description: "Office visit" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          planName: "Blue Cross PPO",
          payerId: "BCBS-001",
          deductible: 0,
          deductibleMet: 0,
          deductibleRemaining: 0,
          coinsurancePercent: 20,
          copay: 10,
          outOfPocketMax: 8000,
          outOfPocketMet: 0,
          isInNetwork: true,
          verificationSource: "availity",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "rate-1", payerName: "Blue Cross PPO", allowedAmountCents: 6500 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const estimate = await costEstimator.createCostEstimate("tenant-1", "patient-1", {
      serviceType: "medical",
      cptCodes: ["99213"],
      userId: "user-1",
    });

    expect(estimate.insuranceAllowedAmount).toBe(65);
    expect(estimate.patientResponsibility).toBeCloseTo(21, 2);
    expect(estimate.pricingBasis).toBe("contract_rate");
    expect(estimate.pricingDetails[0]).toMatchObject({
      code: "99213",
      allowedAmount: 65,
      basis: "contract_rate",
      rateId: "rate-1",
    });
    expect(estimate.confidenceLevel).toBe("high");
    expect(estimate.confidenceScore).toBe(90);
  });

  it("createCostEstimate treats the amount above allowed as potential balance billing out of network", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ fee_cents: 10000, cpt_description: "Test" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          planName: "Out-of-network Plan",
          deductible: 0,
          deductibleMet: 0,
          deductibleRemaining: 0,
          coinsurancePercent: 20,
          copay: 0,
          outOfPocketMax: 8000,
          outOfPocketMet: 0,
          isInNetwork: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const estimate = await costEstimator.createCostEstimate("tenant-1", "patient-1", {
      serviceType: "medical",
      cptCodes: ["11111"],
      userId: "user-1",
    });

    expect(estimate.patientResponsibility).toBeCloseTo(36, 1);
    expect(estimate.breakdown.notCovered).toBe(20);
    expect(estimate.breakdown.contractualAdjustment).toBe(0);
  });

  it("getEstimate returns totals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "est-1",
          patientId: "patient-1",
          appointmentId: null,
          serviceType: "medical",
          cptCodes: [{ fee: 50 }, { fee: 25 }],
          insuranceAllowedAmount: "60",
          patientResponsibility: "35",
          breakdown: { copay: 20, deductible: 0, coinsurance: 0, notCovered: 15 },
          isCosmetic: false,
          insuranceVerified: false,
          validUntil: "2025-01-01",
        },
      ],
      rowCount: 1,
    });

    const estimate = await costEstimator.getEstimate("tenant-1", "est-1");
    expect(estimate?.totalCharges).toBe(75);
    expect(estimate?.insurancePays).toBe(40);
  });

  it("getEstimateByAppointment returns totals", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "est-2",
          patientId: "patient-1",
          appointmentId: "appt-1",
          serviceType: "medical",
          cptCodes: [{ fee: 100 }],
          insuranceAllowedAmount: "80",
          patientResponsibility: "50",
          breakdown: { copay: 20, deductible: 0, coinsurance: 10, notCovered: 20 },
          isCosmetic: false,
          insuranceVerified: false,
          validUntil: "2025-01-01",
        },
      ],
      rowCount: 1,
    });

    const estimate = await costEstimator.getEstimateByAppointment("tenant-1", "appt-1");
    expect(estimate?.totalCharges).toBe(100);
    expect(estimate?.insurancePays).toBe(50);
  });

  it("markEstimateShown updates row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await costEstimator.markEstimateShown("tenant-1", "est-1", true);
    expect(queryMock).toHaveBeenCalled();
  });

  it("shares an estimate with the patient portal", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ patientId: "patient-1", sharedAt: "2026-08-03T18:00:00.000Z" }],
    });

    const result = await costEstimator.shareEstimateWithPatient("tenant-1", "est-1");

    expect(result).toEqual({
      patientId: "patient-1",
      sharedAt: "2026-08-03T18:00:00.000Z",
    });
    expect(queryMock.mock.calls[0][0]).toContain("shown_to_patient = true");
    expect(queryMock.mock.calls[0][1]).toEqual(["est-1", "tenant-1"]);
  });

  it("does not share an estimate outside the tenant", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await costEstimator.shareEstimateWithPatient("tenant-1", "missing");

    expect(result).toBeNull();
  });

  it("records a patient payment-plan request only for an active shared estimate", async () => {
    queryMock
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ status: "payment_plan_requested", respondedAt: "2026-08-05T18:00:00.000Z" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await costEstimator.respondToEstimate(
      "tenant-1",
      "patient-1",
      "est-1",
      "payment_plan_requested",
      "Please call after 3pm"
    );

    expect(result).toEqual({
      status: "payment_plan_requested",
      respondedAt: "2026-08-05T18:00:00.000Z",
    });
    expect(queryMock.mock.calls[0][0]).toContain("patient_id = $3");
    expect(queryMock.mock.calls[0][1]).toEqual([
      "est-1", "tenant-1", "patient-1", "payment_plan_requested",
    ]);
    expect(queryMock.mock.calls[1][1]).toEqual(expect.arrayContaining([
      "tenant-1", "est-1", "patient-1", "patient", "payment_plan_requested", "Please call after 3pm",
    ]));
  });

  it("calculates estimate-to-EOB variance and accuracy", () => {
    expect(costEstimator.calculateEstimateReconciliation({
      estimatedAllowedAmount: 137.5,
      estimatedPatientResponsibility: 27.5,
      actualAllowedAmount: 140,
      actualPatientResponsibility: 30,
    })).toEqual({
      allowedVariance: 2.5,
      patientVariance: 2.5,
      accuracyPercent: 91.67,
    });
  });

  it("quickEstimate uses typical when insurance is present", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          planName: "Plan A",
          deductible: 100,
          coinsurancePercent: 20,
          copay: 10,
        },
      ],
      rowCount: 1,
    }).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await costEstimator.quickEstimate("tenant-1", "patient-1", "office-visit");
    expect(result.estimatedCost).toBe(40);
  });

  it("quickEstimate uses max when no insurance", async () => {
    jest.spyOn(costEstimator, "getInsuranceBenefits").mockResolvedValueOnce(null);
    const result = await costEstimator.quickEstimate("tenant-1", "patient-1", "biopsy");
    expect(result.estimatedCost).toBe(300);
  });
});
