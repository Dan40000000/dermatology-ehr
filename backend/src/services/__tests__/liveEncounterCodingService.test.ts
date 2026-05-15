import { suggestLiveCodingFromDocumentation } from "../liveEncounterCodingService";

describe("live encounter coding suggestions", () => {
  it("codes rule-out melanoma workups as uncertain behavior instead of confirmed melanoma", () => {
    const result = suggestLiveCodingFromDocumentation({
      chiefComplaint: "Changing mole on upper back",
      hpi: "Patient reports a growing irregular mole that has been bleeding.",
      exam: "Suspicious pigmented lesion on upper back. Shave biopsy performed today.",
      assessmentPlan: "Neoplasm of uncertain behavior of skin. Shave biopsy to rule out melanoma.",
    });

    const diagnosisCodes = result.diagnosisRules.map((rule) => rule.code);
    const procedureCodes = result.procedureRules.map((rule) => rule.code);

    expect(diagnosisCodes).toContain("D48.5");
    expect(diagnosisCodes).not.toContain("C43.9");
    expect(procedureCodes).toContain("11102");
    expect(result.emCode).toBe("99214");
  });

  it("allows confirmed melanoma wording to suggest melanoma ICD-10 coding", () => {
    const result = suggestLiveCodingFromDocumentation({
      assessmentPlan: "Pathology showed malignant melanoma. Discussed diagnosis and surgical referral.",
    });

    expect(result.diagnosisRules.map((rule) => rule.code)).toContain("C43.9");
  });
});

