import { pool } from '../db/pool';
import crypto from 'crypto';

export interface RecallCampaign {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  recallType: string;
  intervalMonths: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecall {
  id: string;
  tenantId: string;
  patientId: string;
  campaignId?: string;
  dueDate: string;
  status: 'pending' | 'contacted' | 'scheduled' | 'completed' | 'dismissed';
  lastContactDate?: string;
  contactMethod?: string;
  notes?: string;
  appointmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderLogEntry {
  id: string;
  tenantId: string;
  patientId: string;
  recallId?: string;
  reminderType: 'email' | 'sms' | 'phone' | 'mail' | 'portal';
  sentAt: string;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opted_out';
  messageContent?: string;
  sentBy?: string;
  errorMessage?: string;
}

export interface CommunicationPreferences {
  id: string;
  tenantId: string;
  patientId: string;
  allowEmail: boolean;
  allowSms: boolean;
  allowPhone: boolean;
  allowMail: boolean;
  preferredMethod: string;
  optedOut: boolean;
  optedOutAt?: string;
}

/**
 * Generate recalls for a specific campaign
 * Finds patients who are due for recall based on campaign interval
 */
export async function generateRecalls(
  tenantId: string,
  campaignId: string
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const client = await pool.connect();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    await client.query('BEGIN');

    // Get campaign details
    const campaignResult = await client.query<RecallCampaign>(
      `SELECT id,
              tenant_id as "tenantId",
              name,
              description,
              recall_type as "recallType",
              interval_months as "intervalMonths",
              is_active as "isActive",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM recall_campaigns
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [campaignId, tenantId]
    );

    if (campaignResult.rows.length === 0) {
      throw new Error('Campaign not found or inactive');
    }

    const campaign = campaignResult.rows[0];
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    const intervalMonths = campaign.intervalMonths || 12;

    // Find patients who need recalls
    // Logic: Last encounter was more than interval_months ago AND no pending/scheduled recall exists
    const patientsResult = await client.query(`
      WITH last_encounters AS (
        SELECT
          p.id as patient_id,
          MAX(e.encounter_date) as last_encounter_date
        FROM patients p
        LEFT JOIN encounters e ON e.patient_id = p.id AND e.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
        GROUP BY p.id
      ),
      existing_recalls AS (
        SELECT patient_id
        FROM patient_recalls
        WHERE tenant_id = $1
          AND campaign_id = $2
          AND status IN ('pending', 'contacted', 'scheduled')
      )
      SELECT
        le.patient_id,
        le.last_encounter_date
      FROM last_encounters le
      WHERE le.last_encounter_date < NOW() - INTERVAL '1 month' * $3
        AND NOT EXISTS (
          SELECT 1 FROM existing_recalls er
          WHERE er.patient_id = le.patient_id
        )
    `, [tenantId, campaignId, intervalMonths]);

    // Create recalls for eligible patients
    for (const row of patientsResult.rows) {
      try {
        const recallId = crypto.randomUUID();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

        await client.query(
          `INSERT INTO patient_recalls (
            id, tenant_id, patient_id, campaign_id, due_date, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())`,
          [recallId, tenantId, row.patient_id, campaignId, dueDate.toISOString().split('T')[0]]
        );

        created++;
      } catch (err: any) {
        errors.push(`Failed to create recall for patient ${row.patient_id}: ${err.message}`);
        skipped++;
      }
    }

    await client.query('COMMIT');
    return { created, skipped, errors };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate recalls for all active campaigns
 */
export async function generateAllRecalls(tenantId: string): Promise<{
  campaigns: number;
  totalCreated: number;
  totalSkipped: number;
  errors: string[];
}> {
  const result = await pool.query<RecallCampaign>(
    `SELECT id FROM recall_campaigns WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const campaign of result.rows) {
    try {
      const { created, skipped, errors } = await generateRecalls(tenantId, campaign.id);
      totalCreated += created;
      totalSkipped += skipped;
      allErrors.push(...errors);
    } catch (err: any) {
      allErrors.push(`Campaign ${campaign.id}: ${err.message}`);
    }
  }

  return {
    campaigns: result.rows.length,
    totalCreated,
    totalSkipped,
    errors: allErrors,
  };
}

/**
 * Log a reminder communication
 */
export async function logReminder(
  tenantId: string,
  patientId: string,
  recallId: string | null,
  reminderType: 'email' | 'sms' | 'phone' | 'mail' | 'portal',
  messageContent: string,
  sentBy: string,
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opted_out' = 'sent'
): Promise<string> {
  const logId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO reminder_log (
      id, tenant_id, patient_id, recall_id, reminder_type, sent_at,
      delivery_status, message_content, sent_by
    ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
    [logId, tenantId, patientId, recallId, reminderType, deliveryStatus, messageContent, sentBy]
  );

  return logId;
}

/**
 * Get patient communication preferences
 */
export async function getPatientPreferences(
  tenantId: string,
  patientId: string
): Promise<CommunicationPreferences | null> {
  const result = await pool.query<CommunicationPreferences>(
    `SELECT id,
            tenant_id as "tenantId",
            patient_id as "patientId",
            allow_email as "allowEmail",
            allow_sms as "allowSms",
            allow_phone as "allowPhone",
            allow_mail as "allowMail",
            preferred_method as "preferredMethod",
            opted_out as "optedOut",
            opted_out_at as "optedOutAt"
     FROM patient_communication_preferences
     WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, patientId]
  );

  return result.rows[0] ?? null;
}

/**
 * Update or create patient communication preferences
 */
export async function updatePatientPreferences(
  tenantId: string,
  patientId: string,
  preferences: Partial<Omit<CommunicationPreferences, 'id' | 'tenantId' | 'patientId'>>
): Promise<CommunicationPreferences> {
  const id = crypto.randomUUID();

  const result = await pool.query<CommunicationPreferences>(
    `INSERT INTO patient_communication_preferences (
      id, tenant_id, patient_id, allow_email, allow_sms, allow_phone,
      allow_mail, preferred_method, opted_out, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (tenant_id, patient_id)
    DO UPDATE SET
      allow_email = COALESCE($4, patient_communication_preferences.allow_email),
      allow_sms = COALESCE($5, patient_communication_preferences.allow_sms),
      allow_phone = COALESCE($6, patient_communication_preferences.allow_phone),
      allow_mail = COALESCE($7, patient_communication_preferences.allow_mail),
      preferred_method = COALESCE($8, patient_communication_preferences.preferred_method),
      opted_out = COALESCE($9, patient_communication_preferences.opted_out),
      updated_at = NOW()
    RETURNING id,
              tenant_id as "tenantId",
              patient_id as "patientId",
              allow_email as "allowEmail",
              allow_sms as "allowSms",
              allow_phone as "allowPhone",
              allow_mail as "allowMail",
              preferred_method as "preferredMethod",
              opted_out as "optedOut",
              opted_out_at as "optedOutAt"`,
    [
      id,
      tenantId,
      patientId,
      preferences.allowEmail,
      preferences.allowSms,
      preferences.allowPhone,
      preferences.allowMail,
      preferences.preferredMethod,
      preferences.optedOut,
    ]
  );

  return result.rows[0]!;
}

/**
 * Check if patient has opted out or cannot be contacted via a specific method
 */
export async function canContactPatient(
  tenantId: string,
  patientId: string,
  method: 'email' | 'sms' | 'phone' | 'mail'
): Promise<{ canContact: boolean; reason?: string }> {
  const prefs = await getPatientPreferences(tenantId, patientId);

  if (!prefs) {
    return { canContact: true }; // Default to allowing contact if no preferences set
  }

  if (prefs.optedOut) {
    return { canContact: false, reason: 'Patient has opted out of all communications' };
  }

  const methodMap = {
    email: prefs.allowEmail,
    sms: prefs.allowSms,
    phone: prefs.allowPhone,
    mail: prefs.allowMail,
  };

  if (!methodMap[method]) {
    return { canContact: false, reason: `Patient has opted out of ${method} communications` };
  }

  return { canContact: true };
}
