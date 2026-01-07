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
type AnalyticsTab = 'financials' | 'clinical' | 'compliance' | 'inventory';

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
            <div>
              <h2>Financial Reports</h2>
              <p>View a graphical display of several key metrics, critical for the management of your practice</p>
            </div>
          </div>

          <div className="analytics-feature-section">
            <div className="section-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3>Real-Time Financial Reports</h3>
            <div className="feature-list">
              <div className="feature-item">
                <strong>Charges</strong> - View all the charges in the system for a specific time period.
              </div>
              <div className="feature-item">
                <strong>Payments Received</strong> - Summarize all payments received for a specific time period.
              </div>
              <div className="feature-item">
                <strong>Outstanding Charges</strong> - View all the outstanding line items charges for a specific time period.
              </div>
              <div className="feature-item">
                <strong>Refunds Issued</strong> - Summarize all refunds issued for a specific time period.
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
            <div>
              <h2>Data Explorer</h2>
              <p>View clinical data sets and create custom reports for your practice.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More.</button>
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
            <div>
              <h2>Compliance Reports</h2>
              <p>View Compliance and Specialized Registry reports for your practice.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More.</button>
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
            <div>
              <h2>Inventory</h2>
              <p>View your practice's Inventory Management data and create custom reports.</p>
            </div>
          </div>

          <div className="analytics-link-box">
            <button className="analytics-learn-more">Analytics 2.0: Click to Learn More.</button>
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

        .analytics-section-header h2 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 1.5rem;
        }

        .analytics-section-header p {
          margin: 0;
          color: #6b7280;
        }

        .analytics-feature-section {
          background: white;
          border-radius: 12px;
          padding: 3rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          text-align: center;
          margin-bottom: 2rem;
        }

        .analytics-feature-section h3 {
          margin: 1rem 0 2rem 0;
          font-size: 1.5rem;
          color: #1f2937;
        }

        .feature-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          text-align: left;
        }

        .feature-item {
          padding: 1.25rem;
          background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%);
          border-radius: 8px;
          border-left: 3px solid #8b5cf6;
        }

        .feature-item strong {
          color: #7c3aed;
          display: block;
          margin-bottom: 0.5rem;
        }

        .analytics-link-box {
          background: white;
          border-radius: 12px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .analytics-learn-more {
          padding: 1rem 2rem;
          background: white;
          border: 2px solid #7c3aed;
          border-radius: 8px;
          color: #7c3aed;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .analytics-learn-more:hover {
          background: #7c3aed;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
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
      `}</style>
    </div>
  );
}
