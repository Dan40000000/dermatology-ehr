import { applyAutoFixes, getPassedChecks, scrubClaim } from "../claimScrubber";
import { pool } from "../../db/pool";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

const baseClaim = {
  id: "claim-1",
  tenantId: "tenant-1",
  patientId: "patient-1",
  serviceDate: "2025-01-01",
  lineItems: [
    { cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 },
    { cpt: "11100", dx: ["L70.0"], units: 1, charge: 200 },
    { cpt: "11101", dx: ["L70.0"], units: 1, charge: 150 },
    { cpt: "J0585", dx: ["L70.0"], units: 1, charge: 300, description: "Botox" },
    { cpt: "88305", dx: [], units: 1, charge: 50 },
  ],
};

beforeEach(() => {
  queryMock.mockReset();
});

describe("claimScrubber", () => {
  it("scrubs rules across multiple logic types", async () => {
    const rules = [
      {
        rule_code: "MM1",
        rule_name: "Missing modifier 25",
        severity: "warning",
        rule_logic: {
          type: "missing_modifier",
          conditions: {
            cpt_pattern: "99*",
            with_cpt_type: "procedure",
            missing_modifier: "25",
            multiple_procedures: true,
            different_sites: true,
          },
          suggestion: "Add modifier 25",
          auto_fix: true,
        },
      },
      {
        rule_code: "COS1",
        rule_name: "Cosmetic check",
        severity: "warning",
        rule_logic: {
          type: "cosmetic_check",
          conditions: { cpt_or_hcpcs: ["J0585"] },
        },
      },
      {
        rule_code: "PA1",
        rule_name: "Prior auth check",
        severity: "error",
        rule_logic: {
          type: "prior_auth_check",
          conditions: { hcpcs_pattern: "J*" },
        },
      },
      {
        rule_code: "MN1",
        rule_name: "Medical necessity",
        severity: "error",
        rule_logic: { type: "medical_necessity", conditions: {} },
      },
      {
        rule_code: "DUP1",
        rule_name: "Duplicate claim",
        severity: "warning",
        rule_logic: { type: "duplicate_check", conditions: {} },
      },
      {
        rule_code: "DOC1",
        rule_name: "Documentation check",
        severity: "info",
        rule_logic: { type: "documentation_check", conditions: { cpt: ["88305"] } },
      },
      {
        rule_code: "UNK1",
        rule_name: "Unknown",
        severity: "info",
        rule_logic: { type: "unknown_type", conditions: {} },
      },
    ];

    queryMock.mockImplementation((query: string) => {
      if (query.includes("FROM claim_scrub_rules")) {
        return Promise.resolve({ rows: rules, rowCount: rules.length });
      }
      if (query.includes("FROM prior_authorizations")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (query.includes("FROM claims")) {
        return Promise.resolve({
          rows: [{ id: "claim-old", claim_number: "CLM-001", status: "submitted" }],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const result = await scrubClaim(baseClaim);

    expect(result.status).toBe("errors");
    expect(result.canSubmit).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    expect(result.info).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/requires prior authorization|has no linked diagnosis/i);
  });

  it("returns clean when no rules apply", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await scrubClaim({
      ...baseClaim,
      lineItems: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 }],
    });

    expect(result.status).toBe("clean");
    expect(result.canSubmit).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("applyAutoFixes adds missing modifiers", () => {
    const fixed = applyAutoFixes(
      {
        ...baseClaim,
        lineItems: [{ cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 }],
      },
      [
        {
          severity: "warning",
          ruleCode: "MM1",
          ruleName: "Missing modifier 25",
          message: "Missing modifier",
          autoFixable: true,
          autoFixAction: { type: "add_modifier", cpt: "99213", modifier: "25" },
        },
      ]
    );

    expect(fixed.lineItems[0]?.modifiers).toContain("25");
  });

  it("getPassedChecks reports diagnosis support when all dx present", () => {
    const passed = getPassedChecks({
      ...baseClaim,
      lineItems: [
        { cpt: "99213", dx: ["L70.0"], units: 1, charge: 100 },
        { cpt: "11100", dx: ["L70.0"], units: 1, charge: 200 },
      ],
    });

    expect(passed).toEqual(expect.arrayContaining(["Diagnosis supports procedure", "No duplicate claim found"]));
  });
});
