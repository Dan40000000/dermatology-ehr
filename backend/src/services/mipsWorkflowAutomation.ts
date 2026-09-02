import { createHash, randomUUID } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { pool } from '../db/pool';
import {
  evaluateBiopsyPatientNotification,
  evaluateItchImprovement,
  evaluatePathologyReportTurnaround,
  evaluateTbScreeningBeforeBiologic,
  type RuleEvaluation,
} from './mipsReadinessEngine';

export const MIPS_AUTOMATION_YEAR = 2026;
export const MIPS_AUTOMATION_RULE_VERSION = '2026.1';

export interface MipsQueryExecutor {
  query<T extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

export interface BiopsyAutomationSource {
  id: string;
  received_by_lab_at?: string | Date | null;
  resulted_at?: string | Date | null;
  patient_notified_at?: string | Date | null;
  patient_notified_method?: string | null;
  updated_at?: string | Date | null;
}

export interface TherapyAutomationSource {
  id: string;
  start_date?: string | Date | null;
  last_tb_screening?: string | Date | null;
  mips_therapy_classification?: string | null;
  mips_first_course?: boolean | null;
  updated_at?: string | Date | null;
}

export interface ItchAssessmentSource {
  id: string;
  patient_id: string;
  condition_code: 'atopic_dermatitis' | 'psoriasis';
  instrument_code: string;
  instrument_version: string;
  score: number | string;
  scale_min: number | string;
  scale_max: number | string;
  assessment_date: string | Date;
  phase: 'baseline' | 'follow_up';
  source_revision: number;
  updated_at?: string | Date | null;
}

export interface AutomationCandidate {
  performanceYear: 2026;
  category: 'quality';
  measureId: '176' | '440' | 'AAD6' | '485' | '486';
  evidenceType: 'tb_before_biologic' | 'pathology_turnaround' | 'biopsy_notification' | 'itch';
  sourceType: 'chronic_therapy_registry' | 'biopsy' | 'itch_assessment';
  sourceId: string;
  observedAt: string | null;
  automationRuleId: string;
  automationKey: string;
  sourceRevision: number;
  metadata: Record<string, unknown>;
}

export interface CaptureResult {
  id: string;
  action: 'created' | 'updated' | 'unchanged' | 'stale';
  status: string;
}

export interface ConnectorStatus {
  id: 'biopsy' | 'chronic_therapy' | 'itch_assessment';
  label: string;
  status: 'connected' | 'unavailable';
  candidateCount: number;
  limitation: string;
}

export interface AutomationSyncResult {
  runId: string;
  status: 'completed' | 'partial';
  performanceYear: 2026;
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  connectors: ConnectorStatus[];
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateOnly(value: string | Date | null | undefined): string | null {
  return iso(value)?.slice(0, 10) || null;
}

function inPerformanceYear(value: string | null): boolean {
  return Boolean(value?.startsWith(`${MIPS_AUTOMATION_YEAR}-`));
}

function revisionFromUpdatedAt(value: string | Date | null | undefined): number {
  const timestamp = iso(value);
  return timestamp ? Math.max(1, new Date(timestamp).getTime()) : 1;
}

function opaque(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function evaluationMetadata(
  evaluation: RuleEvaluation,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...extra,
    computedStatus: evaluation.status,
    ruleVersion: MIPS_AUTOMATION_RULE_VERSION,
    requiresHumanVerification: true,
    workflowReadinessOnly: true,
  };
}

export function deriveBiopsyCandidates(source: BiopsyAutomationSource): AutomationCandidate[] {
  const candidates: AutomationCandidate[] = [];
  const received = dateOnly(source.received_by_lab_at);
  const resulted = dateOnly(source.resulted_at);
  const notified = dateOnly(source.patient_notified_at);
  const revision = revisionFromUpdatedAt(source.updated_at);

  // The workflow-origin timestamp owns the performance year. Fall back only
  // when that source timestamp was never recorded; a later event does not
  // move an existing workflow into a different year.
  if (inPerformanceYear(received || resulted)) {
    const evaluation = evaluatePathologyReportTurnaround({
      specimenReceiptDate: received,
      reportSentDate: resulted,
    });
    candidates.push({
      performanceYear: MIPS_AUTOMATION_YEAR,
      category: 'quality',
      measureId: '440',
      evidenceType: 'pathology_turnaround',
      sourceType: 'biopsy',
      sourceId: source.id,
      observedAt: iso(source.received_by_lab_at || source.resulted_at),
      automationRuleId: `mips-440-biopsy-v${MIPS_AUTOMATION_RULE_VERSION}`,
      automationKey: `v1|440|biopsy|${source.id}`,
      sourceRevision: revision,
      metadata: evaluationMetadata(evaluation, {
        specimenReceiptDate: received,
        reportSentDate: resulted,
        reportTimestampMeaning: 'result_recorded_in_emr_proxy',
        limitationCode: 'VERIFY_REPORT_SENT_TO_BIOPSYING_CLINICIAN',
      }),
    });
  }

  if (inPerformanceYear(resulted || notified)) {
    const evaluation = evaluateBiopsyPatientNotification({
      finalReportDate: resulted,
      notificationDate: notified,
    });
    candidates.push({
      performanceYear: MIPS_AUTOMATION_YEAR,
      category: 'quality',
      measureId: 'AAD6',
      evidenceType: 'biopsy_notification',
      sourceType: 'biopsy',
      sourceId: source.id,
      observedAt: iso(source.resulted_at || source.patient_notified_at),
      automationRuleId: `mips-aad6-biopsy-v${MIPS_AUTOMATION_RULE_VERSION}`,
      automationKey: `v1|AAD6|biopsy|${source.id}`,
      sourceRevision: revision,
      metadata: evaluationMetadata(evaluation, {
        finalReportDate: resulted,
        notificationDate: notified,
        notificationMethodRecorded: Boolean(source.patient_notified_method),
        finalReportTimestampMeaning: 'result_recorded_in_emr_proxy',
        limitationCode: 'LICENSED_SPECIFICATION_REVIEW_REQUIRED',
      }),
    });
  }

  return candidates;
}

export function deriveTherapyCandidates(source: TherapyAutomationSource): AutomationCandidate[] {
  if (source.mips_therapy_classification !== 'biologic_or_immune_response_modifier' || source.mips_first_course !== true) {
    return [];
  }
  const startDate = dateOnly(source.start_date);
  if (!inPerformanceYear(startDate)) return [];
  const screeningDate = dateOnly(source.last_tb_screening);
  const evaluation = evaluateTbScreeningBeforeBiologic({ screeningDate, firstBiologicDate: startDate });
  return [{
    performanceYear: MIPS_AUTOMATION_YEAR,
    category: 'quality',
    measureId: '176',
    evidenceType: 'tb_before_biologic',
    sourceType: 'chronic_therapy_registry',
    sourceId: source.id,
    observedAt: iso(source.start_date),
    automationRuleId: `mips-176-therapy-v${MIPS_AUTOMATION_RULE_VERSION}`,
    automationKey: `v1|176|chronic_therapy_registry|${source.id}`,
    sourceRevision: revisionFromUpdatedAt(source.updated_at),
    metadata: evaluationMetadata(evaluation, {
      screeningDate,
      firstBiologicDate: startDate,
      therapyClassification: 'explicit_biologic_or_immune_response_modifier',
      firstCourseExplicit: true,
      limitationCode: 'VERIFY_CURRENT_MEASURE_SPECIFICATION',
    }),
  }];
}

export function deriveItchCandidates(rows: readonly ItchAssessmentSource[]): AutomationCandidate[] {
  const groups = new Map<string, ItchAssessmentSource[]>();
  rows.forEach((row) => {
    const key = `${row.patient_id}|${row.condition_code}|${row.instrument_code}|${row.instrument_version}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  });

  const output: AutomationCandidate[] = [];
  for (const [groupKey, groupRows] of groups.entries()) {
    const sorted = [...groupRows].sort((a, b) => {
      const dateOrder = String(dateOnly(a.assessment_date)).localeCompare(String(dateOnly(b.assessment_date)));
      return dateOrder || a.source_revision - b.source_revision || a.id.localeCompare(b.id);
    });
    const baselines = sorted.filter((row) => row.phase === 'baseline');
    const allFollowUps = sorted.filter((row) => row.phase === 'follow_up');
    const baseline = baselines.length === 1 ? baselines[0] : undefined;
    const followUps = baseline
      ? allFollowUps.filter((row) => String(dateOnly(row.assessment_date)) >= String(dateOnly(baseline.assessment_date)))
      : allFollowUps;
    const followUp = followUps.length === 1 ? followUps[0] : undefined;
    const ambiguous = baselines.length > 1 || allFollowUps.length > 1;
    const comparable = !ambiguous && Boolean(baseline && followUp);
    const anchor = sorted[sorted.length - 1];
    if (!anchor) continue;
    if (!inPerformanceYear(dateOnly(anchor.assessment_date))) continue;
    const instrument = `${anchor.instrument_code}|${anchor.instrument_version}`;
    const evaluation = evaluateItchImprovement({
      baselineInstrument: comparable ? instrument : null,
      baselineScore: comparable ? Number(baseline!.score) : null,
      followUpInstrument: comparable ? `${followUp!.instrument_code}|${followUp!.instrument_version}` : null,
      followUpScore: comparable ? Number(followUp!.score) : null,
    });
    const measureId = anchor.condition_code === 'atopic_dermatitis' ? '486' : '485';
    const stableGroup = opaque(groupKey);
    output.push({
      performanceYear: MIPS_AUTOMATION_YEAR,
      category: 'quality',
      measureId,
      evidenceType: 'itch',
      sourceType: 'itch_assessment',
      sourceId: anchor.id,
      observedAt: iso(anchor.assessment_date),
      automationRuleId: `mips-${measureId}-itch-v${MIPS_AUTOMATION_RULE_VERSION}`,
      automationKey: `v1|${measureId}|itch_assessment|${stableGroup}`,
      sourceRevision: Math.max(...sorted.map((row) => row.source_revision)),
      metadata: evaluationMetadata(evaluation, {
        baselineInstrument: comparable ? instrument : null,
        baselineScore: comparable ? Number(baseline!.score) : null,
        baselineDate: comparable ? dateOnly(baseline!.assessment_date) : null,
        followUpInstrument: comparable ? `${followUp!.instrument_code}|${followUp!.instrument_version}` : null,
        followUpScore: comparable ? Number(followUp!.score) : null,
        followUpDate: comparable ? dateOnly(followUp!.assessment_date) : null,
        baselineAssessmentCount: baselines.length,
        followUpAssessmentCount: allFollowUps.length,
        ambiguousAssessmentSeries: ambiguous,
        conditionCode: anchor.condition_code,
        limitationCode: ambiguous
          ? 'AMBIGUOUS_MULTIPLE_ASSESSMENTS_REVIEW_REQUIRED'
          : 'LICENSED_SPECIFICATION_REVIEW_REQUIRED',
      }),
    });
  }
  return output;
}

function sameCandidate(row: any, candidate: AutomationCandidate): boolean {
  return String(row.source_id) === candidate.sourceId
    && String(row.observed_at ? iso(row.observed_at) : '') === String(candidate.observedAt || '')
    && stableJson(row.metadata || {}) === stableJson(candidate.metadata);
}

export async function captureAutomationCandidate(
  executor: MipsQueryExecutor,
  tenantId: string,
  actorId: string | null,
  candidate: AutomationCandidate,
): Promise<CaptureResult> {
  const existingResult = await executor.query<any>(
    `SELECT id, status, source_id, observed_at, source_revision, metadata
       FROM mips_readiness_evidence
      WHERE tenant_id = $1 AND performance_year = $2 AND automation_key = $3
      LIMIT 1`,
    [tenantId, candidate.performanceYear, candidate.automationKey],
  );
  const existing = existingResult.rows[0];
  const existingRevision = Number(existing?.source_revision || 0);
  if (existing && existingRevision > candidate.sourceRevision) {
    return { id: existing.id, action: 'stale', status: existing.status };
  }
  if (existing && existingRevision === candidate.sourceRevision) {
    return {
      id: existing.id,
      action: sameCandidate(existing, candidate) ? 'unchanged' : 'stale',
      status: existing.status,
    };
  }

  const id = existing?.id || randomUUID();
  const contentWasUnchanged = Boolean(existing && sameCandidate(existing, candidate));
  const result = await executor.query<any>(
    `INSERT INTO mips_readiness_evidence (
       id, tenant_id, performance_year, category, measure_id, evidence_type,
       source_type, source_id, observed_at, status, metadata, created_by,
       origin, automation_rule_id, automation_key, source_revision, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12,
               'automation', $13, $14, $15, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, performance_year, automation_key)
       WHERE automation_key IS NOT NULL
     DO UPDATE SET
       measure_id = EXCLUDED.measure_id,
       evidence_type = EXCLUDED.evidence_type,
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id,
       observed_at = EXCLUDED.observed_at,
       status = CASE
         WHEN mips_readiness_evidence.source_id = EXCLUDED.source_id
          AND mips_readiness_evidence.observed_at IS NOT DISTINCT FROM EXCLUDED.observed_at
          AND mips_readiness_evidence.metadata = EXCLUDED.metadata
           THEN mips_readiness_evidence.status
         WHEN mips_readiness_evidence.status IN ('verified', 'rejected', 'not_applicable')
           THEN 'needs_review'
         ELSE 'candidate'
       END,
       metadata = EXCLUDED.metadata,
       automation_rule_id = EXCLUDED.automation_rule_id,
       source_revision = EXCLUDED.source_revision,
       reviewed_by = CASE
         WHEN mips_readiness_evidence.source_id = EXCLUDED.source_id
          AND mips_readiness_evidence.observed_at IS NOT DISTINCT FROM EXCLUDED.observed_at
          AND mips_readiness_evidence.metadata = EXCLUDED.metadata
           THEN mips_readiness_evidence.reviewed_by
         ELSE NULL
       END,
       reviewed_at = CASE
         WHEN mips_readiness_evidence.source_id = EXCLUDED.source_id
          AND mips_readiness_evidence.observed_at IS NOT DISTINCT FROM EXCLUDED.observed_at
          AND mips_readiness_evidence.metadata = EXCLUDED.metadata
           THEN mips_readiness_evidence.reviewed_at
         ELSE NULL
       END,
       recorded_at = CASE
         WHEN mips_readiness_evidence.source_id = EXCLUDED.source_id
          AND mips_readiness_evidence.observed_at IS NOT DISTINCT FROM EXCLUDED.observed_at
          AND mips_readiness_evidence.metadata = EXCLUDED.metadata
           THEN mips_readiness_evidence.recorded_at
         ELSE CURRENT_TIMESTAMP
       END,
       updated_at = CURRENT_TIMESTAMP
     WHERE COALESCE(mips_readiness_evidence.source_revision, 0) < EXCLUDED.source_revision
     RETURNING id, status`,
    [
      id,
      tenantId,
      candidate.performanceYear,
      candidate.category,
      candidate.measureId,
      candidate.evidenceType,
      candidate.sourceType,
      candidate.sourceId,
      candidate.observedAt,
      'candidate',
      JSON.stringify(candidate.metadata),
      actorId,
      candidate.automationRuleId,
      candidate.automationKey,
      candidate.sourceRevision,
    ],
  );
  if (!result.rows[0]) {
    const winnerResult = await executor.query<any>(
      `SELECT id, status, source_id, observed_at, source_revision, metadata
         FROM mips_readiness_evidence
        WHERE tenant_id = $1 AND performance_year = $2 AND automation_key = $3
        LIMIT 1`,
      [tenantId, candidate.performanceYear, candidate.automationKey],
    );
    const winner = winnerResult.rows[0];
    if (winner) {
      return {
        id: winner.id,
        action: sameCandidate(winner, candidate) ? 'unchanged' : 'stale',
        status: winner.status,
      };
    }
  }
  return {
    id: result.rows[0]?.id || id,
    action: existing ? (contentWasUnchanged ? 'unchanged' : 'updated') : 'created',
    status: result.rows[0]?.status || 'candidate',
  };
}

export async function captureBiopsyCandidates(
  executor: MipsQueryExecutor,
  tenantId: string,
  actorId: string | null,
  source: BiopsyAutomationSource,
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];
  for (const candidate of deriveBiopsyCandidates(source)) {
    results.push(await captureAutomationCandidate(executor, tenantId, actorId, candidate));
  }
  return results;
}

export async function captureTherapyCandidates(
  executor: MipsQueryExecutor,
  tenantId: string,
  actorId: string | null,
  source: TherapyAutomationSource,
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];
  for (const candidate of deriveTherapyCandidates(source)) {
    results.push(await captureAutomationCandidate(executor, tenantId, actorId, candidate));
  }
  return results;
}

function unavailable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
}

export async function reconcileMipsAutomation(
  tenantId: string,
  actorId: string,
  executor: MipsQueryExecutor = pool,
): Promise<AutomationSyncResult> {
  const runId = randomUUID();
  await executor.query(
    `INSERT INTO mips_automation_runs (id, tenant_id, performance_year, status, triggered_by)
     VALUES ($1, $2, $3, 'running', $4)`,
    [runId, tenantId, MIPS_AUTOMATION_YEAR, actorId],
  );

  try {
  const connectors: ConnectorStatus[] = [];
  const results: CaptureResult[] = [];
  const runConnector = async <T extends QueryResultRow>(
    id: ConnectorStatus['id'],
    label: string,
    limitation: string,
    query: string,
    derive: (rows: T[]) => AutomationCandidate[],
  ) => {
    try {
      const response = await executor.query<T>(query, [tenantId, `${MIPS_AUTOMATION_YEAR}-01-01`, `${MIPS_AUTOMATION_YEAR}-12-31`]);
      const candidates = derive(response.rows);
      for (const candidate of candidates) {
        results.push(await captureAutomationCandidate(executor, tenantId, actorId, candidate));
      }
      connectors.push({ id, label, status: 'connected', candidateCount: candidates.length, limitation });
    } catch (error) {
      if (!unavailable(error)) throw error;
      connectors.push({ id, label, status: 'unavailable', candidateCount: 0, limitation: `${limitation} Source schema is not available in this environment.` });
    }
  };

  await runConnector<BiopsyAutomationSource>(
    'biopsy',
    'Biopsy result and notification workflow',
    'The local result timestamp is a proxy for report delivery and remains subject to human review.',
    `SELECT id, received_by_lab_at, resulted_at, patient_notified_at, patient_notified_method, updated_at
       FROM biopsies
      WHERE tenant_id = $1 AND deleted_at IS NULL
        AND (received_by_lab_at BETWEEN $2::date AND $3::date + INTERVAL '1 day'
          OR resulted_at BETWEEN $2::date AND $3::date + INTERVAL '1 day'
          OR patient_notified_at BETWEEN $2::date AND $3::date + INTERVAL '1 day')`,
    (rows) => rows.flatMap(deriveBiopsyCandidates),
  );

  await runConnector<TherapyAutomationSource>(
    'chronic_therapy',
    'First-course therapy and TB workflow',
    'Only explicitly classified first-course therapy records are considered; medication-name matching is not used.',
    `SELECT id, start_date, last_tb_screening, mips_therapy_classification, mips_first_course, updated_at
       FROM chronic_therapy_registry
      WHERE tenant_id = $1 AND start_date BETWEEN $2::date AND $3::date
        AND mips_therapy_classification = 'biologic_or_immune_response_modifier'
        AND mips_first_course = true`,
    (rows) => rows.flatMap(deriveTherapyCandidates),
  );

  await runConnector<ItchAssessmentSource>(
    'itch_assessment',
    'Structured itch assessments',
    'Candidates use the same named instrument and still require the current licensed specification to be verified.',
    `SELECT id, patient_id, condition_code, instrument_code, instrument_version,
            score, scale_min, scale_max, assessment_date, phase, source_revision, updated_at
       FROM mips_itch_assessments
      WHERE tenant_id = $1 AND assessment_date BETWEEN $2::date AND $3::date
      ORDER BY patient_id, condition_code, instrument_code, instrument_version, assessment_date, source_revision`,
    deriveItchCandidates,
  );

  const counts = results.reduce((acc, result) => {
    acc[result.action] += 1;
    return acc;
  }, { created: 0, updated: 0, unchanged: 0, stale: 0 });
  const status = connectors.some((connector) => connector.status === 'unavailable') ? 'partial' : 'completed';
  await executor.query(
    `UPDATE mips_automation_runs
        SET status = $1, connector_summary = $2::jsonb,
            candidates_created = $3, candidates_updated = $4,
            candidates_unchanged = $5, candidates_stale = $6, completed_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND tenant_id = $8`,
    [status, JSON.stringify(connectors), counts.created, counts.updated, counts.unchanged, counts.stale, runId, tenantId],
  );

  return {
    runId,
    status,
    performanceYear: MIPS_AUTOMATION_YEAR,
    ...counts,
    connectors,
  };
  } catch (error) {
    try {
      await executor.query(
        `UPDATE mips_automation_runs
            SET status = 'failed', completed_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND tenant_id = $2`,
        [runId, tenantId],
      );
    } catch {
      // Preserve the original reconciliation error; status repair can be
      // handled operationally if the database itself is unavailable.
    }
    throw error;
  }
}
