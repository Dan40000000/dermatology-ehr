import { MockPriorAuthAdapter, getPriorAuthAdapter } from "../priorAuthAdapter";

describe("priorAuthAdapter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("getPriorAuthAdapter returns mock adapter", () => {
    const adapter = getPriorAuthAdapter();
    expect(adapter).toBeInstanceOf(MockPriorAuthAdapter);
  });

  it("submit returns approved response", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.1) // delay
      .mockReturnValueOnce(0.1) // approval branch
      .mockReturnValueOnce(0.2); // external ref

    const adapter = new MockPriorAuthAdapter();
    const promise = adapter.submit({
      id: "pa-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      payer: "Test Payer",
      memberId: "mem-1",
      medicationName: "Drug",
      medicationQuantity: 30,
    });

    jest.runAllTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.status).toBe("approved");
    expect(result.externalReferenceId).toBeTruthy();
  });

  it("submit returns submitted response", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.1) // delay
      .mockReturnValueOnce(0.5) // submitted branch
      .mockReturnValueOnce(0.2); // external ref

    const adapter = new MockPriorAuthAdapter();
    const promise = adapter.submit({
      id: "pa-2",
      tenantId: "tenant-1",
      patientId: "patient-1",
      payer: "Test Payer",
      memberId: "mem-1",
    });

    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe("submitted");
    expect(result.estimatedDecisionTime).toBeTruthy();
  });

  it("submit returns needs_info response", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.1) // delay
      .mockReturnValueOnce(0.8) // needs_info branch
      .mockReturnValueOnce(0.2); // external ref

    const adapter = new MockPriorAuthAdapter();
    const promise = adapter.submit({
      id: "pa-3",
      tenantId: "tenant-1",
      patientId: "patient-1",
      payer: "Test Payer",
      memberId: "mem-1",
    });

    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe("needs_info");
    expect(result.responsePayload).toBeTruthy();
  });

  it("submit returns denied response", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.1) // delay
      .mockReturnValueOnce(0.95) // denied branch
      .mockReturnValueOnce(0.2); // external ref

    const adapter = new MockPriorAuthAdapter();
    const promise = adapter.submit({
      id: "pa-4",
      tenantId: "tenant-1",
      patientId: "patient-1",
      payer: "Test Payer",
      memberId: "mem-1",
    });

    jest.runAllTimers();
    const result = await promise;

    expect(result.status).toBe("denied");
  });

  it("checkStatus returns deterministic status", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.1); // delay
    const adapter = new MockPriorAuthAdapter();
    const promise = adapter.checkStatus("request-1", "EXT-1");
    jest.runAllTimers();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.externalReferenceId).toBe("EXT-1");
  });
});
