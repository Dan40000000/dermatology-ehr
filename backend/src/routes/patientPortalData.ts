import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../db/pool";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger";
import { getPatientAllergySummaries, getPatientMedicationSummaries } from "../services/patientHealthRecord";

export const patientPortalDataRouter = Router();

// All routes require patient authentication
patientPortalDataRouter.use(requirePatientAuth);

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPatientPortalDataError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

const checkinStartSchema = z.object({
  appointmentId: z.string().uuid().optional(),
});

const checkinDemographicsSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  zip: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

const portalRefillRequestSchema = z.object({
  prescriptionId: z.string().uuid(),
  notes: z.string().optional(),
});

/**
 * POST /api/patient-portal-data/checkin/start
 * Allow patient to start pre-check-in for an upcoming appointment
 */
patientPortalDataRouter.post("/checkin/start", async (req: PatientPortalRequest, res) => {
  try {
    const parsed = checkinStartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { appointmentId } = parsed.data;
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    // Validate appointment (if provided) belongs to patient and is upcoming
    if (appointmentId) {
      const apptCheck = await pool.query(
        `SELECT id FROM appointments
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3
           AND scheduled_start >= CURRENT_DATE`,
        [appointmentId, patientId, tenantId]
      );

      if (apptCheck.rows.length === 0) {
        return res.status(404).json({ error: "Appointment not found or not eligible for pre-check-in" });
      }
    }

    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO checkin_sessions (
        id, tenant_id, patient_id, appointment_id, status,
        verification_method, verification_value, verified_at,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, 'started', $5, $6, CURRENT_TIMESTAMP, $7, $8)`,
      [
        sessionId,
        tenantId,
        patientId,
        appointmentId || null,
        "portal",
        req.patient!.email,
        req.ip,
        req.get("user-agent") || "",
      ]
    );

    return res.status(201).json({ sessionId, appointmentId });
  } catch (error) {
    logPatientPortalDataError("Start portal check-in error", error);
    return res.status(500).json({ error: "Failed to start check-in" });
  }
});

/**
 * PUT /api/patient-portal-data/checkin/:sessionId/demographics
 * Update demographics during pre-check-in
 */
patientPortalDataRouter.put("/checkin/:sessionId/demographics", async (req: PatientPortalRequest, res) => {
  try {
    const { sessionId } = req.params;
    const parsed = checkinDemographicsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const session = await pool.query(
      `SELECT id FROM checkin_sessions
       WHERE id = $1 AND tenant_id = $2 AND patient_id = $3`,
      [sessionId, tenantId, patientId]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Check-in session not found" });
    }

    const {
      phone,
      address,
      city,
      state,
      zip,
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactPhone,
    } = parsed.data;

    await pool.query(
      `UPDATE patients
       SET phone = COALESCE($1, phone),
           address = COALESCE($2, address),
           city = COALESCE($3, city),
           state = COALESCE($4, state),
           zip = COALESCE($5, zip),
           emergency_contact_name = COALESCE($6, emergency_contact_name),
           emergency_contact_relationship = COALESCE($7, emergency_contact_relationship),
           emergency_contact_phone = COALESCE($8, emergency_contact_phone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND tenant_id = $10`,
      [
        phone || null,
        address || null,
        city || null,
        state || null,
        zip || null,
        emergencyContactName || null,
        emergencyContactRelationship || null,
        emergencyContactPhone || null,
        patientId,
        tenantId,
      ]
    );

    await pool.query(
      `UPDATE checkin_sessions
       SET demographics_updated = true, status = 'demographics', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    return res.json({ success: true });
  } catch (error) {
    logPatientPortalDataError("Portal demographics update error", error);
    return res.status(500).json({ error: "Failed to update demographics" });
  }
});

/**
 * PUT /api/patient-portal-data/checkin/:sessionId/complete
 * Complete pre-check-in
 */
patientPortalDataRouter.put("/checkin/:sessionId/complete", async (req: PatientPortalRequest, res) => {
  try {
    const { sessionId } = req.params;
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const session = await pool.query(
      `SELECT id, appointment_id FROM checkin_sessions
       WHERE id = $1 AND tenant_id = $2 AND patient_id = $3`,
      [sessionId, tenantId, patientId]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Check-in session not found" });
    }

    await pool.query(
      `UPDATE checkin_sessions
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    // If appointment exists, mark confirmed
    const appointmentId = session.rows[0].appointment_id;
    if (appointmentId) {
      await pool.query(
        `UPDATE appointments
         SET status = 'confirmed'
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );
    }

    return res.json({ success: true, appointmentId });
  } catch (error) {
    logPatientPortalDataError("Complete portal check-in error", error);
    return res.status(500).json({ error: "Failed to complete check-in" });
  }
});

/**
 * GET /api/patient-portal-data/appointments
 * Get upcoming and past appointments
 */
patientPortalDataRouter.get("/appointments", async (req: PatientPortalRequest, res) => {
  try {
    const { status = 'upcoming' } = req.query;
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    let query = `
      SELECT a.id,
             a.scheduled_start::date as "appointmentDate",
             to_char(a.scheduled_start, 'HH24:MI') as "appointmentTime",
             a.status, at.name as "appointmentType",
             a.notes, a.reason,
             pr.full_name as "providerName",
             pr.specialty as "providerSpecialty",
             l.name as "locationName",
             l.address as "locationAddress"
      FROM appointments a
      LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
      LEFT JOIN providers pr ON a.provider_id = pr.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE a.patient_id = $1 AND a.tenant_id = $2
    `;

    if (status === 'upcoming') {
      query += ` AND a.scheduled_start >= CURRENT_DATE
                 AND a.status NOT IN ('cancelled', 'no_show')
                 ORDER BY a.scheduled_start ASC`;
    } else {
      query += ` AND a.scheduled_start < CURRENT_DATE
                 ORDER BY a.scheduled_start DESC`;
    }

    query += ` LIMIT 100`;

    const result = await pool.query(query, [patientId, tenantId]);

    return res.json({ appointments: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get appointments error", error);
    return res.status(500).json({ error: "Failed to get appointments" });
  }
});

/**
 * GET /api/patient-portal-data/visits
 * Get released visit summaries (patient-facing summaries from ambient notes)
 */
patientPortalDataRouter.get("/visits", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const result = await pool.query(
      `SELECT vs.id,
              vs.visit_date as "visitDate",
              vs.provider_name as "providerName",
              vs.summary_text as "summaryText",
              regexp_split_to_array(NULLIF(vs.symptoms_discussed, ''), E'\\n+') as "symptomsDiscussed",
              vs.diagnosis_shared as "diagnosisShared",
              vs.treatment_plan as "treatmentPlan",
              vs.next_steps as "nextSteps",
              vs.follow_up_date as "followUpDate",
              vs.shared_at as "sharedAt"
       FROM visit_summaries vs
       WHERE vs.patient_id = $1
       AND vs.tenant_id = $2
       AND vs.shared_at IS NOT NULL
       ORDER BY vs.visit_date DESC
       LIMIT 50`,
      [patientId, tenantId]
    );

    return res.json({ visits: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get visits error", error);
    return res.status(500).json({ error: "Failed to get visit summaries" });
  }
});

/**
 * GET /api/patient-portal-data/visit-summaries
 * Alternative endpoint for visit summaries (same as /visits for clarity)
 */
patientPortalDataRouter.get("/visit-summaries", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const result = await pool.query(
      `SELECT vs.id,
              vs.visit_date as "visitDate",
              vs.provider_name as "providerName",
              vs.summary_text as "summaryText",
              regexp_split_to_array(NULLIF(vs.symptoms_discussed, ''), E'\\n+') as "symptomsDiscussed",
              vs.diagnosis_shared as "diagnosisShared",
              vs.treatment_plan as "treatmentPlan",
              vs.next_steps as "nextSteps",
              vs.follow_up_date as "followUpDate",
              vs.shared_at as "sharedAt"
       FROM visit_summaries vs
       WHERE vs.patient_id = $1
       AND vs.tenant_id = $2
       AND vs.shared_at IS NOT NULL
       ORDER BY vs.visit_date DESC
       LIMIT 50`,
      [patientId, tenantId]
    );

    return res.json({ summaries: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get visit summaries error", error);
    return res.status(500).json({ error: "Failed to get visit summaries" });
  }
});

/**
 * GET /api/patient-portal-data/documents
 * Get shared documents
 */
patientPortalDataRouter.get("/documents", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const { category } = req.query;

    let query = `
      SELECT d.id, d.title, d.description,
             COALESCE(d.file_type, d.mime_type, d.type) as "fileType",
             d.file_size as "fileSize",
             COALESCE(d.uploaded_at, d.created_at) as "uploadedAt",
             ds.category, ds.shared_at as "sharedAt",
             ds.viewed_at as "viewedAt", ds.notes,
             u.full_name as "sharedBy"
      FROM patient_document_shares ds
      JOIN documents d ON ds.document_id = d.id
      JOIN users u ON ds.shared_by = u.id
      WHERE ds.patient_id = $1 AND ds.tenant_id = $2
    `;

    const params: any[] = [patientId, tenantId];

    if (category) {
      query += ` AND ds.category = $3`;
      params.push(category);
    }

    query += ` ORDER BY ds.shared_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    return res.json({ documents: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get documents error", error);
    return res.status(500).json({ error: "Failed to get documents" });
  }
});

/**
 * GET /api/patient-portal-data/documents/:id/download
 * Download a shared document
 */
patientPortalDataRouter.get("/documents/:id/download", async (req: PatientPortalRequest, res) => {
  try {
    const { id } = req.params;
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    // Verify document is shared with this patient
    const shareResult = await pool.query(
      `SELECT ds.id,
              ds.viewed_at,
              COALESCE(d.file_path, d.url, d.object_key) as file_path,
              d.title,
              COALESCE(d.file_type, d.mime_type, d.type) as file_type
       FROM patient_document_shares ds
       JOIN documents d ON ds.document_id = d.id
       WHERE ds.document_id = $1
       AND ds.patient_id = $2
       AND ds.tenant_id = $3`,
      [id, patientId, tenantId]
    );

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: "Document not found or not shared with you" });
    }

    const share = shareResult.rows[0];

    // Mark as viewed if first time
    if (!share.viewed_at) {
      await pool.query(
        `UPDATE patient_document_shares
         SET viewed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [share.id]
      );
    }

    // Get file path
    const filePath = path.join(process.cwd(), share.file_path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    // Send file
    res.setHeader('Content-Type', share.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${share.title}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logPatientPortalDataError("Download document error", error);
    return res.status(500).json({ error: "Failed to download document" });
  }
});

/**
 * GET /api/patient-portal-data/prescriptions
 * Get prescriptions
 */
patientPortalDataRouter.get("/prescriptions", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const result = await pool.query(
      `SELECT p.id, p.medication_name as "medicationName",
              p.sig, p.quantity, p.refills, p.days_supply as "daysSupply",
              p.prescribed_date as "prescribedDate",
              p.status, p.pharmacy_name as "pharmacyName",
              COALESCE(pr.full_name, u.full_name) as "providerName"
       FROM prescriptions p
       LEFT JOIN providers pr ON p.provider_id = pr.id
       LEFT JOIN users u ON p.provider_id = u.id
       WHERE p.patient_id = $1 AND p.tenant_id = $2
       ORDER BY p.prescribed_date DESC
       LIMIT 100`,
      [patientId, tenantId]
    );

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get prescriptions error", error);
    return res.status(500).json({ error: "Failed to get prescriptions" });
  }
});

/**
 * GET /api/patient-portal-data/vitals
 * Get vital signs history
 */
patientPortalDataRouter.get("/vitals", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const result = await pool.query(
      `SELECT v.id,
              COALESCE(v.recorded_at, v.created_at) as "recordedAt",
              v.height_cm as "heightCm",
              v.weight_kg as "weightKg",
              v.bp_systolic as "bpSystolic",
              v.bp_diastolic as "bpDiastolic",
              v.pulse,
              v.temp_c as "tempC",
              v.o2_saturation as "o2Saturation",
              COALESCE(pr.full_name, u.full_name) as "providerName"
       FROM vitals v
       LEFT JOIN encounters e ON e.id = v.encounter_id AND e.tenant_id = v.tenant_id
       LEFT JOIN providers pr ON e.provider_id = pr.id
       LEFT JOIN users u ON v.recorded_by_id = u.id
       WHERE v.tenant_id = $2
       AND (v.patient_id = $1 OR e.patient_id = $1)
       ORDER BY COALESCE(v.recorded_at, v.created_at) DESC
       LIMIT 50`,
      [patientId, tenantId]
    );

    const vitals = result.rows.map(row => {
      let rawVitalSigns: any = {};
      if (typeof row.vitalSigns === "string") {
        try {
          rawVitalSigns = JSON.parse(row.vitalSigns || "{}");
        } catch {
          rawVitalSigns = {};
        }
      } else if (row.vitalSigns) {
        rawVitalSigns = row.vitalSigns;
      }

      const heightInches = row.heightCm != null ? Number(row.heightCm) / 2.54 : null;
      const weightLbs = row.weightKg != null ? Number(row.weightKg) * 2.20462 : null;
      const bmi = heightInches && weightLbs
        ? (weightLbs / (heightInches * heightInches)) * 703
        : null;

      return {
        id: row.id,
        date: row.recordedAt ?? row.encounterDate ?? row.date,
        provider: row.providerName ?? row.provider ?? "",
        bloodPressure: row.bpSystolic && row.bpDiastolic ? `${row.bpSystolic}/${row.bpDiastolic}` : rawVitalSigns.bloodPressure,
        heartRate: row.pulse ?? rawVitalSigns.heartRate,
        temperature: row.tempC != null
          ? Math.round(((Number(row.tempC) * 9) / 5 + 32) * 10) / 10
          : rawVitalSigns.temperature,
        weight: rawVitalSigns.weight ?? (weightLbs != null ? Math.round(weightLbs * 10) / 10 : undefined),
        height: rawVitalSigns.height ?? (heightInches != null ? Math.round(heightInches * 10) / 10 : undefined),
        bmi: rawVitalSigns.bmi ?? (bmi != null ? Math.round(bmi * 10) / 10 : undefined),
        oxygenSaturation: row.o2Saturation ?? rawVitalSigns.oxygenSaturation,
      };
    });

    return res.json({ vitals });
  } catch (error) {
    logPatientPortalDataError("Get vitals error", error);
    return res.status(500).json({ error: "Failed to get vital signs" });
  }
});

/**
 * GET /api/patient-portal-data/lab-results
 * Get released lab/pathology results from patient_observations
 */
patientPortalDataRouter.get("/lab-results", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    // Fail closed unless both source observations and release controls are present.
    const tableExists = await pool.query(
      `SELECT
          to_regclass('public.patient_observations') IS NOT NULL as observations_exists,
          to_regclass('public.patient_observation_portal_releases') IS NOT NULL as release_controls_exists`
    );

    if (!tableExists.rows[0]?.observations_exists) {
      return res.json({ labResults: [] });
    }

    if (!tableExists.rows[0]?.release_controls_exists) {
      logger.warn("Patient portal lab result release controls are missing; returning no results");
      return res.json({ labResults: [] });
    }

    const result = await pool.query(
      `SELECT
         po.id::text as id,
         po.observation_date as "observationDate",
         COALESCE(NULLIF(po.observation_name, ''), po.observation_code) as "testName",
         po.observation_value as value,
         po.units as unit,
         po.reference_range as "referenceRange",
         po.abnormal_flag as "abnormalFlag",
         po.status
       FROM patient_observations po
       JOIN patient_observation_portal_releases pr
         ON pr.tenant_id = po.tenant_id
        AND pr.observation_id = po.id::text
       WHERE po.patient_id::text = $1
         AND po.tenant_id = $2
         AND pr.release_status = 'released'
         AND (pr.portal_visible_from IS NULL OR pr.portal_visible_from <= NOW())
         AND COALESCE(po.status, 'final') IN ('final', 'corrected', 'amended')
       ORDER BY po.observation_date DESC
       LIMIT 100`,
      [patientId, tenantId]
    );

    return res.json({ labResults: result.rows });
  } catch (error) {
    logPatientPortalDataError("Get lab results error", error);
    // Return empty array if table doesn't exist
    return res.json({ labResults: [] });
  }
});

/**
 * GET /api/patient-portal-data/allergies
 * Get allergies
 */
patientPortalDataRouter.get("/allergies", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const allergies = await getPatientAllergySummaries(tenantId, patientId);

    return res.json({ allergies });
  } catch (error) {
    logPatientPortalDataError("Get allergies error", error);
    return res.status(500).json({ error: "Failed to get allergies" });
  }
});

/**
 * GET /api/patient-portal-data/medications
 * Get current medications
 */
patientPortalDataRouter.get("/medications", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const medications = await getPatientMedicationSummaries(tenantId, patientId);

    return res.json({ medications });
  } catch (error) {
    logPatientPortalDataError("Get medications error", error);
    return res.status(500).json({ error: "Failed to get medications" });
  }
});

/**
 * POST /api/patient-portal-data/refill-requests
 * Create a refill request from the patient portal
 */
patientPortalDataRouter.post("/refill-requests", async (req: PatientPortalRequest, res) => {
  try {
    const parsed = portalRefillRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { prescriptionId, notes } = parsed.data;
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const prescriptionResult = await pool.query(
      `SELECT
        p.id,
        p.medication_name,
        p.strength,
        p.drug_description,
        p.prescribed_date,
        p.provider_id,
        p.pharmacy_id,
        pharm.name as pharmacy_name,
        pharm.ncpdp_id as pharmacy_ncpdp
       FROM prescriptions p
       LEFT JOIN pharmacies pharm ON p.pharmacy_id = pharm.id
       WHERE p.id = $1 AND p.patient_id = $2 AND p.tenant_id = $3`,
      [prescriptionId, patientId, tenantId]
    );

    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ error: "Prescription not found" });
    }

    const prescription = prescriptionResult.rows[0];

    const existingRequest = await pool.query(
      `SELECT id FROM refill_requests
       WHERE tenant_id = $1 AND patient_id = $2 AND original_prescription_id = $3
       AND status = 'pending'
       LIMIT 1`,
      [tenantId, patientId, prescription.id]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(409).json({ error: "A refill request is already pending for this medication" });
    }
    const requestId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO refill_requests(
        id,
        tenant_id,
        patient_id,
        original_prescription_id,
        medication_name,
        strength,
        drug_description,
        original_rx_date,
        provider_id,
        pharmacy_id,
        pharmacy_name,
        pharmacy_ncpdp,
        request_source,
        request_method,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        requestId,
        tenantId,
        patientId,
        prescription.id,
        prescription.medication_name,
        prescription.strength || null,
        prescription.drug_description || null,
        prescription.prescribed_date || null,
        prescription.provider_id || null,
        prescription.pharmacy_id || null,
        prescription.pharmacy_name || null,
        prescription.pharmacy_ncpdp || null,
        "portal",
        "portal",
        notes || null,
      ]
    );

    return res.status(201).json({ id: requestId, message: "Refill request submitted" });
  } catch (error) {
    logPatientPortalDataError("Create portal refill request error", error);
    return res.status(500).json({ error: "Failed to submit refill request" });
  }
});

/**
 * GET /api/patient-portal-data/dashboard
 * Get dashboard summary data
 */
patientPortalDataRouter.get("/dashboard", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    // Get upcoming appointments count
    const appointmentsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE patient_id = $1 AND tenant_id = $2
       AND scheduled_start >= CURRENT_DATE
       AND status NOT IN ('cancelled', 'no_show')`,
      [patientId, tenantId]
    );

    // Get next appointment
    const nextAppointmentResult = await pool.query(
      `SELECT a.id as "appointmentId",
              a.scheduled_start::date as "appointmentDate",
              to_char(a.scheduled_start, 'HH24:MI') as "appointmentTime",
              pr.full_name as "providerName",
              at.name as "appointmentType"
       FROM appointments a
       LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
       LEFT JOIN providers pr ON a.provider_id = pr.id
       WHERE a.patient_id = $1 AND a.tenant_id = $2
       AND a.scheduled_start >= CURRENT_DATE
       AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.scheduled_start ASC
       LIMIT 1`,
      [patientId, tenantId]
    );

    // Get unread documents count (not viewed)
    const documentsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM patient_document_shares
       WHERE patient_id = $1 AND tenant_id = $2
       AND viewed_at IS NULL`,
      [patientId, tenantId]
    );

    // Get new visit summaries count (released in last 30 days)
    const visitsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM visit_summaries
       WHERE patient_id = $1 AND tenant_id = $2
       AND is_released = true
       AND released_at > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [patientId, tenantId]
    );

    // Get active prescriptions count
    const prescriptionsResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM prescriptions
       WHERE patient_id = $1 AND tenant_id = $2
       AND status = 'active'`,
      [patientId, tenantId]
    );

    const unreadMessagesResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM patient_message_threads
       WHERE patient_id = $1 AND tenant_id = $2
       AND is_read_by_patient = false
       AND status <> 'closed'`,
      [patientId, tenantId]
    );

    const balanceResult = await pool.query(
      `SELECT COALESCE(current_balance, 0) as "currentBalance"
       FROM portal_patient_balances
       WHERE patient_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [patientId, tenantId]
    );

    const preCheckinResult = await pool.query(
      `SELECT a.id as "appointmentId",
              a.scheduled_start::date as "appointmentDate",
              to_char(a.scheduled_start, 'HH24:MI') as "appointmentTime",
              pr.full_name as "providerName",
              at.name as "appointmentType"
       FROM appointments a
       LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
       LEFT JOIN providers pr ON a.provider_id = pr.id
       WHERE a.patient_id = $1 AND a.tenant_id = $2
       AND a.scheduled_start >= CURRENT_TIMESTAMP
       AND a.scheduled_start < CURRENT_TIMESTAMP + INTERVAL '14 days'
       AND a.status NOT IN ('cancelled', 'no_show', 'completed')
       AND NOT EXISTS (
         SELECT 1
         FROM portal_checkin_sessions pcs
         WHERE pcs.appointment_id = a.id
           AND pcs.tenant_id = a.tenant_id
           AND pcs.patient_id = a.patient_id
           AND pcs.status = 'completed'
       )
       ORDER BY a.scheduled_start ASC
       LIMIT 1`,
      [patientId, tenantId]
    );

    const unreadMessages = parseInt(unreadMessagesResult.rows[0]?.count || "0", 10);
    const newDocuments = parseInt(documentsResult.rows[0]?.count || "0", 10);
    const newVisits = parseInt(visitsResult.rows[0]?.count || "0", 10);
    const currentBalance = Number(balanceResult.rows[0]?.currentBalance || 0);
    const preCheckinAvailable = preCheckinResult.rows.length > 0;
    const actionNeededCount =
      unreadMessages +
      newDocuments +
      newVisits +
      (currentBalance > 0 ? 1 : 0) +
      (preCheckinAvailable ? 1 : 0);

    return res.json({
      dashboard: {
        upcomingAppointments: parseInt(appointmentsResult.rows[0].count),
        nextAppointment: nextAppointmentResult.rows[0] || null,
        newDocuments,
        newVisits,
        activePrescriptions: parseInt(prescriptionsResult.rows[0].count),
        unreadMessages,
        currentBalance,
        preCheckinAvailable,
        nextCheckinAppointment: preCheckinResult.rows[0] || null,
        actionNeededCount,
      }
    });
  } catch (error) {
    logPatientPortalDataError("Get dashboard error", error);
    return res.status(500).json({ error: "Failed to get dashboard data" });
  }
});
