import { encounterService } from "../encounterService";
import { pool } from "../../db/pool";
import { logger } from "../../lib/logger";

jest.mock("../../db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "uuid-1"),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

const makeClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

describe("encounterService", () => {
  it("createEncounterFromAppointment returns existing encounter", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "enc-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "enc-1",
            tenant_id: "tenant-1",
            appointment_id: "appt-1",
            patient_id: "patient-1",
            provider_id: "prov-1",
            status: "draft",
            chief_complaint: "itch",
            hpi: null,
            ros: null,
            exam: null,
            assessment_plan: null,
            created_at: "2025-01-01",
            updated_at: "2025-01-02",
          },
        ],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await encounterService.createEncounterFromAppointment(
      "tenant-1",
      "appt-1",
      "patient-1",
      "prov-1",
      "itch"
    );

    expect(result.id).toBe("enc-1");
    expect(result.chiefComplaint).toBe("itch");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("createEncounterFromAppointment inserts new encounter", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "uuid-1",
            tenant_id: "tenant-1",
            appointment_id: "appt-1",
            patient_id: "patient-1",
            provider_id: "prov-1",
            status: "draft",
            chief_complaint: "itch",
            hpi: null,
            ros: null,
            exam: null,
            assessment_plan: null,
            created_at: "2025-01-01",
            updated_at: "2025-01-01",
          },
        ],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await encounterService.createEncounterFromAppointment(
      "tenant-1",
      "appt-1",
      "patient-1",
      "prov-1",
      "itch"
    );

    expect(result.id).toBe("uuid-1");
    expect(logger.info).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO encounters"),
      expect.arrayContaining(["uuid-1", "tenant-1", "appt-1", "patient-1", "prov-1"])
    );
  });

  it("createEncounterFromAppointment rolls back on error", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom"));

    await expect(
      encounterService.createEncounterFromAppointment(
        "tenant-1",
        "appt-1",
        "patient-1",
        "prov-1"
      )
    ).rejects.toThrow("boom");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("generateChargesFromEncounter throws when encounter missing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      encounterService.generateChargesFromEncounter("tenant-1", "enc-1")
    ).rejects.toThrow("Encounter not found");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("generateChargesFromEncounter applies fee schedule pricing", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "enc-1" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "diag-1", icd10_code: "L20" },
          { id: "diag-2", icd10_code: "L30" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "charge-1", cpt_code: "11100", description: "Biopsy", quantity: 2 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ fee_cents: 500 }] })
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const result = await encounterService.generateChargesFromEncounter("tenant-1", "enc-1");

    expect(result).toHaveLength(1);
    expect(result[0].feeCents).toBe(500);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE charges"),
      expect.arrayContaining([["diag-1", "diag-2"], ["L20", "L30"]])
    );
  });

  it("generateChargesFromEncounter falls back to CPT default fees", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "enc-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "charge-1", cpt_code: "11100", description: "Biopsy", quantity: 1 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "fs-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ default_fee_cents: 250 }] })
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const result = await encounterService.generateChargesFromEncounter("tenant-1", "enc-1");

    expect(result[0].feeCents).toBe(250);
  });

  it("addProcedure inserts charge and returns id", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({});

    const result = await encounterService.addProcedure(
      "tenant-1",
      "enc-1",
      "11100",
      "Biopsy",
      1
    );

    expect(result).toBe("uuid-1");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO charges"),
      expect.arrayContaining(["uuid-1", "tenant-1", "enc-1", "11100"])
    );
  });

  it("addDiagnosis marks existing primary when needed", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const result = await encounterService.addDiagnosis(
      "tenant-1",
      "enc-1",
      "L20",
      "Dermatitis",
      true
    );

    expect(result).toBe("uuid-1");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE encounter_diagnoses"),
      ["enc-1", "tenant-1"]
    );
  });

  it("completeEncounter updates status and generates charges", async () => {
    const client = makeClient();
    connectMock.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}); // COMMIT

    const generateSpy = jest
      .spyOn(encounterService, "generateChargesFromEncounter")
      .mockResolvedValueOnce([]);

    await encounterService.completeEncounter("tenant-1", "enc-1");

    expect(generateSpy).toHaveBeenCalledWith("tenant-1", "enc-1");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    generateSpy.mockRestore();
  });

  it("getEncounterDetails returns null when missing", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await encounterService.getEncounterDetails("tenant-1", "enc-1");

    expect(result).toBeNull();
  });

  it("getEncounterDetails returns encounter with details", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "enc-1", patient_id: "patient-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "diag-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "charge-1" }] });

    const result = await encounterService.getEncounterDetails("tenant-1", "enc-1");

    expect(result.diagnoses).toHaveLength(1);
    expect(result.charges).toHaveLength(1);
  });
});
