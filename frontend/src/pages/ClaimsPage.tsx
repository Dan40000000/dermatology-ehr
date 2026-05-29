import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import {
  fetchClaims,
  fetchClaimDetail,
  updateClaimStatus,
  postClaimPayment,
  fetchPatients,
  fetchClaimMetrics,
  releaseClaimFromCodingReview,
  fetchExternalIntegrationStatus,
} from '../api';
import type { ExternalIntegrationStatus } from '../api';
import type { Claim, ClaimWithDetails, ClaimStatus, Patient } from '../types';

type ActiveTab = 'claims' | 'payments';
type ClaimUiStatus = ClaimStatus | 'denied' | 'appealed' | 'partially_paid';
type QueueFilter = 'all' | 'coding_review' | 'ready' | 'pending' | 'denials' | 'payment' | 'appeals' | 'filing_risk' | 'exceptions';

const CLAIM_TABS: ActiveTab[] = ['claims', 'payments'];
const CLAIM_STATUS_FILTERS: Array<ClaimUiStatus | 'all'> = [
  'all',
  'draft',
  'coding_review',
  'ready',
  'submitted',
  'accepted',
  'rejected',
  'denied',
  'paid',
  'appealed',
  'partially_paid',
];
const CLAIM_QUEUE_FILTERS: QueueFilter[] = ['all', 'coding_review', 'ready', 'pending', 'denials', 'payment', 'appeals', 'filing_risk', 'exceptions'];

interface ClaimRecord {
  id: string;
  patientId: string;
  claimNumber: string;
  status: ClaimUiStatus;
  payer: string;
  providerName: string;
  patientName: string;
  totalBilledCents: number;
  paidAmountCents: number;
  balanceCents: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  serviceDate?: string;
  denialReason?: string;
  denialCode?: string;
  appealStatus?: string;
  scrubStatus?: string;
  codingReviewStatus?: string;
  codingReviewedAt?: string;
  codingReviewNotes?: string;
  eligibilityStatus?: string;
  eligibilityVerifiedAt?: string;
  eligibilityPayerName?: string;
  eligibilityHasIssues?: boolean;
  eligibilityIssueNotes?: string;
  eligibilitySource?: string;
  eligibilityCopayCents?: number;
  eligibilityDeductibleRemainingCents?: number;
}

interface AgingBucket {
  label: string;
  count: number;
  amountCents: number;
}

interface MetricsSnapshot {
  totalClaims: number;
  activeCount: number;
  atRiskCount: number;
  totalBilledCents: number;
  totalOutstandingCents: number;
  totalPaidCents: number;
  pendingCount: number;
  denialCount: number;
  paidCount: number;
  paymentQueueCount: number;
  firstPassPaidRate: number;
  denialRate: number;
  avgDaysInAR: number;
  timelyFilingRiskCount: number;
  agingBuckets: AgingBucket[];
}

interface CachedPaymentRow {
  id: string;
  claimId: string;
  claimNumber: string;
  patientName: string;
  payer: string;
  paymentDate: string;
  amountCents: number;
  paymentMethod?: string;
  checkNumber?: string;
  notes?: string;
}

interface ReleaseRuleMessage {
  ruleCode?: string;
  message?: string;
}

interface ReleaseIssue {
  claimId: string;
  claimNumber: string;
  patientName: string;
  message: string;
  scrubStatus?: string;
  errors: ReleaseRuleMessage[];
  warnings: ReleaseRuleMessage[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const todayIso = new Date().toISOString().slice(0, 10);

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * DAY_MS);
  return d.toISOString().slice(0, 10);
}

const DEMO_PATIENTS: Patient[] = [
  {
    id: 'demo-patient-1',
    tenantId: 'tenant-demo',
    firstName: 'Tyler',
    lastName: 'Anderson',
  },
  {
    id: 'demo-patient-2',
    tenantId: 'tenant-demo',
    firstName: 'Ava',
    lastName: 'Martinez',
  },
  {
    id: 'demo-patient-3',
    tenantId: 'tenant-demo',
    firstName: 'Robert',
    lastName: 'Williams',
  },
  {
    id: 'demo-patient-4',
    tenantId: 'tenant-demo',
    firstName: 'Elena',
    lastName: 'Rivera',
  },
  {
    id: 'demo-patient-5',
    tenantId: 'tenant-demo',
    firstName: 'Jordan',
    lastName: 'Kim',
  },
];

const DEMO_CLAIMS_RAW: Array<Record<string, unknown>> = [
  {
    id: 'demo-claim-1',
    patientId: 'demo-patient-1',
    claimNumber: 'CLM-DEMO-1001',
    status: 'submitted',
    payer: 'Aetna',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(9),
    createdAt: daysAgoIso(8),
    updatedAt: daysAgoIso(2),
    totalCents: 28500,
    paidAmountCents: 0,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-2',
    patientId: 'demo-patient-2',
    claimNumber: 'CLM-DEMO-1002',
    status: 'accepted',
    payer: 'Blue Cross Blue Shield',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(19),
    createdAt: daysAgoIso(18),
    updatedAt: daysAgoIso(6),
    totalCents: 41200,
    paidAmountCents: 15000,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-3',
    patientId: 'demo-patient-3',
    claimNumber: 'CLM-DEMO-1003',
    status: 'rejected',
    payer: 'UnitedHealthcare',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(28),
    createdAt: daysAgoIso(27),
    updatedAt: daysAgoIso(4),
    totalCents: 33800,
    paidAmountCents: 0,
    denialReason: 'Modifier missing for procedure code',
    denialCode: 'M76',
    scrubStatus: 'failed',
    appealStatus: 'draft',
  },
  {
    id: 'demo-claim-4',
    patientId: 'demo-patient-4',
    claimNumber: 'CLM-DEMO-1004',
    status: 'ready',
    payer: 'Cigna',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(4),
    createdAt: daysAgoIso(3),
    updatedAt: daysAgoIso(1),
    totalCents: 19100,
    paidAmountCents: 0,
    scrubStatus: 'pending',
  },
  {
    id: 'demo-claim-5',
    patientId: 'demo-patient-5',
    claimNumber: 'CLM-DEMO-1005',
    status: 'coding_review',
    payer: 'Medicare',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(1),
    createdAt: daysAgoIso(1),
    updatedAt: daysAgoIso(0),
    totalCents: 14750,
    paidAmountCents: 0,
    scrubStatus: 'pending',
  },
  {
    id: 'demo-claim-6',
    patientId: 'demo-patient-2',
    claimNumber: 'CLM-DEMO-1006',
    status: 'paid',
    payer: 'Aetna',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(42),
    createdAt: daysAgoIso(42),
    updatedAt: daysAgoIso(12),
    totalCents: 25500,
    paidAmountCents: 25500,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-7',
    patientId: 'demo-patient-3',
    claimNumber: 'CLM-DEMO-1007',
    status: 'denied',
    payer: 'UnitedHealthcare',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(63),
    createdAt: daysAgoIso(63),
    updatedAt: daysAgoIso(10),
    totalCents: 56200,
    paidAmountCents: 0,
    denialReason: 'Medical necessity documentation not attached',
    denialCode: 'CO-50',
    appealStatus: 'submitted',
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-8',
    patientId: 'demo-patient-4',
    claimNumber: 'CLM-DEMO-1008',
    status: 'submitted',
    payer: 'Medicare',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(322),
    createdAt: daysAgoIso(321),
    updatedAt: daysAgoIso(17),
    totalCents: 20900,
    paidAmountCents: 0,
    denialReason: 'Risk: timely filing deadline approaching',
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-9',
    patientId: 'demo-patient-1',
    claimNumber: 'CLM-DEMO-1009',
    status: 'accepted',
    payer: 'Blue Cross Blue Shield',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(76),
    createdAt: daysAgoIso(75),
    updatedAt: daysAgoIso(11),
    totalCents: 68400,
    paidAmountCents: 41200,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-10',
    patientId: 'demo-patient-4',
    claimNumber: 'CLM-DEMO-1010',
    status: 'rejected',
    payer: 'Cigna',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(14),
    createdAt: daysAgoIso(13),
    updatedAt: daysAgoIso(5),
    totalCents: 22700,
    paidAmountCents: 0,
    denialReason: 'Member ID mismatch',
    denialCode: 'CO-16',
    appealStatus: 'draft',
    scrubStatus: 'failed',
  },
  {
    id: 'demo-claim-11',
    patientId: 'demo-patient-5',
    claimNumber: 'CLM-DEMO-1011',
    status: 'paid',
    payer: 'UnitedHealthcare',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(33),
    createdAt: daysAgoIso(32),
    updatedAt: daysAgoIso(7),
    totalCents: 29800,
    paidAmountCents: 29800,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-12',
    patientId: 'demo-patient-2',
    claimNumber: 'CLM-DEMO-1012',
    status: 'submitted',
    payer: 'Medicare',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(18),
    createdAt: daysAgoIso(17),
    updatedAt: daysAgoIso(1),
    totalCents: 17600,
    paidAmountCents: 0,
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-13',
    patientId: 'demo-patient-3',
    claimNumber: 'CLM-DEMO-1013',
    status: 'appealed',
    payer: 'Aetna',
    providerName: 'Dr. Harper Lee',
    serviceDate: daysAgoIso(102),
    createdAt: daysAgoIso(101),
    updatedAt: daysAgoIso(2),
    totalCents: 73500,
    paidAmountCents: 0,
    denialReason: 'Prior authorization not attached',
    denialCode: 'CO-197',
    appealStatus: 'submitted',
    scrubStatus: 'passed',
  },
  {
    id: 'demo-claim-14',
    patientId: 'demo-patient-4',
    claimNumber: 'CLM-DEMO-1014',
    status: 'ready',
    payer: 'Self-Pay',
    providerName: 'Dr. Elias Turner',
    serviceDate: daysAgoIso(2),
    createdAt: daysAgoIso(2),
    updatedAt: daysAgoIso(0),
    totalCents: 12300,
    paidAmountCents: 0,
    scrubStatus: 'pending',
  },
];

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toStatusLabel(status: ClaimUiStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeStatus(raw: unknown): ClaimUiStatus {
  const value = String(raw || '').toLowerCase();
  if (value === 'denied') return 'denied';
  if (value === 'appealed') return 'appealed';
  if (value === 'partially_paid' || value === 'partial') return 'partially_paid';
  if (value === 'draft' || value === 'coding_review' || value === 'ready' || value === 'submitted' || value === 'accepted' || value === 'rejected' || value === 'paid') {
    return value;
  }
  return 'draft';
}

function statusToTypeStatus(status: ClaimUiStatus): ClaimStatus {
  if (status === 'denied') return 'rejected';
  if (status === 'appealed') return 'rejected';
  if (status === 'partially_paid') return 'accepted';
  return status;
}

function getClaimTotalCents(raw: Record<string, unknown>): number {
  const explicitCents = toFiniteNumber(raw.totalCents);
  if (explicitCents > 0) {
    return Math.round(explicitCents);
  }

  const totalCharges = toFiniteNumber(raw.totalCharges);
  if (totalCharges > 0) {
    if (totalCharges > 100000) {
      return Math.round(totalCharges);
    }
    return Math.round(totalCharges * 100);
  }

  return 0;
}

function getDaysSince(dateInput?: string): number {
  if (!dateInput) return 0;
  const ts = parseClaimCalendarDate(dateInput)?.getTime() ?? Number.NaN;
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
}

function parseClaimCalendarDate(value?: string): Date | null {
  if (!value) return null;
  const calendarMatch = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?Z$)/.exec(value);
  if (calendarMatch) {
    const [, year, month, day] = calendarMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatClaimDate(value?: string): string {
  const date = parseClaimCalendarDate(value);
  return date ? date.toLocaleDateString() : '-';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function claimQueue(claim: ClaimRecord): QueueFilter {
  const age = getDaysSince(claim.serviceDate || claim.createdAt);

  if (claim.status === 'draft' || claim.status === 'coding_review') {
    return 'coding_review';
  }
  if (claim.status === 'ready') {
    return 'ready';
  }
  if (claim.status === 'rejected' || claim.status === 'denied' || claim.scrubStatus === 'failed') {
    if ((claim.appealStatus || '').toLowerCase() === 'submitted') {
      return 'appeals';
    }
    return 'denials';
  }
  if (claim.status === 'appealed') {
    return 'appeals';
  }
  if (age > 300 && claim.balanceCents > 0) {
    return 'filing_risk';
  }
  if (claim.status === 'submitted' || claim.status === 'accepted') {
    if (claim.status === 'accepted' && claim.balanceCents > 0) {
      return 'payment';
    }
    return 'pending';
  }
  if (claim.status === 'partially_paid') {
    return 'payment';
  }
  return 'all';
}

function isActiveClaimWork(claim: ClaimRecord): boolean {
  return ['draft', 'coding_review', 'ready', 'submitted', 'accepted', 'partially_paid'].includes(claim.status);
}

function hasDenialFriction(claim: ClaimRecord): boolean {
  return (
    ['rejected', 'denied', 'appealed'].includes(claim.status) ||
    claim.scrubStatus === 'failed'
  );
}

function isAtRiskClaim(claim: ClaimRecord): boolean {
  return hasDenialFriction(claim) || (claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) > 300);
}

function isClaimException(claim: ClaimRecord): boolean {
  return hasDenialFriction(claim);
}

function isPaymentQueueClaim(claim: ClaimRecord): boolean {
  return claim.balanceCents > 0 && ['accepted', 'submitted', 'partially_paid'].includes(claim.status);
}

function getNextAction(claim: ClaimRecord): string {
  switch (claimQueue(claim)) {
    case 'ready':
      return 'Run scrubber and submit';
    case 'coding_review':
      return 'Validate coding and release';
    case 'pending':
      return 'Monitor 277/ERA response';
    case 'denials':
      return 'Correct and resubmit';
    case 'payment':
      return 'Post payer payment';
    case 'appeals':
      return 'Track appeal deadline';
    case 'filing_risk':
      return 'Submit before filing limit';
    case 'exceptions':
      return 'Review claim exception';
    default:
      return claim.status === 'paid' ? 'Closed' : 'Review claim';
  }
}

function getReleaseButtonLabel(claim: ClaimRecord): string {
  const scrubStatus = String(claim.scrubStatus || '').toLowerCase();
  const payer = String(claim.payer || '').trim().toLowerCase();

  if (scrubStatus === 'errors' || scrubStatus === 'failed') {
    return 'Review Issues';
  }
  if (!payer || payer === 'unknown payer') {
    return 'Check Payer';
  }
  if (scrubStatus === 'pending') {
    return 'Check & Release';
  }
  return 'Release';
}

function getReleaseButtonTitle(claim: ClaimRecord): string {
  const scrubStatus = String(claim.scrubStatus || '').toLowerCase();
  const payer = String(claim.payer || '').trim().toLowerCase();

  if (scrubStatus === 'errors' || scrubStatus === 'failed') {
    return 'The scrubber already found issues. Click to see the exact blockers.';
  }
  if (!payer || payer === 'unknown payer') {
    return 'The payer is missing or unknown. Click to verify release blockers.';
  }
  if (scrubStatus === 'pending') {
    return 'Runs the backend readiness check before releasing the claim.';
  }
  return 'Release this claim from coding review into the clearinghouse-ready queue.';
}

function queueLabel(queue: QueueFilter): string {
  switch (queue) {
    case 'ready':
      return 'Ready';
    case 'coding_review':
      return 'Coding Review';
    case 'pending':
      return 'Awaiting Payer';
    case 'denials':
      return 'Denials';
    case 'payment':
      return 'Payment';
    case 'appeals':
      return 'Appeals';
    case 'filing_risk':
      return 'Filing Risk';
    case 'exceptions':
      return 'Exceptions';
    default:
      return 'All';
  }
}

function getStatusColor(status: ClaimUiStatus): string {
  switch (status) {
    case 'draft':
      return 'gray';
    case 'coding_review':
      return 'orange';
    case 'ready':
      return 'blue';
    case 'submitted':
      return 'yellow';
    case 'accepted':
      return 'green';
    case 'rejected':
    case 'denied':
      return 'red';
    case 'paid':
      return 'green';
    case 'appealed':
      return 'purple';
    case 'partially_paid':
      return 'orange';
    default:
      return 'gray';
  }
}

function normalizeEligibilityStatus(status?: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Not checked';
  if (normalized === 'active') return 'Active';
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'error') return 'Error';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'unknown') return 'Unknown';
  return normalized.replace(/_/g, ' ');
}

function getEligibilityColor(claim: ClaimRecord): string {
  const status = String(claim.eligibilityStatus || '').toLowerCase();
  if (claim.eligibilityHasIssues || status === 'inactive' || status === 'error') return 'red';
  if (status === 'active') return 'green';
  if (status === 'pending' || status === 'unknown') return 'yellow';
  return 'gray';
}

function formatDateTime(value?: string): string {
  if (!value) return 'not checked';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not checked';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConnectionStatus(integration?: ExternalIntegrationStatus | null): string {
  if (!integration) return 'Unavailable';
  const provider = integration.provider ? integration.provider.replace(/_/g, ' ') : 'Not configured';
  const status = integration.connectionStatus === 'connected'
    ? 'connected'
    : integration.isActive
      ? integration.connectionStatus
      : 'inactive';
  return `${provider} ${status}`;
}

function normalizeClaimRecord(raw: Record<string, unknown>, patients: Patient[]): ClaimRecord {
  const id = String(raw.id || '');
  const patientId = String(raw.patientId || raw.patient_id || '');
  const claimNumber = String(raw.claimNumber || raw.claim_number || `CLAIM-${id.slice(0, 8)}`);
  const status = normalizeStatus(raw.status);
  const totalBilledCents = getClaimTotalCents(raw);
  let paidAmountCents = Math.max(0, Math.round(toFiniteNumber(raw.paidAmountCents || raw.paid_amount_cents || 0)));
  if (status === 'paid' && paidAmountCents === 0 && totalBilledCents > 0) {
    paidAmountCents = totalBilledCents;
  }
  const balanceCents = Math.max(0, totalBilledCents - paidAmountCents);
  const payer = String(raw.payerName || raw.payer || 'Unknown Payer');
  const providerName = String(raw.providerName || raw.provider_name || 'Unassigned Provider');
  const createdAt = String(raw.createdAt || raw.created_at || todayIso);
  const updatedAt = String(raw.updatedAt || raw.updated_at || createdAt);
  const submittedAt = raw.submittedAt ? String(raw.submittedAt) : undefined;
  const serviceDate = raw.serviceDate ? String(raw.serviceDate) : undefined;
  const denialReason = raw.denialReason ? String(raw.denialReason) : undefined;
  const denialCode = raw.denialCode ? String(raw.denialCode) : undefined;
  const appealStatus = raw.appealStatus ? String(raw.appealStatus) : undefined;
  const scrubStatus = raw.scrubStatus ? String(raw.scrubStatus) : undefined;
  const codingReviewStatus = raw.codingReviewStatus ? String(raw.codingReviewStatus) : undefined;
  const codingReviewedAt = raw.codingReviewedAt ? String(raw.codingReviewedAt) : undefined;
  const codingReviewNotes = raw.codingReviewNotes ? String(raw.codingReviewNotes) : undefined;
  const eligibilityStatus = raw.eligibilityStatus ? String(raw.eligibilityStatus) : undefined;
  const eligibilityVerifiedAt = raw.eligibilityVerifiedAt ? String(raw.eligibilityVerifiedAt) : undefined;
  const eligibilityPayerName = raw.eligibilityPayerName ? String(raw.eligibilityPayerName) : undefined;
  const eligibilityHasIssues = raw.eligibilityHasIssues === true || raw.eligibilityHasIssues === 'true';
  const eligibilityIssueNotes = raw.eligibilityIssueNotes ? String(raw.eligibilityIssueNotes) : undefined;
  const eligibilitySource = raw.eligibilitySource ? String(raw.eligibilitySource) : undefined;
  const eligibilityCopayCents = raw.eligibilityCopayCents == null
    ? undefined
    : Math.round(toFiniteNumber(raw.eligibilityCopayCents));
  const eligibilityDeductibleRemainingCents = raw.eligibilityDeductibleRemainingCents == null
    ? undefined
    : Math.round(toFiniteNumber(raw.eligibilityDeductibleRemainingCents));

  const joinedName = raw.patientLastName && raw.patientFirstName
    ? `${String(raw.patientLastName)}, ${String(raw.patientFirstName)}`
    : '';

  const patient = patients.find((p) => p.id === patientId);
  const patientName = joinedName || (patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown Patient');

  return {
    id,
    patientId,
    claimNumber,
    status,
    payer,
    providerName,
    patientName,
    totalBilledCents,
    paidAmountCents,
    balanceCents,
    createdAt,
    updatedAt,
    submittedAt,
    serviceDate,
    denialReason,
    denialCode,
    appealStatus,
    scrubStatus,
    codingReviewStatus,
    codingReviewedAt,
    codingReviewNotes,
    eligibilityStatus,
    eligibilityVerifiedAt,
    eligibilityPayerName,
    eligibilityHasIssues,
    eligibilityIssueNotes,
    eligibilitySource,
    eligibilityCopayCents,
    eligibilityDeductibleRemainingCents,
  };
}

function computeMetrics(claims: ClaimRecord[]): MetricsSnapshot {
  const totalClaims = claims.length;
  const activeCount = claims.filter(isActiveClaimWork).length;
  const atRiskCount = claims.filter(isAtRiskClaim).length;
  const totalBilledCents = claims.reduce((sum, claim) => sum + claim.totalBilledCents, 0);
  const totalPaidCents = claims.reduce((sum, claim) => sum + claim.paidAmountCents, 0);
  const totalOutstandingCents = claims.reduce((sum, claim) => sum + claim.balanceCents, 0);

  const pendingCount = claims.filter((claim) => claim.status === 'submitted' || claim.status === 'accepted').length;
  const denialCount = claims.filter(hasDenialFriction).length;
  const paidCount = claims.filter((claim) => claim.status === 'paid').length;
  const paymentQueueCount = claims.filter(isPaymentQueueClaim).length;

  const adjudicatedCount = claims.filter((claim) => !['draft', 'coding_review', 'ready'].includes(claim.status)).length;
  const firstPassPaidRate = adjudicatedCount ? (paidCount / adjudicatedCount) * 100 : 0;
  const denialRate = adjudicatedCount ? (denialCount / adjudicatedCount) * 100 : 0;

  const openClaims = claims.filter((claim) => claim.balanceCents > 0 && claim.status !== 'draft' && claim.status !== 'coding_review' && claim.status !== 'ready');
  const avgDaysInAR = openClaims.length
    ? openClaims.reduce((sum, claim) => sum + getDaysSince(claim.serviceDate || claim.createdAt), 0) / openClaims.length
    : 0;

  const timelyFilingRiskCount = claims.filter((claim) => claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) > 300).length;

  const bucket0to30 = claims.filter((claim) => claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) <= 30);
  const bucket31to60 = claims.filter((claim) => {
    const age = getDaysSince(claim.serviceDate || claim.createdAt);
    return claim.balanceCents > 0 && age > 30 && age <= 60;
  });
  const bucket61to90 = claims.filter((claim) => {
    const age = getDaysSince(claim.serviceDate || claim.createdAt);
    return claim.balanceCents > 0 && age > 60 && age <= 90;
  });
  const bucketOver90 = claims.filter((claim) => claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) > 90);

  const agingBuckets: AgingBucket[] = [
    {
      label: '0-30 days',
      count: bucket0to30.length,
      amountCents: bucket0to30.reduce((sum, claim) => sum + claim.balanceCents, 0),
    },
    {
      label: '31-60 days',
      count: bucket31to60.length,
      amountCents: bucket31to60.reduce((sum, claim) => sum + claim.balanceCents, 0),
    },
    {
      label: '61-90 days',
      count: bucket61to90.length,
      amountCents: bucket61to90.reduce((sum, claim) => sum + claim.balanceCents, 0),
    },
    {
      label: '90+ days',
      count: bucketOver90.length,
      amountCents: bucketOver90.reduce((sum, claim) => sum + claim.balanceCents, 0),
    },
  ];

  return {
    totalClaims,
    activeCount,
    atRiskCount,
    totalBilledCents,
    totalOutstandingCents,
    totalPaidCents,
    pendingCount,
    denialCount,
    paidCount,
    paymentQueueCount,
    firstPassPaidRate,
    denialRate,
    avgDaysInAR,
    timelyFilingRiskCount,
    agingBuckets,
  };
}

function buildDemoClaimDetail(claim: ClaimRecord): ClaimWithDetails {
  const nowIso = new Date().toISOString();

  const diagnoses = [
    {
      id: `${claim.id}-dx1`,
      icd10Code: claim.status === 'denied' || claim.status === 'rejected' ? 'L98.9' : 'L30.9',
      description: claim.status === 'denied' || claim.status === 'rejected' ? 'Disorder of skin and subcutaneous tissue' : 'Dermatitis, unspecified',
      isPrimary: true,
    },
    {
      id: `${claim.id}-dx2`,
      icd10Code: 'Z79.899',
      description: 'Other long term drug therapy',
      isPrimary: false,
    },
  ];

  const charges = [
    {
      id: `${claim.id}-chg1`,
      cptCode: '99213',
      description: 'Established patient office visit',
      quantity: 1,
      feeCents: Math.round(claim.totalBilledCents * 0.45),
      linkedDiagnosisIds: [diagnoses[0].id],
    },
    {
      id: `${claim.id}-chg2`,
      cptCode: '11102',
      description: 'Tangential biopsy of skin',
      quantity: 1,
      feeCents: claim.totalBilledCents - Math.round(claim.totalBilledCents * 0.45),
      linkedDiagnosisIds: [diagnoses[0].id],
    },
  ];

  const payments = claim.paidAmountCents > 0
    ? [
        {
          id: `${claim.id}-pay1`,
          tenantId: 'tenant-demo',
          claimId: claim.id,
          amountCents: claim.paidAmountCents,
          paymentDate: todayIso,
          paymentMethod: 'eft',
          payer: claim.payer,
          checkNumber: '',
          notes: 'Demo posted payment',
          createdAt: nowIso,
        },
      ]
    : [];

  const statusHistory = [
    {
      id: `${claim.id}-h1`,
      tenantId: 'tenant-demo',
      claimId: claim.id,
      status: statusToTypeStatus(claim.status),
      notes: claim.denialReason || 'Demo status history',
      changedBy: 'system-demo',
      changedAt: nowIso,
    },
  ];

  const claimDetailClaim: Claim = {
    id: claim.id,
    tenantId: 'tenant-demo',
    encounterId: undefined,
    patientId: claim.patientId,
    claimNumber: claim.claimNumber,
    totalCents: claim.totalBilledCents,
    status: statusToTypeStatus(claim.status),
    payer: claim.payer,
    payerId: undefined,
    submittedAt: claim.submittedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    patientFirstName: claim.patientName.split(',')[1]?.trim() || '',
    patientLastName: claim.patientName.split(',')[0] || '',
    providerName: claim.providerName,
  };

  return {
    claim: {
      ...claimDetailClaim,
      insurancePlanName: claim.payer,
    },
    diagnoses,
    charges,
    payments,
    statusHistory,
  };
}

export function ClaimsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const { claimId: routeClaimId } = useParams<{ claimId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const startDateParam = searchParams.get('startDate') || undefined;
  const endDateParam = searchParams.get('endDate') || startDateParam;

  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('claims');
  const [statusFilter, setStatusFilter] = useState<ClaimUiStatus | 'all'>('all');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<ClaimWithDetails | null>(null);
  const [showClaimDetail, setShowClaimDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [forceDemoData, setForceDemoData] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string>('');
  const [eligibilityIntegration, setEligibilityIntegration] = useState<ExternalIntegrationStatus | null>(null);
  const [clearinghouseIntegration, setClearinghouseIntegration] = useState<ExternalIntegrationStatus | null>(null);
  const [releaseInFlightId, setReleaseInFlightId] = useState<string | null>(null);
  const [releaseIssue, setReleaseIssue] = useState<ReleaseIssue | null>(null);

  const [claimDetailsCache, setClaimDetailsCache] = useState<Record<string, ClaimWithDetails>>({});
  const [metricsSnapshot, setMetricsSnapshot] = useState<MetricsSnapshot | null>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentPayer, setPaymentPayer] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab && CLAIM_TABS.includes(requestedTab as ActiveTab)) {
      setActiveTab(requestedTab as ActiveTab);
    }

    const requestedStatus = searchParams.get('status');
    if (requestedStatus && CLAIM_STATUS_FILTERS.includes(requestedStatus as ClaimUiStatus | 'all')) {
      setStatusFilter(requestedStatus as ClaimUiStatus | 'all');
    }

    const requestedQueue = searchParams.get('queue');
    if (requestedQueue && CLAIM_QUEUE_FILTERS.includes(requestedQueue as QueueFilter)) {
      setQueueFilter(requestedQueue as QueueFilter);
    } else if (requestedStatus === 'denied' || requestedStatus === 'rejected') {
      setQueueFilter('denials');
    } else if (requestedStatus === 'appealed') {
      setQueueFilter('appeals');
    }
  }, [searchParams]);

  const updateUrlFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const applyClaimDrilldown = useCallback(
    (queue: QueueFilter, status: ClaimUiStatus | 'all' = 'all') => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'claims');
      if (queue === 'all') {
        next.delete('queue');
      } else {
        next.set('queue', queue);
      }
      if (status === 'all') {
        next.delete('status');
      } else {
        next.set('status', status);
      }
      setActiveTab('claims');
      setQueueFilter(queue);
      setStatusFilter(status);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    if (forceDemoData) {
      setUsingDemoData(true);
      setClaims(DEMO_CLAIMS_RAW.map((raw) => normalizeClaimRecord(raw, DEMO_PATIENTS)));
      setLastRefreshAt(new Date().toISOString());
      setLoading(false);
      return;
    }

    try {
      const [claimsRes, patientsRes] = await Promise.all([
        fetchClaims(session.tenantId, session.accessToken, {
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          ...(startDateParam ? { startDate: startDateParam } : {}),
          ...(endDateParam ? { endDate: endDateParam } : {}),
        }),
        fetchPatients(session.tenantId, session.accessToken),
      ]);
      const [eligibilityStatusRes, clearinghouseStatusRes] = await Promise.all([
        fetchExternalIntegrationStatus(session.tenantId, session.accessToken, 'eligibility').catch(() => null),
        fetchExternalIntegrationStatus(session.tenantId, session.accessToken, 'clearinghouse').catch(() => null),
      ]);
      setEligibilityIntegration(eligibilityStatusRes?.integration ?? null);
      setClearinghouseIntegration(clearinghouseStatusRes?.integration ?? null);

      const resolvedPatients = (patientsRes.patients || patientsRes.data || []) as Patient[];
      const incomingClaims = Array.isArray(claimsRes.claims) ? claimsRes.claims : [];

      if (!incomingClaims.length) {
        setUsingDemoData(false);
        setClaims([]);
      } else {
        setUsingDemoData(false);
        setClaims(incomingClaims.map((raw: Record<string, unknown>) => normalizeClaimRecord(raw, resolvedPatients)));
      }

      setLastRefreshAt(new Date().toISOString());

      try {
        await fetchClaimMetrics(session.tenantId, session.accessToken);
      } catch {
        // Metrics endpoint can fail if schema/data is incomplete in local QA.
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load claims';
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [endDateParam, forceDemoData, session, showError, startDateParam, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setMetricsSnapshot(computeMetrics(claims));
  }, [claims]);

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentDate(todayIso);
    setPaymentMethod('');
    setPaymentPayer('');
    setCheckNumber('');
    setPaymentNotes('');
  };

  const applyLocalClaimPatch = (claimId: string, patch: Partial<ClaimRecord>) => {
    setClaims((prev) => prev.map((claim) => (claim.id === claimId ? { ...claim, ...patch } : claim)));
  };

  const normalizeClaimDetail = (detail: Record<string, unknown>, fallback: ClaimRecord): ClaimWithDetails => {
    const claimRaw = (detail.claim as Record<string, unknown> | undefined) || {};
    const claimTotalCents = getClaimTotalCents(claimRaw);
    const claimStatus = normalizeStatus(claimRaw.status || fallback.status);

    const claim: Claim = {
      id: String(claimRaw.id || fallback.id),
      tenantId: String(claimRaw.tenantId || session?.tenantId || 'tenant-demo'),
      encounterId: claimRaw.encounterId ? String(claimRaw.encounterId) : undefined,
      patientId: String(claimRaw.patientId || fallback.patientId),
      claimNumber: String(claimRaw.claimNumber || fallback.claimNumber),
      totalCents: claimTotalCents || fallback.totalBilledCents,
      status: statusToTypeStatus(claimStatus),
      payer: String(claimRaw.payer || fallback.payer),
      payerId: claimRaw.payerId ? String(claimRaw.payerId) : undefined,
      submittedAt: claimRaw.submittedAt ? String(claimRaw.submittedAt) : fallback.submittedAt,
      createdAt: String(claimRaw.createdAt || fallback.createdAt),
      updatedAt: String(claimRaw.updatedAt || fallback.updatedAt),
      patientFirstName: claimRaw.patientFirstName ? String(claimRaw.patientFirstName) : undefined,
      patientLastName: claimRaw.patientLastName ? String(claimRaw.patientLastName) : undefined,
      providerName: claimRaw.providerName ? String(claimRaw.providerName) : fallback.providerName,
      codingReviewStatus: claimRaw.codingReviewStatus ? String(claimRaw.codingReviewStatus) as Claim['codingReviewStatus'] : undefined,
      codingReviewedBy: claimRaw.codingReviewedBy ? String(claimRaw.codingReviewedBy) : undefined,
      codingReviewedAt: claimRaw.codingReviewedAt ? String(claimRaw.codingReviewedAt) : undefined,
      codingReviewNotes: claimRaw.codingReviewNotes ? String(claimRaw.codingReviewNotes) : undefined,
    };

    return {
      claim: {
        ...claim,
        dob: claimRaw.dob ? String(claimRaw.dob) : undefined,
        insurancePlanName: claimRaw.insurancePlanName ? String(claimRaw.insurancePlanName) : fallback.payer,
      },
      diagnoses: Array.isArray(detail.diagnoses) ? (detail.diagnoses as ClaimWithDetails['diagnoses']) : [],
      charges: Array.isArray(detail.charges) ? (detail.charges as ClaimWithDetails['charges']) : [],
      payments: Array.isArray(detail.payments) ? (detail.payments as ClaimWithDetails['payments']) : [],
      statusHistory: Array.isArray(detail.statusHistory) ? (detail.statusHistory as ClaimWithDetails['statusHistory']) : [],
    };
  };

  const loadClaimDetail = async (claim: ClaimRecord, openModal = true) => {
    if (!session) return null;

    const cached = claimDetailsCache[claim.id];
    if (cached) {
      setSelectedClaim(cached);
      if (openModal) setShowClaimDetail(true);
      return cached;
    }

    try {
      const detailRaw = await fetchClaimDetail(session.tenantId, session.accessToken, claim.id);
      const normalized = normalizeClaimDetail(detailRaw as Record<string, unknown>, claim);
      setClaimDetailsCache((prev) => ({ ...prev, [claim.id]: normalized }));
      setSelectedClaim(normalized);
      if (openModal) setShowClaimDetail(true);
      return normalized;
    } catch (err: unknown) {
      if (claim.id.startsWith('demo-') || usingDemoData) {
        const demoDetail = buildDemoClaimDetail(claim);
        setClaimDetailsCache((prev) => ({ ...prev, [claim.id]: demoDetail }));
        setSelectedClaim(demoDetail);
        if (openModal) setShowClaimDetail(true);
        return demoDetail;
      }

      const message = err instanceof Error ? err.message : 'Failed to load claim detail';
      showError(message);
      return null;
    }
  };

  useEffect(() => {
    const targetClaimId = routeClaimId || searchParams.get('claimId');
    if (!targetClaimId || loading || claims.length === 0) return;
    if (showClaimDetail && selectedClaim?.claim.id === targetClaimId) return;

    const claim = claims.find((entry) => entry.id === targetClaimId);
    if (claim) {
      void loadClaimDetail(claim, true);
    }
    // loadClaimDetail intentionally omitted to avoid reopening the modal whenever its cache changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, loading, routeClaimId, searchParams, selectedClaim?.claim.id, showClaimDetail]);

  const handleUpdateStatus = async (claimId: string, status: ClaimStatus, notes?: string) => {
    if (!session) return;

    const claim = claims.find((entry) => entry.id === claimId);
    if (!claim) return;

    if (claim.id.startsWith('demo-') || usingDemoData) {
      const nextStatus = normalizeStatus(status);
      applyLocalClaimPatch(claimId, { status: nextStatus });

      setClaimDetailsCache((prev) => {
        const existing = prev[claimId] || buildDemoClaimDetail(claim);
        const next: ClaimWithDetails = {
          ...existing,
          claim: {
            ...existing.claim,
            status: statusToTypeStatus(nextStatus),
          },
          statusHistory: [
            {
              id: `${claimId}-history-${Date.now()}`,
              tenantId: existing.claim.tenantId,
              claimId,
              status,
              notes,
              changedAt: new Date().toISOString(),
            },
            ...existing.statusHistory,
          ],
        };
        if (selectedClaim?.claim.id === claimId) {
          setSelectedClaim(next);
        }
        return { ...prev, [claimId]: next };
      });

      showSuccess(`Claim status updated to ${status}`);
      return;
    }

    try {
      await updateClaimStatus(session.tenantId, session.accessToken, claimId, { status, notes });
      showSuccess(`Claim status updated to ${status}`);
      await loadData();

      if (selectedClaim?.claim.id === claimId) {
        const refreshed = await loadClaimDetail(claim, false);
        if (refreshed) {
          setSelectedClaim(refreshed);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update claim status';
      showError(message);
    }
  };

  const handleReleaseClaim = async (claimId: string) => {
    if (!session) return;

    const claim = claims.find((entry) => entry.id === claimId);
    if (!claim) return;

    const notes = 'Coding review complete. Released for claim submission.';
    setReleaseIssue(null);
    setReleaseInFlightId(claimId);

    if (claim.id.startsWith('demo-') || usingDemoData) {
      applyLocalClaimPatch(claimId, {
        status: 'ready',
        codingReviewStatus: 'released',
        codingReviewedAt: new Date().toISOString(),
        codingReviewNotes: notes,
      });

      setClaimDetailsCache((prev) => {
        const existing = prev[claimId] || buildDemoClaimDetail(claim);
        const next: ClaimWithDetails = {
          ...existing,
          claim: {
            ...existing.claim,
            status: 'ready',
            codingReviewStatus: 'released',
            codingReviewedAt: new Date().toISOString(),
            codingReviewNotes: notes,
          },
          statusHistory: [
            {
              id: `${claimId}-release-${Date.now()}`,
              tenantId: existing.claim.tenantId,
              claimId,
              status: 'ready',
              notes,
              changedAt: new Date().toISOString(),
            },
            ...existing.statusHistory,
          ],
        };
        if (selectedClaim?.claim.id === claimId) {
          setSelectedClaim(next);
        }
        return { ...prev, [claimId]: next };
      });

      showSuccess('Claim released for submission');
      setReleaseInFlightId(null);
      return;
    }

    try {
      await releaseClaimFromCodingReview(session.tenantId, session.accessToken, claimId, { notes });
      showSuccess('Claim released for submission');
      await loadData();

      if (selectedClaim?.claim.id === claimId) {
        const refreshed = await loadClaimDetail({ ...claim, status: 'ready' }, false);
        if (refreshed) {
          setSelectedClaim(refreshed);
        }
      }
    } catch (err: unknown) {
      const releaseError = err as Error & { details?: { error?: string; scrubStatus?: string; errors?: ReleaseRuleMessage[]; warnings?: ReleaseRuleMessage[] } };
      const message = releaseError instanceof Error ? releaseError.message : 'Failed to release claim';
      setReleaseIssue({
        claimId: claim.id,
        claimNumber: claim.claimNumber,
        patientName: claim.patientName,
        message,
        scrubStatus: releaseError.details?.scrubStatus || claim.scrubStatus,
        errors: releaseError.details?.errors || [],
        warnings: releaseError.details?.warnings || [],
      });
      showError(message);
    } finally {
      setReleaseInFlightId(null);
    }
  };

  const handlePostPayment = async () => {
    if (!session || !selectedClaim) return;

    const amount = Number.parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError('Invalid payment amount');
      return;
    }

    const claimId = selectedClaim.claim.id;
    const amountCents = Math.round(amount * 100);

    if (claimId.startsWith('demo-') || usingDemoData) {
      const paymentRow = {
        id: `${claimId}-payment-${Date.now()}`,
        tenantId: selectedClaim.claim.tenantId,
        claimId,
        amountCents,
        paymentDate,
        paymentMethod: paymentMethod || undefined,
        payer: paymentPayer || selectedClaim.claim.payer,
        checkNumber: checkNumber || undefined,
        notes: paymentNotes || undefined,
        createdAt: new Date().toISOString(),
      };

      const nextDetail: ClaimWithDetails = {
        ...selectedClaim,
        payments: [paymentRow, ...selectedClaim.payments],
      };

      const newPaidCents = nextDetail.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      const totalCents = selectedClaim.claim.totalCents || 0;
      const nextStatus: ClaimUiStatus = newPaidCents >= totalCents ? 'paid' : 'partially_paid';

      nextDetail.claim = {
        ...nextDetail.claim,
        status: statusToTypeStatus(nextStatus),
      };

      setClaimDetailsCache((prev) => ({ ...prev, [claimId]: nextDetail }));
      setSelectedClaim(nextDetail);
      applyLocalClaimPatch(claimId, {
        paidAmountCents: newPaidCents,
        balanceCents: Math.max(0, totalCents - newPaidCents),
        status: nextStatus,
      });

      showSuccess('Payment posted successfully');
      setShowPaymentModal(false);
      resetPaymentForm();
      return;
    }

    try {
      await postClaimPayment(session.tenantId, session.accessToken, claimId, {
        amountCents,
        paymentDate,
        paymentMethod: paymentMethod || undefined,
        payer: paymentPayer || undefined,
        checkNumber: checkNumber || undefined,
        notes: paymentNotes || undefined,
      });

      showSuccess('Payment posted successfully');
      setShowPaymentModal(false);
      resetPaymentForm();
      await loadData();

      const parentClaim = claims.find((entry) => entry.id === claimId);
      if (parentClaim) {
        await loadClaimDetail(parentClaim, false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post payment';
      showError(message);
    }
  };

  const filteredClaims = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return claims.filter((claim) => {
      if (statusFilter !== 'all' && claim.status !== statusFilter) {
        return false;
      }

      if (queueFilter !== 'all') {
        const currentQueue = claimQueue(claim);
        if (queueFilter === 'exceptions') {
          if (!isClaimException(claim)) {
            return false;
          }
        } else if (queueFilter === 'filing_risk') {
          if (!(claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) > 300)) {
            return false;
          }
        } else if (currentQueue !== queueFilter) {
          return false;
        }
      }

      if (search) {
        const claimNumber = claim.claimNumber.toLowerCase();
        const patientName = claim.patientName.toLowerCase();
        const payer = claim.payer.toLowerCase();
        const providerName = claim.providerName.toLowerCase();

        if (
          !claimNumber.includes(search) &&
          !patientName.includes(search) &&
          !payer.includes(search) &&
          !providerName.includes(search)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [claims, statusFilter, queueFilter, searchTerm]);

  const queueDrilldown = useMemo(() => {
    const totalBilledCents = filteredClaims.reduce((sum, claim) => sum + claim.totalBilledCents, 0);
    const outstandingCents = filteredClaims.reduce((sum, claim) => sum + claim.balanceCents, 0);
    const paidCents = filteredClaims.reduce((sum, claim) => sum + claim.paidAmountCents, 0);
    const oldestAgeDays = filteredClaims.reduce((max, claim) => Math.max(max, getDaysSince(claim.serviceDate || claim.createdAt)), 0);
    const topClaims = [...filteredClaims]
      .sort((a, b) => {
        if (b.balanceCents !== a.balanceCents) return b.balanceCents - a.balanceCents;
        return getDaysSince(b.serviceDate || b.createdAt) - getDaysSince(a.serviceDate || a.createdAt);
      })
      .slice(0, 5);

    return {
      totalBilledCents,
      outstandingCents,
      paidCents,
      oldestAgeDays,
      topClaims,
    };
  }, [filteredClaims]);

  const queueCounts = useMemo(() => {
    const counters: Record<QueueFilter, number> = {
      all: claims.length,
      coding_review: 0,
      ready: 0,
      pending: 0,
      denials: 0,
      payment: 0,
      appeals: 0,
      filing_risk: 0,
      exceptions: 0,
    };

    for (const claim of claims) {
      const queue = claimQueue(claim);
      if (queue in counters) {
        counters[queue] += 1;
      }
      if (isClaimException(claim)) {
        counters.exceptions += 1;
      }
      if (claim.balanceCents > 0 && getDaysSince(claim.serviceDate || claim.createdAt) > 300) {
        counters.filing_risk += 1;
      }
    }

    return counters;
  }, [claims]);

  const denialReasonRows = useMemo(() => {
    const grouped = new Map<string, { reason: string; count: number }>();

    for (const claim of claims) {
      if (claim.status !== 'rejected' && claim.status !== 'denied') continue;
      const reason = claim.denialReason || 'Denial reason pending categorization';
      const current = grouped.get(reason);
      if (current) {
        current.count += 1;
      } else {
        grouped.set(reason, { reason, count: 1 });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [claims]);

  const payerPerformanceRows = useMemo(() => {
    const grouped = new Map<string, { payer: string; total: number; open: number; denied: number; outstandingCents: number; paidCents: number }>();

    for (const claim of claims) {
      const key = claim.payer || 'Unknown Payer';
      const current = grouped.get(key) || { payer: key, total: 0, open: 0, denied: 0, outstandingCents: 0, paidCents: 0 };
      current.total += 1;
      if (claim.balanceCents > 0) {
        current.open += 1;
      }
      if (claim.status === 'rejected' || claim.status === 'denied') {
        current.denied += 1;
      }
      current.outstandingCents += claim.balanceCents;
      current.paidCents += claim.paidAmountCents;
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.outstandingCents - a.outstandingCents)
      .slice(0, 8);
  }, [claims]);

  const priorityClaims = useMemo(() => {
    return claims
      .filter((claim) => {
        if (claim.balanceCents <= 0) return false;
        const q = claimQueue(claim);
        return q === 'denials' || q === 'appeals' || q === 'filing_risk' || getDaysSince(claim.serviceDate || claim.createdAt) >= 21;
      })
      .sort((a, b) => {
        const aAge = getDaysSince(a.serviceDate || a.createdAt);
        const bAge = getDaysSince(b.serviceDate || b.createdAt);
        if (bAge !== aAge) return bAge - aAge;
        return b.balanceCents - a.balanceCents;
      })
      .slice(0, 10);
  }, [claims]);

  const paymentQueueClaims = useMemo(() => claims.filter(isPaymentQueueClaim), [claims]);

  const recentPayments = useMemo<CachedPaymentRow[]>(() => {
    const rows: CachedPaymentRow[] = [];

    for (const detail of Object.values(claimDetailsCache)) {
      const claim = claims.find((entry) => entry.id === detail.claim.id);
      const patientName = claim?.patientName || 'Unknown Patient';
      const claimNumber = claim?.claimNumber || detail.claim.claimNumber;
      const payer = claim?.payer || detail.claim.payer || 'Unknown Payer';

      for (const payment of detail.payments) {
        rows.push({
          id: payment.id,
          claimId: detail.claim.id,
          claimNumber,
          patientName,
          payer,
          paymentDate: payment.paymentDate,
          amountCents: payment.amountCents,
          paymentMethod: payment.paymentMethod,
          checkNumber: payment.checkNumber,
          notes: payment.notes,
        });
      }
    }

    return rows.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()).slice(0, 50);
  }, [claimDetailsCache, claims]);

  const metrics = metricsSnapshot || computeMetrics(filteredClaims);
  const claimsWithEligibility = claims.filter((claim) => claim.eligibilityVerifiedAt).length;
  const claimsWithEligibilityIssues = claims.filter((claim) => claim.eligibilityHasIssues).length;
  const stediBackedClaims = claims.filter((claim) => String(claim.eligibilitySource || '').includes('stedi')).length;

  if (loading) {
    return (
      <div className="claims-page">
        <div className="page-header">
          <h1>Claims Management</h1>
        </div>
        <Skeleton variant="card" height={420} />
      </div>
    );
  }

  return (
    <div className="claims-page">
      <div className="page-header claims-header">
        <div>
          <div className="claims-page-eyebrow">Revenue Cycle Workbench</div>
          <h1>Claims Management</h1>
          <div className="muted claims-subtitle">
            Claims lifecycle, denials, payment posting, and A/R follow-up.
          </div>
        </div>
        <div className="claims-header-actions">
          {!forceDemoData ? (
            <button type="button" className="btn-secondary" onClick={() => setForceDemoData(true)}>
              Load Demo Dataset
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setForceDemoData(false)}>
              Back To Live Data
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => void loadData()}>
            Refresh
          </button>
        </div>
      </div>

      {usingDemoData && (
        <div className="claims-demo-banner">
          Demo dataset active for claims testing.
        </div>
      )}

      <div className="claims-insurance-sync" aria-label="Insurance data sync status">
        <div>
          <div className="claims-section-heading">Insurance Data Sync</div>
          <div className="muted claims-micro-copy">
            Claims include the patient&apos;s latest eligibility verification so billing can see coverage context before submission.
          </div>
        </div>
        <div className="claims-sync-items">
          <div className="claims-sync-item">
            <span>Eligibility</span>
            <strong>{formatConnectionStatus(eligibilityIntegration)}</strong>
          </div>
          <div className="claims-sync-item">
            <span>Claims clearinghouse</span>
            <strong>{formatConnectionStatus(clearinghouseIntegration)}</strong>
          </div>
          <div className="claims-sync-item">
            <span>Verified on claims</span>
            <strong>{claimsWithEligibility}/{claims.length}</strong>
          </div>
          <div className="claims-sync-item">
            <span>Stedi-backed checks</span>
            <strong>{stediBackedClaims}</strong>
          </div>
          <div className={`claims-sync-item ${claimsWithEligibilityIssues > 0 ? 'warning' : ''}`}>
            <span>Coverage issues</span>
            <strong>{claimsWithEligibilityIssues}</strong>
          </div>
        </div>
      </div>

      <div className="financial-stats claims-kpis">
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('all')}>
          <div className="stat-value">{metrics.totalClaims}</div>
          <div className="stat-label">Total Claims</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('all')}>
          <div className="stat-value">{metrics.activeCount}</div>
          <div className="stat-label">Active Work</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('filing_risk')}>
          <div className="stat-value">{metrics.atRiskCount}</div>
          <div className="stat-label">At-Risk Claims</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('all')}>
          <div className="stat-value">{formatCurrency(metrics.totalBilledCents)}</div>
          <div className="stat-label">Total Billed</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('all')}>
          <div className="stat-value">{formatCurrency(metrics.totalOutstandingCents)}</div>
          <div className="stat-label">Outstanding A/R</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('pending')}>
          <div className="stat-value">{metrics.pendingCount}</div>
          <div className="stat-label">Awaiting Payer</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('payment')}>
          <div className="stat-value">{metrics.paymentQueueCount}</div>
          <div className="stat-label">Payment Queue</div>
        </button>
        <button type="button" className="stat-card stat-card-button" onClick={() => applyClaimDrilldown('all', 'paid')}>
          <div className="stat-value">{metrics.firstPassPaidRate.toFixed(1)}%</div>
          <div className="stat-label">First-Pass Paid Rate</div>
        </button>
      </div>

      <div className="financial-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'claims' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('claims');
            updateUrlFilter('tab', 'claims');
          }}
        >
          Claims Workbench
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('payments');
            updateUrlFilter('tab', 'payments');
          }}
        >
          Payment Posting
        </button>
      </div>

      {activeTab === 'claims' && (
        <>
          <Panel title="Operational Snapshot">
            <div className="claims-snapshot-grid">
              <div>
                <h2 className="claims-section-heading">Work Queues</h2>
                <div className="claims-queue-grid">
                  {([
                    ['coding_review', 'Coding Review'],
                    ['ready', 'Ready to Submit'],
                    ['pending', 'Awaiting Payer'],
                    ['denials', 'Denials/Rejections'],
                    ['payment', 'Payment Queue'],
                    ['appeals', 'Appeals'],
                    ['filing_risk', 'Timely Filing Risk'],
                    ['exceptions', 'Exceptions'],
                  ] as Array<[QueueFilter, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`btn-sm claims-queue-btn ${queueFilter === key ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setQueueFilter(key);
                        updateUrlFilter('queue', key);
                      }}
                    >
                      <span className="claims-queue-label">{label}</span>
                      <strong className="claims-queue-count">{queueCounts[key]}</strong>
                    </button>
                  ))}
                </div>
                <div className="claims-queue-clear">
                  <button
                    type="button"
                    className="btn-sm btn-secondary"
                    onClick={() => {
                      setQueueFilter('all');
                      updateUrlFilter('queue', 'all');
                    }}
                  >
                    Clear Queue Filter
                  </button>
                </div>
              </div>

              <div>
                <h2 className="claims-section-heading">A/R Aging Buckets</h2>
                <table className="claims-compact-table">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Claims</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.agingBuckets.map((bucket) => (
                      <tr key={bucket.label}>
                        <td>{bucket.label}</td>
                        <td>{bucket.count}</td>
                        <td>{formatCurrency(bucket.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted claims-micro-copy">
                  Avg days in A/R: {metrics.avgDaysInAR.toFixed(1)} days | Denial/appeal rate: {metrics.denialRate.toFixed(1)}%
                </div>
              </div>

              <div className="claims-wide-row">
                <h2 className="claims-section-heading">Top Denial / Rejection Reasons</h2>
                {denialReasonRows.length === 0 ? (
                  <div className="muted claims-empty-note">
                    No denials/rejections in the current dataset.
                  </div>
                ) : (
                  <table className="claims-compact-table">
                    <thead>
                      <tr>
                        <th>Reason</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {denialReasonRows.map((row) => (
                        <tr key={row.reason}>
                          <td>{row.reason}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="muted claims-micro-copy">
                  Timely filing risk claims (&gt;300 days since DOS): {metrics.timelyFilingRiskCount}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Follow-up Priorities">
            <div className="claims-followup-grid">
              <div>
                <h2 className="claims-section-heading">Claims Requiring Action</h2>
                <table className="claims-compact-table">
                  <thead>
                    <tr>
                      <th>Claim #</th>
                      <th>Patient</th>
                      <th>Queue</th>
                      <th>Age</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorityClaims.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="claims-empty-cell compact">
                          No priority claims in the current dataset.
                        </td>
                      </tr>
                    ) : (
                      priorityClaims.map((claim) => (
                        <tr key={claim.id}>
                          <td className="strong claims-claim-id">#{claim.claimNumber}</td>
                          <td>{claim.patientName}</td>
                          <td className="claims-queue-cell">{queueLabel(claimQueue(claim))}</td>
                          <td className="claims-age">{getDaysSince(claim.serviceDate || claim.createdAt)}d</td>
                          <td className="claims-num">{formatCurrency(claim.balanceCents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h2 className="claims-section-heading">Payer Performance</h2>
                <table className="claims-compact-table">
                  <thead>
                    <tr>
                      <th>Payer</th>
                      <th>Open</th>
                      <th>Denied</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payerPerformanceRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="claims-empty-cell compact">
                          No payer activity available.
                        </td>
                      </tr>
                    ) : (
                      payerPerformanceRows.map((row) => (
                        <tr key={row.payer}>
                          <td>{row.payer}</td>
                          <td className="claims-num">{row.open}</td>
                          <td className="claims-num">{row.denied}</td>
                          <td className="claims-num">{formatCurrency(row.outstandingCents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>

          <Panel title="Claims List">
            <div className="claims-filters">
              <div className="filter-row">
                <div className="form-field">
                  <label>Status Filter</label>
                  <select
                    aria-label="Claim status filter"
                    value={statusFilter}
                    onChange={(event) => {
                      const nextStatus = event.target.value as ClaimUiStatus | 'all';
                      setStatusFilter(nextStatus);
                      updateUrlFilter('status', nextStatus);
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="coding_review">Coding Review</option>
                    <option value="ready">Ready</option>
                    <option value="submitted">Submitted</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                    <option value="denied">Denied</option>
                    <option value="paid">Paid</option>
                    <option value="partially_paid">Partially Paid</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Search</label>
                  <input
                    type="text"
                    placeholder="Search by claim #, patient, or provider..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
              </div>
              <div className="muted claims-micro-copy">
                Showing {filteredClaims.length} of {claims.length} claims. Last refresh: {lastRefreshAt ? new Date(lastRefreshAt).toLocaleString() : 'n/a'}
              </div>
            </div>

            <div className="claims-drilldown-panel" aria-live="polite">
              <div className="claims-drilldown-header">
                <div>
                  <h2>{queueFilter === 'all' ? 'All Claims Drilldown' : `${queueLabel(queueFilter)} Drilldown`}</h2>
                  <div className="muted claims-micro-copy">
                    This is the data behind the selected queue button.
                  </div>
                </div>
                <div className="claims-drilldown-summary">
                  <span>{filteredClaims.length} claims</span>
                  <span>{formatCurrency(queueDrilldown.totalBilledCents)} billed</span>
                  <span>{formatCurrency(queueDrilldown.outstandingCents)} open</span>
                  <span>{queueDrilldown.oldestAgeDays}d oldest</span>
                </div>
              </div>
              <div className="claims-drilldown-grid">
                <div className="claims-drilldown-metric">
                  <span>Paid</span>
                  <strong>{formatCurrency(queueDrilldown.paidCents)}</strong>
                </div>
                <div className="claims-drilldown-metric">
                  <span>Outstanding</span>
                  <strong>{formatCurrency(queueDrilldown.outstandingCents)}</strong>
                </div>
                <div className="claims-drilldown-metric">
                  <span>Next Work</span>
                  <strong>{queueDrilldown.topClaims[0] ? getNextAction(queueDrilldown.topClaims[0]) : 'No claims in queue'}</strong>
                </div>
              </div>
              {queueDrilldown.topClaims.length > 0 && (
                <table className="claims-compact-table claims-drilldown-table">
                  <thead>
                    <tr>
                      <th>Claim #</th>
                      <th>Patient</th>
                      <th>Payer</th>
                      <th>Balance</th>
                      <th>Next Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueDrilldown.topClaims.map((claim) => (
                      <tr key={claim.id}>
                        <td className="strong claims-claim-id">{claim.claimNumber}</td>
                        <td>{claim.patientName}</td>
                        <td>{claim.payer}</td>
                        <td className="claims-num">{formatCurrency(claim.balanceCents)}</td>
                        <td>{getNextAction(claim)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="claims-table">
              <table>
                <thead>
                  <tr>
                    <th>Claim #</th>
                    <th>DOS</th>
                    <th>Patient</th>
                    <th>Payer</th>
                    <th>Eligibility</th>
                    <th>Status</th>
                    <th>Queue</th>
                    <th>Billed</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Aging</th>
                    <th>Next Action</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="claims-empty-cell">
                        No claims found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredClaims.map((claim) => {
                      const ageDays = getDaysSince(claim.serviceDate || claim.createdAt);
                      return (
                        <tr key={claim.id}>
                          <td className="strong claims-claim-id">{claim.claimNumber}</td>
                          <td className="muted">{formatClaimDate(claim.serviceDate || claim.createdAt)}</td>
                          <td>{claim.patientName}</td>
                          <td className="muted">{claim.payer}</td>
                          <td>
                            <div className="claims-eligibility-cell">
                              <span
                                className={`pill claims-status-pill ${getEligibilityColor(claim)}`}
                                title={claim.eligibilityIssueNotes || claim.eligibilityPayerName || undefined}
                              >
                                {normalizeEligibilityStatus(claim.eligibilityStatus)}
                              </span>
                              <span className="muted tiny">
                                {claim.eligibilitySource ? `${claim.eligibilitySource.replace(/_/g, ' ')} • ` : ''}
                                {formatDateTime(claim.eligibilityVerifiedAt)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`pill claims-status-pill ${getStatusColor(claim.status)}`}>{toStatusLabel(claim.status)}</span>
                          </td>
                          <td className="muted tiny claims-queue-cell">{queueLabel(claimQueue(claim))}</td>
                          <td className="claims-num">{formatCurrency(claim.totalBilledCents)}</td>
                          <td className="positive claims-num">{formatCurrency(claim.paidAmountCents)}</td>
                          <td className="claims-num">{formatCurrency(claim.balanceCents)}</td>
                          <td className="claims-age">{ageDays}d</td>
                          <td className="muted tiny">{getNextAction(claim)}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="btn-sm btn-secondary"
                                onClick={() => void loadClaimDetail(claim, true)}
                              >
                                View
                              </button>
                              {(claim.status === 'coding_review' || claim.status === 'draft') && (
                                <button
                                  type="button"
                                  className={`btn-sm ${String(claim.scrubStatus || '').toLowerCase() === 'errors' || String(claim.scrubStatus || '').toLowerCase() === 'failed' ? 'btn-secondary' : 'btn-primary'}`}
                                  title={getReleaseButtonTitle(claim)}
                                  disabled={releaseInFlightId === claim.id}
                                  onClick={() => void handleReleaseClaim(claim.id)}
                                >
                                  {releaseInFlightId === claim.id ? 'Checking...' : getReleaseButtonLabel(claim)}
                                </button>
                              )}
                              {claim.balanceCents > 0 && (
                                <button
                                  type="button"
                                  className="btn-sm btn-primary"
                                  onClick={async () => {
                                    const detail = await loadClaimDetail(claim, false);
                                    if (detail) {
                                      setShowPaymentModal(true);
                                    }
                                  }}
                                >
                                  Post Payment
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {activeTab === 'payments' && (
        <div className="claims-payments-grid">
          <Panel title="Payment Posting Queue">
            <div className="payments-table">
              <table>
                <thead>
                  <tr>
                    <th>Claim #</th>
                    <th>Patient</th>
                    <th>Payer</th>
                    <th>Balance</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentQueueClaims.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="claims-empty-cell">
                        No claims currently waiting for payment posting.
                      </td>
                    </tr>
                  ) : (
                    paymentQueueClaims.map((claim) => (
                      <tr key={claim.id}>
                        <td className="strong claims-claim-id">{claim.claimNumber}</td>
                        <td>{claim.patientName}</td>
                        <td className="muted">{claim.payer}</td>
                        <td className="claims-num">{formatCurrency(claim.balanceCents)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-sm btn-primary"
                            onClick={async () => {
                              const detail = await loadClaimDetail(claim, false);
                              if (detail) {
                                setShowPaymentModal(true);
                              }
                            }}
                          >
                            Post
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Recent Payments">
            <div className="payments-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Claim #</th>
                    <th>Patient</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="claims-empty-cell">
                        Open a claim detail or post a payment to populate this list.
                      </td>
                    </tr>
                  ) : (
                    recentPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="muted">{formatClaimDate(payment.paymentDate)}</td>
                        <td className="strong claims-claim-id">{payment.claimNumber}</td>
                        <td>{payment.patientName}</td>
                        <td className="positive claims-num">{formatCurrency(payment.amountCents)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <Modal
        isOpen={releaseIssue !== null}
        title={releaseIssue ? `Release Blocked: ${releaseIssue.claimNumber}` : 'Release Blocked'}
        onClose={() => setReleaseIssue(null)}
        size="md"
      >
        {releaseIssue && (
          <div className="claims-release-issue">
            <div className="claims-release-alert">
              <strong>{releaseIssue.message}</strong>
              <span>{releaseIssue.patientName}</span>
              {releaseIssue.scrubStatus && <span>Scrub status: {releaseIssue.scrubStatus}</span>}
            </div>
            {releaseIssue.errors.length > 0 ? (
              <div>
                <h3>Must Fix Before Release</h3>
                <ul>
                  {releaseIssue.errors.map((item, index) => (
                    <li key={`${item.ruleCode || 'error'}-${index}`}>
                      {item.ruleCode && <strong>{item.ruleCode}: </strong>}
                      {item.message || 'Claim scrubber error'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted">
                The backend blocked release. Open the claim detail and verify payer, diagnosis links, procedure codes, and place of service.
              </p>
            )}
            {releaseIssue.warnings.length > 0 && (
              <div>
                <h3>Warnings</h3>
                <ul>
                  {releaseIssue.warnings.map((item, index) => (
                    <li key={`${item.ruleCode || 'warning'}-${index}`}>
                      {item.ruleCode && <strong>{item.ruleCode}: </strong>}
                      {item.message || 'Claim scrubber warning'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="claims-release-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const claim = claims.find((entry) => entry.id === releaseIssue.claimId);
                  setReleaseIssue(null);
                  if (claim) {
                    void loadClaimDetail(claim, true);
                  }
                }}
              >
                Open Claim Detail
              </button>
              <button type="button" className="btn-primary" onClick={() => setReleaseIssue(null)}>
                Got It
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showClaimDetail}
        title={selectedClaim ? `Claim ${selectedClaim.claim.claimNumber}` : 'Claim Detail'}
        onClose={() => {
          setShowClaimDetail(false);
          setSelectedClaim(null);
        }}
        size="lg"
      >
        {selectedClaim && (
          <div className="claim-detail">
            <div className="claim-info-section">
              <h3>Claim Information</h3>
              <div className="claim-info-grid">
                <div className="field">
                  <span className="label">Patient:</span>
                  <span className="value">
                    {selectedClaim.claim.patientLastName && selectedClaim.claim.patientFirstName
                      ? `${selectedClaim.claim.patientLastName}, ${selectedClaim.claim.patientFirstName}`
                      : claims.find((claim) => claim.id === selectedClaim.claim.id)?.patientName || 'Unknown'}
                  </span>
                </div>
                <div className="field">
                  <span className="label">DOB:</span>
                  <span className="value">{formatClaimDate(selectedClaim.claim.dob)}</span>
                </div>
                <div className="field">
                  <span className="label">Insurance:</span>
                  <span className="value">{selectedClaim.claim.insurancePlanName || selectedClaim.claim.payer || 'Self-Pay'}</span>
                </div>
                <div className="field">
                  <span className="label">Provider:</span>
                  <span className="value">{selectedClaim.claim.providerName || '-'}</span>
                </div>
                <div className="field">
                  <span className="label">Status:</span>
                  <span className={`pill ${getStatusColor(normalizeStatus(selectedClaim.claim.status))}`}>
                    {toStatusLabel(normalizeStatus(selectedClaim.claim.status))}
                  </span>
                </div>
                <div className="field">
                  <span className="label">Coding Review:</span>
                  <span className="value">
                    {selectedClaim.claim.codingReviewStatus === 'released'
                      ? `Released${selectedClaim.claim.codingReviewedAt ? ` ${new Date(selectedClaim.claim.codingReviewedAt).toLocaleDateString()}` : ''}`
                      : normalizeStatus(selectedClaim.claim.status) === 'coding_review'
                        ? 'Needs coder release'
                        : selectedClaim.claim.codingReviewStatus || '-'}
                  </span>
                </div>
                <div className="field">
                  <span className="label">Total:</span>
                  <span className="value strong">{formatCurrency(selectedClaim.claim.totalCents || 0)}</span>
                </div>
              </div>

              <div className="status-actions">
                <label>Update Status:</label>
                <div className="status-buttons">
                  {(selectedClaim.claim.status === 'coding_review' || selectedClaim.claim.status === 'draft') && (
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={() => void handleReleaseClaim(selectedClaim.claim.id)}
                      disabled={releaseInFlightId === selectedClaim.claim.id}
                    >
                      {releaseInFlightId === selectedClaim.claim.id ? 'Checking...' : 'Release To Ready'}
                    </button>
                  )}
                  {(['ready', 'submitted', 'accepted', 'rejected'] as ClaimStatus[])
                    .filter((status) => {
                      const current = normalizeStatus(selectedClaim.claim.status);
                      if ((current === 'coding_review' || current === 'draft') && status === 'ready') return false;
                      if (status === 'submitted' && current !== 'ready' && current !== 'submitted') return false;
                      return true;
                    })
                    .map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn-sm ${selectedClaim.claim.status === status ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => void handleUpdateStatus(selectedClaim.claim.id, status)}
                      disabled={selectedClaim.claim.status === status}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="claim-info-section">
              <h3>Diagnoses</h3>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ICD-10</th>
                    <th>Description</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.diagnoses.map((dx, idx) => (
                    <tr key={dx.id}>
                      <td>{idx + 1}</td>
                      <td>{dx.icd10Code}</td>
                      <td>{dx.description}</td>
                      <td>{dx.isPrimary ? 'Yes' : ''}</td>
                    </tr>
                  ))}
                  {selectedClaim.diagnoses.length === 0 && (
                    <tr>
                      <td colSpan={4} className="claims-empty-cell compact">No diagnoses</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="claim-info-section">
              <h3>Procedures</h3>
              <table>
                <thead>
                  <tr>
                    <th>CPT</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.charges.map((charge) => (
                    <tr key={charge.id}>
                      <td>{charge.cptCode}</td>
                      <td>{charge.description}</td>
                      <td>{charge.quantity}</td>
                      <td>{formatCurrency(charge.feeCents * charge.quantity)}</td>
                    </tr>
                  ))}
                  {selectedClaim.charges.length === 0 && (
                    <tr>
                      <td colSpan={4} className="claims-empty-cell compact">No charges</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="claim-info-section">
              <h3>Payments</h3>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payer</th>
                    <th>Method</th>
                    <th>Check #</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatClaimDate(payment.paymentDate)}</td>
                      <td>{payment.payer || '-'}</td>
                      <td>{payment.paymentMethod || '-'}</td>
                      <td>{payment.checkNumber || '-'}</td>
                      <td className="positive">{formatCurrency(payment.amountCents)}</td>
                    </tr>
                  ))}
                  {selectedClaim.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="claims-empty-cell compact">No payments</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="claims-total-paid">
                Total Paid: {formatCurrency(selectedClaim.payments.reduce((sum, payment) => sum + payment.amountCents, 0))}
              </div>
            </div>

            <div className="claim-info-section">
              <h3>Status History</h3>
              <div className="status-history">
                {selectedClaim.statusHistory.map((history) => (
                  <div key={history.id} className="history-item">
                    <span className={`pill ${getStatusColor(normalizeStatus(history.status))}`}>{toStatusLabel(normalizeStatus(history.status))}</span>
                    <span className="muted tiny">{new Date(history.changedAt).toLocaleString()}</span>
                    {history.notes && <span className="muted tiny">{history.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowClaimDetail(false)}>
            Close
          </button>
          {selectedClaim && (selectedClaim.claim.totalCents || 0) > selectedClaim.payments.reduce((sum, payment) => sum + payment.amountCents, 0) && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setShowClaimDetail(false);
                setShowPaymentModal(true);
              }}
            >
              Post Payment
            </button>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showPaymentModal}
        title="Post Payment"
        onClose={() => {
          setShowPaymentModal(false);
          resetPaymentForm();
        }}
      >
        {selectedClaim && (
          <div className="modal-form">
            <div className="payment-claim-info">
              <div className="info-row">
                <span className="label">Claim #:</span>
                <span className="value">{selectedClaim.claim.claimNumber}</span>
              </div>
              <div className="info-row">
                <span className="label">Patient:</span>
                <span className="value">
                  {selectedClaim.claim.patientLastName && selectedClaim.claim.patientFirstName
                    ? `${selectedClaim.claim.patientLastName}, ${selectedClaim.claim.patientFirstName}`
                    : claims.find((claim) => claim.id === selectedClaim.claim.id)?.patientName || 'Unknown'}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Claim Total:</span>
                <span className="value">{formatCurrency(selectedClaim.claim.totalCents || 0)}</span>
              </div>
              <div className="info-row">
                <span className="label">Total Paid:</span>
                <span className="value">{formatCurrency(selectedClaim.payments.reduce((sum, payment) => sum + payment.amountCents, 0))}</span>
              </div>
              <div className="info-row">
                <span className="label">Balance:</span>
                <span className="value strong">
                  {formatCurrency((selectedClaim.claim.totalCents || 0) - selectedClaim.payments.reduce((sum, payment) => sum + payment.amountCents, 0))}
                </span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Payment Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>Payment Date *</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Payment Method</label>
                <select aria-label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="">Select...</option>
                  <option value="check">Check</option>
                  <option value="eft">EFT</option>
                  <option value="credit">Credit Card</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div className="form-field">
                <label>Payer</label>
                <input
                  type="text"
                  value={paymentPayer}
                  onChange={(event) => setPaymentPayer(event.target.value)}
                  placeholder="Insurance company or patient name"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Check Number</label>
                <input
                  type="text"
                  value={checkNumber}
                  onChange={(event) => setCheckNumber(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Notes</label>
              <textarea
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
                placeholder="Optional notes about this payment"
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowPaymentModal(false);
              resetPaymentForm();
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void handlePostPayment()}>
            Post Payment
          </button>
        </div>
      </Modal>
    </div>
  );
}
