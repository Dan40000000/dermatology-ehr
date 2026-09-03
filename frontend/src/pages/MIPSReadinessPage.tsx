import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Info,
  LockKeyhole,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  createMipsEvidence,
  fetchMipsAutomation,
  fetchMipsEvidence,
  fetchMipsReadiness,
  previewMipsRegistryManifest,
  reviewMipsEvidence,
  saveMipsReadinessProfile,
  syncMipsAutomation,
  type EvidenceStatus,
  type MipsCatalogEntry,
  type MipsCategory,
  type MipsEvidence,
  type MipsEvaluation,
  type MipsOverview,
  type MipsAutomationStatus,
  type MipsPreview,
  type MipsWorkQueueItem,
} from '../api/mipsReadiness';
import './MIPSReadinessPage.css';
import { buildMipsSourceDestination, mipsSourceTraceabilityLimitation } from '../utils/mipsSourceTraceability';

const PERFORMANCE_YEAR = 2026;
const QUALITY_MINIMUM = 4;
const IA_MINIMUM = 1;

const EVIDENCE_STATUSES: EvidenceStatus[] = [
  'candidate',
  'needs_review',
  'pending',
  'missing',
];

const EVIDENCE_TYPES = [
  { value: 'data_completeness', label: 'Data completeness counts' },
  { value: 'tb_before_biologic', label: 'TB screen before first biologic' },
  { value: 'pathology_turnaround', label: 'Specimen receipt to pathology report' },
  { value: 'biopsy_notification', label: 'Final report to patient notification' },
  { value: 'itch', label: 'Patient-reported itch improvement' },
  { value: 'continuous_period', label: 'Continuous performance period' },
  { value: 'manual_attestation', label: 'Structured manual attestation' },
];

const SOURCE_TYPES = [
  { value: 'qpp_manual', label: 'QPP manual / practice record' },
  { value: 'cms_feedback', label: 'CMS feedback' },
  { value: 'local_structured_event', label: 'Local structured event' },
  { value: 'registry', label: 'Approved registry record' },
];

type TriState = 'unknown' | 'yes' | 'no';
type SortKey = 'id' | 'workflow' | 'status';
type SortDirection = 'ascending' | 'descending';

interface ProfileFormState {
  participationOption: 'dermatological_care_mvp';
  allowedCharges: string;
  beneficiaries: string;
  coveredServices: string;
  newlyEnrolled: TriState;
  qpStatus: TriState;
  qualityStartDate: string;
  qualityEndDate: string;
  cehrtStatus: 'confirmed' | 'not_confirmed' | 'unknown';
  chplId: string;
  piStartDate: string;
  piEndDate: string;
  iaStartDate: string;
  iaEndDate: string;
  selectedQualityMeasureIds: string[];
  selectedImprovementActivityIds: string[];
}

interface EvidenceFormState {
  category: MipsCategory;
  measureId: string;
  evidenceType: string;
  sourceType: string;
  observedAt: string;
  status: EvidenceStatus;
  completeCount: string;
  eligibleCount: string;
  screeningDate: string;
  firstBiologicDate: string;
  specimenReceiptDate: string;
  reportSentDate: string;
  finalReportDate: string;
  notificationDate: string;
  baselineInstrument: string;
  baselineScore: string;
  followUpInstrument: string;
  followUpScore: string;
  startDate: string;
  endDate: string;
}

type FieldName = keyof ProfileFormState | keyof EvidenceFormState | 'profile' | 'evidence';
type FieldErrors = Partial<Record<FieldName, string>>;
type LoadResult = { ok: true } | { ok: false; message: string };

interface DisplayRow {
  id: string;
  category: MipsCategory;
  workflowLabel: string;
  selected: boolean;
  informational: boolean;
  licensing?: string;
  collectionLimitations?: string;
  evaluation?: MipsEvaluation;
}

const EMPTY_FORM: ProfileFormState = {
  participationOption: 'dermatological_care_mvp',
  allowedCharges: '',
  beneficiaries: '',
  coveredServices: '',
  newlyEnrolled: 'unknown',
  qpStatus: 'unknown',
  qualityStartDate: '',
  qualityEndDate: '',
  cehrtStatus: 'unknown',
  chplId: '',
  piStartDate: '',
  piEndDate: '',
  iaStartDate: '',
  iaEndDate: '',
  selectedQualityMeasureIds: [],
  selectedImprovementActivityIds: [],
};

const EMPTY_EVIDENCE_FORM: EvidenceFormState = {
  category: 'quality',
  measureId: '',
  evidenceType: 'data_completeness',
  sourceType: 'qpp_manual',
  observedAt: '',
  status: 'candidate',
  completeCount: '',
  eligibleCount: '',
  screeningDate: '',
  firstBiologicDate: '',
  specimenReceiptDate: '',
  reportSentDate: '',
  finalReportDate: '',
  notificationDate: '',
  baselineInstrument: '',
  baselineScore: '',
  followUpInstrument: '',
  followUpScore: '',
  startDate: '',
  endDate: '',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateInputValue(value: unknown): string {
  const text = stringValue(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

function numberString(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function triState(value: unknown): TriState {
  if (value === true || value === 'yes') return 'yes';
  if (value === false || value === 'no') return 'no';
  return 'unknown';
}

function toBoolean(value: TriState): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function profileToForm(profile: MipsOverview['profile'] | undefined): ProfileFormState {
  if (!profile) return { ...EMPTY_FORM };
  const config = asRecord(profile.categoryConfiguration);
  const eligibility = asRecord(profile.eligibilityInputs);
  return {
    participationOption: 'dermatological_care_mvp',
    allowedCharges: numberString(eligibility.allowedCharges ?? eligibility.allowedChargesDollars),
    beneficiaries: numberString(eligibility.beneficiaries ?? eligibility.beneficiaryCount),
    coveredServices: numberString(eligibility.coveredServices ?? eligibility.coveredServicesCount),
    newlyEnrolled: triState(eligibility.newlyEnrolled ?? eligibility.newlyEnrolledEligibleProfessional),
    qpStatus: triState(eligibility.qualifiedParticipant ?? eligibility.qpStatus),
    qualityStartDate: dateInputValue(config.qualityStartDate),
    qualityEndDate: dateInputValue(config.qualityEndDate),
    cehrtStatus: config.cehrtStatus === 'confirmed' || config.cehrtStatus === 'not_confirmed' ? config.cehrtStatus : 'unknown',
    chplId: stringValue(config.chplId),
    piStartDate: dateInputValue(config.piStartDate),
    piEndDate: dateInputValue(config.piEndDate),
    iaStartDate: dateInputValue(config.iaStartDate),
    iaEndDate: dateInputValue(config.iaEndDate),
    selectedQualityMeasureIds: Array.isArray(profile.selectedQualityMeasureIds) ? profile.selectedQualityMeasureIds : [],
    selectedImprovementActivityIds: Array.isArray(profile.selectedImprovementActivityIds) ? profile.selectedImprovementActivityIds : [],
  };
}

function parseNonnegativeInteger(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function enforcedMeasureForEvidenceType(evidenceType: string): string | undefined {
  switch (evidenceType) {
    case 'tb_before_biologic': return '176';
    case 'pathology_turnaround': return '440';
    case 'biopsy_notification': return 'AAD6';
    default: return undefined;
  }
}

function itchMeasureId(measureId: string, qualityCatalog: MipsCatalogEntry[]): string {
  if (measureId === '485' || measureId === '486') return measureId;
  return qualityCatalog.find((entry) => entry.id === '485' || entry.id === '486')?.id || '485';
}

function evidenceTypeMetadata(form: EvidenceFormState): Record<string, unknown> {
  switch (form.evidenceType) {
    case 'data_completeness':
      return {
        ...(parseNonnegativeInteger(form.completeCount) !== null ? { completeCount: parseNonnegativeInteger(form.completeCount) } : {}),
        ...(parseNonnegativeInteger(form.eligibleCount) !== null ? { eligibleCount: parseNonnegativeInteger(form.eligibleCount) } : {}),
      };
    case 'tb_before_biologic':
      return { screeningDate: form.screeningDate, firstBiologicDate: form.firstBiologicDate };
    case 'pathology_turnaround':
      return { specimenReceiptDate: form.specimenReceiptDate, reportSentDate: form.reportSentDate };
    case 'biopsy_notification':
      return { finalReportDate: form.finalReportDate, notificationDate: form.notificationDate };
    case 'itch':
      return {
        baselineInstrument: form.baselineInstrument.trim(),
        baselineScore: parseOptionalNumber(form.baselineScore),
        followUpInstrument: form.followUpInstrument.trim(),
        followUpScore: parseOptionalNumber(form.followUpScore),
      };
    case 'continuous_period':
      return { startDate: form.startDate, endDate: form.endDate };
    case 'manual_attestation':
    default:
      return {};
  }
}

function validateEvidenceForm(form: EvidenceFormState): FieldErrors {
  const next: FieldErrors = {};
  const messages: string[] = [];
  const addError = (message: string, field?: keyof EvidenceFormState) => {
    if (!messages.includes(message)) messages.push(message);
    if (field && !next[field]) next[field] = message;
  };

  if (form.category === 'cost') {
    addError('Cost is CMS claims-calculated and cannot be evidenced or scored in this page.');
  }

  const specializedQualityTypes = ['tb_before_biologic', 'pathology_turnaround', 'biopsy_notification', 'itch'];
  if (form.evidenceType === 'data_completeness' && form.category !== 'quality') {
    addError('Data completeness evidence must be recorded under the Quality category.');
  }
  if (specializedQualityTypes.includes(form.evidenceType) && form.category !== 'quality') {
    addError('This deterministic evidence type must be recorded under the Quality category.');
  }
  const enforcedMeasureId = enforcedMeasureForEvidenceType(form.evidenceType);
  if (enforcedMeasureId && form.measureId !== enforcedMeasureId) {
    addError(`This evidence type must use quality measure ${enforcedMeasureId}.`);
  }
  if (form.evidenceType === 'itch' && form.measureId !== '485' && form.measureId !== '486') {
    addError('Itch evidence must use quality measure 485 or 486.');
  }

  if (form.evidenceType === 'data_completeness') {
    const complete = parseNonnegativeInteger(form.completeCount);
    const eligible = parseNonnegativeInteger(form.eligibleCount);
    if (complete === null) addError('Enter a nonnegative whole-number complete count.', 'completeCount');
    if (eligible === null) addError('Enter a nonnegative whole-number eligible count.', 'eligibleCount');
    if (eligible !== null && eligible <= 0) addError('Eligible count must be greater than zero.', 'eligibleCount');
    if (complete !== null && eligible !== null && complete > eligible) addError('Complete count cannot exceed eligible count.', 'completeCount');
  }

  const datePairs: Partial<Record<string, {
    start: keyof EvidenceFormState;
    end: keyof EvidenceFormState;
    label: string;
    enforceOrder: boolean;
  }>> = {
    tb_before_biologic: { start: 'screeningDate', end: 'firstBiologicDate', label: 'screening and first biologic dates', enforceOrder: false },
    pathology_turnaround: { start: 'specimenReceiptDate', end: 'reportSentDate', label: 'specimen receipt and report sent dates', enforceOrder: true },
    biopsy_notification: { start: 'finalReportDate', end: 'notificationDate', label: 'final report and patient notification dates', enforceOrder: true },
    continuous_period: { start: 'startDate', end: 'endDate', label: 'period start and end dates', enforceOrder: true },
  };
  const datePair = datePairs[form.evidenceType];
  if (datePair) {
    const start = form[datePair.start];
    const end = form[datePair.end];
    if (!start) addError(`Enter the first of the ${datePair.label}.`, datePair.start);
    if (!end) addError(`Enter the second of the ${datePair.label}.`, datePair.end);
    if (start && end && datePair.enforceOrder && start > end) {
      addError(`The ${datePair.label} must be in chronological order.`, datePair.end);
    }
  }

  if (form.evidenceType === 'continuous_period' && form.startDate && form.endDate) {
    if (form.startDate < `${PERFORMANCE_YEAR}-01-01`) addError(`The continuous period must stay within the ${PERFORMANCE_YEAR} performance year.`, 'startDate');
    if (form.endDate > `${PERFORMANCE_YEAR}-12-31`) addError(`The continuous period must stay within the ${PERFORMANCE_YEAR} performance year.`, 'endDate');
    const durationDays = inclusiveCalendarDays(form.startDate, form.endDate);
    if (form.category === 'quality') {
      if (form.startDate !== `${PERFORMANCE_YEAR}-01-01`) addError(`Quality evidence must cover the full ${PERFORMANCE_YEAR} performance year.`, 'startDate');
      if (form.endDate !== `${PERFORMANCE_YEAR}-12-31`) addError(`Quality evidence must cover the full ${PERFORMANCE_YEAR} performance year.`, 'endDate');
    }
    if (form.category === 'pi' && durationDays !== null && durationDays < 180) {
      addError('Promoting Interoperability evidence must cover at least 180 continuous days.', 'endDate');
    }
    if (form.category === 'ia' && durationDays !== null && durationDays < 90) {
      addError('Improvement Activities evidence must cover at least 90 continuous days.', 'endDate');
    }
  }

  if (form.evidenceType === 'itch') {
    const baselineInstrument = form.baselineInstrument.trim();
    const followUpInstrument = form.followUpInstrument.trim();
    if (!baselineInstrument) addError('Enter the baseline itch instrument.', 'baselineInstrument');
    if (!followUpInstrument) addError('Enter the follow-up itch instrument.', 'followUpInstrument');
    if (baselineInstrument && followUpInstrument && baselineInstrument !== followUpInstrument) {
      addError('Baseline and follow-up must use the same itch instrument.', 'followUpInstrument');
    }
    const baseline = parseOptionalNumber(form.baselineScore);
    const followUp = parseOptionalNumber(form.followUpScore);
    if (baseline === undefined || baseline < 0) addError('Enter a finite, nonnegative baseline score.', 'baselineScore');
    if (followUp === undefined || followUp < 0) addError('Enter a finite, nonnegative follow-up score.', 'followUpScore');
  }

  if (messages.length) next.evidence = messages.join(' ');
  return next;
}

function inclusiveCalendarDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'met': return 'Ready';
    case 'ready': return 'Ready';
    case 'not_met': return 'Not ready';
    case 'not_ready': return 'Not ready';
    case 'action_needed': return 'Action needed';
    case 'cms_calculated': return 'CMS calculated';
    case 'not_applicable': return 'Not applicable';
    case 'ready_for_registry_validation': return 'Ready for registry validation';
    case 'not_submitted': return 'Not submitted';
    case 'not_configured': return 'Not configured';
    case 'voluntary': return 'Voluntary';
    case 'opt-in-eligible': return 'Opt-in eligible';
    case 'required': return 'Required';
    case 'excluded-newly-enrolled': return 'Excluded: newly enrolled';
    case 'excluded-QP': return 'Excluded: QP';
    case 'verified': return 'Verified';
    case 'candidate': return 'Candidate';
    case 'needs_review': return 'Needs review';
    case 'rejected': return 'Rejected';
    case 'pending': return 'Pending';
    case 'missing': return 'Missing';
    case 'completed': return 'Connected';
    case 'partial': return 'Partially connected';
    case 'failed': return 'Failed';
    default: return 'Unknown';
  }
}

function statusIcon(status: string | undefined): ReactNode {
  if (status === 'met' || status === 'ready' || status === 'verified' || status === 'ready_for_registry_validation') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (status === 'not_met' || status === 'not_ready' || status === 'rejected') return <AlertTriangle size={16} aria-hidden="true" />;
  if (status === 'cms_calculated' || status === 'not_applicable') return <LockKeyhole size={16} aria-hidden="true" />;
  if (status === 'action_needed' || status === 'needs_review') return <Clock3 size={16} aria-hidden="true" />;
  if (status === 'candidate' || status === 'pending' || status === 'missing') return <Info size={16} aria-hidden="true" />;
  return <CircleHelp size={16} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: string | undefined }) {
  return (
    <span className={`mips-status mips-status--${status || 'unknown'}`}>
      {statusIcon(status)}
      <span>{statusLabel(status)}</span>
    </span>
  );
}

function categoryLabel(category: MipsCategory): string {
  return category === 'pi' ? 'Promoting Interoperability' : category === 'ia' ? 'Improvement Activities' : category[0].toUpperCase() + category.slice(1);
}

const WORK_QUEUE_RULE_LABELS: Record<string, string> = {
  'pi:cehrt-confirmed': 'CEHRT status',
  'pi:chpl-id': 'CHPL identifier',
  'pi:verified-attestation-evidence': 'Promoting Interoperability evidence',
};

function workQueueTitle(item: MipsWorkQueueItem): string {
  return WORK_QUEUE_RULE_LABELS[item.ruleId] || item.title;
}

function evidenceTypeLabel(evidenceType: string): string {
  return EVIDENCE_TYPES.find((type) => type.value === evidenceType)?.label || evidenceType.replaceAll('_', ' ');
}

function evidenceReviewLabel(action: string, item: MipsEvidence): string {
  const measureContext = item.measureId
    ? `${categoryLabel(item.category)} measure ${item.measureId}`
    : `${categoryLabel(item.category)} category`;
  return `${action} — ${measureContext} — ${evidenceTypeLabel(item.evidenceType)} — source ${item.sourceId} — record ${item.id}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function evaluationForEntry(category: MipsCategory, id: string, evaluations: MipsEvaluation[] | undefined): MipsEvaluation | undefined {
  return evaluations?.find((evaluation) => evaluation.measureId === id || evaluation.ruleId === `${category}:measure:${id}` || evaluation.ruleId.endsWith(`:${id}`));
}

function errorDescription(name: FieldName): string {
  return `${String(name).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-error`;
}

function fieldControlId(name: string, firstQualityId?: string, firstIaId?: string): string {
  const ids: Record<string, string> = {
    allowedCharges: 'allowedCharges',
    beneficiaries: 'beneficiaries',
    coveredServices: 'coveredServices',
    newlyEnrolled: 'newly-enrolled',
    qpStatus: 'qp-status',
    qualityStartDate: 'quality-start-date',
    qualityEndDate: 'quality-end-date',
    cehrtStatus: 'cehrt-status',
    chplId: 'chpl-id',
    piStartDate: 'pi-start-date',
    piEndDate: 'pi-end-date',
    iaStartDate: 'ia-start-date',
    iaEndDate: 'ia-end-date',
    selectedQualityMeasureIds: firstQualityId ? `quality-${firstQualityId}` : 'quality-selection-group',
    selectedImprovementActivityIds: firstIaId ? `ia-${firstIaId}` : 'ia-selection-group',
  };
  return ids[name] || name;
}

function MipsFact({ children }: { children: ReactNode }) {
  return <p className="mips-fact"><Info size={17} aria-hidden="true" /> <span>{children}</span></p>;
}

export default function MIPSReadinessPage() {
  const { headers, isAuthenticated } = useAuth();
  const location = useLocation();
  const tenantHeader = headers['x-tenant-id'] || '';
  const authorizationHeader = headers.Authorization || '';
  const requestHeaders = useMemo<Record<string, string>>(() => ({
    ...(tenantHeader ? { 'x-tenant-id': tenantHeader } : {}),
    ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
  }), [authorizationHeader, tenantHeader]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const profileSectionRef = useRef<HTMLElement>(null);
  const summarySectionRef = useRef<HTMLElement>(null);
  const evidenceSectionRef = useRef<HTMLElement>(null);
  const evidenceItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  const [overview, setOverview] = useState<MipsOverview | null>(null);
  const [evidence, setEvidence] = useState<MipsEvidence[]>([]);
  const [automation, setAutomation] = useState<MipsAutomationStatus | null>(null);
  const [form, setForm] = useState<ProfileFormState>({ ...EMPTY_FORM });
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>({ ...EMPTY_EVIDENCE_FORM });
  const [preview, setPreview] = useState<MipsPreview | null>(null);
  const [year] = useState(PERFORMANCE_YEAR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [syncingAutomation, setSyncingAutomation] = useState(false);
  const [reviewingEvidenceId, setReviewingEvidenceId] = useState<string | null>(null);
  const reviewInFlightRef = useRef(false);
  const [previewing, setPreviewing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [announcement, setAnnouncement] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');

  useLayoutEffect(() => {
    document.title = 'MIPS Readiness Center - DermEHR';
    headingRef.current?.focus();
  }, [location.pathname]);

  const loadData = useCallback(async ({ focusOnSuccess = false }: { focusOnSuccess?: boolean } = {}): Promise<LoadResult> => {
    if (!isAuthenticated) {
      setLoading(false);
      return { ok: true };
    }
    setLoading(true);
    setLoadError('');
    setAnnouncement('Loading 2026 MIPS readiness data.');
    try {
      const [readiness, evidenceResponse, automationResponse] = await Promise.all([
        fetchMipsReadiness({ headers: requestHeaders }, year),
        fetchMipsEvidence({ headers: requestHeaders }, year),
        fetchMipsAutomation({ headers: requestHeaders }, year),
      ]);
      setOverview(readiness);
      setForm(profileToForm(readiness.profile));
      setEvidence(evidenceResponse.evidence || []);
      setAutomation(automationResponse);
      setPreview(null);
      setPreviewError('');
      setErrors({});
      setAnnouncement(`2026 MIPS readiness data loaded. ${evidenceResponse.evidence?.length || 0} structured evidence items found.`);
      if (focusOnSuccess) {
        window.requestAnimationFrame(() => headingRef.current?.focus());
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load MIPS readiness data.';
      setOverview(null);
      setEvidence([]);
      setAutomation(null);
      setForm({ ...EMPTY_FORM });
      setEvidenceForm({ ...EMPTY_EVIDENCE_FORM });
      setPreview(null);
      setPreviewError('');
      setErrors({});
      setLoadError(message);
      setAnnouncement(`MIPS readiness data could not be loaded: ${message}`);
      return { ok: false, message };
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, requestHeaders, year]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (errors.evidence) {
      document.getElementById('evidence-validation-summary')?.focus();
      return;
    }
    const hasProfileFieldError = Object.entries(errors).some(([field, message]) => field !== 'profile' && Boolean(message));
    if (hasProfileFieldError) document.getElementById('profile-validation-summary')?.focus();
  }, [errors]);

  useLayoutEffect(() => {
    if (errors.profile) document.getElementById('profile-error-summary')?.focus();
  }, [errors.profile]);

  useLayoutEffect(() => {
    if (loadError) document.getElementById('mips-load-error-summary')?.focus();
  }, [loadError]);

  useLayoutEffect(() => {
    if (previewError) document.getElementById('preview-error-summary')?.focus();
  }, [previewError]);

  const catalog = overview?.catalog;
  const qualityCatalog = useMemo(() => catalog?.qualityMeasures || [], [catalog]);
  const iaCatalog = useMemo(() => catalog?.improvementActivities || [], [catalog]);
  const populationCatalog = useMemo(() => catalog?.populationQualityMeasures || [], [catalog]);
  const costCatalog = useMemo(() => catalog?.costMeasures || [], [catalog]);

  const validateProfile = useCallback((): FieldErrors => {
    const next: FieldErrors = {};
    const integerFields: Array<[keyof ProfileFormState, string]> = [
      ['allowedCharges', 'Enter a nonnegative whole number or leave it blank when not available.'],
      ['beneficiaries', 'Enter a nonnegative whole number or leave it blank when not available.'],
      ['coveredServices', 'Enter a nonnegative whole number or leave it blank when not available.'],
    ];
    integerFields.forEach(([field, message]) => {
      const value = form[field];
      if (typeof value === 'string' && value.trim() && parseNonnegativeInteger(value) === null) next[field] = message;
    });
    if (form.selectedQualityMeasureIds.length < QUALITY_MINIMUM) {
      next.selectedQualityMeasureIds = `Select at least ${QUALITY_MINIMUM} quality measures for the MVP foundation.`;
    }
    if (form.selectedImprovementActivityIds.length < IA_MINIMUM) {
      next.selectedImprovementActivityIds = `Select at least ${IA_MINIMUM} Improvement Activity for the MVP foundation.`;
    }
    if (!form.qualityStartDate) next.qualityStartDate = 'Enter the quality performance period start date.';
    if (!form.qualityEndDate) next.qualityEndDate = 'Enter the quality performance period end date.';
    if (form.qualityStartDate && form.qualityEndDate) {
      if (form.qualityStartDate !== `${year}-01-01` || form.qualityEndDate !== `${year}-12-31`) {
        next.qualityStartDate = `Quality must cover the full ${year} calendar year.`;
        next.qualityEndDate = `Quality must cover the full ${year} calendar year.`;
      }
      if (form.qualityStartDate > form.qualityEndDate) {
        next.qualityEndDate = 'The quality end date must be on or after the start date.';
      }
    }
    if (form.cehrtStatus === 'confirmed' && !form.chplId.trim()) {
      next.chplId = 'Enter the CHPL identifier when CEHRT is confirmed.';
    }
    if (!form.piStartDate) next.piStartDate = 'Enter the Promoting Interoperability period start date.';
    if (!form.piEndDate) next.piEndDate = 'Enter the Promoting Interoperability period end date.';
    if (form.piStartDate && form.piEndDate) {
      if (form.piStartDate > form.piEndDate) next.piEndDate = 'The PI end date must be on or after the start date.';
      if (form.piStartDate < `${year}-01-01` || form.piEndDate > `${year}-12-31`) {
        next.piStartDate = `The PI period must stay within the ${year} performance year.`;
        next.piEndDate = `The PI period must stay within the ${year} performance year.`;
      }
      const piDays = inclusiveCalendarDays(form.piStartDate, form.piEndDate);
      if (piDays !== null && piDays < 180) next.piEndDate = 'The PI period must cover at least 180 inclusive days.';
    }
    if (!form.iaStartDate) next.iaStartDate = 'Enter the Improvement Activities period start date.';
    if (!form.iaEndDate) next.iaEndDate = 'Enter the Improvement Activities period end date.';
    if (form.iaStartDate && form.iaEndDate) {
      if (form.iaStartDate > form.iaEndDate) next.iaEndDate = 'The IA end date must be on or after the start date.';
      if (form.iaStartDate < `${year}-01-01` || form.iaEndDate > `${year}-12-31`) {
        next.iaStartDate = `The IA period must stay within the ${year} performance year.`;
        next.iaEndDate = `The IA period must stay within the ${year} performance year.`;
      }
      const iaDays = inclusiveCalendarDays(form.iaStartDate, form.iaEndDate);
      if (iaDays !== null && iaDays < 90) next.iaEndDate = 'The IA period must cover at least 90 inclusive days.';
    }
    return next;
  }, [form, year]);

  const handleProfileChange = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const toggleSelection = (field: 'selectedQualityMeasureIds' | 'selectedImprovementActivityIds', id: string) => {
    const current = form[field];
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    handleProfileChange(field, next);
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateProfile();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setAnnouncement('Profile validation found errors. Review the summary at the top of the form.');
      window.requestAnimationFrame(() => {
        document.getElementById('profile-validation-summary')?.focus();
      });
      return;
    }
    setSaving(true);
    setErrors({});
    setAnnouncement('Saving the 2026 practice profile.');
    try {
      await saveMipsReadinessProfile({ headers: requestHeaders }, {
        year,
        performanceYear: year,
        selectedQualityMeasureIds: form.selectedQualityMeasureIds,
        selectedCostMeasureIds: [],
        selectedImprovementActivityIds: form.selectedImprovementActivityIds,
        categoryConfiguration: {
          participationOption: form.participationOption,
          qualityStartDate: form.qualityStartDate,
          qualityEndDate: form.qualityEndDate,
          cehrtStatus: form.cehrtStatus,
          chplId: form.chplId.trim(),
          piStartDate: form.piStartDate,
          piEndDate: form.piEndDate,
          iaStartDate: form.iaStartDate,
          iaEndDate: form.iaEndDate,
          costStatus: 'cms_calculated_unknown',
        },
        eligibilityInputs: {
          newlyEnrolled: toBoolean(form.newlyEnrolled),
          qualifiedParticipant: toBoolean(form.qpStatus),
          allowedCharges: parseNonnegativeInteger(form.allowedCharges),
          beneficiaries: parseNonnegativeInteger(form.beneficiaries),
          coveredServices: parseNonnegativeInteger(form.coveredServices),
          sourceType: 'qpp_manual',
        },
      });
      const refresh = await loadData();
      setAnnouncement(refresh.ok
        ? 'Practice profile saved. Readiness results refreshed.'
        : `Practice profile saved, but the readiness refresh failed: ${refresh.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the practice profile.';
      setErrors({ profile: message });
      setAnnouncement(`Profile save failed: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const tableRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = [];
    const addRows = (entries: MipsCatalogEntry[], category: MipsCategory, informational = false) => {
      const evaluations = overview?.categories?.[category]?.evaluations;
      entries.forEach((entry) => {
        const selected = category === 'quality'
          ? form.selectedQualityMeasureIds.includes(entry.id)
          : category === 'ia'
            ? form.selectedImprovementActivityIds.includes(entry.id)
            : false;
        rows.push({
          id: entry.id,
          category,
          workflowLabel: entry.workflowLabel,
          selected,
          informational: informational || entry.selectionPolicy === 'cms_calculated',
          licensing: entry.licensing,
          collectionLimitations: entry.collectionLimitations,
          evaluation: entry.selectionPolicy === 'cms_calculated'
            ? { ruleId: `${category}:informational:${entry.id}`, status: 'cms_calculated' }
            : evaluationForEntry(category, entry.id, evaluations),
        });
      });
    };
    addRows(qualityCatalog, 'quality');
    addRows(iaCatalog, 'ia');
    addRows(populationCatalog, 'quality', true);
    addRows(costCatalog, 'cost', true);
    return rows;
  }, [costCatalog, form.selectedImprovementActivityIds, form.selectedQualityMeasureIds, iaCatalog, overview, populationCatalog, qualityCatalog]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'ascending' ? 1 : -1;
    return [...tableRows].sort((a, b) => {
      const aValue = sortKey === 'id' ? a.id : sortKey === 'workflow' ? a.workflowLabel : statusLabel(a.evaluation?.status);
      const bValue = sortKey === 'id' ? b.id : sortKey === 'workflow' ? b.workflowLabel : statusLabel(b.evaluation?.status);
      return aValue.localeCompare(bValue, undefined, { numeric: true }) * direction;
    });
  }, [sortDirection, sortKey, tableRows]);

  const handleSort = (nextKey: SortKey) => {
    const nextDirection = sortKey === nextKey && sortDirection === 'ascending' ? 'descending' : 'ascending';
    setSortKey(nextKey);
    setSortDirection(nextDirection);
    setAnnouncement(`Measure readiness sorted by ${nextKey === 'id' ? 'measure ID' : nextKey === 'workflow' ? 'workflow' : 'status'}, ${nextDirection}.`);
  };

  const focusTarget = (target: HTMLElement | null, message: string) => {
    if (!target) return;

    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    target.focus();
    setAnnouncement(message);
  };

  const handleProfileErrorLink = (event: MouseEvent<HTMLAnchorElement>, field: string) => {
    event.preventDefault();
    const targetId = fieldControlId(field, qualityCatalog[0]?.id, iaCatalog[0]?.id);
    focusTarget(document.getElementById(targetId), `Focused the invalid ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} control.`);
  };

  const handleWorkQueueAction = (item: MipsWorkQueueItem) => {
    if (item.measureId && item.category === 'quality') {
      focusTarget(fieldRefs.current[`quality-${item.measureId}`], `Focused quality measure ${item.measureId}.`);
      return;
    }
    if (item.measureId && item.category === 'ia') {
      focusTarget(fieldRefs.current[`ia-${item.measureId}`], `Focused Improvement Activity ${item.measureId}.`);
      return;
    }
    if (item.ruleId.startsWith('quality:selection-minimum')) {
      focusTarget(fieldRefs.current['quality-first'] || profileSectionRef.current, 'Focused the first quality measure selection.');
      return;
    }
    if (item.ruleId === 'quality:full-year-period') {
      focusTarget(fieldRefs.current['quality-start-date'] || profileSectionRef.current, 'Focused the quality period start date.');
      return;
    }
    if (item.ruleId === 'pi:cehrt-confirmed') {
      focusTarget(fieldRefs.current.cehrtStatus || profileSectionRef.current, 'Focused the CEHRT status control.');
      return;
    }
    if (item.ruleId === 'pi:chpl-id') {
      focusTarget(fieldRefs.current.chplId || profileSectionRef.current, 'Focused the CHPL identifier field.');
      return;
    }
    if (item.ruleId === 'pi:continuous-180-day-period') {
      focusTarget(fieldRefs.current.piStartDate || profileSectionRef.current, 'Focused the PI period start date.');
      return;
    }
    if (item.ruleId.startsWith('ia:selection-minimum')) {
      focusTarget(fieldRefs.current['ia-first'] || profileSectionRef.current, 'Focused the first Improvement Activity selection.');
      return;
    }
    if (item.ruleId === 'ia:continuous-90-day-period') {
      focusTarget(fieldRefs.current.iaStartDate || profileSectionRef.current, 'Focused the IA period start date.');
      return;
    }
    if (item.category === 'quality' || item.category === 'ia' || item.category === 'pi') {
      focusTarget(profileSectionRef.current, `Focused the ${categoryLabel(item.category)} profile control.`);
      return;
    }
    focusTarget(evidenceSectionRef.current, 'Focused Evidence review so the structured record can be reviewed.');
  };

  const evidenceMeasureOptions = evidenceForm.category === 'quality'
    ? qualityCatalog
    : evidenceForm.category === 'ia'
      ? iaCatalog
      : evidenceForm.category === 'cost'
        ? costCatalog
        : [];

  const handleEvidenceChange = <K extends keyof EvidenceFormState>(field: K, value: EvidenceFormState[K]) => {
    setEvidenceForm((current) => ({ ...current, [field]: value }));
    if (errors.evidence || errors[field]) setErrors((current) => ({ ...current, evidence: undefined, [field]: undefined }));
  };

  const handleEvidenceTypeChange = (evidenceType: string) => {
    const enforcedMeasureId = enforcedMeasureForEvidenceType(evidenceType);
    const requiresQuality = evidenceType === 'data_completeness' || Boolean(enforcedMeasureId) || evidenceType === 'itch';
    setEvidenceForm((current) => ({
      ...EMPTY_EVIDENCE_FORM,
      category: requiresQuality ? 'quality' : current.category,
      measureId: evidenceType === 'itch'
        ? itchMeasureId(current.measureId, qualityCatalog)
        : enforcedMeasureId || '',
      evidenceType,
      sourceType: current.sourceType,
      observedAt: current.observedAt,
      status: current.status,
    }));
    if (errors.evidence) setErrors((current) => ({ ...current, evidence: undefined }));
  };

  const handleEvidenceCategoryChange = (category: MipsCategory) => {
    const specialized = ['data_completeness', 'tb_before_biologic', 'pathology_turnaround', 'biopsy_notification', 'itch'];
    const nextType = category === 'quality' || !specialized.includes(evidenceForm.evidenceType)
      ? evidenceForm.evidenceType
      : 'manual_attestation';
    const enforcedMeasureId = enforcedMeasureForEvidenceType(nextType);
    setEvidenceForm((current) => ({
      ...EMPTY_EVIDENCE_FORM,
      category,
      evidenceType: nextType,
      measureId: nextType === 'itch'
        ? itchMeasureId('', qualityCatalog)
        : enforcedMeasureId || '',
      sourceType: current.sourceType,
      observedAt: current.observedAt,
      status: current.status,
    }));
    if (errors.evidence) setErrors((current) => ({ ...current, evidence: undefined }));
  };

  const handleEvidenceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validateEvidenceForm(evidenceForm);
    if (Object.keys(validationErrors).length) {
      const validationError = validationErrors.evidence || 'Review the evidence fields before saving.';
      setErrors(validationErrors);
      setAnnouncement(`Evidence validation found an error: ${validationError}`);
      window.requestAnimationFrame(() => document.getElementById('evidence-validation-summary')?.focus());
      return;
    }
    const metadata = evidenceTypeMetadata(evidenceForm);
    const selectedStatus = evidenceForm.status;
    setCreatingEvidence(true);
    setErrors({});
    setAnnouncement('Adding structured evidence.');
    try {
      await createMipsEvidence({ headers: requestHeaders }, {
        year,
        performanceYear: year,
        category: evidenceForm.category,
        ...(evidenceForm.measureId && evidenceForm.evidenceType !== 'data_completeness' && evidenceForm.evidenceType !== 'continuous_period'
          ? { measureId: evidenceForm.evidenceType === 'itch' ? itchMeasureId(evidenceForm.measureId, qualityCatalog) : evidenceForm.measureId }
          : {}),
        evidenceType: evidenceForm.evidenceType,
        sourceType: evidenceForm.sourceType,
        ...(evidenceForm.observedAt ? { observedAt: evidenceForm.observedAt } : {}),
        status: evidenceForm.status,
        metadata,
      });
      const refresh = await loadData();
      setEvidenceForm({ ...EMPTY_EVIDENCE_FORM });
      setAnnouncement(refresh.ok
        ? `Structured evidence created with ${statusLabel(selectedStatus).toLowerCase()} status. Human verification is still required.`
        : `Structured evidence was created with ${statusLabel(selectedStatus).toLowerCase()} status, but the readiness refresh failed: ${refresh.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create structured evidence.';
      setErrors({ evidence: message });
      setAnnouncement(`Evidence creation failed: ${message}`);
    } finally {
      setCreatingEvidence(false);
    }
  };

  const handleAutomationSync = async () => {
    setSyncingAutomation(true);
    setAnnouncement('Reconciling structured 2026 workflow events into candidate evidence.');
    try {
      const result = await syncMipsAutomation({ headers: requestHeaders }, year);
      const refresh = await loadData();
      setAnnouncement(refresh.ok
        ? `Automation reconciliation ${result.status}. ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, and ${result.stale} stale event${result.stale === 1 ? '' : 's'} ignored.`
        : `Automation reconciliation ${result.status} succeeded, but the readiness refresh failed: ${refresh.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reconcile workflow candidates.';
      setAnnouncement(`Automation reconciliation failed: ${message}`);
      setLoadError(message);
    } finally {
      setSyncingAutomation(false);
    }
  };

  const handleEvidenceReview = async (item: MipsEvidence, status: 'verified' | 'rejected') => {
    if (reviewInFlightRef.current || reviewingEvidenceId !== null) return;
    reviewInFlightRef.current = true;
    setReviewingEvidenceId(item.id);
    setAnnouncement(`${status === 'verified' ? 'Verifying' : 'Rejecting'} candidate evidence for measure ${item.measureId || item.category}.`);
    try {
      await reviewMipsEvidence({ headers: requestHeaders }, item.id, status, item.sourceRevision ?? null, year);
      const refresh = await loadData();
      if (refresh.ok) {
        setAnnouncement(
          `Candidate evidence for measure ${item.measureId || item.category} marked ${status}. This remains workflow readiness, not an official submitted score.`,
        );
        window.requestAnimationFrame(() => evidenceItemRefs.current[item.id]?.focus());
      } else {
        setAnnouncement(`Candidate evidence for measure ${item.measureId || item.category} was marked ${status}, but the readiness refresh failed: ${refresh.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to review candidate evidence.';
      setAnnouncement(`Evidence review failed: ${message}`);
      setLoadError(message);
    } finally {
      reviewInFlightRef.current = false;
      setReviewingEvidenceId(null);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setPreview(null);
    setPreviewError('');
    setAnnouncement('Generating the draft registry preview. Nothing will be submitted or sent.');
    try {
      const response = await previewMipsRegistryManifest({ headers: requestHeaders }, year);
      setPreview(response);
      setAnnouncement('Draft registry preview generated. Nothing was submitted or sent.');
      window.requestAnimationFrame(() => previewHeadingRef.current?.focus());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the draft preview.';
      setPreviewError(message);
      setAnnouncement(`Draft preview failed: ${message}`);
    } finally {
      setPreviewing(false);
    }
  };

  const renderFieldError = (name: FieldName) => <span id={errorDescription(name)} className="mips-field-error">{errors[name] || ''}</span>;
  const inputAria = (name: FieldName) => ({
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errorDescription(name),
  });

  const categories: MipsCategory[] = ['quality', 'cost', 'pi', 'ia'];
  const actionsDisabled = loading || Boolean(loadError) || !overview;
  const workQueue = overview?.workQueue || [];
  const readinessStatus = overview?.readiness?.status || 'unknown';
  const eligibilityStatus = overview?.eligibility?.status || 'unknown';
  const profileConfigured = Boolean(
    overview?.profile?.id
      || overview?.profile?.selectedQualityMeasureIds?.length
      || overview?.profile?.selectedImprovementActivityIds?.length
      || Object.keys(overview?.profile?.categoryConfiguration || {}).length
      || Object.keys(overview?.profile?.eligibilityInputs || {}).length,
  );
  const automaticEvidence = evidence.filter((item) => item.origin === 'automation');
  const manualEvidence = evidence.filter((item) => item.origin !== 'automation');

  return (
    <div className="mips-page" id="mips-readiness-main" tabIndex={-1}>
      <div className="mips-page__inner">
        <header className="mips-hero">
          <div>
            <p className="mips-eyebrow">Quality &amp; regulatory operations</p>
            <h1 ref={headingRef} data-page-heading tabIndex={-1}>MIPS Readiness Center</h1>
            <p className="mips-lede">Build a reviewable, practice-owned readiness record for the 2026 performance year.</p>
          </div>
          <div className="mips-year-chip">Performance year <strong>{year}</strong></div>
        </header>

        <div className="mips-live-region" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        {loadError && (
          <div id="mips-load-error-summary" className="mips-alert mips-alert--error mips-load-error-summary" role="alert" tabIndex={-1}>
            <strong>Unable to load MIPS readiness data.</strong>
            <p>{loadError}</p>
            <button className="mips-secondary-button" type="button" onClick={() => void loadData({ focusOnSuccess: true })} disabled={loading}>Retry loading MIPS data</button>
          </div>
        )}

        <section className="mips-context-card" aria-labelledby="mips-context-heading">
          <div className="mips-context-card__icon"><Info size={22} aria-hidden="true" /></div>
          <div>
            <h2 id="mips-context-heading">What this center covers</h2>
            <p>2026 performance contributes to the 2028 payment year. The standard MIPS weights are Quality 30%, Cost 30%, Promoting Interoperability 25%, and Improvement Activities 15%. The 2026 performance threshold is 75 points, with a possible negative adjustment of up to 9%.</p>
            <p>This page is a workflow-readiness tool, not an official CMS score. Direct CMS, QPP, or DataDerm transport is not configured. Keep evidence according to practice policy and the six-year MIPS documentation expectation.</p>
            <p>DataDerm’s 2026 new-participant enrollment closed August 3, 2026. A practice can choose another approved registry or plan for 2027; this center does not assume a registry partner.</p>
          </div>
        </section>

        <section ref={profileSectionRef} className="mips-section" aria-labelledby="profile-heading" tabIndex={-1}>
          <div className="mips-section__heading">
            <div><p className="mips-eyebrow">Configuration</p><h2 id="profile-heading">Practice profile</h2></div>
            <span className="mips-section__meta">2026 only</span>
          </div>
          {errors.profile && <div id="profile-error-summary" className="mips-alert mips-alert--error" role="alert" tabIndex={-1}><strong>Practice profile save failed.</strong><p>{errors.profile}</p></div>}
          <form className="mips-form" onSubmit={handleProfileSubmit} noValidate>
            <p id="profile-required-help" className="mips-help">Required for readiness: the quality, PI, and IA performance dates plus at least four quality measures and one Improvement Activity.</p>
            {Object.keys(errors).length > 0 && (errors.selectedQualityMeasureIds || errors.selectedImprovementActivityIds || errors.qualityStartDate || errors.qualityEndDate || errors.piStartDate || errors.piEndDate || errors.iaStartDate || errors.iaEndDate || errors.chplId || errors.allowedCharges || errors.beneficiaries || errors.coveredServices) && (
              <div id="profile-validation-summary" className="mips-validation-summary" role="alert" tabIndex={-1}>
                <strong>Review these profile fields:</strong>
                <ul>
                  {Object.entries(errors).filter(([, message]) => message && message !== errors.profile).map(([field, message]) => (
                    <li key={field}><a href={`#${fieldControlId(field, qualityCatalog[0]?.id, iaCatalog[0]?.id)}`} onClick={(event) => handleProfileErrorLink(event, field)}>{message}</a></li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mips-form-grid mips-form-grid--three">
              <div className="mips-field">
                <label htmlFor="performance-year">Performance year</label>
                <select id="performance-year" defaultValue={year} aria-describedby="performance-year-error" aria-invalid="false">
                  <option value={PERFORMANCE_YEAR}>{PERFORMANCE_YEAR}</option>
                </select>
                <span className="mips-help">Only the versioned 2026 rules are available.</span>
                <span id="performance-year-error" className="mips-field-error" />
              </div>
              <div className="mips-field">
                <label htmlFor="participation-option">Participation option</label>
                <select id="participation-option" value={form.participationOption} onChange={(event) => handleProfileChange('participationOption', event.target.value as ProfileFormState['participationOption'])} {...inputAria('participationOption')}>
                  <option value="dermatological_care_mvp">Dermatological Care MVP (supported v1)</option>
                </select>
                <span className="mips-help">MVP v1 applies the four-quality-measure and one-IA configuration checks.</span>
                {renderFieldError('participationOption')}
              </div>
              <div className="mips-field">
                <label htmlFor="cehrt-status">CEHRT status</label>
                <select id="cehrt-status" value={form.cehrtStatus} onChange={(event) => handleProfileChange('cehrtStatus', event.target.value as ProfileFormState['cehrtStatus'])} ref={(element) => { fieldRefs.current.cehrtStatus = element; }} {...inputAria('cehrtStatus')}>
                  <option value="unknown">Unknown</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="not_confirmed">Not confirmed</option>
                </select>
                {renderFieldError('cehrtStatus')}
              </div>
            </div>

            <fieldset className="mips-fieldset">
              <legend>Low-volume threshold inputs</legend>
              <p className="mips-help mips-fieldset-help">Enter aggregate QPP values only. DermEHR does not derive MIPS eligibility from local EMR activity, claims, or patient rows.</p>
              <div className="mips-form-grid mips-form-grid--three">
                {([
                  ['allowedCharges', 'Allowed Part B charges ($)', '2026 threshold: $90,000'],
                  ['beneficiaries', 'Medicare beneficiaries', '2026 threshold: 200'],
                  ['coveredServices', 'Covered services', '2026 threshold: 200'],
                ] as const).map(([field, label, help]) => (
                  <div className="mips-field" key={field}>
                    <label htmlFor={field}>{label}</label>
                    <input id={field} type="number" inputMode="numeric" min={0} step={1} value={form[field]} onChange={(event) => handleProfileChange(field, event.target.value)} {...inputAria(field)} />
                    <span className="mips-help">{help}; strict greater-than comparison.</span>
                    {renderFieldError(field)}
                  </div>
                ))}
              </div>
              <div className="mips-form-grid mips-form-grid--two">
                <div className="mips-field">
                  <label htmlFor="newly-enrolled">Newly enrolled eligible professional</label>
                  <select id="newly-enrolled" value={form.newlyEnrolled} onChange={(event) => handleProfileChange('newlyEnrolled', event.target.value as TriState)} {...inputAria('newlyEnrolled')}>
                    <option value="unknown">Unknown</option><option value="no">No</option><option value="yes">Yes</option>
                  </select>
                  {renderFieldError('newlyEnrolled')}
                </div>
                <div className="mips-field">
                  <label htmlFor="qp-status">Qualifying participant (QP)</label>
                  <select id="qp-status" value={form.qpStatus} onChange={(event) => handleProfileChange('qpStatus', event.target.value as TriState)} {...inputAria('qpStatus')}>
                    <option value="unknown">Unknown</option><option value="no">No</option><option value="yes">Yes</option>
                  </select>
                  {renderFieldError('qpStatus')}
                </div>
              </div>
            </fieldset>

            <fieldset className="mips-fieldset" aria-describedby="profile-required-help">
              <legend>Performance periods and CEHRT</legend>
              <div className="mips-form-grid mips-form-grid--three">
                <div className="mips-field"><label htmlFor="quality-start-date">Quality period start</label><input id="quality-start-date" type="date" required value={form.qualityStartDate} onChange={(event) => handleProfileChange('qualityStartDate', event.target.value)} ref={(element) => { fieldRefs.current['quality-start-date'] = element; }} {...inputAria('qualityStartDate')} />{renderFieldError('qualityStartDate')}</div>
                <div className="mips-field"><label htmlFor="quality-end-date">Quality period end</label><input id="quality-end-date" type="date" required value={form.qualityEndDate} onChange={(event) => handleProfileChange('qualityEndDate', event.target.value)} {...inputAria('qualityEndDate')} />{renderFieldError('qualityEndDate')}</div>
                <div className="mips-field"><label htmlFor="chpl-id">CHPL identifier</label><input id="chpl-id" type="text" required={form.cehrtStatus === 'confirmed'} value={form.chplId} onChange={(event) => handleProfileChange('chplId', event.target.value)} ref={(element) => { fieldRefs.current.chplId = element; }} {...inputAria('chplId')} />{renderFieldError('chplId')}</div>
              </div>
              <div className="mips-form-grid mips-form-grid--four">
                <div className="mips-field"><label htmlFor="pi-start-date">PI period start (180 days)</label><input id="pi-start-date" type="date" required value={form.piStartDate} onChange={(event) => handleProfileChange('piStartDate', event.target.value)} ref={(element) => { fieldRefs.current.piStartDate = element; }} {...inputAria('piStartDate')} />{renderFieldError('piStartDate')}</div>
                <div className="mips-field"><label htmlFor="pi-end-date">PI period end</label><input id="pi-end-date" type="date" required value={form.piEndDate} onChange={(event) => handleProfileChange('piEndDate', event.target.value)} {...inputAria('piEndDate')} />{renderFieldError('piEndDate')}</div>
                <div className="mips-field"><label htmlFor="ia-start-date">IA period start (90 days)</label><input id="ia-start-date" type="date" required value={form.iaStartDate} onChange={(event) => handleProfileChange('iaStartDate', event.target.value)} ref={(element) => { fieldRefs.current.iaStartDate = element; }} {...inputAria('iaStartDate')} />{renderFieldError('iaStartDate')}</div>
                <div className="mips-field"><label htmlFor="ia-end-date">IA period end</label><input id="ia-end-date" type="date" required value={form.iaEndDate} onChange={(event) => handleProfileChange('iaEndDate', event.target.value)} {...inputAria('iaEndDate')} />{renderFieldError('iaEndDate')}</div>
              </div>
              <p className="mips-help">Quality requires the full calendar year. PI requires 180 continuous days and IA requires 90 continuous days for this readiness check.</p>
            </fieldset>

            <fieldset id="quality-selection-group" className="mips-fieldset" tabIndex={-1} aria-describedby="quality-selection-help quality-selection-error" aria-invalid={Boolean(errors.selectedQualityMeasureIds)}>
              <legend>Quality measures (required; select at least {QUALITY_MINIMUM})</legend>
              <p id="quality-selection-help" className="mips-help mips-fieldset-help">These are user-selectable public identifiers. CMS-calculated population measures are shown later and cannot be selected here.</p>
              {errors.selectedQualityMeasureIds && <p className="mips-inline-error">{errors.selectedQualityMeasureIds}</p>}
              <div className="mips-check-grid">
                {qualityCatalog.map((entry) => (
                  <label className="mips-check-card" key={entry.id} htmlFor={`quality-${entry.id}`}>
                    <input id={`quality-${entry.id}`} type="checkbox" checked={form.selectedQualityMeasureIds.includes(entry.id)} onChange={() => toggleSelection('selectedQualityMeasureIds', entry.id)} ref={(element) => { fieldRefs.current[`quality-${entry.id}`] = element; if (entry.id === qualityCatalog[0]?.id) fieldRefs.current['quality-first'] = element; }} aria-invalid={Boolean(errors.selectedQualityMeasureIds)} aria-describedby="quality-selection-error" />
                    <span><strong>{entry.id}</strong><span>{entry.workflowLabel}</span>{entry.licensing && <small>{entry.licensing}</small>}</span>
                  </label>
                ))}
              </div>
              <span id="quality-selection-error" className="mips-field-error">{errors.selectedQualityMeasureIds || ''}</span>
            </fieldset>

            <fieldset id="ia-selection-group" className="mips-fieldset" tabIndex={-1} aria-describedby="ia-selection-help ia-selection-error" aria-invalid={Boolean(errors.selectedImprovementActivityIds)}>
              <legend>Improvement Activities (required; select at least {IA_MINIMUM})</legend>
              <p id="ia-selection-help" className="mips-help mips-fieldset-help">Choose the activities the practice plans to validate. The page stores a readiness configuration, not an attestation.</p>
              {errors.selectedImprovementActivityIds && <p className="mips-inline-error">{errors.selectedImprovementActivityIds}</p>}
              <div className="mips-check-grid">
                {iaCatalog.map((entry) => (
                  <label className="mips-check-card" key={entry.id} htmlFor={`ia-${entry.id}`}>
                    <input id={`ia-${entry.id}`} type="checkbox" checked={form.selectedImprovementActivityIds.includes(entry.id)} onChange={() => toggleSelection('selectedImprovementActivityIds', entry.id)} ref={(element) => { fieldRefs.current[`ia-${entry.id}`] = element; if (entry.id === iaCatalog[0]?.id) fieldRefs.current['ia-first'] = element; }} aria-invalid={Boolean(errors.selectedImprovementActivityIds)} aria-describedby="ia-selection-error" />
                    <span><strong>{entry.id}</strong><span>{entry.workflowLabel}</span></span>
                  </label>
                ))}
              </div>
              <span id="ia-selection-error" className="mips-field-error">{errors.selectedImprovementActivityIds || ''}</span>
            </fieldset>

            <div className="mips-cost-note"><LockKeyhole size={19} aria-hidden="true" /><div><strong>Cost is CMS claims-calculated</strong><p>COST_MR_1 is read-only here. Local EMR evidence cannot create a cost score.</p></div></div>
            <div className="mips-form-actions"><button className="mips-primary-button" type="submit" disabled={saving || actionsDisabled}>{saving ? 'Saving profile…' : 'Save practice profile'}</button></div>
          </form>
        </section>

        <section ref={summarySectionRef} className="mips-section" aria-labelledby="summary-heading" aria-busy={loading} tabIndex={-1}>
          <div className="mips-section__heading"><div><p className="mips-eyebrow">At a glance</p><h2 id="summary-heading">Readiness summary</h2></div><span className="mips-section__meta">Workflow readiness only</span></div>
          <dl className="mips-kpi-grid">
            <div><dt>Overall status</dt><dd><StatusBadge status={readinessStatus} /></dd></div>
            <div><dt>Eligibility status</dt><dd><StatusBadge status={eligibilityStatus} /></dd></div>
            <div><dt>Structured evidence</dt><dd>{overview?.evidenceSummary?.count ?? evidence.length}</dd></div>
            <div><dt>Draft export state</dt><dd><StatusBadge status={overview?.exportState || 'not_ready'} /></dd></div>
          </dl>
          <div className="mips-category-grid">
            {categories.map((category) => {
              const categoryState = overview?.categories?.[category];
              return <article className="mips-category-card" key={category}><h3>{categoryLabel(category)}</h3><StatusBadge status={categoryState?.status || 'unknown'} /><p>{categoryState?.metCount ?? 0} ready · {categoryState?.unknownCount ?? 0} need review</p></article>;
            })}
          </div>
          {!loading && !profileConfigured && <p className="mips-empty-state">No readiness profile exists yet. Complete the practice profile above to begin a reviewable configuration.</p>}
        </section>

        <section className="mips-section" aria-labelledby="automation-heading">
          <div className="mips-section__heading">
            <div><p className="mips-eyebrow">Connected workflows</p><h2 id="automation-heading">Automation coverage</h2></div>
            <span className="mips-section__meta">{automation?.lastRun ? statusLabel(automation.lastRun.status) : 'Not run yet'}</span>
          </div>
          <MipsFact>{automation?.safety.message || 'Automation creates candidate evidence only. It never awards automatic credit or submits data.'}</MipsFact>
          <ul className="mips-coverage-grid">
            {(automation?.coverage || []).map((item) => (
              <li key={item.id}>
                <div className="mips-coverage-grid__top"><strong>{item.id}</strong><span>{item.sourceType.replaceAll('_', ' ')}</span></div>
                <p>{item.label}</p>
                <small>{item.limitation}</small>
              </li>
            ))}
          </ul>
          <div className="mips-automation-footer">
            <p className="mips-help">
              {automation?.lastRun?.completedAt
                ? `Last reconciled ${formatDate(automation.lastRun.completedAt)}: ${automation.lastRun.created} created, ${automation.lastRun.updated} updated, ${automation.lastRun.unchanged} unchanged.`
                : 'Run reconciliation to backfill current 2026 structured records and repair any missed event hook.'}
            </p>
            <button className="mips-secondary-button" type="button" onClick={() => void handleAutomationSync()} disabled={syncingAutomation || actionsDisabled}>
              {syncingAutomation ? 'Reconciling workflows…' : 'Reconcile workflow candidates'}
            </button>
          </div>

          <div className="mips-automatic-evidence">
            <h3>Automatic candidate evidence</h3>
            {automaticEvidence.length ? (
              <ul>
                {automaticEvidence.map((item) => {
                  const destination = buildMipsSourceDestination(item);
                  const traceabilityLimitation = mipsSourceTraceabilityLimitation(item);
                  return (
                    <li key={item.id} ref={(element) => { evidenceItemRefs.current[item.id] = element; }} tabIndex={-1}>
                      <div className="mips-evidence-list__top">
                        <div><strong>{item.measureId || categoryLabel(item.category)}</strong><span className="mips-origin-label">Automatic candidate</span></div>
                        <StatusBadge status={item.status} />
                      </div>
                      <p>{EVIDENCE_TYPES.find((type) => type.value === item.evidenceType)?.label || item.evidenceType}</p>
                      <dl>
                        <div><dt>Source</dt><dd>{item.sourceType.replaceAll('_', ' ')} · {item.sourceId}</dd></div>
                        <div><dt>Observed</dt><dd>{formatDate(item.observedAt)}</dd></div>
                        <div><dt>Recorded</dt><dd>{formatDate(item.recordedAt)}</dd></div>
                        <div><dt>Rule</dt><dd>{item.automationRuleId || 'Versioned automation rule'}</dd></div>
                        <div><dt>Calculated signal</dt><dd>{statusLabel(String(item.metadata?.computedStatus || 'unknown'))}</dd></div>
                      </dl>
                      {item.metadata?.limitationCode && <p className="mips-candidate-limitation">Review requirement: {String(item.metadata.limitationCode).replaceAll('_', ' ').toLowerCase()}.</p>}
                      {traceabilityLimitation && <p className="mips-candidate-limitation">{traceabilityLimitation}</p>}
                      <div className="mips-candidate-actions">
                        {destination && <Link className="mips-text-link" to={destination.to} aria-label={destination.ariaLabel}>{destination.label}</Link>}
                        <button type="button" className="mips-secondary-button" aria-label={evidenceReviewLabel('Verify candidate', item)} disabled={actionsDisabled || reviewingEvidenceId !== null || item.status === 'verified'} onClick={() => void handleEvidenceReview(item, 'verified')}>Verify candidate</button>
                        <button type="button" className="mips-secondary-button mips-secondary-button--danger" aria-label={evidenceReviewLabel('Reject candidate', item)} disabled={actionsDisabled || reviewingEvidenceId !== null || item.status === 'rejected'} onClick={() => void handleEvidenceReview(item, 'rejected')}>Reject candidate</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mips-empty-state">No automatic candidates are recorded. Complete a connected clinical workflow or run reconciliation.</p>}
          </div>
        </section>

        <section className="mips-section" aria-labelledby="measure-heading">
          <div className="mips-section__heading"><div><p className="mips-eyebrow">Catalog and evidence</p><h2 id="measure-heading">Measure readiness</h2></div><span className="mips-section__meta">{tableRows.length} catalog rows</span></div>
          <p className="mips-help">Status is a structured workflow signal. It never represents an official CMS score. Licensing and collection limitations are shown with the row.</p>
          <div className="mips-table-scroll" role="region" aria-label="Measure readiness table" tabIndex={0}>
            <table className="mips-table">
              <caption>2026 measure and activity catalog with local workflow readiness</caption>
              <thead><tr>
                {([['id', 'Measure ID'], ['workflow', 'Workflow'], ['status', 'Status']] as const).map(([key, label]) => <th key={key} scope="col" aria-sort={sortKey === key ? sortDirection : 'none'}><button type="button" onClick={() => handleSort(key)} aria-label={`Sort by ${label}`}>{label}</button></th>)}
                <th scope="col">Selection / limits</th>
              </tr></thead>
              <tbody>
                {sortedRows.map((row) => <tr key={`${row.category}-${row.id}`}>
                  <th scope="row"><span className="mips-table-id">{row.id}</span><span className="mips-table-category">{categoryLabel(row.category)}</span></th>
                  <td>{row.workflowLabel}</td>
                  <td><StatusBadge status={row.evaluation?.status || (row.selected ? 'action_needed' : 'unknown')} />{row.evaluation?.reasons?.[0] && <span className="mips-table-reason">{row.evaluation.reasons[0]}</span>}</td>
                  <td>{row.informational ? <span className="mips-read-only"><LockKeyhole size={15} aria-hidden="true" /> Informational / CMS calculated</span> : row.selected ? <span className="mips-selected"><CheckCircle2 size={15} aria-hidden="true" /> Selected</span> : <span>Available to select</span>}{row.licensing && <span className="mips-table-limit">{row.licensing}</span>}{row.collectionLimitations && <span className="mips-table-limit">{row.collectionLimitations}</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mips-section" aria-labelledby="queue-heading">
          <div className="mips-section__heading"><div><p className="mips-eyebrow">Next actions</p><h2 id="queue-heading">Work queue</h2></div><span className="mips-section__meta">{workQueue.length} open item{workQueue.length === 1 ? '' : 's'}</span></div>
          {workQueue.length ? <ul className="mips-work-queue">{workQueue.map((item) => <li key={item.id}><div className="mips-work-queue__body"><div className="mips-work-queue__top"><span className={`mips-priority mips-priority--${item.priority}`}>{item.priority} priority</span><StatusBadge status={item.status} /></div><h3>{workQueueTitle(item)}</h3><p>{item.action}</p>{item.reasons?.[0] && <p className="mips-help">{item.reasons[0]}</p>}</div><button type="button" className="mips-secondary-button" onClick={() => handleWorkQueueAction(item)} aria-label={`Review item: ${workQueueTitle(item)}`}>Review item</button></li>)}</ul> : <div className="mips-empty-state"><CheckCircle2 size={20} aria-hidden="true" /><p>No open work queue items are currently returned. Continue human review before relying on any readiness state.</p></div>}
        </section>

        <section ref={evidenceSectionRef} className="mips-section" aria-labelledby="evidence-heading" tabIndex={-1}>
          <div className="mips-section__heading"><div><p className="mips-eyebrow">Structured ledger</p><h2 id="evidence-heading">Manual evidence</h2></div><span className="mips-section__meta">{manualEvidence.length} record{manualEvidence.length === 1 ? '' : 's'}</span></div>
          <MipsFact>Only structured, de-identified references belong here. Do not enter patient names, MRNs, notes, or free-text clinical narrative. Candidate evidence is never treated as satisfied until a human verifies it.</MipsFact>
          {errors.evidence && <div id="evidence-validation-summary" className="mips-validation-summary" role="alert" tabIndex={-1}>{errors.evidence}</div>}
          <span id="evidence-error" className="mips-field-error">{errors.evidence || ''}</span>
          <form className="mips-evidence-form" onSubmit={handleEvidenceSubmit} noValidate>
            <div className="mips-form-grid mips-form-grid--three">
              <div className="mips-field"><label htmlFor="evidence-category">Category</label><select id="evidence-category" value={evidenceForm.category} onChange={(event) => handleEvidenceCategoryChange(event.target.value as MipsCategory)}><option value="quality">Quality</option><option value="pi">Promoting Interoperability</option><option value="ia">Improvement Activities</option><option value="cost">Cost (CMS calculated; unavailable)</option></select></div>
              <div className="mips-field"><label htmlFor="evidence-measure-id">Measure or activity ID <span className="mips-optional">(optional for period evidence)</span></label><select id="evidence-measure-id" value={evidenceForm.measureId} onChange={(event) => handleEvidenceChange('measureId', event.target.value)} disabled={evidenceForm.category === 'pi' || evidenceForm.category === 'cost'}><option value="">No specific ID</option>{evidenceMeasureOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.id} — {entry.workflowLabel}</option>)}</select></div>
              <div className="mips-field"><label htmlFor="evidence-type">Evidence type</label><select id="evidence-type" value={evidenceForm.evidenceType} onChange={(event) => handleEvidenceTypeChange(event.target.value)}>{EVIDENCE_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></div>
            </div>
            <div className="mips-form-grid mips-form-grid--three">
              <div className="mips-field"><label htmlFor="evidence-source-type">Source type</label><select id="evidence-source-type" value={evidenceForm.sourceType} onChange={(event) => handleEvidenceChange('sourceType', event.target.value)}>{SOURCE_TYPES.map((source) => <option value={source.value} key={source.value}>{source.label}</option>)}</select></div>
              <div className="mips-field"><span>Evidence reference</span><span className="mips-help">A non-PHI, opaque reference is generated by the server when this evidence is saved.</span></div>
              <div className="mips-field"><label htmlFor="evidence-observed-at">Observed date and time <span className="mips-optional">(optional)</span></label><input id="evidence-observed-at" type="datetime-local" value={evidenceForm.observedAt} onChange={(event) => handleEvidenceChange('observedAt', event.target.value)} /></div>
            </div>
            <div className="mips-form-grid mips-form-grid--three">
              <div className="mips-field"><label htmlFor="evidence-status">Lifecycle status</label><select id="evidence-status" value={evidenceForm.status} onChange={(event) => handleEvidenceChange('status', event.target.value as EvidenceStatus)}>{EVIDENCE_STATUSES.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select><span className="mips-help">New evidence cannot be verified here. Verification requires the separate review action with reviewer provenance.</span></div>
            </div>

            {(evidenceForm.evidenceType === 'data_completeness') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>Data completeness counts</legend><div className="mips-form-grid mips-form-grid--two"><div className="mips-field"><label htmlFor="complete-count">Complete records</label><input id="complete-count" type="number" min={0} step={1} value={evidenceForm.completeCount} onChange={(event) => handleEvidenceChange('completeCount', event.target.value)} aria-invalid={Boolean(errors.completeCount)} aria-describedby={errorDescription('completeCount')} required />{renderFieldError('completeCount')}</div><div className="mips-field"><label htmlFor="eligible-count">Eligible records</label><input id="eligible-count" type="number" min={0} step={1} value={evidenceForm.eligibleCount} onChange={(event) => handleEvidenceChange('eligibleCount', event.target.value)} aria-invalid={Boolean(errors.eligibleCount)} aria-describedby={errorDescription('eligibleCount')} required />{renderFieldError('eligibleCount')}</div></div></fieldset>}
            {(evidenceForm.evidenceType === 'tb_before_biologic') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>TB screening timing</legend><div className="mips-form-grid mips-form-grid--two"><div className="mips-field"><label htmlFor="screening-date">Screening date</label><input id="screening-date" type="date" value={evidenceForm.screeningDate} onChange={(event) => handleEvidenceChange('screeningDate', event.target.value)} aria-invalid={Boolean(errors.screeningDate)} aria-describedby={errorDescription('screeningDate')} required />{renderFieldError('screeningDate')}</div><div className="mips-field"><label htmlFor="first-biologic-date">First biologic / immune-modifier date</label><input id="first-biologic-date" type="date" value={evidenceForm.firstBiologicDate} onChange={(event) => handleEvidenceChange('firstBiologicDate', event.target.value)} aria-invalid={Boolean(errors.firstBiologicDate)} aria-describedby={errorDescription('firstBiologicDate')} required />{renderFieldError('firstBiologicDate')}</div></div></fieldset>}
            {(evidenceForm.evidenceType === 'pathology_turnaround') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>Pathology turnaround dates</legend><div className="mips-form-grid mips-form-grid--two"><div className="mips-field"><label htmlFor="specimen-receipt-date">Specimen receipt date</label><input id="specimen-receipt-date" type="date" value={evidenceForm.specimenReceiptDate} onChange={(event) => handleEvidenceChange('specimenReceiptDate', event.target.value)} aria-invalid={Boolean(errors.specimenReceiptDate)} aria-describedby={errorDescription('specimenReceiptDate')} required />{renderFieldError('specimenReceiptDate')}</div><div className="mips-field"><label htmlFor="report-sent-date">Report sent date</label><input id="report-sent-date" type="date" value={evidenceForm.reportSentDate} onChange={(event) => handleEvidenceChange('reportSentDate', event.target.value)} aria-invalid={Boolean(errors.reportSentDate)} aria-describedby={errorDescription('reportSentDate')} required />{renderFieldError('reportSentDate')}</div></div></fieldset>}
            {(evidenceForm.evidenceType === 'biopsy_notification') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>Biopsy result notification dates</legend><div className="mips-form-grid mips-form-grid--two"><div className="mips-field"><label htmlFor="final-report-date">Final report date</label><input id="final-report-date" type="date" value={evidenceForm.finalReportDate} onChange={(event) => handleEvidenceChange('finalReportDate', event.target.value)} aria-invalid={Boolean(errors.finalReportDate)} aria-describedby={errorDescription('finalReportDate')} required />{renderFieldError('finalReportDate')}</div><div className="mips-field"><label htmlFor="notification-date">Patient notification date</label><input id="notification-date" type="date" value={evidenceForm.notificationDate} onChange={(event) => handleEvidenceChange('notificationDate', event.target.value)} aria-invalid={Boolean(errors.notificationDate)} aria-describedby={errorDescription('notificationDate')} required />{renderFieldError('notificationDate')}</div></div></fieldset>}
            {(evidenceForm.evidenceType === 'itch') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>Itch instrument and scores</legend><div className="mips-form-grid mips-form-grid--four"><div className="mips-field"><label htmlFor="baseline-instrument">Baseline instrument</label><input id="baseline-instrument" type="text" value={evidenceForm.baselineInstrument} onChange={(event) => handleEvidenceChange('baselineInstrument', event.target.value)} aria-invalid={Boolean(errors.baselineInstrument)} aria-describedby={errorDescription('baselineInstrument')} required />{renderFieldError('baselineInstrument')}</div><div className="mips-field"><label htmlFor="baseline-score">Baseline score</label><input id="baseline-score" type="number" step="any" value={evidenceForm.baselineScore} onChange={(event) => handleEvidenceChange('baselineScore', event.target.value)} aria-invalid={Boolean(errors.baselineScore)} aria-describedby={errorDescription('baselineScore')} required />{renderFieldError('baselineScore')}</div><div className="mips-field"><label htmlFor="follow-up-instrument">Follow-up instrument</label><input id="follow-up-instrument" type="text" value={evidenceForm.followUpInstrument} onChange={(event) => handleEvidenceChange('followUpInstrument', event.target.value)} aria-invalid={Boolean(errors.followUpInstrument)} aria-describedby={errorDescription('followUpInstrument')} required />{renderFieldError('followUpInstrument')}</div><div className="mips-field"><label htmlFor="follow-up-score">Follow-up score</label><input id="follow-up-score" type="number" step="any" value={evidenceForm.followUpScore} onChange={(event) => handleEvidenceChange('followUpScore', event.target.value)} aria-invalid={Boolean(errors.followUpScore)} aria-describedby={errorDescription('followUpScore')} required />{renderFieldError('followUpScore')}</div></div></fieldset>}
            {(evidenceForm.evidenceType === 'continuous_period') && <fieldset className="mips-fieldset mips-fieldset--compact"><legend>Continuous period</legend><div className="mips-form-grid mips-form-grid--two"><div className="mips-field"><label htmlFor="evidence-start-date">Period start</label><input id="evidence-start-date" type="date" value={evidenceForm.startDate} onChange={(event) => handleEvidenceChange('startDate', event.target.value)} aria-invalid={Boolean(errors.startDate)} aria-describedby={errorDescription('startDate')} required />{renderFieldError('startDate')}</div><div className="mips-field"><label htmlFor="evidence-end-date">Period end</label><input id="evidence-end-date" type="date" value={evidenceForm.endDate} onChange={(event) => handleEvidenceChange('endDate', event.target.value)} aria-invalid={Boolean(errors.endDate)} aria-describedby={errorDescription('endDate')} required />{renderFieldError('endDate')}</div></div></fieldset>}
            <div className="mips-form-actions"><button className="mips-primary-button" type="submit" disabled={creatingEvidence || actionsDisabled}>{creatingEvidence ? 'Adding evidence…' : 'Add structured evidence'}</button></div>
          </form>

          <div className="mips-evidence-list">
            {manualEvidence.length ? <ul>{manualEvidence.map((item) => <li key={item.id} ref={(element) => { evidenceItemRefs.current[item.id] = element; }} tabIndex={-1}><div className="mips-evidence-list__top"><strong>{item.measureId || categoryLabel(item.category)}</strong><StatusBadge status={item.status} /></div><p>{evidenceTypeLabel(item.evidenceType)}</p><dl><div><dt>Source</dt><dd>{item.sourceType} · {item.sourceId}</dd></div><div><dt>Observed</dt><dd>{formatDate(item.observedAt)}</dd></div></dl>{Object.keys(item.metadata || {}).length > 0 && <details><summary>Structured values</summary><dl>{Object.entries(item.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}<div className="mips-candidate-actions"><button type="button" className="mips-secondary-button" aria-label={evidenceReviewLabel('Verify manual evidence', item)} disabled={actionsDisabled || reviewingEvidenceId !== null || item.status === 'verified'} onClick={() => void handleEvidenceReview(item, 'verified')}>Verify manual evidence</button><button type="button" className="mips-secondary-button mips-secondary-button--danger" aria-label={evidenceReviewLabel('Reject manual evidence', item)} disabled={actionsDisabled || reviewingEvidenceId !== null || item.status === 'rejected'} onClick={() => void handleEvidenceReview(item, 'rejected')}>Reject manual evidence</button></div></li>)}</ul> : <p className="mips-empty-state">No manual evidence is recorded yet. Automatic candidates appear in the dedicated review section above.</p>}
          </div>
        </section>

        <section className="mips-section mips-preview-section" aria-labelledby="preview-heading">
          <div className="mips-section__heading"><div><p className="mips-eyebrow">Review only</p><h2 id="preview-heading" ref={previewHeadingRef} tabIndex={-1}>Draft registry preview</h2></div><span className="mips-section__meta">No transport configured</span></div>
          {previewError && <div id="preview-error-summary" className="mips-alert mips-alert--error" role="alert" tabIndex={-1}>{previewError}</div>}
          <p>Draft preview only—nothing will be submitted or sent.</p>
          <div className="mips-preview-state"><span><strong>Submission state</strong> not_submitted</span><span><strong>Transport state</strong> not_configured</span></div>
          <button className="mips-secondary-button" type="button" onClick={() => void handlePreview()} disabled={previewing || actionsDisabled}>{previewing ? 'Generating preview…' : 'Preview draft registry export'}</button>
          <div>{preview && <div className="mips-preview-output"><h3>Preview manifest</h3><dl className="mips-manifest-list"><div><dt>Performance year</dt><dd>{preview.manifest.performanceYear}</dd></div><div><dt>Payment year</dt><dd>{preview.manifest.paymentYear}</dd></div><div><dt>Eligibility</dt><dd>{statusLabel(preview.manifest.eligibilityStatus)}</dd></div><div><dt>Readiness</dt><dd>{statusLabel(preview.manifest.readinessStatus)}</dd></div><div><dt>Export state</dt><dd>{statusLabel(preview.exportState)}</dd></div></dl><h4>Selected quality measures</h4><ul>{preview.manifest.selectedQualityMeasureIds.length ? preview.manifest.selectedQualityMeasureIds.map((id) => <li key={id}>{id}</li>) : <li>None selected</li>}</ul><h4>Selected Improvement Activities</h4><ul>{preview.manifest.selectedImprovementActivityIds.length ? preview.manifest.selectedImprovementActivityIds.map((id) => <li key={id}>{id}</li>) : <li>None selected</li>}</ul><h4>Open work queue</h4>{preview.manifest.workQueue.length ? <ul>{preview.manifest.workQueue.map((item) => <li key={item.id}>{item.title} — {statusLabel(item.status)}</li>)}</ul> : <p>No open items returned.</p>}</div>}</div>
        </section>
      </div>
    </div>
  );
}

export { MIPSReadinessPage };
