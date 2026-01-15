import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { pool } from "../db/pool";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import path from "path";
import fs from "fs";

export const patientPortalDataRouter = Router();

// All routes require patient authentication
patientPortalDataRouter.use(requirePatientAuth);

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
           AND appointment_date >= CURRENT_DATE`,
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
    console.error("Start portal check-in error:", error);
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
    console.error("Portal demographics update error:", error);
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
    console.error("Complete portal check-in error:", error);
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
      SELECT a.id, a.appointment_date as "appointmentDate",
             a.appointment_time as "appointmentTime",
             a.status, a.appointment_type as "appointmentType",
             a.notes, a.reason,
             pr.name as "providerName",
             pr.specialty as "providerSpecialty",
             l.name as "locationName",
             l.address as "locationAddress"
      FROM appointments a
      LEFT JOIN providers pr ON a.provider_id = pr.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE a.patient_id = $1 AND a.tenant_id = $2
    `;

    if (status === 'upcoming') {
      query += ` AND a.appointment_date >= CURRENT_DATE
                 AND a.status NOT IN ('cancelled', 'no_show')
                 ORDER BY a.appointment_date ASC, a.appointment_time ASC`;
    } else {
      query += ` AND a.appointment_date < CURRENT_DATE
                 ORDER BY a.appointment_date DESC, a.appointment_time DESC`;
    }

    query += ` LIMIT 100`;

    const result = await pool.query(query, [patientId, tenantId]);

    return res.json({ appointments: result.rows });
  } catch (error) {
    console.error("Get appointments error:", error);
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
              vs.symptoms_discussed as "symptomsDiscussed",
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
    console.error("Get visits error:", error);
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
              vs.symptoms_discussed as "symptomsDiscussed",
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
    console.error("Get visit summaries error:", error);
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
      SELECT d.id, d.title, d.description, d.file_type as "fileType",
             d.file_size as "fileSize", d.uploaded_at as "uploadedAt",
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
    console.error("Get documents error:", error);
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
      `SELECT ds.id, ds.viewed_at, d.file_path, d.title, d.file_type
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
    console.error("Download document error:", error);
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
              pr.name as "providerName"
       FROM prescriptions p
       LEFT JOIN providers pr ON p.provider_id = pr.id
       WHERE p.patient_id = $1 AND p.tenant_id = $2
       ORDER BY p.prescribed_date DESC
       LIMIT 100`,
      [patientId, tenantId]
    );

    return res.json({ prescriptions: result.rows });
  } catch (error) {
    console.error("Get prescriptions error:", error);
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

    // Get vitals from encounters
    const result = await pool.query(
      `SELECT e.id, e.encounter_date as "encounterDate",
              e.vital_signs as "vitalSigns",
              pr.name as "providerName"
       FROM encounters e
       LEFT JOIN providers pr ON e.provider_id = pr.id
       WHERE e.patient_id = $1
       AND e.tenant_id = $2
       AND e.vital_signs IS NOT NULL
       ORDER BY e.encounter_date DESC
       LIMIT 50`,
      [patientId, tenantId]
    );

    // Transform data for charting
    const vitals = result.rows.map(row => ({
      date: row.encounterDate,
      provider: row.providerName,
      ...row.vitalSigns
    }));

    return res.json({ vitals });
  } catch (error) {
    console.error("Get vitals error:", error);
    return res.status(500).json({ error: "Failed to get vital signs" });
  }
});

/**
 * GET /api/patient-portal-data/lab-results
 * Get lab results from patient_observations
 */
patientPortalDataRouter.get("/lab-results", async (req: PatientPortalRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    // Check if patient_observations table exists
    const tableExists = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'patient_observations'
      )`
    );

    if (!tableExists.rows[0].exists) {
      return res.json({ labResults: [] });
    }

    const result = await pool.query(
      `SELECT id, observation_date as "observationDate",
              observation_type as "observationType",
              test_name as "testName",
              value, unit, reference_range as "referenceRange",
              abnormal_flag as "abnormalFlag",
              status, notes
       FROM patient_observations
       WHERE patient_id = $1
       AND tenant_id = $2
       AND observation_type IN ('lab', 'pathology')
       ORDER BY observation_date DESC
       LIMIT 100`,
      [patientId, tenantId]
    );

    return res.json({ labResults: result.rows });
  } catch (error) {
    console.error("Get lab results error:", error);
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

    // Get from patient record (simple string for now)
    const result = await pool.query(
      `SELECT allergies FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.json({ allergies: [] });
    }

    // Parse allergies (assuming comma-separated for now)
    const allergiesString = result.rows[0].allergies || '';
    const allergies = allergiesString
      .split(',')
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0)
      .map((allergen: string) => ({
        allergen,
        // Could be enhanced with structured allergy data
        reaction: 'Unknown',
        severity: 'Unknown'
      }));

    return res.json({ allergies });
  } catch (error) {
    console.error("Get allergies error:", error);
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

    // Get from prescriptions with active status
    const result = await pool.query(
      `SELECT medication_name as "medicationName",
              sig, quantity, refills,
              prescribed_date as "prescribedDate",
              pr.name as "providerName"
       FROM prescriptions p
       LEFT JOIN providers pr ON p.provider_id = pr.id
       WHERE p.patient_id = $1
       AND p.tenant_id = $2
       AND p.status = 'active'
       ORDER BY p.prescribed_date DESC`,
      [patientId, tenantId]
    );

    return res.json({ medications: result.rows });
  } catch (error) {
    console.error("Get medications error:", error);
    return res.status(500).json({ error: "Failed to get medications" });
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
       AND appointment_date >= CURRENT_DATE
       AND status NOT IN ('cancelled', 'no_show')`,
      [patientId, tenantId]
    );

    // Get next appointment
    const nextAppointmentResult = await pool.query(
      `SELECT a.appointment_date as "appointmentDate",
              a.appointment_time as "appointmentTime",
              pr.name as "providerName"
       FROM appointments a
       LEFT JOIN providers pr ON a.provider_id = pr.id
       WHERE a.patient_id = $1 AND a.tenant_id = $2
       AND a.appointment_date >= CURRENT_DATE
       AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.appointment_date ASC, a.appointment_time ASC
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

    return res.json({
      dashboard: {
        upcomingAppointments: parseInt(appointmentsResult.rows[0].count),
        nextAppointment: nextAppointmentResult.rows[0] || null,
        newDocuments: parseInt(documentsResult.rows[0].count),
        newVisits: parseInt(visitsResult.rows[0].count),
        activePrescriptions: parseInt(prescriptionsResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    return res.status(500).json({ error: "Failed to get dashboard data" });
  }
});
