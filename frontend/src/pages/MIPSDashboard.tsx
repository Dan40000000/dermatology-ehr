import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasAnyRole, hasRole } from '../utils/roles';
import {
  fetchMIPSProviderDashboard,
  fetchImprovementActivities,
  fetchMeasureAlerts,
  generateMIPSProviderReport,
  submitMIPSReportData,
  type MIPSProviderDashboard as DashboardData,
  type MIPSReport,
  type IAActivity,
  type MeasureAlert,
} from '../api';
import MeasureStatusCard from '../components/mips/MeasureStatusCard';
import PerformanceGauge from '../components/mips/PerformanceGauge';
import IAActivities from '../components/mips/IAActivities';
import MIPSReport from '../components/mips/MIPSReport';
import MeasureAlerts from '../components/mips/MeasureAlerts';

type TabType = 'overview' | 'measures' | 'ia' | 'reports' | 'alerts';

export default function MIPSDashboard() {
  const { user, session } = useAuth();
  const accessToken = session?.accessToken || '';
  const tenantId = session?.tenantId || '';

  if (!hasAnyRole(user, ['admin', 'provider'])) {
    return <Navigate to="/home" replace />;
  }

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedProvider, setSelectedProvider] = useState(user.id);

  // Data
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [iaData, setIAData] = useState<{
    attested: IAActivity[];
    available: IAActivity[];
    totalPoints: number;
    requiredPoints: number;
  } | null>(null);
  const [alerts, setAlerts] = useState<MeasureAlert[]>([]);
  const [report, setReport] = useState<MIPSReport | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, [selectedYear, selectedProvider]);

  async function loadDashboard() {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const [dashboardData, iaResult, alertsResult] = await Promise.all([
        fetchMIPSProviderDashboard(tenantId, accessToken, selectedProvider, selectedYear),
        fetchImprovementActivities(tenantId, accessToken, selectedYear),
        fetchMeasureAlerts(tenantId, accessToken, { providerId: selectedProvider }),
      ]);
      setDashboard(dashboardData);
      setIAData(iaResult);
      setAlerts(alertsResult.alerts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const reportData = await generateMIPSProviderReport(
        tenantId,
        accessToken,
        selectedProvider,
        selectedYear
      );
      setReport(reportData);
      setShowReport(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitMIPS() {
    if (!accessToken) return;
    const confirmed = window.confirm(
      `Are you sure you want to submit MIPS data for ${selectedYear}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await submitMIPSReportData(tenantId, accessToken, {
        year: selectedYear,
        providerId: selectedProvider,
        submissionType: 'final',
      });
      alert(
        `MIPS data submitted successfully!\nConfirmation: ${result.confirmationNumber}\nFinal Score: ${result.scores.final}%`
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit MIPS data');
    } finally {
      setLoading(false);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getPaymentAdjustmentColor = (adj: number) => {
    if (adj > 0) return '#10b981';
    if (adj === 0) return '#6b7280';
    return '#ef4444';
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'measures', label: 'Quality Measures' },
    { id: 'ia', label: 'Improvement Activities' },
    { id: 'alerts', label: `Alerts (${alerts.length})` },
    { id: 'reports', label: 'Reports & Submission' },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '90rem', margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937' }}>
            MIPS Performance Dashboard
          </h1>
          <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>
            Merit-based Incentive Payment System reporting for dermatology
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: '#2563eb',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Generate Report
          </button>
          <button
            onClick={handleSubmitMIPS}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: '#16a34a',
              color: 'white',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Submit to MIPS
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            Reporting Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              padding: '0.5rem 0.75rem',
              minWidth: '120px',
            }}
          >
            {[2026, 2025, 2024, 2023].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        {hasRole(user, 'admin') && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              Provider
            </label>
            <input
              type="text"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              placeholder="Provider ID"
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                padding: '0.5rem 0.75rem',
              }}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
        <nav style={{ display: 'flex', gap: '2rem' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                paddingBottom: '1rem',
                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                color: activeTab === tab.id ? '#2563eb' : '#6b7280',
                fontWeight: '500',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div
            style={{
              display: 'inline-block',
              width: '3rem',
              height: '3rem',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading...</p>
        </div>
      )}

      {!loading && activeTab === 'overview' && dashboard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Score Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '1rem',
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                textAlign: 'center',
              }}
            >
              <PerformanceGauge value={dashboard.scores.final} label="Final Score" />
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>Quality (30%)</h3>
              <p
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: getScoreColor(dashboard.scores.quality),
                }}
              >
                {dashboard.scores.quality.toFixed(1)}%
              </p>
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Promoting Interoperability (25%)
              </h3>
              <p
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: getScoreColor(dashboard.scores.pi),
                }}
              >
                {dashboard.scores.pi.toFixed(1)}%
              </p>
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Improvement Activities (15%)
              </h3>
              <p
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: getScoreColor(dashboard.scores.ia),
                }}
              >
                {dashboard.scores.ia.toFixed(1)}%
              </p>
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>Payment Adjustment</h3>
              <p
                style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: getPaymentAdjustmentColor(dashboard.scores.paymentAdjustment),
                }}
              >
                {dashboard.scores.paymentAdjustment > 0 ? '+' : ''}
                {dashboard.scores.paymentAdjustment}%
              </p>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Trend: {dashboard.scores.trajectory}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem',
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>Patients Measured</h3>
              <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                {dashboard.patientCount}
              </p>
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>Active Measures</h3>
              <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                {dashboard.measures.length}
              </p>
            </div>
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', color: '#6b7280' }}>Care Gaps</h3>
              <p
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 'bold',
                  color: dashboard.careGapCount > 0 ? '#f59e0b' : '#10b981',
                }}
              >
                {dashboard.careGapCount}
              </p>
            </div>
          </div>

          {/* Top Measures */}
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
              Quality Measure Performance
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {dashboard.measures.slice(0, 6).map((measure) => (
                <MeasureStatusCard key={measure.measureId} measure={measure} />
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'measures' && dashboard && (
        <div
          style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
            All Quality Measures
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {dashboard.measures.map((measure) => (
              <MeasureStatusCard key={measure.measureId} measure={measure} expanded />
            ))}
          </div>
        </div>
      )}

      {!loading && activeTab === 'ia' && iaData && (
        <IAActivities
          attested={iaData.attested}
          available={iaData.available}
          totalPoints={iaData.totalPoints}
          requiredPoints={iaData.requiredPoints}
          year={selectedYear}
          onAttest={loadDashboard}
        />
      )}

      {!loading && activeTab === 'alerts' && (
        <MeasureAlerts alerts={alerts} onDismiss={loadDashboard} />
      )}

      {!loading && activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
              MIPS Submission
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Generate a comprehensive MIPS report and submit your quality data to CMS.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#2563eb',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Generate Full Report
              </button>
              <button
                onClick={handleSubmitMIPS}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#16a34a',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Submit to CMS
              </button>
            </div>
          </div>

          {showReport && report && (
            <MIPSReport report={report} onClose={() => setShowReport(false)} />
          )}
        </div>
      )}
    </div>
  );
}
