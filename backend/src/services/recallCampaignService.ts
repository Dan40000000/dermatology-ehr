import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { createAuditLog } from './audit';
import { logger } from '../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export type RecallType =
  | 'annual_skin_check'
  | 'melanoma_surveillance'
  | 'follow_up_visit'
  | 'treatment_continuation'
  | 'lab_recheck'
  | 'prescription_renewal'
  | 'post_procedure_check'
  | 'psoriasis_follow_up'
  | 'acne_follow_up'
  | 'inactive_patients'
  | 'custom';

export interface RecallCampaignConfig {
  name: string;
  description?: string;
  recallType: RecallType;
  targetCriteria: TargetCriteria;
  messageTemplate?: string;
  messageTemplateSms?: string;
  messageTemplateEmail?: string;
  channel?: 'sms' | 'email' | 'phone' | 'mail' | 'portal' | 'multi';
  frequencyDays?: number;
  maxAttempts?: number;
  isActive?: boolean;
  autoIdentify?: boolean;
  identifySchedule?: string;
}

export interface TargetCriteria {
  lastVisitDaysAgo?: { min?: number; max?: number };
  diagnoses?: string[];  // ICD-10 codes with wildcards
  procedures?: string[];  // CPT codes
  proceduresWithinDays?: number;
  medications?: string[];
  ageRange?: { min?: number; max?: number };
  riskLevel?: string[];
  appointmentTypes?: string[];
  labsDueDaysAgo?: { min?: number; max?: number };
  labTypes?: string[];
  prescriptionExpiringDays?: number;
  customQuery?: string;  // For advanced users
}

export interface RecallCampaign {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  recallType: RecallType;
  targetCriteria: TargetCriteria;
  messageTemplate: string | null;
  messageTemplateSms: string | null;
  messageTemplateEmail: string | null;
  channel: string;
  frequencyDays: number;
  maxAttempts: number;
  isActive: boolean;
  autoIdentify: boolean;
  identifySchedule: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecallPatient {
  id: string;
  tenantId: string;
  campaignId: string;
  patientId: string;
  reason: string;
  dueDate: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'contacted' | 'scheduled' | 'completed' | 'declined' | 'unable_to_reach' | 'dismissed';
  lastContactAt: string | null;
  nextContactAt: string | null;
  contactAttempts: number;
  scheduledAppointmentId: string | null;
  completedAt: string | null;
  dismissedReason: string | null;
  source: 'auto' | 'manual' | 'import';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  patientFirstName?: string;
  patientLastName?: string;
  patientPhone?: string;
  patientEmail?: string;
  campaignName?: string;
}

export interface RecallContactLog {
  id: string;
  tenantId: string;
  recallPatientId: string;
  channel: 'sms' | 'email' | 'phone' | 'mail' | 'portal';
  messageSent: string | null;
  sentAt: string;
  response: string | null;
  respondedAt: string | null;
  responseNotes: string | null;
  sentBy: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  externalMessageId: string | null;
}

export interface RecallDashboard {
  totalCampaigns: number;
  activeCampaigns: number;
  totalPending: number;
  totalContacted: number;
  totalScheduled: number;
  totalCompleted: number;
  overallConversionRate: number;
  byCampaign: Array<{
    campaignId: string;
    campaignName: string;
    recallType: string;
    pending: number;
    contacted: number;
    scheduled: number;
    completed: number;
    conversionRate: number;
  }>;
  dueToday: number;
  overdueCount: number;
}

// ============================================================================
// RECALL CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * Create a recall campaign
 */
export async function createRecallCampaign(
  tenantId: string,
  config: RecallCampaignConfig,
  createdBy?: string
): Promise<RecallCampaign> {
  const id = randomUUID();

  const result = await pool.query<RecallCampaign>(
    `INSERT INTO recall_campaigns_v2 (
      id, tenant_id, name, description, recall_type, target_criteria,
      message_template, message_template_sms, message_template_email,
      channel, frequency_days, max_attempts, is_active, auto_identify,
      identify_schedule, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING
      id,
      tenant_id as "tenantId",
      name,
      description,
      recall_type as "recallType",
      target_criteria as "targetCriteria",
      message_template as "messageTemplate",
      message_template_sms as "messageTemplateSms",
      message_template_email as "messageTemplateEmail",
      channel,
      frequency_days as "frequencyDays",
      max_attempts as "maxAttempts",
      is_active as "isActive",
      auto_identify as "autoIdentify",
      identify_schedule as "identifySchedule",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      config.name,
      config.description || null,
      config.recallType,
      JSON.stringify(config.targetCriteria),
      config.messageTemplate || null,
      config.messageTemplateSms || null,
      config.messageTemplateEmail || null,
      config.channel || 'sms',
      config.frequencyDays || 14,
      config.maxAttempts || 3,
      config.isActive ?? true,
      config.autoIdentify ?? false,
      config.identifySchedule || null,
      createdBy || null,
    ]
  );

  await createAuditLog({
    tenantId,
    userId: createdBy || 'system',
    action: 'recall_campaign_created',
    resourceType: 'recall_campaign',
    resourceId: id,
    metadata: { name: config.name, recallType: config.recallType },
    severity: 'info',
    status: 'success',
  });

  logger.info('Recall campaign created', {
    tenantId,
    campaignId: id,
    name: config.name,
    recallType: config.recallType,
  });

  return result.rows[0]!;
}

/**
 * Update a recall campaign
 */
export async function updateRecallCampaign(
  tenantId: string,
  campaignId: string,
  updates: Partial<RecallCampaignConfig>
): Promise<RecallCampaign | null> {
  const setClauses: string[] = [];
  const params: any[] = [campaignId, tenantId];
  let paramCount = 2;

  if (updates.name !== undefined) {
    paramCount++;
    setClauses.push(`name = $${paramCount}`);
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    paramCount++;
    setClauses.push(`description = $${paramCount}`);
    params.push(updates.description);
  }
  if (updates.targetCriteria !== undefined) {
    paramCount++;
    setClauses.push(`target_criteria = $${paramCount}`);
    params.push(JSON.stringify(updates.targetCriteria));
  }
  if (updates.messageTemplate !== undefined) {
    paramCount++;
    setClauses.push(`message_template = $${paramCount}`);
    params.push(updates.messageTemplate);
  }
  if (updates.messageTemplateSms !== undefined) {
    paramCount++;
    setClauses.push(`message_template_sms = $${paramCount}`);
    params.push(updates.messageTemplateSms);
  }
  if (updates.messageTemplateEmail !== undefined) {
    paramCount++;
    setClauses.push(`message_template_email = $${paramCount}`);
    params.push(updates.messageTemplateEmail);
  }
  if (updates.channel !== undefined) {
    paramCount++;
    setClauses.push(`channel = $${paramCount}`);
    params.push(updates.channel);
  }
  if (updates.frequencyDays !== undefined) {
    paramCount++;
    setClauses.push(`frequency_days = $${paramCount}`);
    params.push(updates.frequencyDays);
  }
  if (updates.maxAttempts !== undefined) {
    paramCount++;
    setClauses.push(`max_attempts = $${paramCount}`);
    params.push(updates.maxAttempts);
  }
  if (updates.isActive !== undefined) {
    paramCount++;
    setClauses.push(`is_active = $${paramCount}`);
    params.push(updates.isActive);
  }
  if (updates.autoIdentify !== undefined) {
    paramCount++;
    setClauses.push(`auto_identify = $${paramCount}`);
    params.push(updates.autoIdentify);
  }
  if (updates.identifySchedule !== undefined) {
    paramCount++;
    setClauses.push(`identify_schedule = $${paramCount}`);
    params.push(updates.identifySchedule);
  }

  if (setClauses.length === 0) {
    return null;
  }

  const result = await pool.query<RecallCampaign>(
    `UPDATE recall_campaigns_v2
     SET ${setClauses.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING
      id,
      tenant_id as "tenantId",
      name,
      description,
      recall_type as "recallType",
      target_criteria as "targetCriteria",
      message_template as "messageTemplate",
      message_template_sms as "messageTemplateSms",
      message_template_email as "messageTemplateEmail",
      channel,
      frequency_days as "frequencyDays",
      max_attempts as "maxAttempts",
      is_active as "isActive",
      auto_identify as "autoIdentify",
      identify_schedule as "identifySchedule",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    params
  );

  return result.rows[0] || null;
}

/**
 * Get a campaign by ID
 */
export async function getRecallCampaign(
  tenantId: string,
  campaignId: string
): Promise<RecallCampaign | null> {
  const result = await pool.query<RecallCampaign>(
    `SELECT
      id,
      tenant_id as "tenantId",
      name,
      description,
      recall_type as "recallType",
      target_criteria as "targetCriteria",
      message_template as "messageTemplate",
      message_template_sms as "messageTemplateSms",
      message_template_email as "messageTemplateEmail",
      channel,
      frequency_days as "frequencyDays",
      max_attempts as "maxAttempts",
      is_active as "isActive",
      auto_identify as "autoIdentify",
      identify_schedule as "identifySchedule",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM recall_campaigns_v2
    WHERE id = $1 AND tenant_id = $2`,
    [campaignId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * List campaigns
 */
export async function listRecallCampaigns(
  tenantId: string,
  activeOnly: boolean = false
): Promise<RecallCampaign[]> {
  const query = activeOnly
    ? `SELECT
        id,
        tenant_id as "tenantId",
        name,
        description,
        recall_type as "recallType",
        target_criteria as "targetCriteria",
        message_template as "messageTemplate",
        message_template_sms as "messageTemplateSms",
        message_template_email as "messageTemplateEmail",
        channel,
        frequency_days as "frequencyDays",
        max_attempts as "maxAttempts",
        is_active as "isActive",
        auto_identify as "autoIdentify",
        identify_schedule as "identifySchedule",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM recall_campaigns_v2
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY name ASC`
    : `SELECT
        id,
        tenant_id as "tenantId",
        name,
        description,
        recall_type as "recallType",
        target_criteria as "targetCriteria",
        message_template as "messageTemplate",
        message_template_sms as "messageTemplateSms",
        message_template_email as "messageTemplateEmail",
        channel,
        frequency_days as "frequencyDays",
        max_attempts as "maxAttempts",
        is_active as "isActive",
        auto_identify as "autoIdentify",
        identify_schedule as "identifySchedule",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM recall_campaigns_v2
      WHERE tenant_id = $1
      ORDER BY is_active DESC, name ASC`;

  const result = await pool.query<RecallCampaign>(query, [tenantId]);
  return result.rows;
}

// ============================================================================
// PATIENT RECALL IDENTIFICATION
// ============================================================================

/**
 * Build dynamic query based on campaign criteria
 */
function buildCriteriaQuery(
  tenantId: string,
  criteria: TargetCriteria,
  campaignId: string
): { query: string; params: any[] } {
  const conditions: string[] = ['p.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramCount = 1;

  // Last visit criteria
  if (criteria.lastVisitDaysAgo) {
    if (criteria.lastVisitDaysAgo.min !== undefined) {
      paramCount++;
      conditions.push(`
        COALESCE((
          SELECT MAX(e.encounter_date)
          FROM encounters e
          WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id
        ), p.created_at::date) < CURRENT_DATE - INTERVAL '1 day' * $${paramCount}
      `);
      params.push(criteria.lastVisitDaysAgo.min);
    }
    if (criteria.lastVisitDaysAgo.max !== undefined) {
      paramCount++;
      conditions.push(`
        COALESCE((
          SELECT MAX(e.encounter_date)
          FROM encounters e
          WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id
        ), p.created_at::date) > CURRENT_DATE - INTERVAL '1 day' * $${paramCount}
      `);
      params.push(criteria.lastVisitDaysAgo.max);
    }
  }

  // Diagnoses criteria (ICD-10 codes with LIKE support)
  if (criteria.diagnoses && criteria.diagnoses.length > 0) {
    const diagnosisConditions = criteria.diagnoses.map((code: string) => {
      paramCount++;
      params.push(code.replace('%', ''));
      return `d.icd10_code LIKE $${paramCount} || '%'`;
    });
    conditions.push(`
      EXISTS (
        SELECT 1 FROM diagnoses d
        WHERE d.patient_id = p.id
          AND d.tenant_id = p.tenant_id
          AND (${diagnosisConditions.join(' OR ')})
      )
    `);
  }

  // Procedures criteria
  if (criteria.procedures && criteria.procedures.length > 0) {
    paramCount++;
    params.push(criteria.procedures);
    const withinDays = criteria.proceduresWithinDays || 365;
    paramCount++;
    params.push(withinDays);
    conditions.push(`
      EXISTS (
        SELECT 1 FROM charges c
        WHERE c.patient_id = p.id
          AND c.tenant_id = p.tenant_id
          AND c.cpt_code = ANY($${paramCount - 1}::text[])
          AND c.service_date >= CURRENT_DATE - INTERVAL '1 day' * $${paramCount}
      )
    `);
  }

  // Age range
  if (criteria.ageRange) {
    if (criteria.ageRange.min !== undefined) {
      paramCount++;
      conditions.push(`
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) >= $${paramCount}
      `);
      params.push(criteria.ageRange.min);
    }
    if (criteria.ageRange.max !== undefined) {
      paramCount++;
      conditions.push(`
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) <= $${paramCount}
      `);
      params.push(criteria.ageRange.max);
    }
  }

  // Exclude patients already in this campaign with active status
  paramCount++;
  conditions.push(`
    NOT EXISTS (
      SELECT 1 FROM recall_patients rp
      WHERE rp.patient_id = p.id
        AND rp.campaign_id = $${paramCount}
        AND rp.status IN ('pending', 'contacted', 'scheduled')
    )
  `);
  params.push(campaignId);

  // Exclude inactive patients
  conditions.push(`p.is_active = TRUE`);

  const query = `
    SELECT
      p.id as patient_id,
      p.first_name,
      p.last_name,
      p.phone,
      p.email,
      (
        SELECT MAX(e.encounter_date)
        FROM encounters e
        WHERE e.patient_id = p.id AND e.tenant_id = p.tenant_id
      ) as last_visit_date
    FROM patients p
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.last_name, p.first_name
    LIMIT 1000
  `;

  return { query, params };
}

/**
 * Identify patients matching campaign criteria
 */
export async function identifyRecallPatients(
  tenantId: string,
  campaignId: string
): Promise<{
  identified: number;
  created: number;
  skipped: number;
  errors: string[];
}> {
  const campaign = await getRecallCampaign(tenantId, campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const { query, params } = buildCriteriaQuery(tenantId, campaign.targetCriteria, campaignId);

  const result = await pool.query(query, params);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of result.rows) {
    try {
      // Calculate due date based on recall type
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Default 7 days from now

      await addPatientToRecall(
        tenantId,
        campaignId,
        row.patient_id,
        `${campaign.recallType}: Last visit ${row.last_visit_date || 'unknown'}`,
        dueDate.toISOString().split('T')[0]!,
        'normal',
        'auto'
      );
      created++;
    } catch (error: any) {
      if (error.message.includes('duplicate')) {
        skipped++;
      } else {
        errors.push(`Patient ${row.patient_id}: ${error.message}`);
      }
    }
  }

  logger.info('Recall patients identified', {
    tenantId,
    campaignId,
    identified: result.rows.length,
    created,
    skipped,
    errors: errors.length,
  });

  return {
    identified: result.rows.length,
    created,
    skipped,
    errors,
  };
}

/**
 * Add a patient to recall (manual or auto)
 */
export async function addPatientToRecall(
  tenantId: string,
  campaignId: string,
  patientId: string,
  reason: string,
  dueDate: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
  source: 'auto' | 'manual' | 'import' = 'manual',
  notes?: string,
  createdBy?: string
): Promise<RecallPatient> {
  const id = randomUUID();

  const result = await pool.query<RecallPatient>(
    `INSERT INTO recall_patients (
      id, tenant_id, campaign_id, patient_id, reason, due_date,
      priority, source, notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING
      id,
      tenant_id as "tenantId",
      campaign_id as "campaignId",
      patient_id as "patientId",
      reason,
      due_date as "dueDate",
      priority,
      status,
      last_contact_at as "lastContactAt",
      next_contact_at as "nextContactAt",
      contact_attempts as "contactAttempts",
      scheduled_appointment_id as "scheduledAppointmentId",
      completed_at as "completedAt",
      dismissed_reason as "dismissedReason",
      source,
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      campaignId,
      patientId,
      reason,
      dueDate,
      priority,
      source,
      notes || null,
      createdBy || null,
    ]
  );

  return result.rows[0]!;
}

// ============================================================================
// RECALL OUTREACH
// ============================================================================

/**
 * Process recall outreach for a campaign
 */
export async function processRecallOutreach(
  tenantId: string,
  campaignId: string,
  limit: number = 50
): Promise<{
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}> {
  const campaign = await getRecallCampaign(tenantId, campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get patients due for contact
  const result = await pool.query(
    `SELECT
      rp.id,
      rp.patient_id,
      rp.contact_attempts,
      p.first_name,
      p.last_name,
      p.phone,
      p.email
    FROM recall_patients rp
    JOIN patients p ON rp.patient_id = p.id
    WHERE rp.campaign_id = $1
      AND rp.tenant_id = $2
      AND rp.status IN ('pending', 'contacted')
      AND rp.contact_attempts < $3
      AND (rp.next_contact_at IS NULL OR rp.next_contact_at <= NOW())
    ORDER BY rp.due_date ASC, rp.created_at ASC
    LIMIT $4`,
    [campaignId, tenantId, campaign.maxAttempts, limit]
  );

  let successful = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of result.rows) {
    try {
      // Log the contact attempt
      await recordRecallContact(
        tenantId,
        row.id,
        campaign.channel as any,
        campaign.messageTemplateSms || campaign.messageTemplate || 'Recall message sent',
        'system'
      );

      // Update patient status
      const nextContactDate = new Date();
      nextContactDate.setDate(nextContactDate.getDate() + campaign.frequencyDays);

      await pool.query(
        `UPDATE recall_patients
         SET status = 'contacted',
             last_contact_at = NOW(),
             next_contact_at = $3,
             contact_attempts = contact_attempts + 1
         WHERE id = $1 AND tenant_id = $2`,
        [row.id, tenantId, nextContactDate.toISOString()]
      );

      successful++;
    } catch (error: any) {
      failed++;
      errors.push(`Patient ${row.patient_id}: ${error.message}`);
    }
  }

  logger.info('Recall outreach processed', {
    tenantId,
    campaignId,
    processed: result.rows.length,
    successful,
    failed,
  });

  return {
    processed: result.rows.length,
    successful,
    failed,
    errors,
  };
}

/**
 * Record a recall contact attempt
 */
export async function recordRecallContact(
  tenantId: string,
  recallPatientId: string,
  channel: 'sms' | 'email' | 'phone' | 'mail' | 'portal',
  message: string,
  sentBy?: string,
  response?: string,
  responseNotes?: string
): Promise<RecallContactLog> {
  const id = randomUUID();

  const result = await pool.query<RecallContactLog>(
    `INSERT INTO recall_contact_log (
      id, tenant_id, recall_patient_id, channel, message_sent,
      sent_by, response, response_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      tenant_id as "tenantId",
      recall_patient_id as "recallPatientId",
      channel,
      message_sent as "messageSent",
      sent_at as "sentAt",
      response,
      responded_at as "respondedAt",
      response_notes as "responseNotes",
      sent_by as "sentBy",
      delivery_status as "deliveryStatus",
      delivery_error as "deliveryError",
      external_message_id as "externalMessageId"`,
    [
      id,
      tenantId,
      recallPatientId,
      channel,
      message,
      sentBy || null,
      response || null,
      responseNotes || null,
    ]
  );

  return result.rows[0]!;
}

/**
 * Record a patient's response to recall
 */
export async function recordRecallResponse(
  tenantId: string,
  recallPatientId: string,
  response: 'scheduled' | 'declined' | 'call_back_requested',
  responseNotes?: string
): Promise<RecallPatient | null> {
  let newStatus: string;
  switch (response) {
    case 'scheduled':
      newStatus = 'scheduled';
      break;
    case 'declined':
      newStatus = 'declined';
      break;
    default:
      newStatus = 'contacted';
  }

  const result = await pool.query<RecallPatient>(
    `UPDATE recall_patients
     SET status = $3,
         notes = COALESCE(notes || E'\\n', '') || $4
     WHERE id = $1 AND tenant_id = $2
     RETURNING
      id,
      tenant_id as "tenantId",
      campaign_id as "campaignId",
      patient_id as "patientId",
      reason,
      due_date as "dueDate",
      priority,
      status,
      last_contact_at as "lastContactAt",
      next_contact_at as "nextContactAt",
      contact_attempts as "contactAttempts",
      scheduled_appointment_id as "scheduledAppointmentId",
      completed_at as "completedAt",
      dismissed_reason as "dismissedReason",
      source,
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      recallPatientId,
      tenantId,
      newStatus,
      responseNotes ? `Response (${response}): ${responseNotes}` : `Response: ${response}`,
    ]
  );

  return result.rows[0] || null;
}

/**
 * Schedule a recall appointment
 */
export async function scheduleRecallAppointment(
  tenantId: string,
  recallPatientId: string,
  appointmentId: string
): Promise<RecallPatient | null> {
  const result = await pool.query<RecallPatient>(
    `UPDATE recall_patients
     SET status = 'scheduled',
         scheduled_appointment_id = $3
     WHERE id = $1 AND tenant_id = $2
     RETURNING
      id,
      tenant_id as "tenantId",
      campaign_id as "campaignId",
      patient_id as "patientId",
      reason,
      due_date as "dueDate",
      priority,
      status,
      last_contact_at as "lastContactAt",
      next_contact_at as "nextContactAt",
      contact_attempts as "contactAttempts",
      scheduled_appointment_id as "scheduledAppointmentId",
      completed_at as "completedAt",
      dismissed_reason as "dismissedReason",
      source,
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [recallPatientId, tenantId, appointmentId]
  );

  if (result.rows[0]) {
    logger.info('Recall appointment scheduled', {
      tenantId,
      recallPatientId,
      appointmentId,
    });
  }

  return result.rows[0] || null;
}

// ============================================================================
// RECALL DASHBOARD & HISTORY
// ============================================================================

/**
 * Get recall dashboard metrics
 */
export async function getRecallDashboard(tenantId: string): Promise<RecallDashboard> {
  // Get campaign counts
  const campaignStats = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = TRUE) as active
    FROM recall_campaigns_v2
    WHERE tenant_id = $1`,
    [tenantId]
  );

  // Get overall patient stats
  const patientStats = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE due_date = CURRENT_DATE AND status IN ('pending', 'contacted')) as due_today,
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status IN ('pending', 'contacted')) as overdue
    FROM recall_patients
    WHERE tenant_id = $1`,
    [tenantId]
  );

  // Get by-campaign breakdown
  const byCampaign = await pool.query(
    `SELECT
      rc.id as "campaignId",
      rc.name as "campaignName",
      rc.recall_type as "recallType",
      COUNT(*) FILTER (WHERE rp.status = 'pending') as pending,
      COUNT(*) FILTER (WHERE rp.status = 'contacted') as contacted,
      COUNT(*) FILTER (WHERE rp.status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE rp.status = 'completed') as completed,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND(
          (COUNT(*) FILTER (WHERE rp.status IN ('scheduled', 'completed')))::NUMERIC
          / COUNT(*) * 100, 1
        )
        ELSE 0
      END as "conversionRate"
    FROM recall_campaigns_v2 rc
    LEFT JOIN recall_patients rp ON rp.campaign_id = rc.id
    WHERE rc.tenant_id = $1
    GROUP BY rc.id, rc.name, rc.recall_type
    ORDER BY rc.name`,
    [tenantId]
  );

  const cStats = campaignStats.rows[0];
  const pStats = patientStats.rows[0];

  const totalPatients =
    parseInt(pStats.pending || '0', 10) +
    parseInt(pStats.contacted || '0', 10) +
    parseInt(pStats.scheduled || '0', 10) +
    parseInt(pStats.completed || '0', 10);

  const conversionRate = totalPatients > 0
    ? ((parseInt(pStats.scheduled || '0', 10) + parseInt(pStats.completed || '0', 10)) / totalPatients * 100)
    : 0;

  return {
    totalCampaigns: parseInt(cStats.total || '0', 10),
    activeCampaigns: parseInt(cStats.active || '0', 10),
    totalPending: parseInt(pStats.pending || '0', 10),
    totalContacted: parseInt(pStats.contacted || '0', 10),
    totalScheduled: parseInt(pStats.scheduled || '0', 10),
    totalCompleted: parseInt(pStats.completed || '0', 10),
    overallConversionRate: Math.round(conversionRate * 10) / 10,
    byCampaign: byCampaign.rows.map((row: any) => ({
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      recallType: row.recallType,
      pending: parseInt(row.pending || '0', 10),
      contacted: parseInt(row.contacted || '0', 10),
      scheduled: parseInt(row.scheduled || '0', 10),
      completed: parseInt(row.completed || '0', 10),
      conversionRate: parseFloat(row.conversionRate || '0'),
    })),
    dueToday: parseInt(pStats.due_today || '0', 10),
    overdueCount: parseInt(pStats.overdue || '0', 10),
  };
}

/**
 * Get patient's recall history
 */
export async function getPatientRecallHistory(
  tenantId: string,
  patientId: string
): Promise<{
  recalls: RecallPatient[];
  contactHistory: RecallContactLog[];
}> {
  const recalls = await pool.query<RecallPatient>(
    `SELECT
      rp.id,
      rp.tenant_id as "tenantId",
      rp.campaign_id as "campaignId",
      rp.patient_id as "patientId",
      rp.reason,
      rp.due_date as "dueDate",
      rp.priority,
      rp.status,
      rp.last_contact_at as "lastContactAt",
      rp.next_contact_at as "nextContactAt",
      rp.contact_attempts as "contactAttempts",
      rp.scheduled_appointment_id as "scheduledAppointmentId",
      rp.completed_at as "completedAt",
      rp.dismissed_reason as "dismissedReason",
      rp.source,
      rp.notes,
      rp.created_at as "createdAt",
      rp.updated_at as "updatedAt",
      rc.name as "campaignName"
    FROM recall_patients rp
    LEFT JOIN recall_campaigns_v2 rc ON rp.campaign_id = rc.id
    WHERE rp.tenant_id = $1 AND rp.patient_id = $2
    ORDER BY rp.created_at DESC`,
    [tenantId, patientId]
  );

  const recallIds = recalls.rows.map((r) => r.id);

  let contactHistory: RecallContactLog[] = [];
  if (recallIds.length > 0) {
    const contacts = await pool.query<RecallContactLog>(
      `SELECT
        id,
        tenant_id as "tenantId",
        recall_patient_id as "recallPatientId",
        channel,
        message_sent as "messageSent",
        sent_at as "sentAt",
        response,
        responded_at as "respondedAt",
        response_notes as "responseNotes",
        sent_by as "sentBy",
        delivery_status as "deliveryStatus",
        delivery_error as "deliveryError",
        external_message_id as "externalMessageId"
      FROM recall_contact_log
      WHERE tenant_id = $1 AND recall_patient_id = ANY($2::uuid[])
      ORDER BY sent_at DESC`,
      [tenantId, recallIds]
    );
    contactHistory = contacts.rows;
  }

  return {
    recalls: recalls.rows,
    contactHistory,
  };
}

/**
 * Get recall patients with filters
 */
export async function getRecallPatients(
  tenantId: string,
  filters: {
    campaignId?: string;
    status?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ patients: RecallPatient[]; total: number }> {
  const conditions: string[] = ['rp.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.campaignId) {
    paramCount++;
    conditions.push(`rp.campaign_id = $${paramCount}`);
    params.push(filters.campaignId);
  }

  if (filters.status) {
    paramCount++;
    conditions.push(`rp.status = $${paramCount}`);
    params.push(filters.status);
  }

  if (filters.dueDateFrom) {
    paramCount++;
    conditions.push(`rp.due_date >= $${paramCount}`);
    params.push(filters.dueDateFrom);
  }

  if (filters.dueDateTo) {
    paramCount++;
    conditions.push(`rp.due_date <= $${paramCount}`);
    params.push(filters.dueDateTo);
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM recall_patients rp WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // Get patients
  let query = `
    SELECT
      rp.id,
      rp.tenant_id as "tenantId",
      rp.campaign_id as "campaignId",
      rp.patient_id as "patientId",
      rp.reason,
      rp.due_date as "dueDate",
      rp.priority,
      rp.status,
      rp.last_contact_at as "lastContactAt",
      rp.next_contact_at as "nextContactAt",
      rp.contact_attempts as "contactAttempts",
      rp.scheduled_appointment_id as "scheduledAppointmentId",
      rp.completed_at as "completedAt",
      rp.dismissed_reason as "dismissedReason",
      rp.source,
      rp.notes,
      rp.created_at as "createdAt",
      rp.updated_at as "updatedAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      p.phone as "patientPhone",
      p.email as "patientEmail",
      rc.name as "campaignName"
    FROM recall_patients rp
    JOIN patients p ON rp.patient_id = p.id
    LEFT JOIN recall_campaigns_v2 rc ON rp.campaign_id = rc.id
    WHERE ${whereClause}
    ORDER BY rp.due_date ASC, rp.priority DESC
  `;

  if (filters.limit) {
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }

  if (filters.offset) {
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(filters.offset);
  }

  const result = await pool.query<RecallPatient>(query, params);

  return {
    patients: result.rows,
    total,
  };
}

/**
 * Get campaign templates
 */
export async function getRecallCampaignTemplates(): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      id,
      name,
      description,
      recall_type as "recallType",
      target_criteria as "targetCriteria",
      message_template as "messageTemplate",
      message_template_sms as "messageTemplateSms",
      message_template_email as "messageTemplateEmail",
      frequency_days as "frequencyDays",
      max_attempts as "maxAttempts"
    FROM recall_campaign_templates
    ORDER BY name`
  );

  return result.rows;
}
