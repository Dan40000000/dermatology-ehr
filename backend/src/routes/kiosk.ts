import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { KioskRequest, requireKioskAuth } from "../middleware/kioskAuth";
import { saveSignature, saveInsuranceCardPhoto, validateSignatureData } from "../services/signatureService";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";

export const kioskRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logKioskError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

// Heartbeat endpoint - kiosk device sends periodic heartbeat
kioskRouter.post("/heartbeat", requireKioskAuth, async (req: KioskRequest, res) => {
  const kioskId = req.kiosk!.id;

  try {
    await pool.query(
      `UPDATE kiosk_devices
       SET last_heartbeat = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [kioskId]
    );

    return res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    logKioskError("Heartbeat error", err);
    return res.status(500).json({ error: "Heartbeat failed" });
  }
});

// Verify patient identity
const verifyPatientSchema = z.object({
  method: z.enum(["dob", "phone", "mrn"]),
  lastName: z.string().min(1),
  dob: z.string().optional(),
  phone: z.string().optional(),
  mrn: z.string().optional(),
});

kioskRouter.post("/verify-patient", requireKioskAuth, async (req: KioskRequest, res) => {
  const parsed = verifyPatientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { method, lastName, dob, phone, mrn } = parsed.data;
  const tenantId = req.kiosk!.tenantId;

  try {
    let query = "";
    let params: any[] = [tenantId];

    if (method === "dob" && dob) {
      query = `
        SELECT id, first_name as "firstName", last_name as "lastName", dob, phone, email
        FROM patients
        WHERE tenant_id = $1 AND LOWER(last_name) = LOWER($2) AND dob = $3
        LIMIT 5
      `;
      params.push(lastName, dob);
    } else if (method === "phone" && phone) {
      // Clean phone number (remove non-digits)
      const cleanPhone = phone.replace(/\D/g, "");
      query = `
        SELECT id, first_name as "firstName", last_name as "lastName", dob, phone, email
        FROM patients
        WHERE tenant_id = $1 AND LOWER(last_name) = LOWER($2) AND REPLACE(phone, '-', '') LIKE $3
        LIMIT 5
      `;
      params.push(lastName, `%${cleanPhone}%`);
    } else if (method === "mrn" && mrn) {
      query = `
        SELECT id, first_name as "firstName", last_name as "lastName", dob, phone, email, mrn
        FROM patients
        WHERE tenant_id = $1 AND mrn = $2
        LIMIT 1
      `;
      params = [tenantId, mrn];
    } else {
      return res.status(400).json({ error: "Invalid verification method or missing data" });
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Return matching patients (may need to select if multiple matches)
    return res.json({ patients: result.rows });
  } catch (err) {
    logKioskError("Patient verification error", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// Get today's appointments for the kiosk's location
kioskRouter.get("/today-appointments", requireKioskAuth, async (req: KioskRequest, res) => {
  const tenantId = req.kiosk!.tenantId;
  const locationId = req.kiosk!.locationId;

  try {
    const result = await pool.query(
      `SELECT a.id,
              a.scheduled_start as "scheduledStart",
              a.scheduled_end as "scheduledEnd",
              a.status,
              p.id as "patientId",
              p.first_name as "patientFirstName",
              p.last_name as "patientLastName",
              pr.full_name as "providerName",
              at.name as "appointmentType"
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN providers pr ON a.provider_id = pr.id
       JOIN appointment_types at ON a.appointment_type_id = at.id
       WHERE a.tenant_id = $1
         AND a.location_id = $2
         AND DATE(a.scheduled_start) = CURRENT_DATE
         AND a.status IN ('scheduled', 'confirmed')
       ORDER BY a.scheduled_start`,
      [tenantId, locationId]
    );

    return res.json({ appointments: result.rows });
  } catch (err) {
    logKioskError("Error fetching today's appointments", err);
    return res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

// Get active consent forms for kiosk flow
kioskRouter.get("/consent-forms/active", requireKioskAuth, async (req: KioskRequest, res) => {
  const tenantId = req.kiosk!.tenantId;

  try {
    const result = await pool.query(
      `SELECT
         id,
         form_name as "formName",
         form_type as "formType",
         form_content as "formContent",
         requires_signature as "requiresSignature",
         version
       FROM consent_forms
       WHERE tenant_id = $1
         AND is_active = true
       ORDER BY form_type, form_name`,
      [tenantId],
    );

    return res.json({ forms: result.rows });
  } catch (err) {
    logKioskError("Error fetching kiosk consent forms", err);
    return res.status(500).json({ error: "Failed to fetch consent forms" });
  }
});

// Start check-in session
const startCheckinSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  verificationMethod: z.string(),
  verificationValue: z.string(),
});

kioskRouter.post("/checkin/start", requireKioskAuth, async (req: KioskRequest, res) => {
  const parsed = startCheckinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { patientId, appointmentId, verificationMethod, verificationValue } = parsed.data;
  const tenantId = req.kiosk!.tenantId;
  const kioskId = req.kiosk!.id;

  try {
    // Verify patient belongs to tenant
    const patientCheck = await pool.query(
      "SELECT id FROM patients WHERE id = $1 AND tenant_id = $2",
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // If appointment provided, verify it exists and belongs to patient
    if (appointmentId) {
      const apptCheck = await pool.query(
        "SELECT id FROM appointments WHERE id = $1 AND patient_id = $2 AND tenant_id = $3",
        [appointmentId, patientId, tenantId]
      );

      if (apptCheck.rows.length === 0) {
        return res.status(404).json({ error: "Appointment not found" });
      }
    }

    // Create check-in session
    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO checkin_sessions (
        id, tenant_id, kiosk_device_id, patient_id, appointment_id,
        status, verification_method, verification_value, verified_at, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, 'started', $6, $7, CURRENT_TIMESTAMP, $8, $9)`,
      [sessionId, tenantId, kioskId, patientId, appointmentId || null,
       verificationMethod, verificationValue, req.ip, req.headers["user-agent"] || ""]
    );

    // Audit log
    await auditLog(tenantId, kioskId, "create", "checkin_session", sessionId);

    return res.status(201).json({ sessionId, patientId, appointmentId });
  } catch (err) {
    logKioskError("Error starting check-in", err);
    return res.status(500).json({ error: "Failed to start check-in" });
  }
});

// Get check-in session status
kioskRouter.get("/checkin/:sessionId", requireKioskAuth, async (req: KioskRequest, res) => {
  const { sessionId } = req.params;
  const tenantId = req.kiosk!.tenantId;

  try {
    const result = await pool.query(
      `SELECT cs.*,
              p.first_name as "patientFirstName",
              p.last_name as "patientLastName",
              p.dob, p.phone, p.email, p.address, p.city, p.state, p.zip,
              p.insurance, p.emergency_contact_name as "emergencyContactName"
       FROM checkin_sessions cs
       JOIN patients p ON cs.patient_id = p.id
       WHERE cs.id = $1 AND cs.tenant_id = $2`,
      [sessionId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session: result.rows[0] });
  } catch (err) {
    logKioskError("Error fetching session", err);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

// Update demographics
const updateDemographicsSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
});

kioskRouter.put("/checkin/:sessionId/demographics", requireKioskAuth, async (req: KioskRequest, res) => {
  const { sessionId } = req.params;
  const tenantId = req.kiosk!.tenantId;

  const parsed = updateDemographicsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    // Get session
    const sessionResult = await pool.query(
      "SELECT patient_id as \"patientId\" FROM checkin_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const patientId = sessionResult.rows[0].patientId;

    // Update patient demographics
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length > 0) {
      values.push(tenantId, patientId);
      await pool.query(
        `UPDATE patients SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}`,
        values
      );
    }

    // Mark demographics as updated in session
    await pool.query(
      `UPDATE checkin_sessions
       SET demographics_updated = true, status = 'demographics', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    // Audit log
    await auditLog(tenantId, req.kiosk!.id, "update", "patient", patientId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error updating demographics", err);
    return res.status(500).json({ error: "Failed to update demographics" });
  }
});

// Update insurance information
const updateInsuranceSchema = z.object({
  insurance: z.string().optional(),
  insuranceMemberId: z.string().optional(),
  insuranceGroupNumber: z.string().optional(),
  insurancePlanName: z.string().optional(),
});

kioskRouter.put("/checkin/:sessionId/insurance", requireKioskAuth, async (req: KioskRequest, res) => {
  const { sessionId } = req.params;
  const tenantId = req.kiosk!.tenantId;

  const parsed = updateInsuranceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const sessionResult = await pool.query(
      "SELECT patient_id as \"patientId\" FROM checkin_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const patientId = sessionResult.rows[0].patientId;

    // Update patient insurance
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(parsed.data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length > 0) {
      values.push(tenantId, patientId);
      await pool.query(
        `UPDATE patients SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}`,
        values
      );
    }

    // Mark insurance as updated
    await pool.query(
      `UPDATE checkin_sessions
       SET insurance_updated = true, status = 'insurance', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    await auditLog(tenantId, req.kiosk!.id, "update", "patient", patientId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error updating insurance", err);
    return res.status(500).json({ error: "Failed to update insurance" });
  }
});

// Upload insurance card photo
const insurancePhotoSchema = z.object({
  side: z.enum(["front", "back"]),
  photoData: z.string(), // base64 data URL
});

kioskRouter.post("/checkin/:sessionId/insurance-photo", requireKioskAuth, async (req: KioskRequest, res) => {
  const sessionId = req.params.sessionId!;
  const tenantId = req.kiosk!.tenantId;

  const parsed = insurancePhotoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { side, photoData } = parsed.data;

  try {
    const sessionResult = await pool.query(
      "SELECT patient_id as \"patientId\" FROM checkin_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const patientId = sessionResult.rows[0].patientId;

    // Save insurance card photo
    const savedPhoto = await saveInsuranceCardPhoto(photoData, patientId, side);

    // Update session with photo URL
    const column = side === "front" ? "insurance_front_photo_url" : "insurance_back_photo_url";
    await pool.query(
      `UPDATE checkin_sessions SET ${column} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [savedPhoto.url, sessionId]
    );

    await auditLog(tenantId, req.kiosk!.id, "upload_insurance_photo", "checkin_session", sessionId);

    return res.json({ success: true, photoUrl: savedPhoto.url, thumbnailUrl: savedPhoto.thumbnailUrl });
  } catch (err) {
    logKioskError("Error uploading insurance photo", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to upload photo" });
  }
});

// Submit signature for consent
const signatureSchema = z.object({
  signatureData: z.string(), // base64 data URL
  consentFormId: z.string().uuid(),
});

kioskRouter.post("/checkin/:sessionId/signature", requireKioskAuth, async (req: KioskRequest, res) => {
  const { sessionId } = req.params;
  const tenantId = req.kiosk!.tenantId;

  const parsed = signatureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { signatureData, consentFormId } = parsed.data;

  // Validate signature
  if (!validateSignatureData(signatureData)) {
    return res.status(400).json({ error: "Invalid signature data" });
  }

  try {
    // Get session and patient
    const sessionResult = await pool.query(
      "SELECT patient_id as \"patientId\" FROM checkin_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const patientId = sessionResult.rows[0].patientId;

    // Get consent form
    const formResult = await pool.query(
      "SELECT id, form_content as \"formContent\", version FROM consent_forms WHERE id = $1 AND tenant_id = $2 AND is_active = true",
      [consentFormId, tenantId]
    );

    if (formResult.rows.length === 0) {
      return res.status(404).json({ error: "Consent form not found" });
    }

    const form = formResult.rows[0];

    // Save signature
    const savedSignature = await saveSignature(signatureData, patientId);

    // Record patient consent
    const consentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO patient_consents (
        id, tenant_id, patient_id, consent_form_id, checkin_session_id,
        signature_url, ip_address, device_info, form_version, form_content
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [consentId, tenantId, patientId, consentFormId, sessionId,
       savedSignature.url, req.ip, req.headers["user-agent"] || "", form.version, form.formContent]
    );

    // Update session
    await pool.query(
      `UPDATE checkin_sessions
       SET consent_signed = true, consent_signature_url = $1, consent_form_id = $2,
           status = 'consent', updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [savedSignature.url, consentFormId, sessionId]
    );

    await auditLog(tenantId, req.kiosk!.id, "create", "patient_consent", consentId);

    return res.json({
      success: true,
      consentId,
      signatureUrl: savedSignature.url,
      thumbnailUrl: savedSignature.thumbnailUrl,
    });
  } catch (err) {
    logKioskError("Error saving signature", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save signature" });
  }
});

// Complete check-in
kioskRouter.post("/checkin/:sessionId/complete", requireKioskAuth, async (req: KioskRequest, res) => {
  const sessionId = req.params.sessionId!;
  const tenantId = req.kiosk!.tenantId;

  try {
    const result = await pool.query(
      `UPDATE checkin_sessions
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING patient_id as "patientId", appointment_id as "appointmentId"`,
      [sessionId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { patientId, appointmentId } = result.rows[0];

    // Update appointment status to checked-in if appointment exists
    if (appointmentId) {
      await pool.query(
        "UPDATE appointments SET status = 'checked_in' WHERE id = $1 AND tenant_id = $2",
        [appointmentId, tenantId]
      );
    }

    await auditLog(tenantId, req.kiosk!.id, "complete", "checkin_session", sessionId);

    return res.json({ success: true, patientId, appointmentId });
  } catch (err) {
    logKioskError("Error completing check-in", err);
    return res.status(500).json({ error: "Failed to complete check-in" });
  }
});

// Cancel check-in session
kioskRouter.post("/checkin/:sessionId/cancel", requireKioskAuth, async (req: KioskRequest, res) => {
  const sessionId = req.params.sessionId!;
  const tenantId = req.kiosk!.tenantId;

  try {
    const result = await pool.query(
      `UPDATE checkin_sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [sessionId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    await auditLog(tenantId, req.kiosk!.id, "cancel", "checkin_session", sessionId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error cancelling check-in", err);
    return res.status(500).json({ error: "Failed to cancel check-in" });
  }
});
