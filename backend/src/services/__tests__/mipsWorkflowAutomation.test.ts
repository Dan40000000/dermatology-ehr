import {
  captureAutomationCandidate,
  deriveBiopsyCandidates,
  deriveItchCandidates,
  deriveTherapyCandidates,
  reconcileMipsAutomation,
  type AutomationCandidate,
  type MipsQueryExecutor,
} from '../mipsWorkflowAutomation';
import { evaluateEvidence } from '../mipsReadinessEngine';

function biopsy(received: string, resulted: string, notified = '2026-01-09T00:00:00Z') {
  return deriveBiopsyCandidates({
    id: 'synthetic-biopsy-1',
    received_by_lab_at: received,
    resulted_at: resulted,
    patient_notified_at: notified,
    patient_notified_method: 'portal',
  });
}

function therapy(screening: string | null, start: string) {
  return deriveTherapyCandidates({
    id: 'synthetic-therapy-1',
    start_date: start,
    last_tb_screening: screening,
    mips_therapy_classification: 'biologic_or_immune_response_modifier',
    mips_first_course: true,
  })[0]!;
}

describe('MIPS workflow automation backtest', () => {
  it('handles the exact pathology seven-day and notification eight-day boundaries', () => {
    const exact = biopsy('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z', '2026-01-16T00:00:00Z');
    expect(exact.find((item) => item.measureId === '440')?.metadata.computedStatus).toBe('met');
    expect(exact.find((item) => item.measureId === 'AAD6')?.metadata.computedStatus).toBe('met');

    const late = biopsy('2026-03-01T00:00:00Z', '2026-03-09T00:00:00Z', '2026-03-18T00:00:00Z');
    expect(late.find((item) => item.measureId === '440')?.metadata.computedStatus).toBe('not_met');
    expect(late.find((item) => item.measureId === 'AAD6')?.metadata.computedStatus).toBe('not_met');
  });

  it('assigns late-delivered results to the year of the originating workflow event', () => {
    const candidates = deriveBiopsyCandidates({
      id: 'synthetic-year-edge',
      received_by_lab_at: '2026-12-31T23:00:00Z',
      resulted_at: '2027-01-04T08:00:00Z',
      patient_notified_at: '2027-01-06T08:00:00Z',
      patient_notified_method: 'phone',
    });
    expect(candidates.map((item) => item.measureId)).toEqual(['440']);
    expect(candidates[0]).toMatchObject({ performanceYear: 2026, observedAt: '2026-12-31T23:00:00.000Z' });
    expect(deriveBiopsyCandidates({
      id: 'synthetic-2027-only', received_by_lab_at: '2027-01-01', resulted_at: '2027-01-02',
    })).toEqual([]);
  });

  it('uses the earliest available workflow anchor consistently at year boundaries', () => {
    expect(deriveBiopsyCandidates({
      id: 'received-in-2025',
      received_by_lab_at: '2025-12-31T23:00:00Z',
      resulted_at: '2026-01-02T08:00:00Z',
      patient_notified_at: '2026-01-03T08:00:00Z',
    }).map((item) => item.measureId)).toEqual(['AAD6']);

    expect(deriveBiopsyCandidates({
      id: 'receipt-missing',
      resulted_at: '2026-01-02T08:00:00Z',
      patient_notified_at: '2026-01-03T08:00:00Z',
    }).map((item) => item.measureId)).toEqual(['440', 'AAD6']);

    expect(deriveBiopsyCandidates({
      id: 'result-in-2027',
      received_by_lab_at: '2026-12-31T23:00:00Z',
      resulted_at: '2027-01-02T08:00:00Z',
      patient_notified_at: '2027-01-03T08:00:00Z',
    }).map((item) => item.measureId)).toEqual(['440']);
  });

  it('accepts the exact 12-calendar-month TB lookback and rejects one day over', () => {
    expect(therapy('2025-09-30', '2026-09-30').metadata.computedStatus).toBe('met');
    expect(therapy('2025-09-29', '2026-09-30').metadata.computedStatus).toBe('not_met');
    expect(therapy(null, '2026-05-01').metadata.computedStatus).toBe('unknown');
  });

  it('never infers a qualifying therapy from a medication name or free-text class', () => {
    expect(deriveTherapyCandidates({
      id: 'synthetic-therapy-unclassified',
      start_date: '2026-05-01',
      last_tb_screening: '2026-04-01',
      mips_therapy_classification: 'looks like a biologic',
      mips_first_course: true,
    })).toEqual([]);
  });

  it('pairs itch assessments by clinical date even when follow-up arrives first', () => {
    const candidates = deriveItchCandidates([
      {
        id: 'synthetic-followup', patient_id: 'synthetic-patient-a', condition_code: 'atopic_dermatitis',
        instrument_code: 'WI-NRS', instrument_version: 'practice-v1', score: 3, scale_min: 0,
        scale_max: 10, assessment_date: '2026-10-20', phase: 'follow_up', source_revision: 1,
      },
      {
        id: 'synthetic-baseline', patient_id: 'synthetic-patient-a', condition_code: 'atopic_dermatitis',
        instrument_code: 'WI-NRS', instrument_version: 'practice-v1', score: 7, scale_min: 0,
        scale_max: 10, assessment_date: '2026-10-01', phase: 'baseline', source_revision: 1,
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ measureId: '486', sourceId: 'synthetic-followup', sourceRevision: 2 });
    expect(candidates[0]?.metadata).toMatchObject({ computedStatus: 'met', baselineScore: 7, followUpScore: 3 });
    expect(JSON.stringify(candidates[0]?.metadata)).not.toContain('synthetic-patient-a');
  });

  it('does not pair different itch instruments and keeps incomplete pairs unknown', () => {
    const candidates = deriveItchCandidates([
      {
        id: 'baseline-a', patient_id: 'synthetic-patient-b', condition_code: 'atopic_dermatitis',
        instrument_code: 'WI-NRS', instrument_version: 'practice-v1', score: 8, scale_min: 0,
        scale_max: 10, assessment_date: '2026-03-01', phase: 'baseline', source_revision: 1,
      },
      {
        id: 'followup-b', patient_id: 'synthetic-patient-b', condition_code: 'atopic_dermatitis',
        instrument_code: 'VAS', instrument_version: 'practice-v1', score: 2, scale_min: 0,
        scale_max: 10, assessment_date: '2026-03-20', phase: 'follow_up', source_revision: 1,
      },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((item) => item.metadata.computedStatus === 'unknown')).toBe(true);
  });

  it('preserves a valid zero follow-up score through candidate and human-review gating', () => {
    const [candidate] = deriveItchCandidates([
      {
        id: 'zero-baseline', patient_id: 'synthetic-patient-zero', condition_code: 'psoriasis',
        instrument_code: 'practice-itch', instrument_version: 'v1', score: 7, scale_min: 0,
        scale_max: 10, assessment_date: '2026-04-01', phase: 'baseline', source_revision: 1,
      },
      {
        id: 'zero-followup', patient_id: 'synthetic-patient-zero', condition_code: 'psoriasis',
        instrument_code: 'practice-itch', instrument_version: 'v1', score: 0, scale_min: 0,
        scale_max: 10, assessment_date: '2026-04-20', phase: 'follow_up', source_revision: 1,
      },
    ]);
    expect(candidate?.metadata).toMatchObject({ computedStatus: 'met', followUpScore: 0 });
    expect(evaluateEvidence({ ...candidate, status: 'candidate' }).status).toBe('unknown');
    expect(evaluateEvidence({ ...candidate, status: 'verified' }).status).toBe('met');
  });

  it('keeps multi-episode itch series unknown until a reviewer resolves the ambiguity', () => {
    const [candidate] = deriveItchCandidates([
      {
        id: 'baseline-1', patient_id: 'synthetic-patient-series', condition_code: 'psoriasis',
        instrument_code: 'practice-itch', instrument_version: 'v1', score: 8, scale_min: 0,
        scale_max: 10, assessment_date: '2026-01-01', phase: 'baseline', source_revision: 1,
      },
      {
        id: 'baseline-2', patient_id: 'synthetic-patient-series', condition_code: 'psoriasis',
        instrument_code: 'practice-itch', instrument_version: 'v1', score: 7, scale_min: 0,
        scale_max: 10, assessment_date: '2026-03-01', phase: 'baseline', source_revision: 2,
      },
      {
        id: 'followup-1', patient_id: 'synthetic-patient-series', condition_code: 'psoriasis',
        instrument_code: 'practice-itch', instrument_version: 'v1', score: 1, scale_min: 0,
        scale_max: 10, assessment_date: '2026-03-20', phase: 'follow_up', source_revision: 1,
      },
    ]);
    expect(candidate?.metadata).toMatchObject({
      computedStatus: 'unknown', ambiguousAssessmentSeries: true,
      baselineAssessmentCount: 2, followUpAssessmentCount: 1,
      baselineScore: null, followUpScore: null,
    });
  });

  it('keeps an automatically derived valid case action-needed until a human verifies it', () => {
    const candidate = biopsy('2026-01-01', '2026-01-08')[0]!;
    const automated = evaluateEvidence({
      category: candidate.category,
      measureId: candidate.measureId,
      evidenceType: candidate.evidenceType,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      observedAt: candidate.observedAt,
      status: 'candidate',
      metadata: candidate.metadata,
    });
    const verified = evaluateEvidence({
      category: candidate.category,
      measureId: candidate.measureId,
      evidenceType: candidate.evidenceType,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      observedAt: candidate.observedAt,
      status: 'verified',
      metadata: candidate.metadata,
    });
    expect(automated.status).toBe('unknown');
    expect(verified.status).toBe('met');
  });
});

class MemoryExecutor implements MipsQueryExecutor {
  rows = new Map<string, any>();
  clock = 0;

  async query<T = any>(text: string, values: unknown[] = []): Promise<any> {
    const tenant = String(values[0] || '');
    if (text.includes('SELECT id, status, source_id')) {
      const key = `${tenant}|${String(values[2])}`;
      const row = this.rows.get(key);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('INSERT INTO mips_readiness_evidence')) {
      const key = `${String(values[1])}|${String(values[13])}`;
      const prior = this.rows.get(key);
      const incomingRevision = Number(values[14]);
      if (prior && Number(prior.source_revision || 0) >= incomingRevision) {
        return { rows: [], rowCount: 0 };
      }
      const metadata = JSON.parse(String(values[10]));
      const same = Boolean(prior
        && String(prior.source_id) === String(values[7])
        && String(prior.observed_at || '') === String(values[8] || '')
        && JSON.stringify(prior.metadata) === JSON.stringify(metadata));
      const reviewed = prior && ['verified', 'rejected', 'not_applicable'].includes(prior.status);
      const row = {
        id: prior?.id || values[0], status: same ? prior.status : reviewed ? 'needs_review' : values[9],
        source_id: values[7], observed_at: values[8], metadata, source_revision: incomingRevision,
        reviewed_by: same ? prior?.reviewed_by : null,
        reviewed_at: same ? prior?.reviewed_at : null,
        recorded_at: same ? prior?.recorded_at : ++this.clock,
      };
      this.rows.set(key, row);
      return { rows: [row], rowCount: 1 };
    }
    throw new Error(`Unexpected synthetic query: ${text.slice(0, 40)}`);
  }
}

describe('MIPS candidate idempotency and corrections', () => {
  const base: AutomationCandidate = {
    performanceYear: 2026,
    category: 'quality',
    measureId: '440',
    evidenceType: 'pathology_turnaround',
    sourceType: 'biopsy',
    sourceId: 'synthetic-source',
    observedAt: '2026-06-01T00:00:00.000Z',
    automationRuleId: 'synthetic-rule-v1',
    automationKey: 'v1|440|biopsy|synthetic-source',
    sourceRevision: 1,
    metadata: { computedStatus: 'met', workflowReadinessOnly: true },
  };

  it('creates one row, preserves a duplicate, and isolates the same source across tenants', async () => {
    const executor = new MemoryExecutor();
    expect((await captureAutomationCandidate(executor, 'tenant-a', 'user-a', base)).action).toBe('created');
    expect((await captureAutomationCandidate(executor, 'tenant-a', 'user-a', base)).action).toBe('unchanged');
    expect((await captureAutomationCandidate(executor, 'tenant-b', 'user-b', base)).action).toBe('created');
    expect(executor.rows.size).toBe(2);
  });

  it('demotes reviewed evidence on a newer correction and ignores stale delivery', async () => {
    const executor = new MemoryExecutor();
    await captureAutomationCandidate(executor, 'tenant-a', 'user-a', base);
    const row = [...executor.rows.values()][0];
    row.status = 'verified';
    const correction = {
      ...base,
      sourceRevision: 2,
      observedAt: '2026-06-02T00:00:00.000Z',
      metadata: { computedStatus: 'not_met', workflowReadinessOnly: true },
    };
    const corrected = await captureAutomationCandidate(executor, 'tenant-a', 'user-a', correction);
    expect(corrected).toMatchObject({ action: 'updated', status: 'needs_review' });
    const stale = await captureAutomationCandidate(executor, 'tenant-a', 'user-a', base);
    expect(stale.action).toBe('stale');
    expect([...executor.rows.values()][0].source_revision).toBe(2);
  });

  it('prevents a concurrently delivered older revision from overwriting the winner', async () => {
    const executor = new MemoryExecutor();
    const newer = {
      ...base,
      sourceRevision: 2,
      observedAt: '2026-06-02T00:00:00.000Z',
      metadata: { computedStatus: 'not_met', workflowReadinessOnly: true },
    };
    const [newerResult, olderResult] = await Promise.all([
      captureAutomationCandidate(executor, 'tenant-a', 'user-a', newer),
      captureAutomationCandidate(executor, 'tenant-a', 'user-a', base),
    ]);
    expect(newerResult.action).toBe('created');
    expect(olderResult.action).toBe('stale');
    expect([...executor.rows.values()][0]).toMatchObject({
      source_revision: 2,
      observed_at: '2026-06-02T00:00:00.000Z',
      metadata: { computedStatus: 'not_met', workflowReadinessOnly: true },
    });
  });

  it('advances an unchanged source revision without discarding human verification', async () => {
    const executor = new MemoryExecutor();
    await captureAutomationCandidate(executor, 'tenant-a', 'user-a', base);
    const row = [...executor.rows.values()][0];
    row.status = 'verified';
    row.reviewed_by = 'reviewer-a';
    row.reviewed_at = '2026-06-03T00:00:00.000Z';
    const recordedAt = row.recorded_at;

    const result = await captureAutomationCandidate(executor, 'tenant-a', 'user-a', {
      ...base,
      sourceRevision: 2,
    });
    expect(result).toMatchObject({ action: 'unchanged', status: 'verified' });
    expect([...executor.rows.values()][0]).toMatchObject({
      source_revision: 2, reviewed_by: 'reviewer-a', recorded_at: recordedAt,
    });
  });
});

class ReconcileExecutor extends MemoryExecutor {
  async query<T = any>(text: string, values: unknown[] = []): Promise<any> {
    if (text.includes('INSERT INTO mips_automation_runs') || text.includes('UPDATE mips_automation_runs')) {
      return { rows: [], rowCount: 1 };
    }
    if (text.includes('FROM biopsies')) {
      return { rows: [{
        id: 'reconcile-biopsy', received_by_lab_at: '2026-01-01', resulted_at: '2026-01-08',
        patient_notified_at: '2026-01-16', patient_notified_method: 'portal', updated_at: '2026-01-16T12:00:00Z',
      }], rowCount: 1 };
    }
    if (text.includes('FROM chronic_therapy_registry')) {
      return { rows: [{
        id: 'reconcile-therapy', start_date: '2026-09-30', last_tb_screening: '2025-09-30',
        mips_therapy_classification: 'biologic_or_immune_response_modifier', mips_first_course: true,
        updated_at: '2026-09-30T12:00:00Z',
      }], rowCount: 1 };
    }
    if (text.includes('FROM mips_itch_assessments')) {
      expect(text).toContain('assessment_date BETWEEN $2::date AND $3::date');
      return { rows: [
        {
          id: 'reconcile-itch-baseline', patient_id: 'reconcile-patient', condition_code: 'atopic_dermatitis',
          instrument_code: 'practice-itch', instrument_version: 'v1', score: 7, scale_min: 0,
          scale_max: 10, assessment_date: '2026-02-01', phase: 'baseline', source_revision: 1,
        },
        {
          id: 'reconcile-itch-followup', patient_id: 'reconcile-patient', condition_code: 'atopic_dermatitis',
          instrument_code: 'practice-itch', instrument_version: 'v1', score: 2, scale_min: 0,
          scale_max: 10, assessment_date: '2026-02-20', phase: 'follow_up', source_revision: 1,
        },
      ], rowCount: 2 };
    }
    return super.query<T>(text, values);
  }
}

describe('MIPS reconciliation backtest', () => {
  it('rebuilds all four workflow candidates from bounded 2026 source data', async () => {
    const executor = new ReconcileExecutor();
    const result = await reconcileMipsAutomation('tenant-a', 'user-a', executor);
    expect(result).toMatchObject({ status: 'completed', created: 4, updated: 0, stale: 0 });
    expect(result.connectors.every((connector) => connector.status === 'connected')).toBe(true);
    expect(executor.rows.size).toBe(4);
  });
});
