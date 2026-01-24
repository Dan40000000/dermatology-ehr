import * as hl7Processor from "../hl7Processor";
import { parseHL7Message, type HL7Message } from "../hl7Parser";
import {
  ADT_A04_REGISTER_PATIENT,
  ADT_A08_UPDATE_PATIENT,
  SIU_S12_NEW_APPOINTMENT,
  SIU_S13_RESCHEDULE_APPOINTMENT,
  SIU_S15_CANCEL_APPOINTMENT,
  ORU_R01_LAB_RESULTS_BASIC,
} from "./hl7.samples";
import { pool } from "../../db/pool";
import { createAuditLog } from "../audit";

jest.mock("../../db/pool", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock("../audit", () => ({
  createAuditLog: jest.fn(),
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "mock-uuid-123"),
}));

type ClientOptions = {
  existingPatientId?: string;
  providerId?: string;
  locationId?: string;
  appointmentId?: string;
};

const hasSql = (mockFn: jest.Mock, fragment: string) =>
  mockFn.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(fragment));

const buildClient = (options: ClientOptions = {}) => {
  const query = jest.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }

    if (sql.includes("FROM patients")) {
      return { rows: options.existingPatientId ? [{ id: options.existingPatientId }] : [] };
    }

    if (sql.includes("FROM providers")) {
      return { rows: options.providerId ? [{ id: options.providerId }] : [] };
    }

    if (sql.includes("FROM locations")) {
      return { rows: options.locationId ? [{ id: options.locationId }] : [] };
    }

    if (sql.includes("FROM appointments")) {
      return { rows: options.appointmentId ? [{ id: options.appointmentId }] : [] };
    }

    return { rows: [] };
  });

  return { query, release: jest.fn() };
};

describe("hl7Processor", () => {
  const tenantId = "tenant-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("processes ADT^A04 registrations and inserts new patients", async () => {
    const client = buildClient();
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(ADT_A04_REGISTER_PATIENT);
    const result = await hl7Processor.processHL7Message(message, tenantId, "user-1");

    expect(result.success).toBe(true);
    expect(result.ackMessage).toContain("MSA|AA|MSG0001");
    expect(hasSql(client.query as jest.Mock, "INSERT INTO patients")).toBe(true);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "HL7_ADT_A04",
        status: "success",
      })
    );
  });

  it("updates existing patients for ADT^A08 messages", async () => {
    const client = buildClient({ existingPatientId: "patient-1" });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(ADT_A08_UPDATE_PATIENT);
    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "UPDATE patients")).toBe(true);
  });

  it("creates appointments for SIU^S12 messages", async () => {
    const client = buildClient({
      existingPatientId: "patient-1",
      providerId: "provider-1",
      locationId: "location-1",
    });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(SIU_S12_NEW_APPOINTMENT);
    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "INSERT INTO appointments")).toBe(true);
  });

  it("reschedules appointments for SIU^S13 messages", async () => {
    const client = buildClient({ appointmentId: "appointment-1" });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(SIU_S13_RESCHEDULE_APPOINTMENT);
    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "UPDATE appointments")).toBe(true);
  });

  it("cancels appointments for SIU^S15 messages", async () => {
    const client = buildClient({ appointmentId: "appointment-1" });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(SIU_S15_CANCEL_APPOINTMENT);
    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "status = 'cancelled'")).toBe(true);
  });

  it("stores lab results for ORU^R01 messages", async () => {
    const client = buildClient({ existingPatientId: "patient-1" });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = parseHL7Message(ORU_R01_LAB_RESULTS_BASIC);
    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "INSERT INTO documents")).toBe(true);
    expect(hasSql(client.query as jest.Mock, "INSERT INTO patient_observations")).toBe(true);
  });

  it("returns failure ACKs for unsupported message types", async () => {
    const client = buildClient();
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const message = {
      messageType: "ZZZ^Z99",
      messageControlId: "CTRL-99",
      sendingApplication: "APP",
      sendingFacility: "FAC",
      receivingApplication: "REC",
      receivingFacility: "RFAC",
      timestamp: "20250101120000",
      versionId: "2.5",
      segments: { MSH: {} },
      raw: "MSH|^~\\&|APP|FAC|REC|RFAC|20250101120000||ZZZ^Z99|CTRL-99|P|2.5",
    } as HL7Message;

    const result = await hl7Processor.processHL7Message(message, tenantId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported message type");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "HL7_ZZZ_Z99_FAILED",
        status: "failure",
      })
    );
  });

  it("retries failed messages using stored parsed data", async () => {
    const parsed = parseHL7Message(ADT_A04_REGISTER_PATIENT);
    const client = buildClient();
    (pool.connect as jest.Mock).mockResolvedValue(client);

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ parsed_data: parsed }] });

    const result = await hl7Processor.retryHL7Message("message-1", tenantId);

    expect(result.success).toBe(true);
    expect(hasSql(client.query as jest.Mock, "INSERT INTO patients")).toBe(true);
  });

  it("throws when retrying messages that do not exist", async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

    await expect(hl7Processor.retryHL7Message("missing", tenantId)).rejects.toThrow(
      "HL7 message not found"
    );
  });
});
