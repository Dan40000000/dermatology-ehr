import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';

export const MELANOMA_RECALL_CAMPAIGN_ID = 'recall-campaign-melanoma-surveillance';
const MELANOMA_RECALL_TYPE = 'Melanoma Surveillance';
const DEFAULT_INTERVAL_MONTHS = 3;
const DEFAULT_SMS_TEMPLATE =
  'Dermatology DEMO Office: You are due for a dermatology follow-up visit. Please call us or reply to schedule. Reply STOP to opt out.';

export interface MelanomaRecallResult {
  triggered: boolean;
  patientId?: string;
  campaignId?: string;
  recallId?: string;
  taskId?: string;
  registryId?: string;
  dueDate?: string;
  createdRecall?: boolean;
  error?: string;
}

interface EnsureMelanomaRecallInput {
  tenantId: string;
  encounterId: string;
  icd10Code: string;
  description: string;
  userId?: string;
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsIso(months: number): string {
  const dueDate = new Date();
  dueDate.setUTCMonth(dueDate.getUTCMonth() + months);
  return dueDate.toISOString().slice(0, 10);
}

function campaignIdForTenant(tenantId: string): string {
  return tenantId === 'tenant-demo'
    ? MELANOMA_RECALL_CAMPAIGN_ID
    : `${MELANOMA_RECALL_CAMPAIGN_ID}-${tenantId}`;
}

export function isMelanomaIcd10Code(icd10Code: string): boolean {
  const normalized = icd10Code.trim().toUpperCase().replace(/\s+/g, '');
  return (
    normalized.startsWith('C43') ||
    normalized.startsWith('D03') ||
    normalized === 'Z85.820'
  );
}

async function ensureMelanomaCampaign(client: any, tenantId: string): Promise<{ id: string; intervalMonths: number }> {
  const existing = await client.query(
    `select id, interval_months
     from recall_campaigns
     where tenant_id = $1
       and (
         id = $2 or
         name ilike 'Melanoma Surveillance' or
         recall_type ilike 'Melanoma Surveillance'
       )
     order by case when id = $2 then 0 else 1 end
     limit 1`,
    [tenantId, MELANOMA_RECALL_CAMPAIGN_ID],
  );

  if (existing.rows[0]) {
    const intervalMonths = Number(existing.rows[0].interval_months) || DEFAULT_INTERVAL_MONTHS;
    return { id: existing.rows[0].id, intervalMonths };
  }

  const campaignId = campaignIdForTenant(tenantId);
  await client.query(
    `insert into recall_campaigns(
      id,
      tenant_id,
      name,
      description,
      recall_type,
      interval_months,
      criteria,
      message_template,
      is_active,
      created_at,
      updated_at
    )
    values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,true,now(),now())
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      recall_type = excluded.recall_type,
      interval_months = excluded.interval_months,
      criteria = excluded.criteria,
      message_template = excluded.message_template,
      is_active = true,
      updated_at = now()`,
    [
      campaignId,
      tenantId,
      MELANOMA_RECALL_TYPE,
      'Patients with melanoma history who need recurring total body skin exams and staff outreach.',
      MELANOMA_RECALL_TYPE,
      DEFAULT_INTERVAL_MONTHS,
      JSON.stringify({ diagnoses: ['C43.%', 'D03.%', 'Z85.820'], intervalsMonths: [3, 6], riskLevel: ['high'] }),
      DEFAULT_SMS_TEMPLATE,
    ],
  );

  return { id: campaignId, intervalMonths: DEFAULT_INTERVAL_MONTHS };
}

async function selectRecallTaskAssignee(client: any, tenantId: string): Promise<string | null> {
  const result = await client.query(
    `select id
     from users
     where tenant_id = $1
       and role in ('ma', 'front_desk', 'admin')
     order by case role when 'ma' then 0 when 'front_desk' then 1 else 2 end, created_at
     limit 1`,
    [tenantId],
  );

  return result.rows[0]?.id || null;
}

async function upsertRecallTask(
  client: any,
  tenantId: string,
  patientId: string,
  encounterId: string,
  dueDate: string,
  diagnosisDescription: string,
  userId?: string,
): Promise<string | undefined> {
  const existing = await client.query(
    `select id
     from tasks
     where tenant_id = $1
       and patient_id = $2
       and coalesce(category, '') = 'recall'
       and lower(coalesce(title, '')) like '%melanoma%'
       and lower(coalesce(status, 'todo')) not in ('completed', 'done', 'closed', 'resolved', 'cancelled', 'canceled')
     order by created_at desc
     limit 1`,
    [tenantId, patientId],
  );

  const title = `Schedule melanoma surveillance recall due ${dueDate}`;
  const description = `Melanoma diagnosis documented in encounter ${encounterId}. Recall patient for a total body skin exam. Diagnosis: ${diagnosisDescription}`;

  if (existing.rows[0]) {
    await client.query(
      `update tasks
       set title = $1,
           description = $2,
           priority = 'high',
           due_date = $3,
           due_at = $3
       where id = $4 and tenant_id = $5`,
      [title, description, dueDate, existing.rows[0].id, tenantId],
    );
    return existing.rows[0].id;
  }

  const assigneeId = await selectRecallTaskAssignee(client, tenantId);
  const taskId = crypto.randomUUID();
  await client.query(
    `insert into tasks(
      id,
      tenant_id,
      patient_id,
      encounter_id,
      title,
      description,
      category,
      priority,
      status,
      due_date,
      due_at,
      assigned_to,
      created_by
    )
    values ($1,$2,$3,$4,$5,$6,'recall','high','todo',$7,$7,$8,$9)`,
    [taskId, tenantId, patientId, encounterId, title, description, dueDate, assigneeId, userId || assigneeId],
  );

  return taskId;
}

export async function ensureMelanomaRecallForDiagnosis(
  input: EnsureMelanomaRecallInput,
): Promise<MelanomaRecallResult> {
  if (!isMelanomaIcd10Code(input.icd10Code)) {
    return { triggered: false };
  }

  let client: any;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const encounterResult = await client.query(
      `select e.id, e.patient_id, e.provider_id
       from encounters e
       where e.tenant_id = $1 and e.id = $2
       limit 1`,
      [input.tenantId, input.encounterId],
    );

    const encounter = encounterResult.rows[0];
    if (!encounter) {
      throw new Error('Encounter not found for melanoma recall');
    }

    const campaign = await ensureMelanomaCampaign(client, input.tenantId);
    const dueDate = addMonthsIso(campaign.intervalMonths || DEFAULT_INTERVAL_MONTHS);
    const diagnosisDate = todayIso();
    const diagnosisDescription = `${input.icd10Code} - ${input.description}`;
    const patientHistoryNote = `History of melanoma diagnosis documented ${diagnosisDate}: ${diagnosisDescription}`;
    const registryNote = `Melanoma surveillance created from encounter diagnosis ${input.icd10Code} on ${diagnosisDate}.`;

    await client.query(
      `update patients
       set past_medical_history = case
           when coalesce(past_medical_history, '') ilike '%melanoma%' then past_medical_history
           else concat_ws(E'\\n', nullif(past_medical_history, ''), $3::text)
         end,
         updated_at = now()
       where tenant_id = $1 and id = $2`,
      [input.tenantId, encounter.patient_id, patientHistoryNote],
    );

    const registryResult = await client.query(
      `insert into melanoma_registry(
        id,
        tenant_id,
        patient_id,
        diagnosis_date,
        primary_site,
        surveillance_schedule,
        last_full_body_exam,
        next_scheduled_exam,
        recurrence_status,
        initial_staging_documented,
        surveillance_adherent,
        notes,
        created_by
      )
      values ($1,$2,$3,$4,'Unspecified skin site',$5,$4,$6,'no_recurrence',false,true,$7,$8)
      on conflict (tenant_id, patient_id) do update set
        diagnosis_date = coalesce(melanoma_registry.diagnosis_date, excluded.diagnosis_date),
        surveillance_schedule = excluded.surveillance_schedule,
        last_full_body_exam = coalesce(melanoma_registry.last_full_body_exam, excluded.last_full_body_exam),
        next_scheduled_exam = excluded.next_scheduled_exam,
        recurrence_status = coalesce(melanoma_registry.recurrence_status, 'no_recurrence'),
        surveillance_adherent = true,
        notes = case
          when coalesce(melanoma_registry.notes, '') ilike '%' || $7 || '%' then melanoma_registry.notes
          else concat_ws(E'\\n', nullif(melanoma_registry.notes, ''), $7::text)
        end,
        updated_at = now()
      returning id`,
      [
        crypto.randomUUID(),
        input.tenantId,
        encounter.patient_id,
        diagnosisDate,
        `every_${campaign.intervalMonths || DEFAULT_INTERVAL_MONTHS}_months`,
        dueDate,
        registryNote,
        input.userId || null,
      ],
    );

    const existingRecall = await client.query(
      `select id
       from patient_recalls
       where tenant_id = $1
         and patient_id = $2
         and (campaign_id = $3 or recall_type = $4)
         and lower(coalesce(status, 'pending')) in ('pending', 'contacted', 'scheduled')
       order by due_date asc nulls last, created_at desc
       limit 1`,
      [input.tenantId, encounter.patient_id, campaign.id, MELANOMA_RECALL_TYPE],
    );

    let recallId: string;
    let createdRecall = false;
    const recallNotes = `Melanoma surveillance recall generated from diagnosis ${input.icd10Code}.`;
    const doctorNotes = `Recommended ${campaign.intervalMonths || DEFAULT_INTERVAL_MONTHS}-month melanoma surveillance. Staff should contact patient and schedule a total body skin exam.`;

    if (existingRecall.rows[0]) {
      recallId = existingRecall.rows[0].id;
      await client.query(
        `update patient_recalls
         set campaign_id = $1,
             recall_type = $2,
             recall_date = least(coalesce(recall_date, $3::date), $3::date),
             due_date = least(coalesce(due_date, $3::date), $3::date),
             notes = case
               when coalesce(notes, '') ilike '%' || $4 || '%' then notes
               else concat_ws(E'\\n', nullif(notes, ''), $4::text)
             end,
             doctor_notes = $5,
             preferred_contact_method = coalesce(preferred_contact_method, 'sms'),
             updated_at = now()
         where id = $6 and tenant_id = $7`,
        [campaign.id, MELANOMA_RECALL_TYPE, dueDate, recallNotes, doctorNotes, recallId, input.tenantId],
      );
    } else {
      recallId = crypto.randomUUID();
      createdRecall = true;
      await client.query(
        `insert into patient_recalls(
          id,
          tenant_id,
          patient_id,
          campaign_id,
          recall_type,
          recall_date,
          due_date,
          status,
          notes,
          doctor_notes,
          preferred_contact_method,
          notification_count,
          created_at,
          updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$6,'pending',$7,$8,'sms',0,now(),now())`,
        [
          recallId,
          input.tenantId,
          encounter.patient_id,
          campaign.id,
          MELANOMA_RECALL_TYPE,
          dueDate,
          recallNotes,
          doctorNotes,
        ],
      );
    }

    const taskId = await upsertRecallTask(
      client,
      input.tenantId,
      encounter.patient_id,
      input.encounterId,
      dueDate,
      diagnosisDescription,
      input.userId,
    );

    await client.query('COMMIT');

    return {
      triggered: true,
      patientId: encounter.patient_id,
      campaignId: campaign.id,
      recallId,
      taskId,
      registryId: registryResult.rows[0]?.id,
      dueDate,
      createdRecall,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to roll back melanoma recall transaction', {
          error: toSafeErrorMessage(rollbackError),
          tenantId: input.tenantId,
          encounterId: input.encounterId,
        });
      }
    }
    const errorMessage = toSafeErrorMessage(error);
    logger.error('Failed to create melanoma recall from diagnosis', {
      error: errorMessage,
      tenantId: input.tenantId,
      encounterId: input.encounterId,
    });

    return {
      triggered: true,
      error: errorMessage,
    };
  } finally {
    client?.release();
  }
}
