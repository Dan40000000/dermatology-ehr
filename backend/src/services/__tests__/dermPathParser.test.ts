import { DermPathParser } from "../dermPathParser";

describe("DermPathParser", () => {
  it("parses key fields from a report", () => {
    const report = `
ACCESSION NUMBER: ABC-123
SPECIMEN: Shave biopsy, left forearm, 0.5 x 0.3 x 0.2 cm
SITE: Left forearm

CLINICAL HISTORY: New lesion.
CLINICAL DIAGNOSIS: Rule out BCC.

GROSS DESCRIPTION: Tan-brown tissue.
MICROSCOPIC DESCRIPTION: There is hyperkeratosis and basal cell nests. Margins are clear by 2 mm.

DIAGNOSIS: Basal cell carcinoma.
SPECIAL STAINS: PAS: negative. Melan-A positive.

COMMENT: Recommend follow-up.
`;

    const parsed = DermPathParser.parseReport(report);

    expect(parsed.accessionNumber).toBe("ABC-123");
    expect(parsed.specimenSite).toBe("Left forearm");
    expect(parsed.specimenType).toBe("Shave Biopsy");
    expect(parsed.specimenSize).toBe("0.5 x 0.3 x 0.2 cm");
    expect(parsed.clinicalHistory).toMatch(/New lesion/i);
    expect(parsed.clinicalDiagnosis).toMatch(/Rule out BCC/i);
    expect(parsed.grossDescription).toMatch(/Tan-brown/i);
    expect(parsed.microscopicDescription).toMatch(/hyperkeratosis/i);
    expect(parsed.diagnosis).toMatch(/Basal cell carcinoma/i);
    expect(parsed.specialStains).toEqual(
      expect.arrayContaining([
        { name: "PAS", result: "negative" },
        { name: "Melan-A", result: "positive" },
      ])
    );
    expect(parsed.margins?.status).toBe("clear");
    expect(parsed.margins?.measurements).toBe("2 mm");
    expect(parsed.comment).toMatch(/Recommend follow-up/i);
  });

  it("handles alternate accession formats and missing sections", () => {
    const report = `
ACC# ZX-99
DIAGNOSIS: Actinic keratosis.
`;

    const parsed = DermPathParser.parseReport(report);

    expect(parsed.accessionNumber).toBe("ZX-99");
    expect(parsed.specimenType).toBeUndefined();
    expect(parsed.specimenSize).toBeUndefined();
    expect(parsed.specialStains).toBeUndefined();
  });

  it("detects involved and close margins", () => {
    const involvedReport = `
DIAGNOSIS: Squamous cell carcinoma. Margins are involved.
`;
    const closeReport = `
MICROSCOPIC DESCRIPTION: Close margin noted.
`;

    const involved = DermPathParser.parseReport(involvedReport);
    const close = DermPathParser.parseReport(closeReport);

    expect(involved.margins?.status).toBe("involved");
    expect(close.margins?.status).toBe("close");
  });

  it("suggests SNOMED codes and extracts findings", () => {
    expect(DermPathParser.suggestSNOMEDCode("Basal cell carcinoma")).toBe("254701007");
    expect(DermPathParser.suggestSNOMEDCode("Unknown condition")).toBeNull();

    const findings = DermPathParser.extractKeyFindings(
      "Hyperkeratosis with basal cell nests and lymphocytic infiltrate."
    );
    expect(findings).toEqual(
      expect.arrayContaining(["Hyperkeratosis", "Basal cell nests", "Lymphocytic infiltrate"])
    );
  });

  it("generates a readable summary", () => {
    const summary = DermPathParser.generateSummary({
      specimenType: "Punch Biopsy",
      specimenSite: "Right cheek",
      diagnosis: "melanoma",
      margins: { status: "involved" },
    });

    expect(summary).toBe("Punch Biopsy from Right cheek showing melanoma with involved margins.");
  });
});
