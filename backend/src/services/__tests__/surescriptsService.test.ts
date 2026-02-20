import * as surescriptsService from "../surescriptsService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1234"),
}));

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.error.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("surescriptsService", () => {
  it("sendNewRx logs success and returns message id", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.01);
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const promise = surescriptsService.sendNewRx("rx-1", "NCPDP1", { med: "A" });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("MOCK-uuid-1234");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("sendNewRx returns failure without logging", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.99);

    const promise = surescriptsService.sendNewRx("rx-1", "NCPDP1", { med: "A" });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("getRxHistory returns mapped medications and logs transaction", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            medication_name: "Drug",
            generic_name: "Gen",
            ndc: "123",
            strength: "10mg",
            dosage_form: "cream",
            quantity: "2",
            days_supply: 30,
            sig: "apply",
            prescriber_name: null,
            prescriber_npi: "NPI1",
            pharmacy_name: "Pharm",
            pharmacy_ncpdp: "NCPDP1",
            fill_date: "2025-01-01",
            fill_number: 1,
            refills_remaining: 2,
            written_date: "2024-12-20",
            prescribed_date: "2024-12-21",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const promise = surescriptsService.getRxHistory("patient-1", "tenant-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.messageId).toContain("RXHIST-");
    expect(result.medications[0].prescriberName).toBe("Unknown Prescriber");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("getRxHistory throws on db error", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const promise = surescriptsService.getRxHistory("patient-1", "tenant-1");
    const expectation = expect(promise).rejects.toThrow("boom");
    await jest.runAllTimersAsync();
    await expectation;
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Rx history", {
      error: "boom",
    });
  });

  it("getRxHistory masks non-Error failures", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockRejectedValueOnce({ patientName: "Jane Doe" });

    const promise = surescriptsService.getRxHistory("patient-1", "tenant-1");
    const expectation = expect(promise).rejects.toEqual({ patientName: "Jane Doe" });
    await jest.runAllTimersAsync();
    await expectation;
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching Rx history", {
      error: "Unknown error",
    });
  });

  it("checkFormulary returns expected tier info", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);

    const promise = surescriptsService.checkFormulary("Imiquimod", "payer-1", "ndc-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.formularyStatus).toBe("prior_auth_required");
    expect(result.requiresPriorAuth).toBe(true);
    expect(result.requiresStepTherapy).toBe(false);
    expect(result.tier).toBe(3);
    expect(result.quantityLimit).toBe(30);
  });

  it("getPatientBenefits returns stored benefits when available", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          is_active: true,
          payer_name: "Best Insurance",
          plan_name: "Gold",
          member_id: "MEM1",
          group_number: "GR1",
          pharmacy_network: "Net",
          rx_bin: "111111",
          rx_pcn: "PCN",
          rx_group: "GRP",
          tier_1_copay: "5",
          tier_2_copay: "15",
          tier_3_copay: "30",
          tier_4_copay: "50",
          tier_5_copay: "80",
          deductible_amount: "500",
          deductible_met: "100",
          deductible_remaining: "400",
          out_of_pocket_max: "3000",
          out_of_pocket_met: "200",
        },
      ],
    });

    const promise = surescriptsService.getPatientBenefits("patient-1", "tenant-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result?.coverage.planName).toBe("Gold");
    expect(result?.benefits.tier1Copay).toBe(5);
  });

  it("getPatientBenefits returns mock data when missing", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const promise = surescriptsService.getPatientBenefits("patient-1", "tenant-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result?.messageId).toContain("MOCK-");
    expect(result?.coverage.isActive).toBe(true);
  });

  it("getPatientBenefits falls back on db errors", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockRejectedValueOnce(new Error("db"));

    const promise = surescriptsService.getPatientBenefits("patient-1", "tenant-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result?.coverage.isActive).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient benefits", {
      error: "db",
    });
  });

  it("getPatientBenefits masks non-Error values in logs", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockRejectedValueOnce({ subscriberName: "Jane Doe" });

    const promise = surescriptsService.getPatientBenefits("patient-1", "tenant-1");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result?.coverage.isActive).toBe(true);
    expect(loggerMock.error).toHaveBeenCalledWith("Error fetching patient benefits", {
      error: "Unknown error",
    });
  });

  it("cancelRx logs cancellation and returns message id", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const promise = surescriptsService.cancelRx("rx-1", "trans-1", "reason");
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("CANCEL-uuid-1234");
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("checkDrugInteractions returns matches for known rules", async () => {
    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.2);

    const promise = surescriptsService.checkDrugInteractions("Isotretinoin", [
      "Doxycycline",
      "Methotrexate",
    ]);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.severity)).toEqual(
      expect.arrayContaining(["severe", "moderate"])
    );
  });
});
