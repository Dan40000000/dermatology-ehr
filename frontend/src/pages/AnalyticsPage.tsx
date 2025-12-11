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

type DateRangePreset = 'today' | 'week' | 'month' | '30days' | 'year';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

export function AnalyticsPage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      ] = await Promise.all([
        fetchDashboardKPIs(session.tenantId, session.accessToken, filter),
        fetchAppointmentsTrend(session.tenantId, session.accessToken, filter),
        fetchRevenueTrend(session.tenantId, session.accessToken, filter),
        fetchTopDiagnoses(session.tenantId, session.accessToken, filter),
        fetchTopProcedures(session.tenantId, session.accessToken, filter),
        fetchProviderProductivity(session.tenantId, session.accessToken, filter),
        fetchPatientDemographics(session.tenantId, session.accessToken),
        fetchAppointmentTypesAnalytics(session.tenantId, session.accessToken, filter),
      ]);

      setKpis(kpisRes);
      setAppointmentsTrend(appointmentsTrendRes.data || []);
      setRevenueTrend(revenueTrendRes.data || []);
      setTopDiagnoses(topDiagnosesRes.data || []);
      setTopProcedures(topProceduresRes.data || []);
      setProviderStats(providerProductivityRes.data || []);
      setDemographics(demographicsRes);
      setAppointmentTypes(appointmentTypesRes.data || []);

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
        <h1>Analytics Dashboard</h1>
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

      {/* Charts Grid */}
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
          {!demographics || demographics.ageGroups.length === 0 ? (
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
      </div>

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
                {providerStats.map((provider) => (
                  <tr key={provider.id}>
                    <td>{provider.provider_name}</td>
                    <td>{provider.patients_seen}</td>
                    <td>{provider.appointments}</td>
                    <td>{formatCurrency(provider.revenue_cents)}</td>
                    <td>
                      {provider.patients_seen > 0
                        ? formatCurrency(provider.revenue_cents / provider.patients_seen)
                        : '$0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
