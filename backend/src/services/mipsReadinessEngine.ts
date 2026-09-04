/**
 * Deterministic, year-versioned MIPS readiness rules.
 *
 * This module deliberately contains no database, HTTP, logging, or patient
 * record dependencies.  It is suitable for synthetic backtests and for
 * producing an audit-friendly explanation of each result.  The catalog uses
 * public identifiers and short workflow labels only; proprietary measure
 * specifications are not reproduced here.
 */

export const MIPS_2026_PROGRAM_CONSTANTS = Object.freeze({
  performanceYear: 2026,
  paymentYear: 2028,
  performanceThreshold: 75,
  threshold: 75,
  maxNegativeAdjustment: -0.09,
  weights: Object.freeze({
    quality: 30,
    cost: 30,
    pi: 25,
    ia: 15,
  }),
  standardWeights: Object.freeze({ quality: 30, cost: 30, pi: 25, ia: 15 }),
  maxNegativeAdjustmentPercent: -9,
  dataCompletenessPercent: 75,
  dataCompleteness: 75,
  qualityPeriod: Object.freeze({ type: 'full_year' as const }),
  piMinimumContinuousDays: 180,
  iaMinimumContinuousDays: 90,
  mvpId: 'M1421',
  operationalDeadlines: Object.freeze({
    mvpRegistrationDate: '2026-11-30',
    exceptionsDateTime: '2026-12-31T20:00:00-05:00',
    submissionWindowStart: '2027-01-04',
    submissionWindowEnd: '2027-03-31',
    claimsReceiptDate: '2027-03-01',
  }),
  registryPartner: Object.freeze({
    state: 'external_not_connected' as const,
    name: null as string | null,
    selection: 'not_selected' as const,
    availableOptions: Object.freeze(['DataDerm or another approved registry transport']),
    dataDerm2026NewParticipantEnrollment: Object.freeze({
      state: 'closed' as const,
      closedDate: '2026-08-03',
      planningRecommendation: 'If DataDerm is selected, plan new-participant enrollment for 2027; it is not the only registry option.',
    }),
  }),
  lowVolumeThresholds: Object.freeze({
    allowedCharges: 90_000,
    beneficiaries: 200,
    coveredServices: 200,
  }),
});

export const MIPS_2026_CONSTANTS = MIPS_2026_PROGRAM_CONSTANTS;
export const MIPS_2026_RULES = MIPS_2026_PROGRAM_CONSTANTS;
export const MIPS_2026_OPERATIONAL_DEADLINES = MIPS_2026_PROGRAM_CONSTANTS.operationalDeadlines;
export const MIPS_2026_REGISTRY_PARTNER = MIPS_2026_PROGRAM_CONSTANTS.registryPartner;

export type MipsCategory = 'quality' | 'cost' | 'pi' | 'ia';

export interface MipsCatalogEntry {
  id: string;
  measureId: string;
  category: MipsCategory;
  workflowLabel: string;
  sourceUrl: string;
  collectionLimitations: string;
  licensing?: string;
  selectionPolicy: 'user_selectable' | 'cms_calculated';
  publicIdentifierOnly: true;
}

const CMS_QUALITY_URL = 'https://qpp.cms.gov/mips/quality-measures';
const CMS_COST_URL = 'https://qpp.cms.gov/mips/cost';
const CMS_PI_URL = 'https://qpp.cms.gov/mips/promoting-interoperability';
const CMS_IA_URL = 'https://qpp.cms.gov/mips/improvement-activities';
const AAD_QCDR_URL = 'https://www.aad.org/member/practice-management/quality';
const PUBLIC_MEASURE_LIMITATION =
  'Public identifier and workflow label only. Verify the current CMS/QPP specification, benchmark, denominator, collection method, and submission rules before use.';
const AAD_QCDR_LIMITATION =
  'AAD/QCDR measure: current AAD/QCDR license or registry agreement may be required for collection or reporting. Proprietary measure text is intentionally omitted.';
const CMS_CALCULATED_LIMITATION =
  'CMS-calculated category/segment. The local readiness ledger cannot calculate or score this measure; verify the CMS claims-calculated result through an approved registry or CMS workflow.';

function catalogEntry(
  id: string,
  category: MipsCategory,
  workflowLabel: string,
  sourceUrl: string,
  collectionLimitations = PUBLIC_MEASURE_LIMITATION,
  licensing?: string,
  selectionPolicy: 'user_selectable' | 'cms_calculated' = 'user_selectable',
): MipsCatalogEntry {
  return Object.freeze({
    id,
    measureId: id,
    category,
    workflowLabel,
    sourceUrl,
    collectionLimitations,
    ...(licensing ? { licensing } : {}),
    selectionPolicy,
    publicIdentifierOnly: true as const,
  });
}

/** Public dermatology quality identifiers used by the 2026 foundation. */
export const MIPS_2026_QUALITY_MEASURES: readonly MipsCatalogEntry[] = Object.freeze([
  catalogEntry('047', 'quality', 'Medication reconciliation workflow', CMS_QUALITY_URL),
  catalogEntry('176', 'quality', 'TB screening in the preceding 12 months before first biologic or immune-modifier therapy', CMS_QUALITY_URL),
  catalogEntry('226', 'quality', 'Tobacco screening and cessation workflow', CMS_QUALITY_URL),
  catalogEntry('238', 'quality', 'Tobacco-use screening workflow', CMS_QUALITY_URL),
  catalogEntry('397', 'quality', 'Melanoma reporting and staging workflow', CMS_QUALITY_URL),
  catalogEntry('410', 'quality', 'Psoriasis systemic-medication response workflow', CMS_QUALITY_URL),
  catalogEntry('440', 'quality', 'Pathologist report sent to biopsying clinician within seven days', CMS_QUALITY_URL),
  catalogEntry('485', 'quality', 'Psoriasis patient-reported itch improvement', CMS_QUALITY_URL),
  catalogEntry('486', 'quality', 'Dermatitis patient-reported itch improvement', CMS_QUALITY_URL),
  catalogEntry('503', 'quality', 'Clinical documentation workflow', CMS_QUALITY_URL),
  catalogEntry('509', 'quality', 'Melanoma recurrence tracking after excision', CMS_QUALITY_URL),
  catalogEntry('AAD12', 'quality', 'Melanoma surgical-margin documentation', AAD_QCDR_URL, AAD_QCDR_LIMITATION, 'AAD/QCDR licensing limitation'),
  catalogEntry('AAD16', 'quality', 'Avoidance of postoperative systemic antibiotics', AAD_QCDR_URL, AAD_QCDR_LIMITATION, 'AAD/QCDR licensing limitation'),
  catalogEntry('AAD6', 'quality', 'Patient notification of biopsy results within eight days', AAD_QCDR_URL, AAD_QCDR_LIMITATION, 'AAD/QCDR licensing limitation'),
  catalogEntry('AAD8', 'quality', 'Chronic skin condition quality-of-life assessment', AAD_QCDR_URL, AAD_QCDR_LIMITATION, 'AAD/QCDR licensing limitation'),
]);

/** Public population quality identifiers kept separate from the selected dermatology list. */
export const MIPS_2026_POPULATION_QUALITY_MEASURES: readonly MipsCatalogEntry[] = Object.freeze([
  catalogEntry('479', 'quality', 'CMS-calculated population quality segment 479', CMS_QUALITY_URL, CMS_CALCULATED_LIMITATION, undefined, 'cms_calculated'),
  catalogEntry('484', 'quality', 'CMS-calculated population quality segment 484', CMS_QUALITY_URL, CMS_CALCULATED_LIMITATION, undefined, 'cms_calculated'),
]);

export const MIPS_2026_COST_MEASURES: readonly MipsCatalogEntry[] = Object.freeze([
  catalogEntry('COST_MR_1', 'cost', 'CMS claims-calculated cost measure', CMS_COST_URL, CMS_CALCULATED_LIMITATION, undefined, 'cms_calculated'),
]);

/** Selected improvement-activity identifiers for the dermatology foundation. */
export const MIPS_2026_IMPROVEMENT_ACTIVITIES: readonly MipsCatalogEntry[] = Object.freeze([
  catalogEntry('IA_BE_15', 'ia', 'Behavioral and social-risk screening workflow', CMS_IA_URL),
  catalogEntry('IA_BE_4', 'ia', 'Care coordination workflow', CMS_IA_URL),
  catalogEntry('IA_BE_6', 'ia', 'Medication-management improvement workflow', CMS_IA_URL),
  catalogEntry('IA_EPA_2', 'ia', 'Electronic access improvement workflow', CMS_IA_URL),
  catalogEntry('IA_EPA_7', 'ia', 'Patient engagement through electronic access', CMS_IA_URL),
  catalogEntry('IA_EPA_8', 'ia', 'Clinical data exchange workflow', CMS_IA_URL),
  catalogEntry('IA_MVP', 'ia', 'MVP participation workflow', CMS_IA_URL),
  catalogEntry('IA_PCMH', 'ia', 'Patient-centered medical home workflow', CMS_IA_URL),
  catalogEntry('IA_PM_16', 'ia', 'Population-management improvement workflow', CMS_IA_URL),
  catalogEntry('IA_PSPA_8', 'ia', 'Patient safety and practice assessment workflow', CMS_IA_URL),
]);

export interface Mips2026Catalog {
  performanceYear: 2026;
  paymentYear: 2028;
  program: typeof MIPS_2026_PROGRAM_CONSTANTS;
  qualityMeasures: readonly MipsCatalogEntry[];
  populationQualityMeasures: readonly MipsCatalogEntry[];
  costMeasures: readonly MipsCatalogEntry[];
  improvementActivities: readonly MipsCatalogEntry[];
  sources: Readonly<Record<string, string>>;
  operationalDeadlines: typeof MIPS_2026_PROGRAM_CONSTANTS.operationalDeadlines;
  registryPartner: typeof MIPS_2026_PROGRAM_CONSTANTS.registryPartner;
}

export const MIPS_2026_CATALOG: Mips2026Catalog = Object.freeze({
  performanceYear: 2026,
  paymentYear: 2028,
  program: MIPS_2026_PROGRAM_CONSTANTS,
  qualityMeasures: MIPS_2026_QUALITY_MEASURES,
  populationQualityMeasures: MIPS_2026_POPULATION_QUALITY_MEASURES,
  costMeasures: MIPS_2026_COST_MEASURES,
  improvementActivities: MIPS_2026_IMPROVEMENT_ACTIVITIES,
  operationalDeadlines: MIPS_2026_PROGRAM_CONSTANTS.operationalDeadlines,
  registryPartner: MIPS_2026_PROGRAM_CONSTANTS.registryPartner,
  sources: Object.freeze({
    cms: 'https://qpp.cms.gov/mips',
    quality: CMS_QUALITY_URL,
    cost: CMS_COST_URL,
    promotingInteroperability: CMS_PI_URL,
    improvementActivities: CMS_IA_URL,
    aadQcdr: AAD_QCDR_URL,
  }),
});
export const MIPS_2026_RULE_CATALOG = MIPS_2026_CATALOG;

export const MIPS_2026_SELECTED_QUALITY_IDS = Object.freeze(
  MIPS_2026_QUALITY_MEASURES.map((entry) => entry.id),
);
export const MIPS_2026_POPULATION_QUALITY_IDS = Object.freeze(
  MIPS_2026_POPULATION_QUALITY_MEASURES.map((entry) => entry.id),
);
export const MIPS_2026_ALL_QUALITY_IDS = Object.freeze([
  ...MIPS_2026_SELECTED_QUALITY_IDS,
  ...MIPS_2026_POPULATION_QUALITY_IDS,
]);
export const MIPS_2026_QUALITY_MEASURE_IDS = MIPS_2026_SELECTED_QUALITY_IDS;
export const MIPS_2026_SELECTED_COST_IDS = Object.freeze(
  MIPS_2026_COST_MEASURES.map((entry) => entry.id),
);
export const MIPS_2026_SELECTED_IA_IDS = Object.freeze(
  MIPS_2026_IMPROVEMENT_ACTIVITIES.map((entry) => entry.id),
);
export const MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS: readonly string[] = Object.freeze([]);
export const MIPS_2026_DEFAULT_SELECTED_IA_IDS: readonly string[] = Object.freeze([]);
export const MIPS_2026_MIN_SELECTED_QUALITY_MEASURES = 4;
export const MIPS_2026_MIN_SELECTED_IA_MEASURES = 1;
export const DERMATOLOGY_2026_QUALITY_MEASURE_IDS = MIPS_2026_SELECTED_QUALITY_IDS;
export const DERMATOLOGY_2026_COST_MEASURE_IDS = MIPS_2026_SELECTED_COST_IDS;
export const DERMATOLOGY_2026_IA_IDS = MIPS_2026_SELECTED_IA_IDS;

export type EvaluationStatus = 'met' | 'not_met' | 'unknown' | 'action_needed' | 'not_applicable' | 'cms_calculated';

export interface Provenance {
  sourceType?: string;
  sourceId?: string;
  observedAt?: string;
  recordedAt?: string;
}

export interface ProvenanceInput {
  provenance?: readonly Provenance[] | null;
  sourceType?: string | null;
  sourceId?: string | null;
  observedAt?: string | null;
  recordedAt?: string | null;
}

export interface RuleEvaluation<T = unknown> {
  ruleId: string;
  status: EvaluationStatus;
  /** A tri-state value prevents unknown data from being treated as success. */
  met: boolean | null;
  actionNeeded: boolean;
  reasons: readonly string[];
  provenance: readonly Provenance[];
  value?: T;
  limitations?: readonly string[];
}

function normalizeProvenance(input: ProvenanceInput | null | undefined): Provenance[] {
  const values: Provenance[] = [];
  for (const item of input?.provenance || []) {
    if (!item || typeof item !== 'object') continue;
    const normalized: Provenance = {};
    if (typeof item.sourceType === 'string' && item.sourceType.trim()) normalized.sourceType = item.sourceType.trim();
    if (typeof item.sourceId === 'string' && item.sourceId.trim()) normalized.sourceId = item.sourceId.trim();
    if (typeof item.observedAt === 'string' && item.observedAt.trim()) normalized.observedAt = item.observedAt.trim();
    if (typeof item.recordedAt === 'string' && item.recordedAt.trim()) normalized.recordedAt = item.recordedAt.trim();
    if (Object.keys(normalized).length) values.push(normalized);
  }

  const direct: Provenance = {};
  if (typeof input?.sourceType === 'string' && input.sourceType.trim()) direct.sourceType = input.sourceType.trim();
  if (typeof input?.sourceId === 'string' && input.sourceId.trim()) direct.sourceId = input.sourceId.trim();
  if (typeof input?.observedAt === 'string' && input.observedAt.trim()) direct.observedAt = input.observedAt.trim();
  if (typeof input?.recordedAt === 'string' && input.recordedAt.trim()) direct.recordedAt = input.recordedAt.trim();
  if (Object.keys(direct).length) values.push(direct);
  return values;
}

function evaluation<T>(
  ruleId: string,
  status: EvaluationStatus,
  reasons: readonly string[],
  input?: ProvenanceInput | null,
  value?: T,
  limitations?: readonly string[],
): RuleEvaluation<T> {
  const result: RuleEvaluation<T> = {
    ruleId,
    status,
    met: status === 'met' ? true : status === 'not_met' ? false : null,
    actionNeeded: status === 'unknown' || status === 'action_needed' || status === 'not_met',
    reasons: [...reasons],
    provenance: normalizeProvenance(input),
  };
  if (value !== undefined) result.value = value;
  if (limitations?.length) result.limitations = [...limitations];
  return result;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

export type EligibilityStatus =
  | 'unknown'
  | 'excluded-newly-enrolled'
  | 'excluded-QP'
  | 'voluntary'
  | 'opt-in-eligible'
  | 'required';

export interface MipsEligibilityInput extends ProvenanceInput {
  newlyEnrolled?: boolean | null;
  /** Alias accepted for integrations that use a longer field name. */
  newlyEnrolledEligibleProfessional?: boolean | null;
  qualifiedParticipant?: boolean | null;
  qpStatus?: boolean | null;
  allowedCharges?: number | null;
  allowedChargesDollars?: number | null;
  beneficiaryCount?: number | null;
  beneficiaries?: number | null;
  coveredServices?: number | null;
  coveredServicesCount?: number | null;
  lvt?: Partial<{
    allowedCharges: number | null;
    beneficiaries: number | null;
    coveredServices: number | null;
  }> | null;
}

export interface MipsEligibilityResult {
  ruleId: 'mips-eligibility-2026';
  status: EligibilityStatus;
  actionNeeded: boolean;
  met: boolean | null;
  reasons: readonly string[];
  provenance: readonly Provenance[];
  thresholds: typeof MIPS_2026_PROGRAM_CONSTANTS.lowVolumeThresholds;
  dimensions: {
    allowedCharges: { value: number | null; exceeded: boolean | null };
    beneficiaries: { value: number | null; exceeded: boolean | null };
    coveredServices: { value: number | null; exceeded: boolean | null };
  };
  exceededDimensionCount: number | null;
}

/**
 * Evaluate the three independent low-volume-threshold dimensions.  Threshold
 * comparisons are strictly `>`; a value equal to a threshold is not exceeded.
 */
export function evaluateMipsEligibility(input: MipsEligibilityInput | null | undefined): MipsEligibilityResult {
  const source = input || {};
  const newlyEnrolled = source.newlyEnrolled ?? source.newlyEnrolledEligibleProfessional;
  const qualifiedParticipant = source.qualifiedParticipant ?? source.qpStatus;
  const allowedCharges = numberOrNull(
    source.allowedCharges ?? source.allowedChargesDollars ?? source.lvt?.allowedCharges,
  );
  const beneficiaries = numberOrNull(source.beneficiaryCount ?? source.beneficiaries ?? source.lvt?.beneficiaries);
  const coveredServices = numberOrNull(
    source.coveredServices ?? source.coveredServicesCount ?? source.lvt?.coveredServices,
  );
  const thresholds = MIPS_2026_PROGRAM_CONSTANTS.lowVolumeThresholds;
  const dimensions = {
    allowedCharges: {
      value: allowedCharges,
      exceeded: allowedCharges === null ? null : allowedCharges > thresholds.allowedCharges,
    },
    beneficiaries: {
      value: beneficiaries,
      exceeded: beneficiaries === null ? null : beneficiaries > thresholds.beneficiaries,
    },
    coveredServices: {
      value: coveredServices,
      exceeded: coveredServices === null ? null : coveredServices > thresholds.coveredServices,
    },
  };
  const reasons: string[] = [];
  let status: EligibilityStatus = 'unknown';
  let exceededDimensionCount: number | null = null;

  if (newlyEnrolled === true) {
    status = 'excluded-newly-enrolled';
    reasons.push('The clinician is marked newly enrolled for the performance year.');
  } else if (qualifiedParticipant === true) {
    status = 'excluded-QP';
    reasons.push('The clinician is marked as a qualifying participant (QP).');
  } else if (newlyEnrolled !== false || qualifiedParticipant !== false) {
    reasons.push('New-enrollment and QP flags must both be explicitly false before LVT classification.');
  } else if (Object.values(dimensions).some((dimension) => dimension.exceeded === null)) {
    reasons.push('All three LVT dimensions are required; missing dimensions remain unknown.');
  } else {
    exceededDimensionCount = Object.values(dimensions).filter((dimension) => dimension.exceeded === true).length;
    if (exceededDimensionCount === 0) {
      status = 'voluntary';
      reasons.push('Zero LVT dimensions exceed the 2026 thresholds; participation is voluntary.');
    } else if (exceededDimensionCount < 3) {
      status = 'opt-in-eligible';
      reasons.push(`${exceededDimensionCount} of 3 LVT dimensions exceed the 2026 thresholds; opt-in is available.`);
    } else {
      status = 'required';
      reasons.push('All three LVT dimensions exceed the 2026 thresholds; MIPS participation is required.');
    }
    reasons.push('Allowed charges, beneficiaries, and covered services use strict greater-than comparisons.');
  }

  return {
    ruleId: 'mips-eligibility-2026',
    status,
    actionNeeded: status === 'unknown',
    met: status === 'unknown' ? null : true,
    reasons,
    provenance: normalizeProvenance(source),
    thresholds,
    dimensions,
    exceededDimensionCount,
  };
}

export const evaluateEligibility = evaluateMipsEligibility;

export interface DataCompletenessInput extends ProvenanceInput {
  completeCount?: number | null;
  eligibleCount?: number | null;
  numeratorCount?: number | null;
  denominatorCount?: number | null;
  completenessPercent?: number | null;
  thresholdPercent?: number | null;
}

export interface DataCompletenessValue {
  completeCount: number | null;
  eligibleCount: number | null;
  completenessPercent: number | null;
  thresholdPercent: number;
}

export function evaluateDataCompleteness(input: DataCompletenessInput | null | undefined): RuleEvaluation<DataCompletenessValue> {
  const source = input || {};
  const completeCount = numberOrNull(source.completeCount ?? source.numeratorCount);
  const eligibleCount = numberOrNull(source.eligibleCount ?? source.denominatorCount);
  const thresholdPercent = numberOrNull(source.thresholdPercent) ?? MIPS_2026_PROGRAM_CONSTANTS.dataCompletenessPercent;
  let percent = numberOrNull(source.completenessPercent);
  const reasons: string[] = [];

  if (percent === null && completeCount !== null && eligibleCount !== null && eligibleCount > 0) {
    percent = (completeCount / eligibleCount) * 100;
  }

  const value = { completeCount, eligibleCount, completenessPercent: percent, thresholdPercent };
  if (eligibleCount === null || completeCount === null) {
    reasons.push('Complete and eligible record counts are required; missing data is unknown.');
    return evaluation('data-completeness-2026', 'unknown', reasons, source, value);
  }
  if (eligibleCount <= 0) {
    reasons.push('An eligible-record denominator greater than zero is required; no denominator is not assumed complete.');
    return evaluation('data-completeness-2026', 'unknown', reasons, source, value);
  }
  if (completeCount < 0 || completeCount > eligibleCount || percent === null || percent < 0 || percent > 100) {
    reasons.push('Completeness counts or percentage are internally inconsistent.');
    return evaluation('data-completeness-2026', 'not_met', reasons, source, value);
  }
  if (percent >= thresholdPercent) {
    reasons.push(`Data completeness is ${percent.toFixed(2)}%, meeting the ${thresholdPercent}% threshold.`);
    return evaluation('data-completeness-2026', 'met', reasons, source, value);
  }
  reasons.push(`Data completeness is ${percent.toFixed(2)}%, below the ${thresholdPercent}% threshold.`);
  return evaluation('data-completeness-2026', 'not_met', reasons, source, value);
}

export const validateDataCompleteness = evaluateDataCompleteness;
export const checkDataCompleteness = evaluateDataCompleteness;

export type DateLike = string | Date;

function parseUtcDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) return null;
    return date;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function elapsedDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function daysInYear(year: number): number {
  return new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime() === 366 * 86_400_000
    ? 366
    : 365;
}

function addCalendarMonths(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const firstOfTarget = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDay),
  ));
}

export interface ContinuousPeriodInput extends ProvenanceInput {
  startDate?: DateLike | null;
  endDate?: DateLike | null;
  requiredDays: number;
  expectedStartDate?: DateLike | null;
  expectedEndDate?: DateLike | null;
  periodName?: string;
}

export interface ContinuousPeriodValue {
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  requiredDays: number;
}

/** Validate an inclusive, gap-free period represented by its endpoints. */
export function validateContinuousPeriod(input: ContinuousPeriodInput): RuleEvaluation<ContinuousPeriodValue> {
  const start = parseUtcDate(input.startDate);
  const end = parseUtcDate(input.endDate);
  const requiredDays = Number.isFinite(input.requiredDays) && input.requiredDays > 0 ? input.requiredDays : 0;
  const value: ContinuousPeriodValue = {
    startDate: start ? dateString(start) : null,
    endDate: end ? dateString(end) : null,
    durationDays: start && end && end >= start ? inclusiveDays(start, end) : null,
    requiredDays,
  };
  const periodName = input.periodName || 'continuous period';
  const reasons: string[] = [];

  if (!start || !end || requiredDays <= 0) {
    reasons.push(`${periodName} start, end, and a positive required duration are required; missing data is unknown.`);
    return evaluation('continuous-period', 'unknown', reasons, input, value);
  }
  if (end < start) {
    reasons.push(`${periodName} end precedes its start.`);
    return evaluation('continuous-period', 'not_met', reasons, input, value);
  }

  const expectedStart = input.expectedStartDate ? parseUtcDate(input.expectedStartDate) : null;
  const expectedEnd = input.expectedEndDate ? parseUtcDate(input.expectedEndDate) : null;
  if ((input.expectedStartDate && !expectedStart) || (input.expectedEndDate && !expectedEnd)) {
    reasons.push(`Expected ${periodName} boundary is invalid.`);
    return evaluation('continuous-period', 'not_met', reasons, input, value);
  }
  if (expectedStart && dateString(start) !== dateString(expectedStart)) {
    reasons.push(`${periodName} starts on ${dateString(start)}, not the expected ${dateString(expectedStart)}.`);
    return evaluation('continuous-period', 'not_met', reasons, input, value);
  }
  if (expectedEnd && dateString(end) !== dateString(expectedEnd)) {
    reasons.push(`${periodName} ends on ${dateString(end)}, not the expected ${dateString(expectedEnd)}.`);
    return evaluation('continuous-period', 'not_met', reasons, input, value);
  }

  const durationDays = inclusiveDays(start, end);
  value.durationDays = durationDays;
  if (durationDays < requiredDays) {
    reasons.push(`${periodName} covers ${durationDays} continuous days; ${requiredDays} are required.`);
    return evaluation('continuous-period', 'not_met', reasons, input, value);
  }
  reasons.push(`${periodName} covers ${durationDays} continuous days and meets the ${requiredDays}-day minimum.`);
  return evaluation('continuous-period', 'met', reasons, input, value);
}

/**
 * Validate a continuous period whose endpoints must both fall within a
 * performance year.  Missing endpoints remain unknown; an out-of-year
 * endpoint is a deterministic failure once both dates are present.
 */
export function validateContinuousPeriodWithinYear(
  year: number,
  input: ContinuousPeriodInput,
): RuleEvaluation<ContinuousPeriodValue> {
  const result = validateContinuousPeriod(input);
  const start = parseUtcDate(input.startDate);
  const end = parseUtcDate(input.endDate);
  if (!start || !end || result.status === 'unknown') return result;

  const validYear = Number.isInteger(year) ? year : MIPS_2026_PROGRAM_CONSTANTS.performanceYear;
  const yearStart = new Date(Date.UTC(validYear, 0, 1));
  const yearEnd = new Date(Date.UTC(validYear, 11, 31));
  const periodName = input.periodName || 'continuous period';
  if (start < yearStart) {
    return {
      ...result,
      status: 'not_met',
      met: false,
      actionNeeded: true,
      reasons: [`${periodName} starts before the ${validYear} performance year.`],
    };
  }
  if (end > yearEnd) {
    return {
      ...result,
      status: 'not_met',
      met: false,
      actionNeeded: true,
      reasons: [`${periodName} ends after the ${validYear} performance year.`],
    };
  }
  return result;
}

export function validateQualityFullYearPeriod(
  year: number,
  startDate: DateLike | null | undefined,
  endDate: DateLike | null | undefined,
  provenance?: ProvenanceInput,
): RuleEvaluation<ContinuousPeriodValue> {
  const validYear = Number.isInteger(year) ? year : MIPS_2026_PROGRAM_CONSTANTS.performanceYear;
  return validateContinuousPeriod({
    ...provenance,
    startDate,
    endDate,
    expectedStartDate: `${validYear}-01-01`,
    expectedEndDate: `${validYear}-12-31`,
    requiredDays: daysInYear(validYear),
    periodName: `quality ${validYear} full-year period`,
  });
}

export const validatePerformancePeriod = validateContinuousPeriod;
export const validateContinuousDays = validateContinuousPeriod;

export interface TbScreeningInput extends ProvenanceInput {
  screeningDate?: DateLike | null;
  screenDate?: DateLike | null;
  firstBiologicDate?: DateLike | null;
  biologicDate?: DateLike | null;
}

export interface TbScreeningValue {
  screeningDate: string | null;
  firstBiologicDate: string | null;
  daysBeforeBiologic: number | null;
  windowEndDate: string | null;
}

export function evaluateTbScreeningBeforeBiologic(
  input: TbScreeningInput | null | undefined,
): RuleEvaluation<TbScreeningValue> {
  const source = input || {};
  const screening = parseUtcDate(source.screeningDate ?? source.screenDate);
  const biologic = parseUtcDate(source.firstBiologicDate ?? source.biologicDate);
  const value: TbScreeningValue = {
    screeningDate: screening ? dateString(screening) : null,
    firstBiologicDate: biologic ? dateString(biologic) : null,
    daysBeforeBiologic: screening && biologic && biologic >= screening ? elapsedDays(screening, biologic) : null,
    windowEndDate: screening ? dateString(addCalendarMonths(screening, 12)) : null,
  };
  if (!screening || !biologic) {
    return evaluation(
      'tb-screening-before-first-biologic-12-months',
      'unknown',
      ['Both TB screening date and first biologic date are required; missing data is unknown.'],
      source,
      value,
    );
  }
  if (biologic < screening) {
    return evaluation(
      'tb-screening-before-first-biologic-12-months',
      'not_met',
      ['The TB screening occurs after the first biologic date.'],
      source,
      value,
    );
  }
  if (biologic > addCalendarMonths(screening, 12)) {
    return evaluation(
      'tb-screening-before-first-biologic-12-months',
      'not_met',
      ['The TB screening is more than 12 calendar months before the first biologic date.'],
      source,
      value,
    );
  }
  return evaluation(
    'tb-screening-before-first-biologic-12-months',
    'met',
    ['TB screening precedes the first biologic and falls within the 12-month lookback window.'],
    source,
    value,
  );
}

export const evaluateTBScreeningBeforeBiologic = evaluateTbScreeningBeforeBiologic;
export const validateTbScreeningBeforeBiologic = evaluateTbScreeningBeforeBiologic;
export const checkTbScreening = evaluateTbScreeningBeforeBiologic;

export interface PathologyTurnaroundInput extends ProvenanceInput {
  biopsyDate?: DateLike | null;
  specimenReceiptDate?: DateLike | null;
  pathologyReportDate?: DateLike | null;
  reportSentDate?: DateLike | null;
  reportDate?: DateLike | null;
  maxDays?: number;
}

export interface TurnaroundValue {
  sourceDate: string | null;
  resultDate: string | null;
  elapsedDays: number | null;
  maxDays: number;
}

function evaluateTurnaround(
  ruleId: string,
  source: PathologyTurnaroundInput,
  resultField: 'pathologyReportDate' | 'notificationDate',
  limitation?: string,
): RuleEvaluation<TurnaroundValue> {
  const sourceDate = parseUtcDate(source.specimenReceiptDate ?? source.biopsyDate);
  const rawResultDate = resultField === 'notificationDate'
    ? (source as PathologyTurnaroundInput & { notificationDate?: DateLike | null }).notificationDate
    : source.reportSentDate ?? source.pathologyReportDate ?? source.reportDate;
  const resultDate = parseUtcDate(rawResultDate);
  const maxDays = Number.isFinite(source.maxDays) && (source.maxDays as number) >= 0
    ? (source.maxDays as number)
    : resultField === 'notificationDate' ? 8 : 7;
  const value: TurnaroundValue = {
    sourceDate: sourceDate ? dateString(sourceDate) : null,
    resultDate: resultDate ? dateString(resultDate) : null,
    elapsedDays: sourceDate && resultDate && resultDate >= sourceDate ? elapsedDays(sourceDate, resultDate) : null,
    maxDays,
  };
  const label = resultField === 'notificationDate' ? 'patient notification' : 'pathology report';
  const sourceLabel = resultField === 'notificationDate' ? 'final report' : 'specimen receipt';
  const limitations = limitation ? [limitation] : undefined;
  if (!sourceDate || !resultDate) {
    return evaluation(
      ruleId,
      'unknown',
      [`${sourceLabel} date and ${label} date are required; missing data is unknown.`],
      source,
      value,
      limitations,
    );
  }
  if (resultDate < sourceDate) {
    return evaluation(ruleId, 'not_met', [`The ${label} date precedes ${sourceLabel}.`], source, value, limitations);
  }
  const days = elapsedDays(sourceDate, resultDate);
  value.elapsedDays = days;
  if (days <= maxDays) {
    return evaluation(
      ruleId,
      'met',
      [`The ${label} was recorded ${days} day(s) after ${sourceLabel}, within the ${maxDays}-day limit.`],
      source,
      value,
      limitations,
    );
  }
  return evaluation(
    ruleId,
    'not_met',
    [`The ${label} was recorded ${days} day(s) after ${sourceLabel}, exceeding the ${maxDays}-day limit.`],
    source,
    value,
    limitations,
  );
}

export function evaluatePathologyReportTurnaround(
  input: PathologyTurnaroundInput | null | undefined,
): RuleEvaluation<TurnaroundValue> {
  const source = input || {};
  return evaluateTurnaround(
    'pathology-report-to-biopsying-clinician-within-7-days',
    source,
    'pathologyReportDate',
  );
}

export interface PatientNotificationInput extends PathologyTurnaroundInput {
  finalReportDate?: DateLike | null;
  notificationDate?: DateLike | null;
}

export function evaluateBiopsyPatientNotification(
  input: PatientNotificationInput | null | undefined,
): RuleEvaluation<TurnaroundValue> {
  const source = input || {};
  return evaluateTurnaround(
    'biopsy-patient-notification-within-8-days',
    { ...source, specimenReceiptDate: source.finalReportDate ?? source.specimenReceiptDate ?? source.biopsyDate },
    'notificationDate',
    'AAD/QCDR licensing limitation: verify the current licensed specification before reporting.',
  );
}

export const evaluatePathologyWithin7Days = evaluatePathologyReportTurnaround;
export const evaluateNotificationWithin8Days = evaluateBiopsyPatientNotification;
export const checkPathologyTurnaround = evaluatePathologyReportTurnaround;
export const checkBiopsyPatientNotification = evaluateBiopsyPatientNotification;

export interface ItchScore {
  instrument?: string | null;
  score?: number | null;
  date?: DateLike | null;
}

export interface ItchImprovementInput extends ProvenanceInput {
  baseline?: ItchScore | null;
  followUp?: ItchScore | null;
  baselineInstrument?: string | null;
  followUpInstrument?: string | null;
  baselineScore?: number | null;
  followUpScore?: number | null;
  minimumBaseline?: number;
  minimumImprovement?: number;
}

export interface ItchImprovementValue {
  instrument: string | null;
  baselineScore: number | null;
  followUpScore: number | null;
  improvement: number | null;
  minimumBaseline: number;
  minimumImprovement: number;
}

export function evaluateItchImprovement(
  input: ItchImprovementInput | null | undefined,
): RuleEvaluation<ItchImprovementValue> {
  const source = input || {};
  const baselineInstrument = source.baseline?.instrument ?? source.baselineInstrument ?? null;
  const followUpInstrument = source.followUp?.instrument ?? source.followUpInstrument ?? null;
  const baselineScore = numberOrNull(source.baseline?.score ?? source.baselineScore);
  const followUpScore = numberOrNull(source.followUp?.score ?? source.followUpScore);
  const minimumBaseline = numberOrNull(source.minimumBaseline) ?? 4;
  const minimumImprovement = numberOrNull(source.minimumImprovement) ?? 3;
  const value: ItchImprovementValue = {
    instrument: baselineInstrument || followUpInstrument || null,
    baselineScore,
    followUpScore,
    improvement: baselineScore !== null && followUpScore !== null ? baselineScore - followUpScore : null,
    minimumBaseline,
    minimumImprovement,
  };
  const limitations = ['AAD/QCDR licensing limitation: verify the current licensed specification before reporting.'];
  if (!baselineInstrument || !followUpInstrument || baselineScore === null || followUpScore === null) {
    return evaluation(
      'itch-same-instrument-baseline-follow-up',
      'unknown',
      ['Baseline and follow-up instrument and scores are required; missing data is unknown.'],
      source,
      value,
      limitations,
    );
  }
  if (baselineInstrument !== followUpInstrument) {
    return evaluation(
      'itch-same-instrument-baseline-follow-up',
      'not_met',
      ['Baseline and follow-up use different instruments; improvement is not comparable.'],
      source,
      value,
      limitations,
    );
  }
  if (baselineScore < minimumBaseline) {
    return evaluation(
      'itch-same-instrument-baseline-follow-up',
      'not_met',
      [`The itch baseline score is ${baselineScore}; at least ${minimumBaseline} is required.`],
      source,
      value,
      limitations,
    );
  }
  const improvement = baselineScore - followUpScore;
  value.improvement = improvement;
  if (improvement < minimumImprovement) {
    return evaluation(
      'itch-same-instrument-baseline-follow-up',
      'not_met',
      [`Itch improvement is ${improvement}; at least ${minimumImprovement} is required.`],
      source,
      value,
      limitations,
    );
  }
  return evaluation(
    'itch-same-instrument-baseline-follow-up',
    'met',
    [`The same instrument has a baseline of ${baselineScore} and improvement of ${improvement}.`],
    source,
    value,
    limitations,
  );
}

export const evaluateSameInstrumentItch = evaluateItchImprovement;
export const evaluateItchMeasure = evaluateItchImprovement;

export interface ReadinessEvidence {
  id?: string | null;
  category: MipsCategory;
  measureId?: string | null;
  evidenceType: string;
  sourceType: string;
  sourceId: string;
  observedAt?: string | null;
  recordedAt?: string | null;
  status: EvidenceStatus | string;
  metadata?: Record<string, unknown> | null;
  origin?: 'manual' | 'automation' | string;
  automationRuleId?: string | null;
  sourceRevision?: number | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
}

/** Evidence lifecycle states.  `verified` is the only generic state that can satisfy an item. */
export type EvidenceStatus =
  | 'candidate'
  | 'needs_review'
  | 'verified'
  | 'rejected'
  | 'pending'
  | 'missing'
  | 'not_applicable';

export interface MipsCategoryConfiguration {
  qualityStartDate?: DateLike | null;
  qualityEndDate?: DateLike | null;
  cehrtStatus?: 'confirmed' | 'not_confirmed' | 'unknown' | string | null;
  chplId?: string | null;
  piStartDate?: DateLike | null;
  piEndDate?: DateLike | null;
  iaStartDate?: DateLike | null;
  iaEndDate?: DateLike | null;
  participationOption?: string | null;
  /** CMS-calculated cost is never scored from local evidence. */
  costStatus?: 'cms_calculated_unknown' | 'cms_calculated_verified' | string | null;
}

export interface ReadinessProfileLike {
  selectedQualityMeasureIds?: readonly string[] | null;
  selectedCostMeasureIds?: readonly string[] | null;
  selectedImprovementActivityIds?: readonly string[] | null;
  categoryConfiguration?: MipsCategoryConfiguration | Record<string, unknown> | null;
  eligibilityInputs?: MipsEligibilityInput | null;
}

export interface WorkQueueItem {
  id: string;
  category: MipsCategory;
  ruleId: string;
  measureId?: string;
  title: string;
  status: EvaluationStatus;
  priority: 'high' | 'medium';
  action: string;
  reasons: readonly string[];
  provenance: readonly Provenance[];
}

export interface CategoryReadiness {
  category: MipsCategory;
  status: 'ready' | 'not_ready' | 'action_needed' | 'unknown' | 'cms_calculated';
  metCount: number;
  notMetCount: number;
  unknownCount: number;
  evaluations: readonly RuleEvaluation[];
}

export interface ReadinessOverview {
  status: 'ready' | 'not_ready' | 'action_needed' | 'unknown';
  exportState: 'not_ready' | 'ready_for_registry_validation';
  submissionState: 'not_submitted';
  categories: Readonly<Record<MipsCategory, CategoryReadiness>>;
  evaluations: readonly RuleEvaluation[];
  workQueue: readonly WorkQueueItem[];
}

const CATEGORY_ORDER: readonly MipsCategory[] = ['quality', 'cost', 'pi', 'ia'];

function catalogEntryFor(category: MipsCategory, measureId: string): MipsCatalogEntry | undefined {
  const all = [
    ...MIPS_2026_QUALITY_MEASURES,
    ...MIPS_2026_POPULATION_QUALITY_MEASURES,
    ...MIPS_2026_COST_MEASURES,
    ...MIPS_2026_IMPROVEMENT_ACTIVITIES,
  ];
  return all.find((entry) => entry.category === category && entry.id === measureId);
}

function metadataAsRecord(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function gateEvidenceResult(evidence: ReadinessEvidence, computed: RuleEvaluation): RuleEvaluation {
  const status = String(evidence.status || '').trim().toLowerCase();
  const provenance: ProvenanceInput = {
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    observedAt: evidence.observedAt,
    recordedAt: evidence.recordedAt,
  };
  const workflowReason = 'This is workflow readiness only, not official MIPS measure scoring.';
  const limitations = [...(computed.limitations || []), workflowReason];

  if (status === 'verified') {
    return {
      ...computed,
      reasons: [...computed.reasons, 'Evidence is explicitly human-verified.', workflowReason],
      limitations,
    };
  }
  if (status === 'rejected') {
    return evaluation(
      computed.ruleId,
      'not_met',
      [...computed.reasons, 'Evidence was rejected during review.', workflowReason],
      provenance,
      computed.value,
      limitations,
    );
  }
  if (status === 'not_applicable') {
    return evaluation(
      computed.ruleId,
      'not_applicable',
      [...computed.reasons, 'Evidence was explicitly marked not applicable.', workflowReason],
      provenance,
      computed.value,
      limitations,
    );
  }

  // Candidate, needs_review, pending, missing, and unknown/legacy values are
  // never accepted as a generic pass.  A deterministic calculation may be
  // retained as a value/reason, but it remains action-needed until a human
  // verifies the evidence.
  const stateLabel = status || 'missing';
  return evaluation(
    computed.ruleId,
    'unknown',
    [...computed.reasons, `Evidence status is ${stateLabel}; explicit human verification is required.`, workflowReason],
    provenance,
    computed.value,
    limitations,
  );
}

function evidenceEvaluation(evidence: ReadinessEvidence): RuleEvaluation {
  const metadata = metadataAsRecord(evidence.metadata);
  const provenance: ProvenanceInput = {
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    observedAt: evidence.observedAt,
    recordedAt: evidence.recordedAt,
  };
  const evidenceType = evidence.evidenceType.toLowerCase();
  const measureId = String(evidence.measureId || '').trim().toUpperCase();
  let computed: RuleEvaluation | null = null;
  if (!measureId && evidenceType.includes('completeness')) {
    computed = evaluateDataCompleteness({
      ...metadata,
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId,
      observedAt: evidence.observedAt,
      recordedAt: evidence.recordedAt,
    } as DataCompletenessInput);
  } else if (!measureId && (evidenceType.includes('period') || evidenceType.includes('continuous'))) {
    const startDate = metadata.startDate as DateLike | undefined;
    const endDate = metadata.endDate as DateLike | undefined;
    if (evidence.category === 'quality' || evidenceType.includes('quality')) {
      computed = validateQualityFullYearPeriod(
        Number(metadata.year || MIPS_2026_PROGRAM_CONSTANTS.performanceYear),
        startDate,
        endDate,
        provenance,
      );
    } else {
      const requiredDays = evidence.category === 'pi'
      ? MIPS_2026_PROGRAM_CONSTANTS.piMinimumContinuousDays
      : evidence.category === 'ia'
        ? MIPS_2026_PROGRAM_CONSTANTS.iaMinimumContinuousDays
        : numberOrNull(metadata.requiredDays) || 1;
      computed = validateContinuousPeriod({
        ...provenance,
        startDate,
        endDate,
        requiredDays,
        periodName: `${evidence.category.toUpperCase()} continuous period`,
      });
    }
  } else if (measureId === '176' || (measureId === '' && evidenceType.includes('tb') && (evidenceType.includes('biologic') || metadata.firstBiologicDate !== undefined))) {
    computed = evaluateTbScreeningBeforeBiologic({
      ...provenance,
      screeningDate: (metadata.screeningDate || metadata.screenDate) as DateLike | undefined,
      firstBiologicDate: (metadata.firstBiologicDate || metadata.biologicDate || metadata.immuneModifierDate) as DateLike | undefined,
    });
  } else if (measureId === '440' || (measureId === '' && (evidenceType.includes('specimenreceipt') || evidenceType.includes('reportsent') || evidenceType.includes('pathology-turnaround')))) {
    computed = evaluatePathologyReportTurnaround({
      ...provenance,
      specimenReceiptDate: (metadata.specimenReceiptDate || metadata.biopsyDate) as DateLike | undefined,
      reportSentDate: (metadata.reportSentDate || metadata.pathologyReportDate || metadata.reportDate) as DateLike | undefined,
    });
  } else if (measureId === 'AAD6' || (measureId === '' && (evidenceType.includes('finalreport') || evidenceType.includes('patientnotification')))) {
    computed = evaluateBiopsyPatientNotification({
      ...provenance,
      finalReportDate: (metadata.finalReportDate || metadata.pathologyReportDate || metadata.reportDate) as DateLike | undefined,
      biopsyDate: metadata.biopsyDate as DateLike | undefined,
      notificationDate: metadata.notificationDate as DateLike | undefined,
    });
  } else if (measureId === '485' || measureId === '486' || (measureId === '' && evidenceType === 'itch')) {
    computed = evaluateItchImprovement({
      ...provenance,
      baseline: metadata.baseline as ItchScore | undefined,
      followUp: (metadata.followUp || metadata.followup) as ItchScore | undefined,
      baselineInstrument: metadata.baselineInstrument as string | undefined,
      followUpInstrument: (metadata.followUpInstrument ?? metadata.followupInstrument) as string | undefined,
      baselineScore: metadata.baselineScore as number | undefined,
      followUpScore: (metadata.followUpScore ?? metadata.followupScore) as number | undefined,
    });
  }

  if (computed) return gateEvidenceResult(evidence, computed);

  const status = String(evidence.status || '').toLowerCase();
  if (status === 'verified') {
    return evaluation(
      `evidence:${evidence.id || evidence.measureId || evidence.evidenceType}`,
      'met',
      ['Structured evidence is explicitly human-verified.', 'This is workflow readiness only, not official MIPS measure scoring.'],
      provenance,
    );
  }
  if (status === 'rejected') {
    return evaluation(
      `evidence:${evidence.id || evidence.measureId || evidence.evidenceType}`,
      'not_met',
      ['Structured evidence was rejected during review.', 'This is workflow readiness only, not official MIPS measure scoring.'],
      provenance,
    );
  }
  if (status === 'not_applicable') {
    return evaluation(
      `evidence:${evidence.id || evidence.measureId || evidence.evidenceType}`,
      'not_applicable',
      ['Structured evidence is explicitly marked not applicable.'],
      provenance,
    );
  }
  return evaluation(
    `evidence:${evidence.id || evidence.measureId || evidence.evidenceType}`,
    'unknown',
    [`Evidence status is ${status || 'missing'}; explicit human verification is required and the item is not assumed met.`],
    provenance,
  );
}

export const evaluateEvidence = evidenceEvaluation;

function withRuleId<T>(result: RuleEvaluation<T>, ruleId: string): RuleEvaluation<T> {
  return { ...result, ruleId };
}

function configuration(profile: ReadinessProfileLike | null | undefined): MipsCategoryConfiguration {
  const value = profile?.categoryConfiguration;
  return value && typeof value === 'object' ? value as MipsCategoryConfiguration : {};
}

function selectionEvaluation(
  category: 'quality' | 'ia',
  selectedCount: number,
  minimum: number,
): RuleEvaluation<{ selectedCount: number; minimum: number }> {
  const label = category === 'quality' ? 'quality measures' : 'Improvement Activities';
  const value = { selectedCount, minimum };
  if (selectedCount >= minimum) {
    return evaluation(
      `${category}:selection-minimum-${minimum}`,
      'met',
      [`${selectedCount} ${label} selected; at least ${minimum} are required for readiness.`, 'Selection is a configuration check, not official MIPS scoring.'],
      null,
      value,
    );
  }
  return evaluation(
    `${category}:selection-minimum-${minimum}`,
    'action_needed',
    [`${selectedCount} ${label} selected; select at least ${minimum} before registry validation.`, 'Selection is a configuration check, not official MIPS scoring.'],
    null,
    value,
  );
}

function configurationFlagEvaluation(
  ruleId: string,
  label: string,
  value: unknown,
  input: ProvenanceInput | null = null,
): RuleEvaluation<{ value: unknown }> {
  if (value === true || value === 'confirmed') {
    return evaluation(ruleId, 'met', [`${label} is explicitly confirmed.`, 'This is workflow readiness only, not official MIPS measure scoring.'], input, { value });
  }
  if (value === false || value === 'not_confirmed') {
    return evaluation(ruleId, 'not_met', [`${label} is not confirmed.`, 'This is workflow readiness only, not official MIPS measure scoring.'], input, { value });
  }
  return evaluation(ruleId, 'unknown', [`${label} is missing or unknown; it is not assumed confirmed.`, 'This is workflow readiness only, not official MIPS measure scoring.'], input, { value: value ?? null });
}

/**
 * Evaluate profile-level configuration independently from evidence rows.
 * These checks intentionally do not imply an official CMS score.
 */
export function evaluateProfileConfiguration(
  profile: ReadinessProfileLike | null | undefined,
): (RuleEvaluation & { category: MipsCategory })[] {
  const config = configuration(profile);
  const qualityIds = profile?.selectedQualityMeasureIds || [];
  const iaIds = profile?.selectedImprovementActivityIds || [];
  const results: (RuleEvaluation & { category: MipsCategory })[] = [];
  results.push({
    ...selectionEvaluation('quality', qualityIds.length, MIPS_2026_MIN_SELECTED_QUALITY_MEASURES),
    category: 'quality',
  });
  results.push({
    ...withRuleId(
      validateQualityFullYearPeriod(
        MIPS_2026_PROGRAM_CONSTANTS.performanceYear,
        config.qualityStartDate,
        config.qualityEndDate,
        undefined,
      ),
      'quality:full-year-period',
    ),
    category: 'quality',
  });

  results.push({
    ...configurationFlagEvaluation('pi:cehrt-confirmed', 'CEHRT status', config.cehrtStatus),
    category: 'pi',
  });
  results.push({
    ...configurationFlagEvaluation('pi:chpl-id', 'CHPL identifier', typeof config.chplId === 'string' && config.chplId.trim() ? true : null),
    category: 'pi',
  });
  results.push({
    ...withRuleId(
      validateContinuousPeriodWithinYear(MIPS_2026_PROGRAM_CONSTANTS.performanceYear, {
        startDate: config.piStartDate,
        endDate: config.piEndDate,
        requiredDays: MIPS_2026_PROGRAM_CONSTANTS.piMinimumContinuousDays,
        periodName: 'Promoting Interoperability continuous period',
      }),
      'pi:continuous-180-day-period',
    ),
    category: 'pi',
  });

  results.push({
    ...selectionEvaluation('ia', iaIds.length, MIPS_2026_MIN_SELECTED_IA_MEASURES),
    category: 'ia',
  });
  results.push({
    ...withRuleId(
      validateContinuousPeriodWithinYear(MIPS_2026_PROGRAM_CONSTANTS.performanceYear, {
        startDate: config.iaStartDate,
        endDate: config.iaEndDate,
        requiredDays: MIPS_2026_PROGRAM_CONSTANTS.iaMinimumContinuousDays,
        periodName: 'Improvement Activities continuous period',
      }),
      'ia:continuous-90-day-period',
    ),
    category: 'ia',
  });
  return results;
}

export const evaluateMipsProfileConfiguration = evaluateProfileConfiguration;

function selectedMeasures(profile: ReadinessProfileLike | null | undefined, category: MipsCategory): string[] {
  if (category === 'quality') {
    return [...(profile?.selectedQualityMeasureIds || MIPS_2026_DEFAULT_SELECTED_QUALITY_IDS)];
  }
  if (category === 'cost') {
    // COST_MR_1 is displayed in the public catalog, but local evidence does
    // not select or score it. CMS calculates this category from claims.
    return [];
  }
  if (category === 'ia') {
    return [...(profile?.selectedImprovementActivityIds || MIPS_2026_DEFAULT_SELECTED_IA_IDS)];
  }
  return [];
}

function latestEvaluatedEvidence<T extends { evidence: ReadinessEvidence }>(items: readonly T[]): T | undefined {
  return items.reduce<T | undefined>((latest, item) => {
    if (!latest) return item;
    const latestTime = Date.parse(latest.evidence.recordedAt || '');
    const itemTime = Date.parse(item.evidence.recordedAt || '');
    if (Number.isFinite(latestTime) && Number.isFinite(itemTime)) {
      return itemTime >= latestTime ? item : latest;
    }
    // Callers and the database supply evidence in chronological order. If a
    // legacy row lacks a usable timestamp, the later row supersedes it.
    return item;
  }, undefined);
}

function categoryRuleEvaluations(
  category: MipsCategory,
  profile: ReadinessProfileLike | null | undefined,
  evidence: readonly ReadinessEvidence[],
  explicit: readonly RuleEvaluation[],
): RuleEvaluation[] {
  const values: RuleEvaluation[] = [];
  if (category === 'cost') {
    // COST_MR_1 is claims-calculated by CMS. Never mark it met from local
    // ledger evidence or expose a local score as an official result.
    values.push(evaluation(
      'cost:cms-calculated',
      'cms_calculated',
      ['COST_MR_1 is CMS claims-calculated; local evidence cannot score this category.', 'The CMS-calculated result is informationally pending external registry/CMS validation; this is not an official local score.'],
    ));
    return values;
  }
  const categoryEvidence = evidence.filter((item) => item.category === category);
  const categoryExplicit = explicit.filter((item) => {
    const prefix = `${category}:`;
    return item.ruleId.startsWith(prefix) || (category === 'quality' && !item.ruleId.startsWith('cost:') && !item.ruleId.startsWith('ia:') && !item.ruleId.startsWith('pi:'));
  });
  values.push(...categoryExplicit);

  const profileConfiguration = evaluateProfileConfiguration(profile)
    .filter((item) => item.category === category);
  values.push(...profileConfiguration);

  const evaluatedEvidence = categoryEvidence.map((item) => ({ evidence: item, result: evidenceEvaluation(item) }));
  if (category === 'quality') {
    const completenessEvidence = evaluatedEvidence.filter(({ evidence }) => (
      !evidence.measureId && evidence.evidenceType.toLowerCase().includes('completeness')
    ));
    const latestCompleteness = latestEvaluatedEvidence(completenessEvidence);
    if (latestCompleteness) {
      values.push(latestCompleteness.result);
    } else {
      values.push(evaluation(
        'data-completeness-2026',
        'unknown',
        ['No aggregate data_completeness evidence is recorded for quality; missing data is unknown and must be supplied before registry validation.'],
      ));
    }
  }
  if (category === 'pi') {
    const latestPiEvidence = latestEvaluatedEvidence(evaluatedEvidence);
    if (latestPiEvidence) {
      // PI has no locally selected measure list.  Every structured PI row is
      // evaluated when written; the latest aggregate row is authoritative so
      // a corrected, verified attestation can supersede an earlier candidate.
      values.push(latestPiEvidence.result);
    } else {
      values.push(evaluation(
        'pi:verified-attestation-evidence',
        'unknown',
        ['No PI evidence row is recorded; add an aggregate attestation and have it explicitly human-verified.'],
      ));
    }
  }
  for (const measureId of selectedMeasures(profile, category)) {
    const matching = evaluatedEvidence.filter(({ evidence }) => evidence.measureId === measureId);
    const latestMatching = latestEvaluatedEvidence(matching);
    if (latestMatching) {
      values.push(latestMatching.result);
      continue;
    }
    const entry = catalogEntryFor(category, measureId);
    const label = entry?.workflowLabel || `Selected ${category} measure ${measureId}`;
    values.push(evaluation(
      `${category}:measure:${measureId}`,
      'unknown',
      [`No structured evidence is recorded for ${measureId}; it is not assumed met.`],
      null,
      undefined,
      entry?.licensing ? [entry.licensing] : undefined,
    ));
    // Attach the label through a harmless reason so work-queue generation
    // remains pure and does not need to know the catalog's private structure.
    const missingMeasureEvaluation = values[values.length - 1];
    if (missingMeasureEvaluation) {
      values[values.length - 1] = {
        ...missingMeasureEvaluation,
        reasons: [`${label}: no structured evidence is recorded; it is not assumed met.`],
      };
    }
  }

  return values;
}

function categoryReadiness(category: MipsCategory, evaluations: readonly RuleEvaluation[]): CategoryReadiness {
  const active = evaluations.filter((item) => item.status !== 'not_applicable');
  const metCount = active.filter((item) => item.status === 'met').length;
  const notMetCount = active.filter((item) => item.status === 'not_met').length;
  const unknownCount = active.filter((item) => item.status === 'unknown' || item.status === 'action_needed').length;
  let status: CategoryReadiness['status'] = 'unknown';
  if (category === 'cost') {
    // Cost is intentionally represented as a separate CMS-calculated state,
    // not as a local failure or a locally generated official score.
    return { category, status: 'cms_calculated', metCount: 0, notMetCount: 0, unknownCount: 0, evaluations };
  }
  if (notMetCount > 0) status = 'not_ready';
  else if (unknownCount > 0) status = 'action_needed';
  else if (metCount > 0) status = 'ready';
  return { category, status, metCount, notMetCount, unknownCount, evaluations };
}

export function generateWorkQueue(
  evaluations: readonly (RuleEvaluation & { category?: MipsCategory; measureId?: string })[],
): WorkQueueItem[] {
  const queue: WorkQueueItem[] = [];
  for (const [index, item] of evaluations.entries()) {
    if (!item.actionNeeded || item.status === 'met' || item.status === 'not_applicable' || item.status === 'cms_calculated') continue;
    const category = item.category || 'quality';
    const measureId = item.measureId;
    const catalog = measureId ? catalogEntryFor(category, measureId) : undefined;
    queue.push({
      id: `work-${category}-${measureId || item.ruleId}-${index}`,
      category,
      ruleId: item.ruleId,
      ...(measureId ? { measureId } : {}),
      title: catalog?.workflowLabel || item.ruleId,
      status: item.status,
      priority: item.status === 'not_met' ? 'high' : 'medium',
      action: item.status === 'not_met' ? 'Review and remediate the evidence.' : 'Collect or validate the missing structured evidence.',
      reasons: item.reasons,
      provenance: item.provenance,
    });
  }
  return queue.sort((a, b) => {
    const categoryDifference = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDifference) return categoryDifference;
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export interface ReadinessAggregationInput {
  profile?: ReadinessProfileLike | null;
  evidence?: readonly ReadinessEvidence[] | null;
  evaluations?: readonly (RuleEvaluation & { category?: MipsCategory; measureId?: string })[] | null;
}

/** Aggregate deterministic category state and an explanation-first work queue. */
export function aggregateReadiness(input: ReadinessAggregationInput | null | undefined): ReadinessOverview {
  const profile = input?.profile;
  const evidence = input?.evidence || [];
  const explicit = input?.evaluations || [];
  const byCategory = {} as Record<MipsCategory, CategoryReadiness>;
  const all: (RuleEvaluation & { category?: MipsCategory; measureId?: string })[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryEvaluations = categoryRuleEvaluations(category, profile, evidence, explicit);
    const enriched = categoryEvaluations.map((item) => {
      const matchingEvidence = evidence.find((entry) => {
        const candidate = evidenceEvaluation(entry);
        return candidate.ruleId === item.ruleId;
      });
      const measureFromRule = item.ruleId.startsWith(`${category}:measure:`)
        ? item.ruleId.slice(`${category}:measure:`.length)
        : undefined;
      return {
        ...item,
        category,
        ...(matchingEvidence?.measureId
          ? { measureId: matchingEvidence.measureId }
          : measureFromRule ? { measureId: measureFromRule } : {}),
      };
    });
    byCategory[category] = categoryReadiness(category, enriched);
    all.push(...enriched);
  }

  const queue = generateWorkQueue(all);
  const statuses = CATEGORY_ORDER.map((category) => byCategory[category].status);
  let status: ReadinessOverview['status'] = 'unknown';
  if (statuses.some((value) => value === 'not_ready')) status = 'not_ready';
  else if (statuses.some((value) => value === 'action_needed' || value === 'unknown')) status = 'action_needed';
  else if (statuses.every((value) => value === 'ready' || value === 'cms_calculated')) status = 'ready';

  return {
    status,
    exportState: status === 'ready' ? 'ready_for_registry_validation' : 'not_ready',
    submissionState: 'not_submitted',
    categories: byCategory,
    evaluations: all,
    workQueue: queue,
  };
}

export const generateReadinessOverview = aggregateReadiness;
export const buildReadinessOverview = aggregateReadiness;
export const buildReadinessSummary = aggregateReadiness;

export const MIPS_SUBMISSION_NOT_CONFIGURED = Object.freeze({
  code: 'MIPS_SUBMISSION_NOT_CONFIGURED',
  message: 'MIPS submission transport is not configured. Export a draft manifest for registry validation; no CMS/DataDerm submission was made.',
  instructions: 'Configure and validate an approved registry transport before attempting live submission.',
});
