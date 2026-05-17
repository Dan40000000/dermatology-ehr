import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import { RCMDashboard } from '../components/financials/RCMDashboard';
import { PatientPaymentPortal } from '../components/financials/PatientPaymentPortal';
import { PremiumAnalytics } from '../components/financials/PremiumAnalytics';
import { FeeSchedulePage } from './FeeSchedulePage';
import {
  fetchARAging,
  fetchBills,
  fetchBillsSummary,
  fetchClaims,
  fetchCollectionsTrend,
  fetchFinancialMetrics,
  fetchFinancialWorkQueue,
  fetchPaymentsSummary,
  postBillAction,
  resolveFinancialWorkQueueItem,
} from '../api/financials';

type TabType = 'dashboard' | 'snapshots' | 'insurance' | 'bills' | 'payments' | 'analytics' | 'fees' | 'statements' | 'reports';
type SnapshotPagePeriod = SnapshotMetricCard['key'] | 'custom';
const DAY_MS = 24 * 60 * 60 * 1000;

interface TabConfig {
  key: TabType;
  label: string;
  icon: string;
  description: string;
}

interface SnapshotMetricCard {
  key: 'daily' | 'weekly' | 'monthly';
  label: string;
  rangeLabel: string;
  completedAppointments: number;
  totalRevenueCents: number;
  collectionsCents: number;
  avgRevenuePerVisitCents: number;
  benchmarkVisitsCount: number;
  collectionRate: number;
  standaloneRevenueCents: number;
  revenueCategories: RevenueCategorySummary[];
}

interface RevenueCategorySummary {
  key: string;
  label: string;
  revenueCents: number;
  itemCount: number;
}

interface DashboardSnapshotMetrics {
  daily: SnapshotMetricCard;
  weekly: SnapshotMetricCard;
  monthly: SnapshotMetricCard;
  sourceNote: string;
}

interface SnapshotTrendSummary {
  totalPaymentsCollectedCents: number;
  totalRevenueEarnedCents: number;
  totalPatientPaymentsCents: number;
  totalPayerPaymentsCents: number;
  totalPaymentCount: number;
  totalBillCount: number;
  dayCount: number;
  avgDailyPaymentsCollectedCents: number;
  avgDailyRevenueEarnedCents: number;
  collectionRate: number;
  revenueCategories?: RevenueCategorySummary[];
}

interface DashboardRcmMetrics {
  totalClinicalCollections: number;
  netCollectionRatio: number;
  adjustmentsWriteoffs: number;
  daysSalesOutstanding: number;
  firstPassClaimRate: number;
  denialRate: number;
  avgDaysToPay: number;
  claimsInQueue: number;
  pendingAppeals: number;
}

interface DashboardAraBucket {
  label: string;
  range: string;
  amountCents: number;
  count: number;
  percentage: number;
  color: string;
}

interface FinancialBill {
  id: string;
  billNumber?: string;
  billPayCode?: string;
  patientFirstName?: string;
  patientLastName?: string;
  payerName?: string;
  billDate?: string;
  totalChargesCents?: number;
  insuranceResponsibilityCents?: number;
  patientResponsibilityCents?: number;
  paidAmountCents?: number;
  balanceCents?: number;
  dueDate?: string;
  status?: string;
  followUpStatus?: string;
  collectionsStatus?: string;
  paymentPlanStatus?: string;
  billingInternalNote?: string;
  lastStatementSentAt?: string;
}

interface FinancialClaim {
  id: string;
  claimNumber?: string;
  status?: string;
  payer?: string;
  payerName?: string;
  insurancePlanName?: string;
  providerName?: string;
  patientName?: string;
  patientFirstName?: string;
  patientLastName?: string;
  serviceDate?: string;
  createdAt?: string;
  submittedAt?: string;
  acceptedAt?: string;
  adjudicatedAt?: string;
  paidAt?: string;
  paymentDate?: string;
  updatedAt?: string;
  totalCents?: number;
  totalChargesCents?: number;
  billedAmountCents?: number;
  chargeAmountCents?: number;
  allowedCents?: number;
  allowedAmountCents?: number;
  payerExpectedCents?: number;
  expectedPayerCents?: number;
  expectedAmountCents?: number;
  paidAmountCents?: number;
  payerPaidCents?: number;
  insurancePaidCents?: number;
  patientResponsibilityCents?: number;
  balanceCents?: number;
  adjustmentCents?: number;
  denialReason?: string;
  denialCode?: string;
  appealStatus?: string;
  scrubStatus?: string;
  eraPosted?: boolean;
  reconciled?: boolean;
  charges?: Array<{
    cptCode?: string;
    code?: string;
    description?: string;
    feeCents?: number;
    totalCents?: number;
  }>;
}

interface FinancialWorkQueueItem {
  id: string;
  encounterId?: string;
  patientId?: string;
  claimId?: string;
  billId?: string;
  issueType?: string;
  severity?: string;
  status?: string;
  message?: string;
  errorDetail?: string;
  patientFirstName?: string;
  patientLastName?: string;
  claimNumber?: string;
  billNumber?: string;
  createdAt?: string;
}

interface PayerPerformanceRow {
  payerName: string;
  planNames: string[];
  claimCount: number;
  chargesCents: number;
  allowedCents: number;
  expectedPayerCents: number;
  paidCents: number;
  patientResponsibilityCents: number;
  adjustmentCents: number;
  balanceCents: number;
  ar60Cents: number;
  deniedCount: number;
  rejectedCount: number;
  cleanClaimCount: number;
  adjudicatedCount: number;
  paidClaimCount: number;
  underpaidCents: number;
  avgDaysToSubmit: number;
  avgDaysToPay: number;
  avgDaysOutstanding: number;
  cleanClaimRate: number;
  denialRate: number;
  paymentYield: number;
  adminMinutes: number;
  score: number;
  oldestOpenDays: number;
  actionLabel: string;
}

interface InsuranceWorkflowMetric {
  label: string;
  value: string;
  detail: string;
  tone: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(baseIsoDate: string, days: number): string {
  const date = new Date(`${baseIsoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function getSnapshotRange(period: SnapshotPagePeriod, startDate?: string | null, endDate?: string | null) {
  const hasExplicitRange = Boolean(startDate && endDate);
  if (hasExplicitRange) {
    return { startDate: startDate!, endDate: endDate! };
  }

  const today = toIsoDate(new Date());
  if (period === 'daily') {
    return { startDate: today, endDate: today };
  }
  if (period === 'weekly') {
    return { startDate: addDays(today, -6), endDate: today };
  }
  if (period === 'monthly') {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { startDate: toIsoDate(firstDay), endDate: today };
  }
  return { startDate: addDays(today, -29), endDate: today };
}

function parseSnapshotPeriod(rawValue: string | null): SnapshotPagePeriod {
  return rawValue === 'daily' || rawValue === 'weekly' || rawValue === 'monthly' || rawValue === 'custom'
    ? rawValue
    : 'daily';
}

function formatIsoDateForUi(isoDate: string): string {
  if (!isoDate) {
    return '--';
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function numberOrZero(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeClaimStatus(status?: string): string {
  return String(status || '').trim().toLowerCase();
}

function getClaimPayer(claim: FinancialClaim): string {
  return String(claim.payerName || claim.payer || claim.insurancePlanName || 'Unassigned Payer').trim() || 'Unassigned Payer';
}

function isInsurancePayer(payerName: string): boolean {
  const normalized = payerName.toLowerCase();
  return !['self-pay', 'self pay', 'cash pay', 'cash', 'patient pay'].includes(normalized);
}

function getClaimChargeCents(claim: FinancialClaim): number {
  return numberOrZero(claim.totalCents ?? claim.totalChargesCents ?? claim.billedAmountCents ?? claim.chargeAmountCents);
}

function getClaimAllowedCents(claim: FinancialClaim): number {
  return numberOrZero(claim.allowedCents ?? claim.allowedAmountCents ?? claim.expectedAmountCents);
}

function getClaimExpectedPayerCents(claim: FinancialClaim): number {
  const explicit = numberOrZero(claim.payerExpectedCents ?? claim.expectedPayerCents);
  if (explicit > 0) return explicit;
  const allowed = getClaimAllowedCents(claim);
  if (allowed <= 0) return 0;
  return Math.max(0, allowed - numberOrZero(claim.patientResponsibilityCents));
}

function getClaimPaidCents(claim: FinancialClaim): number {
  return numberOrZero(claim.payerPaidCents ?? claim.insurancePaidCents ?? claim.paidAmountCents);
}

function getClaimBalanceCents(claim: FinancialClaim): number {
  if (claim.balanceCents !== undefined) return numberOrZero(claim.balanceCents);
  const charges = getClaimChargeCents(claim);
  return Math.max(0, charges - getClaimPaidCents(claim) - numberOrZero(claim.patientResponsibilityCents) - numberOrZero(claim.adjustmentCents));
}

function parseClaimDate(value?: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetweenDates(start?: string, end?: string): number | null {
  const startDate = parseClaimDate(start);
  const endDate = parseClaimDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS));
}

function average(values: number[]): number {
  const validValues = values.filter((value) => Number.isFinite(value));
  return validValues.length ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length : 0;
}

function getClaimFinalizedDate(claim: FinancialClaim): string | undefined {
  return claim.paidAt || claim.paymentDate || claim.adjudicatedAt || claim.updatedAt || claim.createdAt;
}

function getClaimProcedureLabels(claim: FinancialClaim): string[] {
  if (Array.isArray(claim.charges) && claim.charges.length > 0) {
    return claim.charges
      .map((charge) => String(charge.cptCode || charge.code || charge.description || '').trim())
      .filter(Boolean);
  }
  return [];
}

function calculatePayerPerformance(
  claims: FinancialClaim[],
  bills: FinancialBill[],
  workQueueItems: FinancialWorkQueueItem[],
) {
  const insuranceClaims = claims.filter((claim) => isInsurancePayer(getClaimPayer(claim)));
  const payerGroups = new Map<string, FinancialClaim[]>();

  for (const claim of insuranceClaims) {
    const payerName = getClaimPayer(claim);
    payerGroups.set(payerName, [...(payerGroups.get(payerName) || []), claim]);
  }

  const rows: PayerPerformanceRow[] = Array.from(payerGroups.entries()).map(([payerName, payerClaims]) => {
    const adjudicatedClaims = payerClaims.filter((claim) => {
      const status = normalizeClaimStatus(claim.status);
      return !['draft', 'ready', 'submitted', 'accepted', 'pending'].includes(status);
    });
    const paidClaims = payerClaims.filter((claim) => ['paid', 'partially_paid'].includes(normalizeClaimStatus(claim.status)) || getClaimPaidCents(claim) > 0);
    const deniedClaims = payerClaims.filter((claim) => ['denied', 'appealed'].includes(normalizeClaimStatus(claim.status)));
    const rejectedClaims = payerClaims.filter((claim) => normalizeClaimStatus(claim.status) === 'rejected' || normalizeClaimStatus(claim.scrubStatus) === 'failed');
    const cleanClaims = payerClaims.filter((claim) => {
      const status = normalizeClaimStatus(claim.status);
      return ['accepted', 'paid', 'partially_paid'].includes(status) && !claim.denialReason && normalizeClaimStatus(claim.scrubStatus) !== 'failed';
    });
    const balanceCents = payerClaims.reduce((sum, claim) => sum + getClaimBalanceCents(claim), 0);
    const underpaidCents = payerClaims.reduce((sum, claim) => {
      const expectedPayerCents = getClaimExpectedPayerCents(claim);
      if (expectedPayerCents <= 0 || getClaimPaidCents(claim) <= 0) return sum;
      return sum + Math.max(0, expectedPayerCents - getClaimPaidCents(claim));
    }, 0);
    const todayIso = toIsoDate(new Date());
    const outstandingDays = payerClaims
      .filter((claim) => getClaimBalanceCents(claim) > 0)
      .map((claim) => daysBetweenDates(claim.serviceDate || claim.createdAt, todayIso) || 0);
    const ar60Cents = payerClaims.reduce((sum, claim) => {
      const age = daysBetweenDates(claim.serviceDate || claim.createdAt, todayIso) || 0;
      return age >= 60 ? sum + getClaimBalanceCents(claim) : sum;
    }, 0);
    const avgDaysToSubmit = average(
      payerClaims
        .map((claim) => daysBetweenDates(claim.serviceDate || claim.createdAt, claim.submittedAt || claim.createdAt))
        .filter((value): value is number => value !== null),
    );
    const avgDaysToPay = average(
      paidClaims
        .map((claim) => daysBetweenDates(claim.serviceDate || claim.createdAt, getClaimFinalizedDate(claim)))
        .filter((value): value is number => value !== null),
    );
    const avgDaysOutstanding = average(outstandingDays);
    const payerBills = bills.filter((bill) => String(bill.payerName || '').toLowerCase() === payerName.toLowerCase());
    const payerWorkQueueItems = workQueueItems.filter((item) =>
      payerClaims.some((claim) => claim.id === item.claimId || claim.claimNumber === item.claimNumber),
    );
    const staleClaimCount = outstandingDays.filter((days) => days >= 30).length;
    const adminMinutes =
      deniedClaims.length * 22 +
      rejectedClaims.length * 14 +
      staleClaimCount * 8 +
      payerWorkQueueItems.length * 12 +
      paidClaims.length * 2;
    const deniedAndRejected = deniedClaims.length + rejectedClaims.length;
    const denialRate = payerClaims.length ? (deniedAndRejected / payerClaims.length) * 100 : 0;
    const cleanClaimRate = payerClaims.length ? (cleanClaims.length / payerClaims.length) * 100 : 0;
    const expectedPayerCents = payerClaims.reduce((sum, claim) => sum + getClaimExpectedPayerCents(claim), 0);
    const paidCents = payerClaims.reduce((sum, claim) => sum + getClaimPaidCents(claim), 0);
    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          denialRate * 1.2 -
          Math.max(0, avgDaysToPay - 21) * 0.8 -
          Math.min(25, underpaidCents / 1000) -
          Math.min(20, ar60Cents / 2500),
      ),
    );

    let actionLabel = 'Monitor';
    if (underpaidCents > 0) actionLabel = 'Review underpayments';
    if (ar60Cents > 0) actionLabel = 'Work aged A/R';
    if (deniedAndRejected > 0) actionLabel = 'Fix denials';

    return {
      payerName,
      planNames: Array.from(new Set(payerClaims.map((claim) => String(claim.insurancePlanName || '').trim()).filter(Boolean))).slice(0, 3),
      claimCount: payerClaims.length,
      chargesCents: payerClaims.reduce((sum, claim) => sum + getClaimChargeCents(claim), 0),
      allowedCents: payerClaims.reduce((sum, claim) => sum + getClaimAllowedCents(claim), 0),
      expectedPayerCents,
      paidCents,
      patientResponsibilityCents: payerClaims.reduce((sum, claim) => sum + numberOrZero(claim.patientResponsibilityCents), 0),
      adjustmentCents: payerClaims.reduce((sum, claim) => sum + numberOrZero(claim.adjustmentCents), 0),
      balanceCents: balanceCents + payerBills.reduce((sum, bill) => sum + numberOrZero(bill.insuranceResponsibilityCents), 0),
      ar60Cents,
      deniedCount: deniedClaims.length,
      rejectedCount: rejectedClaims.length,
      cleanClaimCount: cleanClaims.length,
      adjudicatedCount: adjudicatedClaims.length,
      paidClaimCount: paidClaims.length,
      underpaidCents,
      avgDaysToSubmit,
      avgDaysToPay,
      avgDaysOutstanding,
      cleanClaimRate,
      denialRate,
      paymentYield: expectedPayerCents > 0 ? (paidCents / expectedPayerCents) * 100 : 0,
      adminMinutes,
      score,
      oldestOpenDays: outstandingDays.length ? Math.max(...outstandingDays) : 0,
      actionLabel,
    };
  }).sort((left, right) => {
    const riskDelta = (right.balanceCents + right.underpaidCents + right.ar60Cents) - (left.balanceCents + left.underpaidCents + left.ar60Cents);
    return riskDelta || right.claimCount - left.claimCount;
  });

  const paidClaims = insuranceClaims.filter((claim) => ['paid', 'partially_paid'].includes(normalizeClaimStatus(claim.status)) || getClaimPaidCents(claim) > 0);
  const deniedOrRejectedClaims = insuranceClaims.filter((claim) => ['denied', 'rejected', 'appealed'].includes(normalizeClaimStatus(claim.status)) || normalizeClaimStatus(claim.scrubStatus) === 'failed');
  const cleanClaims = insuranceClaims.filter((claim) => {
    const status = normalizeClaimStatus(claim.status);
    return ['accepted', 'paid', 'partially_paid'].includes(status) && !claim.denialReason && normalizeClaimStatus(claim.scrubStatus) !== 'failed';
  });
  const totalExpectedPayerCents = rows.reduce((sum, row) => sum + row.expectedPayerCents, 0);
  const totalPaidCents = rows.reduce((sum, row) => sum + row.paidCents, 0);
  const avgDaysToPay = average(rows.flatMap((row) => (row.paidClaimCount > 0 ? [row.avgDaysToPay] : [])));
  const summary = {
    insuranceClaimCount: insuranceClaims.length,
    payerCount: rows.length,
    insuranceARCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
    avgDaysToPay,
    cleanClaimRate: insuranceClaims.length ? (cleanClaims.length / insuranceClaims.length) * 100 : 0,
    denialRate: insuranceClaims.length ? (deniedOrRejectedClaims.length / insuranceClaims.length) * 100 : 0,
    underpaidCents: rows.reduce((sum, row) => sum + row.underpaidCents, 0),
    adminHours: rows.reduce((sum, row) => sum + row.adminMinutes, 0) / 60,
    paymentYield: totalExpectedPayerCents > 0 ? (totalPaidCents / totalExpectedPayerCents) * 100 : 0,
  };

  const workflowMetrics: InsuranceWorkflowMetric[] = [
    {
      label: 'Service to Claim',
      value: `${average(insuranceClaims.map((claim) => daysBetweenDates(claim.serviceDate || claim.createdAt, claim.submittedAt || claim.createdAt) || 0)).toFixed(1)}d`,
      detail: 'Charge lag before the payer sees the claim',
      tone: '#0f766e',
    },
    {
      label: 'Claim to Payer Decision',
      value: `${average(insuranceClaims.map((claim) => daysBetweenDates(claim.submittedAt || claim.createdAt, claim.adjudicatedAt || claim.paidAt || claim.updatedAt) || 0)).toFixed(1)}d`,
      detail: 'Average time from submission to adjudication signal',
      tone: '#1d4ed8',
    },
    {
      label: 'ERA/EFT Posted',
      value: `${paidClaims.length}/${insuranceClaims.length}`,
      detail: 'Paid claims with remittance or payment activity',
      tone: '#7c3aed',
    },
    {
      label: 'Appeal Drag',
      value: `${deniedOrRejectedClaims.length}`,
      detail: 'Denied, rejected, or appealed claims slowing cash',
      tone: '#b91c1c',
    },
  ];

  const riskyClaims = insuranceClaims
    .filter((claim) => {
      const status = normalizeClaimStatus(claim.status);
      const age = daysBetweenDates(claim.serviceDate || claim.createdAt, toIsoDate(new Date())) || 0;
      const underpaid = getClaimExpectedPayerCents(claim) > 0 && getClaimPaidCents(claim) > 0
        ? Math.max(0, getClaimExpectedPayerCents(claim) - getClaimPaidCents(claim))
        : 0;
      return ['denied', 'rejected', 'appealed'].includes(status) || age >= 30 || underpaid > 0;
    })
    .slice(0, 8);

  const cptRows = insuranceClaims.flatMap((claim) =>
    getClaimProcedureLabels(claim).map((code) => ({
      key: `${getClaimPayer(claim)}-${code}`,
      payerName: getClaimPayer(claim),
      code,
      chargesCents: getClaimChargeCents(claim),
      paidCents: getClaimPaidCents(claim),
      expectedPayerCents: getClaimExpectedPayerCents(claim),
      status: normalizeClaimStatus(claim.status),
    })),
  );
  const procedureMap = new Map<string, { payerName: string; code: string; count: number; chargesCents: number; paidCents: number; expectedPayerCents: number; deniedCount: number }>();
  for (const row of cptRows) {
    const existing = procedureMap.get(row.key) || {
      payerName: row.payerName,
      code: row.code,
      count: 0,
      chargesCents: 0,
      paidCents: 0,
      expectedPayerCents: 0,
      deniedCount: 0,
    };
    existing.count += 1;
    existing.chargesCents += row.chargesCents;
    existing.paidCents += row.paidCents;
    existing.expectedPayerCents += row.expectedPayerCents;
    existing.deniedCount += ['denied', 'rejected', 'appealed'].includes(row.status) ? 1 : 0;
    procedureMap.set(row.key, existing);
  }

  return {
    rows,
    summary,
    workflowMetrics,
    riskyClaims,
    procedureRows: Array.from(procedureMap.values())
      .sort((left, right) => right.chargesCents - left.chargesCents)
      .slice(0, 8),
  };
}

const TABS: TabConfig[] = [
  { key: 'dashboard', label: 'Overview', icon: '', description: 'Key metrics & A/R overview' },
  { key: 'snapshots', label: 'Snapshots', icon: '', description: 'Daily, weekly, monthly deep dives' },
  { key: 'insurance', label: 'Insurance', icon: '', description: 'Payer time, money & denials' },
  { key: 'bills', label: 'Bills', icon: '', description: 'Patient billing & statements' },
  { key: 'payments', label: 'Payments', icon: '', description: 'Patient payments & plans' },
  { key: 'analytics', label: 'Analytics', icon: '', description: 'Premium analytics & reports' },
  { key: 'fees', label: 'Fee Schedule', icon: '', description: 'Manage fees & contracts' },
  { key: 'statements', label: 'Statements', icon: '', description: 'Patient statements' },
  { key: 'reports', label: 'Reports', icon: '', description: 'Financial reports' },
];

export function FinancialsHub() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const initialSnapshotPeriod = parseSnapshotPeriod(searchParams.get('snapshot'));
  const initialSnapshotRange = getSnapshotRange(
    initialSnapshotPeriod,
    searchParams.get('startDate'),
    searchParams.get('endDate'),
  );
  const [snapshotPeriod, setSnapshotPeriod] = useState<SnapshotPagePeriod>(initialSnapshotPeriod);
  const [snapshotStartDate, setSnapshotStartDate] = useState(initialSnapshotRange.startDate);
  const [snapshotEndDate, setSnapshotEndDate] = useState(initialSnapshotRange.endDate);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');
  const [snapshotTrendData, setSnapshotTrendData] = useState<any[]>([]);
  const [snapshotTrendSummary, setSnapshotTrendSummary] = useState<SnapshotTrendSummary | null>(null);
  const [snapshotPaymentsSummary, setSnapshotPaymentsSummary] = useState<any>(null);
  const [snapshotARAging, setSnapshotARAging] = useState<any>(null);
  const [snapshotBillsSummary, setSnapshotBillsSummary] = useState<any>(null);
  const emptySnapshotCard = (key: SnapshotMetricCard['key'], label: string, rangeLabel: string): SnapshotMetricCard => ({
    key,
    label,
    rangeLabel,
    completedAppointments: 0,
    totalRevenueCents: 0,
    collectionsCents: 0,
    avgRevenuePerVisitCents: 0,
    benchmarkVisitsCount: 0,
    collectionRate: 0,
    standaloneRevenueCents: 0,
    revenueCategories: [],
  });

  const [snapshotMetrics, setSnapshotMetrics] = useState<DashboardSnapshotMetrics>({
    daily: emptySnapshotCard('daily', 'Daily Snapshot', 'Today'),
    weekly: emptySnapshotCard('weekly', 'Weekly Snapshot', 'Last 7 Days'),
    monthly: emptySnapshotCard('monthly', 'Monthly Snapshot', 'Month to Date'),
    sourceNote: '',
  });
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardRcmMetrics>({
    totalClinicalCollections: 0,
    netCollectionRatio: 0,
    adjustmentsWriteoffs: 0,
    daysSalesOutstanding: 0,
    firstPassClaimRate: 0,
    denialRate: 0,
    avgDaysToPay: 0,
    claimsInQueue: 0,
    pendingAppeals: 0,
  });
  const [dashboardARAging, setDashboardARAging] = useState<DashboardAraBucket[]>([]);
  const [recentBills, setRecentBills] = useState<FinancialBill[]>([]);
  const [financialClaims, setFinancialClaims] = useState<FinancialClaim[]>([]);
  const [financialWorkQueue, setFinancialWorkQueue] = useState<FinancialWorkQueueItem[]>([]);

  // Get active tab from URL, default to 'dashboard' if not specified
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const activeTab = tabFromUrl && TABS.some((tab) => tab.key === tabFromUrl)
    ? tabFromUrl
    : 'dashboard';

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format((cents || 0) / 100);

  const formatCategoryList = (categories?: RevenueCategorySummary[]) =>
    (categories || [])
      .slice(0, 3)
      .map((category) => `${category.label} ${formatCurrency(category.revenueCents)}`);

  const loadData = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = toIsoDate(new Date());
      const monthRange = getSnapshotRange('monthly');
      const [dashboard, paymentsSummary, agingSummary, claimsResponse, billsResponse, workQueueResponse] = await Promise.all([
        fetchFinancialMetrics({
          tenantId: session.tenantId,
          accessToken: session.accessToken,
        }),
        fetchPaymentsSummary(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { startDate: monthRange.startDate, endDate: monthRange.endDate },
        ),
        fetchARAging(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { asOfDate: today },
        ),
        fetchClaims(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
        ),
        fetchBills(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
        ),
        fetchFinancialWorkQueue(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
        ),
      ]);
      const snapshots = dashboard?.snapshots || {};
      const claims = Array.isArray(claimsResponse?.claims) ? claimsResponse.claims : [];
      setFinancialClaims(claims);
      setRecentBills(Array.isArray(billsResponse?.bills) ? billsResponse.bills : []);
      setFinancialWorkQueue(Array.isArray(workQueueResponse?.items) ? workQueueResponse.items : []);
      const agingBuckets = Array.isArray(agingSummary?.buckets) ? agingSummary.buckets : [];
      const totalArCents = agingBuckets.reduce((sum: number, bucket: any) => sum + Number(bucket.totalBalanceCents || 0), 0);
      const patientPaymentsTotal = Array.isArray(paymentsSummary?.patientPaymentsByMethod)
        ? paymentsSummary.patientPaymentsByMethod.reduce((sum: number, row: any) => sum + Number(row.totalCents || 0), 0)
        : 0;
      const payerPaymentsTotal = Number(paymentsSummary?.payerPaymentsSummary?.appliedCents || 0);
      const totalPaymentsCollected = payerPaymentsTotal + patientPaymentsTotal;
      const monthlyRevenue = Number(snapshots?.monthly?.totalRevenueCents || 0);
      const adjustmentsWriteoffs = Math.max(
        0,
        monthlyRevenue - totalPaymentsCollected - Number(paymentsSummary?.receivables?.outstandingBalanceCents || 0),
      );
      const adjudicatedClaims = claims.filter((claim: any) => !['draft', 'ready'].includes(String(claim.status || '')));
      const paidClaims = claims.filter((claim: any) => String(claim.status || '') === 'paid');
      const deniedClaims = claims.filter((claim: any) => ['denied', 'rejected'].includes(String(claim.status || '')));
      const avgDaysToPay = paidClaims.length
        ? paidClaims.reduce((sum: number, claim: any) => {
            const serviceDate = new Date(`${String(claim.serviceDate || claim.createdAt || today)}T00:00:00Z`).getTime();
            const paidDate = new Date(String(claim.updatedAt || claim.createdAt || `${today}T00:00:00Z`)).getTime();
            return sum + Math.max(0, Math.round((paidDate - serviceDate) / DAY_MS));
          }, 0) / paidClaims.length
        : 0;
      const dsoWeightedDays = agingBuckets.reduce((sum: number, bucket: any) => {
        const key = String(bucket.key || '');
        const midpoint = key === '0-30' ? 15 : key === '31-60' ? 45 : key === '61-90' ? 75 : key === '91-120' ? 105 : 135;
        return sum + midpoint * Number(bucket.totalBalanceCents || 0);
      }, 0);

      setDashboardMetrics({
        totalClinicalCollections: Number(snapshots?.monthly?.collectionsCents || totalPaymentsCollected),
        netCollectionRatio: Number(paymentsSummary?.calculated?.netCollectionRate || snapshots?.monthly?.collectionRate || 0),
        adjustmentsWriteoffs,
        daysSalesOutstanding: totalArCents > 0 ? Number((dsoWeightedDays / totalArCents).toFixed(1)) : 0,
        firstPassClaimRate: adjudicatedClaims.length ? Number(((paidClaims.length / adjudicatedClaims.length) * 100).toFixed(1)) : 0,
        denialRate: adjudicatedClaims.length ? Number(((deniedClaims.length / adjudicatedClaims.length) * 100).toFixed(1)) : 0,
        avgDaysToPay: Number(avgDaysToPay.toFixed(1)),
        claimsInQueue: claims.filter((claim: any) => ['draft', 'ready', 'submitted', 'accepted'].includes(String(claim.status || ''))).length,
        pendingAppeals: claims.filter((claim: any) => ['appealed', 'denied', 'rejected'].includes(String(claim.status || ''))).length,
      });

      setDashboardARAging(
        agingBuckets.map((bucket: any, index: number) => ({
          label: bucket.key === '0-30' ? 'Current' : String(bucket.label || bucket.key || ''),
          range: String(bucket.label || bucket.key || ''),
          amountCents: Number(bucket.totalBalanceCents || 0),
          count: Number(bucket.billCount || 0),
          percentage: totalArCents > 0 ? Number((((Number(bucket.totalBalanceCents || 0) / totalArCents) * 100)).toFixed(1)) : 0,
          color: ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#dc2626'][index] || '#6b7280',
        })),
      );

      setSnapshotMetrics({
        daily: {
          ...emptySnapshotCard('daily', 'Daily Snapshot', 'Today'),
          ...(snapshots.daily || {}),
        },
        weekly: {
          ...emptySnapshotCard('weekly', 'Weekly Snapshot', 'Last 7 Days'),
          ...(snapshots.weekly || {}),
        },
        monthly: {
          ...emptySnapshotCard('monthly', 'Monthly Snapshot', 'Month to Date'),
          ...(snapshots.monthly || {}),
        },
        sourceNote: snapshots.sourceNote || '',
      });
    } catch (err) {
      showError('Unable to load financial snapshot');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab !== 'snapshots') {
      return;
    }
    const parsedPeriod = parseSnapshotPeriod(searchParams.get('snapshot'));
    const parsedRange = getSnapshotRange(parsedPeriod, searchParams.get('startDate'), searchParams.get('endDate'));
    setSnapshotPeriod(parsedPeriod);
    setSnapshotStartDate(parsedRange.startDate);
    setSnapshotEndDate(parsedRange.endDate);
  }, [activeTab, searchParams]);

  const loadSnapshotBreakdown = useCallback(async (startDate: string, endDate: string) => {
    if (!session) {
      return;
    }

    setSnapshotLoading(true);
    setSnapshotError('');
    try {
      const [trendResponse, paymentsResponse, agingResponse, billsResponse] = await Promise.all([
        fetchCollectionsTrend(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { startDate, endDate, granularity: 'day' },
        ),
        fetchPaymentsSummary(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { startDate, endDate },
        ),
        fetchARAging(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { asOfDate: endDate },
        ),
        fetchBillsSummary(
          {
            tenantId: session.tenantId,
            accessToken: session.accessToken,
          },
          { startDate, endDate },
        ),
      ]);

      setSnapshotTrendData(Array.isArray(trendResponse?.data) ? trendResponse.data : []);
      setSnapshotTrendSummary((trendResponse?.summary || null) as SnapshotTrendSummary | null);
      setSnapshotPaymentsSummary(paymentsResponse || null);
      setSnapshotARAging(agingResponse || null);
      setSnapshotBillsSummary(billsResponse || null);
    } catch (error: any) {
      const message = error?.message || 'Unable to load snapshot breakdown';
      setSnapshotError(message);
      showError(message);
    } finally {
      setSnapshotLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    if (activeTab !== 'snapshots' || !snapshotStartDate || !snapshotEndDate) {
      return;
    }
    loadSnapshotBreakdown(snapshotStartDate, snapshotEndDate);
  }, [activeTab, snapshotStartDate, snapshotEndDate, loadSnapshotBreakdown]);

  // Handler to change tabs and update URL
  const handleTabChange = (tab: TabType) => {
    if (tab === 'snapshots') {
      const nextRange = getSnapshotRange(snapshotPeriod, snapshotStartDate, snapshotEndDate);
      setSearchParams({
        tab,
        snapshot: snapshotPeriod,
        startDate: nextRange.startDate,
        endDate: nextRange.endDate,
      });
      return;
    }

    if (tab === 'dashboard') {
      // Remove tab parameter for dashboard (default view)
      setSearchParams({});
      return;
    }

    setSearchParams({ tab });
  };

  const openSnapshotPage = (period: SnapshotMetricCard['key']) => {
    const nextRange = getSnapshotRange(period);
    setSearchParams({
      tab: 'snapshots',
      snapshot: period,
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
    });
  };

  const applySnapshotDateRange = () => {
    if (!snapshotStartDate || !snapshotEndDate) {
      showError('Select both a start date and end date');
      return;
    }
    if (snapshotStartDate > snapshotEndDate) {
      showError('Start date must be on or before end date');
      return;
    }
    setSearchParams({
      tab: 'snapshots',
      snapshot: snapshotPeriod,
      startDate: snapshotStartDate,
      endDate: snapshotEndDate,
    });
  };

  const handleDrillDown = (metric: string) => {
    showSuccess(`Drilling down into: ${metric}`);
    // Navigate to specific views based on metric
    if (metric === 'claims-queue') navigate('/claims');
    if (metric === 'ar-aging') handleTabChange('analytics');
  };

  const handleClaimSelect = (claimId: string) => {
    navigate(`/claims/${claimId}`);
  };

  const handlePaymentSuccess = (paymentId: string) => {
    showSuccess('Payment processed successfully!');
    loadData();
  };

  const copyBillPayLink = async (bill: FinancialBill) => {
    if (!bill.billPayCode) {
      showError('This bill does not have a bill pay code yet.');
      return;
    }

    const url = `${window.location.origin}/bill-pay?code=${encodeURIComponent(bill.billPayCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      showSuccess('Bill pay link copied.');
    } catch {
      showError(url);
    }
  };

  const handleBillAction = async (
    bill: FinancialBill,
    action: 'send_statement' | 'set_payment_plan' | 'flag_collections' | 'write_off' | 'add_note',
  ) => {
    if (!session) return;

    const actionLabels: Record<typeof action, string> = {
      send_statement: 'Statement sent',
      set_payment_plan: 'Payment plan started',
      flag_collections: 'Collections flag added',
      write_off: 'Balance written off',
      add_note: 'Billing note added',
    };

    try {
      await postBillAction(
        {
          tenantId: session.tenantId,
          accessToken: session.accessToken,
        },
        bill.id,
        {
          action,
          amountCents: action === 'write_off' ? Math.max(0, Number(bill.balanceCents || 0)) : undefined,
          note:
            action === 'send_statement'
              ? `Statement/pay link sent for bill ${bill.billNumber || bill.id}`
              : action === 'set_payment_plan'
                ? `Payment plan opened from A/R workqueue for bill ${bill.billNumber || bill.id}`
                : action === 'flag_collections'
                  ? `Collections review flag from A/R workqueue for bill ${bill.billNumber || bill.id}`
                  : action === 'write_off'
                    ? `Administrative write-off from A/R workqueue for bill ${bill.billNumber || bill.id}`
                    : `Billing note added from A/R workqueue for bill ${bill.billNumber || bill.id}`,
        },
      );
      showSuccess(actionLabels[action]);
      loadData();
    } catch (error: any) {
      showError(error?.message || 'Failed to update bill');
    }
  };

  const handleResolveFinancialWorkQueueItem = async (item: FinancialWorkQueueItem) => {
    if (!session) return;

    try {
      await resolveFinancialWorkQueueItem(
        {
          tenantId: session.tenantId,
          accessToken: session.accessToken,
        },
        item.id,
        `Billing review resolved from Financials page for ${(item.issueType || 'billing_review').replace(/_/g, ' ')}`,
      );
      showSuccess('Billing review item resolved');
      loadData();
    } catch (error: any) {
      showError(error?.message || 'Failed to resolve billing review item');
    }
  };

  const handleExportReport = (reportType: string) => {
    showSuccess(`Exporting ${reportType.toUpperCase()} report...`);
  };

  if (loading) {
    return (
      <div style={{ background: '#F3F4F6', minHeight: '100vh' }}>
        <div style={{
          background: '#111827', height: '64px', display: 'flex',
          alignItems: 'center', padding: '0 28px', gap: '12px',
        }}>
          <div style={{ width: 200, height: 28, background: 'rgba(255,255,255,0.1)', borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <div style={{ width: 280, background: '#fff', borderRight: '1px solid #E5E7EB', flexShrink: 0 }}>
            <Skeleton variant="card" height={500} />
          </div>
          <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
            <Skeleton variant="card" height={600} />
          </div>
        </div>
      </div>
    );
  }

  const snapshotCards = [snapshotMetrics.daily, snapshotMetrics.weekly, snapshotMetrics.monthly];
  const snapshotPeriodLabels: Record<SnapshotPagePeriod, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom',
  };
  const snapshotSummary: SnapshotTrendSummary =
    snapshotTrendSummary ||
    {
      totalPaymentsCollectedCents: 0,
      totalRevenueEarnedCents: 0,
      totalPatientPaymentsCents: 0,
      totalPayerPaymentsCents: 0,
      totalPaymentCount: 0,
      totalBillCount: 0,
      dayCount: 0,
      avgDailyPaymentsCollectedCents: 0,
      avgDailyRevenueEarnedCents: 0,
      collectionRate: 0,
    };
  const snapshotCalculated = snapshotPaymentsSummary?.calculated || {};
  const snapshotReceivables = snapshotPaymentsSummary?.receivables || {};
  const snapshotPayerSummary = snapshotPaymentsSummary?.payerPaymentsSummary || {};
  const openBills = recentBills.filter((bill) => !['paid', 'written_off', 'cancelled'].includes(String(bill.status || '')));
  const overdueBills = openBills.filter((bill) => {
    if (!bill.dueDate) return false;
    return bill.dueDate < toIsoDate(new Date()) && (bill.balanceCents || 0) > 0;
  });
  const getDaysPastDue = (bill: FinancialBill) => {
    const agingDate = (bill.dueDate || bill.billDate || '').slice(0, 10);
    if (!agingDate) return 0;
    const due = new Date(`${agingDate}T00:00:00Z`);
    const today = new Date(`${toIsoDate(new Date())}T00:00:00Z`);
    if (Number.isNaN(due.getTime())) return 0;
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
  };
  const getAgingBucketKey = (bill: FinancialBill) => {
    const days = getDaysPastDue(bill);
    if (days <= 0) return 'current';
    if (days <= 30) return '30';
    if (days <= 60) return '60';
    if (days <= 90) return '90';
    return '90Plus';
  };
  const agingBucketConfig = [
    { key: 'current', label: 'Current', tone: '#0f766e', bg: '#ecfdf5', border: '#99f6e4' },
    { key: '30', label: '1-30 days', tone: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    { key: '60', label: '31-60 days', tone: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    { key: '90', label: '61-90 days', tone: '#b45309', bg: '#fff7ed', border: '#fed7aa' },
    { key: '90Plus', label: '90+ days', tone: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  ];
  const agingBuckets = agingBucketConfig.map((bucket) => {
    const bucketBills = openBills.filter((bill) => (bill.balanceCents || 0) > 0 && getAgingBucketKey(bill) === bucket.key);
    return {
      ...bucket,
      count: bucketBills.length,
      amountCents: bucketBills.reduce((sum, bill) => sum + Number(bill.balanceCents || 0), 0),
    };
  });
  const paidBills = recentBills.filter((bill) => String(bill.status || '') === 'paid');
  const outstandingBillCents = openBills.reduce((sum, bill) => sum + Number(bill.balanceCents || 0), 0);
  const overdueBillCents = overdueBills.reduce((sum, bill) => sum + Number(bill.balanceCents || 0), 0);
  const paidBillCents = paidBills.reduce((sum, bill) => sum + Number(bill.paidAmountCents || 0), 0);
  const formatBillDate = (date?: string) => {
    if (!date) return '--';
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  const formatPercent = (value: number) => `${Number(value || 0).toFixed(1)}%`;
  const insuranceAnalytics = calculatePayerPerformance(financialClaims, recentBills, financialWorkQueue);

  // ─── Tab label map for sidebar ───────────────────────────────────────────
  const tabIcons: Record<TabType, string> = {
    dashboard: '◈', snapshots: '◉', insurance: '◇', bills: '◧', payments: '◨',
    analytics: '◎', fees: '◫', statements: '◪', reports: '◩',
  };

  return (
    <div style={{ background: '#F3F4F6', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#111827',
        height: '64px',
        display: 'flex', alignItems: 'center',
        padding: '0 24px',
        justifyContent: 'space-between',
        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '10px',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', color: 'white', fontWeight: 800,
          }}>$</div>
          <h1 style={{
            fontSize: '1.15rem', fontWeight: 700, color: '#F9FAFB',
            letterSpacing: '-0.01em', margin: 0,
          }}>
            Financial Management
          </h1>
          <span style={{
            padding: '3px 10px',
            background: 'rgba(5,150,105,0.25)',
            color: '#34d399',
            borderRadius: '20px',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            Premium
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => showSuccess('Quick actions menu opened')}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.08)',
              color: '#E5E7EB',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontWeight: 600, fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Quick Actions
          </button>
          <button
            onClick={() => handleTabChange('reports')}
            style={{
              padding: '8px 18px',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700, fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(5,150,105,0.4)',
            }}
          >
            Generate Report
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ───────────────────────────────────────── */}
      {/* KEY FIX: overflow:hidden here prevents background bleed-through */}
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: sidebarCollapsed ? 64 : 280,
          background: '#FFFFFF',
          borderRight: '1px solid #E5E7EB',
          height: '100%',
          overflowY: 'auto',   /* independent scroll — no background bleed */
          overflowX: 'hidden', /* clip any card overflow */
          flexShrink: 0,
          transition: 'width 0.3s ease',
        }}>
          <div style={{ padding: '12px 10px 0' }}>
            {/* Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                width: '100%', padding: '8px',
                background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderRadius: '8px', cursor: 'pointer',
                marginBottom: '10px', display: 'flex', justifyContent: 'center',
                color: '#6B7280', fontSize: '0.8rem', fontWeight: 700,
              }}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>

            {/* Navigation Items */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    title={sidebarCollapsed ? tab.label : undefined}
                    style={{
                      padding: sidebarCollapsed ? '10px' : '9px 12px',
                      background: isActive ? '#F0FDF4' : 'transparent',
                      border: 'none',
                      borderLeft: `3px solid ${isActive ? '#059669' : 'transparent'}`,
                      borderRadius: isActive ? '0 8px 8px 0' : '0 8px 8px 0',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      fontSize: '0.9rem',
                      color: isActive ? '#059669' : '#9CA3AF',
                      flexShrink: 0,
                    }}>
                      {tabIcons[tab.key]}
                    </span>
                    {!sidebarCollapsed && (
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          color: isActive ? '#059669' : '#374151',
                          fontSize: '0.88rem',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {tab.label}
                        </div>
                        <div style={{
                          fontSize: '0.72rem',
                          color: '#9CA3AF',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {tab.description}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Revenue Snapshots in Sidebar */}
            {!sidebarCollapsed && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#F8FFF9',
                borderRadius: '12px',
                border: '1px solid #D1FAE5',
              }}>
                <div style={{ fontSize: '0.88rem', color: '#166534', marginBottom: '0.85rem', fontWeight: '800', letterSpacing: '0.01em' }}>
                  Revenue Snapshots
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {snapshotCards.map((card) => (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => openSnapshotPage(card.key)}
                      style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #E5E7EB',
                        padding: '12px',
                        textAlign: 'left',
                        width: '100%',
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        overflow: 'hidden', /* ← KEY FIX: clip any content overflow */
                        display: 'block',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {card.label}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.18rem' }}>
                            {card.rangeLabel}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>
                            Revenue
                          </div>
                          <div style={{ fontSize: '1.35rem', lineHeight: 1.1, fontWeight: 900, color: '#166534', marginTop: '0.12rem' }}>
                            {formatCurrency(card.totalRevenueCents)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                        <div style={{
                          padding: '0.3rem 0.58rem',
                          borderRadius: '999px',
                          background: '#ecfdf5',
                          color: '#166534',
                          fontSize: '0.72rem',
                          fontWeight: '800',
                        }}>
                          {card.completedAppointments} visits
                        </div>
                        {card.standaloneRevenueCents > 0 ? (
                          <div style={{
                            padding: '0.3rem 0.58rem',
                            borderRadius: '999px',
                            background: '#fffbeb',
                            color: '#92400e',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                          }}>
                            Fees/Other {formatCurrency(card.standaloneRevenueCents)}
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          marginTop: '0.85rem',
                          borderRadius: '14px',
                          background: '#f8fafc',
                          border: '1px solid #e5e7eb',
                          padding: '0.7rem 0.8rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.55rem',
                        }}
                      >
                        {[
                          { label: 'Collections', value: formatCurrency(card.collectionsCents), tone: '#1d4ed8' },
                          { label: 'Avg / Visit', value: formatCurrency(card.avgRevenuePerVisitCents), tone: '#374151' },
                          { label: 'Collection Rate', value: `${card.collectionRate.toFixed(1)}%`, tone: card.collectionRate >= 90 ? '#059669' : '#374151' },
                          { label: 'Benchmarked Visits', value: `${card.benchmarkVisitsCount}`, tone: '#065f46' },
                        ].map((metric, index) => (
                          <div
                            key={`${card.key}-${metric.label}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '0.75rem',
                              paddingBottom: index === 3 ? 0 : '0.5rem',
                              borderBottom: index === 3 ? 'none' : '1px solid #e5e7eb',
                            }}
                          >
                            <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 700 }}>
                              {metric.label}
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: metric.tone, textAlign: 'right' }}>
                              {metric.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      {card.revenueCategories.length > 0 ? (
                        <div style={{ marginTop: '0.8rem' }}>
                          <div style={{ fontSize: '0.68rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.35rem' }}>
                            Revenue Mix
                          </div>
                          <div
                            style={{
                              borderRadius: '12px',
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              padding: '0.45rem 0.65rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.42rem',
                            }}
                          >
                            {card.revenueCategories.slice(0, 3).map((category, index) => (
                              <div
                                key={`${card.key}-${category.key}`}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  paddingBottom: index === Math.min(card.revenueCategories.slice(0, 3).length - 1, 2) ? 0 : '0.42rem',
                                  borderBottom: index === Math.min(card.revenueCategories.slice(0, 3).length - 1, 2) ? 'none' : '1px solid #d1fae5',
                                  color: '#166534',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                }}
                              >
                                <span style={{ minWidth: 0 }}>{category.label}</span>
                                <span style={{ color: '#065f46', flexShrink: 0 }}>{formatCurrency(category.revenueCents)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {card.benchmarkVisitsCount > 0 ? (
                        <div style={{ fontSize: '0.72rem', color: '#166534', lineHeight: 1.45, marginTop: '0.75rem' }}>
                          {card.benchmarkVisitsCount} visit{card.benchmarkVisitsCount === 1 ? '' : 's'} used a CMS benchmark because no charges were posted yet.
                        </div>
                      ) : null}
                      {card.completedAppointments === 0 && card.totalRevenueCents === 0 ? (
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0.72rem' }}>
                          No posted revenue in this snapshot yet.
                        </div>
                      ) : null}
                      <div style={{ marginTop: '0.7rem', fontSize: '0.75rem', color: '#059669', fontWeight: 700 }}>
                        Open breakdown
                      </div>
                    </button>
                  ))}
                </div>
                {snapshotMetrics.sourceNote ? (
                  <div style={{ fontSize: '0.72rem', color: '#166534', lineHeight: 1.45, marginTop: '0.75rem' }}>
                    {snapshotMetrics.sourceNote}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{
          flex: 1,
          height: '100%',
          overflowY: 'auto',  /* independent scroll — no background bleed */
          background: '#F3F4F6',
          padding: '20px',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            minHeight: 'calc(100% - 40px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
          }}>
            {/* Dashboard Tab (Overview) */}
            {activeTab === 'dashboard' && (
              <RCMDashboard
                metrics={dashboardMetrics}
                arAging={dashboardARAging}
                onDrillDown={handleDrillDown}
              />
            )}

            {/* Snapshots Tab */}
            {activeTab === 'snapshots' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                      Snapshot Breakdown
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      Open daily, weekly, monthly, or custom financial detail pages.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['daily', 'weekly', 'monthly', 'custom'] as SnapshotPagePeriod[]).map((periodKey) => (
                      <button
                        key={periodKey}
                        type="button"
                        onClick={() => {
                          if (periodKey === 'custom') {
                            setSnapshotPeriod('custom');
                            return;
                          }
                          const nextRange = getSnapshotRange(periodKey);
                          setSearchParams({
                            tab: 'snapshots',
                            snapshot: periodKey,
                            startDate: nextRange.startDate,
                            endDate: nextRange.endDate,
                          });
                        }}
                        style={{
                          padding: '0.55rem 0.85rem',
                          borderRadius: '8px',
                          border: snapshotPeriod === periodKey ? '2px solid #10b981' : '1px solid #d1d5db',
                          background: snapshotPeriod === periodKey ? '#ecfdf5' : '#ffffff',
                          color: snapshotPeriod === periodKey ? '#065f46' : '#374151',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {snapshotPeriodLabels[periodKey]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  border: '1px solid #d1fae5',
                  borderRadius: '12px',
                  background: '#f0fdf4',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div style={{ minWidth: '170px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="snapshot-start-date" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        Start Date
                      </label>
                      <input
                        id="snapshot-start-date"
                        type="date"
                        value={snapshotStartDate}
                        onChange={(event) => {
                          setSnapshotPeriod('custom');
                          setSnapshotStartDate(event.target.value);
                        }}
                        style={{
                          padding: '0.55rem 0.65rem',
                          borderRadius: '8px',
                          border: '1px solid #a7f3d0',
                          background: '#ffffff',
                        }}
                      />
                    </div>

                    <div style={{ minWidth: '170px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label htmlFor="snapshot-end-date" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        End Date
                      </label>
                      <input
                        id="snapshot-end-date"
                        type="date"
                        value={snapshotEndDate}
                        onChange={(event) => {
                          setSnapshotPeriod('custom');
                          setSnapshotEndDate(event.target.value);
                        }}
                        style={{
                          padding: '0.55rem 0.65rem',
                          borderRadius: '8px',
                          border: '1px solid #a7f3d0',
                          background: '#ffffff',
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={applySnapshotDateRange}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#059669',
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Apply Range
                    </button>
                  </div>
                  <div style={{ marginTop: '0.65rem', fontSize: '0.82rem', color: '#065f46' }}>
                    Viewing {snapshotPeriodLabels[snapshotPeriod]} page for {formatIsoDateForUi(snapshotStartDate)} to {formatIsoDateForUi(snapshotEndDate)}.
                  </div>
                </div>

                {snapshotLoading ? (
                  <Skeleton variant="card" height={280} />
                ) : snapshotError ? (
                  <div style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#991b1b',
                    padding: '0.9rem 1rem',
                    borderRadius: '10px',
                  }}>
                    {snapshotError}
                  </div>
                ) : (
                  <>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.9rem',
                      marginBottom: '1.25rem',
                    }}>
                      {[
                        { label: 'Revenue Earned', value: formatCurrency(snapshotSummary.totalRevenueEarnedCents), color: '#166534' },
                        { label: 'Payments Collected', value: formatCurrency(snapshotSummary.totalPaymentsCollectedCents), color: '#1d4ed8' },
                        { label: 'Patient Payments', value: formatCurrency(snapshotSummary.totalPatientPaymentsCents), color: '#7c3aed' },
                        { label: 'Payer Payments', value: formatCurrency(snapshotSummary.totalPayerPaymentsCents), color: '#0f766e' },
                        { label: 'Net Collection Rate', value: Number(snapshotCalculated.netCollectionRate || snapshotSummary.collectionRate || 0).toFixed(1) + '%', color: '#92400e' },
                        { label: 'Outstanding A/R', value: formatCurrency(Number(snapshotReceivables.outstandingBalanceCents || 0)), color: '#991b1b' },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            padding: '0.9rem',
                          }}
                        >
                          <div style={{ fontSize: '0.76rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>
                            {item.label}
                          </div>
                          <div style={{ marginTop: '0.4rem', fontSize: '1.15rem', fontWeight: 800, color: item.color }}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '1rem',
                      marginBottom: '1rem',
                    }}>
                      <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>
                        Revenue Categories
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#6b7280', marginBottom: '0.85rem' }}>
                        What made up this snapshot range.
                      </div>
                      {(snapshotSummary.revenueCategories || []).length === 0 ? (
                        <div style={{ fontSize: '0.84rem', color: '#6b7280' }}>
                          No categorized revenue found for this range.
                        </div>
                      ) : (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '0.75rem',
                        }}>
                          {(snapshotSummary.revenueCategories || []).map((category) => (
                            <div
                              key={`summary-category-${category.key}`}
                              style={{
                                borderRadius: '12px',
                                border: '1px solid #d1fae5',
                                background: '#f8fafc',
                                padding: '0.85rem',
                              }}
                            >
                              <div style={{ fontSize: '0.74rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>
                                {category.label}
                              </div>
                              <div style={{ marginTop: '0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#166534' }}>
                                {formatCurrency(category.revenueCents)}
                              </div>
                              <div style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: '#6b7280' }}>
                                {category.itemCount} item{category.itemCount === 1 ? '' : 's'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      marginBottom: '1rem',
                      overflowX: 'auto',
                    }}>
                      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700, color: '#111827' }}>
                        Revenue and Collections by Day
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '0.65rem', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Revenue</th>
                            <th style={{ padding: '0.65rem', textAlign: 'left' }}>Categories</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Payments</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Patient</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Payer</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Bills</th>
                            <th style={{ padding: '0.65rem', textAlign: 'right' }}>Payment Events</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(snapshotTrendData || []).length === 0 ? (
                            <tr>
                              <td colSpan={8} style={{ padding: '0.85rem', textAlign: 'center', color: '#6b7280' }}>
                                No trend data found for this range.
                              </td>
                            </tr>
                          ) : (
                            (snapshotTrendData || []).map((point: any) => (
                              <tr key={point.bucketStartDate} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '0.65rem' }}>
                                  {formatIsoDateForUi(point.bucketStartDate)}
                                </td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{formatCurrency(Number(point.revenueEarnedCents || 0))}</td>
                                <td style={{ padding: '0.65rem' }}>
                                  {(point.revenueCategories || []).length === 0 ? (
                                    <span style={{ color: '#9ca3af' }}>--</span>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                      {(point.revenueCategories || []).slice(0, 3).map((category: RevenueCategorySummary) => (
                                        <span
                                          key={`${point.bucketStartDate}-${category.key}`}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.28rem',
                                            padding: '0.2rem 0.45rem',
                                            borderRadius: '999px',
                                            background: '#f0fdf4',
                                            border: '1px solid #bbf7d0',
                                            color: '#166534',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                          }}
                                        >
                                          <span>{category.label}</span>
                                          <span>{formatCurrency(category.revenueCents)}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{formatCurrency(Number(point.paymentsCollectedCents || 0))}</td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{formatCurrency(Number(point.patientPaymentsCents || 0))}</td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{formatCurrency(Number(point.payerPaymentsCents || 0))}</td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{Number(point.billCount || 0)}</td>
                                <td style={{ padding: '0.65rem', textAlign: 'right' }}>{Number(point.paymentCount || 0)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                      gap: '1rem',
                    }}>
                      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                          Patient Payments by Method
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ padding: '0.55rem', textAlign: 'left' }}>Method</th>
                              <th style={{ padding: '0.55rem', textAlign: 'right' }}>Count</th>
                              <th style={{ padding: '0.55rem', textAlign: 'right' }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {((snapshotPaymentsSummary?.patientPaymentsByMethod || []) as any[]).length === 0 ? (
                              <tr>
                                <td colSpan={3} style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280' }}>No data</td>
                              </tr>
                            ) : (
                              ((snapshotPaymentsSummary?.patientPaymentsByMethod || []) as any[]).map((row) => (
                                <tr key={String(row.paymentMethod)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '0.55rem' }}>{String(row.paymentMethod || '--')}</td>
                                  <td style={{ padding: '0.55rem', textAlign: 'right' }}>{Number(row.count || 0)}</td>
                                  <td style={{ padding: '0.55rem', textAlign: 'right' }}>{formatCurrency(Number(row.totalCents || 0))}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                          Bills Status and A/R Aging
                        </div>
                        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.82rem', color: '#374151' }}>
                          Overdue A/R: {formatCurrency(Number(snapshotReceivables.overdueBalanceCents || 0))} · Overdue Bills: {Number(snapshotReceivables.overdueCount || 0)}
                          <br />
                          Payer Applied: {formatCurrency(Number(snapshotPayerSummary.appliedCents || 0))} · Unapplied: {formatCurrency(Number(snapshotPayerSummary.unappliedCents || 0))}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ padding: '0.55rem', textAlign: 'left' }}>Bucket / Status</th>
                              <th style={{ padding: '0.55rem', textAlign: 'right' }}>Count</th>
                              <th style={{ padding: '0.55rem', textAlign: 'right' }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {((snapshotARAging?.buckets || []) as any[]).map((bucket) => (
                              <tr key={`aging-${String(bucket.key)}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '0.55rem' }}>A/R {String(bucket.label || bucket.key)}</td>
                                <td style={{ padding: '0.55rem', textAlign: 'right' }}>{Number(bucket.billCount || 0)}</td>
                                <td style={{ padding: '0.55rem', textAlign: 'right' }}>{formatCurrency(Number(bucket.totalBalanceCents || 0))}</td>
                              </tr>
                            ))}
                            {((snapshotBillsSummary?.billsByStatus || []) as any[]).map((row) => (
                              <tr key={`status-${String(row.status)}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '0.55rem' }}>Bill Status: {String(row.status || '--')}</td>
                                <td style={{ padding: '0.55rem', textAlign: 'right' }}>{Number(row.count || 0)}</td>
                                <td style={{ padding: '0.55rem', textAlign: 'right' }}>{formatCurrency(Number(row.totalChargesCents || 0))}</td>
                              </tr>
                            ))}
                            {((snapshotARAging?.buckets || []) as any[]).length === 0 && ((snapshotBillsSummary?.billsByStatus || []) as any[]).length === 0 ? (
                              <tr>
                                <td colSpan={3} style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280' }}>No breakdown data</td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Insurance Analytics Tab */}
            {activeTab === 'insurance' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', marginBottom: '0.25rem' }}>
                      Insurance Analytics
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.92rem', maxWidth: '760px', lineHeight: 1.5 }}>
                      Payer time, money, denials, underpayments, and staff work tied to the same claims, bills, and clearinghouse data used by the rest of Financials.
                    </p>
                  </div>
                  <div style={{
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    borderRadius: '999px',
                    padding: '0.42rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}>
                    {insuranceAnalytics.summary.payerCount} payers · {insuranceAnalytics.summary.insuranceClaimCount} insurance claims
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.9rem',
                  marginBottom: '1.25rem',
                }}>
                  {[
                    { label: 'Insurance A/R', value: formatCurrency(insuranceAnalytics.summary.insuranceARCents), detail: 'Open payer-side balances', tone: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
                    { label: 'Avg Days to Pay', value: `${insuranceAnalytics.summary.avgDaysToPay.toFixed(1)}d`, detail: 'Service date to payer payment', tone: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
                    { label: 'Clean Claim Rate', value: formatPercent(insuranceAnalytics.summary.cleanClaimRate), detail: 'Accepted or paid without denial', tone: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
                    { label: 'Denial Rate', value: formatPercent(insuranceAnalytics.summary.denialRate), detail: 'Denied, rejected, or appealed', tone: '#b91c1c', bg: '#fff1f2', border: '#fecdd3' },
                    { label: 'Underpayment Leakage', value: formatCurrency(insuranceAnalytics.summary.underpaidCents), detail: 'Expected payer minus paid', tone: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Staff Time Estimate', value: `${insuranceAnalytics.summary.adminHours.toFixed(1)}h`, detail: 'Billing work created by payer friction', tone: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
                  ].map((card) => (
                    <div
                      key={card.label}
                      style={{
                        background: card.bg,
                        border: `1px solid ${card.border}`,
                        borderRadius: '14px',
                        padding: '1rem',
                        minHeight: '116px',
                      }}
                    >
                      <div style={{ fontSize: '0.73rem', color: card.tone, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.05em' }}>
                        {card.label}
                      </div>
                      <div style={{ marginTop: '0.38rem', fontSize: '1.55rem', lineHeight: 1.05, fontWeight: 900, color: '#111827' }}>
                        {card.value}
                      </div>
                      <div style={{ marginTop: '0.45rem', color: '#6b7280', fontSize: '0.82rem', lineHeight: 1.35 }}>
                        {card.detail}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                        Payer Time & Money
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.84rem' }}>
                        Lifecycle timing shows where insurance cash slows down before it reaches the practice.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/claims')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #bfdbfe',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Open Claims
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    {insuranceAnalytics.workflowMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '12px',
                          padding: '0.85rem',
                          background: '#f8fafc',
                        }}
                      >
                        <div style={{ fontSize: '0.76rem', color: '#6b7280', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {metric.label}
                        </div>
                        <div style={{ color: metric.tone, fontSize: '1.35rem', fontWeight: 900, marginTop: '0.25rem' }}>
                          {metric.value}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.82rem', lineHeight: 1.35, marginTop: '0.25rem' }}>
                          {metric.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  overflowX: 'auto',
                  marginBottom: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                }}>
                  <div style={{ padding: '1rem 1rem 0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                      Payer Performance Scorecard
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.84rem' }}>
                      Ranked by cash risk, underpayments, aged A/R, and denial friction.
                    </p>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '1120px' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '0.7rem', textAlign: 'left' }}>Payer</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Claims</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Charges</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Expected</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Paid</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Balance</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Avg Pay</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Clean</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Denied</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Underpaid</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right' }}>Staff</th>
                        <th style={{ padding: '0.7rem', textAlign: 'left' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insuranceAnalytics.rows.length === 0 ? (
                        <tr>
                          <td colSpan={12} style={{ padding: '1.2rem', textAlign: 'center', color: '#6b7280' }}>
                            No insurance claims found yet. Submitted payer claims will appear here automatically.
                          </td>
                        </tr>
                      ) : (
                        insuranceAnalytics.rows.map((row) => (
                          <tr key={row.payerName} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.75rem', minWidth: '210px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: '10px',
                                  background: row.score >= 85 ? '#ecfdf5' : row.score >= 70 ? '#fffbeb' : '#fef2f2',
                                  border: `1px solid ${row.score >= 85 ? '#a7f3d0' : row.score >= 70 ? '#fde68a' : '#fecaca'}`,
                                  color: row.score >= 85 ? '#047857' : row.score >= 70 ? '#92400e' : '#b91c1c',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 900,
                                }}>
                                  {Math.round(row.score)}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 800, color: '#111827' }}>{row.payerName}</div>
                                  <div style={{ color: '#6b7280', fontSize: '0.76rem', marginTop: '0.15rem' }}>
                                    {row.planNames.length ? row.planNames.join(', ') : 'No plan name on file'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>{row.claimCount}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(row.chargesCents)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(row.expectedPayerCents || row.allowedCents)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: '#047857', fontWeight: 800 }}>{formatCurrency(row.paidCents)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: row.balanceCents > 0 ? '#991b1b' : '#047857', fontWeight: 800 }}>
                              {formatCurrency(row.balanceCents)}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{row.avgDaysToPay.toFixed(1)}d</td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: row.cleanClaimRate >= 85 ? '#047857' : '#92400e', fontWeight: 800 }}>
                              {formatPercent(row.cleanClaimRate)}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: row.denialRate > 10 ? '#b91c1c' : '#374151', fontWeight: 800 }}>
                              {formatPercent(row.denialRate)}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right', color: row.underpaidCents > 0 ? '#92400e' : '#047857', fontWeight: 800 }}>
                              {formatCurrency(row.underpaidCents)}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>{(row.adminMinutes / 60).toFixed(1)}h</td>
                            <td style={{ padding: '0.75rem' }}>
                              <span style={{
                                display: 'inline-flex',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '999px',
                                background: row.actionLabel === 'Monitor' ? '#f3f4f6' : '#fff7ed',
                                color: row.actionLabel === 'Monitor' ? '#374151' : '#c2410c',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                              }}>
                                {row.actionLabel}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(320px, 1fr)',
                  gap: '1rem',
                  alignItems: 'start',
                }}>
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '16px',
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                        Denial & Underpayment Watchlist
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.84rem' }}>
                        Claims that need billing attention because of age, payer denial, or payment variance.
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {insuranceAnalytics.riskyClaims.length === 0 ? (
                        <div style={{ padding: '1rem', color: '#6b7280', fontSize: '0.86rem' }}>
                          No aged, denied, rejected, or underpaid insurance claims in the current claim set.
                        </div>
                      ) : (
                        insuranceAnalytics.riskyClaims.map((claim) => {
                          const expected = getClaimExpectedPayerCents(claim);
                          const paid = getClaimPaidCents(claim);
                          const underpaid = expected > 0 && paid > 0 ? Math.max(0, expected - paid) : 0;
                          const age = daysBetweenDates(claim.serviceDate || claim.createdAt, toIsoDate(new Date())) || 0;
                          return (
                            <div
                              key={claim.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1.3fr 0.9fr 0.8fr',
                                gap: '0.85rem',
                                padding: '0.85rem 1rem',
                                borderBottom: '1px solid #f3f4f6',
                                alignItems: 'center',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800, color: '#111827' }}>{claim.claimNumber || claim.id}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: '0.12rem' }}>
                                  {getClaimPayer(claim)} · {claim.patientName || [claim.patientFirstName, claim.patientLastName].filter(Boolean).join(' ') || 'Unknown patient'}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.76rem', color: '#6b7280', fontWeight: 800, textTransform: 'uppercase' }}>
                                  Reason
                                </div>
                                <div style={{ color: '#374151', fontSize: '0.82rem', marginTop: '0.12rem' }}>
                                  {claim.denialReason || (underpaid > 0 ? `Underpaid ${formatCurrency(underpaid)}` : `${age} days open`)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 900, color: getClaimBalanceCents(claim) > 0 ? '#991b1b' : '#047857' }}>
                                  {formatCurrency(getClaimBalanceCents(claim))}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#6b7280', marginTop: '0.12rem', textTransform: 'capitalize' }}>
                                  {normalizeClaimStatus(claim.status) || 'unknown'}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '16px',
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                        Procedure Reimbursement
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.84rem' }}>
                        CPT-level payer signals for dermatology procedures when charge detail is available.
                      </p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '0.65rem', textAlign: 'left' }}>Payer / CPT</th>
                          <th style={{ padding: '0.65rem', textAlign: 'right' }}>Claims</th>
                          <th style={{ padding: '0.65rem', textAlign: 'right' }}>Paid</th>
                          <th style={{ padding: '0.65rem', textAlign: 'right' }}>Denied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insuranceAnalytics.procedureRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ padding: '1rem', color: '#6b7280', textAlign: 'center' }}>
                              No procedure-level charge detail found yet.
                            </td>
                          </tr>
                        ) : (
                          insuranceAnalytics.procedureRows.map((row) => (
                            <tr key={`${row.payerName}-${row.code}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '0.65rem' }}>
                                <div style={{ fontWeight: 800, color: '#111827' }}>{row.code}</div>
                                <div style={{ color: '#6b7280', fontSize: '0.76rem' }}>{row.payerName}</div>
                              </td>
                              <td style={{ padding: '0.65rem', textAlign: 'right' }}>{row.count}</td>
                              <td style={{ padding: '0.65rem', textAlign: 'right', color: '#047857', fontWeight: 800 }}>{formatCurrency(row.paidCents)}</td>
                              <td style={{ padding: '0.65rem', textAlign: 'right', color: row.deniedCount > 0 ? '#b91c1c' : '#374151', fontWeight: 800 }}>
                                {row.deniedCount}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Bills Tab */}

            {activeTab === 'bills' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '2rem',
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                      Patient Bills
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      View and manage patient billing
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button style={{
                      padding: '0.75rem 1.25rem',
                      background: 'white',
                      color: '#374151',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}>
                      Export
                    </button>
                    <button style={{
                      padding: '0.75rem 1.25rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}>
                      Create Bill
                    </button>
                  </div>
                </div>

                <div style={{
                  background: financialWorkQueue.length > 0 ? '#fff7ed' : '#f8fafc',
                  border: financialWorkQueue.length > 0 ? '2px solid #fed7aa' : '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  marginBottom: '2rem',
                  boxShadow: financialWorkQueue.length > 0 ? '0 10px 24px rgba(234, 88, 12, 0.08)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: financialWorkQueue.length > 0 ? '1rem' : 0 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                        Billing Review Queue
                      </h3>
                      <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Encounters that completed but need billing staff to review claim or bill posting.
                      </p>
                    </div>
                    <span style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '999px',
                      background: financialWorkQueue.length > 0 ? '#ffedd5' : '#ecfdf5',
                      color: financialWorkQueue.length > 0 ? '#9a3412' : '#047857',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}>
                      {financialWorkQueue.length} open
                    </span>
                  </div>

                  {financialWorkQueue.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {financialWorkQueue.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 2fr auto',
                            gap: '1rem',
                            alignItems: 'center',
                            background: 'white',
                            border: '1px solid #fed7aa',
                            borderRadius: '12px',
                            padding: '0.9rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, color: '#111827' }}>
                              {[item.patientFirstName, item.patientLastName].filter(Boolean).join(' ') || 'Unknown patient'}
                            </div>
                            <div style={{ color: '#9a3412', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {(item.issueType || 'billing_review').replace(/_/g, ' ')}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#374151', fontSize: '0.9rem', fontWeight: 600 }}>
                              {item.message || 'Financial posting needs review.'}
                            </div>
                            {item.errorDetail && (
                              <div style={{ color: '#7c2d12', fontSize: '0.78rem', marginTop: '0.25rem' }}>
                                {item.errorDetail}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {item.patientId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/patients/${item.patientId}`)}
                                style={{
                                  padding: '0.4rem 0.65rem',
                                  background: '#f8fafc',
                                  color: '#334155',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                              >
                                Patient
                              </button>
                            )}
                            {item.encounterId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/encounters/${item.encounterId}`)}
                                style={{
                                  padding: '0.4rem 0.65rem',
                                  background: '#fff7ed',
                                  color: '#c2410c',
                                  border: '1px solid #fed7aa',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                }}
                              >
                                Encounter
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleResolveFinancialWorkQueueItem(item)}
                              style={{
                                padding: '0.4rem 0.65rem',
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontWeight: 800,
                              }}
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bill Summary Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.5rem',
                  marginBottom: '2rem',
                }}>
                  <div style={{
                    background: '#f0fdf4',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #bbf7d0',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
                      Outstanding
                    </h3>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#059669' }}>
                      {formatCurrency(outstandingBillCents)}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      {openBills.length} bills pending patient or payer payment
                    </p>
                  </div>
                  <div style={{
                    background: '#fef3c7',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #fde68a',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                      Overdue
                    </h3>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b' }}>
                      {formatCurrency(overdueBillCents)}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      {overdueBills.length} bills overdue
                    </p>
                  </div>
                  <div style={{
                    background: '#f0f9ff',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #bae6fd',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#0369a1', marginBottom: '0.5rem' }}>
                      Paid This Month
                    </h3>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0ea5e9' }}>
                      {formatCurrency(paidBillCents)}
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      {paidBills.length} bills paid
                    </p>
                  </div>
                </div>

                {/* A/R Aging Buckets */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  marginBottom: '2rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
                        Patient A/R Aging
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Open balances grouped by days past due. Public bill-pay payments update these buckets automatically.
                      </p>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      As of {formatIsoDateForUi(toIsoDate(new Date()))}
                    </div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '0.75rem',
                  }}>
                    {agingBuckets.map((bucket) => (
                      <div
                        key={bucket.key}
                        style={{
                          background: bucket.bg,
                          border: `1px solid ${bucket.border}`,
                          borderRadius: '14px',
                          padding: '1rem',
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: bucket.tone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {bucket.label}
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', marginTop: '0.4rem' }}>
                          {formatCurrency(bucket.amountCents)}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                          {bucket.count} {bucket.count === 1 ? 'bill' : 'bills'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Bills Table */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                  Recent Bills
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Bill ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Pay Code</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Patient</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Payer</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Insurance</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Patient</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Balance</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Aging</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Follow-up</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.length === 0 && (
                      <tr>
                        <td colSpan={13} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                          No bills posted yet. Completed encounter charges will appear here automatically.
                        </td>
                      </tr>
                    )}
                    {recentBills.map(bill => (
                      <tr key={bill.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{bill.billNumber || bill.id}</td>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#0f766e', fontWeight: 700 }}>
                          {bill.billPayCode || '--'}
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '600' }}>
                          {[bill.patientFirstName, bill.patientLastName].filter(Boolean).join(' ') || 'Unknown patient'}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#374151' }}>{bill.payerName || 'Self-pay'}</td>
                        <td style={{ padding: '0.75rem', color: '#6b7280' }}>{formatBillDate(bill.billDate)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(bill.totalChargesCents || 0)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>
                          {formatCurrency(bill.insuranceResponsibilityCents || 0)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#92400e', fontWeight: 600 }}>
                          {formatCurrency(bill.patientResponsibilityCents || 0)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: (bill.balanceCents || 0) === 0 ? '#059669' : '#374151' }}>
                          {formatCurrency(bill.balanceCents || 0)}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: getAgingBucketKey(bill) === '90Plus' ? '#fee2e2' : getAgingBucketKey(bill) === 'current' ? '#dcfce7' : '#fef3c7',
                            color: getAgingBucketKey(bill) === '90Plus' ? '#991b1b' : getAgingBucketKey(bill) === 'current' ? '#166534' : '#92400e',
                          }}>
                            {getDaysPastDue(bill) > 0 ? `${getDaysPastDue(bill)}d late` : 'Current'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{
                              padding: '0.22rem 0.55rem',
                              borderRadius: '999px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: bill.followUpStatus === 'collections' ? '#fee2e2' : bill.paymentPlanStatus === 'active' ? '#dbeafe' : '#f3f4f6',
                              color: bill.followUpStatus === 'collections' ? '#991b1b' : bill.paymentPlanStatus === 'active' ? '#1d4ed8' : '#374151',
                              textTransform: 'capitalize',
                            }}>
                              {(bill.paymentPlanStatus === 'active' ? 'payment plan' : bill.followUpStatus || 'none').replace(/_/g, ' ')}
                            </span>
                            {bill.lastStatementSentAt && (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                stmt sent
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: bill.status === 'paid' ? '#dcfce7' : bill.status === 'overdue' ? '#fee2e2' : bill.status === 'partial' ? '#fef3c7' : '#dbeafe',
                            color: bill.status === 'paid' ? '#166534' : bill.status === 'overdue' ? '#991b1b' : bill.status === 'partial' ? '#92400e' : '#1d4ed8',
                          }}>
                            {bill.status || 'new'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button style={{
                              padding: '0.4rem 0.75rem',
                              background: 'white',
                              color: '#374151',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}>
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => copyBillPayLink(bill)}
                              style={{
                                padding: '0.4rem 0.75rem',
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Copy Pay Link
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBillAction(bill, 'send_statement')}
                              style={{
                                padding: '0.4rem 0.75rem',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Statement
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBillAction(bill, 'set_payment_plan')}
                              disabled={(bill.balanceCents || 0) <= 0}
                              style={{
                                padding: '0.4rem 0.75rem',
                                background: (bill.balanceCents || 0) <= 0 ? '#f3f4f6' : '#fff7ed',
                                color: (bill.balanceCents || 0) <= 0 ? '#9ca3af' : '#c2410c',
                                border: '1px solid #fed7aa',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: (bill.balanceCents || 0) <= 0 ? 'not-allowed' : 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Plan
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBillAction(bill, 'flag_collections')}
                              disabled={(bill.balanceCents || 0) <= 0}
                              style={{
                                padding: '0.4rem 0.75rem',
                                background: (bill.balanceCents || 0) <= 0 ? '#f3f4f6' : '#fef2f2',
                                color: (bill.balanceCents || 0) <= 0 ? '#9ca3af' : '#b91c1c',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: (bill.balanceCents || 0) <= 0 ? 'not-allowed' : 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Collections
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <PatientPaymentPortal onPaymentSuccess={handlePaymentSuccess} />
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <PremiumAnalytics onExportReport={handleExportReport} />
            )}

            {/* Fee Schedule Tab */}
            {activeTab === 'fees' && (
              <FeeSchedulePage />
            )}

            {/* Statements Tab */}
            {activeTab === 'statements' && (
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '2rem',
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                      Patient Statements
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                      Generate and send patient billing statements
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button style={{
                      padding: '0.75rem 1.25rem',
                      background: 'white',
                      color: '#374151',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}>
                      Statement History
                    </button>
                    <button style={{
                      padding: '0.75rem 1.25rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}>
                      Generate Statements
                    </button>
                  </div>
                </div>

                {/* Statement Generation Options */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1.5rem',
                  marginBottom: '2rem',
                }}>
                  <div style={{
                    background: '#f0fdf4',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #bbf7d0',
                    cursor: 'pointer',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
                      Monthly Statements
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Generate statements for all patients with balances
                    </p>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                      127 patients
                    </div>
                  </div>
                  <div style={{
                    background: '#fef3c7',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #fde68a',
                    cursor: 'pointer',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                      Overdue Notices
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Send reminders for overdue balances
                    </p>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
                      34 overdue
                    </div>
                  </div>
                  <div style={{
                    background: '#f0f9ff',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #bae6fd',
                    cursor: 'pointer',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#0369a1', marginBottom: '0.5rem' }}>
                      Pre-Collection Notices
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Final notices before collections
                    </p>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0ea5e9' }}>
                      12 accounts
                    </div>
                  </div>
                </div>

                {/* Recent Statements */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                  Recent Statement Batches
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Batch ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Statements</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Amount</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { id: 'STM-2026-001', date: '2026-01-14', type: 'Monthly', count: 127, amount: 4250000, status: 'sent' },
                      { id: 'STM-2026-002', date: '2026-01-14', type: 'Overdue', count: 34, amount: 1850000, status: 'pending' },
                      { id: 'STM-2025-089', date: '2025-12-15', type: 'Monthly', count: 118, amount: 3920000, status: 'sent' },
                    ].map(batch => (
                      <tr key={batch.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{batch.id}</td>
                        <td style={{ padding: '0.75rem', color: '#6b7280' }}>{batch.date}</td>
                        <td style={{ padding: '0.75rem' }}>{batch.type}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{batch.count}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>
                          ${(batch.amount / 100).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: batch.status === 'sent' ? '#dcfce7' : '#fef3c7',
                            color: batch.status === 'sent' ? '#166534' : '#92400e',
                          }}>
                            {batch.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <button style={{
                            padding: '0.4rem 0.75rem',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div>
                <div style={{ marginBottom: '2rem' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                    Financial Reports
                  </h2>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    Generate and schedule financial reports
                  </p>
                </div>

                {/* Report Categories */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '1.5rem',
                }}>
                  {/* Revenue Reports */}
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>
                      Revenue Reports
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        'Daily Collections Summary',
                        'Monthly Revenue Report',
                        'Revenue by Provider',
                        'Revenue by Payer',
                        'Revenue by Procedure',
                      ].map(report => (
                        <button
                          key={report}
                          onClick={() => handleExportReport(report)}
                          style={{
                            padding: '0.75rem 1rem',
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: '600', color: '#374151' }}>{report}</span>
                          <span style={{ color: '#059669' }}>Generate</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* A/R Reports */}
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>
                      Accounts Receivable
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        'A/R Aging Report',
                        'A/R by Payer',
                        'Outstanding Balances',
                        'Write-off Report',
                        'Bad Debt Analysis',
                      ].map(report => (
                        <button
                          key={report}
                          onClick={() => handleExportReport(report)}
                          style={{
                            padding: '0.75rem 1rem',
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: '600', color: '#374151' }}>{report}</span>
                          <span style={{ color: '#059669' }}>Generate</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Claims Reports */}
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>
                      Claims Reports
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        'Claims Status Summary',
                        'Denial Analysis',
                        'Clean Claims Rate',
                        'Appeals Tracking',
                        'Payer Performance',
                      ].map(report => (
                        <button
                          key={report}
                          onClick={() => handleExportReport(report)}
                          style={{
                            padding: '0.75rem 1rem',
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: '600', color: '#374151' }}>{report}</span>
                          <span style={{ color: '#059669' }}>Generate</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Productivity Reports */}
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>
                      Productivity
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        'Provider Productivity',
                        'Staff Productivity',
                        'Billing Staff Metrics',
                        'Collection Rate by User',
                        'Closing Report',
                      ].map(report => (
                        <button
                          key={report}
                          onClick={() => handleExportReport(report)}
                          style={{
                            padding: '0.75rem 1rem',
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ fontWeight: '600', color: '#374151' }}>{report}</span>
                          <span style={{ color: '#059669' }}>Generate</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scheduled Reports */}
                <div style={{ marginTop: '2rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                    Scheduled Reports
                  </h3>
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '12px',
                    padding: '1.5rem',
                  }}>
                    <table style={{ width: '100%', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Report Name</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Frequency</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Recipients</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Next Run</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: 'Daily Collections', freq: 'Daily', recipients: 'admin@clinic.com', next: '2026-01-16 6:00 AM' },
                          { name: 'Weekly A/R Aging', freq: 'Weekly', recipients: 'billing@clinic.com', next: '2026-01-20 8:00 AM' },
                          { name: 'Monthly Revenue', freq: 'Monthly', recipients: 'owner@clinic.com', next: '2026-02-01 9:00 AM' },
                        ].map(schedule => (
                          <tr key={schedule.name} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.75rem', fontWeight: '600' }}>{schedule.name}</td>
                            <td style={{ padding: '0.75rem', color: '#6b7280' }}>{schedule.freq}</td>
                            <td style={{ padding: '0.75rem', color: '#6b7280' }}>{schedule.recipients}</td>
                            <td style={{ padding: '0.75rem', color: '#6b7280' }}>{schedule.next}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <button style={{
                                padding: '0.4rem 0.75rem',
                                background: 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                marginRight: '0.5rem',
                              }}>
                                Edit
                              </button>
                              <button style={{
                                padding: '0.4rem 0.75rem',
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                              }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}>
                      + Schedule New Report
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
 
