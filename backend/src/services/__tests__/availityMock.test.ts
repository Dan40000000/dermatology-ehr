import { mockBatchEligibilityCheck, mockEligibilityCheck } from "../availityMock";

const baseRequest = {
  payerId: "BCBS",
  memberId: "A1",
  patientFirstName: "Pat",
  patientLastName: "Ent",
  patientDob: "1990-01-01",
};

const runEligibility = async (overrides: Partial<typeof baseRequest>) => {
  jest.useFakeTimers();
  const promise = mockEligibilityCheck({ ...baseRequest, ...overrides });
  jest.runAllTimers();
  const result = await promise;
  jest.useRealTimers();
  return result;
};

describe("availityMock", () => {
  it("returns terminated coverage when member id indicates termination", async () => {
    const result = await runEligibility({ memberId: "TERMED-123" });

    expect(result.coverage.status).toBe("terminated");
    expect(result.messages?.[0].code).toBe("COVERAGE_TERMINATED");
  });

  it("returns inactive coverage when member id indicates inactive", async () => {
    const result = await runEligibility({ memberId: "ABC000" });

    expect(result.coverage.status).toBe("inactive");
    expect(result.messages?.[0].code).toBe("COVERAGE_INACTIVE");
  });

  it("returns error response when member id indicates error", async () => {
    const result = await runEligibility({ memberId: "ERROR-1" });

    expect(result.success).toBe(false);
    expect(result.messages?.[0].code).toBe("MEMBER_NOT_FOUND");
  });

  it("returns high deductible details when requested", async () => {
    const result = await runEligibility({ memberId: "DEDUCT-1" });

    expect(result.coverage.planName).toContain("High Deductible");
    expect(result.benefits.deductible?.individual?.remaining).toBe(425000);
  });

  it("returns deductible met scenario when requested", async () => {
    const result = await runEligibility({ memberId: "MET-1" });

    expect(result.coverage.planName).toContain("PPO Premier");
    expect(result.benefits.deductible?.individual?.remaining).toBe(0);
  });

  it("returns low copay plan for hashed scenario", async () => {
    const result = await runEligibility({ payerId: "BCBS", memberId: "A3" });

    expect(result.coverage.planName).toBe("Gold HMO Plan");
    expect(result.pcp?.required).toBe(true);
  });

  it("returns standard plan for default scenarios", async () => {
    const result = await runEligibility({ payerId: "BCBS", memberId: "A2" });

    expect(result.coverage.planName).toBe("Standard PPO Plan");
  });

  it("mockBatchEligibilityCheck returns results in order", async () => {
    jest.useFakeTimers();
    const promise = mockBatchEligibilityCheck([
      { ...baseRequest, memberId: "A1" },
      { ...baseRequest, memberId: "A3" },
    ]);
    jest.runAllTimers();
    const result = await promise;
    jest.useRealTimers();

    expect(result).toHaveLength(2);
    expect(result[0].patient.memberId).toBe("A1");
    expect(result[1].patient.memberId).toBe("A3");
  });
});
