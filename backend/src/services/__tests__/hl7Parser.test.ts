import {
  parseHL7Message,
  validateHL7Message,
  generateACK,
  formatHL7DateTime,
  parseHL7DateTime,
  type HL7Message,
} from "../hl7Parser";
import {
  ADT_A04_REGISTER_PATIENT,
  SIU_S12_NEW_APPOINTMENT,
  ORU_R01_LAB_RESULTS_BASIC,
  INVALID_MISSING_MSH,
  INVALID_MALFORMED,
  getSampleMessageByType,
  getAllSampleMessages,
} from "./hl7.samples";

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "ack-uuid-123"),
}));

describe("hl7Parser", () => {
  it("parses ADT^A04 messages with PID and PV1 details", () => {
    const parsed = parseHL7Message(ADT_A04_REGISTER_PATIENT);

    expect(parsed.messageType).toBe("ADT^A04");
    expect(parsed.messageControlId).toBe("MSG0001");
    expect(parsed.segments.PID?.patientName.lastName).toBe("DOE");
    expect(parsed.segments.PID?.patientName.firstName).toBe("JOHN");
    expect(parsed.segments.PID?.address.city).toBe("SPRINGFIELD");
    expect(parsed.segments.PV1?.attendingDoctor.id).toBe("12345");
  });

  it("parses SIU^S12 appointment messages with SCH, AIL, and AIP segments", () => {
    const parsed = parseHL7Message(SIU_S12_NEW_APPOINTMENT);

    expect(parsed.segments.SCH?.appointmentType).toContain("Dermatology");
    expect(parsed.segments.AIL?.locationResourceId).toContain("CLINIC_ROOM_101");
    expect(parsed.segments.AIL?.locationGroup).toBe("DERM");
    expect(parsed.segments.AIP?.personnelResourceId.id).toBe("12345");
    expect(parsed.segments.AIP?.personnelResourceId.lastName).toBe("SMITH");
  });

  it("parses ORU^R01 messages with OBX observations", () => {
    const parsed = parseHL7Message(ORU_R01_LAB_RESULTS_BASIC);

    expect(parsed.segments.OBX?.length).toBe(4);
    expect(parsed.segments.OBX?.[0].observationIdentifier.code).toBe("1558-6");
    expect(parsed.segments.OBX?.[0].observationValue).toBe("95");
  });

  it("validates message requirements by type", () => {
    const adtMessage = parseHL7Message(
      "MSH|^~\\&|APP|FAC|REC|RFAC|20250101120000||ADT^A04|CTRL1|P|2.5"
    );
    const adtValidation = validateHL7Message(adtMessage);
    expect(adtValidation.valid).toBe(false);
    expect(adtValidation.errors).toContain("PID segment is required for ADT messages");

    const siuMessage = {
      messageType: "SIU^S12",
      messageControlId: "CTRL2",
      segments: { MSH: {} },
    } as HL7Message;
    const siuValidation = validateHL7Message(siuMessage);
    expect(siuValidation.errors).toContain("SCH segment is required for SIU messages");

    const oruMessage = {
      messageType: "ORU^R01",
      messageControlId: "CTRL3",
      segments: { MSH: {}, PID: {} },
    } as HL7Message;
    const oruValidation = validateHL7Message(oruMessage);
    expect(oruValidation.errors).toContain(
      "At least one OBX segment is required for ORU^R01 messages"
    );
  });

  it("throws on invalid messages without MSH segments", () => {
    expect(() => parseHL7Message(INVALID_MISSING_MSH)).toThrow(
      "Invalid HL7 message: MSH segment is required"
    );

    const malformed = parseHL7Message(INVALID_MALFORMED);
    const validation = validateHL7Message(malformed);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Message type is required");
  });

  it("generates ACK messages with mirrored sender and control id", () => {
    const parsed = parseHL7Message(ADT_A04_REGISTER_PATIENT);
    const ack = generateACK(parsed, "AA");

    expect(ack).toContain("ACK^ADT");
    expect(ack).toContain("MSA|AA|MSG0001");
    expect(ack).toContain("MSH|^~\\&|DERM_EHR|DERM_CLINIC|LAB_SYSTEM|GENERAL_HOSPITAL|");
  });

  it("formats and parses HL7 datetimes", () => {
    const date = new Date(2025, 0, 15, 10, 30, 45);
    const formatted = formatHL7DateTime(date);

    expect(formatted).toBe("20250115103045");

    const parsed = parseHL7DateTime("20250115103045");
    expect(parsed?.getFullYear()).toBe(2025);
    expect(parsed?.getMonth()).toBe(0);
    expect(parsed?.getDate()).toBe(15);
    expect(parsed?.getHours()).toBe(10);
  });

  it("exposes sample message helpers", () => {
    const sample = getSampleMessageByType("ORU^R01");
    expect(sample).toContain("ORU^R01");
    expect(getSampleMessageByType("NOPE")).toBeNull();

    const samples = getAllSampleMessages();
    expect(samples.length).toBeGreaterThan(3);
  });
});
