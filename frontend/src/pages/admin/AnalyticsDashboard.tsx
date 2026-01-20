import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Panel, Skeleton } from '../../components/ui';
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
  RadialBarChart,
  RadialBar,
} from 'recharts';
import {
  fetchAnalyticsOverview,
  fetchAppointmentAnalytics,
  fetchRevenueAnalytics,
  fetchPatientAnalytics,
  fetchProviderAnalytics,
  fetchQualityAnalytics,
  fetchRevenueTrend,
  fetchTopDiagnoses,
} from '../../api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AnalyticsFilter {
  startDate?: string;
  endDate?: string;
}

interface OverviewData {
  newPatients: { current: number; previous: number; trend: number };
  appointments: { current: number; previous: number; trend: number; byStatus: any[] };
  revenue: { current: number; previous: number; trend: number };
  collectionRate: number;
}

interface AppointmentData {
  byStatus: any[];
  byType: any[];
  byProvider: any[];
  avgWaitTimeMinutes: number;
}

interface RevenueData {
  summary: {
    totalCharges: number;
    totalBilled: number;
    totalPaid: number;
    totalPending: number;
    totalDenied: number;
    collectionRate: number;
  };
  paymentMethods: any[];
  topProcedures: any[];
}

interface PatientData {
  totalPatients: number;
  newPatientsPerMonth: any[];
  demographics: any[];
  payerMix: any[];
}

interface ProviderData {
  data: any[];
}

interface QualityData {
  encounterCompletion: {
    rate: number;
    signed: number;
    draft: number;
    total: number;
  };
  documentation: {
    chiefComplaintCompliance: number;
    assessmentCompliance: number;
    planCompliance: number;
  };
  followUp: {
    rate: number;
    withFollowUp: number;
    total: number;
  };
}

type DateRangePreset = 'week' | 'month' | 'quarter' | 'year' | 'custom';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function AnalyticsDashboard() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangePreset>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [patients, setPatients] = useState<PatientData | null>(null);
  const [providers, setProviders] = useState<ProviderData | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [topDiagnoses, setTopDiagnoses] = useState<any[]>([]);

  const getDateFilter = useCallback((): AnalyticsFilter => {
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }

    const end = new Date();
    let start = new Date();

    switch (dateRange) {
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(end.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(end.getFullYear() - 1);
        break;
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [dateRange, customStartDate, customEndDate]);

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
        overviewRes,
        appointmentsRes,
        revenueRes,
        patientsRes,
        providersRes,
        qualityRes,
        revenueTrendRes,
        topDiagnosesRes,
      ] = await Promise.all([
        fetchAnalyticsOverview(session.tenantId, session.accessToken, filter),
        fetchAppointmentAnalytics(session.tenantId, session.accessToken, filter),
        fetchRevenueAnalytics(session.tenantId, session.accessToken, filter),
        fetchPatientAnalytics(session.tenantId, session.accessToken, filter),
        fetchProviderAnalytics(session.tenantId, session.accessToken, filter),
        fetchQualityAnalytics(session.tenantId, session.accessToken, filter),
        fetchRevenueTrend(session.tenantId, session.accessToken, filter),
        fetchTopDiagnoses(session.tenantId, session.accessToken, filter),
      ]);

      setOverview(overviewRes);
      setAppointments(appointmentsRes);
      setRevenue(revenueRes);
      setPatients(patientsRes);
      setProviders(providersRes);
      setQuality(qualityRes);
      setRevenueTrend(Array.isArray(revenueTrendRes.data) ? revenueTrendRes.data : []);
      setTopDiagnoses(Array.isArray(topDiagnosesRes.data) ? topDiagnosesRes.data : []);

      if (isRefresh) {
        showSuccess('Dashboard refreshed successfully');
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

  // Auto-refresh every 5 minutes if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData(true);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

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

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    } else if (trend < 0) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
          <polyline points="17 18 23 18 23 12" />
        </svg>
      );
    }
    return null;
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(20);
      doc.text('Analytics Dashboard Report', pageWidth / 2, 15, { align: 'center' });

      // Date range
      doc.setFontSize(10);
      const filter = getDateFilter();
      doc.text(
        `Period: ${filter.startDate} to ${filter.endDate}`,
        pageWidth / 2,
        22,
        { align: 'center' }
      );

      let yPos = 30;

      // Overview Section
      if (overview) {
        doc.setFontSize(14);
        doc.text('Overview', 14, yPos);
        yPos += 7;

        const overviewData = [
          ['Metric', 'Current', 'Previous', 'Trend'],
          [
            'New Patients',
            overview.newPatients.current.toString(),
            overview.newPatients.previous.toString(),
            formatPercent(overview.newPatients.trend),
          ],
          [
            'Appointments',
            overview.appointments.current.toString(),
            overview.appointments.previous.toString(),
            formatPercent(overview.appointments.trend),
          ],
          [
            'Revenue',
            formatCurrency(overview.revenue.current),
            formatCurrency(overview.revenue.previous),
            formatPercent(overview.revenue.trend),
          ],
          ['Collection Rate', formatPercent(overview.collectionRate), '-', '-'],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [overviewData[0]],
          body: overviewData.slice(1),
          theme: 'striped',
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Provider Productivity
      if (providers && providers.data.length > 0) {
        doc.setFontSize(14);
        doc.text('Provider Productivity', 14, yPos);
        yPos += 7;

        const providerData = [
          ['Provider', 'Appointments', 'Patients', 'Revenue'],
          ...providers.data.slice(0, 10).map((p) => [
            p.provider_name,
            p.completed_appointments?.toString() || '0',
            p.unique_patients?.toString() || '0',
            formatCurrency(p.revenue_cents || 0),
          ]),
        ];

        autoTable(doc, {
          startY: yPos,
          head: [providerData[0]],
          body: providerData.slice(1),
          theme: 'striped',
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Quality Metrics
      if (quality) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.text('Quality Metrics', 14, yPos);
        yPos += 7;

        const qualityData = [
          ['Metric', 'Rate'],
          ['Encounter Completion', formatPercent(quality.encounterCompletion.rate)],
          ['Chief Complaint Documentation', formatPercent(quality.documentation.chiefComplaintCompliance)],
          ['Assessment Documentation', formatPercent(quality.documentation.assessmentCompliance)],
          ['Plan Documentation', formatPercent(quality.documentation.planCompliance)],
          ['Follow-up Compliance', formatPercent(quality.followUp.rate)],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [qualityData[0]],
          body: qualityData.slice(1),
          theme: 'striped',
        });
      }

      // Save PDF
      doc.save(`analytics-report-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('PDF report generated successfully');
    } catch (error) {
      showError('Failed to generate PDF report');
    }
  };

  const handleExportExcel = () => {
    try {
      // Create CSV content
      let csvContent = 'Analytics Dashboard Report\n';
      const filter = getDateFilter();
      csvContent += `Period: ${filter.startDate} to ${filter.endDate}\n\n`;

      // Overview
      if (overview) {
        csvContent += 'Overview\n';
        csvContent += 'Metric,Current,Previous,Trend\n';
        csvContent += `New Patients,${overview.newPatients.current},${overview.newPatients.previous},${formatPercent(overview.newPatients.trend)}\n`;
        csvContent += `Appointments,${overview.appointments.current},${overview.appointments.previous},${formatPercent(overview.appointments.trend)}\n`;
        csvContent += `Revenue,${formatCurrency(overview.revenue.current)},${formatCurrency(overview.revenue.previous)},${formatPercent(overview.revenue.trend)}\n`;
        csvContent += `Collection Rate,${formatPercent(overview.collectionRate)},-,-\n\n`;
      }

      // Provider Productivity
      if (providers && providers.data.length > 0) {
        csvContent += 'Provider Productivity\n';
        csvContent += 'Provider,Appointments,Patients,Revenue\n';
        providers.data.forEach((p) => {
          csvContent += `${p.provider_name},${p.completed_appointments || 0},${p.unique_patients || 0},${formatCurrency(p.revenue_cents || 0)}\n`;
        });
        csvContent += '\n';
      }

      // Quality Metrics
      if (quality) {
        csvContent += 'Quality Metrics\n';
        csvContent += 'Metric,Rate\n';
        csvContent += `Encounter Completion,${formatPercent(quality.encounterCompletion.rate)}\n`;
        csvContent += `Chief Complaint Documentation,${formatPercent(quality.documentation.chiefComplaintCompliance)}\n`;
        csvContent += `Assessment Documentation,${formatPercent(quality.documentation.assessmentCompliance)}\n`;
        csvContent += `Plan Documentation,${formatPercent(quality.documentation.planCompliance)}\n`;
        csvContent += `Follow-up Compliance,${formatPercent(quality.followUp.rate)}\n`;
      }

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `analytics-report-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      showSuccess('Excel report generated successfully');
    } catch (error) {
      showError('Failed to generate Excel report');
    }
  };

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <div className="page-header">
          <h1>Analytics Dashboard</h1>
        </div>
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" height={140} />
          ))}
        </div>
        <div className="charts-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="card" height={350} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="page-header">
        <div className="header-left">
          <h1>Analytics Dashboard</h1>
          <p className="subtitle">Comprehensive practice insights and metrics</p>
        </div>
        <div className="header-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (5 min)</span>
          </label>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-secondary"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={handleExportPDF} className="btn-primary">
            Export PDF
          </button>
          <button type="button" onClick={handleExportExcel} className="btn-primary">
            Export Excel
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Panel title="Date Range">
        <div className="date-range-controls">
          <div className="quick-filters">
            {(['week', 'month', 'quarter', 'year', 'custom'] as DateRangePreset[]).map((range) => (
              <button
                key={range}
                type="button"
                className={`range-btn ${dateRange === range ? 'active' : ''}`}
                onClick={() => setDateRange(range)}
              >
                {range === 'week'
                  ? 'Last 7 Days'
                  : range === 'month'
                  ? 'Last 30 Days'
                  : range === 'quarter'
                  ? 'Last Quarter'
                  : range === 'year'
                  ? 'Last Year'
                  : 'Custom Range'}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
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
                onClick={() => loadData()}
                disabled={!customStartDate || !customEndDate}
                className="btn-primary"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </Panel>

      {/* KPI Cards */}
      {overview && (
        <div className="kpi-grid">
          <div className="kpi-card patients">
            <div className="kpi-header">
              <div className="kpi-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="kpi-trend">
                {getTrendIcon(overview.newPatients.trend)}
                <span className={overview.newPatients.trend > 0 ? 'positive' : overview.newPatients.trend < 0 ? 'negative' : ''}>
                  {formatPercent(Math.abs(overview.newPatients.trend))}
                </span>
              </div>
            </div>
            <div className="kpi-content">
              <div className="kpi-label">New Patients</div>
              <div className="kpi-value">{overview.newPatients.current.toLocaleString()}</div>
              <div className="kpi-comparison">vs {overview.newPatients.previous} previous period</div>
            </div>
          </div>

          <div className="kpi-card appointments">
            <div className="kpi-header">
              <div className="kpi-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="kpi-trend">
                {getTrendIcon(overview.appointments.trend)}
                <span className={overview.appointments.trend > 0 ? 'positive' : overview.appointments.trend < 0 ? 'negative' : ''}>
                  {formatPercent(Math.abs(overview.appointments.trend))}
                </span>
              </div>
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Total Appointments</div>
              <div className="kpi-value">{overview.appointments.current.toLocaleString()}</div>
              <div className="kpi-comparison">vs {overview.appointments.previous} previous period</div>
            </div>
          </div>

          <div className="kpi-card revenue">
            <div className="kpi-header">
              <div className="kpi-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="kpi-trend">
                {getTrendIcon(overview.revenue.trend)}
                <span className={overview.revenue.trend > 0 ? 'positive' : overview.revenue.trend < 0 ? 'negative' : ''}>
                  {formatPercent(Math.abs(overview.revenue.trend))}
                </span>
              </div>
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Revenue</div>
              <div className="kpi-value">{formatCurrency(overview.revenue.current)}</div>
              <div className="kpi-comparison">vs {formatCurrency(overview.revenue.previous)} previous period</div>
            </div>
          </div>

          <div className="kpi-card collection">
            <div className="kpi-header">
              <div className="kpi-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Collection Rate</div>
              <div className="kpi-value">{formatPercent(overview.collectionRate)}</div>
              <div className="kpi-comparison">Overall practice performance</div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Revenue Trend */}
        <Panel title="Revenue Over Time" className="chart-panel">
          {revenueTrend.length === 0 ? (
            <div className="empty-chart">
              <p>No revenue data available for selected period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#6b7280" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} stroke="#6b7280" />
                <Tooltip
                  labelFormatter={formatDate}
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Appointment Status Breakdown */}
        {appointments && appointments.byStatus.length > 0 && (
          <Panel title="Appointments by Status" className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={appointments.byStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.status}: ${entry.count}`}
                >
                  {appointments.byStatus.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {/* Provider Productivity */}
        {providers && providers.data.length > 0 && (
          <Panel title="Provider Revenue" className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providers.data.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} stroke="#6b7280" />
                <YAxis type="category" dataKey="provider_name" width={120} stroke="#6b7280" />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Bar dataKey="revenue_cents" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {/* Payer Mix */}
        {patients && patients.payerMix.length > 0 && (
          <Panel title="Payer Mix" className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={patients.payerMix}
                  dataKey="count"
                  nameKey="insurance_provider"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  label
                >
                  {patients.payerMix.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {/* Top Diagnoses */}
        {topDiagnoses.length > 0 && (
          <Panel title="Top Diagnoses" className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topDiagnoses.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" />
                <YAxis type="category" dataKey="name" width={150} stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#06b6d4" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {/* Collection Rate Gauge */}
        {revenue && (
          <Panel title="Collection Rate" className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="100%"
                data={[{ name: 'Collection Rate', value: revenue.summary.collectionRate, fill: '#10b981' }]}
                startAngle={180}
                endAngle={0}
              >
                <RadialBar
                  minAngle={15}
                  background
                  clockWise
                  dataKey="value"
                  cornerRadius={10}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="gauge-text">
                  <tspan fontSize="32" fontWeight="bold" fill="#1f2937">
                    {formatPercent(revenue.summary.collectionRate)}
                  </tspan>
                  <tspan x="50%" dy="1.5em" fontSize="14" fill="#6b7280">
                    Collection Rate
                  </tspan>
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </div>

      {/* Quality Metrics Section */}
      {quality && (
        <Panel title="Quality Measures" className="quality-panel">
          <div className="quality-metrics">
            <div className="quality-card">
              <div className="quality-header">
                <h4>Encounter Completion</h4>
                <span className="quality-rate">{formatPercent(quality.encounterCompletion.rate)}</span>
              </div>
              <div className="quality-details">
                <div className="detail-row">
                  <span>Signed:</span>
                  <strong>{quality.encounterCompletion.signed}</strong>
                </div>
                <div className="detail-row">
                  <span>Draft:</span>
                  <strong>{quality.encounterCompletion.draft}</strong>
                </div>
                <div className="detail-row">
                  <span>Total:</span>
                  <strong>{quality.encounterCompletion.total}</strong>
                </div>
              </div>
            </div>

            <div className="quality-card">
              <div className="quality-header">
                <h4>Documentation Compliance</h4>
              </div>
              <div className="quality-details">
                <div className="detail-row">
                  <span>Chief Complaint:</span>
                  <strong>{formatPercent(quality.documentation.chiefComplaintCompliance)}</strong>
                </div>
                <div className="detail-row">
                  <span>Assessment:</span>
                  <strong>{formatPercent(quality.documentation.assessmentCompliance)}</strong>
                </div>
                <div className="detail-row">
                  <span>Plan:</span>
                  <strong>{formatPercent(quality.documentation.planCompliance)}</strong>
                </div>
              </div>
            </div>

            <div className="quality-card">
              <div className="quality-header">
                <h4>Follow-up Compliance</h4>
                <span className="quality-rate">{formatPercent(quality.followUp.rate)}</span>
              </div>
              <div className="quality-details">
                <div className="detail-row">
                  <span>With Follow-up:</span>
                  <strong>{quality.followUp.withFollowUp}</strong>
                </div>
                <div className="detail-row">
                  <span>Total Signed:</span>
                  <strong>{quality.followUp.total}</strong>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Provider Performance Table */}
      {providers && providers.data.length > 0 && (
        <Panel title="Provider Performance Details" className="table-panel">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Completed</th>
                  <th>Cancelled</th>
                  <th>No Shows</th>
                  <th>Patients</th>
                  <th>Encounters</th>
                  <th>Revenue</th>
                  <th>Avg Visit (min)</th>
                </tr>
              </thead>
              <tbody>
                {providers.data.map((provider) => (
                  <tr key={provider.id}>
                    <td><strong>{provider.provider_name}</strong></td>
                    <td>{provider.completed_appointments || 0}</td>
                    <td>{provider.cancelled_appointments || 0}</td>
                    <td>{provider.no_shows || 0}</td>
                    <td>{provider.unique_patients || 0}</td>
                    <td>{provider.total_encounters || 0}</td>
                    <td>{formatCurrency(provider.revenue_cents || 0)}</td>
                    <td>{Math.round(provider.avg_visit_duration_minutes || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <style>{`
        .analytics-dashboard {
          padding: 1.5rem;
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
          gap: 2rem;
        }

        .header-left {
          flex: 1;
        }

        .header-left h1 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 2rem;
        }

        .subtitle {
          margin: 0;
          color: #6b7280;
          font-size: 1rem;
        }

        .header-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .auto-refresh-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: white;
          border-radius: 8px;
          border: 2px solid #e5e7eb;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .auto-refresh-toggle:hover {
          border-color: #8b5cf6;
        }

        .auto-refresh-toggle input[type="checkbox"] {
          cursor: pointer;
        }

        .auto-refresh-toggle span {
          font-size: 0.875rem;
          color: #374151;
          font-weight: 500;
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
          padding: 0.625rem 1.25rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s ease;
          font-size: 0.875rem;
        }

        .range-btn:hover {
          border-color: #8b5cf6;
          color: #8b5cf6;
          transform: translateY(-1px);
        }

        .range-btn.active {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          border-color: #8b5cf6;
          color: white;
          box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);
        }

        .custom-range {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
          padding-top: 0.5rem;
        }

        .custom-range input[type="date"] {
          padding: 0.5rem;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .custom-range span {
          color: #6b7280;
          font-weight: 500;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .kpi-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
          border-left: 4px solid;
        }

        .kpi-card.patients {
          border-left-color: #8b5cf6;
        }

        .kpi-card.appointments {
          border-left-color: #06b6d4;
        }

        .kpi-card.revenue {
          border-left-color: #10b981;
        }

        .kpi-card.collection {
          border-left-color: #f59e0b;
        }

        .kpi-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(139, 92, 246, 0.15);
        }

        .kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .kpi-icon {
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

        .kpi-card.collection .kpi-icon {
          background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
        }

        .kpi-icon svg {
          stroke-width: 2;
        }

        .kpi-trend {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .kpi-trend .positive {
          color: #10b981;
        }

        .kpi-trend .negative {
          color: #ef4444;
        }

        .kpi-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .kpi-value {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 0.25rem;
        }

        .kpi-comparison {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        @media (max-width: 1200px) {
          .charts-grid {
            grid-template-columns: 1fr;
          }
        }

        .chart-panel {
          min-height: 350px;
        }

        .empty-chart {
          padding: 4rem;
          text-align: center;
          color: #9ca3af;
        }

        .quality-panel {
          margin-bottom: 2rem;
        }

        .quality-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .quality-card {
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
          border-radius: 10px;
          padding: 1.5rem;
          border-left: 4px solid #8b5cf6;
          transition: all 0.3s ease;
        }

        .quality-card:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
        }

        .quality-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .quality-header h4 {
          margin: 0;
          color: #1f2937;
          font-size: 1.1rem;
        }

        .quality-rate {
          font-size: 1.5rem;
          font-weight: bold;
          color: #8b5cf6;
        }

        .quality-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e9d5ff;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-row span {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .detail-row strong {
          color: #1f2937;
          font-size: 1rem;
        }

        .table-panel {
          margin-bottom: 2rem;
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .data-table th {
          text-align: left;
          padding: 1rem;
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
          border-bottom: 2px solid #e9d5ff;
          font-weight: 600;
          color: #581c87;
          white-space: nowrap;
        }

        .data-table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #f3e8ff;
          color: #374151;
        }

        .data-table tbody tr {
          transition: background-color 0.2s ease;
        }

        .data-table tbody tr:hover {
          background: #faf5ff;
        }

        .data-table tbody tr:last-child td {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
}
