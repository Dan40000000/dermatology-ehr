import {
  applySuggestedModifiers,
  checkModifierRequirements,
  getAllModifierRules,
  getModifierInfo,
  suggestModifiers,
  validateModifiers,
} from "../modifierEngine";
import { pool } from "../../db/pool";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("modifierEngine", () => {
  it("suggestModifiers adds required suggestions for E/M and multiple procedures", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { modifier_code: "25", modifier_name: "Modifier 25", description: "desc" },
        { modifier_code: "59", modifier_name: "Modifier 59", description: "desc" },
        { modifier_code: "XS", modifier_name: "Modifier XS", description: "desc" },
        { modifier_code: "76", modifier_name: "Modifier 76", description: "desc" },
      ],
    });

    const suggestions = await suggestModifiers("tenant-1", [
      { cpt: "99213", dx: ["L20"], units: 1, charge: 100 },
      { cpt: "11100", dx: ["L20"], units: 1, charge: 200 },
      { cpt: "11101", dx: ["L20"], units: 1, charge: 150 },
      { cpt: "11100", dx: ["L20"], units: 1, charge: 200 },
    ]);

    const codes = suggestions.map(s => s.modifier);
    expect(codes).toEqual(expect.arrayContaining(["25", "59", "XS", "76"]));
  });

  it("getModifierInfo returns null when missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getModifierInfo("25");

    expect(result).toBeNull();
  });

  it("getModifierInfo returns rule when present", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ modifier_code: "25" }], rowCount: 1 });

    const result = await getModifierInfo("25");

    expect(result.modifier_code).toBe("25");
  });

  it("getAllModifierRules returns rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ modifier_code: "25" }] });

    const result = await getAllModifierRules();

    expect(result).toHaveLength(1);
  });

  it("validateModifiers catches conflicts and duplicates", () => {
    const result = validateModifiers([
      { cpt: "11100", dx: [], units: 1, charge: 100, modifiers: ["59", "XS", "59"] },
      { cpt: "11101", dx: [], units: 1, charge: 120, modifiers: ["76", "77"] },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("applySuggestedModifiers adds required modifiers", () => {
    const updated = applySuggestedModifiers(
      [
        { cpt: "99213", dx: [], units: 1, charge: 100 },
        { cpt: "11100", dx: [], units: 1, charge: 200 },
        { cpt: "11101", dx: [], units: 1, charge: 150 },
      ],
      [
        { modifier: "25", name: "Modifier 25", description: "", reason: "", required: true, confidence: "high" },
        { modifier: "59", name: "Modifier 59", description: "", reason: "", required: true, confidence: "high" },
      ]
    );

    expect(updated[0].modifiers).toContain("25");
    expect(updated[2].modifiers).toContain("59");
  });

  it("checkModifierRequirements flags missing modifiers", () => {
    const requirements = checkModifierRequirements([
      { cpt: "99213", dx: [], units: 1, charge: 100 },
      { cpt: "11100", dx: [], units: 1, charge: 200 },
      { cpt: "11101", dx: [], units: 1, charge: 150 },
    ]);

    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cpt: "99213", requiredModifiers: ["25"] }),
      ])
    );
  });
});
