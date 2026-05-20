/**
 * Ambient AI Medical Scribe Routes
 *
 * Handles recording, transcription, and AI-powered clinical note generation
 */

import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';
import {
  transcribeAudio,
  generateClinicalNote,
  maskPHI,
  PatientContext,
  TranscriptionResult
} from '../services/ambientAI';
import { AgentConfiguration, agentConfigService } from '../services/agentConfigService';
import { askClinicalCopilot, type ClinicalCopilotContext, type ClinicalCopilotResult } from '../services/clinicalCopilot';
import { createFinancialWorkQueueItem } from '../services/financialWorkQueueService';
import { immutableEncounterErrorMessage, isImmutableEncounterStatus } from '../lib/clinicalWorkflow';

const router = Router();

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'ambient-recordings');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error: any) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    cb(null, `recording-${uniqueId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.webm', '.mp4', '.mp3', '.wav', '.m4a', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'));
    }
  }
});

// Validation schemas
const startRecordingSchema = z.object({
  encounterId: z.string().optional(),
  patientId: z.string(),
  providerId: z.string(),
  consentObtained: z.boolean(),
  consentMethod: z.enum(['verbal', 'written', 'electronic']).optional()
});

const completeRecordingSchema = z.object({
  durationSeconds: z.coerce.number().min(1)
});

const stopRecordingSchema = z.object({
  durationSeconds: z.coerce.number().min(1).max(8 * 60 * 60).optional()
});

const updateNoteSchema = z.object({
  chiefComplaint: z.string().optional(),
  hpi: z.string().optional(),
  ros: z.string().optional(),
  physicalExam: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  editReason: z.string().optional()
}).strict();

const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_regeneration']),
  reason: z.string().optional()
});

const applyNoteSchema = z.object({
  applyStructuredActions: z.boolean().optional().default(true),
  includeDiagnoses: z.boolean().optional().default(true),
  includeOrders: z.boolean().optional().default(true),
  includeTasks: z.boolean().optional().default(true),
  includeBillingReview: z.boolean().optional().default(true),
});

const clinicalCopilotHistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const clinicalCopilotHistorySchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    return Array.isArray(value) ? value.slice(-8) : value;
  },
  z.array(clinicalCopilotHistoryItemSchema).optional()
);

const optionalCopilotIdentifierSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional()
);

const clinicalCopilotRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  patientId: optionalCopilotIdentifierSchema,
  encounterId: optionalCopilotIdentifierSchema,
  noteId: optionalCopilotIdentifierSchema,
  recordingId: optionalCopilotIdentifierSchema,
  history: clinicalCopilotHistorySchema,
});

const clinicalCopilotVisitSummarySchema = z.object({
  patientId: optionalCopilotIdentifierSchema,
  encounterId: optionalCopilotIdentifierSchema,
  noteId: optionalCopilotIdentifierSchema,
  recordingId: optionalCopilotIdentifierSchema,
  prompt: z.string().min(1).max(4000).optional(),
  history: clinicalCopilotHistorySchema,
});

const clinicalCopilotCodeSuggestionSchema = z.object({
  type: z.enum(['em', 'cpt', 'icd10']),
  code: z.string().trim().min(1).max(32),
  description: z.string().trim().max(500).optional().default(''),
  confidence: z.coerce.number().min(0).max(1).optional().default(0.7),
  rationale: z.string().trim().max(1500).optional().default(''),
});

const clinicalCopilotAppliedResponseSchema = z.object({
  answer: z.string().trim().max(12000).optional().default(''),
  visitSummary: z.string().trim().max(12000).optional().default(''),
  suggestedCodes: z.array(clinicalCopilotCodeSuggestionSchema).max(25).optional().default([]),
  followUpTasks: z.array(z.string().trim().max(1000)).max(20).optional().default([]),
  patientInstructions: z.array(z.string().trim().max(1000)).max(20).optional().default([]),
  missingData: z.array(z.string().trim().max(1000)).max(20).optional().default([]),
  chartEvidence: z.array(z.string().trim().max(1000)).max(20).optional().default([]),
  provider: z.enum(['openai', 'anthropic', 'mock']).optional().default('mock'),
  model: z.string().trim().max(100).optional().default('clinical-copilot'),
});

const clinicalCopilotApplySchema = z.object({
  patientId: optionalCopilotIdentifierSchema,
  encounterId: optionalCopilotIdentifierSchema,
  noteId: optionalCopilotIdentifierSchema,
  recordingId: optionalCopilotIdentifierSchema,
  response: clinicalCopilotAppliedResponseSchema,
});

const AMBIENT_CLINICAL_ROLES = ['provider', 'ma', 'admin'] as const;
const AMBIENT_REVIEW_ROLES = ['provider', 'admin'] as const;
const AMBIENT_SCRIBE_PROMPT_VERSION = 'ambient-scribe-contextual-v1';
const COPILOT_VISIT_SUMMARY_PROMPT = [
  'Summarize this dermatology visit for the patient history.',
  'Use the linked encounter, ambient note, transcript, orders, diagnoses, medications, and follow-up context when available.',
  'Return a clean clinician-facing summary of what happened, the likely assessment, plan, patient instructions, and follow-up items.',
  'Keep it concise enough to be useful in the patient chart history.',
].join(' ');

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logAmbientError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function logAmbientWarning(message: string, error: unknown): void {
  logger.warn(message, {
    error: toSafeErrorMessage(error),
  });
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric > 1 ? numeric / 100 : numeric;
}

function normalizeActionPriority(value: unknown): 'low' | 'normal' | 'high' | 'urgent' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'stat' || normalized === 'urgent') return 'urgent';
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'normal';
}

function normalizeSuggestedBillingCode(value: any): {
  code?: string;
  description?: string;
  confidence: number;
  rationale?: string;
  source: 'suggested_cpt' | 'recommended_test';
} {
  if (typeof value === 'string') {
    return {
      code: normalizeOptionalString(value)?.toUpperCase(),
      confidence: 1,
      source: 'suggested_cpt',
    };
  }

  return {
    code: normalizeOptionalString(value?.code || value?.cptCode)?.toUpperCase(),
    description: normalizeOptionalString(value?.description || value?.testName),
    confidence: normalizeConfidence(value?.confidence ?? 0.7),
    rationale: normalizeOptionalString(value?.rationale),
    source: value?.testName ? 'recommended_test' : 'suggested_cpt',
  };
}

function inferOrderType(testName: string): string {
  const normalized = testName.toLowerCase();
  if (/biopsy|excision|procedure|mohs|shave|punch/.test(normalized)) return 'procedure';
  if (/pathology|histology|specimen/.test(normalized)) return 'pathology';
  if (/photo|dermoscopy|dermatoscopy|imaging/.test(normalized)) return 'imaging';
  return 'lab';
}

async function applyStructuredActionsFromAmbientNote(
  tenantId: string,
  userId: string,
  noteData: any,
  options: z.infer<typeof applyNoteSchema>,
): Promise<{ diagnosesCreated: number; ordersCreated: number; tasksCreated: number; billingReviewItemsCreated: number }> {
  if (!options.applyStructuredActions) {
    return { diagnosesCreated: 0, ordersCreated: 0, tasksCreated: 0, billingReviewItemsCreated: 0 };
  }

  const encounter = await pool.query(
    `select id, patient_id, provider_id, status
       from encounters
      where id = $1 and tenant_id = $2`,
    [noteData.encounter_id, tenantId],
  );

  if (!encounter.rowCount) {
    throw new Error('Linked encounter not found');
  }

  const encounterRow = encounter.rows[0];
  if (isImmutableEncounterStatus(encounterRow.status)) {
    throw Object.assign(new Error(immutableEncounterErrorMessage(encounterRow.status)), { httpStatus: 409 });
  }

  let diagnosesCreated = 0;
  let ordersCreated = 0;
  let tasksCreated = 0;
  let billingReviewItemsCreated = 0;

  if (options.includeDiagnoses) {
    const existingDiagnosisResult = await pool.query(
      `select id, upper(icd10_code) as code, is_primary
         from encounter_diagnoses
        where encounter_id = $1 and tenant_id = $2`,
      [noteData.encounter_id, tenantId],
    );
    const existingCodes = new Set(existingDiagnosisResult.rows.map((row: any) => String(row.code || '').toUpperCase()));
    const hasPrimary = existingDiagnosisResult.rows.some((row: any) => row.is_primary);

    const icdSuggestions = parseJsonArray(noteData.suggested_icd10_codes)
      .map((code: any) => ({
        code: normalizeOptionalString(code?.code),
        description: normalizeOptionalString(code?.description),
        confidence: normalizeConfidence(code?.confidence),
      }));

    const differentialSuggestions = parseJsonArray(noteData.differential_diagnoses)
      .map((diagnosis: any) => ({
        code: normalizeOptionalString(diagnosis?.icd10Code),
        description: normalizeOptionalString(diagnosis?.condition),
        confidence: normalizeConfidence(diagnosis?.confidence),
      }));

    const diagnosesToCreate = [...icdSuggestions, ...differentialSuggestions]
      .filter((diagnosis) => diagnosis.code && diagnosis.description && diagnosis.confidence >= 0.6)
      .filter((diagnosis, index, all) => all.findIndex((candidate) => candidate.code?.toUpperCase() === diagnosis.code?.toUpperCase()) === index)
      .slice(0, 5);

    for (const diagnosis of diagnosesToCreate) {
      const normalizedCode = diagnosis.code!.toUpperCase();
      if (existingCodes.has(normalizedCode)) {
        continue;
      }

      await pool.query(
        `insert into encounter_diagnoses (
           id, tenant_id, encounter_id, icd10_code, description, is_primary, created_at
         ) values ($1, $2, $3, $4, $5, $6, now())`,
        [
          crypto.randomUUID(),
          tenantId,
          noteData.encounter_id,
          diagnosis.code,
          `${diagnosis.description} (AI suggested, clinician approved)`,
          !hasPrimary && diagnosesCreated === 0,
        ],
      );
      existingCodes.add(normalizedCode);
      diagnosesCreated++;
    }
  }

  if (options.includeOrders) {
    const tests = parseJsonArray(noteData.recommended_tests)
      .map((test: any) => ({
        testName: normalizeOptionalString(test?.testName),
        rationale: normalizeOptionalString(test?.rationale),
        urgency: normalizeOptionalString(test?.urgency),
      }))
      .filter((test) => test.testName)
      .slice(0, 5);

    for (const test of tests) {
      const duplicate = await pool.query(
        `select id from orders
          where tenant_id = $1
            and encounter_id = $2
            and lower(coalesce(details, '')) = lower($3)
          limit 1`,
        [tenantId, noteData.encounter_id, test.testName],
      );
      if (duplicate.rowCount) {
        continue;
      }

      await pool.query(
        `insert into orders(
           id, tenant_id, encounter_id, patient_id, provider_id, type, status, priority, details, notes, created_at
         ) values ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,now())`,
        [
          crypto.randomUUID(),
          tenantId,
          noteData.encounter_id,
          encounterRow.patient_id,
          encounterRow.provider_id,
          inferOrderType(test.testName!),
          normalizeActionPriority(test.urgency),
          test.testName,
          test.rationale ? `AI suggested after clinician-approved scribe note: ${test.rationale}` : 'AI suggested after clinician-approved scribe note',
        ],
      );
      ordersCreated++;
    }
  }

  if (options.includeTasks) {
    const tasks = parseJsonArray(noteData.follow_up_tasks)
      .map((task: any) => ({
        title: normalizeOptionalString(task?.task || task?.title),
        priority: normalizeActionPriority(task?.priority),
        dueDate: normalizeOptionalString(task?.dueDate),
      }))
      .filter((task) => task.title)
      .slice(0, 8);

    for (const task of tasks) {
      const duplicate = await pool.query(
        `select id from tasks
          where tenant_id = $1
            and encounter_id = $2
            and lower(title) = lower($3)
          limit 1`,
        [tenantId, noteData.encounter_id, task.title],
      );
      if (duplicate.rowCount) {
        continue;
      }

      await pool.query(
        `insert into tasks(
           id, tenant_id, patient_id, encounter_id, title, description, category,
           priority, status, due_date, due_at, created_by, created_at
         ) values ($1,$2,$3,$4,$5,$6,'ai_follow_up',$7,'todo',$8,$8,$9,now())`,
        [
          crypto.randomUUID(),
          tenantId,
          encounterRow.patient_id,
          noteData.encounter_id,
          task.title,
          'Created from clinician-approved AI scribe recommendations.',
          task.priority,
          task.dueDate || null,
          userId,
        ],
      );
      tasksCreated++;
    }
  }

  if (options.includeBillingReview) {
    const suggestedCodes = [
      ...parseJsonArray(noteData.suggested_cpt_codes).map(normalizeSuggestedBillingCode),
      ...parseJsonArray(noteData.recommended_tests)
        .filter((test: any) => normalizeOptionalString(test?.cptCode))
        .map(normalizeSuggestedBillingCode),
    ]
      .filter((code) => code.code && code.confidence >= 0.6)
      .filter((code, index, all) => all.findIndex((candidate) => candidate.code === code.code) === index)
      .slice(0, 8);

    if (suggestedCodes.length > 0) {
      const suggestedDiagnoses = parseJsonArray(noteData.suggested_icd10_codes)
        .map((code: any) => ({
          code: normalizeOptionalString(code?.code || code)?.toUpperCase(),
          description: normalizeOptionalString(code?.description),
          confidence: normalizeConfidence(code?.confidence ?? 0.7),
        }))
        .filter((code) => code.code && code.confidence >= 0.6)
        .slice(0, 12);

      const reviewItem = await createFinancialWorkQueueItem({
        tenantId,
        encounterId: noteData.encounter_id,
        patientId: encounterRow.patient_id,
        issueType: 'ai_scribe_charge_review',
        severity: 'warning',
        message: `AI scribe suggested ${suggestedCodes.length} billing code(s). Review before charge capture.`,
        errorDetail: 'AI code suggestions are not billed automatically. A clinician or biller must confirm the supported services, diagnoses, units, and modifiers.',
        metadata: {
          ambientNoteId: noteData.id,
          suggestedCptCodes: suggestedCodes,
          suggestedIcd10Codes: suggestedDiagnoses,
          nextStep: 'Review suggested codes, then create or update charges from the encounter billing panel.',
        },
        createdBy: userId,
      });

      billingReviewItemsCreated = reviewItem ? 1 : 0;
    }
  }

  return { diagnosesCreated, ordersCreated, tasksCreated, billingReviewItemsCreated };
}

function calculateAgeFromDob(dob: unknown): number | undefined {
  const normalizedDob = normalizeOptionalString(dob);
  if (!normalizedDob) {
    return undefined;
  }

  const birthDate = new Date(normalizedDob);
  if (Number.isNaN(birthDate.getTime())) {
    return undefined;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : undefined;
}

function toTranscriptExcerpt(value: unknown, maxLength = 3500): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `…${normalized.slice(-maxLength)}`;
}

async function fetchClinicalCopilotNoteContext(
  tenantId: string,
  identifiers: { noteId?: string; encounterId?: string; patientId?: string; recordingId?: string }
): Promise<{
  noteId?: string;
  recordingId?: string;
  encounterId?: string;
  patientId?: string;
  providerId?: string;
  transcriptText?: string;
  note?: ClinicalCopilotContext['note'];
}> {
  const { noteId, encounterId, patientId, recordingId } = identifiers;

  if (noteId) {
    const result = await pool.query(
      `SELECT
         n.id as "noteId",
         n.encounter_id as "encounterId",
         n.chief_complaint as "chiefComplaint",
         n.hpi,
         n.ros,
         n.physical_exam as "physicalExam",
         n.assessment,
         n.plan,
         n.suggested_icd10_codes as "suggestedIcd10Codes",
         n.suggested_cpt_codes as "suggestedCptCodes",
         n.follow_up_tasks as "followUpTasks",
         n.recommended_tests as "recommendedTests",
         n.note_content as "noteContent",
         t.transcript_text as "transcriptText",
         r.id as "recordingId",
         r.patient_id as "patientId",
         r.provider_id as "providerId"
       FROM ambient_generated_notes n
       JOIN ambient_transcripts t ON t.id = n.transcript_id
       JOIN ambient_recordings r ON r.id = t.recording_id
       WHERE n.id = $1 AND n.tenant_id = $2`,
      [noteId, tenantId]
    );

    if (result.rowCount && result.rows[0]) {
      const row = result.rows[0];
      return {
        noteId: row.noteId,
        recordingId: row.recordingId,
        encounterId: row.encounterId,
        patientId: row.patientId,
        providerId: row.providerId,
        transcriptText: row.transcriptText,
        note: {
          chiefComplaint: row.chiefComplaint,
          hpi: row.hpi,
          ros: row.ros,
          physicalExam: row.physicalExam,
          assessment: row.assessment,
          plan: row.plan,
          suggestedIcd10Codes: Array.isArray(row.suggestedIcd10Codes) ? row.suggestedIcd10Codes : [],
          suggestedCptCodes: Array.isArray(row.suggestedCptCodes) ? row.suggestedCptCodes : [],
          followUpTasks: Array.isArray(row.followUpTasks) ? row.followUpTasks : [],
          recommendedTests: Array.isArray(row.recommendedTests) ? row.recommendedTests : [],
          patientSummary: row.noteContent?.patientSummary || undefined,
        },
      };
    }
  }

  let query = '';
  let params: any[] = [];
  if (encounterId) {
    query = `SELECT
        n.id as "noteId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.follow_up_tasks as "followUpTasks",
        n.recommended_tests as "recommendedTests",
        n.note_content as "noteContent",
        t.transcript_text as "transcriptText",
        r.id as "recordingId",
        r.patient_id as "patientId",
        r.provider_id as "providerId"
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      JOIN ambient_recordings r ON r.id = t.recording_id
      WHERE n.encounter_id = $1 AND n.tenant_id = $2
      ORDER BY n.created_at DESC
      LIMIT 1`;
    params = [encounterId, tenantId];
  } else if (recordingId) {
    query = `SELECT
        n.id as "noteId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.follow_up_tasks as "followUpTasks",
        n.recommended_tests as "recommendedTests",
        n.note_content as "noteContent",
        t.transcript_text as "transcriptText",
        r.id as "recordingId",
        r.patient_id as "patientId",
        r.provider_id as "providerId"
      FROM ambient_transcripts t
      JOIN ambient_recordings r ON r.id = t.recording_id
      LEFT JOIN ambient_generated_notes n ON n.transcript_id = t.id AND n.tenant_id = t.tenant_id
      WHERE r.id = $1 AND r.tenant_id = $2
      ORDER BY n.created_at DESC NULLS LAST
      LIMIT 1`;
    params = [recordingId, tenantId];
  } else if (patientId) {
    query = `SELECT
        n.id as "noteId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.follow_up_tasks as "followUpTasks",
        n.recommended_tests as "recommendedTests",
        n.note_content as "noteContent",
        t.transcript_text as "transcriptText",
        r.id as "recordingId",
        r.patient_id as "patientId",
        r.provider_id as "providerId"
      FROM ambient_recordings r
      JOIN ambient_transcripts t ON t.recording_id = r.id AND t.tenant_id = r.tenant_id
      LEFT JOIN ambient_generated_notes n ON n.transcript_id = t.id AND n.tenant_id = r.tenant_id
      WHERE r.patient_id = $1 AND r.tenant_id = $2
      ORDER BY COALESCE(n.created_at, t.created_at) DESC
      LIMIT 1`;
    params = [patientId, tenantId];
  }

  if (!query) {
    return {};
  }

  const result = await pool.query(query, params);
  if (!result.rowCount || !result.rows[0]) {
    return {};
  }

  const row = result.rows[0];
  return {
    noteId: row.noteId || undefined,
    recordingId: row.recordingId || undefined,
    encounterId: row.encounterId || undefined,
    patientId: row.patientId || undefined,
    providerId: row.providerId || undefined,
    transcriptText: row.transcriptText || undefined,
    note: row.noteId ? {
      chiefComplaint: row.chiefComplaint,
      hpi: row.hpi,
      ros: row.ros,
      physicalExam: row.physicalExam,
      assessment: row.assessment,
      plan: row.plan,
      suggestedIcd10Codes: Array.isArray(row.suggestedIcd10Codes) ? row.suggestedIcd10Codes : [],
      suggestedCptCodes: Array.isArray(row.suggestedCptCodes) ? row.suggestedCptCodes : [],
      followUpTasks: Array.isArray(row.followUpTasks) ? row.followUpTasks : [],
      recommendedTests: Array.isArray(row.recommendedTests) ? row.recommendedTests : [],
      patientSummary: row.noteContent?.patientSummary || undefined,
    } : undefined,
  };
}

async function resolveClinicalCopilotContext(
  tenantId: string,
  identifiers: { noteId?: string; encounterId?: string; patientId?: string; recordingId?: string }
): Promise<ClinicalCopilotContext> {
  const noteContext = await fetchClinicalCopilotNoteContext(tenantId, identifiers);
  const effectiveEncounterId = identifiers.encounterId || noteContext.encounterId;
  const effectivePatientId = identifiers.patientId || noteContext.patientId;

  let encounterContext: ClinicalCopilotContext['encounter'];
  let patientAge: number | undefined;

  if (effectiveEncounterId) {
    const encounterResult = await pool.query(
      `SELECT
         e.id,
         e.chief_complaint as "chiefComplaint",
         e.hpi,
         e.ros,
         e.exam,
         e.assessment_plan as "assessmentPlan",
         p.dob
       FROM encounters e
       LEFT JOIN patients p ON p.id = e.patient_id AND p.tenant_id = e.tenant_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [effectiveEncounterId, tenantId]
    );

    if (encounterResult.rowCount && encounterResult.rows[0]) {
      const row = encounterResult.rows[0];
      encounterContext = {
        chiefComplaint: row.chiefComplaint,
        hpi: row.hpi,
        ros: row.ros,
        exam: row.exam,
        assessmentPlan: row.assessmentPlan,
      };
      patientAge = calculateAgeFromDob(row.dob);
    }
  }

  if (!patientAge && effectivePatientId) {
    const patientResult = await pool.query(
      `SELECT dob FROM patients WHERE id = $1 AND tenant_id = $2`,
      [effectivePatientId, tenantId]
    );
    if (patientResult.rowCount && patientResult.rows[0]) {
      patientAge = calculateAgeFromDob(patientResult.rows[0].dob);
    }
  }

  return {
    patientId: effectivePatientId,
    encounterId: effectiveEncounterId,
    noteId: identifiers.noteId || noteContext.noteId,
    recordingId: identifiers.recordingId || noteContext.recordingId,
    patientAge,
    encounter: encounterContext,
    note: noteContext.note,
    transcriptExcerpt: toTranscriptExcerpt(noteContext.transcriptText),
  };
}

type CopilotVisitSummaryTarget = {
  patientId: string;
  encounterId: string | null;
  providerId: string | null;
  providerName: string | null;
  visitDate: Date | string;
  ambientNoteId: string | null;
};

async function resolveCopilotVisitSummaryTarget(
  tenantId: string,
  identifiers: { noteId?: string; encounterId?: string; patientId?: string; recordingId?: string },
  context: ClinicalCopilotContext
): Promise<CopilotVisitSummaryTarget | null> {
  if (context.encounterId) {
    const result = await pool.query(
      `SELECT
         e.id as "encounterId",
         e.patient_id as "patientId",
         e.provider_id as "providerId",
         pr.full_name as "providerName",
         COALESCE(a.scheduled_start, e.created_at, NOW()) as "visitDate"
       FROM encounters e
       LEFT JOIN appointments a ON a.id = e.appointment_id AND a.tenant_id = e.tenant_id
       LEFT JOIN providers pr ON pr.id = e.provider_id AND pr.tenant_id = e.tenant_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [context.encounterId, tenantId]
    );

    if (result.rowCount && result.rows[0]) {
      const row = result.rows[0];
      return {
        patientId: row.patientId,
        encounterId: row.encounterId,
        providerId: row.providerId || null,
        providerName: row.providerName || null,
        visitDate: row.visitDate || new Date(),
        ambientNoteId: context.noteId || null,
      };
    }
  }

  if (context.noteId) {
    const result = await pool.query(
      `SELECT
         r.patient_id as "patientId",
         COALESCE(n.encounter_id, r.encounter_id) as "encounterId",
         r.provider_id as "providerId",
         pr.full_name as "providerName",
         COALESCE(a.scheduled_start, e.created_at, n.created_at, NOW()) as "visitDate"
       FROM ambient_generated_notes n
       JOIN ambient_transcripts t ON t.id = n.transcript_id AND t.tenant_id = n.tenant_id
       JOIN ambient_recordings r ON r.id = t.recording_id AND r.tenant_id = n.tenant_id
       LEFT JOIN encounters e ON e.id = COALESCE(n.encounter_id, r.encounter_id) AND e.tenant_id = n.tenant_id
       LEFT JOIN appointments a ON a.id = e.appointment_id AND a.tenant_id = n.tenant_id
       LEFT JOIN providers pr ON pr.id = r.provider_id AND pr.tenant_id = n.tenant_id
       WHERE n.id = $1 AND n.tenant_id = $2`,
      [context.noteId, tenantId]
    );

    if (result.rowCount && result.rows[0]) {
      const row = result.rows[0];
      return {
        patientId: row.patientId,
        encounterId: row.encounterId || null,
        providerId: row.providerId || null,
        providerName: row.providerName || null,
        visitDate: row.visitDate || new Date(),
        ambientNoteId: context.noteId,
      };
    }
  }

  if (context.recordingId) {
    const result = await pool.query(
      `SELECT
         r.patient_id as "patientId",
         r.encounter_id as "encounterId",
         r.provider_id as "providerId",
         pr.full_name as "providerName",
         COALESCE(a.scheduled_start, e.created_at, r.started_at, NOW()) as "visitDate"
       FROM ambient_recordings r
       LEFT JOIN encounters e ON e.id = r.encounter_id AND e.tenant_id = r.tenant_id
       LEFT JOIN appointments a ON a.id = e.appointment_id AND a.tenant_id = r.tenant_id
       LEFT JOIN providers pr ON pr.id = r.provider_id AND pr.tenant_id = r.tenant_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [context.recordingId, tenantId]
    );

    if (result.rowCount && result.rows[0]) {
      const row = result.rows[0];
      return {
        patientId: row.patientId,
        encounterId: row.encounterId || null,
        providerId: row.providerId || null,
        providerName: row.providerName || null,
        visitDate: row.visitDate || new Date(),
        ambientNoteId: context.noteId || null,
      };
    }
  }

  const patientId = identifiers.patientId || context.patientId;
  if (patientId) {
    const result = await pool.query(
      `SELECT id as "patientId" FROM patients WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (result.rowCount && result.rows[0]) {
      return {
        patientId: result.rows[0].patientId,
        encounterId: null,
        providerId: null,
        providerName: null,
        visitDate: new Date(),
        ambientNoteId: context.noteId || null,
      };
    }
  }

  return null;
}

function buildCopilotSummarySymptoms(
  result: Awaited<ReturnType<typeof askClinicalCopilot>>,
  context: ClinicalCopilotContext
): string[] {
  const symptoms = extractSymptomsForSummary({
    chiefComplaint: context.note?.chiefComplaint || context.encounter?.chiefComplaint,
    hpi: context.note?.hpi || context.encounter?.hpi,
    physicalExam: context.note?.physicalExam || context.encounter?.exam,
    assessment: context.note?.assessment || context.encounter?.assessmentPlan,
    plan: context.note?.plan || context.encounter?.assessmentPlan,
    patientSummary: context.note?.patientSummary,
  });

  const seen = new Set(symptoms.map((item) => item.toLowerCase()));
  const pushUnique = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    symptoms.push(trimmed);
  };

  const sourceText = [
    result.visitSummary,
    result.answer,
    result.chartEvidence.join(' '),
    result.patientInstructions.join(' '),
    result.followUpTasks.join(' '),
    context.note?.patientSummary?.diagnosis,
    context.note?.assessment,
    context.encounter?.assessmentPlan,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const symptom of SYMPTOM_PATTERNS) {
    if (symptom.pattern.test(sourceText)) {
      pushUnique(symptom.label);
    }
  }

  if (/seborrheic dermatitis|ketoconazole|scalp|shampoo/.test(sourceText)) {
    pushUnique('Scalp scaling / flaking');
    pushUnique('Itching');
  }

  if (/\bacne|breakouts?|pimples?|comedones?\b/.test(sourceText)) {
    pushUnique('Acne / breakouts');
  }

  if (/\bpsoriasis|plaque|silvery scale\b/.test(sourceText)) {
    pushUnique('Psoriasis plaques / scaling');
  }

  return symptoms.slice(0, 8);
}

function buildCopilotSummaryDiagnosis(
  result: Awaited<ReturnType<typeof askClinicalCopilot>>,
  context: ClinicalCopilotContext
): string {
  const icd10 = result.suggestedCodes.find((code) => code.type === 'icd10');
  if (icd10?.description) {
    return icd10.description;
  }

  return (
    toTrimmedString(context.note?.patientSummary?.diagnosis) ||
    toTrimmedString(context.note?.assessment).split('\n')[0] ||
    toTrimmedString(context.encounter?.assessmentPlan).split('\n')[0] ||
    ''
  );
}

async function upsertCopilotVisitSummary(
  tenantId: string,
  userId: string | undefined,
  target: CopilotVisitSummaryTarget,
  result: Awaited<ReturnType<typeof askClinicalCopilot>>,
  context: ClinicalCopilotContext
): Promise<{ summaryId: string; created: boolean }> {
  let existingSummaryId: string | null = null;

  if (target.ambientNoteId) {
    const existing = await pool.query(
      `SELECT id FROM visit_summaries WHERE ambient_note_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [target.ambientNoteId, tenantId]
    );
    existingSummaryId = existing.rows[0]?.id || null;
  }

  if (!existingSummaryId && target.encounterId) {
    const existing = await pool.query(
      `SELECT id FROM visit_summaries WHERE encounter_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [target.encounterId, tenantId]
    );
    existingSummaryId = existing.rows[0]?.id || null;
  }

  const summaryId = existingSummaryId || crypto.randomUUID();
  const summaryText =
    toTrimmedString(result.visitSummary) ||
    toTrimmedString(result.answer) ||
    'Visit summary generated by Encounter Copilot; clinician review required.';
  const symptomsDiscussed = JSON.stringify(buildCopilotSummarySymptoms(result, context));
  const diagnosisShared = buildCopilotSummaryDiagnosis(result, context);
  const treatmentPlan = result.patientInstructions.length
    ? result.patientInstructions.join('\n')
    : toTrimmedString(context.note?.plan || context.encounter?.assessmentPlan);
  const nextSteps = result.followUpTasks.join('\n');
  const chiefComplaint = toTrimmedString(context.note?.chiefComplaint || context.encounter?.chiefComplaint);
  const diagnoses = result.suggestedCodes
    .filter((code) => code.type === 'icd10')
    .map((code) => ({
      code: code.code,
      description: code.description,
      confidence: code.confidence,
      rationale: code.rationale,
    }));
  const procedures = result.suggestedCodes
    .filter((code) => code.type === 'cpt' && !/^99\d{3}$/.test(code.code))
    .map((code) => ({
      code: code.code,
      description: code.description,
      type: code.type,
      confidence: code.confidence,
      rationale: code.rationale,
    }));

  if (existingSummaryId) {
    await pool.query(
      `UPDATE visit_summaries
       SET patient_id = $1,
           encounter_id = $2,
           provider_id = $3,
           ambient_note_id = COALESCE($4, ambient_note_id),
           visit_date = $5,
           provider_name = $6,
           summary_text = $7,
           symptoms_discussed = $8,
           diagnosis_shared = $9,
           treatment_plan = $10,
           next_steps = $11,
           chief_complaint = $12,
           diagnoses = $13,
           procedures = $14,
           follow_up_instructions = $15,
           generated_by = $16,
           updated_at = NOW()
       WHERE id = $17 AND tenant_id = $18`,
      [
        target.patientId,
        target.encounterId,
        target.providerId,
        target.ambientNoteId,
        target.visitDate,
        target.providerName,
        summaryText,
        symptomsDiscussed,
        diagnosisShared || null,
        treatmentPlan || null,
        nextSteps || null,
        chiefComplaint || null,
        JSON.stringify(diagnoses),
        JSON.stringify(procedures),
        treatmentPlan || null,
        userId || null,
        summaryId,
        tenantId,
      ]
    );
    return { summaryId, created: false };
  }

  await pool.query(
    `INSERT INTO visit_summaries (
      id, tenant_id, patient_id, encounter_id, provider_id, ambient_note_id,
      visit_date, provider_name, summary_text, symptoms_discussed,
      diagnosis_shared, treatment_plan, next_steps, chief_complaint,
      diagnoses, procedures, follow_up_instructions, generated_by,
      is_released
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, false)`,
    [
      summaryId,
      tenantId,
      target.patientId,
      target.encounterId,
      target.providerId,
      target.ambientNoteId,
      target.visitDate,
      target.providerName,
      summaryText,
      symptomsDiscussed,
      diagnosisShared || null,
      treatmentPlan || null,
      nextSteps || null,
      chiefComplaint || null,
      JSON.stringify(diagnoses),
      JSON.stringify(procedures),
      treatmentPlan || null,
      userId || null,
    ]
  );

  return { summaryId, created: true };
}

type AppliedCopilotActions = {
  encounterUpdated: boolean;
  diagnosesCreated: number;
  chargesCreated: number;
  billingReviewItemsCreated: number;
};

type CopilotCodeSuggestionForWorkflow = {
  type: 'em' | 'cpt' | 'icd10';
  code: string;
  description: string;
  confidence: number;
  rationale: string;
};

type CopilotDraftChargeResult = {
  chargesCreated: number;
  chargeIds: string[];
};

function getClinicalCopilotCodes(
  result: ClinicalCopilotResult,
  types: Array<'em' | 'cpt' | 'icd10'>,
  minConfidence = 0.6,
): CopilotCodeSuggestionForWorkflow[] {
  const seen = new Set<string>();
  return result.suggestedCodes
    .filter((code) => types.includes(code.type))
    .map((code) => ({
      type: code.type,
      code: code.code.trim().toUpperCase(),
      description: toTrimmedString(code.description),
      confidence: normalizeConfidence(code.confidence),
      rationale: toTrimmedString(code.rationale),
    }))
    .filter((code) => code.code && code.confidence >= minConfidence)
    .filter((code) => {
      const key = `${code.type}:${code.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function formatCopilotCodeLine(code: ReturnType<typeof getClinicalCopilotCodes>[number]): string {
  const confidence = Math.round(code.confidence * 100);
  const description = code.description ? ` - ${code.description}` : '';
  const rationale = code.rationale ? ` (${code.rationale})` : '';
  return `${code.code}${description}; confidence ${confidence}%${rationale}`;
}

function normalizeChargeCents(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}

function normalizeCopilotServiceDate(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function inferCopilotChargeCodeType(code: string): 'CPT' | 'HCPCS' | 'INTERNAL' {
  if (/^\d{5}$/.test(code)) return 'CPT';
  if (/^[A-Z]\d{4}$/.test(code)) return 'HCPCS';
  return 'INTERNAL';
}

async function lookupCopilotChargeCode(
  tenantId: string,
  rawCode: string,
): Promise<{ code: string; description: string | null; feeCents: number; codeType: 'CPT' | 'HCPCS' | 'INTERNAL'; billingRoute: 'insurance' | 'self_pay' | 'non_billable'; chargeGroup: string | null }> {
  const code = rawCode.trim().toUpperCase();
  const result = await pool.query(
    `with tenant_fee_items as (
       select distinct on (upper(fsi.cpt_code))
         fsi.cpt_code,
         nullif(fsi.cpt_description, '') as cpt_description,
         nullif(fsi.category, '') as category,
         coalesce(fsi.fee_cents, round(fsi.fee_amount * 100)::int, 0) as fee_cents,
         nullif(to_jsonb(fsi)->>'code_type', '') as code_type,
         nullif(to_jsonb(fsi)->>'billing_route', '') as billing_route
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
         and upper(fsi.cpt_code) = upper($2)
       order by upper(fsi.cpt_code), fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     )
     select
       coalesce(tfi.cpt_code, c.code, $2) as code,
       coalesce(tfi.cpt_description, c.description) as description,
       coalesce(tfi.category, c.category) as category,
       coalesce(tfi.fee_cents, c.default_fee_cents, 0) as "feeCents",
       coalesce(tfi.code_type, nullif(to_jsonb(c)->>'code_type', '')) as "codeType",
       coalesce(tfi.billing_route, nullif(to_jsonb(c)->>'billing_route', '')) as "billingRoute"
     from tenant_fee_items tfi
     full outer join cpt_codes c on upper(c.code) = upper(tfi.cpt_code)
     where upper(coalesce(tfi.cpt_code, c.code, $2)) = upper($2)
     limit 1`,
    [tenantId, code],
  );

  const row = result.rows[0] || {};
  const normalizedCode = String(row.code || code).trim().toUpperCase();
  const codeType = String(row.codeType || inferCopilotChargeCodeType(normalizedCode)).toUpperCase();
  const billingRoute = String(row.billingRoute || (codeType === 'INTERNAL' ? 'self_pay' : 'insurance')).toLowerCase();

  return {
    code: normalizedCode,
    description: normalizeOptionalString(row.description) || null,
    feeCents: normalizeChargeCents(row.feeCents),
    codeType: codeType === 'HCPCS' || codeType === 'INTERNAL' ? codeType : 'CPT',
    billingRoute: billingRoute === 'self_pay' || billingRoute === 'non_billable' ? billingRoute : 'insurance',
    chargeGroup: normalizeOptionalString(row.category) || null,
  };
}

async function createClinicalCopilotDraftCharges(options: {
  tenantId: string;
  target: CopilotVisitSummaryTarget;
  result: ClinicalCopilotResult;
  diagnosisCodes: CopilotCodeSuggestionForWorkflow[];
}): Promise<CopilotDraftChargeResult> {
  if (!options.target.encounterId) {
    return { chargesCreated: 0, chargeIds: [] };
  }

  let chargesCreated = 0;
  const chargeIds: string[] = [];
  const icdCodes = options.diagnosisCodes.map((diagnosis) => diagnosis.code).slice(0, 12);
  const serviceDate = normalizeCopilotServiceDate(options.target.visitDate);
  const suggestedBillingCodes = getClinicalCopilotCodes(options.result, ['em', 'cpt']);

  for (const suggestion of suggestedBillingCodes.slice(0, 8)) {
    const existing = await pool.query(
      `select id
         from charges
        where tenant_id = $1
          and encounter_id = $2
          and upper(cpt_code) = upper($3)
          and coalesce(status, 'pending') <> 'voided'
        limit 1`,
      [options.tenantId, options.target.encounterId, suggestion.code],
    );
    if (existing.rowCount) {
      continue;
    }

    const codeInfo = await lookupCopilotChargeCode(options.tenantId, suggestion.code);
    const amountCents = codeInfo.feeCents;
    const patientResponsibilityCents = codeInfo.billingRoute === 'self_pay' ? amountCents : 0;
    const insuranceResponsibilityCents = codeInfo.billingRoute === 'insurance' ? amountCents : 0;
    const chargeId = crypto.randomUUID();
    await pool.query(
      `insert into charges(
         id, tenant_id, encounter_id, patient_id, service_date,
         cpt_code, code_type, billing_route, description, icd_codes, linked_diagnosis_ids,
         quantity, fee_cents, amount_cents, amount, status, source, charge_group, line_note,
         patient_responsibility_cents, insurance_responsibility_cents
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::int,round(($14::numeric / 100), 2),$15,$16,$17,$18,$19,$20)`,
      [
        chargeId,
        options.tenantId,
        options.target.encounterId,
        options.target.patientId,
        serviceDate,
        codeInfo.code,
        codeInfo.codeType,
        codeInfo.billingRoute,
        suggestion.description || codeInfo.description || codeInfo.code,
        codeInfo.billingRoute === 'insurance' ? icdCodes : [],
        [],
        1,
        codeInfo.feeCents || null,
        amountCents,
        codeInfo.billingRoute === 'self_pay' ? 'self_pay' : 'pending',
        'clinical_copilot_assistant',
        codeInfo.chargeGroup || (suggestion.type === 'em' ? 'Evaluation & Management' : 'AI Assistant Suggested CPT'),
        suggestion.rationale || 'Clinical Copilot suggested; clinician submitted for billing review.',
        patientResponsibilityCents,
        insuranceResponsibilityCents,
      ],
    );
    chargeIds.push(chargeId);
    chargesCreated++;
  }

  return { chargesCreated, chargeIds };
}

function buildCopilotEncounterAddendum(summaryId: string, result: ClinicalCopilotResult): string {
  const summary = toTrimmedString(result.visitSummary || result.answer);
  const diagnosisCodes = getClinicalCopilotCodes(result, ['icd10']);
  const billingCodes = getClinicalCopilotCodes(result, ['em', 'cpt']);
  const lines = [
    `AI Assistant Applied Summary [${summaryId}]`,
    summary ? `Summary: ${summary}` : null,
    diagnosisCodes.length ? `Suggested diagnoses: ${diagnosisCodes.map(formatCopilotCodeLine).join('; ')}` : null,
    billingCodes.length ? `Suggested billing review: ${billingCodes.map(formatCopilotCodeLine).join('; ')}` : null,
    result.patientInstructions.length ? `Patient instructions: ${result.patientInstructions.map(toTrimmedString).filter(Boolean).join('; ')}` : null,
    result.followUpTasks.length ? `Follow-up tasks: ${result.followUpTasks.map(toTrimmedString).filter(Boolean).join('; ')}` : null,
    result.missingData.length ? `Documentation gaps to review: ${result.missingData.map(toTrimmedString).filter(Boolean).join('; ')}` : null,
    'Clinician review required before signing the encounter or releasing billing.',
  ].filter(Boolean);

  return lines.join('\n');
}

async function applyClinicalCopilotResponseToEncounter(
  tenantId: string,
  userId: string,
  target: CopilotVisitSummaryTarget,
  result: ClinicalCopilotResult,
  summaryId: string,
): Promise<AppliedCopilotActions> {
  if (!target.encounterId) {
    return { encounterUpdated: false, diagnosesCreated: 0, chargesCreated: 0, billingReviewItemsCreated: 0 };
  }

  const encounter = await pool.query(
    `select id, patient_id, provider_id, status, assessment_plan
       from encounters
      where id = $1 and tenant_id = $2`,
    [target.encounterId, tenantId],
  );

  if (!encounter.rowCount) {
    throw Object.assign(new Error('Linked encounter not found'), { httpStatus: 404 });
  }

  const encounterRow = encounter.rows[0];
  if (isImmutableEncounterStatus(encounterRow.status)) {
    throw Object.assign(new Error(immutableEncounterErrorMessage(encounterRow.status)), { httpStatus: 409 });
  }

  let encounterUpdated = false;
  const marker = `AI Assistant Applied Summary [${summaryId}]`;
  const existingAssessmentPlan = toTrimmedString(encounterRow.assessment_plan);
  if (!existingAssessmentPlan.includes(marker)) {
    const addendum = buildCopilotEncounterAddendum(summaryId, result);
    const nextAssessmentPlan = [existingAssessmentPlan, addendum].filter(Boolean).join('\n\n');
    await pool.query(
      `update encounters
          set assessment_plan = $1,
              updated_at = now()
        where id = $2 and tenant_id = $3`,
      [nextAssessmentPlan, target.encounterId, tenantId],
    );
    encounterUpdated = true;
  }

  let diagnosesCreated = 0;
  const diagnosisCodes = getClinicalCopilotCodes(result, ['icd10']);
  if (diagnosisCodes.length > 0) {
    const existingDiagnosisResult = await pool.query(
      `select id, upper(icd10_code) as code, is_primary
         from encounter_diagnoses
        where encounter_id = $1 and tenant_id = $2`,
      [target.encounterId, tenantId],
    );
    const existingCodes = new Set(existingDiagnosisResult.rows.map((row: any) => String(row.code || '').toUpperCase()));
    const hasPrimary = existingDiagnosisResult.rows.some((row: any) => row.is_primary);

    for (const diagnosis of diagnosisCodes.slice(0, 5)) {
      if (existingCodes.has(diagnosis.code)) {
        continue;
      }

      await pool.query(
        `insert into encounter_diagnoses (
           id, tenant_id, encounter_id, icd10_code, description, is_primary, created_at
         ) values ($1, $2, $3, $4, $5, $6, now())`,
        [
          crypto.randomUUID(),
          tenantId,
          target.encounterId,
          diagnosis.code,
          `${diagnosis.description || diagnosis.code} (AI assistant suggested, clinician review required)`,
          !hasPrimary && diagnosesCreated === 0,
        ],
      );
      existingCodes.add(diagnosis.code);
      diagnosesCreated++;
    }
  }

  let billingReviewItemsCreated = 0;
  const draftCharges = await createClinicalCopilotDraftCharges({
    tenantId,
    target,
    result,
    diagnosisCodes,
  });
  const suggestedBillingCodes = getClinicalCopilotCodes(result, ['em', 'cpt']);
  if (suggestedBillingCodes.length > 0) {
    const reviewItem = await createFinancialWorkQueueItem({
      tenantId,
      encounterId: target.encounterId,
      patientId: encounterRow.patient_id || target.patientId,
      issueType: 'clinical_copilot_charge_review',
      severity: 'warning',
      message: `Clinical Copilot added ${suggestedBillingCodes.length} pending billing code(s). Review before claim submission.`,
      errorDetail: 'Clinical Copilot created pending charge lines for review, but nothing is submitted to claims automatically. A clinician or biller must confirm supported CPT/E/M codes, diagnoses, units, and modifiers.',
      metadata: {
        clinicalCopilotSummaryId: summaryId,
        draftChargeIds: draftCharges.chargeIds,
        suggestedBillingCodes,
        suggestedIcd10Codes: diagnosisCodes,
        missingData: result.missingData,
        chartEvidence: result.chartEvidence,
        nextStep: 'Review the pending encounter charge lines and update codes, units, modifiers, or diagnoses before claim submission.',
      },
      createdBy: userId,
    });

    billingReviewItemsCreated = reviewItem ? 1 : 0;
  }

  return { encounterUpdated, diagnosesCreated, chargesCreated: draftCharges.chargesCreated, billingReviewItemsCreated };
}

// ============================================================================
// RECORDING ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/recordings/start
 * Start a new recording session
 */
router.post('/recordings/start', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const parsed = startRecordingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { encounterId, patientId, providerId, consentObtained, consentMethod } = parsed.data;
    const tenantId = req.user!.tenantId;
    const recordingId = crypto.randomUUID();

    if (!consentObtained) {
      return res.status(400).json({ error: 'Patient consent required before recording' });
    }

    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );
    if (patientCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const providerCheck = await pool.query(
      'SELECT id FROM providers WHERE id = $1 AND tenant_id = $2',
      [providerId, tenantId]
    );
    if (providerCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (encounterId) {
      const encounterCheck = await pool.query(
        'SELECT id, patient_id FROM encounters WHERE id = $1 AND tenant_id = $2',
        [encounterId, tenantId]
      );
      if (encounterCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Encounter not found' });
      }
      if (encounterCheck.rows[0].patient_id !== patientId) {
        return res.status(400).json({ error: 'Encounter does not match patient' });
      }
    }

    await pool.query(
      `INSERT INTO ambient_recordings (
        id, tenant_id, encounter_id, patient_id, provider_id,
        status, recording_status, consent_obtained, consent_method, consent_timestamp,
        started_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())`,
      [
        recordingId,
        tenantId,
        encounterId || null,
        patientId,
        providerId,
        'recording',
        'recording',
        consentObtained,
        consentMethod || null,
      ]
    );

    await auditLog(tenantId, req.user?.id || null, 'ambient_recording_start', 'ambient_recording', recordingId);

    res.status(201).json({
      id: recordingId,
      recordingId,
      status: 'recording',
      startedAt: new Date().toISOString()
    });
  } catch (error: any) {
    logAmbientError('Start recording error', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

/**
 * POST /api/ambient/recordings/:id/stop
 * Stop an in-progress recording session (without uploading audio yet)
 */
router.post('/recordings/:id/stop', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;

    const parsed = stopRecordingSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { durationSeconds } = parsed.data;

    const recordingCheck = await pool.query(
      `SELECT id, recording_status as "recordingStatus", duration_seconds as "durationSeconds",
              started_at as "startedAt", completed_at as "completedAt"
       FROM ambient_recordings
       WHERE id = $1 AND tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (recordingCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const current = recordingCheck.rows[0];
    const currentStatus = String(current.recordingStatus || '');

    if (currentStatus === 'completed') {
      return res.status(409).json({ error: 'Recording already completed' });
    }
    if (currentStatus === 'failed') {
      return res.status(409).json({ error: 'Cannot stop a failed recording' });
    }

    await pool.query(
      `UPDATE ambient_recordings
       SET recording_status = 'stopped',
           duration_seconds = GREATEST(
             COALESCE($1, 0),
             COALESCE(duration_seconds, 0),
             1
           ),
           completed_at = COALESCE(
             completed_at,
             NOW()
           ),
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [durationSeconds || null, recordingId, tenantId]
    );

    await auditLog(tenantId, req.user?.id || null, 'ambient_recording_stop', 'ambient_recording', recordingId);

    res.json({
      recordingId,
      status: 'stopped',
      duration: durationSeconds ?? current.durationSeconds ?? null,
      completedAt: current.completedAt || new Date().toISOString()
    });
  } catch (error: any) {
    logAmbientError('Stop recording error', error);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

/**
 * POST /api/ambient/recordings/:id/upload
 * Upload audio file for an existing recording
 */
router.post('/recordings/:id/upload', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), upload.single('audio'), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const parsed = completeRecordingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    const { durationSeconds } = parsed.data;

    // Verify recording exists and belongs to tenant
    const recordingCheck = await pool.query(
      `SELECT id, recording_status as "recordingStatus"
       FROM ambient_recordings
       WHERE id = $1 AND tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (recordingCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    const recordingStatus = recordingCheck.rows[0]?.recordingStatus;
    if (recordingStatus === 'completed') {
      return res.status(409).json({ error: 'Recording already uploaded' });
    }
    if (recordingStatus === 'failed') {
      return res.status(409).json({ error: 'Cannot upload a failed recording' });
    }

    // Update recording with file info
    await pool.query(
      `UPDATE ambient_recordings
       SET file_path = $1,
           file_size_bytes = $2,
           mime_type = $3,
           duration_seconds = GREATEST($4, COALESCE(duration_seconds, 0), 1),
           recording_status = 'completed',
           status = 'completed',
           completed_at = COALESCE(completed_at, NOW()),
           updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
      [req.file.path, req.file.size, req.file.mimetype, durationSeconds, recordingId, tenantId]
    );

    await auditLog(tenantId, req.user?.id || null, 'ambient_recording_upload', 'ambient_recording', recordingId);

    // Automatically start transcription
    try {
      await startTranscription(recordingId, tenantId, req.file!.path, durationSeconds);
    } catch (error) {
      logAmbientError('Auto-transcription failed', error);
      // Don't fail the upload if transcription fails
    }

    res.json({
      recordingId,
      status: 'completed',
      fileSize: req.file.size,
      duration: durationSeconds
    });
  } catch (error: any) {
    logAmbientError('Upload recording error', error);
    res.status(500).json({ error: 'Failed to upload recording' });
  }
});

/**
 * GET /api/ambient/recordings
 * List recordings for the current tenant
 */
router.get('/recordings', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { encounterId, patientId, status, limit = 50 } = req.query;

    let query = `
      SELECT
        r.id,
        r.encounter_id as "encounterId",
        r.patient_id as "patientId",
        r.provider_id as "providerId",
        r.recording_status as "status",
        r.duration_seconds as "durationSeconds",
        r.consent_obtained as "consentObtained",
        r.consent_method as "consentMethod",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName",
        pr.full_name as "providerName"
      FROM ambient_recordings r
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      WHERE r.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (encounterId) {
      query += ` AND r.encounter_id = $${paramIndex++}`;
      params.push(encounterId);
    }

    if (patientId) {
      query += ` AND r.patient_id = $${paramIndex++}`;
      params.push(patientId);
    }

    if (status) {
      query += ` AND r.recording_status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await pool.query(query, params);

    res.json({ recordings: result.rows });
  } catch (error: any) {
    logAmbientError('List recordings error', error);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

/**
 * GET /api/ambient/recordings/:id
 * Get recording details
 */
router.get('/recordings/:id', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        r.id,
        r.encounter_id as "encounterId",
        r.patient_id as "patientId",
        r.provider_id as "providerId",
        r.recording_status as "status",
        r.duration_seconds as "durationSeconds",
        r.consent_obtained as "consentObtained",
        r.consent_method as "consentMethod",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.created_at as "createdAt",
        p.first_name || ' ' || p.last_name as "patientName",
        pr.full_name as "providerName"
      FROM ambient_recordings r
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      WHERE r.id = $1 AND r.tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json({ recording: result.rows[0] });
  } catch (error: any) {
    logAmbientError('Get recording error', error);
    res.status(500).json({ error: 'Failed to get recording' });
  }
});

// ============================================================================
// TRANSCRIPTION ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/recordings/:id/transcribe
 * Manually trigger transcription for a recording
 */
router.post('/recordings/:id/transcribe', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;

    const recording = await pool.query(
      'SELECT file_path, duration_seconds FROM ambient_recordings WHERE id = $1 AND tenant_id = $2',
      [recordingId, tenantId]
    );

    if (recording.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const { file_path, duration_seconds } = recording.rows[0];

    if (!file_path) {
      return res.status(400).json({ error: 'No audio file uploaded yet' });
    }

    const transcriptId = await startTranscription(recordingId, tenantId, file_path!, duration_seconds!);

    res.json({
      id: transcriptId,
      transcriptId,
      status: 'processing',
      message: 'Transcription started'
    });
  } catch (error: any) {
    logAmbientError('Transcribe error', error);
    res.status(500).json({ error: 'Failed to start transcription' });
  }
});

/**
 * GET /api/ambient/transcripts/:id
 * Get transcript details
 */
router.get('/transcripts/:id', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const transcriptId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        recording_id as "recordingId",
        encounter_id as "encounterId",
        transcript_text as "transcriptText",
        transcript_segments as "transcriptSegments",
        language,
        speakers,
        speaker_count as "speakerCount",
        confidence_score as "confidenceScore",
        word_count as "wordCount",
        phi_masked as "phiMasked",
        transcription_status as "transcriptionStatus",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM ambient_transcripts
      WHERE id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.json({ transcript: result.rows[0] });
  } catch (error: any) {
    logAmbientError('Get transcript error', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

/**
 * GET /api/ambient/recordings/:id/transcript
 * Get transcript for a recording
 */
router.get('/recordings/:id/transcript', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        id,
        recording_id as "recordingId",
        encounter_id as "encounterId",
        transcript_text as "transcriptText",
        transcript_segments as "transcriptSegments",
        language,
        speakers,
        speaker_count as "speakerCount",
        confidence_score as "confidenceScore",
        word_count as "wordCount",
        phi_masked as "phiMasked",
        transcription_status as "transcriptionStatus",
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM ambient_transcripts
      WHERE recording_id = $1 AND tenant_id = $2`,
      [recordingId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    res.json({ transcript: result.rows[0] });
  } catch (error: any) {
    logAmbientError('Get recording transcript error', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// ============================================================================
// GENERATED NOTES ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/transcripts/:id/generate-note
 * Generate clinical note from transcript
 */
router.post('/transcripts/:id/generate-note', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const transcriptId = req.params.id!;
    const tenantId = req.user!.tenantId;

    const transcript = await pool.query(
      `SELECT transcript_text, transcript_segments, encounter_id, recording_id
       FROM ambient_transcripts WHERE id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId]
    );

    if (transcript.rowCount === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const { transcript_text, transcript_segments, encounter_id, recording_id } = transcript.rows[0];

    if (!transcript_text) {
      return res.status(400).json({ error: 'Transcript not completed yet' });
    }

    const noteId = await generateNote(tenantId, transcriptId, encounter_id, transcript_text!, transcript_segments);

    res.json({
      noteId,
      status: 'processing',
      message: 'Note generation started'
    });
  } catch (error: any) {
    logAmbientError('Generate note error', error);
    res.status(500).json({ error: 'Failed to generate note' });
  }
});

/**
 * GET /api/ambient/notes/:id
 * Get generated note details
 */
router.get('/notes/:id', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        n.id,
        n.transcript_id as "transcriptId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.mentioned_medications as "mentionedMedications",
        n.mentioned_allergies as "mentionedAllergies",
        n.follow_up_tasks as "followUpTasks",
        n.differential_diagnoses as "differentialDiagnoses",
        n.recommended_tests as "recommendedTests",
        n.note_content as "noteContent",
        n.overall_confidence as "overallConfidence",
        n.section_confidence as "sectionConfidence",
        n.review_status as "reviewStatus",
        n.generation_status as "generationStatus",
        n.reviewed_by as "reviewedBy",
        n.reviewed_at as "reviewedAt",
        n.created_at as "createdAt",
        n.completed_at as "completedAt",
        t.transcript_text as "transcriptText",
        r.patient_id as "patientId",
        r.provider_id as "providerId"
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      JOIN ambient_recordings r ON r.id = t.recording_id
      WHERE n.id = $1 AND n.tenant_id = $2`,
      [noteId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Generated note not found' });
    }

    res.json({ note: result.rows[0] });
  } catch (error: any) {
    logAmbientError('Get note error', error);
    res.status(500).json({ error: 'Failed to get note' });
  }
});

/**
 * GET /api/ambient/encounters/:encounterId/notes
 * Get all generated notes for an encounter
 */
router.get('/encounters/:encounterId/notes', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const encounterId = req.params.encounterId;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        n.id,
        n.transcript_id as "transcriptId",
        n.encounter_id as "encounterId",
        n.chief_complaint as "chiefComplaint",
        n.hpi,
        n.ros,
        n.physical_exam as "physicalExam",
        n.assessment,
        n.plan,
        n.suggested_icd10_codes as "suggestedIcd10Codes",
        n.suggested_cpt_codes as "suggestedCptCodes",
        n.mentioned_medications as "mentionedMedications",
        n.mentioned_allergies as "mentionedAllergies",
        n.follow_up_tasks as "followUpTasks",
        n.differential_diagnoses as "differentialDiagnoses",
        n.recommended_tests as "recommendedTests",
        n.note_content as "noteContent",
        n.overall_confidence as "overallConfidence",
        n.section_confidence as "sectionConfidence",
        n.review_status as "reviewStatus",
        n.generation_status as "generationStatus",
        n.reviewed_by as "reviewedBy",
        n.reviewed_at as "reviewedAt",
        n.created_at as "createdAt",
        n.completed_at as "completedAt",
        t.created_at as "transcriptCreatedAt"
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      WHERE n.encounter_id = $1 AND n.tenant_id = $2
      ORDER BY n.created_at DESC`,
      [encounterId, tenantId]
    );

    res.json({ notes: result.rows });
  } catch (error: any) {
    logAmbientError('Get encounter notes error', error);
    res.status(500).json({ error: 'Failed to get encounter notes' });
  }
});

/**
 * PATCH /api/ambient/notes/:id
 * Update a generated note (creates audit trail)
 */
router.patch('/notes/:id', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updates = parsed.data;

    // Get current note values for audit trail
    const current = await pool.query(
      'SELECT * FROM ambient_generated_notes WHERE id = $1 AND tenant_id = $2',
      [noteId, tenantId]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const currentNote = current.rows[0];

    // Update note
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'editReason') {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
        updateFields.push(`${dbKey} = $${paramIndex++}`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(noteId, tenantId);

    await pool.query(
      `UPDATE ambient_generated_notes SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
      updateValues
    );

    // Create audit trail entries for each changed field
    for (const [key, newValue] of Object.entries(updates)) {
      if (newValue !== undefined && key !== 'editReason') {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        const oldValue = currentNote[dbKey];

        if (oldValue !== newValue) {
          await pool.query(
            `INSERT INTO ambient_note_edits (
              id, tenant_id, generated_note_id, edited_by, section,
              previous_value, new_value, change_type, edit_reason, is_significant
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              crypto.randomUUID(),
              tenantId,
              noteId,
              userId,
              dbKey,
              oldValue,
              newValue,
              'update',
              updates.editReason || null,
              true
            ]
          );
        }
      }
    }

    await auditLog(tenantId, userId || null, 'ambient_note_edit', 'ambient_note', noteId);

    res.json({ success: true, message: 'Note updated successfully' });
  } catch (error: any) {
    logAmbientError('Update note error', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * POST /api/ambient/notes/:id/review
 * Submit review decision (approve/reject)
 */
router.post('/notes/:id/review', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = reviewActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { action, reason } = parsed.data;

    let newStatus: string;
    switch (action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'reject':
        newStatus = 'rejected';
        break;
      case 'request_regeneration':
        newStatus = 'regenerating';
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    const updateResult = await pool.query(
      `UPDATE ambient_generated_notes
       SET review_status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [newStatus, userId, noteId, tenantId]
    );
    if ((updateResult.rowCount || 0) === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Create audit entry
    await pool.query(
      `INSERT INTO ambient_note_edits (
        id, tenant_id, generated_note_id, edited_by, section,
        previous_value, new_value, change_type, edit_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), tenantId, noteId, userId, 'review_status', 'pending', newStatus, action, reason || null]
    );

    await auditLog(tenantId, userId || null, `ambient_note_${action}`, 'ambient_note', noteId);

    res.json({
      success: true,
      status: newStatus,
      message: action === 'request_regeneration'
        ? 'Note regeneration requested successfully'
        : `Note ${action}d successfully`
    });
  } catch (error: any) {
    logAmbientError('Review note error', error);
    res.status(500).json({ error: 'Failed to review note' });
  }
});

/**
 * POST /api/ambient/copilot/respond
 * Ask the clinical copilot a chart-grounded question
 */
router.post('/copilot/respond', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const parsed = clinicalCopilotRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid clinical copilot request', details: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { prompt, history, patientId, encounterId, noteId, recordingId } = parsed.data;

    const context = await resolveClinicalCopilotContext(tenantId, {
      patientId,
      encounterId,
      noteId,
      recordingId,
    });

    const result = await askClinicalCopilot({
      question: prompt,
      history,
      context,
    });

    void Promise.resolve(
      auditLog(
        tenantId,
        userId || null,
        'ambient_copilot_query',
        'ambient_copilot',
        noteId || encounterId || patientId || recordingId || 'copilot'
      )
    ).catch((error) => logAmbientWarning('Clinical copilot audit log failed', error));

    res.json({
      ...result,
      context: {
        patientId: context.patientId,
        encounterId: context.encounterId,
        noteId: context.noteId,
        recordingId: context.recordingId,
        hasTranscript: Boolean(context.transcriptExcerpt),
        hasAmbientNote: Boolean(context.note),
      },
    });
  } catch (error: any) {
    logAmbientError('Clinical copilot error', error);
    res.status(500).json({ error: 'Failed to get clinical copilot response' });
  }
});

/**
 * POST /api/ambient/copilot/visit-summary
 * Generate a copilot visit summary and save it to the patient's visit history
 */
router.post('/copilot/visit-summary', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const parsed = clinicalCopilotVisitSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid clinical copilot visit summary request', details: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { prompt, history, patientId, encounterId, noteId, recordingId } = parsed.data;

    const context = await resolveClinicalCopilotContext(tenantId, {
      patientId,
      encounterId,
      noteId,
      recordingId,
    });

    const target = await resolveCopilotVisitSummaryTarget(
      tenantId,
      { patientId, encounterId, noteId, recordingId },
      context
    );
    if (!target) {
      return res.status(404).json({ error: 'Could not find a patient or encounter to save this summary to' });
    }
    if (patientId && target.patientId !== patientId) {
      return res.status(400).json({ error: 'Summary target does not match the selected patient' });
    }

    const result = await askClinicalCopilot({
      question: prompt || COPILOT_VISIT_SUMMARY_PROMPT,
      history,
      context,
    });
    const saved = await upsertCopilotVisitSummary(tenantId, userId, target, result, context);

    await auditLog(
      tenantId,
      userId || null,
      saved.created ? 'ambient_copilot_visit_summary_created' : 'ambient_copilot_visit_summary_updated',
      'visit_summary',
      saved.summaryId
    );

    res.status(saved.created ? 201 : 200).json({
      summaryId: saved.summaryId,
      created: saved.created,
      message: saved.created
        ? 'Encounter Copilot summary saved to patient history'
        : 'Encounter Copilot summary updated in patient history',
      response: result,
      context: {
        patientId: target.patientId,
        encounterId: target.encounterId,
        noteId: context.noteId,
        recordingId: context.recordingId,
        hasTranscript: Boolean(context.transcriptExcerpt),
        hasAmbientNote: Boolean(context.note),
      },
    });
  } catch (error: any) {
    logAmbientError('Clinical copilot visit summary save error', error);
    res.status(500).json({ error: 'Failed to save clinical copilot visit summary' });
  }
});

/**
 * POST /api/ambient/copilot/apply
 * Apply an existing clinical copilot response to the chart and billing review workflow
 */
router.post('/copilot/apply', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const parsed = clinicalCopilotApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid clinical copilot apply request', details: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { patientId, encounterId, noteId, recordingId, response } = parsed.data;

    if (!response.visitSummary && !response.answer && response.suggestedCodes.length === 0) {
      return res.status(400).json({ error: 'Clinical copilot response does not contain anything to apply' });
    }

    const context = await resolveClinicalCopilotContext(tenantId, {
      patientId,
      encounterId,
      noteId,
      recordingId,
    });

    const target = await resolveCopilotVisitSummaryTarget(
      tenantId,
      { patientId, encounterId, noteId, recordingId },
      context,
    );
    if (!target) {
      return res.status(404).json({ error: 'Could not find a patient or encounter to apply this assistant response to' });
    }
    if (patientId && target.patientId !== patientId) {
      return res.status(400).json({ error: 'Assistant response target does not match the selected patient' });
    }

    const saved = await upsertCopilotVisitSummary(tenantId, userId, target, response, context);
    const structuredActions = await applyClinicalCopilotResponseToEncounter(tenantId, userId, target, response, saved.summaryId);

    await auditLog(
      tenantId,
      userId || null,
      'ambient_copilot_applied_to_chart',
      'visit_summary',
      saved.summaryId,
    );

    res.status(saved.created ? 201 : 200).json({
      summaryId: saved.summaryId,
      created: saved.created,
      message: structuredActions.diagnosesCreated > 0 || structuredActions.billingReviewItemsCreated > 0
        ? 'AI assistant response added to the chart; diagnosis suggestions and billing review are awaiting review'
        : 'AI assistant response added to the chart',
      structuredActions,
      context: {
        patientId: target.patientId,
        encounterId: target.encounterId,
        noteId: context.noteId,
        recordingId: context.recordingId,
        hasTranscript: Boolean(context.transcriptExcerpt),
        hasAmbientNote: Boolean(context.note),
      },
    });
  } catch (error: any) {
    logAmbientError('Clinical copilot apply error', error);
    res.status(error?.httpStatus || 500).json({ error: error?.httpStatus ? error.message : 'Failed to apply clinical copilot response' });
  }
});

/**
 * POST /api/ambient/notes/:id/apply-to-encounter
 * Apply approved note to encounter
 */
router.post('/notes/:id/apply-to-encounter', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const parsed = applyNoteSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const note = await pool.query(
      `SELECT * FROM ambient_generated_notes WHERE id = $1 AND tenant_id = $2`,
      [noteId, tenantId]
    );

    if (note.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const noteData = note.rows[0];

    if (noteData.review_status !== 'approved') {
      return res.status(400).json({ error: 'Note must be approved before applying to encounter' });
    }

    if (!noteData.encounter_id) {
      return res.status(400).json({ error: 'No encounter associated with this note' });
    }

    const encounterStatus = await pool.query(
      `SELECT status FROM encounters WHERE id = $1 AND tenant_id = $2`,
      [noteData.encounter_id, tenantId]
    );

    if (!encounterStatus.rowCount) {
      return res.status(404).json({ error: 'Linked encounter not found' });
    }

    if (isImmutableEncounterStatus(encounterStatus.rows[0].status)) {
      return res.status(409).json({ error: immutableEncounterErrorMessage(encounterStatus.rows[0].status) });
    }

    const assessmentPlan = [noteData.assessment, noteData.plan]
      .map((section) => (typeof section === 'string' ? section.trim() : ''))
      .filter(Boolean)
      .join('\n\n') || null;

    // Update encounter with note content
    await pool.query(
      `UPDATE encounters
       SET chief_complaint = COALESCE($1, chief_complaint),
           hpi = COALESCE($2, hpi),
           ros = COALESCE($3, ros),
           exam = COALESCE($4, exam),
           assessment_plan = COALESCE($5, assessment_plan),
           updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [
        noteData.chief_complaint,
        noteData.hpi,
        noteData.ros,
        noteData.physical_exam,
        assessmentPlan,
        noteData.encounter_id,
        tenantId
      ]
    );

    const structuredActions = await applyStructuredActionsFromAmbientNote(
      tenantId,
      userId,
      noteData,
      parsed.data,
    );

    await auditLog(tenantId, userId || null, 'ambient_note_applied', 'encounter', noteData.encounter_id!);

    res.json({
      success: true,
      encounterId: noteData.encounter_id,
      structuredActions,
      message: 'Note applied to encounter successfully'
    });
  } catch (error: any) {
    logAmbientError('Apply note error', error);
    res.status(error?.httpStatus || 500).json({ error: error?.httpStatus ? error.message : 'Failed to apply note to encounter' });
  }
});

/**
 * GET /api/ambient/notes/:id/edits
 * Get edit history for a note
 */
router.get('/notes/:id/edits', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.id;
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT
        e.id,
        e.generated_note_id as "generatedNoteId",
        e.edited_by as "editedBy",
        u.full_name as "editorName",
        e.section,
        e.previous_value as "previousValue",
        e.new_value as "newValue",
        e.change_type as "changeType",
        e.edit_reason as "editReason",
        e.is_significant as "isSignificant",
        e.created_at as "createdAt"
      FROM ambient_note_edits e
      JOIN users u ON u.id = e.edited_by
      WHERE e.generated_note_id = $1 AND e.tenant_id = $2
      ORDER BY e.created_at DESC`,
      [noteId, tenantId]
    );

    res.json({ edits: result.rows });
  } catch (error: any) {
    logAmbientError('Get edits error', error);
    res.status(500).json({ error: 'Failed to get edit history' });
  }
});

/**
 * DELETE /api/ambient/recordings/:id
 * Delete a recording and associated data
 */
router.delete('/recordings/:id', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const recordingId = req.params.id!;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Get file path for deletion
    const recording = await pool.query(
      'SELECT file_path FROM ambient_recordings WHERE id = $1 AND tenant_id = $2',
      [recordingId, tenantId]
    );

    if (recording.rowCount === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const filePath = recording.rows[0].file_path;

    // Delete from database (cascades to transcripts and notes)
    await pool.query('DELETE FROM ambient_recordings WHERE id = $1 AND tenant_id = $2', [recordingId, tenantId]);

    // Delete file
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        logAmbientError('Failed to delete audio file', error);
        // Don't fail the request if file deletion fails
      }
    }

    await auditLog(tenantId, userId || null, 'ambient_recording_delete', 'ambient_recording', recordingId);

    res.json({ success: true, message: 'Recording deleted successfully' });
  } catch (error: any) {
    logAmbientError('Delete recording error', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const SYMPTOM_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Rash', pattern: /\brash|eruption|lesion/ },
  { label: 'Itching', pattern: /\bitch|pruritus/ },
  { label: 'Pain', pattern: /\bpain|tender/ },
  { label: 'Burning', pattern: /\bburn|stinging/ },
  { label: 'Redness', pattern: /\bred|erythema/ },
  { label: 'Swelling', pattern: /\bswell|edema/ },
  { label: 'Scaling', pattern: /\bscale|scaly|flak/ },
  { label: 'Bleeding', pattern: /\bbleed|bleeding/ },
  { label: 'Blistering', pattern: /\bblister|vesicle|bulla/ },
  { label: 'Drainage', pattern: /\bdrain|ooz|discharge/ },
  { label: 'Fever', pattern: /\bfever|febrile/ },
];

const HISTORY_ONLY_SYMPTOM_CONTEXT =
  /\b(family history|personal history|history of|father|mother|parent|sibling|sun exposure|sunburn|tanning bed|in the past|previously|prior)\b/;

const NEGATED_OR_SAFETY_NET_SYMPTOM_CONTEXT =
  /\b(denies?|denied|no|not|without|doesn'?t|does not|didn'?t|did not|isn'?t|is not|call|return|watch for|seek care|come back sooner|follow up sooner|if you (notice|develop|have)|if it (starts|gets|becomes)|warning signs|wound care|after (the )?(biopsy|procedure))\b/;

function isUnsupportedSymptomSentence(sentence: string): boolean {
  const normalized = sentence.toLowerCase();
  const symptomWord = /\b(pain|hurt|tender|sore|itch|bleed|bled|crust|scab|drain|ooz|pus|discharge|fever|blister|rash|redness|swelling)\b/;

  if (HISTORY_ONLY_SYMPTOM_CONTEXT.test(normalized)) {
    return true;
  }

  if (NEGATED_OR_SAFETY_NET_SYMPTOM_CONTEXT.test(normalized) && symptomWord.test(normalized)) {
    return true;
  }

  if (/\b(any|do you have|have you had)\b.{0,55}\b(fever|pain|drainage|bleeding|itch|rash|pus|redness)\b\??/i.test(normalized)) {
    return true;
  }

  return false;
}

const LOW_VALUE_CONCERN_PATTERNS = [
  /\bconcern about potential skin cancer\b/i,
  /\bskin cancer concern\b/i,
  /\bcancer concern\b/i,
  /\bfamily history\b/i,
  /\bsun exposure\b/i,
  /\bsunburn\b/i,
  /\btanning bed\b/i,
];

type FormalAppointmentSummary = {
  symptoms: string[];
  probableDiagnoses: Array<{
    condition: string;
    probabilityPercent: number;
    reasoning: string;
    icd10Code?: string;
  }>;
  suggestedTests: Array<{
    testName: string;
    urgency: 'routine' | 'soon' | 'urgent';
    rationale: string;
    cptCode?: string;
  }>;
};

type SummaryDiagnosisCandidate = {
  condition: string;
  reasoning: string;
  icd10Code?: string;
  probabilityWeight: number;
};

type NoteGenerationContext = {
  recordingId: string | null;
  encounterId: string | null;
  providerId: string | null;
  agentConfig: AgentConfiguration | null;
  agentConfigSnapshot: string | null;
  patientContext?: PatientContext;
};

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function calculateAge(dob: unknown): number | undefined {
  const normalizedDob = toTrimmedString(dob);
  if (!normalizedDob) {
    return undefined;
  }

  const birthDate = new Date(normalizedDob);
  if (Number.isNaN(birthDate.getTime())) {
    return undefined;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : undefined;
}

function deriveSpecialtyFocus(
  appointmentTypeCategory: unknown,
  appointmentTypeName: unknown
): string | undefined {
  const category = toTrimmedString(appointmentTypeCategory).toLowerCase();
  const name = toTrimmedString(appointmentTypeName).toLowerCase();
  const combined = `${category} ${name}`.trim();

  if (!combined) {
    return undefined;
  }
  if (combined.includes('cosmetic') || combined.includes('botox') || combined.includes('filler') || combined.includes('laser')) {
    return 'cosmetic';
  }
  if (combined.includes('mohs')) {
    return 'mohs';
  }
  if (combined.includes('pediatric') || combined.includes('child')) {
    return 'pediatric_derm';
  }
  if (combined.includes('surgery') || combined.includes('procedure')) {
    return 'surgical_derm';
  }
  if (combined.includes('acne') || combined.includes('psoriasis') || combined.includes('eczema') || combined.includes('rash') || combined.includes('derm')) {
    return 'medical_derm';
  }
  return 'general';
}

function buildRelevantHistory(parts: Array<{ label: string; value: unknown }>): string | undefined {
  const history = parts
    .map(({ label, value }) => {
      const normalized = toTrimmedString(value);
      return normalized ? `${label}: ${normalized}` : '';
    })
    .filter(Boolean)
    .slice(0, 6);

  return history.length > 0 ? history.join('\n') : undefined;
}

function serializeAgentConfigSnapshot(agentConfig: AgentConfiguration | null): string | null {
  if (!agentConfig) {
    return null;
  }

  return JSON.stringify(agentConfig);
}

function shouldUsePersistedAgentConfig(
  agentConfig: AgentConfiguration | null,
  derivedSpecialtyFocus: string | undefined
): agentConfig is AgentConfiguration {
  if (!agentConfig) {
    return false;
  }

  const persistedFocus = toTrimmedString(agentConfig.specialtyFocus).toLowerCase();
  const derivedFocus = toTrimmedString(derivedSpecialtyFocus).toLowerCase();

  if (!derivedFocus || derivedFocus === 'cosmetic' || persistedFocus !== 'cosmetic') {
    return true;
  }

  logger.info('Ignoring stale cosmetic ambient agent config for non-cosmetic visit context', {
    agentConfigId: agentConfig.id,
    derivedSpecialtyFocus: derivedFocus,
  });
  return false;
}

async function resolveNoteGenerationContext(
  tenantId: string,
  transcriptId: string,
  encounterId: string | null
): Promise<NoteGenerationContext> {
  const contextResult = await pool.query(
    `SELECT
       t.recording_id,
       COALESCE($3::text, t.encounter_id, r.encounter_id) as effective_encounter_id,
       r.provider_id as recording_provider_id,
       r.agent_config_id as recording_agent_config_id,
       p.first_name as patient_first_name,
       p.last_name as patient_last_name,
       p.dob as patient_dob,
       p.allergies as patient_allergies,
       p.medications as patient_medications,
       e.provider_id as encounter_provider_id,
       e.chief_complaint as encounter_chief_complaint,
       e.hpi as encounter_hpi,
       e.ros as encounter_ros,
       e.exam as encounter_exam,
       e.assessment_plan as encounter_assessment_plan,
       pr.full_name as provider_name,
       at.id as appointment_type_id,
       at.name as appointment_type_name,
       at.category as appointment_type_category
     FROM ambient_transcripts t
     LEFT JOIN ambient_recordings r
       ON r.id = t.recording_id
      AND r.tenant_id = t.tenant_id
     LEFT JOIN encounters e
       ON e.id = COALESCE($3::text, t.encounter_id, r.encounter_id)
      AND e.tenant_id = t.tenant_id
     LEFT JOIN patients p
       ON p.id = r.patient_id
      AND p.tenant_id = t.tenant_id
     LEFT JOIN providers pr
       ON pr.id = COALESCE(e.provider_id, r.provider_id)
      AND pr.tenant_id = t.tenant_id
     LEFT JOIN appointments a
       ON a.id = e.appointment_id
      AND a.tenant_id = t.tenant_id
     LEFT JOIN appointment_types at
       ON at.id = a.appointment_type_id
      AND at.tenant_id = t.tenant_id
     WHERE t.id = $1
       AND t.tenant_id = $2`,
    [transcriptId, tenantId, encounterId]
  );

  const row = contextResult.rows[0] || {};
  const recordingId = row.recording_id || null;
  const providerId = row.encounter_provider_id || row.recording_provider_id || null;
  const appointmentTypeId = toTrimmedString(row.appointment_type_id) || null;
  const appointmentTypeName = toTrimmedString(row.appointment_type_name) || undefined;
  const appointmentTypeCategory = toTrimmedString(row.appointment_type_category) || undefined;
  const derivedSpecialtyFocus =
    deriveSpecialtyFocus(appointmentTypeCategory, appointmentTypeName) || undefined;

  let agentConfig: AgentConfiguration | null = null;
  const persistedAgentConfigId = toTrimmedString(row.recording_agent_config_id) || null;

  if (persistedAgentConfigId) {
    const persistedAgentConfig = await agentConfigService.getConfiguration(persistedAgentConfigId, tenantId);
    if (shouldUsePersistedAgentConfig(persistedAgentConfig, derivedSpecialtyFocus)) {
      agentConfig = persistedAgentConfig;
    }
  }

  if (!agentConfig && appointmentTypeId) {
    agentConfig = await agentConfigService.getConfigurationForAppointmentType(
      tenantId,
      appointmentTypeId,
      { includeDefault: false }
    );
  }

  if (!agentConfig && derivedSpecialtyFocus) {
    agentConfig = await agentConfigService.getConfigurationForSpecialtyFocus(tenantId, derivedSpecialtyFocus);
  }

  if (!agentConfig && derivedSpecialtyFocus !== 'cosmetic') {
    agentConfig = await agentConfigService.getConfigurationForSpecialtyFocus(tenantId, 'medical_derm');
  }

  if (!agentConfig) {
    agentConfig = await agentConfigService.getDefaultConfiguration(tenantId);
  }

  if (recordingId && agentConfig?.id && agentConfig.id !== persistedAgentConfigId) {
    await pool.query(
      `UPDATE ambient_recordings
       SET agent_config_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND tenant_id = $3`,
      [agentConfig.id, recordingId, tenantId]
    );
  }

  const specialtyFocus =
    agentConfig?.specialtyFocus ||
    derivedSpecialtyFocus;

  const patientName = [toTrimmedString(row.patient_first_name), toTrimmedString(row.patient_last_name)]
    .filter(Boolean)
    .join(' ');

  const chiefComplaint =
    toTrimmedString(row.encounter_chief_complaint) ||
    appointmentTypeName ||
    undefined;

  const patientContext: PatientContext | undefined = patientName || chiefComplaint || specialtyFocus
    ? {
        patientName: patientName || undefined,
        patientAge: calculateAge(row.patient_dob),
        chiefComplaint,
        relevantHistory: buildRelevantHistory([
          { label: 'Known allergies', value: row.patient_allergies },
          { label: 'Active medications', value: row.patient_medications },
          { label: 'Existing HPI draft', value: row.encounter_hpi },
          { label: 'Existing ROS draft', value: row.encounter_ros },
          { label: 'Existing exam draft', value: row.encounter_exam },
          { label: 'Existing assessment/plan draft', value: row.encounter_assessment_plan },
        ]),
        providerName: toTrimmedString(row.provider_name) || undefined,
        appointmentTypeName,
        appointmentTypeCategory,
        specialtyFocus,
      }
    : undefined;

  return {
    recordingId,
    encounterId: row.effective_encounter_id || encounterId || null,
    providerId,
    agentConfig,
    agentConfigSnapshot: serializeAgentConfigSnapshot(agentConfig),
    patientContext,
  };
}

function toProbabilityWeight(value: unknown): number {
  let parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed > 1) {
    parsed = parsed / 100;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeProbabilityPercents(weights: number[]): number[] {
  if (weights.length === 0) {
    return [];
  }
  if (weights.length === 1) {
    return [100];
  }

  const safeWeights = weights.map((weight, index) => {
    if (Number.isFinite(weight) && weight > 0) {
      return weight;
    }
    return Math.max(0.01, 1 / (index + 2));
  });

  const totalWeight = safeWeights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) {
    return [100, ...Array(Math.max(0, weights.length - 1)).fill(0)];
  }

  // Guarantee every diagnosis receives at least 1% while preserving ranked weighting.
  const basePercentages = Array.from({ length: weights.length }, () => 1);
  const remainingBudget = Math.max(0, 100 - basePercentages.length);
  const rawExtras = safeWeights.map((value) => (value / totalWeight) * remainingBudget);
  const flooredExtras = rawExtras.map((value) => Math.floor(value));
  let remaining = remainingBudget - flooredExtras.reduce((sum, value) => sum + value, 0);

  const fractionalOrder = rawExtras
    .map((value, index) => ({ index, fraction: value - flooredExtras[index]! }))
    .sort((a, b) => b.fraction - a.fraction);

  const normalized = basePercentages.map((base, index) => base + (flooredExtras[index] || 0));
  let cursor = 0;
  while (remaining > 0 && fractionalOrder.length > 0) {
    const target = fractionalOrder[cursor % fractionalOrder.length]!;
    normalized[target.index] = (normalized[target.index] || 0) + 1;
    remaining -= 1;
    cursor += 1;
  }

  return normalized;
}

function extractSymptomsForSummary(note: {
  chiefComplaint?: string;
  hpi?: string;
  physicalExam?: string;
  assessment?: string;
  plan?: string;
  patientSummary?: {
    whatWeDiscussed?: string;
    yourConcerns?: string[];
    diagnosis?: string;
    treatmentPlan?: string;
    followUp?: string;
  };
}): string[] {
  const symptoms: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (seen.has(trimmed.toLowerCase())) return;
    seen.add(trimmed.toLowerCase());
    symptoms.push(trimmed);
  };

  const sourceText = [
    note.chiefComplaint,
    note.hpi,
    note.physicalExam,
    note.assessment,
    note.plan,
    note.patientSummary?.whatWeDiscussed,
    note.patientSummary?.diagnosis,
    note.patientSummary?.treatmentPlan,
    note.patientSummary?.followUp,
  ].filter(Boolean).join(' ');
  const normalizedSource = sourceText.toLowerCase();
  const sentences = sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim().toLowerCase())
    .filter(Boolean);

  const hasCurrentEvidence = (pattern: RegExp) => {
    if (sentences.length === 0) {
      return pattern.test(normalizedSource) && !isUnsupportedSymptomSentence(normalizedSource);
    }

    return sentences.some((sentence) => pattern.test(sentence) && !isUnsupportedSymptomSentence(sentence));
  };

  const hasLesionContext =
    /\b(mole|nevus|pigmented lesion|skin lesion|papule|neoplasm|melanoma|biopsy)\b/.test(normalizedSource);
  const hasScalpDermContext =
    /\b(scalp|seborrheic|dandruff|ketoconazole|shampoo|hairline)\b/.test(normalizedSource);

  if (hasCurrentEvidence(/\b(changing mole|mole[^.]*changed|changed[^.]*mole|pigmented lesion|dark brown papule|irregular border|multiple shades|asymmetric|suspicious lesion)\b/)) {
    pushUnique('Changing mole / pigmented lesion');
  }

  if (
    hasLesionContext &&
    hasCurrentEvidence(/\b(growing|growth|larger|bigger|increased size|darker|changed color|color change|multiple shades)\b/)
  ) {
    pushUnique('Growth or color change');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(bleed|bleeding|bled|crust|crusted|scab)\b/)) {
    pushUnique('Bleeding / crusting');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(catches|catching|clothing|shirt|scratch|scratched|irritated)\b/)) {
    pushUnique('Irritated/catching lesion');
  }

  if (
    hasScalpDermContext &&
    hasCurrentEvidence(/\b(itch|pruritus|scale|scaly|flak|dandruff|redness|erythema|seborrheic|ketoconazole|shampoo)\b/)
  ) {
    pushUnique('Scalp itching/flaking');
  }

  const normalizeConcern = (rawConcern: unknown): string | null => {
    const concern = String(rawConcern || '').trim();
    if (!concern) {
      return null;
    }

    if (LOW_VALUE_CONCERN_PATTERNS.some((pattern) => pattern.test(concern))) {
      return null;
    }

    const normalizedConcern = concern.toLowerCase();
    if (isUnsupportedSymptomSentence(concern)) {
      return null;
    }
    if (/\b(pain|hurt|tender)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(pain|hurt|tender|sore)\b/)) {
      return null;
    }
    if (/\b(drain|ooz|pus|discharge)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(drain|ooz|pus|discharge)\b/)) {
      return null;
    }
    if (/\b(fever|febrile)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(fever|febrile)\b/)) {
      return null;
    }
    if (/\bbleed|crust|scab/.test(normalizedConcern) && hasLesionContext) {
      return 'Bleeding / crusting';
    }
    if (/\b(changing|growth|larger|darker|mole|pigmented lesion|lesion)\b/.test(normalizedConcern) && hasLesionContext) {
      return 'Changing mole / pigmented lesion';
    }
    if (/\bitch|scale|scal|flak|redness|dandruff|rash/.test(normalizedConcern) && hasScalpDermContext) {
      return 'Scalp itching/flaking';
    }
    if (/\bblister/.test(normalizedConcern) && !hasCurrentEvidence(/\bblister|vesicle|bulla\b/)) {
      return null;
    }
    if (normalizedConcern === 'rash' && (hasLesionContext || hasScalpDermContext)) {
      return null;
    }

    return concern;
  };

  for (const concern of note.patientSummary?.yourConcerns || []) {
    const normalizedConcern = normalizeConcern(concern);
    if (normalizedConcern) {
      pushUnique(normalizedConcern);
    }
  }

  for (const symptom of SYMPTOM_PATTERNS) {
    if (!hasCurrentEvidence(symptom.pattern)) {
      continue;
    }
    if (symptom.label === 'Rash' && (hasLesionContext || hasScalpDermContext)) {
      continue;
    }
    if (['Itching', 'Redness', 'Scaling'].includes(symptom.label) && hasScalpDermContext) {
      continue;
    }
    if (symptom.label === 'Bleeding' && hasLesionContext) {
      continue;
    }
    if (symptom.label === 'Blistering' && !hasCurrentEvidence(/\b(blister|vesicle|bulla)\b/)) {
      continue;
    }

    if (symptom.pattern.test(normalizedSource)) {
      pushUnique(symptom.label);
    }
  }

  if (symptoms.length === 0 && note.chiefComplaint) {
    pushUnique(note.chiefComplaint.split('.')[0] || note.chiefComplaint);
  } else if (symptoms.length === 0 && note.assessment) {
    pushUnique(note.assessment.split('.')[0] || note.assessment);
  }

  return symptoms.slice(0, 8);
}

function buildFallbackProbableDiagnosis(
  result: Awaited<ReturnType<typeof generateClinicalNote>>
): FormalAppointmentSummary['probableDiagnoses'][number] {
  const condition =
    toTrimmedString(result.assessment).split('.')[0] ||
    toTrimmedString(result.chiefComplaint).split('.')[0] ||
    'Dermatologic condition under evaluation';
  const primaryIcd10 = toTrimmedString(result.suggestedIcd10?.[0]?.code);

  return {
    condition,
    probabilityPercent: 100,
    reasoning: 'Derived from encounter findings; clinician review required.',
    icd10Code: primaryIcd10 || undefined,
  };
}

function buildProbableDiagnoses(
  result: Awaited<ReturnType<typeof generateClinicalNote>>
): FormalAppointmentSummary['probableDiagnoses'] {
  const candidates: SummaryDiagnosisCandidate[] = (result.differentialDiagnoses || [])
    .slice(0, 5)
    .map((diagnosis: any) => {
      const condition = toTrimmedString(diagnosis?.condition);
      if (!condition) {
        return null;
      }

      return {
        condition,
        reasoning: toTrimmedString(diagnosis?.reasoning) || 'Based on documented symptom and exam pattern.',
        icd10Code: toTrimmedString(diagnosis?.icd10Code) || undefined,
        probabilityWeight: toProbabilityWeight(diagnosis?.confidence),
      } as SummaryDiagnosisCandidate;
    })
    .filter((candidate): candidate is SummaryDiagnosisCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    return [buildFallbackProbableDiagnosis(result)];
  }

  const sorted = candidates.sort((a, b) => b.probabilityWeight - a.probabilityWeight);
  const percentages = normalizeProbabilityPercents(sorted.map((candidate) => candidate.probabilityWeight));

  return sorted.map((diagnosis, index) => ({
    condition: diagnosis.condition,
    probabilityPercent: percentages[index] || 0,
    reasoning: diagnosis.reasoning,
    icd10Code: diagnosis.icd10Code,
  }));
}

function buildFallbackSuggestedTests(
  topDiagnosisCondition: string
): FormalAppointmentSummary['suggestedTests'] {
  const normalized = topDiagnosisCondition.toLowerCase();
  if (/\b(melanoma|carcinoma|neoplasm|skin cancer)\b/.test(normalized)) {
    return [{
      testName: 'Skin biopsy',
      urgency: 'urgent',
      rationale: 'Histopathology is needed to confirm diagnosis and guide treatment.',
    }];
  }
  if (/\b(infection|cellulitis|impetigo|folliculitis)\b/.test(normalized)) {
    return [{
      testName: 'Skin culture and sensitivity',
      urgency: 'soon',
      rationale: 'Identifies causative organism and supports targeted antimicrobial treatment.',
    }];
  }
  if (/\b(allergic|contact dermatitis|eczema)\b/.test(normalized)) {
    return [{
      testName: 'Patch testing',
      urgency: 'soon',
      rationale: 'Helps identify specific contact triggers and prevent recurrence.',
      cptCode: '95044',
    }];
  }

  return [{
    testName: 'Focused dermatology follow-up evaluation',
    urgency: 'routine',
    rationale: 'Reassess response to treatment and refine diagnosis as needed.',
  }];
}

function buildSuggestedTests(
  result: Awaited<ReturnType<typeof generateClinicalNote>>,
  probableDiagnoses: FormalAppointmentSummary['probableDiagnoses']
): FormalAppointmentSummary['suggestedTests'] {
  const suggestedTests = (result.recommendedTests || [])
    .slice(0, 5)
    .map((test: any) => ({
      testName: toTrimmedString(test?.testName) || 'Follow-up clinical evaluation',
      urgency: (test?.urgency === 'urgent' || test?.urgency === 'soon' || test?.urgency === 'routine')
        ? test.urgency
        : 'routine',
      rationale: toTrimmedString(test?.rationale) || 'Recommended from visit findings.',
      cptCode: toTrimmedString(test?.cptCode) || undefined
    }))
    .filter((test) => test.testName);

  if (suggestedTests.length > 0) {
    return suggestedTests;
  }

  return buildFallbackSuggestedTests(probableDiagnoses[0]?.condition || '');
}

function buildFormalAppointmentSummary(result: Awaited<ReturnType<typeof generateClinicalNote>>): FormalAppointmentSummary {
  const probableDiagnoses = buildProbableDiagnoses(result);
  const suggestedTests = buildSuggestedTests(result, probableDiagnoses);

  return {
    symptoms: extractSymptomsForSummary({
      chiefComplaint: result.chiefComplaint,
      hpi: result.hpi,
      physicalExam: result.physicalExam,
      assessment: result.assessment,
      plan: result.plan,
      patientSummary: result.patientSummary || undefined,
    }),
    probableDiagnoses,
    suggestedTests
  };
}

function buildNoteContent(result: Awaited<ReturnType<typeof generateClinicalNote>>) {
  return {
    formalAppointmentSummary: buildFormalAppointmentSummary(result),
    patientSummary: result.patientSummary || null,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Start transcription process for a recording
 */
async function startTranscription(
  recordingId: string,
  tenantId: string,
  filePath: string,
  durationSeconds: number
): Promise<string> {
  const transcriptId = crypto.randomUUID();

  // Get encounter_id from recording
  const recording = await pool.query(
    'SELECT encounter_id FROM ambient_recordings WHERE id = $1',
    [recordingId]
  );
  const encounterId = recording.rows[0]?.encounter_id || null;

  // Create transcript record
  await pool.query(
    `INSERT INTO ambient_transcripts (
      id, tenant_id, recording_id, encounter_id, transcription_status, started_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())`,
    [transcriptId, tenantId, recordingId, encounterId, 'processing']
  );

  // Process transcription asynchronously
  processTranscription(transcriptId, tenantId, recordingId, encounterId, filePath, durationSeconds).catch(error => {
    logAmbientError('Transcription processing error', error);
  });

  return transcriptId;
}

/**
 * Process transcription (async)
 */
async function processTranscription(
  transcriptId: string,
  tenantId: string,
  recordingId: string,
  encounterId: string | null,
  filePath: string,
  durationSeconds: number
): Promise<void> {
  try {
    // Call mock AI service
    const result: TranscriptionResult = await transcribeAudio(filePath, durationSeconds, { tenantId });

    // Mask PHI
    const maskedText = maskPHI(result.text, result.phiEntities);

    // Update transcript
    await pool.query(
      `UPDATE ambient_transcripts
       SET transcript_text = $1,
           transcript_segments = $2,
           language = $3,
           speakers = $4,
           speaker_count = $5,
           confidence_score = $6,
           word_count = $7,
           original_text = $8,
           phi_entities = $9,
           phi_masked = $10,
           transcription_status = $11,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $12 AND tenant_id = $13`,
      [
        maskedText,
        JSON.stringify(result.segments),
        result.language,
        JSON.stringify(result.speakers),
        result.speakerCount,
        result.confidence,
        result.wordCount,
        result.text,
        JSON.stringify(result.phiEntities),
        result.phiEntities.length > 0,
        'completed',
        transcriptId,
        tenantId
      ]
    );

    // Auto-generate note if enabled
    const settings = await pool.query(
      'SELECT auto_generate_notes FROM ambient_scribe_settings WHERE tenant_id = $1 AND provider_id IS NULL',
      [tenantId]
    );

    if (settings.rows[0]?.auto_generate_notes) {
      await generateNote(tenantId, transcriptId, encounterId, maskedText, result.segments);
    }
  } catch (error: any) {
    logAmbientError('Transcription error', error);
    await pool.query(
      `UPDATE ambient_transcripts
       SET transcription_status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      ['failed', error.message, transcriptId, tenantId]
    );
  }
}

/**
 * Generate clinical note from transcript
 */
async function generateNote(
  tenantId: string,
  transcriptId: string,
  encounterId: string | null,
  transcriptText: string,
  segments: any
): Promise<string> {
  const noteId = crypto.randomUUID();
  const transcriptMeta = await pool.query(
    'SELECT recording_id, encounter_id FROM ambient_transcripts WHERE id = $1 AND tenant_id = $2',
    [transcriptId, tenantId]
  );
  const effectiveEncounterId = encounterId || transcriptMeta.rows[0]?.encounter_id || null;
  const generationContext = await resolveNoteGenerationContext(tenantId, transcriptId, effectiveEncounterId);

  // Create note record
  await pool.query(
    `INSERT INTO ambient_generated_notes (
      id, tenant_id, transcript_id, recording_id, encounter_id, agent_config_id,
      agent_config_snapshot, generation_status, started_at, note_content
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
    [
      noteId,
      tenantId,
      transcriptId,
      generationContext.recordingId,
      generationContext.encounterId,
      generationContext.agentConfig?.id || null,
      generationContext.agentConfigSnapshot,
      'processing',
      JSON.stringify({}),
    ]
  );

  // Process note generation asynchronously
  processNoteGeneration(noteId, tenantId, transcriptText, segments, generationContext).catch(error => {
    logAmbientError('Note generation error', error);
  });

  return noteId;
}

/**
 * Process note generation (async)
 */
async function processNoteGeneration(
  noteId: string,
  tenantId: string,
  transcriptText: string,
  segments: any,
  generationContext: NoteGenerationContext
): Promise<void> {
  try {
    const result = await generateClinicalNote(
      transcriptText,
      segments,
      generationContext.agentConfig,
      generationContext.patientContext
    );
    const generationMetadata = result.generationMetadata;

    // Update note
    await pool.query(
      `UPDATE ambient_generated_notes
       SET chief_complaint = $1,
           hpi = $2,
           ros = $3,
           physical_exam = $4,
           assessment = $5,
           plan = $6,
           suggested_icd10_codes = $7,
           suggested_cpt_codes = $8,
           mentioned_medications = $9,
           mentioned_allergies = $10,
           follow_up_tasks = $11,
           overall_confidence = $12,
           section_confidence = $13,
           differential_diagnoses = $14,
           recommended_tests = $15,
           note_content = $16,
           agent_config_id = $17,
           agent_config_snapshot = $18,
           ai_model = $19,
           ai_version = $20,
           generation_prompt = $21,
           generation_status = $22,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $23 AND tenant_id = $24`,
      [
        result.chiefComplaint,
        result.hpi,
        result.ros,
        result.physicalExam,
        result.assessment,
        result.plan,
        JSON.stringify(result.suggestedIcd10),
        JSON.stringify(result.suggestedCpt),
        JSON.stringify(result.medications),
        JSON.stringify(result.allergies),
        JSON.stringify(result.followUpTasks),
        result.overallConfidence,
        JSON.stringify(result.sectionConfidence),
        JSON.stringify(result.differentialDiagnoses || []),
        JSON.stringify(result.recommendedTests || []),
        JSON.stringify(buildNoteContent(result)),
        generationContext.agentConfig?.id || generationMetadata?.agentConfigId || null,
        generationContext.agentConfigSnapshot,
        generationMetadata?.model || generationContext.agentConfig?.aiModel || null,
        AMBIENT_SCRIBE_PROMPT_VERSION,
        generationMetadata?.prompt || null,
        'completed',
        noteId,
        tenantId
      ]
    );
  } catch (error: any) {
    logAmbientError('Note generation error', error);
    await pool.query(
      `UPDATE ambient_generated_notes
       SET generation_status = $1, error_message = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      ['failed', error.message, noteId, tenantId]
    );
  }
}

// ============================================================================
// PATIENT SUMMARY ENDPOINTS
// ============================================================================

/**
 * POST /api/ambient/notes/:noteId/generate-patient-summary
 * Generate and save a patient-friendly summary from an approved note
 */
router.post('/notes/:noteId/generate-patient-summary', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const noteId = req.params.noteId;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Get the note with patient and provider info
    const noteResult = await pool.query(
      `SELECT
        n.*,
        r.patient_id,
        r.provider_id,
        p.first_name || ' ' || p.last_name as patient_name,
        pr.full_name as provider_name,
        COALESCE(a.scheduled_start, e.created_at) as encounter_date
      FROM ambient_generated_notes n
      JOIN ambient_transcripts t ON t.id = n.transcript_id
      JOIN ambient_recordings r ON r.id = t.recording_id
      JOIN patients p ON p.id = r.patient_id
      JOIN providers pr ON pr.id = r.provider_id
      LEFT JOIN encounters e ON e.id = n.encounter_id
      LEFT JOIN appointments a ON a.id = e.appointment_id
      WHERE n.id = $1 AND n.tenant_id = $2`,
      [noteId, tenantId]
    );

    if (noteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = noteResult.rows[0];

    // Check if note is approved
    if (note.review_status !== 'approved') {
      return res.status(400).json({ error: 'Note must be approved before generating patient summary' });
    }

    // Avoid duplicate summaries for the same ambient note
    const existingSummary = await pool.query(
      `SELECT id FROM visit_summaries WHERE ambient_note_id = $1 AND tenant_id = $2`,
      [noteId, tenantId]
    );

    if (existingSummary.rowCount && existingSummary.rowCount > 0) {
      return res.json({
        summaryId: existingSummary.rows[0].id,
        message: 'Patient summary already exists',
        existing: true
      });
    }

    // Generate patient-friendly summary
    const visitDate = note.encounter_date || new Date();

    const symptomsDiscussed = extractSymptomsForSummary({
      chiefComplaint: note.chief_complaint || '',
      hpi: note.hpi || '',
      physicalExam: note.physical_exam || '',
      assessment: note.assessment || '',
      plan: note.plan || '',
      patientSummary: note.note_content?.patientSummary
    });

    // Extract diagnosis from assessment
    let diagnosisShared = '';
    if (note.assessment) {
      // Take first line or first diagnosis
      const firstLine = note.assessment.split('\n')[0];
      diagnosisShared = firstLine.replace(/^\d+\.\s*/, '').split('-')[0].trim();
    }

    // Generate patient-friendly summary text
    const summaryText = generatePatientFriendlySummary(note);

    // Extract treatment plan
    let treatmentPlan = '';
    if (note.plan) {
      const planLines = note.plan.split('\n').filter((line: string) => line.trim());
      treatmentPlan = planLines.slice(0, 5).join('\n'); // Take first few lines
    }

    // Extract next steps and follow-up
    let nextSteps = '';
    let followUpDate = null;
    if (note.follow_up_tasks && Array.isArray(note.follow_up_tasks)) {
      const tasks = note.follow_up_tasks.map((t: any) => t.task).join('\n');
      nextSteps = tasks;

      // Extract follow-up date if available
      const followUpTask = note.follow_up_tasks.find((t: any) => t.dueDate);
      if (followUpTask) {
        followUpDate = followUpTask.dueDate;
      }
    }

    // Create visit summary record
    const summaryId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO visit_summaries (
        id, tenant_id, patient_id, encounter_id, ambient_note_id,
        visit_date, provider_name, summary_text, symptoms_discussed,
        diagnosis_shared, treatment_plan, next_steps, follow_up_date,
        generated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        summaryId,
        tenantId,
        note.patient_id,
        note.encounter_id || null,
        noteId,
        visitDate,
        note.provider_name,
        summaryText,
        symptomsDiscussed,
        diagnosisShared,
        treatmentPlan,
        nextSteps,
        followUpDate,
        userId
      ]
    );

    await auditLog(tenantId, userId || null, 'patient_summary_generated', 'visit_summary', summaryId);

    res.status(201).json({
      summaryId,
      message: 'Patient summary generated successfully'
    });
  } catch (error: any) {
    logAmbientError('Generate patient summary error', error);
    res.status(500).json({ error: 'Failed to generate patient summary' });
  }
});

/**
 * GET /api/ambient/patient-summaries/:patientId
 * Get all summaries for a patient (provider view)
 */
router.get('/patient-summaries/:patientId', requireAuth, requireRoles([...AMBIENT_CLINICAL_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const patientId = req.params.patientId;
    const tenantId = req.user!.tenantId;

    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
      [patientId, tenantId]
    );

    if (patientCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `SELECT
        vs.id,
        vs.encounter_id as "encounterId",
        vs.ambient_note_id as "ambientNoteId",
        vs.visit_date as "visitDate",
        vs.provider_name as "providerName",
        vs.summary_text as "summaryText",
        vs.symptoms_discussed as "symptomsDiscussed",
        vs.diagnosis_shared as "diagnosisShared",
        vs.treatment_plan as "treatmentPlan",
        vs.next_steps as "nextSteps",
        vs.chief_complaint as "chiefComplaint",
        vs.diagnoses,
        vs.procedures,
        vs.follow_up_instructions as "followUpInstructions",
        vs.follow_up_date as "followUpDate",
        vs.shared_at as "sharedAt",
        vs.created_at as "createdAt",
        u.full_name as "generatedByName"
      FROM visit_summaries vs
      LEFT JOIN users u ON u.id = vs.generated_by
      WHERE vs.patient_id = $1 AND vs.tenant_id = $2
      ORDER BY vs.visit_date DESC`,
      [patientId, tenantId]
    );

    res.json({ summaries: result.rows });
  } catch (error: any) {
    logAmbientError('Get patient summaries error', error);
    res.status(500).json({ error: 'Failed to get patient summaries' });
  }
});

/**
 * POST /api/ambient/patient-summaries/:summaryId/share
 * Share a summary with the patient (sets shared_at timestamp)
 */
router.post('/patient-summaries/:summaryId/share', requireAuth, requireRoles([...AMBIENT_REVIEW_ROLES]), async (req: AuthedRequest, res) => {
  try {
    const summaryId = req.params.summaryId;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const result = await pool.query(
      `UPDATE visit_summaries
       SET shared_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [summaryId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    await auditLog(tenantId, userId || '', 'patient_summary_shared', 'visit_summary', summaryId || '');

    res.json({ success: true, message: 'Summary shared with patient' });
  } catch (error: any) {
    logAmbientError('Share patient summary error', error);
    res.status(500).json({ error: 'Failed to share patient summary' });
  }
});

/**
 * Helper function to generate patient-friendly summary
 */
function generatePatientFriendlySummary(note: any): string {
  const sections: string[] = [];

  // Introduction
  sections.push('Visit Summary');
  sections.push('');

  // What was discussed
  if (note.chief_complaint) {
    sections.push('What We Discussed:');
    sections.push(simplifyMedicalText(note.chief_complaint));
    sections.push('');
  }

  // What we found
  if (note.physical_exam) {
    sections.push('What We Found:');
    sections.push(simplifyMedicalText(note.physical_exam));
    sections.push('');
  }

  // What it means
  if (note.assessment) {
    sections.push('What It Means:');
    sections.push(simplifyMedicalText(note.assessment));
    sections.push('');
  }

  // What to do
  if (note.plan) {
    sections.push('What To Do:');
    sections.push(simplifyMedicalText(note.plan));
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Helper function to simplify medical terminology for patients
 */
function simplifyMedicalText(text: string): string {
  // Remove medical jargon and simplify
  let simplified = text
    .replace(/\berythematous\b/gi, 'red')
    .replace(/\bpruritic\b/gi, 'itchy')
    .replace(/\bbilateral\b/gi, 'both sides')
    .replace(/\bvesicular\b/gi, 'blistered')
    .replace(/\bpapular\b/gi, 'bumpy')
    .replace(/\bmacular\b/gi, 'flat')
    .replace(/\bhpi\b/gi, 'history')
    .replace(/\bBID\b/g, 'twice daily')
    .replace(/\bTID\b/g, 'three times daily')
    .replace(/\bQHS\b/g, 'at bedtime')
    .replace(/\bPO\b/g, 'by mouth');

  return simplified;
}

export default router;
