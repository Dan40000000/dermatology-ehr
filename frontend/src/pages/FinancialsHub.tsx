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
  fetchPaymentsSummary,
} from '../api/financials';

type TabType = 'dashboard' | 'snapshots' | 'bills' | 'payments' | 'analytics' | 'fees' | 'statements' | 'reports';
type SnapshotPagePeriod = SnapshotMetricCard['key'] | 'custom';

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

const TABS: TabConfig[] = [
  { key: 'dashboard', label: 'Overview', icon: '', description: 'Key metrics & A/R overview' },
  { key: 'snapshots', label: 'Snapshots', icon: '', description: 'Daily, weekly, monthly deep dives' },
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
      const [dashboard, paymentsSummary, agingSummary, claimsResponse, billsResponse] = await Promise.all([
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
      ]);
      const snapshots = dashboard?.snapshots || {};
      const claims = Array.isArray(claimsResponse?.claims) ? claimsResponse.claims : [];
      setRecentBills(Array.isArray(billsResponse?.bills) ? billsResponse.bills : []);
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

  // ─── Tab label map for sidebar ───────────────────────────────────────────
  const tabIcons: Record<TabType, string> = {
    dashboard: '◈', snapshots: '◉', bills: '◧', payments: '◨',
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

                {/* Recent Bills Table */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                  Recent Bills
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Bill ID</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Patient</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Payer</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Insurance</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Patient</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Balance</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBills.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                          No bills posted yet. Completed encounter charges will appear here automatically.
                        </td>
                      </tr>
                    )}
                    {recentBills.map(bill => (
                      <tr key={bill.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{bill.billNumber || bill.id}</td>
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
 
