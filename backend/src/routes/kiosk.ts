import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { getTableColumns } from "../db/schema";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { KioskRequest, requireKioskAuth } from "../middleware/kioskAuth";
import { saveSignature, saveInsuranceCardPhoto, savePatientProfilePhoto, validateSignatureData } from "../services/signatureService";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";
import { getDateKeyInTimeZone, getPracticeTimeZone, getUtcRangeForPracticeDate } from "../lib/practiceTimeZone";

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

function buildKioskDeviceCode(tenantId: string, locationId: string): string {
  const suffix = crypto
    .createHash("sha1")
    .update(`${tenantId}:${locationId}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `KIOSK-${suffix}`;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeDobForVerification(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }

  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    Number.isNaN(candidate.getTime())
    || candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

kioskRouter.get("/launch-context", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const requestedLocationId =
    typeof req.query.locationId === "string" && req.query.locationId.trim()
      ? req.query.locationId.trim()
      : null;

  if (!tenantId) {
    return res.status(400).json({ error: "Missing tenant ID" });
  }

  try {
    const locationResult = requestedLocationId
      ? await pool.query(
        `SELECT id, name
         FROM locations
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, requestedLocationId],
      )
      : await pool.query(
        `SELECT id, name
         FROM locations
         WHERE tenant_id = $1
         ORDER BY created_at
         LIMIT 1`,
        [tenantId],
      );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ error: "No location found for kiosk launch" });
    }

    const location = locationResult.rows[0] as { id: string; name: string };
    const existingDevice = await pool.query(
      `SELECT id,
              device_code as "deviceCode",
              device_name as "deviceName",
              location_id as "locationId"
       FROM kiosk_devices
       WHERE tenant_id = $1 AND location_id = $2 AND is_active = true
       ORDER BY created_at
       LIMIT 1`,
      [tenantId, location.id],
    );

    if (existingDevice.rows.length > 0) {
      return res.json({
        tenantId,
        locationId: existingDevice.rows[0].locationId,
        kioskCode: existingDevice.rows[0].deviceCode,
        deviceName: existingDevice.rows[0].deviceName,
      });
    }

    const deviceId = crypto.randomUUID();
    const deviceCode = buildKioskDeviceCode(tenantId, location.id);
    const createdDevice = await pool.query(
      `INSERT INTO kiosk_devices (
         id, tenant_id, location_id, device_name, device_code, is_active, settings
       ) VALUES (
         $1, $2, $3, $4, $5, true, $6::jsonb
       )
       ON CONFLICT (device_code)
       DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         location_id = EXCLUDED.location_id,
         device_name = EXCLUDED.device_name,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id,
                 device_code as "deviceCode",
                 device_name as "deviceName",
                 location_id as "locationId"`,
      [
        deviceId,
        tenantId,
        location.id,
        `${location.name} Kiosk`,
        deviceCode,
        JSON.stringify({
          timeout_seconds: 180,
          language: "en",
          features: {
            insurance_photo: true,
            signature_pad: true,
            medical_history: true,
          },
        }),
      ],
    );

    return res.json({
      tenantId,
      locationId: createdDevice.rows[0].locationId,
      kioskCode: createdDevice.rows[0].deviceCode,
      deviceName: createdDevice.rows[0].deviceName,
    });
  } catch (err) {
    logKioskError("Kiosk launch context error", err);
    return res.status(500).json({ error: "Failed to load kiosk configuration" });
  }
});

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
  const normalizedLastName = lastName.trim();
  const normalizedDob = method === "dob" ? normalizeDobForVerification(dob) : null;

  try {
    let query = "";
    let params: any[] = [tenantId];

    if (method === "dob" && normalizedDob) {
      query = `
        SELECT id, first_name as "firstName", last_name as "lastName", dob, phone, email
        FROM patients
        WHERE tenant_id = $1 AND LOWER(last_name) = LOWER($2) AND dob = $3
        LIMIT 5
      `;
      params.push(normalizedLastName, normalizedDob);
    } else if (method === "phone" && phone) {
      // Clean phone number (remove non-digits)
      const cleanPhone = phone.replace(/\D/g, "");
      query = `
        SELECT id, first_name as "firstName", last_name as "lastName", dob, phone, email
        FROM patients
        WHERE tenant_id = $1 AND LOWER(last_name) = LOWER($2) AND REPLACE(phone, '-', '') LIKE $3
        LIMIT 5
      `;
      params.push(normalizedLastName, `%${cleanPhone}%`);
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
  const appointmentId =
    typeof req.query.appointmentId === "string" && req.query.appointmentId.trim()
      ? req.query.appointmentId.trim()
      : null;
  const patientId =
    typeof req.query.patientId === "string" && req.query.patientId.trim()
      ? req.query.patientId.trim()
      : null;
  const timeZone = getPracticeTimeZone();
  const todayKey = getDateKeyInTimeZone(new Date(), timeZone);
  const { start, end } = getUtcRangeForPracticeDate(todayKey, timeZone);

  try {
    const params: any[] = [tenantId, locationId, start.toISOString(), end.toISOString()];
    let query = `
      SELECT a.id,
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
         AND a.scheduled_start >= $3::timestamptz
         AND a.scheduled_start < $4::timestamptz
         AND a.status IN ('scheduled', 'confirmed')
    `;

    if (patientId) {
      params.push(patientId);
      query += `\n         AND a.patient_id = $${params.length}`;
    }

    if (appointmentId) {
      params.push(appointmentId);
      query += `\n         AND a.id = $${params.length}`;
    }

    query += `\n       ORDER BY a.scheduled_start`;

    const result = await pool.query(
      query,
      params
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
    const legacyColumns = await getTableColumns("consent_forms");
    const result = legacyColumns.has("form_name")
      ? await pool.query(
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
      )
      : await pool.query(
        `SELECT
           id::text as id,
           name as "formName",
           form_type as "formType",
           content_html as "formContent",
           true as "requiresSignature",
           COALESCE(version, '1.0') as version
         FROM consent_templates
         WHERE tenant_id = $1
           AND is_active = true
         ORDER BY form_type, name`,
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
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
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
    await auditLog(tenantId, "system", "create", "checkin_session", sessionId);

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
    const patientColumns = await getTableColumns("patients");
    const optionalPatientSelects: string[] = [];
    if (patientColumns.has("insurance_member_id")) {
      optionalPatientSelects.push("p.insurance_member_id");
    }
    if (patientColumns.has("insurance_group_number")) {
      optionalPatientSelects.push("p.insurance_group_number");
    }
    if (patientColumns.has("insurance_plan_name")) {
      optionalPatientSelects.push("p.insurance_plan_name");
    }
    if (patientColumns.has("allergies")) {
      optionalPatientSelects.push("p.allergies");
    }
    if (patientColumns.has("medications")) {
      optionalPatientSelects.push("p.medications");
    }
    if (patientColumns.has("past_medical_history")) {
      optionalPatientSelects.push("p.past_medical_history");
    }
    if (patientColumns.has("family_history")) {
      optionalPatientSelects.push("p.family_history");
    }
    if (patientColumns.has("surgical_history")) {
      optionalPatientSelects.push("p.surgical_history");
    }
    if (patientColumns.has("social_history")) {
      optionalPatientSelects.push("p.social_history");
    }
    if (patientColumns.has("current_symptoms")) {
      optionalPatientSelects.push("p.current_symptoms");
    }

    const optionalPatientClause =
      optionalPatientSelects.length > 0 ? `,\n              ${optionalPatientSelects.join(",\n              ")}` : "";

    const result = await pool.query(
      `SELECT cs.*,
              p.first_name as "patientFirstName",
              p.last_name as "patientLastName",
              p.dob, p.phone, p.email, p.address, p.city, p.state, p.zip,
              p.insurance, p.emergency_contact_name as "emergencyContactName"${optionalPatientClause}
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
    await auditLog(tenantId, "system", "update", "patient", patientId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error updating demographics", err);
    return res.status(500).json({ error: "Failed to update demographics" });
  }
});

// Update medical history information
const updateMedicalHistorySchema = z.object({
  allergies: z.string().optional(),
  medications: z.string().optional(),
  pastMedicalHistory: z.string().optional(),
  familyHistory: z.string().optional(),
  surgicalHistory: z.string().optional(),
  socialHistory: z.string().optional(),
  currentSymptoms: z.string().optional(),
  noKnownAllergies: z.boolean().optional(),
});

kioskRouter.put("/checkin/:sessionId/medical-history", requireKioskAuth, async (req: KioskRequest, res) => {
  const { sessionId } = req.params;
  const tenantId = req.kiosk!.tenantId;

  const parsed = updateMedicalHistorySchema.safeParse(req.body);
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
    const patientColumns = await getTableColumns("patients");
    const sessionColumns = await getTableColumns("checkin_sessions");

    const fieldToColumn: Record<string, string> = {
      allergies: "allergies",
      medications: "medications",
      pastMedicalHistory: "past_medical_history",
      familyHistory: "family_history",
      surgicalHistory: "surgical_history",
      socialHistory: "social_history",
      currentSymptoms: "current_symptoms",
    };

    const payload: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.noKnownAllergies) {
      payload.allergies = "No known allergies";
    }
    delete payload.noKnownAllergies;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(payload).forEach(([field, rawValue]) => {
      const column = fieldToColumn[field];
      if (!column || !patientColumns.has(column) || rawValue === undefined) {
        return;
      }

      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
      updates.push(`${column} = $${paramIndex}`);
      values.push(value === "" ? null : value);
      paramIndex++;
    });

    if (updates.length > 0) {
      values.push(tenantId, patientId);
      await pool.query(
        `UPDATE patients SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $${paramIndex} AND id = $${paramIndex + 1}`,
        values
      );
    }

    if (sessionColumns.has("medical_history_updated")) {
      await pool.query(
        `UPDATE checkin_sessions
         SET medical_history_updated = true, status = 'medical_history', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionId]
      );
    } else {
      await pool.query(
        `UPDATE checkin_sessions
         SET status = 'medical_history', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionId]
      );
    }

    await auditLog(tenantId, "system", "update", "patient", patientId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error updating medical history", err);
    return res.status(500).json({ error: "Failed to update medical history" });
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

    await auditLog(tenantId, "system", "update", "patient", patientId);

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

    await auditLog(tenantId, "system", "upload_insurance_photo", "checkin_session", sessionId);

    return res.json({ success: true, photoUrl: savedPhoto.url, thumbnailUrl: savedPhoto.thumbnailUrl });
  } catch (err) {
    logKioskError("Error uploading insurance photo", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to upload photo" });
  }
});

// Upload patient profile photo from kiosk/tablet intake
const profilePhotoSchema = z.object({
  photoData: z.string(), // base64 data URL
  photoType: z.enum(["clinical", "baseline", "followup", "other"]).optional(),
  description: z.string().max(1000).optional(),
});

kioskRouter.post("/checkin/:sessionId/profile-photo", requireKioskAuth, async (req: KioskRequest, res) => {
  const sessionId = req.params.sessionId!;
  const tenantId = req.kiosk!.tenantId;

  const parsed = profilePhotoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { photoData, photoType, description } = parsed.data;

  try {
    const sessionResult = await pool.query(
      "SELECT patient_id as \"patientId\" FROM checkin_sessions WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const patientId = sessionResult.rows[0].patientId;
    const savedPhoto = await savePatientProfilePhoto(photoData, patientId);

    const photoColumns = await getTableColumns("photos");
    const photoId = crypto.randomUUID();
    const insertColumns = ["id", "tenant_id", "patient_id", "url"];
    const insertValues: any[] = [photoId, tenantId, patientId, savedPhoto.url];

    if (photoColumns.has("photo_type")) {
      insertColumns.push("photo_type");
      insertValues.push(photoType || "clinical");
    }
    if (photoColumns.has("body_location")) {
      insertColumns.push("body_location");
      insertValues.push("Face");
    }
    if (photoColumns.has("body_region")) {
      insertColumns.push("body_region");
      insertValues.push("face");
    }
    if (photoColumns.has("description")) {
      insertColumns.push("description");
      insertValues.push(description || "Kiosk intake profile photo");
    }
    if (photoColumns.has("category")) {
      insertColumns.push("category");
      insertValues.push("profile");
    }
    if (photoColumns.has("storage")) {
      insertColumns.push("storage");
      insertValues.push(savedPhoto.storage);
    }
    if (photoColumns.has("object_key")) {
      insertColumns.push("object_key");
      insertValues.push(savedPhoto.objectKey);
    }
    if (photoColumns.has("filename")) {
      insertColumns.push("filename");
      insertValues.push(savedPhoto.objectKey.split("/").pop() || "kiosk-profile.jpg");
    }

    const valueSlots = insertColumns.map((_, idx) => `$${idx + 1}`).join(", ");
    await pool.query(
      `INSERT INTO photos (${insertColumns.join(", ")}) VALUES (${valueSlots})`,
      insertValues
    );

    await auditLog(tenantId, "system", "upload_profile_photo", "photo", photoId);

    return res.json({
      success: true,
      photo: {
        id: photoId,
        url: savedPhoto.url,
        thumbnailUrl: savedPhoto.thumbnailUrl,
        photoType: photoType || "clinical",
      },
    });
  } catch (err) {
    logKioskError("Error uploading kiosk profile photo", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to upload profile photo" });
  }
});

// Submit signature for consent
const signatureSchema = z.object({
  signatureData: z.string(), // base64 data URL
  consentFormId: z.string().min(1),
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
    const kioskConsentColumns = await getTableColumns("kiosk_patient_consents");
    const patientConsentColumns = await getTableColumns("patient_consents");

    if (kioskConsentColumns.has("consent_form_id")) {
      await pool.query(
        `INSERT INTO kiosk_patient_consents (
          id, tenant_id, patient_id, consent_form_id, checkin_session_id,
          signature_url, signed_at, ip_address, device_info, form_version, form_content
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9, $10)`,
        [
          consentId,
          tenantId,
          patientId,
          consentFormId,
          sessionId,
          savedSignature.url,
          req.ip,
          req.headers["user-agent"] || "",
          form.version,
          form.formContent,
        ],
      );
    } else if (patientConsentColumns.has("consent_form_id")) {
      await pool.query(
        `INSERT INTO patient_consents (
          id, tenant_id, patient_id, consent_form_id, checkin_session_id,
          signature_url, ip_address, device_info, form_version, form_content
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          consentId,
          tenantId,
          patientId,
          consentFormId,
          sessionId,
          savedSignature.url,
          req.ip,
          req.headers["user-agent"] || "",
          form.version,
          form.formContent,
        ],
      );
    } else if (
      patientConsentColumns.has("template_id")
      && isUuidLike(patientId)
      && isUuidLike(consentFormId)
    ) {
      await pool.query(
        `INSERT INTO patient_consents (
          id,
          tenant_id,
          patient_id,
          template_id,
          signed_at,
          signature_data,
          signature_type,
          signer_name,
          signer_relationship,
          ip_address,
          user_agent,
          form_content_snapshot,
          form_version,
          status
        ) VALUES (
          $1::uuid,
          $2,
          $3::uuid,
          $4::uuid,
          CURRENT_TIMESTAMP,
          $5,
          'drawn',
          'Patient (kiosk)',
          'self',
          $6::inet,
          $7,
          $8,
          $9,
          'signed'
        )`,
        [
          consentId,
          tenantId,
          patientId,
          consentFormId,
          savedSignature.url,
          req.ip,
          req.headers["user-agent"] || "",
          form.formContent,
          form.version,
        ],
      );
    } else {
      throw new Error("Consent storage is not configured for kiosk signatures in this schema");
    }

    // Update session
    await pool.query(
      `UPDATE checkin_sessions
       SET consent_signed = true, consent_signature_url = $1, consent_form_id = $2,
           status = 'consent', updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [savedSignature.url, consentFormId, sessionId]
    );

    await auditLog(tenantId, "system", "create", "patient_consent", consentId);

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

    await auditLog(tenantId, "system", "complete", "checkin_session", sessionId);

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

    await auditLog(tenantId, "system", "cancel", "checkin_session", sessionId);

    return res.json({ success: true });
  } catch (err) {
    logKioskError("Error cancelling check-in", err);
    return res.status(500).json({ error: "Failed to cancel check-in" });
  }
});
