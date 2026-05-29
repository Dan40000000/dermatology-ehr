import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
import { OpenAiAuditPage } from './OpenAiAuditPage';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchDashboardKPIs,
  fetchAppointmentsTrend,
  fetchRevenueTrend,
  fetchTopDiagnoses,
  fetchTopProcedures,
  fetchProviderProductivity,
  fetchPatientDemographics,
  fetchAppointmentTypesAnalytics,
  fetchAnalyticsOverview,
  fetchAppointmentAnalytics,
  fetchProviderAnalytics,
  fetchDermatologyMetrics,
  fetchYoYComparison,
  fetchNoShowRiskAnalysis,
} from '../api';
import {
  fetchARAging,
  fetchBillsSummary,
  fetchClaims as fetchFinancialClaims,
  fetchCollectionsTrend,
  fetchFinancialMetrics,
  fetchFinancialWorkQueue,
  fetchPaymentsSummary,
} from '../api/financials';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  TrendingDown,
  Users,
  WalletCards,
} from 'lucide-react';

interface DashboardKPIs {
  totalPatients: number;
  todayAppointments: number;
  monthRevenue: number;
  activeEncounters: number;
}

interface TrendData {
  date: string;
  count?: number;
  revenue?: number;
}

interface TopItem {
  name: string;
  count: number;
}

interface ProviderStats {
  id: string;
  provider_name: string;
  patients_seen: number;
  appointments: number;
  revenue_cents: number;
}

interface Demographics {
  ageGroups: { age_group: string; count: number }[];
  gender: { gender: string; count: number }[];
}

interface AppointmentType {
  type_name: string;
  count: number;
}

interface DermatologyMetrics {
  biopsyStats: {
    total: number;
    byType: {
      shave: number;
      punch: number;
      excisional: number;
      incisional: number;
    };
    resultsBreakdown: { result: string; count: number }[];
  };
  procedureSplit: {
    cosmetic: { count: number; revenue: number; percentage: number };
    medical: { count: number; revenue: number; percentage: number };
    surgical: { count: number; revenue: number; percentage: number };
  };
  topConditions: {
    icdCode: string;
    conditionName: string;
    treatmentCount: number;
    uniquePatients: number;
  }[];
  lesionTracking: {
    totalTracked: number;
    byStatus: { new: number; monitoring: number; resolved: number; biopsied: number };
    byRiskLevel: { high: number; medium: number; low: number };
    patientsWithLesions: number;
  };
}

interface YoYMetric {
  current: number;
  lastYear: number;
  percentChange: number;
  trend: 'up' | 'down';
}

interface YoYComparison {
  metrics: {
    newPatients: YoYMetric;
    totalAppointments: YoYMetric;
    completedAppointments: YoYMetric;
    noShows: YoYMetric;
    revenue: YoYMetric;
    encounters: YoYMetric;
    procedures: YoYMetric;
  };
}

interface NoShowRiskAnalysis {
  overallNoShowRate: number;
  totalAppointments: number;
  totalNoShows: number;
  riskFactors: {
    byDayOfWeek: { day: string; noShowRate: number; riskLevel: string }[];
    byTimeOfDay: { timeSlot: string; noShowRate: number; riskLevel: string }[];
    byAppointmentType: { appointmentType: string; noShowRate: number; riskLevel: string }[];
  };
  recommendations: string[];
}

interface AnalyticsOverview {
  newPatients?: {
    current: number;
    previous?: number;
    trend?: number;
  };
  appointments?: {
    current: number;
    previous?: number;
    trend?: number;
    byStatus?: { status: string; count: number | string }[];
  };
  revenue?: {
    current: number;
    previous?: number;
    trend?: number;
  };
  collectionRate?: number;
}

interface AppointmentAnalytics {
  byStatus?: { status: string; count: number | string }[];
  byType?: { type_name: string; count: number | string }[];
  byProvider?: { provider_name: string; count: number | string }[];
  avgWaitTimeMinutes?: number | string;
}

interface ProviderAnalyticsRow {
  id: string;
  provider_name: string;
  completed_appointments: number | string;
  cancelled_appointments: number | string;
  no_shows: number | string;
  total_encounters: number | string;
  unique_patients: number | string;
  revenue_cents: number | string;
  avg_visit_duration_minutes: number | string;
}

interface RevenueCategorySummary {
  key: string;
  label: string;
  revenueCents: number;
  itemCount: number;
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

interface FinancialDashboard {
  snapshots?: {
    daily?: SnapshotMetricCard;
    weekly?: SnapshotMetricCard;
    monthly?: SnapshotMetricCard;
    sourceNote?: string;
  };
}

interface CollectionsTrendRow {
  bucketStartDate: string;
  revenueEarnedCents: number;
  paymentsCollectedCents: number;
  patientPaymentsCents: number;
  payerPaymentsCents: number;
  billCount: number;
  paymentCount: number;
  revenueCategories?: RevenueCategorySummary[];
}

interface CollectionsTrendSummary {
  totalPaymentsCollectedCents: number;
  totalRevenueEarnedCents: number;
  totalPatientPaymentsCents: number;
  totalPayerPaymentsCents: number;
  totalPaymentCount: number;
  totalBillCount: number;
  dayCount: number;
  avgDailyPaymentsCollectedCents?: number;
  avgDailyRevenueEarnedCents?: number;
  collectionRate: number;
  revenueCategories?: RevenueCategorySummary[];
}

interface PaymentsSummary {
  calculated?: {
    netCollectionRate?: number;
  };
  receivables?: {
    outstandingBalanceCents?: number;
    overdueBalanceCents?: number;
    overdueCount?: number;
  };
  payerPaymentsSummary?: {
    appliedCents?: number;
    unappliedCents?: number;
  };
  patientPaymentsByMethod?: { paymentMethod: string; count: number; totalCents: number }[];
}

interface ARAgingBucket {
  key: string;
  label: string;
  billCount: number;
  totalBalanceCents: number;
}

interface BillStatusSummary {
  status: string;
  count: number;
  totalChargesCents: number;
}

interface FinancialClaim {
  id: string;
  status?: string;
  claimNumber?: string;
  patientFirstName?: string;
  patientLastName?: string;
  payerName?: string;
  payer?: string;
  serviceDate?: string;
  createdAt?: string;
  updatedAt?: string;
  totalCents?: number;
  paidAmountCents?: number;
  balanceCents?: number;
  denialReason?: string;
  denialCode?: string;
  scrubStatus?: string;
}

interface FinancialWorkQueueItem {
  id: string;
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

type DateRangePreset = 'today' | 'week' | 'month' | '30days' | 'year';
type AnalyticsTab = 'financials' | 'ai' | 'clinical' | 'compliance' | 'inventory' | 'dermatology';

const ANALYTICS_TAB_QUERY_MAP: Record<string, AnalyticsTab> = {
  financials: 'financials',
  financial: 'financials',
  revenue: 'financials',
  dashboard: 'financials',
  ai: 'ai',
  openai: 'ai',
  artificial_intelligence: 'ai',
  usage: 'ai',
  clinical: 'clinical',
  operational: 'clinical',
  productivity: 'clinical',
  compliance: 'compliance',
  inventory: 'inventory',
  dermatology: 'dermatology',
};

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function AnalyticsPage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('financials');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [useCustomRange, setUseCustomRange] = useState(false);

  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [appointmentsTrend, setAppointmentsTrend] = useState<TrendData[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<TrendData[]>([]);
  const [topDiagnoses, setTopDiagnoses] = useState<TopItem[]>([]);
  const [topProcedures, setTopProcedures] = useState<TopItem[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStats[]>([]);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [dermMetrics, setDermMetrics] = useState<DermatologyMetrics | null>(null);
  const [yoyComparison, setYoyComparison] = useState<YoYComparison | null>(null);
  const [noShowRisk, setNoShowRisk] = useState<NoShowRiskAnalysis | null>(null);
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null);
  const [appointmentAnalytics, setAppointmentAnalytics] = useState<AppointmentAnalytics | null>(null);
  const [providerAnalytics, setProviderAnalytics] = useState<ProviderAnalyticsRow[]>([]);
  const [financialDashboard, setFinancialDashboard] = useState<FinancialDashboard | null>(null);
  const [collectionsTrend, setCollectionsTrend] = useState<CollectionsTrendRow[]>([]);
  const [collectionsSummary, setCollectionsSummary] = useState<CollectionsTrendSummary | null>(null);
  const [paymentsSummary, setPaymentsSummary] = useState<PaymentsSummary | null>(null);
  const [arBuckets, setArBuckets] = useState<ARAgingBucket[]>([]);
  const [billsSummary, setBillsSummary] = useState<BillStatusSummary[]>([]);
  const [financialClaims, setFinancialClaims] = useState<FinancialClaim[]>([]);
  const [financialWorkQueue, setFinancialWorkQueue] = useState<FinancialWorkQueueItem[]>([]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (!requestedTab) return;

    const mappedTab = ANALYTICS_TAB_QUERY_MAP[requestedTab.toLowerCase()];
    if (mappedTab && mappedTab !== activeTab) {
      setActiveTab(mappedTab);
    }
  }, [activeTab, searchParams]);

  const setAnalyticsTab = useCallback((tab: AnalyticsTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const getDateFilter = useCallback(() => {
    if (useCustomRange && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }

    const end = new Date();
    let start = new Date();

    switch (dateRange) {
      case 'today':
        start = new Date(end);
        break;
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case '30days':
        start.setDate(end.getDate() - 30);
        break;
      case 'year':
        start.setFullYear(end.getFullYear() - 1);
        break;
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [dateRange, useCustomRange, customStartDate, customEndDate]);

  const analyticsDateFilter = useMemo(() => getDateFilter(), [getDateFilter]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!session) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const filter = getDateFilter();

      const [
        kpisRes,
        appointmentsTrendRes,
        revenueTrendRes,
        topDiagnosesRes,
        topProceduresRes,
        providerProductivityRes,
        demographicsRes,
        appointmentTypesRes,
        analyticsOverviewRes,
        appointmentAnalyticsRes,
        providerAnalyticsRes,
        dermMetricsRes,
        yoyComparisonRes,
        noShowRiskRes,
        financialDashboardRes,
        collectionsTrendRes,
        paymentsSummaryRes,
        arAgingRes,
        billsSummaryRes,
        claimsRes,
        workQueueRes,
      ] = await Promise.all([
        fetchDashboardKPIs(session.tenantId, session.accessToken, filter),
        fetchAppointmentsTrend(session.tenantId, session.accessToken, filter),
        fetchRevenueTrend(session.tenantId, session.accessToken, filter),
        fetchTopDiagnoses(session.tenantId, session.accessToken, filter),
        fetchTopProcedures(session.tenantId, session.accessToken, filter),
        fetchProviderProductivity(session.tenantId, session.accessToken, filter),
        fetchPatientDemographics(session.tenantId, session.accessToken),
        fetchAppointmentTypesAnalytics(session.tenantId, session.accessToken, filter),
        fetchAnalyticsOverview(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchAppointmentAnalytics(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchProviderAnalytics(session.tenantId, session.accessToken, filter).catch(() => ({ data: [] })),
        fetchDermatologyMetrics(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchYoYComparison(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchNoShowRiskAnalysis(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchFinancialMetrics({ tenantId: session.tenantId, accessToken: session.accessToken }, filter.endDate).catch(() => null),
        fetchCollectionsTrend(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          { ...filter, granularity: dateRange === 'year' ? 'month' : dateRange === 'week' || dateRange === 'today' ? 'day' : 'week' },
        ).catch(() => ({ data: [], summary: null })),
        fetchPaymentsSummary(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          filter,
        ).catch(() => null),
        fetchARAging(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          { asOfDate: filter.endDate },
        ).catch(() => ({ buckets: [] })),
        fetchBillsSummary(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          filter,
        ).catch(() => ({ billsByStatus: [] })),
        fetchFinancialClaims(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          filter,
        ).catch(() => ({ claims: [], data: [] })),
        fetchFinancialWorkQueue(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          'open',
        ).catch(() => ({ items: [] })),
      ]);

      setKpis(kpisRes);
      setAppointmentsTrend(Array.isArray(appointmentsTrendRes.data) ? appointmentsTrendRes.data : []);
      setRevenueTrend(Array.isArray(revenueTrendRes.data) ? revenueTrendRes.data : []);
      setTopDiagnoses(Array.isArray(topDiagnosesRes.data) ? topDiagnosesRes.data : []);
      setTopProcedures(Array.isArray(topProceduresRes.data) ? topProceduresRes.data : []);
      setProviderStats(Array.isArray(providerProductivityRes.data) ? providerProductivityRes.data : []);
      setDemographics(demographicsRes);
      setAppointmentTypes(Array.isArray(appointmentTypesRes.data) ? appointmentTypesRes.data : []);
      setAnalyticsOverview(analyticsOverviewRes);
      setAppointmentAnalytics(appointmentAnalyticsRes);
      setProviderAnalytics(Array.isArray(providerAnalyticsRes?.data) ? providerAnalyticsRes.data : []);
      setDermMetrics(dermMetricsRes);
      setYoyComparison(yoyComparisonRes);
      setNoShowRisk(noShowRiskRes);
      setFinancialDashboard(financialDashboardRes);
      setCollectionsTrend(Array.isArray(collectionsTrendRes?.data) ? collectionsTrendRes.data : []);
      setCollectionsSummary(collectionsTrendRes?.summary || null);
      setPaymentsSummary(paymentsSummaryRes);
      setArBuckets(Array.isArray(arAgingRes?.buckets) ? arAgingRes.buckets : []);
      setBillsSummary(Array.isArray(billsSummaryRes?.billsByStatus) ? billsSummaryRes.billsByStatus : []);
      const claimRows = Array.isArray(claimsRes?.claims)
        ? claimsRes.claims
        : Array.isArray(claimsRes?.data)
        ? claimsRes.data
        : [];
      setFinancialClaims(claimRows);
      setFinancialWorkQueue(Array.isArray(workQueueRes?.items) ? workQueueRes.items : []);

      if (isRefresh) {
        showSuccess('Dashboard refreshed');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, showError, showSuccess, getDateFilter, dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string | number) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleRefresh = () => {
    loadData(true);
  };

  const handleExportDashboard = () => {
    showSuccess('Export functionality coming soon');
  };

  const applyCustomRange = () => {
    if (customStartDate && customEndDate) {
      setUseCustomRange(true);
    }
  };

  const clearCustomRange = () => {
    setUseCustomRange(false);
    setCustomStartDate('');
    setCustomEndDate('');
  };

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="page-header">
          <h1>Analytics Dashboard</h1>
        </div>
        <div className="analytics-summary">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" height={120} />
          ))}
        </div>
        <div className="analytics-grid">
          <Skeleton variant="card" height={350} />
          <Skeleton variant="card" height={350} />
          <Skeleton variant="card" height={350} />
          <Skeleton variant="card" height={350} />
        </div>
      </div>
    );
  }

  const toNumber = (value: unknown) => Number(value || 0);
  const formatPercent = (value: number, digits = 1) => `${Number.isFinite(value) ? value.toFixed(digits) : '0.0'}%`;
  const normalizeStatus = (status: unknown) => String(status || '').toLowerCase().replace(/[-\s]+/g, '_');
  const appointmentStatusRows =
    appointmentAnalytics?.byStatus?.length
      ? appointmentAnalytics.byStatus
      : analyticsOverview?.appointments?.byStatus || [];
  const getAppointmentStatusCount = (aliases: string[]) => {
    const aliasSet = new Set(aliases.map(normalizeStatus));
    return appointmentStatusRows.reduce((sum, row) => {
      return aliasSet.has(normalizeStatus(row.status)) ? sum + toNumber(row.count) : sum;
    }, 0);
  };

  const monthlySnapshot = financialDashboard?.snapshots?.monthly;
  const patientCollectionsCents = (paymentsSummary?.patientPaymentsByMethod || []).reduce(
    (sum, row) => sum + toNumber(row.totalCents),
    0,
  );
  const payerCollectionsCents = toNumber(paymentsSummary?.payerPaymentsSummary?.appliedCents);
  const selectedRevenueCents =
    toNumber(collectionsSummary?.totalRevenueEarnedCents) ||
    toNumber(monthlySnapshot?.totalRevenueCents) ||
    toNumber(kpis?.monthRevenue);
  const selectedCollectionsCents =
    toNumber(collectionsSummary?.totalPaymentsCollectedCents) ||
    toNumber(monthlySnapshot?.collectionsCents) ||
    patientCollectionsCents + payerCollectionsCents;
  const netCollectionRate =
    toNumber(paymentsSummary?.calculated?.netCollectionRate) ||
    toNumber(collectionsSummary?.collectionRate) ||
    toNumber(monthlySnapshot?.collectionRate) ||
    (selectedRevenueCents > 0 ? (selectedCollectionsCents / selectedRevenueCents) * 100 : 0);
  const arBucketTotalCents = arBuckets.reduce((sum, bucket) => sum + toNumber(bucket.totalBalanceCents), 0);
  const outstandingArCents =
    arBucketTotalCents ||
    toNumber(paymentsSummary?.receivables?.outstandingBalanceCents);
  const overdueArCents = toNumber(paymentsSummary?.receivables?.overdueBalanceCents);
  const ar90PlusCents = arBuckets
    .filter((bucket) => ['91-120', '120+', '90+', '91_plus'].includes(String(bucket.key)))
    .reduce((sum, bucket) => sum + toNumber(bucket.totalBalanceCents), 0);
  const dsoWeightedDays = arBuckets.reduce((sum, bucket) => {
    const key = String(bucket.key || '');
    const midpoint = key === '0-30' ? 15 : key === '31-60' ? 45 : key === '61-90' ? 75 : key === '91-120' ? 105 : 135;
    return sum + midpoint * toNumber(bucket.totalBalanceCents);
  }, 0);
  const daysInAr = outstandingArCents > 0 ? dsoWeightedDays / outstandingArCents : 0;

  const totalAppointments =
    toNumber(analyticsOverview?.appointments?.current) ||
    appointmentStatusRows.reduce((sum, row) => sum + toNumber(row.count), 0) ||
    toNumber(noShowRisk?.totalAppointments) ||
    appointmentsTrend.reduce((sum, row) => sum + toNumber(row.count), 0);
  const completedAppointments =
    getAppointmentStatusCount(['completed', 'checked_out', 'checked out']) ||
    toNumber(yoyComparison?.metrics.completedAppointments.current);
  const scheduledAppointments = getAppointmentStatusCount(['scheduled', 'confirmed', 'checked_in', 'checked in']);
  const noShowCount =
    getAppointmentStatusCount(['no_show', 'no show', 'no-show']) ||
    toNumber(noShowRisk?.totalNoShows) ||
    toNumber(yoyComparison?.metrics.noShows.current);
  const cancelledCount = getAppointmentStatusCount(['cancelled', 'canceled', 'late_cancelled', 'late canceled', 'late_cancel']);
  const newPatientCount =
    toNumber(analyticsOverview?.newPatients?.current) ||
    toNumber(yoyComparison?.metrics.newPatients.current);
  const completionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;
  const scheduleLeakageCount = noShowCount + cancelledCount;
  const scheduleLeakageRate = totalAppointments > 0 ? (scheduleLeakageCount / totalAppointments) * 100 : 0;
  const avgRevenuePerVisitCents =
    toNumber(monthlySnapshot?.avgRevenuePerVisitCents) ||
    (completedAppointments > 0 ? Math.round(selectedRevenueCents / completedAppointments) : 0);
  const revenueCategories =
    collectionsSummary?.revenueCategories?.length
      ? collectionsSummary.revenueCategories
      : monthlySnapshot?.revenueCategories || [];
  const getCategoryRevenue = (tokens: string[]) => {
    const needles = tokens.map((token) => token.toLowerCase());
    return revenueCategories.reduce((sum, category) => {
      const haystack = `${category.key} ${category.label}`.toLowerCase();
      return needles.some((token) => haystack.includes(token)) ? sum + toNumber(category.revenueCents) : sum;
    }, 0);
  };
  const noShowFeeCents = getCategoryRevenue(['no_show', 'no show', 'missed']);
  const cancellationFeeCents = getCategoryRevenue(['cancel', 'late_fee', 'late fee']);
  const collectedLeakageFeesCents = noShowFeeCents + cancellationFeeCents;
  const estimatedNoShowLeakageCents = noShowCount * avgRevenuePerVisitCents;
  const estimatedCancellationLeakageCents = cancelledCount * avgRevenuePerVisitCents;
  const estimatedScheduleLeakageCents = estimatedNoShowLeakageCents + estimatedCancellationLeakageCents;
  const unrecoveredLeakageCents = Math.max(0, estimatedScheduleLeakageCents - collectedLeakageFeesCents);

  const claimStatusCount = (statuses: string[]) => {
    const statusSet = new Set(statuses.map(normalizeStatus));
    return financialClaims.filter((claim) => statusSet.has(normalizeStatus(claim.status))).length;
  };
  const readyClaims = claimStatusCount(['draft', 'ready']);
  const clearinghouseClaims = claimStatusCount(['submitted', 'accepted']);
  const paidClaims = claimStatusCount(['paid']);
  const deniedClaims = claimStatusCount(['denied', 'rejected', 'appealed']);
  const adjudicatedClaims = financialClaims.filter((claim) => !['draft', 'ready'].includes(normalizeStatus(claim.status)));
  const denialRate = adjudicatedClaims.length > 0 ? (deniedClaims / adjudicatedClaims.length) * 100 : 0;
  const firstPassRate = adjudicatedClaims.length > 0 ? (paidClaims / adjudicatedClaims.length) * 100 : 0;
  const claimsNeedingAction = financialWorkQueue.length;
  const unappliedCashCents = toNumber(paymentsSummary?.payerPaymentsSummary?.unappliedCents);
  const workQueueCritical = financialWorkQueue.filter((item) => ['critical', 'error'].includes(String(item.severity || '').toLowerCase())).length;
  const billsByStatusTotal = billsSummary.reduce((sum, row) => sum + toNumber(row.count), 0);

  const financialTrendData = collectionsTrend.map((row) => ({
    date: row.bucketStartDate,
    revenue: toNumber(row.revenueEarnedCents),
    collections: toNumber(row.paymentsCollectedCents),
    patient: toNumber(row.patientPaymentsCents),
    payer: toNumber(row.payerPaymentsCents),
  }));
  const arAgingData = arBuckets.map((bucket) => ({
    label: bucket.label || bucket.key,
    amount: toNumber(bucket.totalBalanceCents),
    count: toNumber(bucket.billCount),
  }));
  const claimPipelineData = [
    { label: 'Ready', value: readyClaims, fill: '#2563eb' },
    { label: 'Clearinghouse', value: clearinghouseClaims, fill: '#0f766e' },
    { label: 'Paid', value: paidClaims, fill: '#16a34a' },
    { label: 'Denied / Rejected', value: deniedClaims, fill: '#dc2626' },
  ];
  const providerStoryRows = providerAnalytics.length
    ? providerAnalytics.slice(0, 5).map((provider) => ({
        id: provider.id,
        name: provider.provider_name,
        seen: toNumber(provider.unique_patients),
        completed: toNumber(provider.completed_appointments),
        noShows: toNumber(provider.no_shows),
        cancelled: toNumber(provider.cancelled_appointments),
        revenue: toNumber(provider.revenue_cents),
      }))
    : providerStats.slice(0, 5).map((provider) => ({
        id: provider.id,
        name: provider.provider_name,
        seen: toNumber(provider.patients_seen),
        completed: toNumber(provider.appointments),
        noShows: 0,
        cancelled: 0,
        revenue: toNumber(provider.revenue_cents),
      }));
  const topWorkQueueItems = financialWorkQueue.slice(0, 5);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics & Reports</h1>
        <div className="analytics-actions">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={handleExportDashboard} className="btn-primary">
            Export Dashboard
          </button>
        </div>
      </div>

      {/* Analytics Tabs */}
      <div className="analytics-tabs">
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'financials' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('financials')}
        >
          Financials
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('ai')}
        >
          AI
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'clinical' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('clinical')}
        >
          Clinical and Operational
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'compliance' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('compliance')}
        >
          Compliance
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('inventory')}
        >
          Inventory
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'dermatology' ? 'active' : ''}`}
          onClick={() => setAnalyticsTab('dermatology')}
        >
          Dermatology
        </button>
      </div>

      {/* Date Range Filter */}
      <Panel title="Date Range">
        <div className="date-range-controls">
          <div className="quick-filters">
            {(['today', 'week', 'month', '30days', 'year'] as DateRangePreset[]).map((range) => (
              <button
                key={range}
                type="button"
                className={`range-btn ${dateRange === range && !useCustomRange ? 'active' : ''}`}
                onClick={() => {
                  setDateRange(range);
                  setUseCustomRange(false);
                }}
              >
                {range === 'today'
                  ? 'Today'
                  : range === 'week'
                  ? 'This Week'
                  : range === 'month'
                  ? 'This Month'
                  : range === '30days'
                  ? 'Last 30 Days'
                  : 'This Year'}
              </button>
            ))}
          </div>
          <div className="custom-range">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              placeholder="Start Date"
            />
            <span>to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              placeholder="End Date"
            />
            <button
              type="button"
              onClick={applyCustomRange}
              disabled={!customStartDate || !customEndDate}
              className="btn-primary"
            >
              Apply
            </button>
            {useCustomRange && (
              <button type="button" onClick={clearCustomRange} className="btn-secondary">
                Clear
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* KPI Cards */}
      {activeTab !== 'ai' && (
        <div className="kpi-cards">
          <div className="kpi-card patients">
            <div className="kpi-icon">
              <Users size={24} aria-hidden="true" />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Total Patients</div>
              <div className="kpi-value">{kpis?.totalPatients.toLocaleString() || 0}</div>
            </div>
          </div>

          <div className="kpi-card appointments">
            <div className="kpi-icon">
              <CalendarClock size={24} aria-hidden="true" />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Today's Appointments</div>
              <div className="kpi-value">{kpis?.todayAppointments || 0}</div>
            </div>
          </div>

          <div className="kpi-card revenue">
            <div className="kpi-icon">
              <DollarSign size={24} aria-hidden="true" />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">This Month's Revenue</div>
              <div className="kpi-value">{formatCurrency(kpis?.monthRevenue || 0)}</div>
            </div>
          </div>

          <div className="kpi-card encounters">
            <div className="kpi-icon">
              <Stethoscope size={24} aria-hidden="true" />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Active Encounters</div>
              <div className="kpi-value">{kpis?.activeEncounters || 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'ai' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <Bot size={34} aria-hidden="true" />
            </div>
            <div className="section-header-content">
              <h2>AI Usage</h2>
              <p>OpenAI credits and Amazon voice expense for the selected date range.</p>
            </div>
          </div>
          <OpenAiAuditPage embedded externalDateRange={analyticsDateFilter} />
        </div>
      )}

      {activeTab === 'financials' && (
        <div className="tab-content">
          <div className="analytics-section-header financial-story-header">
            <div className="section-icon finance-icon">
              <BarChart3 size={34} aria-hidden="true" />
            </div>
            <div className="section-header-content">
              <div className="section-title-row">
                <h2>Financial Reports</h2>
              </div>
              <p>Collections, access leakage, claim movement, and A/R risk tied back to the day-to-day workflows.</p>
            </div>
            <div className="story-actions">
              <Link to="/financials" className="story-link-button">
                Financials <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/clearinghouse" className="story-link-button subtle">
                Clearinghouse <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="finance-story-strip">
            <div className="story-strip-item">
              <span className="story-strip-label">Revenue booked</span>
              <strong>{formatCurrency(selectedRevenueCents)}</strong>
              <span>{totalAppointments.toLocaleString()} appointments in period</span>
            </div>
            <div className="story-strip-item">
              <span className="story-strip-label">Collected</span>
              <strong>{formatCurrency(selectedCollectionsCents)}</strong>
              <span>{formatPercent(netCollectionRate)} net collection rate</span>
            </div>
            <div className="story-strip-item warning">
              <span className="story-strip-label">Schedule leakage</span>
              <strong>{formatCurrency(unrecoveredLeakageCents)}</strong>
              <span>{formatPercent(scheduleLeakageRate)} lost or cancelled slots</span>
            </div>
            <div className="story-strip-item danger">
              <span className="story-strip-label">Needs action</span>
              <strong>{claimsNeedingAction}</strong>
              <span>{workQueueCritical} critical billing review items</span>
            </div>
          </div>

          <div className="finance-command-grid">
            <Panel title="Collections Story">
              <div className="finance-panel-body">
                <div className="metric-card-row">
                  <div className="metric-tile">
                    <DollarSign size={20} aria-hidden="true" />
                    <span className="metric-label">Charges</span>
                    <strong>{formatCurrency(selectedRevenueCents)}</strong>
                    <span className="metric-note">Billed or earned in selected range</span>
                  </div>
                  <div className="metric-tile">
                    <CreditCard size={20} aria-hidden="true" />
                    <span className="metric-label">Payments</span>
                    <strong>{formatCurrency(selectedCollectionsCents)}</strong>
                    <span className="metric-note">{formatCurrency(patientCollectionsCents)} patient, {formatCurrency(payerCollectionsCents)} payer</span>
                  </div>
                  <div className="metric-tile">
                    <WalletCards size={20} aria-hidden="true" />
                    <span className="metric-label">Unapplied Cash</span>
                    <strong>{formatCurrency(unappliedCashCents)}</strong>
                    <span className="metric-note">EFT/ERA variance to reconcile</span>
                  </div>
                </div>
                <div className="finance-chart">
                  {financialTrendData.length === 0 ? (
                    <div className="empty-chart compact">
                      <p className="muted">No collections trend available for this range</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={financialTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tickFormatter={formatDate} />
                        <YAxis tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip
                          labelFormatter={formatDate}
                          formatter={(value: any, name: any) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Collections']}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#dbeafe" name="Revenue" />
                        <Area type="monotone" dataKey="collections" stroke="#0f766e" fill="#ccfbf1" name="Collections" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Schedule Leakage">
              <div className="finance-panel-body">
                <div className="leakage-summary">
                  <div>
                    <span className="metric-label">Completed</span>
                    <strong>{completedAppointments.toLocaleString()}</strong>
                    <span>{formatPercent(completionRate)} completion rate</span>
                  </div>
                  <div>
                    <span className="metric-label">No-shows</span>
                    <strong>{noShowCount.toLocaleString()}</strong>
                    <span>{formatCurrency(estimatedNoShowLeakageCents)} estimated visit value</span>
                  </div>
                  <div>
                    <span className="metric-label">Cancelled</span>
                    <strong>{cancelledCount.toLocaleString()}</strong>
                    <span>{formatCurrency(estimatedCancellationLeakageCents)} estimated visit value</span>
                  </div>
                </div>
                <div className="leakage-recovery">
                  <div className="recovery-meter">
                    <span
                      style={{
                        width: `${estimatedScheduleLeakageCents > 0 ? Math.min(100, (collectedLeakageFeesCents / estimatedScheduleLeakageCents) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="recovery-copy">
                    <strong>{formatCurrency(collectedLeakageFeesCents)}</strong>
                    <span>no-show and cancellation fees captured against {formatCurrency(estimatedScheduleLeakageCents)} estimated leakage</span>
                  </div>
                </div>
                <div className="action-row">
                  <Link to="/schedule" className="inline-action">Open Schedule <ArrowRight size={14} aria-hidden="true" /></Link>
                  <Link to="/text-messages" className="inline-action">Reminder Campaigns <ArrowRight size={14} aria-hidden="true" /></Link>
                </div>
              </div>
            </Panel>

            <Panel title="Claim Pipeline">
              <div className="finance-panel-body">
                <div className="pipeline-steps">
                  {claimPipelineData.map((step) => (
                    <div key={step.label} className="pipeline-step" style={{ borderTopColor: step.fill }}>
                      <span>{step.label}</span>
                      <strong>{step.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="metric-card-row compact-metrics">
                  <div className="metric-tile">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <span className="metric-label">First-pass</span>
                    <strong>{formatPercent(firstPassRate)}</strong>
                  </div>
                  <div className="metric-tile">
                    <ShieldAlert size={18} aria-hidden="true" />
                    <span className="metric-label">Denial rate</span>
                    <strong>{formatPercent(denialRate)}</strong>
                  </div>
                  <div className="metric-tile">
                    <FileWarning size={18} aria-hidden="true" />
                    <span className="metric-label">Open reviews</span>
                    <strong>{financialWorkQueue.length}</strong>
                  </div>
                </div>
                <div className="action-row">
                  <Link to="/claims" className="inline-action">Claims Worklist <ArrowRight size={14} aria-hidden="true" /></Link>
                  <Link to="/clearinghouse" className="inline-action">Submit and Reconcile <ArrowRight size={14} aria-hidden="true" /></Link>
                </div>
              </div>
            </Panel>

            <Panel title="A/R Aging and Patient Balances">
              <div className="finance-panel-body">
                <div className="metric-card-row">
                  <div className="metric-tile">
                    <TrendingDown size={20} aria-hidden="true" />
                    <span className="metric-label">Total A/R</span>
                    <strong>{formatCurrency(outstandingArCents)}</strong>
                    <span className="metric-note">{formatCurrency(overdueArCents)} overdue</span>
                  </div>
                  <div className="metric-tile">
                    <AlertTriangle size={20} aria-hidden="true" />
                    <span className="metric-label">A/R 90+</span>
                    <strong>{formatCurrency(ar90PlusCents)}</strong>
                    <span className="metric-note">{outstandingArCents > 0 ? formatPercent((ar90PlusCents / outstandingArCents) * 100) : '0.0%'} of open A/R</span>
                  </div>
                  <div className="metric-tile">
                    <Activity size={20} aria-hidden="true" />
                    <span className="metric-label">Days in A/R</span>
                    <strong>{daysInAr.toFixed(1)}</strong>
                    <span className="metric-note">{billsByStatusTotal} bills represented</span>
                  </div>
                </div>
                {arAgingData.length === 0 ? (
                  <div className="empty-chart compact">
                    <p className="muted">No A/R aging buckets available</p>
                  </div>
                ) : (
                  <div className="ar-aging-list">
                    {arAgingData.map((bucket) => (
                      <div key={bucket.label} className="ar-aging-row">
                        <div className="ar-aging-label">
                          <strong>{bucket.label}</strong>
                          <span>{bucket.count} bills</span>
                        </div>
                        <div className="ar-aging-bar">
                          <span style={{ width: `${outstandingArCents > 0 ? Math.max(4, (bucket.amount / outstandingArCents) * 100) : 0}%` }} />
                        </div>
                        <strong>{formatCurrency(bucket.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <div className="action-row">
                  <Link to="/financials?tab=bills" className="inline-action">Patient Balances <ArrowRight size={14} aria-hidden="true" /></Link>
                  <Link to="/financials?tab=analytics" className="inline-action">A/R Analytics <ArrowRight size={14} aria-hidden="true" /></Link>
                </div>
              </div>
            </Panel>
          </div>

          <div className="finance-lower-grid">
            <Panel title="Provider Financial Story">
              {providerStoryRows.length === 0 ? (
                <div className="empty-state">No provider data available</div>
              ) : (
                <div className="provider-story-list">
                  {providerStoryRows.map((provider) => (
                    <div key={provider.id} className="provider-story-row">
                      <div>
                        <strong>{provider.name || 'Unknown provider'}</strong>
                        <span>{provider.seen.toLocaleString()} patients, {provider.completed.toLocaleString()} completed visits</span>
                      </div>
                      <div>
                        <strong>{formatCurrency(provider.revenue)}</strong>
                        <span>{provider.noShows} no-shows, {provider.cancelled} cancellations</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Billing Work Queue">
              {topWorkQueueItems.length === 0 ? (
                <div className="clean-state">
                  <CheckCircle2 size={28} aria-hidden="true" />
                  <strong>No open billing review items</strong>
                  <span>Claims, bills, and posting failures are clear for the selected queue.</span>
                </div>
              ) : (
                <div className="workqueue-list">
                  {topWorkQueueItems.map((item) => (
                    <div key={item.id} className={`workqueue-item ${String(item.severity || '').toLowerCase()}`}>
                      <div>
                        <strong>{item.message || (item.issueType || 'Billing review').replace(/_/g, ' ')}</strong>
                        <span>
                          {[item.patientFirstName, item.patientLastName].filter(Boolean).join(' ') || item.claimNumber || item.billNumber || 'Unassigned item'}
                        </span>
                      </div>
                      <span className="severity-pill">{item.severity || 'review'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Day-to-Day Office Pulse">
              <div className="office-pulse-grid">
                <div>
                  <Users size={18} aria-hidden="true" />
                  <span>New patients</span>
                  <strong>{newPatientCount.toLocaleString()}</strong>
                </div>
                <div>
                  <CalendarClock size={18} aria-hidden="true" />
                  <span>Scheduled now</span>
                  <strong>{scheduledAppointments.toLocaleString()}</strong>
                </div>
                <div>
                  <RefreshCw size={18} aria-hidden="true" />
                  <span>Avg wait</span>
                  <strong>{toNumber(appointmentAnalytics?.avgWaitTimeMinutes).toFixed(1)}m</strong>
                </div>
                <div>
                  <ClipboardList size={18} aria-hidden="true" />
                  <span>Bill statuses</span>
                  <strong>{billsByStatusTotal.toLocaleString()}</strong>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === 'clinical' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                <path d="M9 2v4M15 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
              </svg>
            </div>
            <div className="section-header-content">
              <h2>Data Explorer</h2>
              <p>View clinical data sets and create custom reports for your practice.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <div className="link-box-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <p className="link-box-description">Explore advanced analytics features and create custom reports tailored to your practice needs.</p>
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More</button>
          </div>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="section-header-content">
              <h2>Compliance Reports</h2>
              <p>View Compliance and Specialized Registry reports for your practice.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <div className="link-box-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p className="link-box-description">Access comprehensive compliance tracking and specialized registry reporting tools.</p>
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More</button>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div className="section-header-content">
              <h2>Inventory</h2>
              <p>View your practice's Inventory Management data and create custom reports.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <div className="link-box-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <p className="link-box-description">Monitor inventory levels, track usage patterns, and generate detailed inventory reports.</p>
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More</button>
          </div>
        </div>
      )}

      {activeTab === 'dermatology' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="section-header-content">
              <h2>Dermatology Analytics</h2>
              <p>Specialized metrics for dermatology practices including biopsy stats, procedure breakdowns, and skin condition tracking.</p>
            </div>
          </div>

          {/* Dermatology Metrics Grid */}
          <div className="derm-metrics-grid">
            {/* Biopsy Statistics */}
            <Panel title="Biopsy Statistics">
              {!dermMetrics ? (
                <div className="empty-chart">
                  <p className="muted">No biopsy data available</p>
                </div>
              ) : (
                <div className="biopsy-stats">
                  <div className="biopsy-total">
                    <span className="stat-value">{dermMetrics.biopsyStats.total}</span>
                    <span className="stat-label">Total Biopsies</span>
                  </div>
                  <div className="biopsy-breakdown">
                    <div className="biopsy-type">
                      <span className="type-name">Shave</span>
                      <span className="type-count">{dermMetrics.biopsyStats.byType.shave}</span>
                    </div>
                    <div className="biopsy-type">
                      <span className="type-name">Punch</span>
                      <span className="type-count">{dermMetrics.biopsyStats.byType.punch}</span>
                    </div>
                    <div className="biopsy-type">
                      <span className="type-name">Excisional</span>
                      <span className="type-count">{dermMetrics.biopsyStats.byType.excisional}</span>
                    </div>
                    <div className="biopsy-type">
                      <span className="type-name">Incisional</span>
                      <span className="type-count">{dermMetrics.biopsyStats.byType.incisional}</span>
                    </div>
                  </div>
                  {dermMetrics.biopsyStats.resultsBreakdown.length > 0 && (
                    <div className="results-breakdown">
                      <h4>Results Breakdown</h4>
                      {dermMetrics.biopsyStats.resultsBreakdown.map((result) => (
                        <div key={result.result} className="result-item">
                          <span className="result-name">{result.result}</span>
                          <span className="result-count">{result.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* Cosmetic vs Medical Split */}
            <Panel title="Procedure Categories">
              {!dermMetrics ? (
                <div className="empty-chart">
                  <p className="muted">No procedure data available</p>
                </div>
              ) : (
                <div className="procedure-split">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Cosmetic', value: dermMetrics.procedureSplit.cosmetic.count, revenue: dermMetrics.procedureSplit.cosmetic.revenue },
                          { name: 'Medical', value: dermMetrics.procedureSplit.medical.count, revenue: dermMetrics.procedureSplit.medical.revenue },
                          { name: 'Surgical', value: dermMetrics.procedureSplit.surgical.count, revenue: dermMetrics.procedureSplit.surgical.revenue },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#ec4899" />
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#06b6d4" />
                      </Pie>
                      <Tooltip formatter={(value: any, name: any, props: any) => [
                        `${value} procedures (${formatCurrency(props.payload.revenue)})`,
                        name
                      ]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="split-details">
                    <div className="split-item cosmetic">
                      <div className="split-color" style={{ background: '#ec4899' }}></div>
                      <div className="split-info">
                        <span className="split-name">Cosmetic</span>
                        <span className="split-count">{dermMetrics.procedureSplit.cosmetic.count} ({dermMetrics.procedureSplit.cosmetic.percentage}%)</span>
                        <span className="split-revenue">{formatCurrency(dermMetrics.procedureSplit.cosmetic.revenue)}</span>
                      </div>
                    </div>
                    <div className="split-item medical">
                      <div className="split-color" style={{ background: '#8b5cf6' }}></div>
                      <div className="split-info">
                        <span className="split-name">Medical</span>
                        <span className="split-count">{dermMetrics.procedureSplit.medical.count} ({dermMetrics.procedureSplit.medical.percentage}%)</span>
                        <span className="split-revenue">{formatCurrency(dermMetrics.procedureSplit.medical.revenue)}</span>
                      </div>
                    </div>
                    <div className="split-item surgical">
                      <div className="split-color" style={{ background: '#06b6d4' }}></div>
                      <div className="split-info">
                        <span className="split-name">Surgical</span>
                        <span className="split-count">{dermMetrics.procedureSplit.surgical.count} ({dermMetrics.procedureSplit.surgical.percentage}%)</span>
                        <span className="split-revenue">{formatCurrency(dermMetrics.procedureSplit.surgical.revenue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {/* Lesion Tracking */}
            <Panel title="Lesion Tracking">
              {!dermMetrics ? (
                <div className="empty-chart">
                  <p className="muted">No lesion tracking data available</p>
                </div>
              ) : (
                <div className="lesion-tracking">
                  <div className="lesion-summary">
                    <div className="lesion-stat">
                      <span className="stat-value">{dermMetrics.lesionTracking.totalTracked}</span>
                      <span className="stat-label">Total Tracked</span>
                    </div>
                    <div className="lesion-stat">
                      <span className="stat-value">{dermMetrics.lesionTracking.patientsWithLesions}</span>
                      <span className="stat-label">Patients</span>
                    </div>
                  </div>
                  <div className="lesion-status">
                    <h4>By Status</h4>
                    <div className="status-bar">
                      <div className="status-item new" style={{ flex: dermMetrics.lesionTracking.byStatus.new }}>
                        <span>{dermMetrics.lesionTracking.byStatus.new} New</span>
                      </div>
                      <div className="status-item monitoring" style={{ flex: dermMetrics.lesionTracking.byStatus.monitoring }}>
                        <span>{dermMetrics.lesionTracking.byStatus.monitoring} Monitoring</span>
                      </div>
                      <div className="status-item resolved" style={{ flex: dermMetrics.lesionTracking.byStatus.resolved }}>
                        <span>{dermMetrics.lesionTracking.byStatus.resolved} Resolved</span>
                      </div>
                      <div className="status-item biopsied" style={{ flex: dermMetrics.lesionTracking.byStatus.biopsied }}>
                        <span>{dermMetrics.lesionTracking.byStatus.biopsied} Biopsied</span>
                      </div>
                    </div>
                  </div>
                  <div className="lesion-risk">
                    <h4>By Risk Level</h4>
                    <div className="risk-items">
                      <div className="risk-item high">
                        <span className="risk-count">{dermMetrics.lesionTracking.byRiskLevel.high}</span>
                        <span className="risk-label">High Risk</span>
                      </div>
                      <div className="risk-item medium">
                        <span className="risk-count">{dermMetrics.lesionTracking.byRiskLevel.medium}</span>
                        <span className="risk-label">Medium Risk</span>
                      </div>
                      <div className="risk-item low">
                        <span className="risk-count">{dermMetrics.lesionTracking.byRiskLevel.low}</span>
                        <span className="risk-label">Low Risk</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {/* Top Skin Conditions */}
            <Panel title="Top Skin Conditions Treated">
              {!dermMetrics || dermMetrics.topConditions.length === 0 ? (
                <div className="empty-chart">
                  <p className="muted">No condition data available</p>
                </div>
              ) : (
                <div className="conditions-list">
                  {dermMetrics.topConditions.slice(0, 10).map((condition, index) => (
                    <div key={condition.icdCode} className="condition-item">
                      <span className="condition-rank">{index + 1}</span>
                      <div className="condition-info">
                        <span className="condition-name">{condition.conditionName}</span>
                        <span className="condition-code">{condition.icdCode}</span>
                      </div>
                      <div className="condition-stats">
                        <span className="condition-count">{condition.treatmentCount} treatments</span>
                        <span className="condition-patients">{condition.uniquePatients} patients</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Year-over-Year Comparison */}
            <Panel title="Year-over-Year Comparison">
              {!yoyComparison ? (
                <div className="empty-chart">
                  <p className="muted">No comparison data available</p>
                </div>
              ) : (
                <div className="yoy-comparison">
                  {Object.entries(yoyComparison.metrics).map(([key, metric]) => (
                    <div key={key} className="yoy-metric">
                      <span className="yoy-name">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div className="yoy-values">
                        <span className="yoy-current">{key === 'revenue' ? formatCurrency(metric.current) : metric.current.toLocaleString()}</span>
                        <span className={`yoy-change ${metric.trend === 'up' ? 'positive' : 'negative'}`}>
                          {metric.trend === 'up' ? '+' : ''}{metric.percentChange}%
                        </span>
                      </div>
                      <span className="yoy-lastyear">Last year: {key === 'revenue' ? formatCurrency(metric.lastYear) : metric.lastYear.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* No-Show Risk Analysis */}
            <Panel title="No-Show Risk Analysis">
              {!noShowRisk ? (
                <div className="empty-chart">
                  <p className="muted">No no-show data available</p>
                </div>
              ) : (
                <div className="noshow-analysis">
                  <div className="noshow-summary">
                    <div className="noshow-stat">
                      <span className="stat-value">{noShowRisk.overallNoShowRate}%</span>
                      <span className="stat-label">Overall No-Show Rate</span>
                    </div>
                    <div className="noshow-stat">
                      <span className="stat-value">{noShowRisk.totalNoShows}</span>
                      <span className="stat-label">Total No-Shows</span>
                    </div>
                  </div>
                  <div className="noshow-factors">
                    <h4>High Risk Factors</h4>
                    <div className="risk-factor-list">
                      {noShowRisk.riskFactors.byDayOfWeek
                        .filter((d) => d.riskLevel === 'high')
                        .map((day) => (
                          <div key={day.day} className="risk-factor high">
                            <span className="factor-name">{day.day}</span>
                            <span className="factor-rate">{day.noShowRate}%</span>
                          </div>
                        ))}
                      {noShowRisk.riskFactors.byAppointmentType
                        .filter((t) => t.riskLevel === 'high')
                        .slice(0, 3)
                        .map((type) => (
                          <div key={type.appointmentType} className="risk-factor high">
                            <span className="factor-name">{type.appointmentType}</span>
                            <span className="factor-rate">{type.noShowRate}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  {noShowRisk.recommendations.length > 0 && (
                    <div className="noshow-recommendations">
                      <h4>Recommendations</h4>
                      <ul>
                        {noShowRisk.recommendations.slice(0, 3).map((rec, index) => (
                          <li key={index}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Charts Grid - Only show on financials tab */}
      {activeTab === 'financials' && (
        <>
        <div className="financial-drilldown-header">
          <div>
            <h3>Operational Drill-Downs</h3>
            <p>Volume, revenue, diagnoses, procedures, demographics, appointment mix, and provider productivity for the selected period.</p>
          </div>
        </div>
        <div className="charts-grid">
          {/* Appointments Trend */}
          <Panel title="Appointments Trend">
            {appointmentsTrend.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No appointment data available for selected period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={appointmentsTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} />
                  <YAxis />
                  <Tooltip labelFormatter={formatDate} />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2} name="Appointments" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Revenue Trend */}
          <Panel title="Revenue Trend">
            {revenueTrend.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No revenue data available for selected period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip
                    labelFormatter={formatDate}
                    formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                    name="Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Top Diagnoses */}
          <Panel title="Top 10 Diagnoses">
            {topDiagnoses.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No diagnosis data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topDiagnoses} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={150} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Top Procedures */}
          <Panel title="Top 10 Procedures">
            {topProcedures.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No procedure data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProcedures} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={150} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Patient Demographics - Age Groups */}
          <Panel title="Patient Demographics - Age Groups">
            {!demographics || !Array.isArray(demographics.ageGroups) || demographics.ageGroups.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No demographics data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={demographics.ageGroups}
                    dataKey="count"
                    nameKey="age_group"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {demographics.ageGroups.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Appointment Types */}
          <Panel title="Appointment Types Distribution">
            {appointmentTypes.length === 0 ? (
              <div className="empty-chart">
                <p className="muted">No appointment type data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={appointmentTypes as any}
                    dataKey="count"
                    nameKey="type_name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    label
                  >
                    {appointmentTypes.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Provider Productivity Table */}
          <Panel title="Provider Productivity">
            {providerStats.length === 0 ? (
              <div className="empty-state">
                <p className="muted">No provider data available</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Patients Seen</th>
                      <th>Appointments</th>
                      <th>Revenue</th>
                      <th>Avg Per Patient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerStats.map((provider) => {
                      if (!provider) return null;
                      return (
                        <tr key={provider.id}>
                          <td>{provider.provider_name || 'Unknown'}</td>
                          <td>{provider.patients_seen || 0}</td>
                          <td>{provider.appointments || 0}</td>
                          <td>{formatCurrency(provider.revenue_cents || 0)}</td>
                          <td>
                            {provider.patients_seen > 0
                              ? formatCurrency(Math.round((provider.revenue_cents || 0) / provider.patients_seen))
                              : '$0.00'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        </>
      )}

      <style>{`
        .analytics-page {
          padding: 1.5rem;
          background: #f6f8fb;
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .analytics-actions {
          display: flex;
          gap: 0.75rem;
        }

        .analytics-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
          background: white;
          padding: 0.5rem;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .analytics-tab {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          color: #64748b;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .analytics-tab:hover {
          color: #0f766e;
          background: #f0fdfa;
        }

        .analytics-tab.active {
          color: white;
          background: #0f766e;
          box-shadow: 0 4px 10px rgba(15, 118, 110, 0.18);
        }

        .tab-content {
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .analytics-section-header {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 2rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          margin-bottom: 2rem;
          border-left: 4px solid #0f766e;
        }

        .section-icon {
          flex-shrink: 0;
        }

        .section-header-content {
          flex: 1;
        }

        .section-title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .analytics-section-header h2 {
          margin: 0;
          color: #1f2937;
          font-size: 1.5rem;
        }

        .analytics-section-header p {
          margin: 0;
          color: #6b7280;
        }

        .external-link-btn {
          background: transparent;
          border: none;
          color: #0f766e;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .external-link-btn:hover {
          background: #f0fdfa;
          color: #0f766e;
          transform: scale(1.1);
        }

        .analytics-feature-section {
          background: white;
          border-radius: 8px;
          padding: 3rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          margin-bottom: 2rem;
        }

        .feature-section-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 3rem;
        }

        .section-icon-large {
          margin-bottom: 1rem;
        }

        .analytics-feature-section h3 {
          margin: 0;
          font-size: 1.75rem;
          color: #1f2937;
          font-weight: 600;
        }

        .feature-list-two-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 768px) {
          .feature-list-two-column {
            grid-template-columns: 1fr;
          }
        }

        .feature-column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .feature-item {
          padding: 1.5rem;
          background: #f8fafc;
          border-radius: 8px;
          border-left: 4px solid #0f766e;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .feature-item:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
          border-left-color: #0f766e;
        }

        .feature-item strong {
          color: #0f766e;
          display: block;
          margin-bottom: 0.5rem;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .feature-item span {
          color: #4b5563;
          line-height: 1.6;
          display: block;
        }

        .analytics-link-box {
          background: white;
          border-radius: 8px;
          padding: 4rem 3rem;
          text-align: center;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .link-box-icon {
          opacity: 0.8;
        }

        .link-box-description {
          max-width: 600px;
          margin: 0;
          color: #6b7280;
          font-size: 1.05rem;
          line-height: 1.6;
        }

        .analytics-learn-more {
          padding: 1rem 2.5rem;
          background: white;
          border: 2px solid #0f766e;
          border-radius: 8px;
          color: #0f766e;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
        }

        .analytics-learn-more:hover {
          background: #0f766e;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(15, 118, 110, 0.25);
        }

        .kpi-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          transition: all 0.3s ease;
          border: 1px solid #e2e8f0;
        }

        .kpi-card.patients {
          border-color: #ddd6fe;
        }

        .kpi-card.appointments {
          border-color: #bae6fd;
        }

        .kpi-card.revenue {
          border-color: #d1fae5;
        }

        .kpi-card.encounters {
          border-color: #fed7aa;
        }

        .kpi-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
        }

        .kpi-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #f8fafc;
        }

        .kpi-card.patients .kpi-icon {
          background: #e0f2fe;
        }

        .kpi-card.appointments .kpi-icon {
          background: #dbeafe;
        }

        .kpi-card.revenue .kpi-icon {
          background: #dcfce7;
        }

        .kpi-card.encounters .kpi-icon {
          background: #ffedd5;
        }

        .kpi-content {
          flex: 1;
        }

        .kpi-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .kpi-value {
          font-size: 1.75rem;
          font-weight: bold;
          color: #1f2937;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 1.5rem;
          margin-top: 2rem;
        }

        .date-range-controls {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .quick-filters {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .range-btn {
          padding: 0.5rem 1rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s ease;
        }

        .range-btn:hover {
          border-color: #0f766e;
          color: #0f766e;
        }

        .range-btn.active {
          background: #0f766e;
          border-color: #0f766e;
          color: white;
        }

        .custom-range {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .custom-range input[type="date"] {
          width: 170px;
          max-width: 100%;
          flex: 0 0 170px;
        }

        .custom-range span {
          color: #64748b;
          font-weight: 700;
        }

        .empty-chart {
          padding: 3rem;
          text-align: center;
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          font-weight: 600;
          color: #0f172a;
        }

        .data-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table tbody tr:hover {
          background: #f8fafc;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #9ca3af;
        }

        .muted {
          color: #6b7280;
        }

        .financial-story-header {
          align-items: stretch;
        }

        .finance-icon {
          width: 56px;
          height: 56px;
          border-radius: 8px;
          background: #ecfdf5;
          color: #0f766e;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .story-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .story-link-button,
        .inline-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          text-decoration: none;
          font-weight: 700;
          border-radius: 8px;
          white-space: nowrap;
        }

        .story-link-button {
          min-height: 40px;
          padding: 0.65rem 0.95rem;
          color: #fff;
          background: #0f766e;
          border: 1px solid #0f766e;
        }

        .story-link-button.subtle {
          color: #0f766e;
          background: #fff;
          border-color: #99f6e4;
        }

        .finance-story-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .story-strip-item {
          background: #fff;
          border: 1px solid #dbe4ee;
          border-top: 4px solid #0f766e;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-height: 118px;
        }

        .story-strip-item.warning {
          border-top-color: #d97706;
        }

        .story-strip-item.danger {
          border-top-color: #dc2626;
        }

        .story-strip-label,
        .metric-label {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .story-strip-item strong {
          color: #0f172a;
          font-size: 1.55rem;
          line-height: 1.15;
        }

        .story-strip-item span:last-child,
        .metric-note {
          color: #64748b;
          font-size: 0.88rem;
          line-height: 1.35;
        }

        .finance-command-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.5rem;
        }

        .finance-lower-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 0.9fr;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .finance-panel-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .metric-card-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .metric-card-row.compact-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .metric-tile {
          min-height: 126px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          color: #0f766e;
        }

        .metric-tile strong {
          color: #0f172a;
          font-size: 1.25rem;
          line-height: 1.1;
        }

        .finance-chart {
          min-height: 260px;
        }

        .empty-chart.compact {
          padding: 2rem;
          min-height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .leakage-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .leakage-summary > div {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff7ed;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .leakage-summary strong {
          font-size: 1.35rem;
          color: #9a3412;
        }

        .leakage-summary span {
          color: #64748b;
          font-size: 0.86rem;
          line-height: 1.35;
        }

        .leakage-recovery {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          background: #fff;
        }

        .recovery-meter {
          height: 12px;
          border-radius: 999px;
          background: #fee2e2;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }

        .recovery-meter span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #0f766e;
        }

        .recovery-copy {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.75rem;
          align-items: baseline;
          color: #64748b;
        }

        .recovery-copy strong {
          color: #0f172a;
        }

        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .inline-action {
          color: #0f766e;
          background: #f0fdfa;
          border: 1px solid #99f6e4;
          padding: 0.55rem 0.8rem;
          min-height: 36px;
        }

        .pipeline-steps {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .pipeline-step {
          border: 1px solid #e2e8f0;
          border-top: 4px solid #0f766e;
          border-radius: 8px;
          padding: 0.85rem;
          background: #fff;
          min-height: 92px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .pipeline-step span {
          color: #64748b;
          font-weight: 700;
          font-size: 0.8rem;
        }

        .pipeline-step strong {
          color: #0f172a;
          font-size: 1.65rem;
        }

        .ar-aging-list,
        .provider-story-list,
        .workqueue-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .ar-aging-row {
          display: grid;
          grid-template-columns: minmax(110px, 0.8fr) minmax(120px, 1.6fr) auto;
          gap: 0.75rem;
          align-items: center;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
        }

        .ar-aging-label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .ar-aging-label span {
          color: #64748b;
          font-size: 0.82rem;
        }

        .ar-aging-bar {
          height: 10px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }

        .ar-aging-bar span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #2563eb;
        }

        .provider-story-row,
        .workqueue-item {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 1rem;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          padding: 0.85rem;
        }

        .provider-story-row div,
        .workqueue-item div {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .provider-story-row span,
        .workqueue-item span {
          color: #64748b;
          font-size: 0.86rem;
        }

        .workqueue-item.critical,
        .workqueue-item.error {
          border-left: 4px solid #dc2626;
        }

        .workqueue-item.warning {
          border-left: 4px solid #d97706;
        }

        .severity-pill {
          justify-self: end;
          border-radius: 999px;
          background: #f1f5f9;
          color: #334155 !important;
          padding: 0.25rem 0.65rem;
          font-weight: 800;
          text-transform: capitalize;
        }

        .clean-state {
          min-height: 190px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          text-align: center;
          color: #0f766e;
          background: #f0fdfa;
          border: 1px solid #99f6e4;
          border-radius: 8px;
          padding: 1.25rem;
        }

        .clean-state span {
          color: #64748b;
          max-width: 280px;
          line-height: 1.4;
        }

        .office-pulse-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .office-pulse-grid > div {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          color: #0f766e;
          min-height: 104px;
        }

        .office-pulse-grid span {
          color: #64748b;
          font-weight: 700;
          font-size: 0.82rem;
        }

        .office-pulse-grid strong {
          color: #0f172a;
          font-size: 1.45rem;
        }

        .financial-drilldown-header {
          margin: 1.75rem 0 1rem;
        }

        .financial-drilldown-header h3 {
          margin: 0 0 0.25rem;
          color: #0f172a;
          font-size: 1.2rem;
        }

        .financial-drilldown-header p {
          margin: 0;
          color: #64748b;
        }

        @media (max-width: 1180px) {
          .finance-story-strip,
          .finance-command-grid,
          .finance-lower-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 820px) {
          .financial-story-header,
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .analytics-tabs {
            overflow-x: auto;
          }

          .metric-card-row,
          .leakage-summary,
          .pipeline-steps,
          .office-pulse-grid {
            grid-template-columns: 1fr;
          }

          .ar-aging-row {
            grid-template-columns: 1fr;
          }
        }

        /* Dermatology Tab Styles */
        .derm-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
          margin-top: 2rem;
        }

        .biopsy-stats {
          padding: 1rem 0;
        }

        .biopsy-total {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .biopsy-total .stat-value {
          display: block;
          font-size: 3rem;
          font-weight: 700;
          color: #ec4899;
        }

        .biopsy-total .stat-label {
          color: #6b7280;
          font-size: 0.9rem;
        }

        .biopsy-breakdown {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .biopsy-type {
          background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
          padding: 1rem;
          border-radius: 8px;
          text-align: center;
        }

        .biopsy-type .type-name {
          display: block;
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .biopsy-type .type-count {
          display: block;
          font-size: 1.5rem;
          font-weight: 600;
          color: #be185d;
        }

        .results-breakdown {
          border-top: 1px solid #f3e8ff;
          padding-top: 1rem;
        }

        .results-breakdown h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
          color: #6b7280;
        }

        .result-item {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f9fafb;
        }

        .result-name {
          text-transform: capitalize;
          color: #374151;
        }

        .result-count {
          font-weight: 600;
          color: #be185d;
        }

        .procedure-split {
          padding: 1rem 0;
        }

        .split-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .split-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .split-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }

        .split-info {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          flex: 1;
        }

        .split-name {
          font-weight: 600;
          color: #374151;
          min-width: 80px;
        }

        .split-count {
          color: #6b7280;
          font-size: 0.9rem;
        }

        .split-revenue {
          margin-left: auto;
          font-weight: 600;
          color: #059669;
        }

        .lesion-tracking {
          padding: 1rem 0;
        }

        .lesion-summary {
          display: flex;
          justify-content: space-around;
          margin-bottom: 1.5rem;
        }

        .lesion-stat {
          text-align: center;
        }

        .lesion-stat .stat-value {
          display: block;
          font-size: 2rem;
          font-weight: 700;
          color: #8b5cf6;
        }

        .lesion-stat .stat-label {
          color: #6b7280;
          font-size: 0.85rem;
        }

        .lesion-status h4,
        .lesion-risk h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
          color: #6b7280;
        }

        .status-bar {
          display: flex;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }

        .status-item {
          padding: 0.5rem;
          text-align: center;
          min-width: 60px;
        }

        .status-item span {
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
        }

        .status-item.new { background: #3b82f6; }
        .status-item.monitoring { background: #f59e0b; }
        .status-item.resolved { background: #10b981; }
        .status-item.biopsied { background: #8b5cf6; }

        .risk-items {
          display: flex;
          gap: 1rem;
        }

        .risk-item {
          flex: 1;
          text-align: center;
          padding: 1rem;
          border-radius: 8px;
        }

        .risk-item.high { background: #fee2e2; }
        .risk-item.medium { background: #fef3c7; }
        .risk-item.low { background: #d1fae5; }

        .risk-count {
          display: block;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .risk-item.high .risk-count { color: #dc2626; }
        .risk-item.medium .risk-count { color: #d97706; }
        .risk-item.low .risk-count { color: #059669; }

        .risk-label {
          font-size: 0.8rem;
          color: #6b7280;
        }

        .conditions-list {
          max-height: 400px;
          overflow-y: auto;
        }

        .condition-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          border-bottom: 1px solid #f3e8ff;
        }

        .condition-item:hover {
          background: #faf5ff;
        }

        .condition-rank {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #8b5cf6;
          color: white;
          border-radius: 50%;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .condition-info {
          flex: 1;
        }

        .condition-name {
          display: block;
          font-weight: 500;
          color: #374151;
          font-size: 0.9rem;
        }

        .condition-code {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .condition-stats {
          text-align: right;
        }

        .condition-count {
          display: block;
          font-weight: 600;
          color: #8b5cf6;
        }

        .condition-patients {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .yoy-comparison {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .yoy-metric {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .yoy-name {
          font-weight: 500;
          color: #374151;
          text-transform: capitalize;
          flex: 1;
        }

        .yoy-values {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .yoy-current {
          font-weight: 700;
          color: #1f2937;
        }

        .yoy-change {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .yoy-change.positive {
          background: #d1fae5;
          color: #059669;
        }

        .yoy-change.negative {
          background: #fee2e2;
          color: #dc2626;
        }

        .yoy-lastyear {
          font-size: 0.75rem;
          color: #9ca3af;
          min-width: 120px;
          text-align: right;
        }

        .noshow-analysis {
          padding: 1rem 0;
        }

        .noshow-summary {
          display: flex;
          justify-content: space-around;
          margin-bottom: 1.5rem;
        }

        .noshow-stat {
          text-align: center;
        }

        .noshow-stat .stat-value {
          display: block;
          font-size: 2rem;
          font-weight: 700;
          color: #ef4444;
        }

        .noshow-stat .stat-label {
          color: #6b7280;
          font-size: 0.85rem;
        }

        .noshow-factors h4,
        .noshow-recommendations h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
          color: #6b7280;
        }

        .risk-factor-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .risk-factor {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
        }

        .risk-factor.high {
          background: #fee2e2;
        }

        .factor-name {
          font-weight: 500;
          color: #374151;
        }

        .factor-rate {
          font-weight: 700;
          color: #dc2626;
        }

        .noshow-recommendations ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .noshow-recommendations li {
          margin-bottom: 0.5rem;
          color: #4b5563;
          font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          .derm-metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
