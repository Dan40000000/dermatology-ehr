import { pool } from "../../db/pool";
import {
  normalizeInsuranceFields,
  parseInsuranceLabel,
  resolveInsurancePayer,
} from "../insuranceNormalization";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe("insuranceNormalization", () => {
  beforeEach(() => {
    (pool.query as jest.Mock).mockReset();
  });

  it("parses legacy insurance display text into structured fields", () => {
    const parsed = parseInsuranceLabel("UMR - ID: 123456789 - Group: 7654321");

    expect(parsed).toMatchObject({
      payerName: "UMR",
      insuranceMemberId: "123456789",
      insuranceGroupNumber: "7654321",
    });
  });

  it("resolves UMR from fallback aliases when payer tables are empty", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    const payer = await resolveInsurancePayer("tenant-1", "United Medical Resources");

    expect(payer).toEqual({ payerId: "UMR", payerName: "UMR" });
  });

  it("normalizes explicit member/group with a payer alias", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    const normalized = await normalizeInsuranceFields("tenant-1", {
      insuranceProvider: "UMR",
      insuranceId: "M123",
      insuranceGroupNumber: "G456",
    });

    expect(normalized).toMatchObject({
      payerName: "UMR",
      insurancePayerId: "UMR",
      insuranceMemberId: "M123",
      insuranceGroupNumber: "G456",
    });
  });

  it("ignores placeholder payer names and falls back to the insurance label", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    const normalized = await normalizeInsuranceFields("tenant-1", {
      insurance: "Blue Cross Blue Shield",
      insuranceProvider: "Unknown",
      insuranceId: "M123",
    });

    expect(normalized).toMatchObject({
      payerName: "Blue Cross Blue Shield",
      insurancePayerId: "BCBS",
      insuranceMemberId: "M123",
    });
  });
});
