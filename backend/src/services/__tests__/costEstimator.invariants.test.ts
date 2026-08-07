import {
  calculateInsuranceResponsibility,
  type InsuranceBenefits,
} from "../costEstimator";

jest.mock("../../db/pool", () => ({ pool: { query: jest.fn() } }));

function benefits(overrides: Partial<InsuranceBenefits> = {}): InsuranceBenefits {
  return {
    planName: "Invariant PPO",
    deductible: 1000,
    deductibleMet: 0,
    deductibleRemaining: 1000,
    coinsurancePercent: 20,
    copay: 25,
    outOfPocketMax: 8000,
    outOfPocketMet: 0,
    isInNetwork: true,
    verified: true,
    environment: "production",
    ...overrides,
  };
}

const moneyFields = (result: ReturnType<typeof calculateInsuranceResponsibility>) => [
  result.insurancePays,
  result.patientResponsibility,
  result.breakdown.copay,
  result.breakdown.deductible,
  result.breakdown.coinsurance,
  result.breakdown.notCovered,
  result.breakdown.contractualAdjustment,
];

describe("calculateInsuranceResponsibility financial invariants", () => {
  it("caps an oversized copay at the allowed amount", () => {
    const result = calculateInsuranceResponsibility(100, 20, benefits({
      copay: 75,
      deductibleRemaining: 500,
    }));

    expect(result).toEqual({
      insurancePays: 0,
      patientResponsibility: 20,
      breakdown: {
        copay: 20,
        deductible: 0,
        coinsurance: 0,
        notCovered: 0,
        contractualAdjustment: 80,
      },
    });
  });

  it("caps covered responsibility at the remaining out-of-pocket maximum", () => {
    const result = calculateInsuranceResponsibility(200, 150, benefits({
      copay: 25,
      deductibleRemaining: 100,
      coinsurancePercent: 50,
      outOfPocketMax: 1000,
      outOfPocketMet: 990,
    }));

    expect(result.patientResponsibility).toBe(10);
    expect(result.insurancePays).toBe(140);
    expect(result.breakdown).toMatchObject({
      copay: 10,
      deductible: 0,
      coinsurance: 0,
      contractualAdjustment: 50,
    });
  });

  it("keeps an out-of-network balance bill outside the covered responsibility cap", () => {
    const result = calculateInsuranceResponsibility(200, 150, benefits({
      copay: 25,
      deductibleRemaining: 100,
      coinsurancePercent: 50,
      outOfPocketMax: 1000,
      outOfPocketMet: 990,
      isInNetwork: false,
    }));

    expect(result.patientResponsibility).toBe(60);
    expect(result.insurancePays).toBe(140);
    expect(result.breakdown.notCovered).toBe(50);
    expect(result.breakdown.contractualAdjustment).toBe(0);
  });

  it("clamps invalid negative money and coinsurance percentages", () => {
    const result = calculateInsuranceResponsibility(-100, -50, benefits({
      copay: -25,
      deductibleRemaining: -100,
      coinsurancePercent: 250,
      outOfPocketMax: -1,
      outOfPocketMet: -10,
    }));

    expect(moneyFields(result)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("preserves cents, non-negativity, caps, and balance identities across a scenario matrix", () => {
    const charges = [0, 0.01, 137.5, 999.99];
    const allowedRatios = [0, 0.37, 1, 1.25];
    const copays = [0, 35, 500];
    const deductibles = [0, 250, 2000];
    const coinsuranceRates = [-20, 20, 100, 140];
    const networks = [true, false];

    for (const charge of charges) {
      for (const ratio of allowedRatios) {
        for (const copay of copays) {
          for (const deductibleRemaining of deductibles) {
            for (const coinsurancePercent of coinsuranceRates) {
              for (const isInNetwork of networks) {
                const allowed = charge * ratio;
                const result = calculateInsuranceResponsibility(charge, allowed, benefits({
                  copay,
                  deductibleRemaining,
                  coinsurancePercent,
                  isInNetwork,
                  outOfPocketMax: 750,
                  outOfPocketMet: 125,
                }));

                for (const amount of moneyFields(result)) {
                  expect(Number.isFinite(amount)).toBe(true);
                  expect(amount).toBeGreaterThanOrEqual(0);
                  expect(amount).toBe(Math.round((amount + Number.EPSILON) * 100) / 100);
                }

                const normalizedCharge = Math.round(Math.max(0, charge) * 100) / 100;
                const normalizedAllowed = Math.min(
                  normalizedCharge,
                  Math.round(Math.max(0, allowed) * 100) / 100
                );
                const coveredPatient = result.breakdown.copay
                  + result.breakdown.deductible
                  + result.breakdown.coinsurance;
                expect(coveredPatient).toBeLessThanOrEqual(normalizedAllowed + 0.001);
                expect(coveredPatient).toBeLessThanOrEqual(625.001);

                const balancedTotal = result.insurancePays
                  + result.patientResponsibility
                  + result.breakdown.contractualAdjustment;
                expect(balancedTotal).toBeCloseTo(normalizedCharge, 2);
              }
            }
          }
        }
      }
    }
  });
});
