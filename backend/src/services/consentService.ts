import crypto from "crypto";
import { pool } from "../db/pool";
import { createAuditLog } from "./audit";

// Types
export interface ConsentTemplate {
  id: string;
  tenantId: string;
  name: string;
  formType: string;
  contentHtml: string;
  requiredFields: string[];
  procedureCodes: string[];
  isActive: boolean;
  version: string;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentFormField {
  id: string;
  templateId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  position: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
  helpText?: string;
  validationPattern?: string;
  defaultValue?: string;
  dependsOnField?: string;
  dependsOnValue?: string;
}

export interface PatientConsent {
  id: string;
  tenantId: string;
  patientId: string;
  templateId: string;
  encounterId?: string;
  signedAt?: string;
  signatureData?: string;
  signatureType: string;
  signerName?: string;
  signerRelationship?: string;
  ipAddress?: string;
  userAgent?: string;
  signatureHash?: string;
  witnessName?: string;
  witnessSignatureData?: string;
  witnessSignedAt?: string;
  formContentSnapshot?: string;
  formVersion?: string;
  fieldValues: Record<string, unknown>;
  status: "pending" | "signed" | "revoked" | "expired";
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentSession {
  id: string;
  tenantId: string;
  patientId: string;
  templateId: string;
  encounterId?: string;
  sessionToken: string;
  status: "active" | "completed" | "expired" | "cancelled";
  expiresAt: string;
  fieldValues: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SignatureData {
  signatureData: string;
  signatureType?: "drawn" | "typed" | "biometric";
  signerName?: string;
  signerRelationship?: string;
}

export interface WitnessData {
  witnessName: string;
  witnessSignatureData: string;
}

/**
 * Get required consents for an encounter based on procedure codes
 */
export async function getRequiredConsents(
  tenantId: string,
  encounterId: string,
  procedureCodes: string[]
): Promise<{
  required: ConsentTemplate[];
  alreadySigned: PatientConsent[];
  pending: ConsentTemplate[];
}> {
  // Get encounter details
  const encounterResult = await pool.query(
    `SELECT patient_id FROM encounters WHERE id = $1 AND tenant_id = $2`,
    [encounterId, tenantId]
  );

  if (encounterResult.rows.length === 0) {
    throw new Error("Encounter not found");
  }

  const patientId = encounterResult.rows[0]?.patient_id;

  // Find templates that match any of the procedure codes
  const templateResult = await pool.query(
    `SELECT id, tenant_id as "tenantId", name, form_type as "formType",
            content_html as "contentHtml", required_fields as "requiredFields",
            procedure_codes as "procedureCodes", is_active as "isActive",
            version, effective_date as "effectiveDate",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM consent_templates
     WHERE tenant_id = $1
       AND is_active = true
       AND (procedure_codes && $2 OR form_type = 'general')
     ORDER BY form_type = 'general' DESC, name`,
    [tenantId, procedureCodes]
  );

  const requiredTemplates: ConsentTemplate[] = templateResult.rows;

  // Check which consents have already been signed for this encounter
  const signedResult = await pool.query(
    `SELECT pc.id, pc.tenant_id as "tenantId", pc.patient_id as "patientId",
            pc.template_id as "templateId", pc.encounter_id as "encounterId",
            pc.signed_at as "signedAt", pc.signature_type as "signatureType",
            pc.signer_name as "signerName", pc.status, pc.form_version as "formVersion",
            pc.created_at as "createdAt", pc.updated_at as "updatedAt"
     FROM patient_consents pc
     WHERE pc.patient_id = $1
       AND pc.tenant_id = $2
       AND pc.encounter_id = $3
       AND pc.status = 'signed'`,
    [patientId, tenantId, encounterId]
  );

  const alreadySigned: PatientConsent[] = signedResult.rows;
  const signedTemplateIds = new Set(alreadySigned.map((c) => c.templateId));

  const pending = requiredTemplates.filter((t) => !signedTemplateIds.has(t.id));

  return {
    required: requiredTemplates,
    alreadySigned,
    pending,
  };
}

/**
 * Create a consent signing session
 */
export async function createConsentSession(
  tenantId: string,
  patientId: string,
  templateId: string,
  encounterId?: string,
  createdBy?: string
): Promise<ConsentSession> {
  const id = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Verify template exists
  const templateCheck = await pool.query(
    `SELECT id FROM consent_templates WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
    [templateId, tenantId]
  );

  if (templateCheck.rows.length === 0) {
    throw new Error("Consent template not found or inactive");
  }

  await pool.query(
    `INSERT INTO consent_sessions (
      id, tenant_id, patient_id, template_id, encounter_id,
      session_token, status, expires_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)`,
    [id, tenantId, patientId, templateId, encounterId || null, sessionToken, expiresAt, createdBy || null]
  );

  // Log the session creation
  await createAuditLog({
    tenantId,
    userId: createdBy,
    action: "consent_session_created",
    resourceType: "consent_session",
    resourceId: id,
    metadata: { patientId, templateId, encounterId },
  });

  return {
    id,
    tenantId,
    patientId,
    templateId,
    encounterId,
    sessionToken,
    status: "active",
    expiresAt: expiresAt.toISOString(),
    fieldValues: {},
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get session by token
 */
export async function getSessionByToken(
  tenantId: string,
  sessionToken: string
): Promise<ConsentSession | null> {
  const result = await pool.query(
    `SELECT id, tenant_id as "tenantId", patient_id as "patientId",
            template_id as "templateId", encounter_id as "encounterId",
            session_token as "sessionToken", status, expires_at as "expiresAt",
            field_values as "fieldValues", created_by as "createdBy",
            created_at as "createdAt", completed_at as "completedAt"
     FROM consent_sessions
     WHERE session_token = $1 AND tenant_id = $2`,
    [sessionToken, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const session = result.rows[0] as ConsentSession | undefined;

  // Check if expired
  if (session && new Date(session.expiresAt) < new Date() && session.status === "active") {
    await pool.query(
      `UPDATE consent_sessions SET status = 'expired' WHERE id = $1`,
      [session.id]
    );
    session.status = "expired";
  }

  return session || null;
}

/**
 * Update session field values
 */
export async function updateSessionFieldValues(
  tenantId: string,
  sessionId: string,
  fieldValues: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE consent_sessions
     SET field_values = $1
     WHERE id = $2 AND tenant_id = $3 AND status = 'active'`,
    [JSON.stringify(fieldValues), sessionId, tenantId]
  );
}

/**
 * Capture signature and create signed consent
 */
export async function captureSignature(
  tenantId: string,
  sessionId: string,
  signatureData: SignatureData,
  witnessData?: WitnessData,
  ipAddress?: string,
  userAgent?: string
): Promise<PatientConsent> {
  // Get session
  const sessionResult = await pool.query(
    `SELECT cs.*, ct.content_html, ct.version
     FROM consent_sessions cs
     JOIN consent_templates ct ON cs.template_id = ct.id
     WHERE cs.id = $1 AND cs.tenant_id = $2 AND cs.status = 'active'`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found or not active");
  }

  const session = sessionResult.rows[0];

  // Check if session expired
  if (new Date(session.expires_at) < new Date()) {
    await pool.query(
      `UPDATE consent_sessions SET status = 'expired' WHERE id = $1`,
      [sessionId]
    );
    throw new Error("Session has expired");
  }

  // Create signature hash for integrity verification
  const signatureHash = crypto
    .createHash("sha256")
    .update(signatureData.signatureData + session.patient_id + new Date().toISOString())
    .digest("hex");

  const consentId = crypto.randomUUID();
  const signedAt = new Date();

  // Create the signed consent
  await pool.query(
    `INSERT INTO patient_consents (
      id, tenant_id, patient_id, template_id, encounter_id,
      signed_at, signature_data, signature_type, signer_name, signer_relationship,
      ip_address, user_agent, signature_hash,
      witness_name, witness_signature_data, witness_signed_at,
      form_content_snapshot, form_version, field_values, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'signed')`,
    [
      consentId,
      tenantId,
      session.patient_id,
      session.template_id,
      session.encounter_id,
      signedAt,
      signatureData.signatureData,
      signatureData.signatureType || "drawn",
      signatureData.signerName || null,
      signatureData.signerRelationship || "self",
      ipAddress || null,
      userAgent || null,
      signatureHash,
      witnessData?.witnessName || null,
      witnessData?.witnessSignatureData || null,
      witnessData ? signedAt : null,
      session.content_html,
      session.version,
      JSON.stringify(session.field_values || {}),
    ]
  );

  // Mark session as completed
  await pool.query(
    `UPDATE consent_sessions SET status = 'completed', completed_at = $1 WHERE id = $2`,
    [signedAt, sessionId]
  );

  // Create audit log entry
  await logConsentAction(tenantId, consentId, "signed", null, "patient", {
    sessionId,
    hasWitness: !!witnessData,
  }, ipAddress, userAgent);

  // Return the created consent
  const consentResult = await pool.query(
    `SELECT id, tenant_id as "tenantId", patient_id as "patientId",
            template_id as "templateId", encounter_id as "encounterId",
            signed_at as "signedAt", signature_type as "signatureType",
            signer_name as "signerName", signer_relationship as "signerRelationship",
            signature_hash as "signatureHash", witness_name as "witnessName",
            form_version as "formVersion", field_values as "fieldValues",
            status, pdf_url as "pdfUrl", created_at as "createdAt"
     FROM patient_consents WHERE id = $1`,
    [consentId]
  );

  return consentResult.rows[0] as PatientConsent;
}

/**
 * Generate a signed PDF for the consent
 */
export async function generateSignedPDF(
  tenantId: string,
  consentId: string
): Promise<{ pdfUrl: string }> {
  // Get consent details
  const result = await pool.query(
    `SELECT pc.*, ct.name as template_name, p.first_name, p.last_name, p.date_of_birth
     FROM patient_consents pc
     JOIN consent_templates ct ON pc.template_id = ct.id
     JOIN patients p ON pc.patient_id = p.id
     WHERE pc.id = $1 AND pc.tenant_id = $2`,
    [consentId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("Consent not found");
  }

  const consent = result.rows[0];

  // In a real implementation, this would generate an actual PDF
  // For now, we'll create a placeholder URL
  const pdfUrl = `/api/consents/${consentId}/pdf`;

  // Update consent with PDF URL
  await pool.query(
    `UPDATE patient_consents SET pdf_url = $1, pdf_generated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [pdfUrl, consentId]
  );

  // Log PDF generation
  await logConsentAction(tenantId, consentId, "pdf_generated", null, "system", {
    templateName: consent.template_name,
  });

  return { pdfUrl };
}

/**
 * Validate signature integrity
 */
export async function validateSignature(
  tenantId: string,
  consentId: string
): Promise<{ valid: boolean; details: Record<string, unknown> }> {
  const result = await pool.query(
    `SELECT signature_data, signature_hash, patient_id, signed_at, status
     FROM patient_consents
     WHERE id = $1 AND tenant_id = $2`,
    [consentId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("Consent not found");
  }

  const consent = result.rows[0];

  // Check status
  if (consent.status !== "signed") {
    return {
      valid: false,
      details: {
        reason: "Consent is not in signed status",
        currentStatus: consent.status,
      },
    };
  }

  // Verify hash integrity
  const computedHash = crypto
    .createHash("sha256")
    .update(consent.signature_data + consent.patient_id + new Date(consent.signed_at).toISOString())
    .digest("hex");

  const hashValid = computedHash === consent.signature_hash;

  return {
    valid: hashValid,
    details: {
      signedAt: consent.signed_at,
      hashMatch: hashValid,
      hasSignatureData: !!consent.signature_data,
    },
  };
}

/**
 * Get patient consent history
 */
export async function getPatientConsentHistory(
  tenantId: string,
  patientId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<{ consents: PatientConsent[]; total: number }> {
  let whereClause = "WHERE pc.patient_id = $1 AND pc.tenant_id = $2";
  const params: (string | number)[] = [patientId, tenantId];

  if (options?.status) {
    whereClause += ` AND pc.status = $${params.length + 1}`;
    params.push(options.status);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM patient_consents pc ${whereClause}`,
    params
  );

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const result = await pool.query(
    `SELECT pc.id, pc.tenant_id as "tenantId", pc.patient_id as "patientId",
            pc.template_id as "templateId", pc.encounter_id as "encounterId",
            pc.signed_at as "signedAt", pc.signature_type as "signatureType",
            pc.signer_name as "signerName", pc.signer_relationship as "signerRelationship",
            pc.witness_name as "witnessName", pc.form_version as "formVersion",
            pc.status, pc.pdf_url as "pdfUrl",
            pc.created_at as "createdAt", pc.updated_at as "updatedAt",
            ct.name as "templateName", ct.form_type as "formType"
     FROM patient_consents pc
     JOIN consent_templates ct ON pc.template_id = ct.id
     ${whereClause}
     ORDER BY pc.signed_at DESC NULLS LAST, pc.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    consents: result.rows,
    total: parseInt(countResult.rows[0]?.total || "0", 10),
  };
}

/**
 * Get consent by ID with full details
 */
export async function getConsentById(
  tenantId: string,
  consentId: string
): Promise<PatientConsent | null> {
  const result = await pool.query(
    `SELECT pc.id, pc.tenant_id as "tenantId", pc.patient_id as "patientId",
            pc.template_id as "templateId", pc.encounter_id as "encounterId",
            pc.signed_at as "signedAt", pc.signature_data as "signatureData",
            pc.signature_type as "signatureType", pc.signer_name as "signerName",
            pc.signer_relationship as "signerRelationship", pc.ip_address as "ipAddress",
            pc.signature_hash as "signatureHash", pc.witness_name as "witnessName",
            pc.witness_signature_data as "witnessSignatureData",
            pc.witness_signed_at as "witnessSignedAt",
            pc.form_content_snapshot as "formContentSnapshot",
            pc.form_version as "formVersion", pc.field_values as "fieldValues",
            pc.status, pc.revoked_at as "revokedAt", pc.revocation_reason as "revocationReason",
            pc.pdf_url as "pdfUrl", pc.pdf_generated_at as "pdfGeneratedAt",
            pc.created_at as "createdAt", pc.updated_at as "updatedAt",
            ct.name as "templateName", ct.form_type as "formType"
     FROM patient_consents pc
     JOIN consent_templates ct ON pc.template_id = ct.id
     WHERE pc.id = $1 AND pc.tenant_id = $2`,
    [consentId, tenantId]
  );

  return (result.rows[0] as PatientConsent | undefined) || null;
}

/**
 * Revoke a consent
 */
export async function revokeConsent(
  tenantId: string,
  consentId: string,
  revokedBy: string,
  reason: string
): Promise<void> {
  const result = await pool.query(
    `UPDATE patient_consents
     SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
         revoked_by = $1, revocation_reason = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND tenant_id = $4 AND status = 'signed'
     RETURNING id`,
    [revokedBy, reason, consentId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("Consent not found or cannot be revoked");
  }

  // Log revocation
  await logConsentAction(tenantId, consentId, "revoked", revokedBy, "staff", { reason });
}

/**
 * Get template with fields
 */
export async function getTemplateWithFields(
  tenantId: string,
  templateId: string
): Promise<{ template: ConsentTemplate; fields: ConsentFormField[] } | null> {
  const templateResult = await pool.query(
    `SELECT id, tenant_id as "tenantId", name, form_type as "formType",
            content_html as "contentHtml", required_fields as "requiredFields",
            procedure_codes as "procedureCodes", is_active as "isActive",
            version, effective_date as "effectiveDate",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM consent_templates
     WHERE id = $1 AND tenant_id = $2`,
    [templateId, tenantId]
  );

  if (templateResult.rows.length === 0) {
    return null;
  }

  const fieldsResult = await pool.query(
    `SELECT id, template_id as "templateId", field_name as "fieldName",
            field_label as "fieldLabel", field_type as "fieldType",
            required, position, options, placeholder, help_text as "helpText",
            validation_pattern as "validationPattern", default_value as "defaultValue",
            depends_on_field as "dependsOnField", depends_on_value as "dependsOnValue"
     FROM consent_form_fields
     WHERE template_id = $1
     ORDER BY position`,
    [templateId]
  );

  return {
    template: templateResult.rows[0] as ConsentTemplate,
    fields: fieldsResult.rows,
  };
}

/**
 * Get all active templates
 */
export async function getActiveTemplates(tenantId: string): Promise<ConsentTemplate[]> {
  const result = await pool.query(
    `SELECT id, tenant_id as "tenantId", name, form_type as "formType",
            content_html as "contentHtml", required_fields as "requiredFields",
            procedure_codes as "procedureCodes", is_active as "isActive",
            version, effective_date as "effectiveDate",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM consent_templates
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY form_type, name`,
    [tenantId]
  );

  return result.rows;
}

/**
 * Log consent action to audit table
 */
export async function logConsentAction(
  tenantId: string,
  consentId: string,
  action: string,
  performedBy: string | null | undefined,
  performedByType: "staff" | "patient" | "system",
  details?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO consent_audit_log (
      id, tenant_id, consent_id, action, performed_by, performed_by_type,
      details, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      crypto.randomUUID(),
      tenantId,
      consentId,
      action,
      performedBy || null,
      performedByType,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
      userAgent || null,
    ]
  );
}

/**
 * Get consent audit history
 */
export async function getConsentAuditHistory(
  tenantId: string,
  consentId: string
): Promise<Array<{
  id: string;
  action: string;
  performedBy: string | null;
  performedByType: string;
  timestamp: string;
  details: Record<string, unknown> | null;
}>> {
  const result = await pool.query(
    `SELECT id, action, performed_by as "performedBy",
            performed_by_type as "performedByType",
            timestamp, details, ip_address as "ipAddress"
     FROM consent_audit_log
     WHERE consent_id = $1 AND tenant_id = $2
     ORDER BY timestamp DESC`,
    [consentId, tenantId]
  );

  return result.rows;
}
