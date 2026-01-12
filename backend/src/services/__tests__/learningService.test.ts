import {
  recordDiagnosisUsage,
  recordProcedureUsage,
  recordDiagnosisProcedurePair,
  recordEncounterLearning,
  calculateAdaptiveScore,
} from "../learningService";
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

describe("learningService", () => {
  it("records diagnosis usage", async () => {
    await recordDiagnosisUsage("tenant-1", "prov-1", "L40.0");
    expect(queryMock).toHaveBeenCalled();
    expect(queryMock.mock.calls[0][0]).toContain("provider_diagnosis_frequency");
  });

  it("records procedure usage", async () => {
    await recordProcedureUsage("tenant-1", "prov-1", "11100");
    expect(queryMock).toHaveBeenCalled();
    expect(queryMock.mock.calls[0][0]).toContain("provider_procedure_frequency");
  });

  it("records diagnosis-procedure pair", async () => {
    await recordDiagnosisProcedurePair("tenant-1", "prov-1", "L40.0", "11100");
    expect(queryMock).toHaveBeenCalled();
    expect(queryMock.mock.calls[0][0]).toContain("diagnosis_procedure_pairs");
  });

  it("recordEncounterLearning throws when encounter missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(recordEncounterLearning("enc-1")).rejects.toThrow("Encounter not found");
  });

  it("recordEncounterLearning processes diagnoses and procedures", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ tenant_id: "tenant-1", provider_id: "prov-1" }] })
      .mockResolvedValueOnce({ rows: [{ icd10_code: "L40.0" }, { icd10_code: "L20.9" }] })
      .mockResolvedValueOnce({ rows: [{ cpt_code: "11100" }] });

    await recordEncounterLearning("enc-1");

    expect(queryMock).toHaveBeenCalled();
    expect(queryMock.mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it("calculateAdaptiveScore favors recent usage", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 2);
    const score = calculateAdaptiveScore(10, recent);
    expect(score).toBeGreaterThan(7);
  });

  it("calculateAdaptiveScore reduces score for older usage", () => {
    const older = new Date();
    older.setDate(older.getDate() - 120);
    const score = calculateAdaptiveScore(2, older);
    expect(score).toBeLessThan(2);
  });
});
