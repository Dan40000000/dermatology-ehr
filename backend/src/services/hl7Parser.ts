import crypto from "crypto";

/**
 * HL7 v2.x Parser Service
 * Parses HL7 pipe-delimited messages into structured data
 */

export interface HL7Message {
  messageType: string;
  messageControlId: string;
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  timestamp: string;
  versionId: string;
  segments: {
    MSH?: MSHSegment;
    PID?: PIDSegment;
    PV1?: PV1Segment;
    OBX?: OBXSegment[];
    SCH?: SCHSegment;
    AIL?: AILSegment;
    AIP?: AIPSegment;
    [key: string]: any;
  };
  raw: string;
}

export interface MSHSegment {
  fieldSeparator: string;
  encodingCharacters: string;
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  timestamp: string;
  security: string;
  messageType: string;
  messageControlId: string;
  processingId: string;
  versionId: string;
}

export interface PIDSegment {
  setId: string;
  externalPatientId: string;
  internalPatientId: string;
  alternatePatientId: string;
  patientName: {
    lastName: string;
    firstName: string;
    middleName: string;
    suffix: string;
    prefix: string;
  };
  mothersMaidenName: string;
  dateOfBirth: string;
  sex: string;
  patientAlias: string;
  race: string;
  address: {
    street: string;
    otherDesignation: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  countryCode: string;
  phoneHome: string;
  phoneBusiness: string;
  primaryLanguage: string;
  maritalStatus: string;
  religion: string;
  patientAccountNumber: string;
  ssn: string;
  driversLicense: string;
  mothersIdentifier: string;
  ethnicGroup: string;
  birthPlace: string;
  multipleBirthIndicator: string;
  birthOrder: string;
}

export interface PV1Segment {
  setId: string;
  patientClass: string;
  assignedPatientLocation: string;
  admissionType: string;
  preadmitNumber: string;
  priorPatientLocation: string;
  attendingDoctor: {
    id: string;
    lastName: string;
    firstName: string;
  };
  referringDoctor: {
    id: string;
    lastName: string;
    firstName: string;
  };
  consultingDoctor: string[];
  hospitalService: string;
  temporaryLocation: string;
  preadmitTestIndicator: string;
  readmissionIndicator: string;
  admitSource: string;
  ambulatoryStatus: string;
  vipIndicator: string;
  admittingDoctor: {
    id: string;
    lastName: string;
    firstName: string;
  };
  patientType: string;
  visitNumber: string;
  financialClass: string;
}

export interface OBXSegment {
  setId: string;
  valueType: string;
  observationIdentifier: {
    code: string;
    text: string;
    codingSystem: string;
  };
  observationSubId: string;
  observationValue: string;
  units: string;
  referenceRange: string;
  abnormalFlags: string;
  probability: string;
  natureOfAbnormalTest: string;
  observationResultStatus: string;
  dateOfObservation: string;
  producersId: string;
  responsibleObserver: string;
}

export interface SCHSegment {
  placerAppointmentId: string;
  fillerAppointmentId: string;
  occurrenceNumber: string;
  placerGroupNumber: string;
  scheduleId: string;
  eventReason: string;
  appointmentReason: string;
  appointmentType: string;
  appointmentDuration: string;
  appointmentDurationUnits: string;
  appointmentTimingQuantity: string;
  placerContactPerson: string;
  placerContactPhoneNumber: string;
  placerContactAddress: string;
  placerContactLocation: string;
  fillerContactPerson: string;
  fillerContactPhoneNumber: string;
  fillerContactAddress: string;
  fillerContactLocation: string;
  enteredByPerson: string;
  enteredByPhoneNumber: string;
  enteredByLocation: string;
  parentPlacerAppointmentId: string;
  parentFillerAppointmentId: string;
  fillerStatusCode: string;
}

export interface AILSegment {
  setId: string;
  segmentActionCode: string;
  locationResourceId: string;
  locationTypeAil: string;
  locationGroup: string;
  startDateTime: string;
  startDateTimeOffset: string;
  startDateTimeOffsetUnits: string;
  duration: string;
  durationUnits: string;
}

export interface AIPSegment {
  setId: string;
  segmentActionCode: string;
  personnelResourceId: {
    id: string;
    lastName: string;
    firstName: string;
  };
  resourceRole: string;
  resourceGroup: string;
  startDateTime: string;
  startDateTimeOffset: string;
  startDateTimeOffsetUnits: string;
  duration: string;
  durationUnits: string;
}

/**
 * Parse an HL7 v2.x message
 */
export function parseHL7Message(rawMessage: string): HL7Message {
  if (!rawMessage || typeof rawMessage !== "string") {
    throw new Error("Invalid HL7 message: message must be a non-empty string");
  }

  // Normalize line endings (support both \r and \n)
  const normalizedMessage = rawMessage.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  const lines = normalizedMessage.split("\r").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("Invalid HL7 message: no segments found");
  }

  const segments: any = {};
  const obxSegments: OBXSegment[] = [];

  for (const line of lines) {
    const segmentType = line.substring(0, 3);

    try {
      switch (segmentType) {
        case "MSH":
          segments.MSH = parseMSH(line);
          break;
        case "PID":
          segments.PID = parsePID(line);
          break;
        case "PV1":
          segments.PV1 = parsePV1(line);
          break;
        case "OBX":
          obxSegments.push(parseOBX(line));
          break;
        case "SCH":
          segments.SCH = parseSCH(line);
          break;
        case "AIL":
          segments.AIL = parseAIL(line);
          break;
        case "AIP":
          segments.AIP = parseAIP(line);
          break;
        default:
          // Store unknown segments as raw strings
          if (!segments[segmentType]) {
            segments[segmentType] = [];
          }
          segments[segmentType].push(line);
      }
    } catch (error) {
      throw new Error(`Error parsing ${segmentType} segment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (obxSegments.length > 0) {
    segments.OBX = obxSegments;
  }

  if (!segments.MSH) {
    throw new Error("Invalid HL7 message: MSH segment is required");
  }

  return {
    messageType: segments.MSH.messageType || '',
    messageControlId: segments.MSH.messageControlId || crypto.randomUUID(),
    sendingApplication: segments.MSH.sendingApplication,
    sendingFacility: segments.MSH.sendingFacility,
    receivingApplication: segments.MSH.receivingApplication,
    receivingFacility: segments.MSH.receivingFacility,
    timestamp: segments.MSH.timestamp,
    versionId: segments.MSH.versionId,
    segments,
    raw: rawMessage,
  };
}

/**
 * Parse MSH (Message Header) segment
 */
function parseMSH(line: string): MSHSegment {
  // MSH is special - field separator is at position 3, encoding chars at position 4
  const fieldSeparator = line[3] || '|';
  const encodingCharacters = line.substring(4, 8);
  const fields = line.split(fieldSeparator);

  return {
    fieldSeparator,
    encodingCharacters,
    sendingApplication: fields[2] || "",
    sendingFacility: fields[3] || "",
    receivingApplication: fields[4] || "",
    receivingFacility: fields[5] || "",
    timestamp: fields[6] || "",
    security: fields[7] || "",
    messageType: fields[8] || "",
    messageControlId: fields[9] || "",
    processingId: fields[10] || "",
    versionId: fields[11] || "",
  };
}

/**
 * Parse PID (Patient Identification) segment
 */
function parsePID(line: string): PIDSegment {
  const fields = line.split("|");
  const nameComponents = parseHL7Name(fields[5] || "");
  const addressComponents = parseHL7Address(fields[11] || "");

  return {
    setId: fields[1] || "",
    externalPatientId: fields[2] || "",
    internalPatientId: parseHL7Identifier(fields[3] || ""),
    alternatePatientId: fields[4] || "",
    patientName: nameComponents,
    mothersMaidenName: fields[6] || "",
    dateOfBirth: fields[7] || "",
    sex: fields[8] || "",
    patientAlias: fields[9] || "",
    race: fields[10] || "",
    address: addressComponents,
    countryCode: fields[12] || "",
    phoneHome: fields[13] || "",
    phoneBusiness: fields[14] || "",
    primaryLanguage: fields[15] || "",
    maritalStatus: fields[16] || "",
    religion: fields[17] || "",
    patientAccountNumber: fields[18] || "",
    ssn: fields[19] || "",
    driversLicense: fields[20] || "",
    mothersIdentifier: fields[21] || "",
    ethnicGroup: fields[22] || "",
    birthPlace: fields[23] || "",
    multipleBirthIndicator: fields[24] || "",
    birthOrder: fields[25] || "",
  };
}

/**
 * Parse PV1 (Patient Visit) segment
 */
function parsePV1(line: string): PV1Segment {
  const fields = line.split("|");
  const attendingDoctor = parseHL7Provider(fields[7] || "");
  const referringDoctor = parseHL7Provider(fields[8] || "");
  const admittingDoctor = parseHL7Provider(fields[17] || "");

  return {
    setId: fields[1] || "",
    patientClass: fields[2] || "",
    assignedPatientLocation: fields[3] || "",
    admissionType: fields[4] || "",
    preadmitNumber: fields[5] || "",
    priorPatientLocation: fields[6] || "",
    attendingDoctor,
    referringDoctor,
    consultingDoctor: fields[9] ? fields[9].split("~") : [],
    hospitalService: fields[10] || "",
    temporaryLocation: fields[11] || "",
    preadmitTestIndicator: fields[12] || "",
    readmissionIndicator: fields[13] || "",
    admitSource: fields[14] || "",
    ambulatoryStatus: fields[15] || "",
    vipIndicator: fields[16] || "",
    admittingDoctor,
    patientType: fields[18] || "",
    visitNumber: fields[19] || "",
    financialClass: fields[20] || "",
  };
}

/**
 * Parse OBX (Observation Result) segment
 */
function parseOBX(line: string): OBXSegment {
  const fields = line.split("|");
  const observationId = parseHL7CodedElement(fields[3] || "");

  return {
    setId: fields[1] || "",
    valueType: fields[2] || "",
    observationIdentifier: observationId,
    observationSubId: fields[4] || "",
    observationValue: fields[5] || "",
    units: fields[6] || "",
    referenceRange: fields[7] || "",
    abnormalFlags: fields[8] || "",
    probability: fields[9] || "",
    natureOfAbnormalTest: fields[10] || "",
    observationResultStatus: fields[11] || "",
    dateOfObservation: fields[14] || "",
    producersId: fields[15] || "",
    responsibleObserver: fields[16] || "",
  };
}

/**
 * Parse SCH (Schedule Activity Information) segment
 */
function parseSCH(line: string): SCHSegment {
  const fields = line.split("|");

  return {
    placerAppointmentId: fields[1] || "",
    fillerAppointmentId: fields[2] || "",
    occurrenceNumber: fields[3] || "",
    placerGroupNumber: fields[4] || "",
    scheduleId: fields[5] || "",
    eventReason: fields[6] || "",
    appointmentReason: fields[7] || "",
    appointmentType: fields[8] || "",
    appointmentDuration: fields[9] || "",
    appointmentDurationUnits: fields[10] || "",
    appointmentTimingQuantity: fields[11] || "",
    placerContactPerson: fields[12] || "",
    placerContactPhoneNumber: fields[13] || "",
    placerContactAddress: fields[14] || "",
    placerContactLocation: fields[15] || "",
    fillerContactPerson: fields[16] || "",
    fillerContactPhoneNumber: fields[17] || "",
    fillerContactAddress: fields[18] || "",
    fillerContactLocation: fields[19] || "",
    enteredByPerson: fields[20] || "",
    enteredByPhoneNumber: fields[21] || "",
    enteredByLocation: fields[22] || "",
    parentPlacerAppointmentId: fields[23] || "",
    parentFillerAppointmentId: fields[24] || "",
    fillerStatusCode: fields[25] || "",
  };
}

/**
 * Parse AIL (Appointment Information - Location Resource) segment
 */
function parseAIL(line: string): AILSegment {
  const fields = line.split("|");

  return {
    setId: fields[1] || "",
    segmentActionCode: fields[2] || "",
    locationResourceId: fields[3] || "",
    locationTypeAil: fields[4] || "",
    locationGroup: fields[5] || "",
    startDateTime: fields[6] || "",
    startDateTimeOffset: fields[7] || "",
    startDateTimeOffsetUnits: fields[8] || "",
    duration: fields[9] || "",
    durationUnits: fields[10] || "",
  };
}

/**
 * Parse AIP (Appointment Information - Personnel Resource) segment
 */
function parseAIP(line: string): AIPSegment {
  const fields = line.split("|");
  const personnel = parseHL7Provider(fields[3] || "");

  return {
    setId: fields[1] || "",
    segmentActionCode: fields[2] || "",
    personnelResourceId: personnel,
    resourceRole: fields[4] || "",
    resourceGroup: fields[5] || "",
    startDateTime: fields[6] || "",
    startDateTimeOffset: fields[7] || "",
    startDateTimeOffsetUnits: fields[8] || "",
    duration: fields[9] || "",
    durationUnits: fields[10] || "",
  };
}

/**
 * Parse HL7 name field (last^first^middle^suffix^prefix)
 */
function parseHL7Name(nameField: string): {
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  prefix: string;
} {
  const components = nameField.split("^");
  return {
    lastName: components[0] || "",
    firstName: components[1] || "",
    middleName: components[2] || "",
    suffix: components[3] || "",
    prefix: components[4] || "",
  };
}

/**
 * Parse HL7 address field (street^other^city^state^zip^country)
 */
function parseHL7Address(addressField: string): {
  street: string;
  otherDesignation: string;
  city: string;
  state: string;
  zip: string;
  country: string;
} {
  const components = addressField.split("^");
  return {
    street: components[0] || "",
    otherDesignation: components[1] || "",
    city: components[2] || "",
    state: components[3] || "",
    zip: components[4] || "",
    country: components[5] || "",
  };
}

/**
 * Parse HL7 identifier field (id^^^authority)
 */
function parseHL7Identifier(identifierField: string): string {
  const components = identifierField.split("^");
  return components[0] || "";
}

/**
 * Parse HL7 coded element (code^text^coding system)
 */
function parseHL7CodedElement(codedField: string): {
  code: string;
  text: string;
  codingSystem: string;
} {
  const components = codedField.split("^");
  return {
    code: components[0] || "",
    text: components[1] || "",
    codingSystem: components[2] || "",
  };
}

/**
 * Parse HL7 provider field (id^last^first)
 */
function parseHL7Provider(providerField: string): {
  id: string;
  lastName: string;
  firstName: string;
} {
  const components = providerField.split("^");
  return {
    id: components[0] || "",
    lastName: components[1] || "",
    firstName: components[2] || "",
  };
}

/**
 * Generate HL7 ACK (Acknowledgment) message
 */
export function generateACK(message: HL7Message, acknowledgmentCode: "AA" | "AE" | "AR"): string {
  const timestamp = formatHL7DateTime(new Date());
  const ackControlId = crypto.randomUUID().substring(0, 20);

  const ackType = message.messageType.split("^")[0];

  const mshLine = `MSH|^~\\&|${message.receivingApplication}|${message.receivingFacility}|${message.sendingApplication}|${message.sendingFacility}|${timestamp}||ACK^${ackType}|${ackControlId}|P|${message.versionId}`;
  const msaLine = `MSA|${acknowledgmentCode}|${message.messageControlId}`;

  return `${mshLine}\r${msaLine}`;
}

/**
 * Format a Date object as HL7 datetime (YYYYMMDDHHmmss)
 */
export function formatHL7DateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Parse HL7 datetime to JavaScript Date
 */
export function parseHL7DateTime(hl7DateTime: string): Date | null {
  if (!hl7DateTime || hl7DateTime.length < 8) {
    return null;
  }

  const year = parseInt(hl7DateTime.substring(0, 4), 10);
  const month = parseInt(hl7DateTime.substring(4, 6), 10) - 1;
  const day = parseInt(hl7DateTime.substring(6, 8), 10);
  const hours = hl7DateTime.length >= 10 ? parseInt(hl7DateTime.substring(8, 10), 10) : 0;
  const minutes = hl7DateTime.length >= 12 ? parseInt(hl7DateTime.substring(10, 12), 10) : 0;
  const seconds = hl7DateTime.length >= 14 ? parseInt(hl7DateTime.substring(12, 14), 10) : 0;

  return new Date(year, month, day, hours, minutes, seconds);
}

/**
 * Validate HL7 message structure
 */
export function validateHL7Message(message: HL7Message): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!message.messageType) {
    errors.push("Message type is required");
  }

  if (!message.messageControlId) {
    errors.push("Message control ID is required");
  }

  if (!message.segments.MSH) {
    errors.push("MSH segment is required");
  }

  // Validate message type specific requirements
  const msgType = message.messageType;

  if (msgType.startsWith("ADT^")) {
    if (!message.segments.PID) {
      errors.push("PID segment is required for ADT messages");
    }
  }

  if (msgType.startsWith("SIU^")) {
    if (!message.segments.SCH) {
      errors.push("SCH segment is required for SIU messages");
    }
  }

  if (msgType === "ORU^R01") {
    if (!message.segments.OBX || message.segments.OBX.length === 0) {
      errors.push("At least one OBX segment is required for ORU^R01 messages");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
