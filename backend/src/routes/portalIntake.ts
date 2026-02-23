import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { getTableColumns } from "../db/schema";
import { PatientPortalRequest, requirePatientAuth } from "../middleware/patientPortalAuth";
import crypto from "crypto";
import { logger } from "../lib/logger";

export const portalIntakeRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logPortalIntakeError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

type PortalConsentSeed = {
  title: string;
  consentType: "treatment" | "hipaa" | "financial" | "photography" | "telehealth" | "general";
  content: string;
  version?: string;
  requiresSignature?: boolean;
  requiresWitness?: boolean;
  isRequired?: boolean;
};

const DEFAULT_PORTAL_CONSENT_FORMS: PortalConsentSeed[] = [
  {
    title: "Consent to Treat",
    consentType: "treatment",
    content:
      "I consent to evaluation and treatment by this practice. I understand risks, benefits, and alternatives were explained and I may ask questions at any time.",
    isRequired: true,
  },
  {
    title: "HIPAA Notice of Privacy Practices Acknowledgment",
    consentType: "hipaa",
    content:
      "I acknowledge I received or was offered the Notice of Privacy Practices and understand how my protected health information may be used and disclosed.",
    isRequired: true,
  },
  {
    title: "Financial Responsibility and Assignment of Benefits",
    consentType: "financial",
    content:
      "I accept responsibility for copays, deductibles, non-covered services, and balances due. I authorize assignment of insurance benefits to this practice.",
    isRequired: true,
  },
  {
    title: "Communication Consent (SMS, Phone, Email)",
    consentType: "general",
    content:
      "I authorize this practice to contact me regarding appointments and care using phone, SMS, and email. Message/data rates may apply and I may opt out as allowed by law.",
    isRequired: true,
  },
  {
    title: "Clinical Photography Consent",
    consentType: "photography",
    content:
      "I consent to clinical photography for diagnosis, treatment, and care documentation. Any non-treatment use requires separate authorization.",
    isRequired: false,
  },
  {
    title: "Telehealth Consent",
    consentType: "telehealth",
    content:
      "I consent to telehealth services when offered, including limits of remote care, privacy considerations, and emergency guidance.",
    isRequired: false,
  },
  {
    title: "Good Faith Estimate Acknowledgment (Self-Pay/Uninsured)",
    consentType: "financial",
    content:
      "If I am uninsured or self-pay, I understand I may request and receive a Good Faith Estimate before scheduled services.",
    isRequired: false,
  },
  {
    title: "HIPAA Authorization for Non-Routine Disclosure",
    consentType: "hipaa",
    content:
      "I authorize disclosure of protected health information only for the specific purpose, recipient, and time period I designate in this authorization.",
    isRequired: false,
  },
];

async function ensureDefaultPortalConsentForms(tenantId: string): Promise<void> {
  for (const consent of DEFAULT_PORTAL_CONSENT_FORMS) {
    await pool.query(
      `INSERT INTO portal_consent_forms (
         tenant_id,
         title,
         consent_type,
         content,
         version,
         requires_signature,
         requires_witness,
         is_required,
         is_active
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, true
       WHERE NOT EXISTS (
         SELECT 1
         FROM portal_consent_forms
         WHERE tenant_id = $1
           AND LOWER(title) = LOWER($2)
       )`,
      [
        tenantId,
        consent.title,
        consent.consentType,
        consent.content,
        consent.version || "1.0",
        consent.requiresSignature ?? true,
        consent.requiresWitness ?? false,
        consent.isRequired ?? false,
      ],
    );
  }
}

type SignedConsentView = {
  id: string;
  consentTitle: string;
  consentType: string;
  signerName: string | null;
  signerRelationship: string | null;
  version: string | null;
  signedAt: string;
  isValid: boolean;
  source: "portal" | "kiosk";
};

async function fetchKioskSignedConsents(
  tenantId: string,
  patientId: string,
): Promise<SignedConsentView[]> {
  try {
    const patientConsentColumns = await getTableColumns("patient_consents");
    if (patientConsentColumns.size === 0) {
      return [];
    }

    if (patientConsentColumns.has("consent_form_id")) {
      const consentFormColumns = await getTableColumns("consent_forms");
      if (!consentFormColumns.has("form_name")) {
        return [];
      }

      const legacyResult = await pool.query(
        `SELECT
           pc.id,
           cf.form_name as "consentTitle",
           COALESCE(cf.form_type, 'general') as "consentType",
           'Patient (kiosk)'::text as "signerName",
           'self'::text as "signerRelationship",
           COALESCE(pc.form_version, '1.0') as "version",
           pc.signed_at as "signedAt",
           true as "isValid"
         FROM patient_consents pc
         INNER JOIN consent_forms cf ON pc.consent_form_id = cf.id
         WHERE pc.patient_id = $1
           AND pc.tenant_id = $2
         ORDER BY pc.signed_at DESC`,
        [patientId, tenantId],
      );
      return legacyResult.rows.map((row) => ({ ...row, source: "kiosk" as const }));
    }

    if (patientConsentColumns.has("template_id")) {
      const templateColumns = await getTableColumns("consent_templates");
      if (!templateColumns.has("name")) {
        return [];
      }

      const modernResult = await pool.query(
        `SELECT
           pc.id,
           ct.name as "consentTitle",
           COALESCE(ct.form_type, 'general') as "consentType",
           COALESCE(pc.signer_name, 'Patient') as "signerName",
           COALESCE(pc.signer_relationship, 'self') as "signerRelationship",
           COALESCE(pc.form_version, ct.version, '1.0') as "version",
           pc.signed_at as "signedAt",
           (pc.status = 'signed') as "isValid"
         FROM patient_consents pc
         INNER JOIN consent_templates ct ON pc.template_id = ct.id
         WHERE pc.patient_id = $1
           AND pc.tenant_id = $2
           AND pc.signed_at IS NOT NULL
         ORDER BY pc.signed_at DESC`,
        [patientId, tenantId],
      );
      return modernResult.rows.map((row) => ({ ...row, source: "kiosk" as const }));
    }
  } catch (error) {
    logPortalIntakeError("Fetch kiosk signed consents error", error);
  }

  return [];
}

// ============================================================================
// INTAKE FORM TEMPLATES
// ============================================================================

/**
 * GET /api/patient-portal/intake/forms
 * Get available intake forms for patient to fill out
 */
portalIntakeRouter.get(
  "/forms",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      // Get forms assigned to this patient
      const result = await pool.query(
        `SELECT
          a.id as assignment_id,
          a.status,
          a.due_date as "dueDate",
          a.completed_at as "completedAt",
          t.id as template_id,
          t.name,
          t.description,
          t.form_type as "formType",
          t.form_schema as "formSchema",
          r.id as response_id,
          r.response_data as "responseData",
          r.status as response_status
         FROM portal_intake_form_assignments a
         INNER JOIN portal_intake_form_templates t ON a.form_template_id = t.id
         LEFT JOIN portal_intake_form_responses r ON a.id = r.assignment_id
         WHERE a.patient_id = $1 AND a.tenant_id = $2
           AND a.status IN ('pending', 'in_progress')
           AND (a.expires_at IS NULL OR a.expires_at > CURRENT_TIMESTAMP)
         ORDER BY a.due_date ASC NULLS LAST, a.assigned_at DESC`,
        [patientId, tenantId]
      );

      return res.json({ forms: result.rows });
    } catch (error) {
      logPortalIntakeError("Get intake forms error", error);
      return res.status(500).json({ error: "Failed to get intake forms" });
    }
  }
);

/**
 * GET /api/patient-portal/intake/forms/:assignmentId
 * Get specific intake form assignment
 */
portalIntakeRouter.get(
  "/forms/:assignmentId",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { assignmentId } = req.params;

      const result = await pool.query(
        `SELECT
          a.id as assignment_id,
          a.status,
          a.due_date as "dueDate",
          a.appointment_id as "appointmentId",
          t.id as template_id,
          t.name,
          t.description,
          t.form_type as "formType",
          t.form_schema as "formSchema",
          r.id as response_id,
          r.response_data as "responseData",
          r.status as response_status,
          r.started_at as "startedAt"
         FROM portal_intake_form_assignments a
         INNER JOIN portal_intake_form_templates t ON a.form_template_id = t.id
         LEFT JOIN portal_intake_form_responses r ON a.id = r.assignment_id
         WHERE a.id = $1 AND a.patient_id = $2 AND a.tenant_id = $3`,
        [assignmentId, patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Form not found" });
      }

      return res.json(result.rows[0]);
    } catch (error) {
      logPortalIntakeError("Get intake form error", error);
      return res.status(500).json({ error: "Failed to get intake form" });
    }
  }
);

/**
 * POST /api/patient-portal/intake/forms/:assignmentId/start
 * Start filling out a form (creates draft response)
 */
portalIntakeRouter.post(
  "/forms/:assignmentId/start",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { assignmentId } = req.params;

      // Verify assignment belongs to patient
      const assignmentResult = await pool.query(
        `SELECT id, form_template_id, status
         FROM portal_intake_form_assignments
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [assignmentId, patientId, tenantId]
      );

      if (assignmentResult.rows.length === 0) {
        return res.status(404).json({ error: "Form assignment not found" });
      }

      const assignment = assignmentResult.rows[0];

      // Check if response already exists
      const existingResponse = await pool.query(
        `SELECT id FROM portal_intake_form_responses
         WHERE assignment_id = $1`,
        [assignmentId]
      );

      if (existingResponse.rows.length > 0) {
        return res.json({ responseId: existingResponse.rows[0].id });
      }

      // Create draft response
      const result = await pool.query(
        `INSERT INTO portal_intake_form_responses (
          tenant_id, assignment_id, patient_id, form_template_id,
          response_data, status, ip_address, user_agent
         ) VALUES ($1, $2, $3, $4, '{}', 'draft', $5, $6)
         RETURNING id`,
        [
          tenantId,
          assignmentId,
          patientId,
          assignment.form_template_id,
          req.ip,
          req.get('user-agent') || null,
        ]
      );

      // Update assignment status
      await pool.query(
        `UPDATE portal_intake_form_assignments
         SET status = 'in_progress'
         WHERE id = $1`,
        [assignmentId]
      );

      return res.status(201).json({ responseId: result.rows[0].id });
    } catch (error) {
      logPortalIntakeError("Start form error", error);
      return res.status(500).json({ error: "Failed to start form" });
    }
  }
);

/**
 * PUT /api/patient-portal/intake/responses/:responseId
 * Save form response (draft or submit)
 */
const saveResponseSchema = z.object({
  responseData: z.record(z.string(), z.any()), // {field_id: value}
  submit: z.boolean().default(false),
  signatureData: z.string().optional(), // base64 signature if form requires it
});

portalIntakeRouter.put(
  "/responses/:responseId",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { responseId } = req.params;
      const data = saveResponseSchema.parse(req.body);

      // Verify response belongs to patient
      const responseResult = await pool.query(
        `SELECT
          r.id,
          r.assignment_id,
          r.started_at,
          a.form_template_id,
          t.form_schema
         FROM portal_intake_form_responses r
         INNER JOIN portal_intake_form_assignments a ON r.assignment_id = a.id
         INNER JOIN portal_intake_form_templates t ON a.form_template_id = t.id
         WHERE r.id = $1 AND r.patient_id = $2 AND r.tenant_id = $3`,
        [responseId, patientId, tenantId]
      );

      if (responseResult.rows.length === 0) {
        return res.status(404).json({ error: "Response not found" });
      }

      const response = responseResult.rows[0];

      // Calculate completion time if submitting
      let completionTime = null;
      if (data.submit && response.started_at) {
        const startTime = new Date(response.started_at).getTime();
        const endTime = Date.now();
        completionTime = Math.floor((endTime - startTime) / 1000); // seconds
      }

      // Update response
      const updateResult = await pool.query(
        `UPDATE portal_intake_form_responses
         SET response_data = $1,
             status = $2,
             submitted_at = $3,
             signature_data = $4,
             signature_timestamp = $5,
             completion_time_seconds = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id, status`,
        [
          JSON.stringify(data.responseData),
          data.submit ? 'submitted' : 'draft',
          data.submit ? new Date() : null,
          data.signatureData,
          data.signatureData ? new Date() : null,
          completionTime,
          responseId,
        ]
      );

      // If submitted, update assignment
      if (data.submit) {
        await pool.query(
          `UPDATE portal_intake_form_assignments
           SET status = 'completed',
               completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [response.assignment_id]
        );
      }

      return res.json(updateResult.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalIntakeError("Save response error", error);
      return res.status(500).json({ error: "Failed to save response" });
    }
  }
);

/**
 * GET /api/patient-portal/intake/history
 * Get patient's completed intake forms
 */
portalIntakeRouter.get(
  "/history",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;

      const result = await pool.query(
        `SELECT
          r.id,
          t.name as "formName",
          t.form_type as "formType",
          r.submitted_at as "submittedAt",
          r.reviewed_at as "reviewedAt",
          a.appointment_id as "appointmentId"
         FROM portal_intake_form_responses r
         INNER JOIN portal_intake_form_assignments a ON r.assignment_id = a.id
         INNER JOIN portal_intake_form_templates t ON r.form_template_id = t.id
         WHERE r.patient_id = $1 AND r.tenant_id = $2
           AND r.status IN ('submitted', 'reviewed')
         ORDER BY r.submitted_at DESC
         LIMIT 50`,
        [patientId, tenantId]
      );

      return res.json({ history: result.rows });
    } catch (error) {
      logPortalIntakeError("Get intake history error", error);
      return res.status(500).json({ error: "Failed to get intake history" });
    }
  }
);

// ============================================================================
// CONSENT FORMS
// ============================================================================

/**
 * GET /api/patient-portal/intake/consents
 * Get available consent forms
 */
portalIntakeRouter.get(
  "/consents",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { tenantId } = req.patient!;
      await ensureDefaultPortalConsentForms(tenantId);

      const result = await pool.query(
        `SELECT
          id,
          title,
          consent_type as "consentType",
          content,
          version,
          requires_signature as "requiresSignature",
          requires_witness as "requiresWitness",
          is_required as "isRequired"
         FROM portal_consent_forms
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY is_required DESC, consent_type, title`,
        [tenantId]
      );

      return res.json({ consents: result.rows });
    } catch (error) {
      logPortalIntakeError("Get consents error", error);
      return res.status(500).json({ error: "Failed to get consent forms" });
    }
  }
);

/**
 * GET /api/patient-portal/intake/consents/required
 * Get required consents that patient hasn't signed yet
 */
portalIntakeRouter.get(
  "/consents/required",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      await ensureDefaultPortalConsentForms(tenantId);

      const result = await pool.query(
        `SELECT
          cf.id,
          cf.title,
          cf.consent_type as "consentType",
          cf.content,
          cf.version,
          cf.requires_signature as "requiresSignature",
          cf.requires_witness as "requiresWitness"
         FROM portal_consent_forms cf
         WHERE cf.tenant_id = $1
           AND cf.is_active = true
           AND cf.is_required = true
           AND NOT EXISTS (
             SELECT 1 FROM portal_consent_signatures cs
             WHERE cs.consent_form_id = cf.id
               AND cs.patient_id = $2
               AND cs.is_valid = true
               AND cs.consent_version = cf.version
           )
         ORDER BY cf.consent_type, cf.title`,
        [tenantId, patientId]
      );

      return res.json({ requiredConsents: result.rows });
    } catch (error) {
      logPortalIntakeError("Get required consents error", error);
      return res.status(500).json({ error: "Failed to get required consents" });
    }
  }
);

/**
 * POST /api/patient-portal/intake/consents/:consentId/sign
 * Sign a consent form
 */
const signConsentSchema = z.object({
  signatureData: z.string().min(1),
  signerName: z.string().min(1),
  signerRelationship: z.enum(['self', 'parent', 'guardian', 'power_of_attorney', 'other']).default('self'),
  witnessSignatureData: z.string().optional(),
  witnessName: z.string().optional(),
});

portalIntakeRouter.post(
  "/consents/:consentId/sign",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { consentId } = req.params;
      const data = signConsentSchema.parse(req.body);

      // Get consent form
      const consentResult = await pool.query(
        `SELECT
          id,
          title,
          content,
          version,
          requires_witness
         FROM portal_consent_forms
         WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
        [consentId, tenantId]
      );

      if (consentResult.rows.length === 0) {
        return res.status(404).json({ error: "Consent form not found" });
      }

      const consent = consentResult.rows[0];

      // Validate witness signature if required
      if (consent.requires_witness && (!data.witnessSignatureData || !data.witnessName)) {
        return res.status(400).json({ error: "Witness signature required" });
      }

      // Invalidate any previous signatures for this consent
      await pool.query(
        `UPDATE portal_consent_signatures
         SET is_valid = false
         WHERE patient_id = $1 AND consent_form_id = $2 AND is_valid = true`,
        [patientId, consentId]
      );

      // Create new signature
      const result = await pool.query(
        `INSERT INTO portal_consent_signatures (
          tenant_id, patient_id, consent_form_id,
          signature_data, signer_name, signer_relationship,
          witness_signature_data, witness_name,
          consent_version, consent_content,
          ip_address, user_agent, is_valid
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
         RETURNING id, signed_at as "signedAt"`,
        [
          tenantId,
          patientId,
          consentId,
          data.signatureData,
          data.signerName,
          data.signerRelationship,
          data.witnessSignatureData,
          data.witnessName,
          consent.version,
          consent.content,
          req.ip,
          req.get('user-agent') || null,
        ]
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalIntakeError("Sign consent error", error);
      return res.status(500).json({ error: "Failed to sign consent" });
    }
  }
);

/**
 * GET /api/patient-portal/intake/consents/signed
 * Get patient's signed consents
 */
portalIntakeRouter.get(
  "/consents/signed",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      await ensureDefaultPortalConsentForms(tenantId);

      const portalResult = await pool.query(
        `SELECT
          cs.id,
          cf.title as "consentTitle",
          cf.consent_type as "consentType",
          cs.signer_name as "signerName",
          cs.signer_relationship as "signerRelationship",
          cs.consent_version as "version",
          cs.signed_at as "signedAt",
          cs.is_valid as "isValid"
         FROM portal_consent_signatures cs
         INNER JOIN portal_consent_forms cf ON cs.consent_form_id = cf.id
         WHERE cs.patient_id = $1 AND cs.tenant_id = $2
         ORDER BY cs.signed_at DESC`,
        [patientId, tenantId]
      );

      const kioskConsents = await fetchKioskSignedConsents(tenantId, patientId);
      const signedConsents: SignedConsentView[] = [
        ...portalResult.rows.map((row) => ({ ...row, source: "portal" as const })),
        ...kioskConsents,
      ]
        .filter((consent) => !!consent.signedAt)
        .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime());

      return res.json({ signedConsents });
    } catch (error) {
      logPortalIntakeError("Get signed consents error", error);
      return res.status(500).json({ error: "Failed to get signed consents" });
    }
  }
);

// ============================================================================
// E-CHECK-IN
// ============================================================================

/**
 * POST /api/patient-portal/intake/checkin
 * Start check-in session for appointment
 */
const startCheckinSchema = z.object({
  appointmentId: z.string().uuid(),
  sessionType: z.enum(['mobile', 'kiosk', 'tablet']).default('mobile'),
  deviceType: z.string().optional(),
});

portalIntakeRouter.post(
  "/checkin",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const data = startCheckinSchema.parse(req.body);

      // Verify appointment belongs to patient and is today
      const apptResult = await pool.query(
        `SELECT
          id,
          scheduled_start,
          location_id,
          status
         FROM appointments
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3
           AND DATE(scheduled_start) = CURRENT_DATE
           AND status IN ('scheduled', 'confirmed')`,
        [data.appointmentId, patientId, tenantId]
      );

      if (apptResult.rows.length === 0) {
        return res.status(404).json({ error: "Appointment not found or not eligible for check-in" });
      }

      const appointment = apptResult.rows[0];

      // Check if session already exists
      const existingSession = await pool.query(
        `SELECT id, status FROM portal_checkin_sessions
         WHERE appointment_id = $1 AND status NOT IN ('completed', 'abandoned')
         ORDER BY started_at DESC
         LIMIT 1`,
        [data.appointmentId]
      );

      if (existingSession.rows.length > 0) {
        return res.json({
          sessionId: existingSession.rows[0].id,
          status: existingSession.rows[0].status,
        });
      }

      // Create new check-in session
      const result = await pool.query(
        `INSERT INTO portal_checkin_sessions (
          tenant_id, patient_id, appointment_id,
          session_type, device_type, location_id,
          ip_address, user_agent, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'started')
         RETURNING id, status, started_at as "startedAt"`,
        [
          tenantId,
          patientId,
          data.appointmentId,
          data.sessionType,
          data.deviceType,
          appointment.location_id,
          req.ip,
          req.get('user-agent') || null,
        ]
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalIntakeError("Start check-in error", error);
      return res.status(500).json({ error: "Failed to start check-in" });
    }
  }
);

/**
 * GET /api/patient-portal/intake/checkin/:sessionId
 * Get check-in session status
 */
portalIntakeRouter.get(
  "/checkin/:sessionId",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { sessionId } = req.params;

      const result = await pool.query(
        `SELECT
          id,
          appointment_id as "appointmentId",
          status,
          demographics_confirmed as "demographicsConfirmed",
          insurance_verified as "insuranceVerified",
          forms_completed as "formsCompleted",
          copay_collected as "copayCollected",
          copay_amount as "copayAmount",
          insurance_card_front_url as "insuranceCardFrontUrl",
          insurance_card_back_url as "insuranceCardBackUrl",
          insurance_verification_status as "insuranceVerificationStatus",
          staff_notified as "staffNotified",
          started_at as "startedAt",
          completed_at as "completedAt"
         FROM portal_checkin_sessions
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [sessionId, patientId, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Check-in session not found" });
      }

      return res.json(result.rows[0]);
    } catch (error) {
      logPortalIntakeError("Get check-in session error", error);
      return res.status(500).json({ error: "Failed to get check-in session" });
    }
  }
);

/**
 * PUT /api/patient-portal/intake/checkin/:sessionId
 * Update check-in session progress
 */
const updateCheckinSchema = z.object({
  demographicsConfirmed: z.boolean().optional(),
  insuranceVerified: z.boolean().optional(),
  formsCompleted: z.boolean().optional(),
  copayCollected: z.boolean().optional(),
  insuranceCardFrontUrl: z.string().optional(),
  insuranceCardBackUrl: z.string().optional(),
  complete: z.boolean().default(false),
});

portalIntakeRouter.put(
  "/checkin/:sessionId",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { sessionId } = req.params;
      const data = updateCheckinSchema.parse(req.body);

      const hasAnyUpdate =
        data.complete ||
        data.demographicsConfirmed !== undefined ||
        data.insuranceVerified !== undefined ||
        data.formsCompleted !== undefined ||
        data.copayCollected !== undefined ||
        !!data.insuranceCardFrontUrl ||
        !!data.insuranceCardBackUrl;

      if (!hasAnyUpdate) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const sessionResult = await pool.query(
        `SELECT id, appointment_id as "appointmentId"
         FROM portal_checkin_sessions
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [sessionId, patientId, tenantId],
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: "Check-in session not found" });
      }

      const session = sessionResult.rows[0] as { appointmentId?: string | null };

      if (data.complete) {
        await ensureDefaultPortalConsentForms(tenantId);

        const missingRequiredConsents = await pool.query(
          `SELECT cf.id, cf.title
           FROM portal_consent_forms cf
           WHERE cf.tenant_id = $1
             AND cf.is_active = true
             AND cf.is_required = true
             AND NOT EXISTS (
               SELECT 1
               FROM portal_consent_signatures cs
               WHERE cs.consent_form_id = cf.id
                 AND cs.patient_id = $2
                 AND cs.is_valid = true
                 AND cs.consent_version = cf.version
             )
           ORDER BY cf.title`,
          [tenantId, patientId],
        );

        if (missingRequiredConsents.rows.length > 0) {
          return res.status(400).json({
            error: "Required consents must be completed before check-in can be finalized",
            missingConsents: missingRequiredConsents.rows,
          });
        }

        if (session.appointmentId) {
          const pendingForms = await pool.query(
            `SELECT a.id, t.name
             FROM portal_intake_form_assignments a
             INNER JOIN portal_intake_form_templates t ON a.form_template_id = t.id
             WHERE a.tenant_id = $1
               AND a.patient_id = $2
               AND a.appointment_id = $3
               AND a.status IN ('pending', 'in_progress')
             ORDER BY t.name`,
            [tenantId, patientId, session.appointmentId],
          );

          if (pendingForms.rows.length > 0) {
            return res.status(400).json({
              error: "All assigned intake forms must be completed before check-in can be finalized",
              pendingForms: pendingForms.rows,
            });
          }
        }
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.demographicsConfirmed !== undefined) {
        updates.push(`demographics_confirmed = $${paramCount++}`);
        values.push(data.demographicsConfirmed);
      }
      if (data.insuranceVerified !== undefined) {
        updates.push(`insurance_verified = $${paramCount++}`);
        values.push(data.insuranceVerified);
      }
      if (data.formsCompleted !== undefined) {
        updates.push(`forms_completed = $${paramCount++}`);
        values.push(data.formsCompleted);
      }
      if (data.copayCollected !== undefined) {
        updates.push(`copay_collected = $${paramCount++}`);
        values.push(data.copayCollected);
      }
      if (data.insuranceCardFrontUrl) {
        updates.push(`insurance_card_front_url = $${paramCount++}`);
        values.push(data.insuranceCardFrontUrl);
      }
      if (data.insuranceCardBackUrl) {
        updates.push(`insurance_card_back_url = $${paramCount++}`);
        values.push(data.insuranceCardBackUrl);
      }

      if (data.complete) {
        updates.push(`status = 'completed'`);
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
        updates.push(`staff_notified = true`);
        updates.push(`staff_notified_at = CURRENT_TIMESTAMP`);
      }

      values.push(sessionId, patientId, tenantId);

      const result = await pool.query(
        `UPDATE portal_checkin_sessions
         SET ${updates.join(', ')}
         WHERE id = $${paramCount} AND patient_id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
         RETURNING id, status, completed_at as "completedAt"`,
        values
      );

      // If completed, update appointment status
      if (data.complete) {
        await pool.query(
          `UPDATE appointments
           SET status = 'checked_in'
           WHERE id = (SELECT appointment_id FROM portal_checkin_sessions WHERE id = $1)`,
          [sessionId]
        );
      }

      return res.json(result.rows[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      logPortalIntakeError("Update check-in error", error);
      return res.status(500).json({ error: "Failed to update check-in" });
    }
  }
);

/**
 * POST /api/patient-portal/intake/checkin/:sessionId/upload-insurance
 * Upload insurance card images
 */
portalIntakeRouter.post(
  "/checkin/:sessionId/upload-insurance",
  requirePatientAuth,
  async (req: PatientPortalRequest, res) => {
    try {
      const { patientId, tenantId } = req.patient!;
      const { sessionId } = req.params;
      const { frontImageUrl, backImageUrl } = req.body;

      // Verify session belongs to patient
      const sessionResult = await pool.query(
        `SELECT id FROM portal_checkin_sessions
         WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [sessionId, patientId, tenantId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: "Check-in session not found" });
      }

      // Update insurance card URLs
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET insurance_card_front_url = $1,
             insurance_card_back_url = $2,
             insurance_verification_status = 'pending'
         WHERE id = $3`,
        [frontImageUrl, backImageUrl, sessionId]
      );

      return res.json({ success: true });
    } catch (error) {
      logPortalIntakeError("Upload insurance card error", error);
      return res.status(500).json({ error: "Failed to upload insurance card" });
    }
  }
);
