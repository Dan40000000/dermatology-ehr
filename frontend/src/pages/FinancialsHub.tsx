import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import { RCMDashboard } from '../components/financials/RCMDashboard';
import { ClaimsManagement } from '../components/financials/ClaimsManagement';
import { PatientPaymentPortal } from '../components/financials/PatientPaymentPortal';
import { PremiumAnalytics } from '../components/financials/PremiumAnalytics';
import { FeeScheduleManager } from '../components/financials/FeeScheduleManager';

type TabType = 'dashboard' | 'claims' | 'payments' | 'analytics' | 'fees' | 'statements' | 'reports';

interface TabConfig {
  key: TabType;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabConfig[] = [
  { key: 'dashboard', label: 'RCM Dashboard', icon: '', description: 'Key metrics & A/R overview' },
  { key: 'claims', label: 'Claims', icon: '', description: 'Submit & track insurance claims' },
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

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    // Simulate loading
    await new Promise(resolve => setTimeout(resolve, 500));
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDrillDown = (metric: string) => {
    showSuccess(`Drilling down into: ${metric}`);
    // Navigate to specific views based on metric
    if (metric === 'claims-queue') setActiveTab('claims');
    if (metric === 'ar-aging') setActiveTab('analytics');
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
      <div style={{
        background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
        minHeight: '100vh',
        padding: '2rem',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '2rem',
          marginBottom: '2rem',
        }}>
          <Skeleton variant="card" height={80} />
        </div>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ width: '250px' }}>
            <Skeleton variant="card" height={400} />
          </div>
          <div style={{ flex: 1 }}>
            <Skeleton variant="card" height={600} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
      minHeight: '100vh',
    }}>
      {/* Top Header Bar */}
      <div style={{
        background: 'rgba(255,255,255,0.98)',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Financial Management
          </h1>
          <span style={{
            padding: '0.25rem 0.75rem',
            background: '#dcfce7',
            color: '#166534',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: '600',
          }}>
            Premium
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => showSuccess('Quick actions menu opened')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'white',
              color: '#374151',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            Quick Actions
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            style={{
              padding: '0.6rem 1.2rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Generate Report
          </button>
        </div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Sidebar Navigation */}
        <div style={{
          width: sidebarCollapsed ? '70px' : '250px',
          background: 'rgba(255,255,255,0.98)',
          minHeight: 'calc(100vh - 60px)',
          borderRight: '1px solid #e5e7eb',
          transition: 'width 0.3s ease',
          position: 'sticky',
          top: '60px',
          alignSelf: 'flex-start',
        }}>
          <div style={{ padding: '1rem' }}>
            {/* Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              {sidebarCollapsed ? '>' : '<'}
            </button>

            {/* Navigation Items */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: sidebarCollapsed ? '0.75rem' : '0.75rem 1rem',
                    background: activeTab === tab.key ? '#f0fdf4' : 'transparent',
                    border: activeTab === tab.key ? '2px solid #bbf7d0' : '2px solid transparent',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.key) {
                      e.currentTarget.style.background = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.key) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{tab.icon}</span>
                  {!sidebarCollapsed && (
                    <div>
                      <div style={{
                        fontWeight: '600',
                        color: activeTab === tab.key ? '#059669' : '#374151',
                        fontSize: '0.9rem',
                      }}>
                        {tab.label}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#9ca3af',
                      }}>
                        {tab.description}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </nav>

            {/* Quick Stats in Sidebar */}
            {!sidebarCollapsed && (
              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '12px',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', fontWeight: '600' }}>
                  TODAY'S SNAPSHOT
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Collected</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#059669' }}>$3,245</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Claims Filed</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>12</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Denials</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#dc2626' }}>2</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, padding: '2rem' }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '2rem',
            minHeight: 'calc(100vh - 140px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          }}>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <RCMDashboard onDrillDown={handleDrillDown} />
            )}

            {/* Claims Tab */}
            {activeTab === 'claims' && (
              <ClaimsManagement
                onClaimSelect={handleClaimSelect}
                onSubmitClaims={(ids) => showSuccess(`Submitted ${ids.length} claims`)}
              />
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
              <FeeScheduleManager onSave={(item) => showSuccess(`Saved fee: ${item.cptCode}`)} />
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
        </div>
      </div>
    </div>
  );
}
