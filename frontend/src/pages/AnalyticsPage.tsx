import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
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
  fetchDermatologyMetrics,
  fetchYoYComparison,
  fetchNoShowRiskAnalysis,
} from '../api';

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

type DateRangePreset = 'today' | 'week' | 'month' | '30days' | 'year';
type AnalyticsTab = 'financials' | 'clinical' | 'compliance' | 'inventory' | 'dermatology';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function AnalyticsPage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();

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
        dermMetricsRes,
        yoyComparisonRes,
        noShowRiskRes,
      ] = await Promise.all([
        fetchDashboardKPIs(session.tenantId, session.accessToken, filter),
        fetchAppointmentsTrend(session.tenantId, session.accessToken, filter),
        fetchRevenueTrend(session.tenantId, session.accessToken, filter),
        fetchTopDiagnoses(session.tenantId, session.accessToken, filter),
        fetchTopProcedures(session.tenantId, session.accessToken, filter),
        fetchProviderProductivity(session.tenantId, session.accessToken, filter),
        fetchPatientDemographics(session.tenantId, session.accessToken),
        fetchAppointmentTypesAnalytics(session.tenantId, session.accessToken, filter),
        fetchDermatologyMetrics(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchYoYComparison(session.tenantId, session.accessToken, filter).catch(() => null),
        fetchNoShowRiskAnalysis(session.tenantId, session.accessToken, filter).catch(() => null),
      ]);

      setKpis(kpisRes);
      setAppointmentsTrend(Array.isArray(appointmentsTrendRes.data) ? appointmentsTrendRes.data : []);
      setRevenueTrend(Array.isArray(revenueTrendRes.data) ? revenueTrendRes.data : []);
      setTopDiagnoses(Array.isArray(topDiagnosesRes.data) ? topDiagnosesRes.data : []);
      setTopProcedures(Array.isArray(topProceduresRes.data) ? topProceduresRes.data : []);
      setProviderStats(Array.isArray(providerProductivityRes.data) ? providerProductivityRes.data : []);
      setDemographics(demographicsRes);
      setAppointmentTypes(Array.isArray(appointmentTypesRes.data) ? appointmentTypesRes.data : []);
      setDermMetrics(dermMetricsRes);
      setYoyComparison(yoyComparisonRes);
      setNoShowRisk(noShowRiskRes);

      if (isRefresh) {
        showSuccess('Dashboard refreshed');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, showError, showSuccess, getDateFilter]);

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
      loadData();
    }
  };

  const clearCustomRange = () => {
    setUseCustomRange(false);
    setCustomStartDate('');
    setCustomEndDate('');
    loadData();
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
          onClick={() => setActiveTab('financials')}
        >
          Financials
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'clinical' ? 'active' : ''}`}
          onClick={() => setActiveTab('clinical')}
        >
          Clinical and Operational
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'compliance' ? 'active' : ''}`}
          onClick={() => setActiveTab('compliance')}
        >
          Compliance
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeTab === 'dermatology' ? 'active' : ''}`}
          onClick={() => setActiveTab('dermatology')}
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
      <div className="kpi-cards">
        <div className="kpi-card patients">
          <div className="kpi-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Total Patients</div>
            <div className="kpi-value">{kpis?.totalPatients.toLocaleString() || 0}</div>
          </div>
        </div>

        <div className="kpi-card appointments">
          <div className="kpi-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Today's Appointments</div>
            <div className="kpi-value">{kpis?.todayAppointments || 0}</div>
          </div>
        </div>

        <div className="kpi-card revenue">
          <div className="kpi-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="kpi-content">
            <div className="kpi-label">This Month's Revenue</div>
            <div className="kpi-value">{formatCurrency(kpis?.monthRevenue || 0)}</div>
          </div>
        </div>

        <div className="kpi-card encounters">
          <div className="kpi-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Active Encounters</div>
            <div className="kpi-value">{kpis?.activeEncounters || 0}</div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'financials' && (
        <div className="tab-content">
          <div className="analytics-section-header">
            <div className="section-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <div className="section-header-content">
              <div className="section-title-row">
                <h2>Financial Reports</h2>
                <button className="external-link-btn" title="Open external dashboard">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              </div>
              <p>View a graphical display of several key metrics, critical for the management of your practice</p>
            </div>
          </div>

          <div className="analytics-feature-section">
            <div className="feature-section-header">
              <div className="section-icon-large">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3>Real-Time Financial Reports</h3>
            </div>
            <div className="feature-list-two-column">
              <div className="feature-column">
                <div className="feature-item">
                  <strong>Charges</strong>
                  <span>View all the charges in the system for a specific time period.</span>
                </div>
                <div className="feature-item">
                  <strong>Outstanding Charges</strong>
                  <span>View all the outstanding line items charges for a specific time period.</span>
                </div>
              </div>
              <div className="feature-column">
                <div className="feature-item">
                  <strong>Payments Received</strong>
                  <span>Summarize all payments received for a specific time period.</span>
                </div>
                <div className="feature-item">
                  <strong>Refunds Issued</strong>
                  <span>Summarize all refunds issued for a specific time period.</span>
                </div>
              </div>
            </div>
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
      )}

      <style>{`
        .analytics-page {
          padding: 1.5rem;
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
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
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.1);
        }

        .analytics-tab {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #64748b;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .analytics-tab:hover {
          color: #7c3aed;
          background: #faf5ff;
        }

        .analytics-tab.active {
          color: white;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);
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
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
          border-left: 4px solid #8b5cf6;
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
          color: #8b5cf6;
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .external-link-btn:hover {
          background: #faf5ff;
          color: #7c3aed;
          transform: scale(1.1);
        }

        .analytics-feature-section {
          background: white;
          border-radius: 12px;
          padding: 3rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
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
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
          border-radius: 10px;
          border-left: 4px solid #8b5cf6;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .feature-item:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
          border-left-color: #7c3aed;
        }

        .feature-item strong {
          color: #7c3aed;
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
          border-radius: 12px;
          padding: 4rem 3rem;
          text-align: center;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
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
          border: 2px solid #7c3aed;
          border-radius: 10px;
          color: #7c3aed;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
        }

        .analytics-learn-more:hover {
          background: #7c3aed;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(124, 58, 237, 0.3);
        }

        .kpi-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.25rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          transition: all 0.3s ease;
          border: 2px solid transparent;
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
          box-shadow: 0 8px 16px rgba(139, 92, 246, 0.15);
        }

        .kpi-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
        }

        .kpi-card.patients .kpi-icon {
          background: linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%);
        }

        .kpi-card.appointments .kpi-icon {
          background: linear-gradient(135deg, #bae6fd 0%, #7dd3fc 100%);
        }

        .kpi-card.revenue .kpi-icon {
          background: linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%);
        }

        .kpi-card.encounters .kpi-icon {
          background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
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
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s ease;
        }

        .range-btn:hover {
          border-color: #8b5cf6;
          color: #8b5cf6;
        }

        .range-btn.active {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          border-color: #8b5cf6;
          color: white;
        }

        .custom-range {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
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
          background: #faf5ff;
          border-bottom: 2px solid #e9d5ff;
          font-weight: 600;
          color: #581c87;
        }

        .data-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #f3e8ff;
        }

        .data-table tbody tr:hover {
          background: #faf5ff;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #9ca3af;
        }

        .muted {
          color: #6b7280;
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
