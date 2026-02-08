/**
 * Patient Intake Automation Service
 *
 * Handles all patient intake operations including:
 * - Pre-registration link generation and delivery
 * - Intake form processing and validation
 * - Insurance eligibility verification
 * - Consent form e-signature capture
 * - Medical history processing
 * - Document upload and OCR
 * - Patient portal activation
 * - Intake status tracking
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { smsWorkflowService } from './smsWorkflowService';

// ============================================
// TYPE DEFINITIONS
// ============================================

export type IntakeFormType =
  | 'DEMOGRAPHICS'
  | 'INSURANCE'
  | 'MEDICAL_HISTORY'
  | 'CONSENT_TREATMENT'
  | 'CONSENT_HIPAA'
  | 'CONSENT_PHOTO'
  | 'REVIEW_OF_SYSTEMS'
  | 'FAMILY_HISTORY'
  | 'SOCIAL_HISTORY'
  | 'CUSTOM';

export type IntakeFormStatus =
  | 'draft'
  | 'submitted'
  | 'pending_review'
  | 'reviewed'
  | 'archived';

export type ConsentType =
  | 'CONSENT_TREATMENT'
  | 'CONSENT_HIPAA'
  | 'CONSENT_PHOTO'
  | 'CONSENT_TELEHEALTH'
  | 'CONSENT_FINANCIAL'
  | 'CONSENT_RESEARCH'
  | 'CONSENT_OTHER';

export type VerificationStatus =
  | 'pending'
  | 'active'
  | 'inactive'
  | 'error'
  | 'needs_review';

export interface IntakeFormData {
  formType: IntakeFormType;
  formData: Record<string, any>;
  appointmentId?: string;
}

export interface ConsentFormData {
  consentType: ConsentType;
  consentTitle: string;
  consentContent: string;
  signatureData: string;
  signerName: string;
  signerRelationship?: string;
  witnessSignatureData?: string;
  witnessName?: string;
  appointmentId?: string;
}

export interface DocumentUploadData {
  documentType: string;
  filePath: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  appointmentId?: string;
}

export interface MedicalHistoryEntry {
  category: string;
  subcategory?: string;
  entryData: Record<string, any>;
  conditionName?: string;
  icd10Code?: string;
  onsetDate?: string;
  resolvedDate?: string;
  isActive?: boolean;
  severity?: string;
}

export interface IntakeStatus {
  overallStatus: string;
  completionPercentage: number;
  demographicsComplete: boolean;
  insuranceComplete: boolean;
  medicalHistoryComplete: boolean;
  consentTreatmentSigned: boolean;
  consentHipaaSigned: boolean;
  consentPhotoSigned: boolean;
  insuranceVerified: boolean;
  portalActivated: boolean;
}

export interface InsuranceVerificationResult {
  id: string;
  status: VerificationStatus;
  payerName: string;
  memberId: string;
  effectiveDate?: string;
  terminationDate?: string;
  copayAmountCents?: number;
  deductibleTotalCents?: number;
  deductibleMetCents?: number;
  coinsurancePct?: number;
  outOfPocketMaxCents?: number;
  outOfPocketMetCents?: number;
  priorAuthRequired: boolean;
  hasIssues: boolean;
  issueNotes?: string;
  coverageDetails: Record<string, any>;
}

// ============================================
// PATIENT INTAKE SERVICE CLASS
// ============================================

class PatientIntakeService {
  // ============================================
  // PRE-REGISTRATION LINK
  // ============================================

  /**
   * Send pre-registration link to patient before appointment
   */
  async sendPreRegistrationLink(
    tenantId: string,
    patientId: string,
    appointmentId?: string,
    sendVia: 'email' | 'sms' | 'both' = 'both'
  ): Promise<{ success: boolean; token: string; linkUrl: string }> {
    logger.info('Sending pre-registration link', { tenantId, patientId, appointmentId, sendVia });

    try {
      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');

      // Calculate expiration (7 days from now, or day of appointment)
      let expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      if (appointmentId) {
        const apptResult = await pool.query(
          `SELECT start_time FROM appointments WHERE id = $1 AND tenant_id = $2`,
          [appointmentId, tenantId]
        );
        if (apptResult.rows.length > 0) {
          const apptDate = new Date(apptResult.rows[0].start_time);
          if (apptDate < expiresAt) {
            expiresAt = apptDate;
          }
        }
      }

      // Create link token record
      await pool.query(
        `INSERT INTO intake_link_tokens (
          tenant_id, patient_id, appointment_id, token, expires_at, sent_via, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [tenantId, patientId, appointmentId || null, token, expiresAt, sendVia]
      );

      // Initialize intake status if not exists
      await this.initializeIntakeStatus(tenantId, patientId, appointmentId);

      // Get patient contact info
      const patientResult = await pool.query(
        `SELECT first_name, last_name, email, cell_phone FROM patients
         WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        throw new Error('Patient not found');
      }

      const patient = patientResult.rows[0];

      // Get tenant portal URL
      const tenantResult = await pool.query(
        `SELECT portal_url, name FROM tenants WHERE id = $1`,
        [tenantId]
      );
      const portalBaseUrl = tenantResult.rows[0]?.portal_url || 'https://portal.example.com';
      const clinicName = tenantResult.rows[0]?.name || 'Our Clinic';

      const linkUrl = `${portalBaseUrl}/intake?token=${token}`;

      // Send notifications
      if (sendVia === 'email' || sendVia === 'both') {
        await this.sendPreRegistrationEmail(tenantId, patient, linkUrl, clinicName);
      }

      if (sendVia === 'sms' || sendVia === 'both') {
        if (patient.cell_phone) {
          await this.sendPreRegistrationSMS(tenantId, patientId, patient, linkUrl, clinicName);
        }
      }

      logger.info('Pre-registration link sent successfully', { patientId, token: token.substring(0, 8) });

      return {
        success: true,
        token,
        linkUrl,
      };
    } catch (error: any) {
      logger.error('Failed to send pre-registration link', { patientId, error: error.message });
      throw error;
    }
  }

  private async sendPreRegistrationEmail(
    tenantId: string,
    patient: any,
    linkUrl: string,
    clinicName: string
  ): Promise<void> {
    // In production, integrate with email service (SendGrid, SES, etc.)
    logger.info('Sending pre-registration email', {
      email: patient.email,
      clinicName,
    });
    // Mock email sending - in production this would call an email service
  }

  private async sendPreRegistrationSMS(
    tenantId: string,
    patientId: string,
    patient: any,
    linkUrl: string,
    clinicName: string
  ): Promise<void> {
    try {
      const message = `Hi ${patient.first_name}! Please complete your pre-registration for ${clinicName}: ${linkUrl}`;
      // Use SMS workflow service if available
      logger.info('Pre-registration SMS queued', { patientId, phone: patient.cell_phone });
    } catch (error: any) {
      logger.warn('Failed to send pre-registration SMS', { patientId, error: error.message });
    }
  }

  // ============================================
  // INTAKE FORM PROCESSING
  // ============================================

  /**
   * Process and store intake form data
   */
  async processIntakeForm(
    tenantId: string,
    patientId: string,
    data: IntakeFormData,
    source: string = 'portal',
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ id: string; status: string }> {
    logger.info('Processing intake form', { tenantId, patientId, formType: data.formType });

    // Validate form data based on type
    this.validateFormData(data.formType, data.formData);

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO intake_forms (
        id, tenant_id, patient_id, form_type, form_data, status,
        appointment_id, source, ip_address, user_agent, started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, 'submitted', $6, $7, $8, $9, NOW(), NOW())`,
      [
        id,
        tenantId,
        patientId,
        data.formType,
        JSON.stringify(data.formData),
        data.appointmentId || null,
        source,
        ipAddress || null,
        userAgent || null,
      ]
    );

    // Update intake status
    await this.updateIntakeStatusForForm(tenantId, patientId, data.formType, data.appointmentId);

    // Process form-specific actions
    await this.processFormSpecificActions(tenantId, patientId, data);

    logger.info('Intake form processed successfully', { id, formType: data.formType });

    return { id, status: 'submitted' };
  }

  private validateFormData(formType: IntakeFormType, formData: Record<string, any>): void {
    // Basic validation - in production, use Zod schemas per form type
    if (!formData || typeof formData !== 'object') {
      throw new Error('Invalid form data');
    }

    // Type-specific validation
    switch (formType) {
      case 'DEMOGRAPHICS':
        if (!formData.firstName || !formData.lastName) {
          throw new Error('Demographics form requires first name and last name');
        }
        break;
      case 'INSURANCE':
        if (!formData.payerId && !formData.payerName) {
          throw new Error('Insurance form requires payer information');
        }
        break;
      case 'MEDICAL_HISTORY':
        // Medical history can be empty/no conditions
        break;
      default:
        // Custom forms have flexible validation
        break;
    }
  }

  private async processFormSpecificActions(
    tenantId: string,
    patientId: string,
    data: IntakeFormData
  ): Promise<void> {
    switch (data.formType) {
      case 'DEMOGRAPHICS':
        // Update patient demographics in patients table
        await this.updatePatientDemographics(tenantId, patientId, data.formData);
        break;

      case 'INSURANCE':
        // Update patient insurance info and trigger verification
        await this.updatePatientInsurance(tenantId, patientId, data.formData);
        if (data.formData.autoVerify !== false) {
          await this.verifyInsuranceEligibility(tenantId, patientId, data.appointmentId);
        }
        break;

      case 'MEDICAL_HISTORY':
        // Process medical history entries
        if (data.formData.conditions && Array.isArray(data.formData.conditions)) {
          for (const condition of data.formData.conditions) {
            await this.processMedicalHistory(tenantId, patientId, {
              category: condition.category || 'diagnosis',
              entryData: condition,
              conditionName: condition.name,
              isActive: condition.isActive !== false,
            });
          }
        }
        break;
    }
  }

  private async updatePatientDemographics(
    tenantId: string,
    patientId: string,
    demographics: Record<string, any>
  ): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      dateOfBirth: 'dob',
      gender: 'gender',
      email: 'email',
      cellPhone: 'cell_phone',
      homePhone: 'home_phone',
      address: 'address',
      city: 'city',
      state: 'state',
      zipCode: 'zip',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
    };

    for (const [key, dbColumn] of Object.entries(fieldMappings)) {
      if (demographics[key] !== undefined) {
        updates.push(`${dbColumn} = $${paramIndex}`);
        values.push(demographics[key]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return;

    values.push(patientId, tenantId);

    await pool.query(
      `UPDATE patients SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );

    logger.info('Patient demographics updated', { patientId });
  }

  private async updatePatientInsurance(
    tenantId: string,
    patientId: string,
    insurance: Record<string, any>
  ): Promise<void> {
    await pool.query(
      `UPDATE patients SET
        insurance_provider = $1,
        insurance_payer_id = $2,
        insurance_member_id = $3,
        insurance_group_number = $4,
        insurance_plan_name = $5,
        updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [
        insurance.payerName || null,
        insurance.payerId || null,
        insurance.memberId || null,
        insurance.groupNumber || null,
        insurance.planName || null,
        patientId,
        tenantId,
      ]
    );

    logger.info('Patient insurance updated', { patientId });
  }

  // ============================================
  // INSURANCE ELIGIBILITY VERIFICATION
  // ============================================

  /**
   * Verify insurance eligibility via API (mock implementation)
   */
  async verifyInsuranceEligibility(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<InsuranceVerificationResult> {
    logger.info('Verifying insurance eligibility', { tenantId, patientId });

    // Get patient insurance info
    const patientResult = await pool.query(
      `SELECT first_name, last_name, dob, insurance_provider, insurance_payer_id,
              insurance_member_id, insurance_group_number, insurance_plan_name
       FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      throw new Error('Patient not found');
    }

    const patient = patientResult.rows[0];

    if (!patient.insurance_member_id) {
      // No insurance on file
      const result = await this.createVerificationRecord(tenantId, patientId, {
        status: 'error',
        hasIssues: true,
        issueNotes: 'No insurance information on file',
      }, appointmentId);

      return result;
    }

    // Mock eligibility check - in production, call Availity, Change Healthcare, etc.
    const mockResponse = this.mockEligibilityCheck(patient);

    // Store verification result
    const verificationId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await pool.query(
      `INSERT INTO insurance_verifications (
        id, tenant_id, patient_id, payer_id, payer_name, member_id, group_number,
        plan_name, plan_type, verification_status, coverage_details,
        effective_date, termination_date, copay_amount_cents, deductible_total_cents,
        deductible_met_cents, coinsurance_pct, out_of_pocket_max_cents, out_of_pocket_met_cents,
        prior_auth_required, verified_at, verification_source, expires_at,
        has_issues, issue_type, issue_notes, appointment_id, raw_response
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), $21, $22, $23, $24, $25, $26, $27)`,
      [
        verificationId,
        tenantId,
        patientId,
        patient.insurance_payer_id,
        patient.insurance_provider,
        patient.insurance_member_id,
        patient.insurance_group_number,
        mockResponse.planName,
        mockResponse.planType,
        mockResponse.status,
        JSON.stringify(mockResponse.coverageDetails),
        mockResponse.effectiveDate,
        mockResponse.terminationDate,
        mockResponse.copayAmountCents,
        mockResponse.deductibleTotalCents,
        mockResponse.deductibleMetCents,
        mockResponse.coinsurancePct,
        mockResponse.outOfPocketMaxCents,
        mockResponse.outOfPocketMetCents,
        mockResponse.priorAuthRequired,
        'mock_api',
        expiresAt,
        mockResponse.hasIssues,
        mockResponse.hasIssues ? 'verification_issue' : null,
        mockResponse.issueNotes,
        appointmentId || null,
        JSON.stringify(mockResponse.rawResponse),
      ]
    );

    // Update intake status
    await this.updateIntakeStatusField(tenantId, patientId, appointmentId, 'insurance_verified', true);
    await this.updateIntakeStatusField(tenantId, patientId, appointmentId, 'insurance_verification_id', verificationId);

    logger.info('Insurance verification completed', { verificationId, status: mockResponse.status });

    return {
      id: verificationId,
      status: mockResponse.status,
      payerName: patient.insurance_provider || 'Unknown',
      memberId: patient.insurance_member_id,
      effectiveDate: mockResponse.effectiveDate,
      terminationDate: mockResponse.terminationDate,
      copayAmountCents: mockResponse.copayAmountCents,
      deductibleTotalCents: mockResponse.deductibleTotalCents,
      deductibleMetCents: mockResponse.deductibleMetCents,
      coinsurancePct: mockResponse.coinsurancePct,
      outOfPocketMaxCents: mockResponse.outOfPocketMaxCents,
      outOfPocketMetCents: mockResponse.outOfPocketMetCents,
      priorAuthRequired: mockResponse.priorAuthRequired,
      hasIssues: mockResponse.hasIssues,
      issueNotes: mockResponse.issueNotes,
      coverageDetails: mockResponse.coverageDetails,
    };
  }

  private mockEligibilityCheck(patient: any): any {
    // Mock response - in production, call real eligibility API
    const isActive = Math.random() > 0.1; // 90% active coverage

    return {
      status: isActive ? 'active' : 'inactive',
      planName: patient.insurance_plan_name || 'Standard PPO',
      planType: 'PPO',
      effectiveDate: '2024-01-01',
      terminationDate: null,
      copayAmountCents: 3000, // $30 copay
      deductibleTotalCents: 150000, // $1500 deductible
      deductibleMetCents: 75000, // $750 met
      coinsurancePct: 20,
      outOfPocketMaxCents: 500000, // $5000 OOP max
      outOfPocketMetCents: 125000, // $1250 met
      priorAuthRequired: false,
      hasIssues: !isActive,
      issueNotes: !isActive ? 'Coverage is not currently active' : null,
      coverageDetails: {
        inNetwork: true,
        specialistCopay: 5000,
        primaryCareCopay: 2500,
        preventiveCareCovered: true,
        dermatologyBenefits: {
          medicalDermatology: 'covered',
          cosmetic: 'not_covered',
          skinCancerScreening: 'covered',
        },
      },
      rawResponse: {
        responseCode: '200',
        timestamp: new Date().toISOString(),
        source: 'mock',
      },
    };
  }

  private async createVerificationRecord(
    tenantId: string,
    patientId: string,
    data: Partial<InsuranceVerificationResult>,
    appointmentId?: string
  ): Promise<InsuranceVerificationResult> {
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO insurance_verifications (
        id, tenant_id, patient_id, verification_status, has_issues, issue_notes,
        appointment_id, verified_at, verification_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'manual')`,
      [
        id,
        tenantId,
        patientId,
        data.status || 'error',
        data.hasIssues || false,
        data.issueNotes || null,
        appointmentId || null,
      ]
    );

    return {
      id,
      status: (data.status || 'error') as VerificationStatus,
      payerName: 'Unknown',
      memberId: '',
      priorAuthRequired: false,
      hasIssues: data.hasIssues || false,
      issueNotes: data.issueNotes,
      coverageDetails: {},
    };
  }

  // ============================================
  // CONSENT FORM PROCESSING
  // ============================================

  /**
   * Process e-signature consent form
   */
  async processConsentForm(
    tenantId: string,
    patientId: string,
    data: ConsentFormData,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ id: string; signedAt: Date }> {
    logger.info('Processing consent form', { tenantId, patientId, consentType: data.consentType });

    // Validate signature data
    if (!data.signatureData || data.signatureData.length < 100) {
      throw new Error('Invalid signature data');
    }

    if (!data.signerName || data.signerName.trim().length < 2) {
      throw new Error('Signer name is required');
    }

    const id = crypto.randomUUID();
    const signedAt = new Date();

    // Calculate expiration (typically 1 year for most consents)
    let expiresAt: Date | null = null;
    if (data.consentType === 'CONSENT_PHOTO' || data.consentType === 'CONSENT_RESEARCH') {
      expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    await pool.query(
      `INSERT INTO consent_records (
        id, tenant_id, patient_id, consent_type, consent_title, consent_content,
        signature_data, signer_name, signer_relationship,
        witness_signature_data, witness_name,
        signed_at, ip_address, user_agent, expires_at, appointment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        tenantId,
        patientId,
        data.consentType,
        data.consentTitle,
        data.consentContent,
        data.signatureData,
        data.signerName.trim(),
        data.signerRelationship || 'self',
        data.witnessSignatureData || null,
        data.witnessName || null,
        signedAt,
        ipAddress,
        userAgent || null,
        expiresAt,
        data.appointmentId || null,
      ]
    );

    // Update intake status
    await this.updateIntakeStatusForConsent(tenantId, patientId, data.consentType, data.appointmentId);

    logger.info('Consent form processed successfully', { id, consentType: data.consentType });

    return { id, signedAt };
  }

  // ============================================
  // MEDICAL HISTORY PROCESSING
  // ============================================

  /**
   * Process and store medical history entry
   */
  async processMedicalHistory(
    tenantId: string,
    patientId: string,
    entry: MedicalHistoryEntry,
    sourceFormId?: string,
    sourceDocumentId?: string
  ): Promise<{ id: string }> {
    logger.info('Processing medical history entry', { tenantId, patientId, category: entry.category });

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO medical_history_entries (
        id, tenant_id, patient_id, category, subcategory, entry_data,
        condition_name, icd10_code, onset_date, resolved_date, is_active, severity,
        source, source_form_id, source_document_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        tenantId,
        patientId,
        entry.category,
        entry.subcategory || null,
        JSON.stringify(entry.entryData),
        entry.conditionName || null,
        entry.icd10Code || null,
        entry.onsetDate || null,
        entry.resolvedDate || null,
        entry.isActive !== false,
        entry.severity || null,
        sourceFormId ? 'patient_reported' : 'patient_reported',
        sourceFormId || null,
        sourceDocumentId || null,
      ]
    );

    logger.info('Medical history entry created', { id, category: entry.category });

    return { id };
  }

  // ============================================
  // DOCUMENT UPLOAD AND OCR
  // ============================================

  /**
   * Process document upload with optional OCR
   */
  async processDocumentUpload(
    tenantId: string,
    patientId: string,
    data: DocumentUploadData,
    source: string = 'portal',
    ipAddress?: string
  ): Promise<{ id: string; ocrProcessed: boolean }> {
    logger.info('Processing document upload', { tenantId, patientId, documentType: data.documentType });

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO intake_documents (
        id, tenant_id, patient_id, document_type, document_name,
        file_path, file_size_bytes, mime_type,
        appointment_id, source, ip_address, uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        id,
        tenantId,
        patientId,
        data.documentType,
        data.fileName || null,
        data.filePath,
        data.fileSize || null,
        data.mimeType || null,
        data.appointmentId || null,
        source,
        ipAddress || null,
      ]
    );

    // Queue OCR processing for insurance cards and IDs
    let ocrProcessed = false;
    if (['insurance_card_front', 'insurance_card_back', 'drivers_license', 'state_id'].includes(data.documentType)) {
      ocrProcessed = await this.processDocumentOCR(tenantId, id);
    }

    // Update intake status for document uploads
    await this.updateIntakeStatusForDocument(tenantId, patientId, data.documentType, data.appointmentId);

    logger.info('Document upload processed', { id, ocrProcessed });

    return { id, ocrProcessed };
  }

  private async processDocumentOCR(tenantId: string, documentId: string): Promise<boolean> {
    // In production, integrate with OCR service (AWS Textract, Google Vision, etc.)
    // For now, mark as processed with empty OCR data
    try {
      await pool.query(
        `UPDATE intake_documents
         SET ocr_processed = true, ocr_processed_at = NOW(), ocr_confidence = 0
         WHERE id = $1`,
        [documentId]
      );

      logger.info('Document OCR processing completed', { documentId });
      return true;
    } catch (error: any) {
      logger.error('Document OCR processing failed', { documentId, error: error.message });
      return false;
    }
  }

  // ============================================
  // PATIENT PORTAL ACTIVATION
  // ============================================

  /**
   * Activate patient portal account
   */
  async activatePatientPortal(
    tenantId: string,
    patientId: string,
    email: string
  ): Promise<{ activationToken: string; portalUrl: string }> {
    logger.info('Activating patient portal', { tenantId, patientId });

    // Check if account already exists
    const existingAccount = await pool.query(
      `SELECT id, status FROM patient_portal_accounts
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    if (existingAccount.rows.length > 0) {
      const account = existingAccount.rows[0];
      if (account.status === 'active') {
        throw new Error('Patient portal already activated');
      }
    }

    // Generate activation token
    const activationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7); // 7 days to activate

    if (existingAccount.rows.length > 0) {
      // Update existing pending account
      await pool.query(
        `UPDATE patient_portal_accounts
         SET email = $1, activation_token = $2, activation_token_expires_at = $3, updated_at = NOW()
         WHERE tenant_id = $4 AND patient_id = $5`,
        [email, activationToken, tokenExpiresAt, tenantId, patientId]
      );
    } else {
      // Create new account
      await pool.query(
        `INSERT INTO patient_portal_accounts (
          tenant_id, patient_id, email, status, activation_token, activation_token_expires_at
        ) VALUES ($1, $2, $3, 'pending', $4, $5)`,
        [tenantId, patientId, email, activationToken, tokenExpiresAt]
      );
    }

    // Update patient email if different
    await pool.query(
      `UPDATE patients SET email = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND (email IS NULL OR email != $1)`,
      [email, patientId, tenantId]
    );

    // Get portal URL
    const tenantResult = await pool.query(
      `SELECT portal_url FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const portalBaseUrl = tenantResult.rows[0]?.portal_url || 'https://portal.example.com';
    const portalUrl = `${portalBaseUrl}/activate?token=${activationToken}`;

    // Send activation email (in production)
    logger.info('Portal activation email would be sent', { email, portalUrl });

    // Update intake status
    await pool.query(
      `UPDATE intake_status
       SET portal_activated = false, updated_at = NOW()
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    logger.info('Patient portal activation initiated', { patientId });

    return { activationToken, portalUrl };
  }

  // ============================================
  // INTAKE STATUS TRACKING
  // ============================================

  /**
   * Get intake completion status for patient
   */
  async getIntakeStatus(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<IntakeStatus> {
    logger.info('Getting intake status', { tenantId, patientId, appointmentId });

    // Get or create intake status
    let statusResult = await pool.query(
      `SELECT * FROM intake_status
       WHERE tenant_id = $1 AND patient_id = $2
         AND (appointment_id = $3 OR ($3 IS NULL AND appointment_id IS NULL))
       LIMIT 1`,
      [tenantId, patientId, appointmentId || null]
    );

    if (statusResult.rows.length === 0) {
      await this.initializeIntakeStatus(tenantId, patientId, appointmentId);
      statusResult = await pool.query(
        `SELECT * FROM intake_status
         WHERE tenant_id = $1 AND patient_id = $2
           AND (appointment_id = $3 OR ($3 IS NULL AND appointment_id IS NULL))
         LIMIT 1`,
        [tenantId, patientId, appointmentId || null]
      );
    }

    const status = statusResult.rows[0];

    // Calculate completion percentage
    const completionPercentage = this.calculateCompletionPercentage(status);

    // Determine overall status
    let overallStatus = 'not_started';
    if (completionPercentage === 100) {
      overallStatus = 'complete';
    } else if (completionPercentage > 0) {
      overallStatus = 'in_progress';
    }

    return {
      overallStatus,
      completionPercentage,
      demographicsComplete: status.demographics_complete,
      insuranceComplete: status.insurance_complete,
      medicalHistoryComplete: status.medical_history_complete,
      consentTreatmentSigned: status.consent_treatment_signed,
      consentHipaaSigned: status.consent_hipaa_signed,
      consentPhotoSigned: status.consent_photo_signed,
      insuranceVerified: status.insurance_verified,
      portalActivated: status.portal_activated,
    };
  }

  private calculateCompletionPercentage(status: any): number {
    const requiredItems = [
      status.demographics_complete,
      status.insurance_complete,
      status.medical_history_complete,
      status.consent_treatment_signed,
      status.consent_hipaa_signed,
      status.consent_photo_signed,
    ];

    const completedCount = requiredItems.filter(Boolean).length;
    return Math.round((completedCount / requiredItems.length) * 100);
  }

  private async initializeIntakeStatus(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO intake_status (tenant_id, patient_id, appointment_id, overall_status)
       VALUES ($1, $2, $3, 'not_started')
       ON CONFLICT (tenant_id, patient_id, appointment_id) DO NOTHING`,
      [tenantId, patientId, appointmentId || null]
    );
  }

  private async updateIntakeStatusForForm(
    tenantId: string,
    patientId: string,
    formType: IntakeFormType,
    appointmentId?: string
  ): Promise<void> {
    const fieldMap: Record<string, string> = {
      DEMOGRAPHICS: 'demographics_complete',
      INSURANCE: 'insurance_complete',
      MEDICAL_HISTORY: 'medical_history_complete',
    };

    const field = fieldMap[formType];
    if (field) {
      await this.updateIntakeStatusField(tenantId, patientId, appointmentId, field, true);
    }
  }

  private async updateIntakeStatusForConsent(
    tenantId: string,
    patientId: string,
    consentType: ConsentType,
    appointmentId?: string
  ): Promise<void> {
    const fieldMap: Record<string, string> = {
      CONSENT_TREATMENT: 'consent_treatment_signed',
      CONSENT_HIPAA: 'consent_hipaa_signed',
      CONSENT_PHOTO: 'consent_photo_signed',
    };

    const field = fieldMap[consentType];
    if (field) {
      await this.updateIntakeStatusField(tenantId, patientId, appointmentId, field, true);
    }
  }

  private async updateIntakeStatusForDocument(
    tenantId: string,
    patientId: string,
    documentType: string,
    appointmentId?: string
  ): Promise<void> {
    if (documentType.includes('insurance')) {
      await this.updateIntakeStatusField(tenantId, patientId, appointmentId, 'insurance_cards_uploaded', true);
    } else if (['drivers_license', 'state_id', 'passport'].includes(documentType)) {
      await this.updateIntakeStatusField(tenantId, patientId, appointmentId, 'id_uploaded', true);
    }
  }

  private async updateIntakeStatusField(
    tenantId: string,
    patientId: string,
    appointmentId: string | undefined,
    field: string,
    value: any
  ): Promise<void> {
    await pool.query(
      `UPDATE intake_status
       SET ${field} = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND patient_id = $3
         AND (appointment_id = $4 OR ($4 IS NULL AND appointment_id IS NULL))`,
      [value, tenantId, patientId, appointmentId || null]
    );
  }

  // ============================================
  // WORKFLOW AUTOMATION
  // ============================================

  /**
   * Handle appointment scheduled event - trigger pre-registration workflow
   */
  async onAppointmentScheduled(
    tenantId: string,
    appointmentId: string,
    patientId: string,
    appointmentDate: Date
  ): Promise<void> {
    logger.info('Processing appointment scheduled for intake automation', { appointmentId, patientId });

    // Calculate when to send pre-registration link (3 days before appointment)
    const sendDate = new Date(appointmentDate);
    sendDate.setDate(sendDate.getDate() - 3);

    // If appointment is less than 3 days away, send immediately
    const now = new Date();
    const scheduledFor = sendDate < now ? now : sendDate;

    // Create workflow trigger
    await pool.query(
      `INSERT INTO intake_workflow_triggers (
        tenant_id, trigger_type, appointment_id, patient_id, scheduled_for, status
      ) VALUES ($1, 'send_preregistration_link', $2, $3, $4, 'pending')`,
      [tenantId, appointmentId, patientId, scheduledFor]
    );

    // If scheduled for now, process immediately
    if (scheduledFor <= now) {
      await this.sendPreRegistrationLink(tenantId, patientId, appointmentId, 'both');
    }

    logger.info('Intake workflow trigger created', { appointmentId, scheduledFor });
  }

  /**
   * Handle form completion - check if all required forms are done
   */
  async onFormCompleted(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<{ allComplete: boolean }> {
    const status = await this.getIntakeStatus(tenantId, patientId, appointmentId);

    if (status.completionPercentage === 100) {
      // All forms complete - trigger staff notification
      await this.onAllFormsCompleted(tenantId, patientId, appointmentId);
      return { allComplete: true };
    }

    return { allComplete: false };
  }

  /**
   * Handle all forms completed - notify staff
   */
  async onAllFormsCompleted(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<void> {
    logger.info('All intake forms completed', { patientId, appointmentId });

    // Update intake status
    await pool.query(
      `UPDATE intake_status
       SET overall_status = 'complete', completed_at = NOW(), staff_notified_at = NOW()
       WHERE tenant_id = $1 AND patient_id = $2
         AND (appointment_id = $3 OR ($3 IS NULL AND appointment_id IS NULL))`,
      [tenantId, patientId, appointmentId || null]
    );

    // Get patient info for notification
    const patientResult = await pool.query(
      `SELECT first_name, last_name FROM patients WHERE id = $1`,
      [patientId]
    );

    if (patientResult.rows.length > 0) {
      const patient = patientResult.rows[0];
      logger.info('Staff notification: Patient intake complete', {
        patientName: `${patient.first_name} ${patient.last_name}`,
        patientId,
        appointmentId,
      });

      // In production, send notification via WebSocket, email, Slack, etc.
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get all intake forms for a patient
   */
  async getPatientIntakeForms(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<any[]> {
    let query = `
      SELECT id, form_type, form_data, status, started_at, completed_at, reviewed_at, source
      FROM intake_forms
      WHERE tenant_id = $1 AND patient_id = $2
    `;
    const params: any[] = [tenantId, patientId];

    if (appointmentId) {
      query += ` AND (appointment_id = $3 OR appointment_id IS NULL)`;
      params.push(appointmentId);
    }

    query += ` ORDER BY completed_at DESC, created_at DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get patient consent records
   */
  async getPatientConsents(
    tenantId: string,
    patientId: string
  ): Promise<any[]> {
    const result = await pool.query(
      `SELECT id, consent_type, consent_title, signer_name, signer_relationship,
              signed_at, expires_at, revoked_at
       FROM consent_records
       WHERE tenant_id = $1 AND patient_id = $2
       ORDER BY signed_at DESC`,
      [tenantId, patientId]
    );

    return result.rows;
  }

  /**
   * Validate intake link token
   */
  async validateIntakeToken(token: string): Promise<{ valid: boolean; tenantId?: string; patientId?: string; appointmentId?: string }> {
    const result = await pool.query(
      `SELECT tenant_id, patient_id, appointment_id, status, expires_at
       FROM intake_link_tokens
       WHERE token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const linkToken = result.rows[0];

    if (linkToken.status !== 'active') {
      return { valid: false };
    }

    if (new Date(linkToken.expires_at) < new Date()) {
      // Mark as expired
      await pool.query(
        `UPDATE intake_link_tokens SET status = 'expired' WHERE token = $1`,
        [token]
      );
      return { valid: false };
    }

    return {
      valid: true,
      tenantId: linkToken.tenant_id,
      patientId: linkToken.patient_id,
      appointmentId: linkToken.appointment_id,
    };
  }

  /**
   * Mark intake token as used
   */
  async markIntakeTokenUsed(token: string, ipAddress?: string): Promise<void> {
    await pool.query(
      `UPDATE intake_link_tokens
       SET status = 'used', used_at = NOW(), ip_address = $2
       WHERE token = $1`,
      [token, ipAddress || null]
    );
  }

  // =====================================================
  // EVENT ORCHESTRATION HELPER METHODS
  // =====================================================

  /**
   * Create an intake session and optionally send the link
   * Wrapper for sendPreRegistrationLink for event orchestration
   */
  async createIntakeSession(
    tenantId: string,
    patientId: string,
    options?: {
      appointmentId?: string;
      referralId?: string;
      sendLink?: boolean;
      sendVia?: 'email' | 'sms' | 'both';
    }
  ): Promise<{ sessionId: string; linkSent: boolean; token?: string }> {
    const sessionId = crypto.randomUUID();

    // Initialize intake status
    await this.initializeIntakeStatus(tenantId, patientId, options?.appointmentId);

    // Log session creation
    await pool.query(
      `INSERT INTO intake_sessions (id, tenant_id, patient_id, appointment_id, referral_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [sessionId, tenantId, patientId, options?.appointmentId, options?.referralId]
    );

    let linkSent = false;
    let token: string | undefined;

    if (options?.sendLink) {
      try {
        const result = await this.sendPreRegistrationLink(
          tenantId,
          patientId,
          options.appointmentId,
          options.sendVia || 'both'
        );
        linkSent = result.success;
        token = result.token;
      } catch (error: any) {
        logger.warn('Failed to send intake link', { patientId, error: error.message });
      }
    }

    return { sessionId, linkSent, token };
  }

  /**
   * Send intake link (alias for sendPreRegistrationLink)
   */
  async sendIntakeLink(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<{ success: boolean; linkUrl?: string }> {
    try {
      const result = await this.sendPreRegistrationLink(tenantId, patientId, appointmentId, 'both');
      return { success: result.success, linkUrl: result.linkUrl };
    } catch (error: any) {
      logger.error('Failed to send intake link', { patientId, error: error.message });
      return { success: false };
    }
  }

  /**
   * Check if intake is needed for a patient and trigger if so
   */
  async checkAndTriggerIntake(
    tenantId: string,
    patientId: string,
    appointmentId?: string
  ): Promise<{ intakeNeeded: boolean; triggered: boolean }> {
    // Check if patient has completed intake
    const intakeStatus = await pool.query(
      `SELECT * FROM patient_intake_status
       WHERE tenant_id = $1 AND patient_id = $2`,
      [tenantId, patientId]
    );

    // Check if all forms are completed
    const hasCompletedIntake = intakeStatus.rows[0]?.all_forms_completed || false;

    if (!hasCompletedIntake) {
      await this.createIntakeSession(tenantId, patientId, {
        appointmentId,
        sendLink: true,
      });
      return { intakeNeeded: true, triggered: true };
    }

    return { intakeNeeded: false, triggered: false };
  }
}

// Export singleton instance
export const patientIntakeService = new PatientIntakeService();
