import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { requireModuleAccess } from '../middleware/moduleAccess';
import { rateLimit } from '../middleware/rateLimit';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import { safeErrorCode } from '../utils/phiRedaction';
import {
  captureAutomationCandidate,
  deriveItchCandidates,
  reconcileMipsAutomation,
  type ItchAssessmentSource,
} from '../services/mipsWorkflowAutomation';
import {
  aggregateReadiness,
  evaluateDataCompleteness,
  evaluateMipsEligibility,
  MIPS_2026_CATALOG,
  MIPS_2026_DEFAULT_SELECTED_IA_IDS,
  MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS,
  MIPS_2026_IMPROVEMENT_ACTIVITIES,
  MIPS_2026_QUALITY_MEASURES,
  type MipsCategory,
  type MipsEligibilityInput,
  type ReadinessEvidence,
  type ReadinessProfileLike,
} from '../services/mipsReadinessEngine';

export const mipsReadinessRouter = Router();
export default mipsReadinessRouter;

mipsReadinessRouter.use(rateLimit({ windowMs: 60_000, max: 100 }));

const SUPPORTED_YEAR = 2026;
const PROFILE_WRITE_ROLES = ['admin', 'provider', 'manager', 'compliance_officer'];
const CLINICAL_CAPTURE_ROLES = ['admin', 'provider', 'ma', 'nurse'];
const requireReportingAccess = [
  requireAuth,
  requireRoles(PROFILE_WRITE_ROLES),
  requireModuleAccess('quality'),
] as const;

type JsonObject = Record<string, unknown>;

interface ReadinessProfileRow {
  id: string;
  tenant_id: string;
  performance_year: number;
  selected_quality_measure_ids: unknown;
  selected_cost_measure_ids: unknown;
  selected_ia_ids: unknown;
  category_config: JsonObject;
  eligibility_inputs: MipsEligibilityInput;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ReadinessEvidenceRow {
  id: string;
  tenant_id: string;
  performance_year: number;
  category: MipsCategory;
  measure_id?: string | null;
  evidence_type: string;
  source_type: string;
  source_id: string;
  observed_at?: string | null;
  recorded_at?: string | null;
  status: string;
  metadata: JsonObject;
  origin?: 'manual' | 'automation';
  automation_rule_id?: string | null;
  source_revision?: number | null;
  reviewed_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  created_at?: string;
}

const forbiddenMetadataKeys = new Set([
  'raw',
  'rawtext',
  'text',
  'note',
  'notes',
  'narrative',
  'freeform',
  'firstname',
  'lastname',
  'fullname',
  'dob',
  'dateofbirth',
  'phone',
  'email',
  'address',
  'ssn',
  'mrn',
  'patientname',
  'patientid',
  'memberid',
  'encounterid',
  'appointmentid',
  'providerid',
  'userid',
]);

function hasForbiddenMetadataKey(value: unknown, depth = 0): boolean {
  // Reject over-deep objects rather than storing an uninspected payload.  A
  // readiness ledger is intentionally small and cannot safely carry opaque
  // clinical narratives hidden below an arbitrary nesting level.
  if (depth > 6) return value !== null && value !== undefined;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenMetadataKey(item, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    return forbiddenMetadataKeys.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())
      || hasForbiddenMetadataKey(child, depth + 1);
  });
}

/** Strip unsafe fields from legacy rows before an evidence response. */
function safeStructuredMetadata(value: unknown, depth = 0): JsonObject {
  if (depth > 6 || !value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (forbiddenMetadataKeys.has(normalized)) continue;
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        output[key] = child.slice(0, 100).map((item) => (
          item && typeof item === 'object' ? safeStructuredMetadata(item, depth + 1) : item
        ));
      } else {
        output[key] = safeStructuredMetadata(child, depth + 1);
      }
    } else if (typeof child === 'string') {
      output[key] = child.slice(0, 512);
    } else if (typeof child === 'number' || typeof child === 'boolean' || child === null) {
      output[key] = child;
    }
  }
  return output;
}

function oneQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function parseSupportedYear(value: unknown, defaultToSupported = true): { year?: number; error?: string } {
  const single = oneQueryValue(value);
  if (single === undefined || single === null || single === '') {
    return defaultToSupported ? { year: SUPPORTED_YEAR } : { error: 'year is required' };
  }
  const year = typeof single === 'number' ? single : Number(String(single));
  if (!Number.isInteger(year)) return { error: 'year must be an integer' };
  if (year !== SUPPORTED_YEAR) return { error: `Unsupported MIPS performance year. Only ${SUPPORTED_YEAR} is supported.` };
  return { year };
}

function rejectYear(res: any, parsed: { year?: number; error?: string }) {
  if (parsed.year) return false;
  res.status(400).json({
    error: parsed.error || 'Unsupported MIPS performance year',
    code: 'UNSUPPORTED_MIPS_YEAR',
    supportedYears: [SUPPORTED_YEAR],
  });
  return true;
}

function stringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

const qualityIds = new Set([
  ...MIPS_2026_QUALITY_MEASURES.map((entry) => entry.id),
]);
const costIds = new Set(MIPS_2026_CATALOG.costMeasures.map((entry) => entry.id));
const iaIds = new Set(MIPS_2026_IMPROVEMENT_ACTIVITIES.map((entry) => entry.id));

function invalidSelectedIds(values: readonly string[], allowed: ReadonlySet<string>): string[] {
  return values.filter((value) => !allowed.has(value));
}

function parseJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function profileFromRow(row: ReadinessProfileRow | undefined): ReadinessProfileLike & {
  id?: string;
  performanceYear: number;
  selectedQualityMeasureIds: string[];
  selectedCostMeasureIds: string[];
  selectedImprovementActivityIds: string[];
  categoryConfiguration: JsonObject;
  eligibilityInputs: MipsEligibilityInput;
  createdAt?: string;
  updatedAt?: string;
} {
  const quality = stringArray(row?.selected_quality_measure_ids, MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS);
  const cost = stringArray(row?.selected_cost_measure_ids, []);
  const ia = stringArray(row?.selected_ia_ids, MIPS_2026_DEFAULT_SELECTED_IA_IDS);
  return {
    ...(row?.id ? { id: row.id } : {}),
    performanceYear: Number(row?.performance_year || SUPPORTED_YEAR),
    selectedQualityMeasureIds: quality,
    selectedCostMeasureIds: cost,
    selectedImprovementActivityIds: ia,
    categoryConfiguration: safeStructuredMetadata(parseJsonObject(row?.category_config)),
    eligibilityInputs: safeStructuredMetadata(parseJsonObject(row?.eligibility_inputs)) as MipsEligibilityInput,
    ...(row?.created_at ? { createdAt: row.created_at } : {}),
    ...(row?.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function defaultProfile(): ReturnType<typeof profileFromRow> {
  return profileFromRow(undefined);
}

function evidenceFromRow(row: ReadinessEvidenceRow): ReadinessEvidence {
  return {
    id: row.id,
    category: row.category,
    ...(row.measure_id ? { measureId: row.measure_id } : {}),
    evidenceType: row.evidence_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    ...(row.observed_at ? { observedAt: row.observed_at } : {}),
    ...(row.recorded_at ? { recordedAt: row.recorded_at } : {}),
    status: row.status,
    metadata: safeStructuredMetadata(row.metadata),
    origin: row.origin || 'manual',
    ...(row.automation_rule_id ? { automationRuleId: row.automation_rule_id } : {}),
    ...(row.source_revision ? { sourceRevision: Number(row.source_revision) } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function profileLike(profile: ReturnType<typeof profileFromRow>): ReadinessProfileLike {
  return {
    selectedQualityMeasureIds: profile.selectedQualityMeasureIds,
    selectedCostMeasureIds: profile.selectedCostMeasureIds,
    selectedImprovementActivityIds: profile.selectedImprovementActivityIds,
    categoryConfiguration: profile.categoryConfiguration,
    eligibilityInputs: profile.eligibilityInputs,
  };
}

function evidenceSummary(evidence: readonly ReadinessEvidence[]) {
  const byCategory = { quality: 0, cost: 0, pi: 0, ia: 0 };
  const byStatus: Record<string, number> = {};
  for (const item of evidence) {
    byCategory[item.category] += 1;
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }
  return { count: evidence.length, byCategory, byStatus };
}

async function loadReadiness(tenantId: string, year: number) {
  const profileResult = await pool.query<ReadinessProfileRow>(
    `SELECT id, tenant_id, performance_year, selected_quality_measure_ids,
            selected_cost_measure_ids, selected_ia_ids, category_config,
            eligibility_inputs, created_at, updated_at
       FROM mips_readiness_profiles
      WHERE tenant_id = $1 AND performance_year = $2
      LIMIT 1`,
    [tenantId, year],
  );
  const evidenceResult = await pool.query<ReadinessEvidenceRow>(
    `SELECT id, tenant_id, performance_year, category, measure_id, evidence_type,
            source_type, source_id, observed_at, recorded_at, status, metadata,
            origin, automation_rule_id, source_revision, reviewed_at, updated_at,
            created_at
       FROM mips_readiness_evidence
      WHERE tenant_id = $1 AND performance_year = $2
      ORDER BY created_at ASC, id ASC`,
    [tenantId, year],
  );
  const profile = profileFromRow(profileResult?.rows?.[0]);
  const evidence = (evidenceResult?.rows || []).map(evidenceFromRow);
  const readiness = aggregateReadiness({ profile: profileLike(profile), evidence });
  const eligibility = evaluateMipsEligibility(profile.eligibilityInputs);

  // Reuse the gated category evaluation so candidate counts cannot appear as
  // complete in the summary while the category correctly remains unresolved.
  // No patient rows are loaded or returned by this overview route.
  const completeness = readiness.categories.quality.evaluations.find(
    (item) => item.ruleId === 'data-completeness-2026',
  ) || evaluateDataCompleteness(null);

  return { profile, evidence, readiness, eligibility, completeness };
}

const profileSchema = z.object({
  year: z.number().int().optional(),
  performanceYear: z.number().int().optional(),
  selectedQualityMeasureIds: z.array(z.string().min(1).max(32)).optional(),
  selectedCostMeasureIds: z.array(z.string().min(1).max(64)).optional(),
  selectedImprovementActivityIds: z.array(z.string().min(1).max(64)).optional(),
  categoryConfiguration: z.object({
    qualityStartDate: z.string().min(1).max(100).optional(),
    qualityEndDate: z.string().min(1).max(100).optional(),
    cehrtStatus: z.enum(['confirmed', 'not_confirmed', 'unknown']).optional(),
    chplId: z.string().max(256).optional(),
    piStartDate: z.string().min(1).max(100).optional(),
    piEndDate: z.string().min(1).max(100).optional(),
    iaStartDate: z.string().min(1).max(100).optional(),
    iaEndDate: z.string().min(1).max(100).optional(),
    participationOption: z.literal('dermatological_care_mvp').optional(),
    costStatus: z.enum(['cms_calculated_unknown', 'cms_calculated_verified']).optional(),
  }).strict().optional(),
  eligibilityInputs: z.object({
    newlyEnrolled: z.boolean().nullable().optional(),
    qualifiedParticipant: z.boolean().nullable().optional(),
    allowedCharges: z.number().int().nonnegative().nullable().optional(),
    beneficiaries: z.number().int().nonnegative().nullable().optional(),
    coveredServices: z.number().int().nonnegative().nullable().optional(),
    sourceType: z.literal('qpp_manual').optional(),
  }).strict().optional(),
}).strict();

const evidenceSchema = z.object({
  year: z.number().int().optional(),
  performanceYear: z.number().int().optional(),
  category: z.enum(['quality', 'cost', 'pi', 'ia']),
  measureId: z.string().min(1).max(64).optional(),
  evidenceType: z.enum([
    'data_completeness', 'tb_before_biologic', 'pathology_turnaround',
    'biopsy_notification', 'itch', 'continuous_period', 'manual_attestation',
  ]),
  sourceType: z.enum(['qpp_manual', 'cms_feedback', 'local_structured_event', 'registry']),
  observedAt: z.string().min(1).max(100).optional(),
  status: z.enum(['candidate', 'needs_review', 'pending', 'missing']).default('candidate'),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

const evidenceReviewSchema = z.object({
  status: z.enum(['verified', 'rejected', 'needs_review', 'not_applicable']),
  sourceRevision: z.number().int().nonnegative().nullable(),
}).strict();

const evidenceMetadataSchemas: Record<string, z.ZodType<JsonObject>> = {
  data_completeness: z.object({
    completeCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().positive(),
  }).strict(),
  tb_before_biologic: z.object({
    screeningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    firstBiologicDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  pathology_turnaround: z.object({
    specimenReceiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reportSentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  biopsy_notification: z.object({
    finalReportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  itch: z.object({
    baselineInstrument: z.string().trim().min(1).max(120),
    baselineScore: z.number().finite().nonnegative(),
    followUpInstrument: z.string().trim().min(1).max(120),
    followUpScore: z.number().finite().nonnegative(),
  }).strict(),
  continuous_period: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  manual_attestation: z.object({}).strict(),
};

const itchAssessmentSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid().optional().nullable(),
  conditionCode: z.enum(['atopic_dermatitis', 'psoriasis']),
  instrumentCode: z.string().trim().min(1).max(80),
  instrumentVersion: z.string().trim().min(1).max(40).default('practice_defined'),
  score: z.number().finite(),
  scaleMin: z.number().finite().default(0),
  scaleMax: z.number().finite(),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phase: z.enum(['baseline', 'follow_up']),
  clientEventId: z.string().trim().min(8).max(120),
  sourceRevision: z.number().int().positive().default(1),
}).superRefine((value, context) => {
  if (value.scaleMax <= value.scaleMin) {
    context.addIssue({ code: 'custom', path: ['scaleMax'], message: 'Scale maximum must be greater than scale minimum.' });
  }
  if (value.score < value.scaleMin || value.score > value.scaleMax) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'Score must fall within the selected scale.' });
  }
  if (!value.assessmentDate.startsWith(`${SUPPORTED_YEAR}-`)) {
    context.addIssue({ code: 'custom', path: ['assessmentDate'], message: `Assessment date must be in ${SUPPORTED_YEAR}.` });
  }
});

function bodyYear(
  body: { year?: number; performanceYear?: number },
  queryYear?: unknown,
): { year?: number; error?: string } {
  if (queryYear !== undefined && queryYear !== null && queryYear !== '') {
    const parsedQueryYear = parseSupportedYear(queryYear, true);
    if (!parsedQueryYear.year) return parsedQueryYear;
  }
  const requested = body.performanceYear ?? body.year ?? oneQueryValue(queryYear);
  return parseSupportedYear(requested, true);
}

/**
 * GET /api/mips/readiness?year=2026
 * Aggregate-only overview: evidence metadata is intentionally omitted.
 */
mipsReadinessRouter.get('/', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const tenantId = req.user!.tenantId;
    const data = await loadReadiness(tenantId, parsedYear.year!);
    return res.json({
      year: parsedYear.year,
      catalog: MIPS_2026_CATALOG,
      program: MIPS_2026_CATALOG.program,
      profile: data.profile,
      eligibility: data.eligibility,
      dataCompleteness: data.completeness,
      categories: data.readiness.categories,
      readiness: {
        status: data.readiness.status,
        exportState: data.readiness.exportState,
        submissionState: data.readiness.submissionState,
      },
      workQueue: data.readiness.workQueue,
      evidenceSummary: evidenceSummary(data.evidence),
      exportState: data.readiness.exportState,
      submissionState: 'not_submitted',
      registryPartner: MIPS_2026_CATALOG.registryPartner,
    });
  } catch (error) {
    logger.error('MIPS readiness overview failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to load MIPS readiness overview' });
  }
});

/** GET /api/mips/readiness/profile - convenience profile read endpoint. */
mipsReadinessRouter.get('/profile', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const result = await pool.query<ReadinessProfileRow>(
      `SELECT id, tenant_id, performance_year, selected_quality_measure_ids,
              selected_cost_measure_ids, selected_ia_ids, category_config,
              eligibility_inputs, created_at, updated_at
         FROM mips_readiness_profiles
        WHERE tenant_id = $1 AND performance_year = $2
        LIMIT 1`,
      [req.user!.tenantId, parsedYear.year],
    );
    return res.json({ year: parsedYear.year, profile: profileFromRow(result?.rows?.[0]) });
  } catch (error) {
    logger.error('MIPS readiness profile read failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to load MIPS readiness profile' });
  }
});

/** PUT /api/mips/readiness/profile - validated tenant/year upsert. */
mipsReadinessRouter.put('/profile', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedBody = profileSchema.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.format() });
  const parsedYear = bodyYear(parsedBody.data, req.query.year);
  if (rejectYear(res, parsedYear)) return;

  const quality = stringArray(parsedBody.data.selectedQualityMeasureIds, MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS);
  const cost = stringArray(parsedBody.data.selectedCostMeasureIds, []);
  const ia = stringArray(parsedBody.data.selectedImprovementActivityIds, MIPS_2026_DEFAULT_SELECTED_IA_IDS);
  const invalidIds = [
    ...invalidSelectedIds(quality, qualityIds),
    ...invalidSelectedIds(cost, costIds),
    ...invalidSelectedIds(ia, iaIds),
  ];
  if (invalidIds.length) {
    return res.status(400).json({ error: 'One or more selected identifiers are not in the 2026 public catalog.', invalidIds });
  }
  const categoryConfiguration = safeStructuredMetadata(parsedBody.data.categoryConfiguration);
  const eligibilityInputs = safeStructuredMetadata(parsedBody.data.eligibilityInputs);
  if (hasForbiddenMetadataKey(categoryConfiguration) || hasForbiddenMetadataKey(eligibilityInputs)) {
    return res.status(400).json({ error: 'Profile fields may contain configuration and aggregate eligibility inputs only.' });
  }

  try {
    const id = randomUUID();
    const result = await pool.query<ReadinessProfileRow>(
      `INSERT INTO mips_readiness_profiles (
         id, tenant_id, performance_year, selected_quality_measure_ids,
         selected_cost_measure_ids, selected_ia_ids, category_config,
         eligibility_inputs, created_by, updated_by
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $9)
       ON CONFLICT (tenant_id, performance_year) DO UPDATE SET
         selected_quality_measure_ids = EXCLUDED.selected_quality_measure_ids,
         selected_cost_measure_ids = EXCLUDED.selected_cost_measure_ids,
         selected_ia_ids = EXCLUDED.selected_ia_ids,
         category_config = EXCLUDED.category_config,
         eligibility_inputs = EXCLUDED.eligibility_inputs,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, tenant_id, performance_year, selected_quality_measure_ids,
                 selected_cost_measure_ids, selected_ia_ids, category_config,
                 eligibility_inputs, created_at, updated_at`,
      [
        id,
        req.user!.tenantId,
        parsedYear.year,
        JSON.stringify(quality),
        JSON.stringify(cost),
        JSON.stringify(ia),
        JSON.stringify(categoryConfiguration),
        JSON.stringify(eligibilityInputs),
        req.user!.id,
      ],
    );
    const profile = profileFromRow(result?.rows?.[0] || {
      id,
      tenant_id: req.user!.tenantId,
      performance_year: parsedYear.year!,
      selected_quality_measure_ids: quality,
      selected_cost_measure_ids: cost,
      selected_ia_ids: ia,
      category_config: categoryConfiguration,
      eligibility_inputs: eligibilityInputs as MipsEligibilityInput,
    });
    // Counts and the year are sufficient for mutation auditing; request
    // bodies and evidence metadata are intentionally never logged.
    await auditLog(req.user!.tenantId, req.user!.id, 'mips_readiness_profile_updated', 'mips_readiness_profile', profile.id || id);
    return res.json({ year: parsedYear.year, profile });
  } catch (error) {
    logger.error('MIPS readiness profile upsert failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to save MIPS readiness profile' });
  }
});

/** GET /api/mips/readiness/evidence - structured ledger rows, tenant scoped. */
mipsReadinessRouter.get('/evidence', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const params: unknown[] = [req.user!.tenantId, parsedYear.year];
    let query = `SELECT id, tenant_id, performance_year, category, measure_id,
                        evidence_type, source_type, source_id, observed_at,
                        recorded_at, status, metadata, origin, automation_rule_id,
                        source_revision, reviewed_at, updated_at, created_at
                   FROM mips_readiness_evidence
                  WHERE tenant_id = $1 AND performance_year = $2`;
    if (req.query.category) {
      params.push(oneQueryValue(req.query.category));
      query += ` AND category = $${params.length}`;
    }
    if (req.query.status) {
      params.push(oneQueryValue(req.query.status));
      query += ` AND status = $${params.length}`;
    }
    if (req.query.measureId) {
      params.push(oneQueryValue(req.query.measureId));
      query += ` AND measure_id = $${params.length}`;
    }
    query += ' ORDER BY created_at ASC, id ASC';
    const result = await pool.query<ReadinessEvidenceRow>(query, params);
    return res.json({ year: parsedYear.year, evidence: result.rows.map(evidenceFromRow) });
  } catch (error) {
    logger.error('MIPS readiness evidence read failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to load MIPS readiness evidence' });
  }
});

/** POST /api/mips/readiness/evidence - create one structured evidence item. */
mipsReadinessRouter.post('/evidence', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedBody = evidenceSchema.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.format() });
  const parsedYear = bodyYear(parsedBody.data, req.query.year);
  if (rejectYear(res, parsedYear)) return;
  const data = parsedBody.data;
  if (hasForbiddenMetadataKey(data.metadata)) {
    return res.status(400).json({ error: 'Evidence metadata must remain structured and must not contain raw clinical text or direct identifiers.' });
  }
  const parsedMetadata = evidenceMetadataSchemas[data.evidenceType]!.safeParse(data.metadata);
  if (!parsedMetadata.success) {
    return res.status(400).json({
      error: 'Evidence metadata does not match the selected structured evidence type.',
      details: parsedMetadata.error.format(),
    });
  }
  if (data.measureId) {
    const allowed = data.category === 'quality' ? qualityIds : data.category === 'cost' ? costIds : data.category === 'ia' ? iaIds : new Set<string>();
    if (!allowed.has(data.measureId)) {
      return res.status(400).json({ error: 'measureId is not valid for the selected 2026 category.' });
    }
  }
  try {
    const id = randomUUID();
    const sourceId = `manual:${id}`;
    const result = await pool.query<ReadinessEvidenceRow>(
      `INSERT INTO mips_readiness_evidence (
         id, tenant_id, performance_year, category, measure_id, evidence_type,
         source_type, source_id, observed_at, status, metadata, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       RETURNING id, tenant_id, performance_year, category, measure_id, evidence_type,
                 source_type, source_id, observed_at, recorded_at, status, metadata,
                 origin, automation_rule_id, source_revision, reviewed_at, updated_at, created_at`,
      [
        id,
        req.user!.tenantId,
        parsedYear.year,
        data.category,
        data.measureId || null,
        data.evidenceType,
        data.sourceType,
        sourceId,
        data.observedAt || null,
        data.status,
        JSON.stringify(parsedMetadata.data),
        req.user!.id,
      ],
    );
    const row = result?.rows?.[0] || {
      id,
      tenant_id: req.user!.tenantId,
      performance_year: parsedYear.year!,
      category: data.category,
      measure_id: data.measureId || null,
      evidence_type: data.evidenceType,
      source_type: data.sourceType,
      source_id: sourceId,
      observed_at: data.observedAt || null,
      recorded_at: new Date().toISOString(),
      status: data.status,
      metadata: parsedMetadata.data,
    } as ReadinessEvidenceRow;
    await auditLog(req.user!.tenantId, req.user!.id, 'mips_readiness_evidence_created', 'mips_readiness_evidence', id);
    return res.status(201).json({ year: parsedYear.year, evidence: evidenceFromRow(row) });
  } catch (error) {
    logger.error('MIPS readiness evidence create failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to create MIPS readiness evidence' });
  }
});

/** PATCH /api/mips/readiness/evidence/:id/review - explicit human disposition. */
mipsReadinessRouter.patch('/evidence/:id/review', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsed = evidenceReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const result = await pool.query<ReadinessEvidenceRow>(
      `UPDATE mips_readiness_evidence
          SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND tenant_id = $4 AND performance_year = $5
          AND source_revision IS NOT DISTINCT FROM $6::bigint
        RETURNING id, tenant_id, performance_year, category, measure_id, evidence_type,
                  source_type, source_id, observed_at, recorded_at, status, metadata,
                  origin, automation_rule_id, source_revision, reviewed_at, updated_at, created_at`,
      [parsed.data.status, req.user!.id, req.params.id, req.user!.tenantId, parsedYear.year, parsed.data.sourceRevision],
    );
    if (!result.rows[0]) {
      return res.status(409).json({ error: 'Evidence changed since it was loaded. Refresh before reviewing it.' });
    }
    await auditLog(req.user!.tenantId, req.user!.id, 'mips_readiness_evidence_reviewed', 'mips_readiness_evidence', req.params.id!);
    return res.json({ year: parsedYear.year, evidence: evidenceFromRow(result.rows[0]) });
  } catch (error) {
    logger.error('MIPS readiness evidence review failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to review MIPS readiness evidence' });
  }
});

/** GET /api/mips/readiness/automation - aggregate connector health, never patient data. */
mipsReadinessRouter.get('/automation', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const [lastRunResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, status, connector_summary, candidates_created, candidates_updated,
                candidates_unchanged, candidates_stale, started_at, completed_at
           FROM mips_automation_runs
          WHERE tenant_id = $1 AND performance_year = $2
          ORDER BY started_at DESC LIMIT 1`,
        [req.user!.tenantId, parsedYear.year],
      ),
      pool.query(
        `SELECT source_type, status, COUNT(*)::int AS count
           FROM mips_readiness_evidence
          WHERE tenant_id = $1 AND performance_year = $2 AND origin = 'automation'
          GROUP BY source_type, status`,
        [req.user!.tenantId, parsedYear.year],
      ),
    ]);
    const lastRun = lastRunResult.rows[0];
    return res.json({
      year: parsedYear.year,
      candidateCounts: countResult.rows,
      lastRun: lastRun ? {
        id: lastRun.id,
        status: lastRun.status,
        connectors: Array.isArray(lastRun.connector_summary) ? lastRun.connector_summary : [],
        created: Number(lastRun.candidates_created || 0),
        updated: Number(lastRun.candidates_updated || 0),
        unchanged: Number(lastRun.candidates_unchanged || 0),
        stale: Number(lastRun.candidates_stale || 0),
        startedAt: lastRun.started_at,
        completedAt: lastRun.completed_at,
      } : null,
      coverage: [
        { id: '176', sourceType: 'chronic_therapy_registry', label: 'Explicit first-course therapy and TB date', limitation: 'No medication-name inference; human verification required.' },
        { id: '440', sourceType: 'biopsy', label: 'Lab receipt to recorded pathology result', limitation: 'Result entry is a delivery proxy; confirm the report reached the biopsying clinician.' },
        { id: 'AAD6', sourceType: 'biopsy', label: 'Recorded result to documented patient notification', limitation: 'Licensed specification review and human verification required.' },
        { id: '485/486', sourceType: 'itch_assessment', label: 'Same-instrument baseline and follow-up itch scores', limitation: 'Licensed specification review and human verification required.' },
      ],
      safety: {
        automaticCredit: false,
        externalSubmission: false,
        message: 'Automation creates candidate evidence only. It does not calculate an official numerator or submit data.',
      },
    });
  } catch (error) {
    logger.error('MIPS automation status read failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to load MIPS automation status' });
  }
});

/** POST /api/mips/readiness/automation/sync - idempotent tenant reconciliation. */
mipsReadinessRouter.post('/automation/sync', ...requireReportingAccess, async (req: AuthedRequest, res) => {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const result = await reconcileMipsAutomation(req.user!.tenantId, req.user!.id);
    await auditLog(req.user!.tenantId, req.user!.id, 'mips_automation_reconciled', 'mips_automation_run', result.runId);
    return res.json(result);
  } catch (error) {
    logger.error('MIPS automation reconciliation failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to reconcile MIPS workflow candidates' });
  }
});

/** POST /api/mips/readiness/itch-assessments - structured clinical capture. */
mipsReadinessRouter.post('/itch-assessments', requireAuth, requireRoles(CLINICAL_CAPTURE_ROLES), async (req: AuthedRequest, res) => {
  const parsed = itchAssessmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const patient = await client.query(
      `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [data.patientId, req.user!.tenantId],
    );
    if (!patient.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Patient not found' });
    }
    if (data.encounterId) {
      const encounter = await client.query(
        `SELECT id FROM encounters WHERE id = $1 AND patient_id = $2 AND tenant_id = $3 LIMIT 1`,
        [data.encounterId, data.patientId, req.user!.tenantId],
      );
      if (!encounter.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Encounter does not belong to this patient and tenant' });
      }
    }
    const assessmentId = randomUUID();
    const inserted = await client.query<ItchAssessmentSource>(
      `INSERT INTO mips_itch_assessments (
         id, tenant_id, patient_id, encounter_id, condition_code, instrument_code,
         instrument_version, score, scale_min, scale_max, assessment_date, phase,
         client_event_id, source_revision, assessed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13, $14, $15)
       ON CONFLICT (tenant_id, client_event_id) DO UPDATE SET
         encounter_id = EXCLUDED.encounter_id,
         condition_code = EXCLUDED.condition_code,
         instrument_code = EXCLUDED.instrument_code,
         instrument_version = EXCLUDED.instrument_version,
         score = EXCLUDED.score,
         scale_min = EXCLUDED.scale_min,
         scale_max = EXCLUDED.scale_max,
         assessment_date = EXCLUDED.assessment_date,
         phase = EXCLUDED.phase,
         source_revision = EXCLUDED.source_revision,
         assessed_by = EXCLUDED.assessed_by,
         updated_at = CURRENT_TIMESTAMP
       WHERE mips_itch_assessments.source_revision < EXCLUDED.source_revision
       RETURNING id, patient_id, condition_code, instrument_code, instrument_version,
                 score, scale_min, scale_max, assessment_date, phase, source_revision, updated_at`,
      [
        assessmentId, req.user!.tenantId, data.patientId, data.encounterId || null,
        data.conditionCode, data.instrumentCode, data.instrumentVersion, data.score,
        data.scaleMin, data.scaleMax, data.assessmentDate, data.phase,
        data.clientEventId, data.sourceRevision, req.user!.id,
      ],
    );
    let assessment = inserted.rows[0];
    if (!assessment) {
      const existing = await client.query<ItchAssessmentSource>(
        `SELECT id, patient_id, condition_code, instrument_code, instrument_version,
                score, scale_min, scale_max, assessment_date, phase, source_revision, updated_at
           FROM mips_itch_assessments
          WHERE tenant_id = $1 AND client_event_id = $2 LIMIT 1`,
        [req.user!.tenantId, data.clientEventId],
      );
      assessment = existing.rows[0];
    }
    const related = await client.query<ItchAssessmentSource>(
      `SELECT id, patient_id, condition_code, instrument_code, instrument_version,
              score, scale_min, scale_max, assessment_date, phase, source_revision, updated_at
         FROM mips_itch_assessments
        WHERE tenant_id = $1 AND patient_id = $2 AND condition_code = $3
          AND instrument_code = $4 AND instrument_version = $5
        ORDER BY assessment_date, source_revision, id`,
      [req.user!.tenantId, data.patientId, data.conditionCode, data.instrumentCode, data.instrumentVersion],
    );
    const candidates = deriveItchCandidates(related.rows);
    const captures = [];
    for (const candidate of candidates) {
      captures.push(await captureAutomationCandidate(client, req.user!.tenantId, req.user!.id, candidate));
    }
    await client.query('COMMIT');
    await auditLog(req.user!.tenantId, req.user!.id, 'mips_itch_assessment_recorded', 'mips_itch_assessment', assessment?.id || assessmentId);
    return res.status(201).json({
      assessment: assessment ? {
        id: assessment.id,
        conditionCode: assessment.condition_code,
        instrumentCode: assessment.instrument_code,
        instrumentVersion: assessment.instrument_version,
        score: Number(assessment.score),
        scaleMin: Number(assessment.scale_min),
        scaleMax: Number(assessment.scale_max),
        assessmentDate: String(assessment.assessment_date).slice(0, 10),
        phase: assessment.phase,
        sourceRevision: Number(assessment.source_revision),
      } : null,
      candidateCapture: captures[0] || null,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('MIPS itch assessment capture failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to record the structured itch assessment' });
  } finally {
    client.release();
  }
});

/**
 * GET/POST /api/mips/readiness/preview
 * Produces a JSON-only draft manifest.  It has no CMS/DataDerm transport.
 */
async function previewHandler(req: AuthedRequest, res: any) {
  const parsedYear = parseSupportedYear(req.query.year, true);
  if (rejectYear(res, parsedYear)) return;
  try {
    const data = await loadReadiness(req.user!.tenantId, parsedYear.year!);
    return res.json({
      draft: true,
      nonSubmission: true,
      year: parsedYear.year,
      submissionState: 'not_submitted',
      exportState: data.readiness.exportState,
      transportState: 'not_configured',
      registryPartner: MIPS_2026_CATALOG.registryPartner,
      manifest: {
        performanceYear: parsedYear.year,
        paymentYear: MIPS_2026_CATALOG.paymentYear,
        selectedQualityMeasureIds: data.profile.selectedQualityMeasureIds,
        selectedCostMeasureIds: data.profile.selectedCostMeasureIds,
        selectedImprovementActivityIds: data.profile.selectedImprovementActivityIds,
        eligibilityStatus: data.eligibility.status,
        categoryStatus: Object.fromEntries(Object.entries(data.readiness.categories).map(([category, value]) => [category, value.status])),
        readinessStatus: data.readiness.status,
        workQueue: data.readiness.workQueue,
      },
    });
  } catch (error) {
    logger.error('MIPS readiness preview failed', { errorCode: safeErrorCode(error) });
    return res.status(500).json({ error: 'Failed to create MIPS readiness preview' });
  }
}

mipsReadinessRouter.get('/preview', ...requireReportingAccess, previewHandler);
mipsReadinessRouter.post('/preview', ...requireReportingAccess, previewHandler);
