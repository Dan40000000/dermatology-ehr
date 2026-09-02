import { API_BASE_URL } from '../utils/apiBase';

export type MipsCategory = 'quality' | 'cost' | 'pi' | 'ia';
export type EvaluationStatus =
  | 'met'
  | 'not_met'
  | 'unknown'
  | 'action_needed'
  | 'not_applicable'
  | 'cms_calculated';
export type EvidenceStatus =
  | 'candidate'
  | 'needs_review'
  | 'verified'
  | 'rejected'
  | 'pending'
  | 'missing'
  | 'not_applicable';

export interface MipsCatalogEntry {
  id: string;
  measureId?: string;
  category: MipsCategory;
  workflowLabel: string;
  sourceUrl?: string;
  collectionLimitations?: string;
  licensing?: string;
  selectionPolicy?: 'user_selectable' | 'cms_calculated';
  publicIdentifierOnly?: boolean;
}

export interface MipsProgram {
  performanceYear: number;
  paymentYear: number;
  weights?: Record<string, number>;
  threshold?: number;
  negativeAdjustment?: string | number;
  lowVolumeThresholds?: {
    allowedCharges: number;
    beneficiaries: number;
    coveredServices: number;
  };
  [key: string]: unknown;
}

export interface MipsProfile {
  id?: string;
  performanceYear: number;
  selectedQualityMeasureIds: string[];
  selectedCostMeasureIds: string[];
  selectedImprovementActivityIds: string[];
  categoryConfiguration: Record<string, unknown>;
  eligibilityInputs: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface MipsEvidence {
  id: string;
  category: MipsCategory;
  measureId?: string;
  evidenceType: string;
  sourceType: string;
  sourceId: string;
  observedAt?: string;
  recordedAt?: string;
  status: EvidenceStatus | string;
  metadata: Record<string, unknown>;
  origin?: 'manual' | 'automation';
  automationRuleId?: string;
  sourceRevision?: number;
  reviewedAt?: string;
  updatedAt?: string;
}

export interface MipsAutomationConnector {
  id: 'biopsy' | 'chronic_therapy' | 'itch_assessment';
  label: string;
  status: 'connected' | 'unavailable';
  candidateCount: number;
  limitation: string;
}

export interface MipsAutomationStatus {
  year: number;
  candidateCounts: Array<{ source_type: string; status: string; count: number }>;
  lastRun: null | {
    id: string;
    status: 'completed' | 'partial' | 'failed';
    connectors: MipsAutomationConnector[];
    created: number;
    updated: number;
    unchanged: number;
    stale: number;
    startedAt: string;
    completedAt?: string;
  };
  coverage: Array<{ id: string; sourceType: string; label: string; limitation: string }>;
  safety: { automaticCredit: false; externalSubmission: false; message: string };
}

export interface MipsAutomationSyncResult {
  runId: string;
  status: 'completed' | 'partial';
  performanceYear: 2026;
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  connectors: MipsAutomationConnector[];
}

export interface MipsItchAssessmentInput {
  patientId: string;
  encounterId?: string;
  conditionCode: 'atopic_dermatitis' | 'psoriasis';
  instrumentCode: string;
  instrumentVersion: string;
  score: number;
  scaleMin: number;
  scaleMax: number;
  assessmentDate: string;
  phase: 'baseline' | 'follow_up';
  clientEventId: string;
  sourceRevision?: number;
}

export interface MipsEvaluation {
  ruleId: string;
  status: EvaluationStatus | string;
  met?: boolean | null;
  actionNeeded?: boolean;
  reasons?: string[];
  provenance?: Array<Record<string, string>>;
  value?: unknown;
  limitations?: string[];
  category?: MipsCategory;
  measureId?: string;
}

export interface MipsCategoryReadiness {
  category: MipsCategory;
  status: EvaluationStatus | string;
  metCount?: number;
  notMetCount?: number;
  unknownCount?: number;
  evaluations?: MipsEvaluation[];
}

export interface MipsWorkQueueItem {
  id: string;
  category: MipsCategory;
  ruleId: string;
  measureId?: string;
  title: string;
  status: EvaluationStatus | string;
  priority: 'high' | 'medium' | 'low' | string;
  action: string;
  reasons?: string[];
  provenance?: Array<Record<string, string>>;
}

export interface MipsEligibility {
  status: string;
  actionNeeded?: boolean;
  reasons?: string[];
  thresholds?: Record<string, number>;
  dimensions?: Record<string, { value: number | null; exceeded: boolean | null }>;
  exceededDimensionCount?: number | null;
}

export interface MipsOverview {
  year: number;
  catalog: {
    performanceYear: number;
    paymentYear: number;
    program: MipsProgram;
    qualityMeasures: MipsCatalogEntry[];
    populationQualityMeasures: MipsCatalogEntry[];
    costMeasures: MipsCatalogEntry[];
    improvementActivities: MipsCatalogEntry[];
    sources?: Record<string, string>;
    operationalDeadlines?: Record<string, unknown>;
    registryPartner?: Record<string, unknown>;
  };
  program: MipsProgram;
  profile: MipsProfile;
  eligibility: MipsEligibility;
  dataCompleteness?: MipsEvaluation;
  categories: Record<MipsCategory, MipsCategoryReadiness>;
  readiness: {
    status: string;
    exportState: string;
    submissionState: 'not_submitted' | string;
  };
  workQueue: MipsWorkQueueItem[];
  evidenceSummary: {
    count: number;
    byCategory?: Partial<Record<MipsCategory, number>>;
    byStatus?: Record<string, number>;
  };
  exportState: string;
  submissionState: 'not_submitted' | string;
  registryPartner?: Record<string, unknown>;
}

export interface MipsProfileInput {
  year: number;
  performanceYear: number;
  selectedQualityMeasureIds: string[];
  selectedCostMeasureIds: string[];
  selectedImprovementActivityIds: string[];
  categoryConfiguration: Record<string, unknown>;
  eligibilityInputs: Record<string, unknown>;
}

export interface MipsEvidenceInput {
  year: number;
  performanceYear: number;
  category: MipsCategory;
  measureId?: string;
  evidenceType: string;
  sourceType: string;
  observedAt?: string;
  status: EvidenceStatus;
  metadata: Record<string, unknown>;
}

export interface MipsPreview {
  draft: true;
  nonSubmission: true;
  year: number;
  submissionState: string;
  exportState: string;
  transportState: string;
  registryPartner?: Record<string, unknown>;
  manifest: {
    performanceYear: number;
    paymentYear: number;
    selectedQualityMeasureIds: string[];
    selectedCostMeasureIds: string[];
    selectedImprovementActivityIds: string[];
    eligibilityStatus: string;
    categoryStatus: Record<string, string>;
    readinessStatus: string;
    workQueue: MipsWorkQueueItem[];
  };
}

export interface MipsRequestOptions {
  headers: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  options: MipsRequestOptions,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    signal: options.signal,
    headers: {
      ...options.headers,
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `MIPS readiness request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

function yearPath(path: string, year: number): string {
  return `${path}${path.includes('?') ? '&' : '?'}year=${encodeURIComponent(year)}`;
}

export function fetchMipsReadiness(options: MipsRequestOptions, year = 2026): Promise<MipsOverview> {
  return request<MipsOverview>(yearPath('/api/mips/readiness', year), options);
}

export function fetchMipsReadinessProfile(options: MipsRequestOptions, year = 2026): Promise<{ year: number; profile: MipsProfile }> {
  return request<{ year: number; profile: MipsProfile }>(yearPath('/api/mips/readiness/profile', year), options);
}

export function saveMipsReadinessProfile(options: MipsRequestOptions, input: MipsProfileInput): Promise<{ year: number; profile: MipsProfile }> {
  return request<{ year: number; profile: MipsProfile }>(yearPath('/api/mips/readiness/profile', input.year), options, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchMipsEvidence(options: MipsRequestOptions, year = 2026): Promise<{ year: number; evidence: MipsEvidence[] }> {
  return request<{ year: number; evidence: MipsEvidence[] }>(yearPath('/api/mips/readiness/evidence', year), options);
}

export function createMipsEvidence(options: MipsRequestOptions, input: MipsEvidenceInput): Promise<{ year: number; evidence: MipsEvidence }> {
  return request<{ year: number; evidence: MipsEvidence }>(yearPath('/api/mips/readiness/evidence', input.year), options, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function reviewMipsEvidence(
  options: MipsRequestOptions,
  evidenceId: string,
  status: 'verified' | 'rejected' | 'needs_review',
  sourceRevision: number | null,
  year = 2026,
): Promise<{ year: number; evidence: MipsEvidence }> {
  return request<{ year: number; evidence: MipsEvidence }>(
    yearPath(`/api/mips/readiness/evidence/${encodeURIComponent(evidenceId)}/review`, year),
    options,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, sourceRevision }) },
  );
}

export function fetchMipsAutomation(options: MipsRequestOptions, year = 2026): Promise<MipsAutomationStatus> {
  return request<MipsAutomationStatus>(yearPath('/api/mips/readiness/automation', year), options);
}

export function syncMipsAutomation(options: MipsRequestOptions, year = 2026): Promise<MipsAutomationSyncResult> {
  return request<MipsAutomationSyncResult>(yearPath('/api/mips/readiness/automation/sync', year), options, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year }),
  });
}

export function recordMipsItchAssessment(
  options: MipsRequestOptions,
  input: MipsItchAssessmentInput,
): Promise<{ assessment: Record<string, unknown>; candidateCapture: Record<string, unknown> | null }> {
  return request<{ assessment: Record<string, unknown>; candidateCapture: Record<string, unknown> | null }>('/api/mips/readiness/itch-assessments', options, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function previewMipsRegistryManifest(options: MipsRequestOptions, year = 2026): Promise<MipsPreview> {
  return request<MipsPreview>(yearPath('/api/mips/readiness/preview', year), options, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, performanceYear: year }),
  });
}
