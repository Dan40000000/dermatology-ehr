import crypto from "crypto";
import { pool } from "../db/pool";
import {
  HL7Message,
  PIDSegment,
  OBXSegment,
  SCHSegment,
  AILSegment,
  AIPSegment,
  generateACK,
  parseHL7DateTime,
} from "./hl7Parser";
import { createAuditLog } from "./audit";

/**
 * HL7 v2.x Message Processor
 * Processes parsed HL7 messages and updates database
 */

export interface ProcessingResult {
  success: boolean;
  ackMessage: string;
  error?: string;
  resourceId?: string;
}

/**
 * Main processor - routes to appropriate handler based on message type
 */
export async function processHL7Message(message: HL7Message, tenantId: string, userId?: string): Promise<ProcessingResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let resourceId: string | undefined;

    switch (message.messageType) {
      case "ADT^A04": // Register Patient
        resourceId = await processPatientRegistration(message, tenantId, client);
        break;

      case "ADT^A08": // Update Patient Information
        resourceId = await processPatientUpdate(message, tenantId, client);
        break;

      case "SIU^S12": // New Appointment Notification
        resourceId = await processNewAppointment(message, tenantId, client);
        break;

      case "SIU^S13": // Reschedule Appointment
        resourceId = await processRescheduleAppointment(message, tenantId, client);
        break;

      case "SIU^S15": // Cancel Appointment
        resourceId = await processCancelAppointment(message, tenantId, client);
        break;

      case "ORU^R01": // Observation Result
        resourceId = await processLabResults(message, tenantId, client);
        break;

      default:
        throw new Error(`Unsupported message type: ${message.messageType}`);
    }

    // Log to audit trail
    await createAuditLog({
      tenantId,
      userId: userId || null,
      action: `HL7_${message.messageType.replace("^", "_")}`,
      resourceType: "hl7_message",
      resourceId: message.messageControlId,
      metadata: {
        messageType: message.messageType,
        sendingApplication: message.sendingApplication,
        sendingFacility: message.sendingFacility,
        processedResourceId: resourceId,
      },
      severity: "info",
      status: "success",
    });

    await client.query("COMMIT");

    return {
      success: true,
      ackMessage: generateACK(message, "AA"), // Application Accept
      resourceId,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    // Log error to audit trail
    await createAuditLog({
      tenantId,
      userId: userId || null,
      action: `HL7_${message.messageType.replace("^", "_")}_FAILED`,
      resourceType: "hl7_message",
      resourceId: message.messageControlId,
      metadata: {
        messageType: message.messageType,
        sendingApplication: message.sendingApplication,
        error: error instanceof Error ? error.message : String(error),
      },
      severity: "error",
      status: "failure",
    });

    return {
      success: false,
      ackMessage: generateACK(message, "AE"), // Application Error
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

/**
 * Process ADT^A04 - Register Patient
 */
async function processPatientRegistration(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const pid = message.segments.PID;
  if (!pid) {
    throw new Error("PID segment is required for patient registration");
  }

  return await upsertPatient(pid, tenantId, client);
}

/**
 * Process ADT^A08 - Update Patient Information
 */
async function processPatientUpdate(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const pid = message.segments.PID;
  if (!pid) {
    throw new Error("PID segment is required for patient update");
  }

  return await upsertPatient(pid, tenantId, client);
}

/**
 * Upsert patient data from PID segment
 */
async function upsertPatient(pid: PIDSegment, tenantId: string, client: any): Promise<string> {
  const patientId = pid.internalPatientId || pid.externalPatientId;
  if (!patientId) {
    throw new Error("Patient identifier is required");
  }

  // Check if patient exists by external ID
  const existingPatient = await client.query(
    `SELECT id FROM patients
     WHERE tenant_id = $1
     AND (external_id = $2 OR mrn = $2)
     LIMIT 1`,
    [tenantId, patientId]
  );

  const dob = parseHL7DateTime(pid.dateOfBirth);
  const phone = pid.phoneHome || pid.phoneBusiness;

  if (existingPatient.rows.length > 0) {
    // Update existing patient
    const id = existingPatient.rows[0].id;
    await client.query(
      `UPDATE patients
       SET first_name = $1,
           last_name = $2,
           date_of_birth = $3,
           sex = $4,
           phone = $5,
           email = $6,
           address = $7,
           city = $8,
           state = $9,
           zip_code = $10,
           ssn = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND tenant_id = $13`,
      [
        pid.patientName?.firstName || null,
        pid.patientName?.lastName || null,
        dob,
        pid.sex,
        phone,
        null, // email not in PID
        pid.address?.street || null,
        pid.address?.city || null,
        pid.address?.state || null,
        pid.address?.zip || null,
        pid.ssn,
        id,
        tenantId,
      ]
    );
    return id;
  } else {
    // Insert new patient
    const newId = crypto.randomUUID();
    await client.query(
      `INSERT INTO patients (
        id, tenant_id, first_name, last_name, date_of_birth, sex,
        phone, address, city, state, zip_code, mrn, external_id, ssn
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        newId,
        tenantId,
        pid.patientName?.firstName || null,
        pid.patientName?.lastName || null,
        dob,
        pid.sex,
        phone,
        pid.address?.street || null,
        pid.address?.city || null,
        pid.address?.state || null,
        pid.address?.zip || null,
        patientId,
        patientId,
        pid.ssn,
      ]
    );
    return newId;
  }
}

/**
 * Process SIU^S12 - New Appointment Notification
 */
async function processNewAppointment(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const sch = message.segments.SCH;
  const pid = message.segments.PID;
  const ail = message.segments.AIL;
  const aip = message.segments.AIP;

  if (!sch) {
    throw new Error("SCH segment is required for appointment");
  }

  if (!pid) {
    throw new Error("PID segment is required for appointment");
  }

  // First ensure patient exists
  const patientId = await upsertPatient(pid, tenantId, client);

  // Parse appointment details
  const appointmentId = crypto.randomUUID();
  const externalAppointmentId = sch.fillerAppointmentId || sch.placerAppointmentId;
  const appointmentDateTime = parseHL7DateTime(ail?.startDateTime || "");
  const duration = parseInt(sch.appointmentDuration || "30", 10);

  // Get provider ID if specified
  let providerId: string | null = null;
  if (aip?.personnelResourceId?.id) {
    const providerResult = await client.query(
      `SELECT id FROM providers WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
      [tenantId, aip.personnelResourceId.id]
    );
    if (providerResult.rows.length > 0) {
      providerId = providerResult.rows[0].id;
    }
  }

  // Get location ID if specified
  let locationId: string | null = null;
  if (ail?.locationResourceId) {
    const locationResult = await client.query(
      `SELECT id FROM locations WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
      [tenantId, ail.locationResourceId]
    );
    if (locationResult.rows.length > 0) {
      locationId = locationResult.rows[0].id;
    }
  }

  await client.query(
    `INSERT INTO appointments (
      id, tenant_id, patient_id, provider_id, location_id,
      appointment_date, start_time, end_time, duration_minutes,
      status, appointment_type, external_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      appointmentId,
      tenantId,
      patientId,
      providerId,
      locationId,
      appointmentDateTime,
      appointmentDateTime,
      appointmentDateTime ? new Date(appointmentDateTime.getTime() + duration * 60000) : null,
      duration,
      "scheduled",
      sch.appointmentType || "general",
      externalAppointmentId,
      sch.appointmentReason,
    ]
  );

  return appointmentId;
}

/**
 * Process SIU^S13 - Reschedule Appointment
 */
async function processRescheduleAppointment(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const sch = message.segments.SCH;
  const ail = message.segments.AIL;

  if (!sch) {
    throw new Error("SCH segment is required for appointment reschedule");
  }

  const externalAppointmentId = sch.fillerAppointmentId || sch.placerAppointmentId;
  if (!externalAppointmentId) {
    throw new Error("Appointment ID is required for reschedule");
  }

  // Find existing appointment
  const appointmentResult = await client.query(
    `SELECT id FROM appointments WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
    [tenantId, externalAppointmentId]
  );

  if (appointmentResult.rows.length === 0) {
    throw new Error(`Appointment not found: ${externalAppointmentId}`);
  }

  const appointmentId = appointmentResult.rows[0].id;
  const appointmentDateTime = parseHL7DateTime(ail?.startDateTime || "");
  const duration = parseInt(sch.appointmentDuration || "30", 10);

  await client.query(
    `UPDATE appointments
     SET appointment_date = $1,
         start_time = $2,
         end_time = $3,
         duration_minutes = $4,
         notes = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $6 AND tenant_id = $7`,
    [
      appointmentDateTime,
      appointmentDateTime,
      appointmentDateTime ? new Date(appointmentDateTime.getTime() + duration * 60000) : null,
      duration,
      sch.appointmentReason,
      appointmentId,
      tenantId,
    ]
  );

  return appointmentId;
}

/**
 * Process SIU^S15 - Cancel Appointment
 */
async function processCancelAppointment(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const sch = message.segments.SCH;

  if (!sch) {
    throw new Error("SCH segment is required for appointment cancellation");
  }

  const externalAppointmentId = sch.fillerAppointmentId || sch.placerAppointmentId;
  if (!externalAppointmentId) {
    throw new Error("Appointment ID is required for cancellation");
  }

  // Find existing appointment
  const appointmentResult = await client.query(
    `SELECT id FROM appointments WHERE tenant_id = $1 AND external_id = $2 LIMIT 1`,
    [tenantId, externalAppointmentId]
  );

  if (appointmentResult.rows.length === 0) {
    throw new Error(`Appointment not found: ${externalAppointmentId}`);
  }

  const appointmentId = appointmentResult.rows[0].id;

  await client.query(
    `UPDATE appointments
     SET status = 'cancelled',
         cancel_reason = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND tenant_id = $3`,
    [sch.eventReason || "Cancelled via HL7", appointmentId, tenantId]
  );

  return appointmentId;
}

/**
 * Process ORU^R01 - Observation Result (Lab Results)
 */
async function processLabResults(message: HL7Message, tenantId: string, client: any): Promise<string> {
  const pid = message.segments.PID;
  const obxSegments = message.segments.OBX || [];

  if (!pid) {
    throw new Error("PID segment is required for lab results");
  }

  if (obxSegments.length === 0) {
    throw new Error("At least one OBX segment is required for lab results");
  }

  // Ensure patient exists
  const patientId = await upsertPatient(pid, tenantId, client);

  // Create a document to store the lab results
  const documentId = crypto.randomUUID();
  const documentName = `Lab Results - ${message.messageControlId}`;

  await client.query(
    `INSERT INTO documents (
      id, tenant_id, patient_id, name, type, category,
      content, status, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      documentId,
      tenantId,
      patientId,
      documentName,
      "lab_result",
      "lab",
      JSON.stringify({ observations: obxSegments }),
      "final",
      {
        source: "HL7",
        messageType: message.messageType,
        messageControlId: message.messageControlId,
        sendingFacility: message.sendingFacility,
      },
    ]
  );

  // Also store individual observations
  for (const obx of obxSegments) {
    const observationId = crypto.randomUUID();
    await client.query(
      `INSERT INTO patient_observations (
        id, tenant_id, patient_id, document_id,
        observation_code, observation_name, observation_value,
        value_type, units, reference_range, abnormal_flag,
        observation_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT DO NOTHING`,
      [
        observationId,
        tenantId,
        patientId,
        documentId,
        obx.observationIdentifier.code,
        obx.observationIdentifier.text,
        obx.observationValue,
        obx.valueType,
        obx.units,
        obx.referenceRange,
        obx.abnormalFlags,
        parseHL7DateTime(obx.dateOfObservation) || new Date(),
        obx.observationResultStatus || "final",
      ]
    );
  }

  return documentId;
}

/**
 * Retry failed message processing
 */
export async function retryHL7Message(messageId: string, tenantId: string): Promise<ProcessingResult> {
  const result = await pool.query(
    `SELECT raw_message, parsed_data FROM hl7_messages
     WHERE id = $1 AND tenant_id = $2`,
    [messageId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("HL7 message not found");
  }

  const parsedData = result.rows[0].parsed_data;
  return await processHL7Message(parsedData, tenantId);
}
