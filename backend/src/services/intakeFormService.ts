/**
 * Intake Form Service
 * Business logic for pre-visit digital intake form system
 * Handles form assignment, progress saving, completion, and chart import
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type FormType = 'new_patient' | 'returning' | 'procedure_specific';
export type AssignmentStatus = 'pending' | 'sent' | 'started' | 'completed' | 'reviewed' | 'imported' | 'expired' | 'cancelled';
export type SendMethod = 'email' | 'sms' | 'both' | 'portal_only';

export interface IntakeTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  formType: FormType;
  procedureType?: string;
  sections: string[];
  version: number;
  isActive: boolean;
  isDefault: boolean;
  sendDaysBeforeAppointment: number;
  dueHoursBeforeAppointment: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntakeSection {
  id: string;
  tenantId: string;
  templateId: string;
  sectionName: string;
  sectionKey: string;
  sectionOrder: number;
  title: string;
  description?: string;
  instructions?: string;
  fields: FieldDefinition[];
  conditionalLogic?: ConditionalLogic;
  isRequired: boolean;
  isRepeatable: boolean;
  maxRepeats?: number;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'checkbox_group' | 'date' | 'phone' | 'email' | 'state_select' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  mask?: string;
  auto_populate?: boolean;
  conditional?: {
    field: string;
    equals: string | boolean;
  };
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface ConditionalLogic {
  show_if?: {
    field: string;
    equals: string | boolean;
  };
}

export interface IntakeAssignment {
  id: string;
  tenantId: string;
  appointmentId?: string;
  patientId: string;
  templateId: string;
  accessToken: string;
  tokenExpiresAt: Date;
  sentAt?: Date;
  dueBy?: Date;
  startedAt?: Date;
  completedAt?: Date;
  reviewedAt?: Date;
  importedAt?: Date;
  status: AssignmentStatus;
  completionPercentage: number;
  sectionsCompleted: number;
  totalSections: number;
  sendMethod: SendMethod;
  reminderSentAt?: Date;
  reminderCount: number;
  reviewedBy?: string;
  reviewNotes?: string;
  flaggedForReview: boolean;
  flagReason?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntakeResponse {
  id: string;
  tenantId: string;
  assignmentId: string;
  sectionId: string;
  fieldResponses: Record<string, unknown>;
  repeatIndex: number;
  isComplete: boolean;
  validationErrors?: Record<string, string>;
  startedAt: Date;
  submittedAt?: Date;
  lastSavedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AssignFormParams {
  tenantId: string;
  appointmentId?: string;
  patientId: string;
  templateId: string;
  dueBy?: Date;
  sendMethod?: SendMethod;
  createdBy?: string;
}

export interface SaveProgressParams {
  assignmentId: string;
  sectionId: string;
  responses: Record<string, unknown>;
  repeatIndex?: number;
  isComplete?: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface ImportToChartResult {
  success: boolean;
  importId: string;
  demographicsUpdated: boolean;
  insuranceUpdated: boolean;
  medicalHistoryUpdated: boolean;
  medicationsUpdated: boolean;
  allergiesUpdated: boolean;
  familyHistoryUpdated: boolean;
  hasConflicts: boolean;
  conflicts?: Record<string, unknown>;
}

// ============================================================================
// INTAKE FORM SERVICE CLASS
// ============================================================================

class IntakeFormService {
  /**
   * Assign a form template to a patient for an appointment
   */
  async assignForm(params: AssignFormParams): Promise<IntakeAssignment> {
    const {
      tenantId,
      appointmentId,
      patientId,
      templateId,
      dueBy,
      sendMethod = 'both',
      createdBy,
    } = params;

    logger.info('Assigning intake form', { tenantId, patientId, templateId, appointmentId });

    // Verify template exists and is active
    const templateResult = await pool.query(
      `SELECT id, due_hours_before_appointment, sections FROM intake_form_templates
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [templateId, tenantId]
    );

    if (templateResult.rows.length === 0) {
      throw new Error('Template not found or inactive');
    }

    const template = templateResult.rows[0];

    // Count sections for this template
    const sectionCountResult = await pool.query(
      `SELECT COUNT(*) as count FROM intake_form_sections WHERE template_id = $1`,
      [templateId]
    );
    const totalSections = parseInt(sectionCountResult.rows[0]?.count || '0');

    // Generate secure access token
    const accessToken = crypto.randomBytes(32).toString('hex');

    // Calculate token expiration and due date
    let tokenExpiresAt: Date;
    let calculatedDueBy: Date;

    if (appointmentId) {
      const apptResult = await pool.query(
        `SELECT start_time FROM appointments WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (apptResult.rows.length > 0) {
        const apptTime = new Date(apptResult.rows[0].start_time);
        // Token expires at appointment time
        tokenExpiresAt = new Date(apptTime);
        // Due by is X hours before appointment
        calculatedDueBy = dueBy || new Date(apptTime.getTime() - (template.due_hours_before_appointment * 60 * 60 * 1000));
      } else {
        // Default: 7 days from now
        tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        calculatedDueBy = dueBy || new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      }
    } else {
      // No appointment: default 7 days
      tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      calculatedDueBy = dueBy || new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    }

    // Create assignment
    const insertResult = await pool.query(
      `INSERT INTO intake_form_assignments (
        tenant_id, appointment_id, patient_id, template_id,
        access_token, token_expires_at, due_by, status,
        total_sections, send_method, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
      RETURNING *`,
      [
        tenantId,
        appointmentId || null,
        patientId,
        templateId,
        accessToken,
        tokenExpiresAt,
        calculatedDueBy,
        totalSections,
        sendMethod,
        createdBy || null,
      ]
    );

    const assignment = this.mapAssignmentRow(insertResult.rows[0]);

    logger.info('Intake form assigned', {
      assignmentId: assignment.id,
      patientId,
      templateId,
    });

    return assignment;
  }

  /**
   * Send form link to patient via email/SMS
   */
  async sendFormLink(
    assignmentId: string,
    tenantId: string
  ): Promise<{ success: boolean; sentVia: string[]; linkUrl: string }> {
    logger.info('Sending intake form link', { assignmentId, tenantId });

    // Get assignment details
    const assignmentResult = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.email, p.cell_phone, t.name as template_name
       FROM intake_form_assignments a
       JOIN patients p ON a.patient_id = p.id
       JOIN intake_form_templates t ON a.template_id = t.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [assignmentId, tenantId]
    );

    if (assignmentResult.rows.length === 0) {
      throw new Error('Assignment not found');
    }

    const assignment = assignmentResult.rows[0];
    const sentVia: string[] = [];

    // Get portal URL from tenant settings
    const tenantResult = await pool.query(
      `SELECT portal_url, name FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const portalBaseUrl = tenantResult.rows[0]?.portal_url || 'https://portal.example.com';
    const tenantName = tenantResult.rows[0]?.name || 'Our Practice';

    const linkUrl = `${portalBaseUrl}/intake/${assignment.access_token}`;

    // Send via configured methods
    const sendMethod = assignment.send_method as SendMethod;

    if ((sendMethod === 'email' || sendMethod === 'both') && assignment.email) {
      // TODO: Integrate with email service
      logger.info('Would send intake form email', {
        to: assignment.email,
        patientName: `${assignment.first_name} ${assignment.last_name}`,
        templateName: assignment.template_name,
        linkUrl,
      });
      sentVia.push('email');
    }

    if ((sendMethod === 'sms' || sendMethod === 'both') && assignment.cell_phone) {
      // TODO: Integrate with SMS service
      logger.info('Would send intake form SMS', {
        to: assignment.cell_phone,
        patientName: `${assignment.first_name}`,
        linkUrl,
      });
      sentVia.push('sms');
    }

    // Update assignment status
    await pool.query(
      `UPDATE intake_form_assignments
       SET status = 'sent', sent_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [assignmentId]
    );

    return {
      success: sentVia.length > 0,
      sentVia,
      linkUrl,
    };
  }

  /**
   * Get form by access token (for patient portal access)
   */
  async getFormByToken(token: string): Promise<{
    valid: boolean;
    assignment?: IntakeAssignment;
    template?: IntakeTemplate;
    sections?: IntakeSection[];
    patientData?: Record<string, unknown>;
    existingResponses?: IntakeResponse[];
  }> {
    // Find assignment by token
    const assignmentResult = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.dob, p.email, p.cell_phone,
              p.address_line1, p.city, p.state, p.zip_code
       FROM intake_form_assignments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.access_token = $1 AND a.token_expires_at > NOW()`,
      [token]
    );

    if (assignmentResult.rows.length === 0) {
      return { valid: false };
    }

    const assignmentRow = assignmentResult.rows[0];

    // Check if form is still accessible
    if (['expired', 'cancelled'].includes(assignmentRow.status)) {
      return { valid: false };
    }

    const assignment = this.mapAssignmentRow(assignmentRow);

    // Get template
    const templateResult = await pool.query(
      `SELECT * FROM intake_form_templates WHERE id = $1`,
      [assignment.templateId]
    );
    const template = templateResult.rows[0] ? this.mapTemplateRow(templateResult.rows[0]) : undefined;

    // Get sections
    const sectionsResult = await pool.query(
      `SELECT * FROM intake_form_sections WHERE template_id = $1 ORDER BY section_order`,
      [assignment.templateId]
    );
    const sections = sectionsResult.rows.map((row) => this.mapSectionRow(row));

    // Get existing responses
    const responsesResult = await pool.query(
      `SELECT * FROM intake_form_responses WHERE assignment_id = $1`,
      [assignment.id]
    );
    const existingResponses = responsesResult.rows.map((row) => this.mapResponseRow(row));

    // Prepare auto-populate data from patient record
    const patientData: Record<string, unknown> = {
      first_name: assignmentRow.first_name,
      last_name: assignmentRow.last_name,
      dob: assignmentRow.dob,
      email: assignmentRow.email,
      cell_phone: assignmentRow.cell_phone,
      address_line1: assignmentRow.address_line1,
      city: assignmentRow.city,
      state: assignmentRow.state,
      zip_code: assignmentRow.zip_code,
    };

    return {
      valid: true,
      assignment,
      template,
      sections,
      patientData,
      existingResponses,
    };
  }

  /**
   * Save progress on a section (auto-save)
   */
  async saveProgress(params: SaveProgressParams): Promise<IntakeResponse> {
    const {
      assignmentId,
      sectionId,
      responses,
      repeatIndex = 0,
      isComplete = false,
      ipAddress,
      userAgent,
    } = params;

    logger.info('Saving intake form progress', { assignmentId, sectionId, isComplete });

    // Get tenant ID from assignment
    const assignmentResult = await pool.query(
      `SELECT tenant_id, status FROM intake_form_assignments WHERE id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      throw new Error('Assignment not found');
    }

    const tenantId = assignmentResult.rows[0].tenant_id;
    const currentStatus = assignmentResult.rows[0].status;

    // Don't allow updates to completed/imported forms
    if (['completed', 'reviewed', 'imported'].includes(currentStatus)) {
      throw new Error('Form has already been submitted');
    }

    // Upsert response
    const upsertResult = await pool.query(
      `INSERT INTO intake_form_responses (
        tenant_id, assignment_id, section_id, field_responses,
        repeat_index, is_complete, ip_address, user_agent, last_saved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (assignment_id, section_id, repeat_index)
      DO UPDATE SET
        field_responses = EXCLUDED.field_responses,
        is_complete = EXCLUDED.is_complete,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        last_saved_at = NOW(),
        submitted_at = CASE WHEN EXCLUDED.is_complete THEN NOW() ELSE intake_form_responses.submitted_at END
      RETURNING *`,
      [
        tenantId,
        assignmentId,
        sectionId,
        JSON.stringify(responses),
        repeatIndex,
        isComplete,
        ipAddress || null,
        userAgent || null,
      ]
    );

    // Note: The trigger will auto-update assignment completion percentage

    return this.mapResponseRow(upsertResult.rows[0]);
  }

  /**
   * Complete and finalize form submission
   */
  async completeForm(
    assignmentId: string,
    tenantId: string
  ): Promise<{ success: boolean; completedAt: Date }> {
    logger.info('Completing intake form', { assignmentId, tenantId });

    // Verify all required sections are complete
    const checkResult = await pool.query(
      `SELECT
        a.total_sections,
        a.sections_completed,
        COUNT(r.id) as response_count,
        SUM(CASE WHEN r.is_complete THEN 1 ELSE 0 END) as complete_count
       FROM intake_form_assignments a
       LEFT JOIN intake_form_responses r ON r.assignment_id = a.id
       WHERE a.id = $1 AND a.tenant_id = $2
       GROUP BY a.id`,
      [assignmentId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Assignment not found');
    }

    const { total_sections, complete_count } = checkResult.rows[0];

    if (parseInt(complete_count) < parseInt(total_sections)) {
      throw new Error(`Please complete all sections. ${complete_count}/${total_sections} sections complete.`);
    }

    // Update assignment to completed
    const updateResult = await pool.query(
      `UPDATE intake_form_assignments
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING completed_at`,
      [assignmentId, tenantId]
    );

    const completedAt = updateResult.rows[0]?.completed_at;

    logger.info('Intake form completed', { assignmentId, completedAt });

    return {
      success: true,
      completedAt,
    };
  }

  /**
   * Import form responses into patient chart
   */
  async importToChart(
    assignmentId: string,
    tenantId: string,
    importedBy: string
  ): Promise<ImportToChartResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      logger.info('Importing intake form to chart', { assignmentId, tenantId, importedBy });

      // Get assignment and responses
      const assignmentResult = await client.query(
        `SELECT a.*, p.id as patient_id
         FROM intake_form_assignments a
         JOIN patients p ON a.patient_id = p.id
         WHERE a.id = $1 AND a.tenant_id = $2 AND a.status = 'completed'`,
        [assignmentId, tenantId]
      );

      if (assignmentResult.rows.length === 0) {
        throw new Error('Assignment not found or not completed');
      }

      const assignment = assignmentResult.rows[0];
      const patientId = assignment.patient_id;

      // Get all responses with section info
      const responsesResult = await client.query(
        `SELECT r.*, s.section_key
         FROM intake_form_responses r
         JOIN intake_form_sections s ON r.section_id = s.id
         WHERE r.assignment_id = $1`,
        [assignmentId]
      );

      const responsesBySection: Record<string, Record<string, unknown>> = {};
      for (const row of responsesResult.rows) {
        responsesBySection[row.section_key] = row.field_responses;
      }

      let demographicsUpdated = false;
      let insuranceUpdated = false;
      let medicalHistoryUpdated = false;
      let medicationsUpdated = false;
      let allergiesUpdated = false;
      let familyHistoryUpdated = false;
      const conflicts: Record<string, unknown> = {};
      const importSummary: Record<string, unknown> = {};

      // Import demographics
      if (responsesBySection['demographics']) {
        const demo = responsesBySection['demographics'] as Record<string, string>;
        await client.query(
          `UPDATE patients SET
            cell_phone = COALESCE($2, cell_phone),
            email = COALESCE($3, email),
            address_line1 = COALESCE($4, address_line1),
            city = COALESCE($5, city),
            state = COALESCE($6, state),
            zip_code = COALESCE($7, zip_code),
            emergency_contact_name = COALESCE($8, emergency_contact_name),
            emergency_contact_phone = COALESCE($9, emergency_contact_phone),
            updated_at = NOW()
           WHERE id = $1`,
          [
            patientId,
            demo['cell_phone'],
            demo['email'],
            demo['address_line1'],
            demo['city'],
            demo['state'],
            demo['zip_code'],
            demo['emergency_contact_name'],
            demo['emergency_contact_phone'],
          ]
        );
        demographicsUpdated = true;
        importSummary['demographics'] = 'Updated contact information';
      }

      // Import allergies
      if (responsesBySection['allergies']) {
        const allergies = responsesBySection['allergies'] as Record<string, unknown>;

        // Drug allergies
        if (allergies['has_drug_allergies'] === 'Yes' && allergies['drug_allergies']) {
          await client.query(
            `INSERT INTO patient_allergies (tenant_id, patient_id, allergy_type, allergen, reaction, source, created_at)
             VALUES ($1, $2, 'drug', $3, 'See intake form', 'patient_intake', NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patientId, allergies['drug_allergies']]
          );
          allergiesUpdated = true;
        }

        // Latex allergy
        if (allergies['latex_allergy'] === 'Yes') {
          await client.query(
            `INSERT INTO patient_allergies (tenant_id, patient_id, allergy_type, allergen, reaction, source, created_at)
             VALUES ($1, $2, 'environmental', 'Latex', 'Allergy', 'patient_intake', NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patientId]
          );
          allergiesUpdated = true;
        }

        // Adhesive allergy
        if (allergies['adhesive_allergy'] === 'Yes') {
          await client.query(
            `INSERT INTO patient_allergies (tenant_id, patient_id, allergy_type, allergen, reaction, source, created_at)
             VALUES ($1, $2, 'environmental', 'Adhesive/Tape', 'Allergy', 'patient_intake', NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patientId]
          );
          allergiesUpdated = true;
        }

        if (allergiesUpdated) {
          importSummary['allergies'] = 'Allergies imported';
        }
      }

      // Import medical history
      if (responsesBySection['medical_history']) {
        const history = responsesBySection['medical_history'] as Record<string, unknown>;

        // Store conditions
        if (Array.isArray(history['conditions'])) {
          for (const condition of history['conditions']) {
            if (condition !== 'None of the above') {
              await client.query(
                `INSERT INTO patient_conditions (tenant_id, patient_id, condition_name, status, source, created_at)
                 VALUES ($1, $2, $3, 'active', 'patient_intake', NOW())
                 ON CONFLICT DO NOTHING`,
                [tenantId, patientId, condition]
              );
            }
          }
          medicalHistoryUpdated = true;
          importSummary['medical_history'] = 'Conditions imported';
        }
      }

      // Import family history
      if (responsesBySection['family_history']) {
        const famHistory = responsesBySection['family_history'] as Record<string, unknown>;

        if (famHistory['family_skin_cancer'] === 'Yes' || famHistory['family_melanoma'] === 'Yes') {
          await client.query(
            `INSERT INTO patient_family_history (tenant_id, patient_id, condition, relationship, notes, source, created_at)
             VALUES ($1, $2, $3, $4, $5, 'patient_intake', NOW())
             ON CONFLICT DO NOTHING`,
            [
              tenantId,
              patientId,
              famHistory['family_melanoma'] === 'Yes' ? 'Melanoma' : 'Skin Cancer',
              famHistory['family_skin_cancer_relation'] || 'Family member',
              JSON.stringify(famHistory['family_skin_cancer_types'] || []),
            ]
          );
          familyHistoryUpdated = true;
          importSummary['family_history'] = 'Family history imported';
        }
      }

      // Create import record
      const importResult = await client.query(
        `INSERT INTO intake_form_imports (
          tenant_id, assignment_id, imported_by,
          demographics_updated, insurance_updated, medical_history_updated,
          medications_updated, allergies_updated, family_history_updated,
          import_summary, has_conflicts, conflicts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          tenantId,
          assignmentId,
          importedBy,
          demographicsUpdated,
          insuranceUpdated,
          medicalHistoryUpdated,
          medicationsUpdated,
          allergiesUpdated,
          familyHistoryUpdated,
          JSON.stringify(importSummary),
          Object.keys(conflicts).length > 0,
          Object.keys(conflicts).length > 0 ? JSON.stringify(conflicts) : null,
        ]
      );

      // Update assignment status
      await client.query(
        `UPDATE intake_form_assignments
         SET status = 'imported', imported_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [assignmentId]
      );

      await client.query('COMMIT');

      logger.info('Intake form imported to chart', {
        assignmentId,
        importId: importResult.rows[0]?.id,
        patientId,
      });

      return {
        success: true,
        importId: importResult.rows[0]?.id,
        demographicsUpdated,
        insuranceUpdated,
        medicalHistoryUpdated,
        medicationsUpdated,
        allergiesUpdated,
        familyHistoryUpdated,
        hasConflicts: Object.keys(conflicts).length > 0,
        conflicts: Object.keys(conflicts).length > 0 ? conflicts : undefined,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get completion status for an appointment
   */
  async getCompletionStatus(
    appointmentId: string,
    tenantId: string
  ): Promise<{
    hasAssignment: boolean;
    assignment?: IntakeAssignment;
    isComplete: boolean;
    completionPercentage: number;
    isOverdue: boolean;
    sectionsSummary?: Array<{ sectionName: string; isComplete: boolean }>;
  }> {
    const assignmentResult = await pool.query(
      `SELECT a.*, t.name as template_name
       FROM intake_form_assignments a
       JOIN intake_form_templates t ON a.template_id = t.id
       WHERE a.appointment_id = $1 AND a.tenant_id = $2
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [appointmentId, tenantId]
    );

    if (assignmentResult.rows.length === 0) {
      return {
        hasAssignment: false,
        isComplete: false,
        completionPercentage: 0,
        isOverdue: false,
      };
    }

    const assignment = this.mapAssignmentRow(assignmentResult.rows[0]);

    // Get section completion details
    const sectionsResult = await pool.query(
      `SELECT s.section_name, COALESCE(r.is_complete, false) as is_complete
       FROM intake_form_sections s
       LEFT JOIN intake_form_responses r ON r.section_id = s.id AND r.assignment_id = $1
       WHERE s.template_id = $2
       ORDER BY s.section_order`,
      [assignment.id, assignment.templateId]
    );

    const sectionsSummary = sectionsResult.rows.map((row) => ({
      sectionName: row.section_name,
      isComplete: row.is_complete,
    }));

    const isOverdue = assignment.dueBy ? new Date(assignment.dueBy) < new Date() : false;

    return {
      hasAssignment: true,
      assignment,
      isComplete: assignment.status === 'completed' || assignment.status === 'imported',
      completionPercentage: assignment.completionPercentage,
      isOverdue: isOverdue && !['completed', 'imported'].includes(assignment.status),
      sectionsSummary,
    };
  }

  /**
   * Get all templates for a tenant
   */
  async getTemplates(tenantId: string, activeOnly = true): Promise<IntakeTemplate[]> {
    let query = `SELECT * FROM intake_form_templates WHERE tenant_id = $1`;
    if (activeOnly) {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY form_type, name`;

    const result = await pool.query(query, [tenantId]);
    return result.rows.map((row) => this.mapTemplateRow(row));
  }

  /**
   * Get pending assignments for today's appointments
   */
  async getPendingAssignments(
    tenantId: string,
    options?: { date?: string; limit?: number; offset?: number }
  ): Promise<{ assignments: IntakeAssignment[]; total: number }> {
    const { date, limit = 50, offset = 0 } = options || {};

    let dateFilter = '';
    const params: (string | number)[] = [tenantId, limit, offset];

    if (date) {
      dateFilter = `AND DATE(app.start_time) = $4`;
      params.push(date);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM intake_form_assignments a
       LEFT JOIN appointments app ON a.appointment_id = app.id
       WHERE a.tenant_id = $1
         AND a.status IN ('pending', 'sent', 'started')
         ${dateFilter}`,
      date ? [tenantId, date] : [tenantId]
    );

    const result = await pool.query(
      `SELECT a.*, p.first_name, p.last_name, p.mrn, app.start_time as appointment_time
       FROM intake_form_assignments a
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN appointments app ON a.appointment_id = app.id
       WHERE a.tenant_id = $1
         AND a.status IN ('pending', 'sent', 'started')
         ${dateFilter}
       ORDER BY app.start_time ASC NULLS LAST, a.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    return {
      assignments: result.rows.map((row) => this.mapAssignmentRow(row)),
      total: parseInt(countResult.rows[0]?.total || '0'),
    };
  }

  /**
   * Create default template for a tenant
   */
  async createDefaultTemplate(
    tenantId: string,
    formType: FormType,
    createdBy?: string
  ): Promise<IntakeTemplate> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const name = formType === 'new_patient'
        ? 'New Patient Intake Form'
        : formType === 'returning'
          ? 'Returning Patient Update Form'
          : 'Procedure Pre-Visit Form';

      const description = formType === 'new_patient'
        ? 'Comprehensive intake form for new patients including demographics, medical history, and dermatology-specific questions'
        : formType === 'returning'
          ? 'Quick update form for returning patients to confirm current information'
          : 'Pre-procedure questionnaire for specific dermatology procedures';

      // Create template
      const templateResult = await client.query(
        `INSERT INTO intake_form_templates (
          tenant_id, name, description, form_type, is_active, is_default, created_by
        ) VALUES ($1, $2, $3, $4, true, true, $5)
        RETURNING *`,
        [tenantId, name, description, formType, createdBy || null]
      );

      const templateId = templateResult.rows[0]?.id;

      // Seed default sections using the database function
      await client.query(`SELECT seed_default_intake_sections($1, $2)`, [tenantId, templateId]);

      await client.query('COMMIT');

      return this.mapTemplateRow(templateResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // MAPPING HELPERS
  // ============================================================================

  private mapTemplateRow(row: Record<string, unknown>): IntakeTemplate {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      formType: row.form_type as FormType,
      procedureType: row.procedure_type as string | undefined,
      sections: row.sections as string[],
      version: row.version as number,
      isActive: row.is_active as boolean,
      isDefault: row.is_default as boolean,
      sendDaysBeforeAppointment: row.send_days_before_appointment as number,
      dueHoursBeforeAppointment: row.due_hours_before_appointment as number,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  private mapSectionRow(row: Record<string, unknown>): IntakeSection {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      templateId: row.template_id as string,
      sectionName: row.section_name as string,
      sectionKey: row.section_key as string,
      sectionOrder: row.section_order as number,
      title: row.title as string,
      description: row.description as string | undefined,
      instructions: row.instructions as string | undefined,
      fields: row.fields as FieldDefinition[],
      conditionalLogic: row.conditional_logic as ConditionalLogic | undefined,
      isRequired: row.is_required as boolean,
      isRepeatable: row.is_repeatable as boolean,
      maxRepeats: row.max_repeats as number | undefined,
    };
  }

  private mapAssignmentRow(row: Record<string, unknown>): IntakeAssignment {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      appointmentId: row.appointment_id as string | undefined,
      patientId: row.patient_id as string,
      templateId: row.template_id as string,
      accessToken: row.access_token as string,
      tokenExpiresAt: row.token_expires_at as Date,
      sentAt: row.sent_at as Date | undefined,
      dueBy: row.due_by as Date | undefined,
      startedAt: row.started_at as Date | undefined,
      completedAt: row.completed_at as Date | undefined,
      reviewedAt: row.reviewed_at as Date | undefined,
      importedAt: row.imported_at as Date | undefined,
      status: row.status as AssignmentStatus,
      completionPercentage: row.completion_percentage as number,
      sectionsCompleted: row.sections_completed as number,
      totalSections: row.total_sections as number,
      sendMethod: row.send_method as SendMethod,
      reminderSentAt: row.reminder_sent_at as Date | undefined,
      reminderCount: row.reminder_count as number,
      reviewedBy: row.reviewed_by as string | undefined,
      reviewNotes: row.review_notes as string | undefined,
      flaggedForReview: row.flagged_for_review as boolean,
      flagReason: row.flag_reason as string | undefined,
      createdBy: row.created_by as string | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  private mapResponseRow(row: Record<string, unknown>): IntakeResponse {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      assignmentId: row.assignment_id as string,
      sectionId: row.section_id as string,
      fieldResponses: row.field_responses as Record<string, unknown>,
      repeatIndex: row.repeat_index as number,
      isComplete: row.is_complete as boolean,
      validationErrors: row.validation_errors as Record<string, string> | undefined,
      startedAt: row.started_at as Date,
      submittedAt: row.submitted_at as Date | undefined,
      lastSavedAt: row.last_saved_at as Date,
      ipAddress: row.ip_address as string | undefined,
      userAgent: row.user_agent as string | undefined,
    };
  }
}

export const intakeFormService = new IntakeFormService();
