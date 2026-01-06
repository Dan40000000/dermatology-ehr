import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchQualityMeasures,
  fetchMeasurePerformance,
  fetchGapClosureList,
  fetchMIPSReport,
  submitMIPSData,
  closeQualityGap,
  recalculateQualityMeasures,
  type QualityMeasure,
  type MeasurePerformance,
  type QualityGap,
} from "../api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function QualityPage() {
  const { user, session } = useAuth();
  const accessToken = session?.accessToken || "";
  const tenantId = session?.tenantId || "";

  if (!user || (user.role !== 'admin' && user.role !== 'provider')) {
    return <Navigate to="/home" replace />;
  }

  const [activeTab, setActiveTab] = useState<'dashboard' | 'gaps' | 'reports' | 'submit'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<number | undefined>();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedMeasure, setSelectedMeasure] = useState("");

  // Data
  const [measures, setMeasures] = useState<QualityMeasure[]>([]);
  const [performance, setPerformance] = useState<MeasurePerformance[]>([]);
  const [gaps, setGaps] = useState<QualityGap[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [selectedYear, selectedQuarter, selectedProvider]);

  async function loadDashboardData() {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const [measuresData, performanceData] = await Promise.all([
        fetchQualityMeasures(tenantId, accessToken, { active: true }),
        fetchMeasurePerformance(tenantId, accessToken, {
          year: selectedYear,
          quarter: selectedQuarter,
          providerId: selectedProvider || undefined,
        }),
      ]);
      setMeasures(measuresData);
      setPerformance(performanceData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadGaps() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const gapsData = await fetchGapClosureList(tenantId, accessToken, {
        measureId: selectedMeasure || undefined,
        providerId: selectedProvider || undefined,
        status: 'open',
      });
      setGaps(gapsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseGap(gapId: string, notes: string) {
    if (!accessToken) return;
    try {
      await closeQualityGap(tenantId, accessToken, gapId, notes);
      loadGaps();
    } catch (err: any) {
      alert("Failed to close gap: " + err.message);
    }
  }

  async function handleRecalculate() {
    if (!accessToken) return;
    const startDate = `${selectedYear}-01-01`;
    const endDate = `${selectedYear}-12-31`;

    setLoading(true);
    try {
      await recalculateQualityMeasures(tenantId, accessToken, {
        startDate,
        endDate,
        providerId: selectedProvider || undefined,
      });
      loadDashboardData();
      alert("Quality measures recalculated successfully");
    } catch (err: any) {
      alert("Failed to recalculate: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitMIPS() {
    if (!accessToken || !selectedQuarter) {
      alert("Please select a quarter for MIPS submission");
      return;
    }

    try {
      await submitMIPSData(tenantId, accessToken, {
        year: selectedYear,
        quarter: selectedQuarter,
        measures: performance,
        providerId: selectedProvider || undefined,
      });
      alert("MIPS data submitted successfully");
    } catch (err: any) {
      alert("Failed to submit MIPS data: " + err.message);
    }
  }

  async function downloadCSV() {
    const headers = [
      'Measure Code',
      'Measure Name',
      'Category',
      'Numerator',
      'Denominator',
      'Exclusions',
      'Performance Rate',
    ];

    const rows = performance.map(p => [
      p.measure_code,
      p.measure_name,
      p.category,
      p.numerator_count.toString(),
      p.denominator_count.toString(),
      p.exclusion_count.toString(),
      p.performance_rate + '%',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quality-performance-${selectedYear}.csv`;
    a.click();
  }

  // Group performance by category
  const performanceByCategory = performance.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, MeasurePerformance[]>);

  // Calculate average performance
  const avgPerformance = performance.length > 0
    ? performance.reduce((sum, p) => sum + parseFloat(p.performance_rate), 0) / performance.length
    : 0;

  // Performance chart data
  const chartData = performance.slice(0, 10).map(p => ({
    name: p.measure_code,
    rate: parseFloat(p.performance_rate),
    target: 80, // Standard benchmark
  }));

  // Category distribution
  const categoryData = Object.keys(performanceByCategory).map(cat => ({
    name: cat,
    value: performanceByCategory[cat].length,
  }));

  return (
    <div style={{ padding: '1.5rem', maxWidth: '80rem', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937' }}>Quality Measures & MIPS Reporting</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleRecalculate}
            style={{ padding: '0.5rem 1rem', background: loading ? '#9ca3af' : '#2563eb', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#1d4ed8')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.background = '#2563eb')}
          >
            Recalculate
          </button>
          <button
            onClick={downloadCSV}
            style={{ padding: '0.5rem 1rem', background: '#16a34a', color: 'white', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#15803d'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#16a34a'}
          >
            Download CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.25rem', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '0.25rem', padding: '0.5rem 0.75rem' }}
          >
            {[2025, 2024, 2023].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>Quarter (Optional)</label>
          <select
            value={selectedQuarter || ''}
            onChange={(e) => setSelectedQuarter(e.target.value ? parseInt(e.target.value) : undefined)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '0.25rem', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Year</option>
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>Provider (Optional)</label>
          <input
            type="text"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            placeholder="Provider ID"
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '0.25rem', padding: '0.5rem 0.75rem' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>Measure (Optional)</label>
          <input
            type="text"
            value={selectedMeasure}
            onChange={(e) => setSelectedMeasure(e.target.value)}
            placeholder="Measure ID"
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '0.25rem', padding: '0.5rem 0.75rem' }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['dashboard', 'gaps', 'reports', 'submit'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab as any);
                if (tab === 'gaps') loadGaps();
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      )}

      {!loading && activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total Measures</h3>
              <p className="text-3xl font-bold text-gray-900">{measures.length}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Performance Tracked</h3>
              <p className="text-3xl font-bold text-gray-900">{performance.length}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Average Performance</h3>
              <p className="text-3xl font-bold text-green-600">{avgPerformance.toFixed(1)}%</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Open Gaps</h3>
              <p className="text-3xl font-bold text-orange-600">{gaps.length}</p>
            </div>
          </div>

          {/* Performance Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Performance by Measure</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="rate" fill="#3b82f6" name="Performance Rate %" />
                  <Bar dataKey="target" fill="#10b981" name="Target %" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-12">No performance data available</p>
            )}
          </div>

          {/* Category Distribution */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Measures by Category</h3>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500 text-center py-12">No category data</p>
              )}
            </div>

            {/* Performance by Category Table */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Performance by Category</h3>
              <div className="space-y-3">
                {Object.entries(performanceByCategory).map(([category, items]) => {
                  const catAvg = items.reduce((sum, p) => sum + parseFloat(p.performance_rate), 0) / items.length;
                  return (
                    <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <p className="font-medium text-gray-900">{category}</p>
                        <p className="text-sm text-gray-500">{items.length} measures</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-600">{catAvg.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Detailed Performance Table */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Detailed Performance</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Measure</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Numerator</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Denominator</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Performance</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {performance.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {p.measure_code}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{p.measure_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {p.numerator_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                        {p.denominator_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            parseFloat(p.performance_rate) >= 80
                              ? 'bg-green-100 text-green-800'
                              : parseFloat(p.performance_rate) >= 60
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {p.performance_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {performance.length === 0 && (
                <p className="text-center py-8 text-gray-500">No performance data available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'gaps' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Gap Closure Opportunities</h3>
          <div className="space-y-4">
            {gaps.map((gap) => (
              <div key={gap.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded ${
                          gap.priority === 'high'
                            ? 'bg-red-100 text-red-800'
                            : gap.priority === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {gap.priority.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">{gap.measure_code}</span>
                    </div>
                    <h4 className="font-medium text-gray-900">{gap.patient_name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{gap.gap_description}</p>
                    <div className="mt-2 text-sm text-gray-500">
                      <span>Measure: {gap.measure_name}</span>
                      {gap.due_date && <span className="ml-4">Due: {new Date(gap.due_date).toLocaleDateString()}</span>}
                      {gap.phone && <span className="ml-4">Phone: {gap.phone}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const notes = prompt("Enter intervention notes:");
                      if (notes) handleCloseGap(gap.id, notes);
                    }}
                    className="ml-4 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Close Gap
                  </button>
                </div>
              </div>
            ))}
            {gaps.length === 0 && (
              <p className="text-center py-12 text-gray-500">No open gaps found</p>
            )}
          </div>
        </div>
      )}

      {!loading && activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Available Reports</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition text-left">
                <h4 className="font-semibold text-gray-900 mb-2">MIPS Quality Report</h4>
                <p className="text-sm text-gray-600">Generate comprehensive MIPS quality measure report for submission</p>
              </button>
              <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition text-left">
                <h4 className="font-semibold text-gray-900 mb-2">PQRS Report</h4>
                <p className="text-sm text-gray-600">Physician Quality Reporting System summary and analysis</p>
              </button>
              <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition text-left">
                <h4 className="font-semibold text-gray-900 mb-2">Provider Comparison</h4>
                <p className="text-sm text-gray-600">Compare performance across providers in your practice</p>
              </button>
              <button className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition text-left">
                <h4 className="font-semibold text-gray-900 mb-2">Trend Analysis</h4>
                <p className="text-sm text-gray-600">View performance trends over time for all measures</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'submit' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">MIPS Submission Wizard</h3>
          <div className="max-w-2xl">
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  Review your quality measure performance and submit to MIPS for the selected period.
                  Make sure all data is accurate before submission.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Submission Year</label>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Submission Quarter *</label>
                <select
                  value={selectedQuarter || ''}
                  onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                >
                  <option value="">Select Quarter</option>
                  <option value="1">Q1 (Jan-Mar)</option>
                  <option value="2">Q2 (Apr-Jun)</option>
                  <option value="3">Q3 (Jul-Sep)</option>
                  <option value="4">Q4 (Oct-Dec)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provider ID (Optional)</label>
                <input
                  type="text"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  placeholder="Leave blank for practice-wide submission"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>

              <div className="pt-4">
                <h4 className="font-medium text-gray-900 mb-2">Measures to Submit ({performance.length})</h4>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded p-3">
                  {performance.map((p) => (
                    <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                      <span className="text-sm text-gray-700">{p.measure_code}: {p.measure_name}</span>
                      <span className="text-sm font-medium text-gray-900">{p.performance_rate}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSubmitMIPS}
                  disabled={!selectedQuarter || performance.length === 0}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  Submit to MIPS
                </button>
                <button
                  onClick={() => downloadCSV()}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Download Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
