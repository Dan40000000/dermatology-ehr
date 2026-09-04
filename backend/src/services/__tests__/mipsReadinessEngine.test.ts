import {
  aggregateReadiness,
  evaluateBiopsyPatientNotification,
  evaluateDataCompleteness,
  evaluateEvidence,
  evaluateItchImprovement,
  evaluateMipsEligibility,
  evaluateProfileConfiguration,
  evaluatePathologyReportTurnaround,
  evaluateTbScreeningBeforeBiologic,
  MIPS_2026_CATALOG,
  MIPS_2026_DEFAULT_SELECTED_IA_IDS,
  MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS,
  validateContinuousPeriod,
  validateContinuousPeriodWithinYear,
  validateQualityFullYearPeriod,
} from '../mipsReadinessEngine';

describe('MIPS 2026 readiness rules', () => {
  it('exposes the year-versioned constants and public dermatology catalog', () => {
    expect(MIPS_2026_CATALOG.performanceYear).toBe(2026);
    expect(MIPS_2026_CATALOG.paymentYear).toBe(2028);
    expect(MIPS_2026_CATALOG.program.performanceThreshold).toBe(75);
    expect(MIPS_2026_CATALOG.program.maxNegativeAdjustment).toBe(-0.09);
    expect(MIPS_2026_CATALOG.program.weights).toEqual({ quality: 30, cost: 30, pi: 25, ia: 15 });
    expect(MIPS_2026_CATALOG.program.dataCompletenessPercent).toBe(75);
    expect(MIPS_2026_CATALOG.program.piMinimumContinuousDays).toBe(180);
    expect(MIPS_2026_CATALOG.program.iaMinimumContinuousDays).toBe(90);
    expect(MIPS_2026_CATALOG.program.mvpId).toBe('M1421');
    expect(MIPS_2026_CATALOG.program.lowVolumeThresholds).toEqual({
      allowedCharges: 90_000,
      beneficiaries: 200,
      coveredServices: 200,
    });
    expect(MIPS_2026_CATALOG.qualityMeasures.map((entry) => entry.id)).toEqual([
      '047', '176', '226', '238', '397', '410', '440', '485', '486', '503', '509',
      'AAD12', 'AAD16', 'AAD6', 'AAD8',
    ]);
    expect(MIPS_2026_CATALOG.costMeasures.map((entry) => entry.id)).toEqual(['COST_MR_1']);
    expect(MIPS_2026_CATALOG.populationQualityMeasures.map((entry) => entry.id)).toEqual(['479', '484']);
    expect(MIPS_2026_CATALOG.improvementActivities.map((entry) => entry.id)).toEqual([
      'IA_BE_15', 'IA_BE_4', 'IA_BE_6', 'IA_EPA_2', 'IA_EPA_7', 'IA_EPA_8', 'IA_MVP', 'IA_PCMH', 'IA_PM_16', 'IA_PSPA_8',
    ]);
    expect(MIPS_2026_CATALOG.registryPartner.state).toBe('external_not_connected');
    expect(MIPS_2026_CATALOG.registryPartner.dataDerm2026NewParticipantEnrollment).toMatchObject({
      state: 'closed',
      closedDate: '2026-08-03',
    });
    expect(MIPS_2026_CATALOG.operationalDeadlines).toMatchObject({
      mvpRegistrationDate: '2026-11-30',
      exceptionsDateTime: '2026-12-31T20:00:00-05:00',
      submissionWindowStart: '2027-01-04',
      submissionWindowEnd: '2027-03-31',
      claimsReceiptDate: '2027-03-01',
    });
    for (const entry of [
      ...MIPS_2026_CATALOG.qualityMeasures,
      ...MIPS_2026_CATALOG.costMeasures,
      ...MIPS_2026_CATALOG.improvementActivities,
    ]) {
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.workflowLabel).toBeTruthy();
      expect(entry.publicIdentifierOnly).toBe(true);
    }
  });

  it('keeps the exact 2026 dermatology workflow mappings high-level', () => {
    const labels = Object.fromEntries(MIPS_2026_CATALOG.qualityMeasures.map((entry) => [entry.id, entry.workflowLabel]));
    expect(labels).toMatchObject({
      '176': 'TB screening in the preceding 12 months before first biologic or immune-modifier therapy',
      '397': 'Melanoma reporting and staging workflow',
      '410': 'Psoriasis systemic-medication response workflow',
      '440': 'Pathologist report sent to biopsying clinician within seven days',
      '485': 'Psoriasis patient-reported itch improvement',
      '486': 'Dermatitis patient-reported itch improvement',
      '509': 'Melanoma recurrence tracking after excision',
      AAD12: 'Melanoma surgical-margin documentation',
      AAD16: 'Avoidance of postoperative systemic antibiotics',
      AAD6: 'Patient notification of biopsy results within eight days',
      AAD8: 'Chronic skin condition quality-of-life assessment',
    });
    for (const id of ['AAD12', 'AAD16', 'AAD6', 'AAD8']) {
      expect(MIPS_2026_CATALOG.qualityMeasures.find((entry) => entry.id === id)?.licensing).toMatch(/AAD\/QCDR/i);
    }
  });

  it('does not populate selectable quality or IA defaults', () => {
    expect(MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS).toEqual([]);
    expect(MIPS_2026_DEFAULT_SELECTED_IA_IDS).toEqual([]);
    expect(MIPS_2026_CATALOG.populationQualityMeasures.every((entry) => entry.selectionPolicy === 'cms_calculated')).toBe(true);
    expect(MIPS_2026_CATALOG.costMeasures[0]?.selectionPolicy).toBe('cms_calculated');
  });

  describe('eligibility', () => {
    it('keeps incomplete LVT inputs unknown', () => {
      const result = evaluateMipsEligibility({ newlyEnrolled: false, qualifiedParticipant: false, allowedCharges: 90_000 });
      expect(result.status).toBe('unknown');
      expect(result.actionNeeded).toBe(true);
      expect(result.met).toBeNull();
    });

    it('classifies newly enrolled and QP exclusions before LVT dimensions', () => {
      expect(evaluateMipsEligibility({ newlyEnrolled: true }).status).toBe('excluded-newly-enrolled');
      expect(evaluateMipsEligibility({ newlyEnrolled: false, qualifiedParticipant: true }).status).toBe('excluded-QP');
    });

    it('uses strict greater-than thresholds for voluntary, opt-in, and required states', () => {
      const base = { newlyEnrolled: false, qualifiedParticipant: false };
      expect(evaluateMipsEligibility({ ...base, allowedCharges: 90_000, beneficiaryCount: 200, coveredServices: 200 }).status).toBe('voluntary');
      expect(evaluateMipsEligibility({ ...base, allowedCharges: 90_001, beneficiaryCount: 200, coveredServices: 200 }).status).toBe('opt-in-eligible');
      expect(evaluateMipsEligibility({ ...base, allowedCharges: 90_001, beneficiaryCount: 201, coveredServices: 200 }).status).toBe('opt-in-eligible');
      expect(evaluateMipsEligibility({ ...base, allowedCharges: 90_001, beneficiaryCount: 201, coveredServices: 201 }).status).toBe('required');
      expect(evaluateMipsEligibility({ ...base, allowedCharges: 90_001, beneficiaryCount: 201, coveredServices: 201 }).exceededDimensionCount).toBe(3);
    });
  });

  it('evaluates data completeness without treating an empty denominator as complete', () => {
    expect(evaluateDataCompleteness({ completeCount: 75, eligibleCount: 100 }).status).toBe('met');
    expect(evaluateDataCompleteness({ completeCount: 74, eligibleCount: 100 }).status).toBe('not_met');
    expect(evaluateDataCompleteness({ completeCount: 0, eligibleCount: 0 }).status).toBe('unknown');
    expect(evaluateDataCompleteness({ eligibleCount: 100 }).status).toBe('unknown');
  });

  it('validates continuous durations and full-year quality boundaries', () => {
    expect(validateContinuousPeriod({ startDate: '2026-01-01', endDate: '2026-06-29', requiredDays: 180 }).status).toBe('met');
    expect(validateContinuousPeriod({ startDate: '2026-01-01', endDate: '2026-06-28', requiredDays: 180 }).status).toBe('not_met');
    expect(validateContinuousPeriod({ startDate: '2026-01-01', endDate: '2026-06-29', requiredDays: 180 }).value?.durationDays).toBe(180);
    expect(validateContinuousPeriod({ startDate: '2026-01-01', endDate: undefined, requiredDays: 180 }).status).toBe('unknown');
    expect(validateContinuousPeriodWithinYear(2026, { startDate: '2025-12-31', endDate: '2026-06-28', requiredDays: 180 }).status).toBe('not_met');
    expect(validateContinuousPeriodWithinYear(2026, { startDate: '2026-07-06', endDate: '2027-01-01', requiredDays: 180 }).status).toBe('not_met');
    expect(validateQualityFullYearPeriod(2026, '2026-01-01', '2026-12-31').status).toBe('met');
    expect(validateQualityFullYearPeriod(2026, '2026-01-01', '2026-12-30').status).toBe('not_met');
  });

  it('checks TB screening before first biologic within twelve calendar months', () => {
    const provenance = { sourceType: 'synthetic', sourceId: 'tb-1', observedAt: '2026-01-01' };
    const met = evaluateTbScreeningBeforeBiologic({ ...provenance, screeningDate: '2026-01-01', firstBiologicDate: '2026-12-31' });
    expect(met.status).toBe('met');
    expect(met.provenance[0]).toMatchObject(provenance);
    expect(evaluateTbScreeningBeforeBiologic({ screeningDate: '2025-01-01', firstBiologicDate: '2026-01-02' }).status).toBe('not_met');
    expect(evaluateTbScreeningBeforeBiologic({ screeningDate: '2026-02-01', firstBiologicDate: '2026-01-01' }).status).toBe('not_met');
    expect(evaluateTbScreeningBeforeBiologic({ firstBiologicDate: '2026-01-01' }).status).toBe('unknown');
  });

  it('checks pathology and patient notification turnaround limits with the correct licensing scope', () => {
    const pathology = evaluatePathologyReportTurnaround({
      specimenReceiptDate: '2026-03-01', reportSentDate: '2026-03-08', sourceType: 'synthetic', sourceId: 'path-1',
    });
    expect(pathology.status).toBe('met');
    expect(pathology.value?.elapsedDays).toBe(7);
    expect(pathology.limitations).toBeUndefined();
    expect(pathology.reasons.join(' ')).toMatch(/after specimen receipt/i);
    expect(evaluatePathologyReportTurnaround({ specimenReceiptDate: '2026-03-01', reportSentDate: '2026-03-09' }).status).toBe('not_met');
    expect(evaluatePathologyReportTurnaround({ specimenReceiptDate: '2026-03-01' }).status).toBe('unknown');
    expect(evaluateBiopsyPatientNotification({ finalReportDate: '2026-03-01', notificationDate: '2026-03-09' }).status).toBe('met');
    expect(evaluateBiopsyPatientNotification({ finalReportDate: '2026-03-01', notificationDate: '2026-03-09' }).reasons.join(' ')).toMatch(/after final report/i);
    expect(evaluateBiopsyPatientNotification({ finalReportDate: '2026-03-01', notificationDate: '2026-03-09' }).limitations?.join(' ')).toMatch(/AAD\/QCDR/i);
    expect(evaluateBiopsyPatientNotification({ finalReportDate: '2026-03-01', notificationDate: '2026-03-10' }).status).toBe('not_met');
    expect(evaluateBiopsyPatientNotification({ finalReportDate: '2026-03-01' }).status).toBe('unknown');
  });

  it('requires the same itch instrument, baseline at least four, and improvement at least three', () => {
    const met = evaluateItchImprovement({
      baseline: { instrument: 'NRS', score: 8, date: '2026-01-01' },
      followUp: { instrument: 'NRS', score: 5, date: '2026-03-01' },
      sourceType: 'synthetic', sourceId: 'itch-1',
    });
    expect(met.status).toBe('met');
    expect(met.value?.improvement).toBe(3);
    expect(evaluateItchImprovement({ baseline: { instrument: 'NRS', score: 8 }, followUp: { instrument: 'VAS', score: 4 } }).status).toBe('not_met');
    expect(evaluateItchImprovement({ baseline: { instrument: 'NRS', score: 3 }, followUp: { instrument: 'NRS', score: 0 } }).status).toBe('not_met');
    expect(evaluateItchImprovement({ baseline: { instrument: 'NRS', score: 8 }, followUp: { instrument: 'NRS', score: 6 } }).status).toBe('not_met');
    expect(evaluateItchImprovement({ baseline: { instrument: 'NRS', score: 8 } }).status).toBe('unknown');
  });

  it('routes structured evidence only to its matching deterministic validator', () => {
    const tb = evaluateEvidence({
      category: 'quality', measureId: '176', evidenceType: 'tb-screening', sourceType: 'synthetic', sourceId: 'tb-1',
      status: 'verified', metadata: { screeningDate: '2026-01-01', firstBiologicDate: '2026-12-31' },
    });
    expect(tb.status).toBe('met');
    expect(tb.ruleId).toBe('tb-screening-before-first-biologic-12-months');

    const report = evaluateEvidence({
      category: 'quality', measureId: '440', evidenceType: 'specimen-report', sourceType: 'synthetic', sourceId: 'path-1',
      status: 'verified', metadata: { specimenReceiptDate: '2026-02-01', reportSentDate: '2026-02-08' },
    });
    expect(report.status).toBe('met');
    expect(report.ruleId).toBe('pathology-report-to-biopsying-clinician-within-7-days');

    const notification = evaluateEvidence({
      category: 'quality', measureId: 'AAD6', evidenceType: 'final-report-notification', sourceType: 'synthetic', sourceId: 'path-2',
      status: 'verified', metadata: { finalReportDate: '2026-02-01', notificationDate: '2026-02-09' },
    });
    expect(notification.status).toBe('met');
    expect(notification.ruleId).toBe('biopsy-patient-notification-within-8-days');

    for (const measureId of ['485', '486']) {
      const itch = evaluateEvidence({
        category: 'quality', measureId, evidenceType: 'itch', sourceType: 'synthetic', sourceId: `itch-${measureId}`,
        status: 'verified', metadata: {
          baseline: { instrument: 'NRS', score: 8 },
          followUp: { instrument: 'NRS', score: 5 },
        },
      });
      expect(itch.status).toBe('met');
      expect(itch.ruleId).toBe('itch-same-instrument-baseline-follow-up');
    }
  });

  it('does not route unrelated measures to deterministic validators', () => {
    for (const measureId of ['397', '410', '509', 'AAD12', 'AAD16', 'AAD8']) {
      const result = evaluateEvidence({
        category: 'quality', measureId, evidenceType: 'pathology', sourceType: 'synthetic', sourceId: `manual-${measureId}`,
        status: 'verified', metadata: { specimenReceiptDate: '2026-01-01', reportSentDate: '2026-01-02' },
      });
      expect(result.status).toBe('met');
      expect(result.ruleId).toMatch(/^evidence:/);
      expect(result.ruleId).not.toBe('pathology-report-to-biopsying-clinician-within-7-days');
    }
  });

  it('requires explicit human verification and preserves provenance for generic evidence', () => {
    const candidate = evaluateEvidence({
      category: 'quality', measureId: 'AAD12', evidenceType: 'margin-documentation', sourceType: 'synthetic', sourceId: 'candidate-1',
      observedAt: '2026-05-01', recordedAt: '2026-05-02', status: 'candidate', metadata: {},
    });
    expect(candidate.status).toBe('unknown');
    expect(candidate.met).toBeNull();
    expect(candidate.actionNeeded).toBe(true);
    expect(candidate.provenance).toEqual([{
      sourceType: 'synthetic', sourceId: 'candidate-1', observedAt: '2026-05-01', recordedAt: '2026-05-02',
    }]);
    expect(candidate.reasons.join(' ')).toMatch(/explicit human verification/i);

    const legacy = evaluateEvidence({
      category: 'quality', measureId: 'AAD12', evidenceType: 'margin-documentation', sourceType: 'synthetic', sourceId: 'legacy-1',
      status: 'present', metadata: {},
    });
    expect(legacy.status).toBe('unknown');

    const verified = evaluateEvidence({
      category: 'quality', measureId: 'AAD12', evidenceType: 'margin-documentation', sourceType: 'synthetic', sourceId: 'verified-1',
      status: 'verified', metadata: {},
    });
    expect(verified.status).toBe('met');
    expect(verified.reasons.join(' ')).toMatch(/human-verified/i);
  });

  it('evaluates minimum selections and PI/IA/quality configuration explicitly', () => {
    const incomplete = evaluateProfileConfiguration({
      selectedQualityMeasureIds: [],
      selectedImprovementActivityIds: [],
      categoryConfiguration: {},
    });
    expect(incomplete.find((item) => item.ruleId === 'quality:selection-minimum-4')?.status).toBe('action_needed');
    expect(incomplete.find((item) => item.ruleId === 'quality:full-year-period')?.status).toBe('unknown');
    expect(incomplete.find((item) => item.ruleId === 'pi:cehrt-confirmed')?.status).toBe('unknown');
    expect(incomplete.find((item) => item.ruleId === 'ia:selection-minimum-1')?.status).toBe('action_needed');

    const complete = evaluateProfileConfiguration({
      selectedQualityMeasureIds: ['047', '176', '397', '440'],
      selectedImprovementActivityIds: ['IA_MVP'],
      categoryConfiguration: {
        qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31',
        cehrtStatus: 'confirmed', chplId: 'CHPL-SYNTHETIC',
        piStartDate: '2026-01-01', piEndDate: '2026-06-29',
        iaStartDate: '2026-01-01', iaEndDate: '2026-03-31',
      },
    });
    expect(complete.filter((item) => item.status !== 'met')).toEqual([]);

    const outsideYear = evaluateProfileConfiguration({
      selectedQualityMeasureIds: ['047', '176', '397', '440'],
      selectedImprovementActivityIds: ['IA_MVP'],
      categoryConfiguration: {
        qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31',
        cehrtStatus: 'confirmed', chplId: 'CHPL-SYNTHETIC',
        piStartDate: '2025-12-31', piEndDate: '2026-06-28',
        iaStartDate: '2026-10-04', iaEndDate: '2027-01-01',
      },
    });
    expect(outsideYear.find((item) => item.ruleId === 'pi:continuous-180-day-period')?.status).toBe('not_met');
    expect(outsideYear.find((item) => item.ruleId === 'ia:continuous-90-day-period')?.status).toBe('not_met');
  });

  it('requires verified aggregate quality completeness and a verified PI evidence row', () => {
    const profile = {
      selectedQualityMeasureIds: ['047', '397', '503', 'AAD8'],
      selectedImprovementActivityIds: ['IA_MVP'],
      categoryConfiguration: {
        qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31',
        cehrtStatus: 'confirmed' as const, chplId: 'CHPL-SYNTHETIC',
        piStartDate: '2026-01-01', piEndDate: '2026-06-29',
        iaStartDate: '2026-01-01', iaEndDate: '2026-03-31',
      },
    };
    const qualityEvidence = profile.selectedQualityMeasureIds.map((measureId) => ({
      category: 'quality' as const,
      measureId,
      evidenceType: 'manual-review',
      sourceType: 'synthetic',
      sourceId: `quality-${measureId}`,
      status: 'verified' as const,
      metadata: {},
    }));
    const iaEvidence = {
      category: 'ia' as const,
      measureId: 'IA_MVP',
      evidenceType: 'attestation',
      sourceType: 'synthetic',
      sourceId: 'ia-mvp',
      status: 'verified' as const,
      metadata: {},
    };

    const missing = aggregateReadiness({ profile, evidence: [...qualityEvidence, iaEvidence] });
    expect(missing.categories.quality.status).toBe('action_needed');
    expect(missing.categories.pi.status).toBe('action_needed');
    expect(missing.workQueue.some((item) => item.ruleId === 'data-completeness-2026')).toBe(true);
    expect(missing.workQueue.some((item) => item.ruleId === 'pi:verified-attestation-evidence')).toBe(true);

    const candidate = aggregateReadiness({
      profile,
      evidence: [
        ...qualityEvidence,
        iaEvidence,
        {
          category: 'quality' as const,
          evidenceType: 'data_completeness',
          sourceType: 'synthetic',
          sourceId: 'completeness-candidate',
          status: 'candidate' as const,
          metadata: { completeCount: 75, eligibleCount: 100 },
        },
        {
          category: 'pi' as const,
          evidenceType: 'manual-attestation',
          sourceType: 'synthetic',
          sourceId: 'pi-candidate',
          status: 'candidate' as const,
          metadata: {},
        },
      ],
    });
    expect(candidate.categories.quality.status).toBe('action_needed');
    expect(candidate.categories.pi.status).toBe('action_needed');
    expect(candidate.categories.quality.evaluations.find((item) => item.ruleId === 'data-completeness-2026')?.status).toBe('unknown');
    expect(candidate.categories.pi.evaluations.find((item) => item.ruleId === 'evidence:manual-attestation')?.status).toBe('unknown');

    const corrected = aggregateReadiness({
      profile,
      evidence: [
        ...qualityEvidence,
        iaEvidence,
        {
          category: 'quality' as const,
          evidenceType: 'data_completeness',
          sourceType: 'synthetic',
          sourceId: 'completeness-candidate',
          recordedAt: '2026-07-01T00:00:00Z',
          status: 'candidate' as const,
          metadata: { completeCount: 75, eligibleCount: 100 },
        },
        {
          category: 'quality' as const,
          evidenceType: 'data_completeness',
          sourceType: 'synthetic',
          sourceId: 'completeness-verified',
          recordedAt: '2026-07-02T00:00:00Z',
          status: 'verified' as const,
          metadata: { completeCount: 75, eligibleCount: 100 },
        },
        {
          category: 'pi' as const,
          evidenceType: 'manual-attestation',
          sourceType: 'synthetic',
          sourceId: 'pi-candidate',
          recordedAt: '2026-07-01T00:00:00Z',
          status: 'candidate' as const,
          metadata: {},
        },
        {
          category: 'pi' as const,
          evidenceType: 'manual-attestation',
          sourceType: 'synthetic',
          sourceId: 'pi-verified',
          recordedAt: '2026-07-02T00:00:00Z',
          status: 'verified' as const,
          metadata: {},
        },
      ],
    });
    expect(corrected.categories.quality.status).toBe('ready');
    expect(corrected.categories.pi.status).toBe('ready');
  });

  it('aggregates category readiness and creates a deterministic, provenance-preserving work queue', () => {
    const overview = aggregateReadiness({
      profile: {
        selectedQualityMeasureIds: ['AAD12', 'AAD16', 'AAD6', 'AAD8'],
        selectedCostMeasureIds: ['COST_MR_1'],
        selectedImprovementActivityIds: ['IA_MVP'],
        categoryConfiguration: {
          qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31',
          iaStartDate: '2026-01-01', iaEndDate: '2026-03-31',
        },
        eligibilityInputs: { newlyEnrolled: false, qualifiedParticipant: false, allowedCharges: 1, beneficiaryCount: 1, coveredServices: 1 },
      },
      evidence: [
        { category: 'quality', measureId: 'AAD12', evidenceType: 'margin-documentation', sourceType: 'synthetic', sourceId: 'path-1', status: 'rejected', metadata: {} },
        { category: 'cost', measureId: 'COST_MR_1', evidenceType: 'cost-summary', sourceType: 'synthetic', sourceId: 'cost-1', status: 'pending', metadata: {} },
        { category: 'ia', measureId: 'IA_MVP', evidenceType: 'attestation', sourceType: 'synthetic', sourceId: 'ia-1', status: 'verified', metadata: {} },
      ],
    });
    expect(overview.status).toBe('not_ready');
    expect(overview.exportState).toBe('not_ready');
    expect(overview.submissionState).toBe('not_submitted');
    expect(overview.categories.quality.status).toBe('not_ready');
    expect(overview.categories.cost.status).toBe('cms_calculated');
    expect(overview.categories.ia.status).toBe('ready');
    expect(overview.workQueue.length).toBeGreaterThanOrEqual(4);
    expect(overview.workQueue.some((item) => item.provenance[0]?.sourceId === 'path-1')).toBe(true);
    expect(overview.workQueue.every((item) => item.reasons.length > 0)).toBe(true);
  });

  it('allows registry-validation readiness while cost remains CMS-calculated and informational', () => {
    const qualityIds = ['047', '176', '397', '440'];
    const overview = aggregateReadiness({
      profile: {
        selectedQualityMeasureIds: qualityIds,
        selectedCostMeasureIds: [],
        selectedImprovementActivityIds: ['IA_MVP'],
        categoryConfiguration: {
          qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31',
          cehrtStatus: 'confirmed', chplId: 'CHPL-SYNTHETIC',
          piStartDate: '2026-01-01', piEndDate: '2026-06-29',
          iaStartDate: '2026-01-01', iaEndDate: '2026-03-31',
        },
      },
      evidence: [
        ...qualityIds.map((measureId) => ({
          category: 'quality' as const,
          measureId,
          evidenceType: 'manual-review',
          sourceType: 'synthetic',
          sourceId: `quality-${measureId}`,
          status: 'verified' as const,
          metadata: measureId === '176'
            ? { screeningDate: '2026-01-01', firstBiologicDate: '2026-12-31' }
            : measureId === '440'
              ? { specimenReceiptDate: '2026-02-01', reportSentDate: '2026-02-08' }
              : {},
        })),
        {
          category: 'quality' as const,
          evidenceType: 'data_completeness',
          sourceType: 'synthetic',
          sourceId: 'quality-completeness',
          status: 'verified' as const,
          metadata: { completeCount: 75, eligibleCount: 100 },
        },
        {
          category: 'pi' as const,
          evidenceType: 'manual-attestation',
          sourceType: 'synthetic',
          sourceId: 'pi-attestation',
          status: 'verified' as const,
          metadata: {},
        },
        {
          category: 'ia' as const,
          measureId: 'IA_MVP',
          evidenceType: 'attestation',
          sourceType: 'synthetic',
          sourceId: 'ia-mvp',
          status: 'verified' as const,
          metadata: {},
        },
      ],
    });

    expect(overview.categories.quality.status).toBe('ready');
    expect(overview.categories.pi.status).toBe('ready');
    expect(overview.categories.ia.status).toBe('ready');
    expect(overview.categories.cost.status).toBe('cms_calculated');
    expect(overview.categories.cost.evaluations[0]?.status).toBe('cms_calculated');
    expect(overview.status).toBe('ready');
    expect(overview.exportState).toBe('ready_for_registry_validation');
    expect(overview.submissionState).toBe('not_submitted');
    expect(overview.workQueue.some((item) => item.category === 'cost')).toBe(false);
  });
});
