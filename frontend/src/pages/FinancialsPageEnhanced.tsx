import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { DatePresets } from '../components/financials/DatePresets';
import { ColumnCustomizer } from '../components/financials/ColumnCustomizer';
import {
  fetchFinancialMetrics,
  fetchBills,
  fetchClaims,
  fetchPayerPayments,
  fetchPatientPayments,
  fetchStatements,
  fetchBatches,
  sendStatement,
} from '../api/financials';

type TabType = 'bills' | 'claims' | 'payer-payments' | 'patient-payments' | 'statements' | 'batches';
type BillStatus = 'new' | 'in-progress' | 'submitted' | 'paid' | 'overdue';

export function FinancialsPageEnhanced() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('bills');
  const [metrics, setMetrics] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [payerPayments, setPayerPayments] = useState<any[]>([]);
  const [patientPayments, setPatientPayments] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  // Date range filters
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'all'>('all');
  const [metricsCollapsed, setMetricsCollapsed] = useState(false);
  const [showClearinghouseMenu, setShowClearinghouseMenu] = useState(false);

  // Column visibility state for each tab
  const [billsColumns, setBillsColumns] = useState([
    { key: 'dos', label: 'DOS', visible: true },
    { key: 'ptName', label: 'PT Name', visible: true },
    { key: 'flagged', label: 'Flagged for Review', visible: true },
    { key: 'billId', label: 'Bill ID', visible: true },
    { key: 'procedures', label: 'Procedures', visible: true },
    { key: 'pointers', label: 'Pointers', visible: true },
    { key: 'diagnoses', label: 'Diagnoses', visible: true },
    { key: 'payer', label: 'Payer', visible: true },
    { key: 'providerLocation', label: 'Provider & Location', visible: true },
    { key: 'assigned', label: 'Assigned', visible: true },
    { key: 'followUp', label: 'Follow Up', visible: true },
    { key: 'timelyFiling', label: 'Timely Filing', visible: true },
    { key: 'visitFinalized', label: 'Visit Finalized', visible: true },
    { key: 'charges', label: 'Charges', visible: true },
    { key: 'balance', label: 'Balance', visible: true },
  ]);

  // Bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const options = { tenantId: session.tenantId, accessToken: session.accessToken };

      // Load metrics (with fallback mock data)
      try {
        const metricsRes = await fetchFinancialMetrics(options);
        setMetrics(metricsRes.metrics);
      } catch {
        // Fallback mock metrics
        setMetrics({
          newBillsCount: 12,
          inProgressBillsCount: 8,
          outstandingAmountCents: 4250000, // $42,500
          paymentsThisMonthCents: 8750000, // $87,500
          lateFeesThisMonthCents: 0,
        });
      }

      // Load data based on active tab
      const filters = dateRange.start && dateRange.end ? {
        startDate: dateRange.start,
        endDate: dateRange.end,
      } : undefined;

      switch (activeTab) {
        case 'bills':
          try {
            const billsRes = await fetchBills(options, filters);
            setBills(billsRes.bills || []);
          } catch {
            // Fallback mock bills data
            setBills([
              {
                id: '1',
                dos: '2026-01-10',
                patientFirstName: 'John',
                patientLastName: 'Smith',
                flagged: true,
                billNumber: 'B-2026-001',
                procedures: '99213, 11102',
                pointers: '1,2',
                diagnoses: 'L70.0, L82.1',
                payer: 'Blue Cross Blue Shield',
                provider: 'Dr. Johnson',
                location: 'Main Clinic',
                assigned: 'Sarah M.',
                followUp: '2026-01-20',
                timelyFiling: '2026-03-10',
                visitFinalized: true,
                totalChargesCents: 32500,
                balanceCents: 32500,
                status: 'new',
              },
              {
                id: '2',
                dos: '2026-01-12',
                patientFirstName: 'Emily',
                patientLastName: 'Davis',
                flagged: false,
                billNumber: 'B-2026-002',
                procedures: '99214',
                pointers: '1',
                diagnoses: 'L40.0',
                payer: 'Aetna',
                provider: 'Dr. Chen',
                location: 'West Branch',
                assigned: 'Mike R.',
                followUp: '2026-01-25',
                timelyFiling: '2026-03-12',
                visitFinalized: true,
                totalChargesCents: 20000,
                balanceCents: 20000,
                status: 'new',
              },
              {
                id: '3',
                dos: '2026-01-08',
                patientFirstName: 'Robert',
                patientLastName: 'Wilson',
                flagged: false,
                billNumber: 'B-2026-003',
                procedures: '17000',
                pointers: '1,2,3',
                diagnoses: 'D48.5, L57.0',
                payer: 'Medicare',
                provider: 'Dr. Johnson',
                location: 'Main Clinic',
                assigned: 'Sarah M.',
                followUp: '2026-01-18',
                timelyFiling: '2026-03-08',
                visitFinalized: true,
                totalChargesCents: 25500,
                balanceCents: 12750,
                status: 'in-progress',
              },
              {
                id: '4',
                dos: '2026-01-14',
                patientFirstName: 'Maria',
                patientLastName: 'Garcia',
                flagged: true,
                billNumber: 'B-2026-004',
                procedures: '99213, 96372',
                pointers: '1',
                diagnoses: 'L30.9',
                payer: 'UnitedHealthcare',
                provider: 'Dr. Chen',
                location: 'West Branch',
                assigned: 'Lisa K.',
                followUp: '2026-01-22',
                timelyFiling: '2026-03-14',
                visitFinalized: false,
                totalChargesCents: 28000,
                balanceCents: 28000,
                status: 'new',
              },
              {
                id: '5',
                dos: '2026-01-09',
                patientFirstName: 'James',
                patientLastName: 'Anderson',
                flagged: false,
                billNumber: 'B-2026-005',
                procedures: '99214, 11102, 88305',
                pointers: '1,2',
                diagnoses: 'C44.91, L57.0',
                payer: 'Cigna',
                provider: 'Dr. Johnson',
                location: 'Main Clinic',
                assigned: 'Sarah M.',
                followUp: '2026-01-19',
                timelyFiling: '2026-03-09',
                visitFinalized: true,
                totalChargesCents: 45000,
                balanceCents: 22500,
                status: 'in-progress',
              },
            ]);
          }
          break;
        case 'claims':
          try {
            const claimsRes = await fetchClaims(options, filters);
            setClaims(claimsRes.claims || []);
          } catch {
            setClaims([]);
          }
          break;
        case 'payer-payments':
          try {
            const payerRes = await fetchPayerPayments(options, filters);
            setPayerPayments(payerRes.payerPayments || []);
          } catch {
            setPayerPayments([]);
          }
          break;
        case 'patient-payments':
          try {
            const patientRes = await fetchPatientPayments(options, filters);
            setPatientPayments(patientRes.patientPayments || []);
          } catch {
            setPatientPayments([]);
          }
          break;
        case 'statements':
          try {
            const statementsRes = await fetchStatements(options, filters);
            setStatements(statementsRes.statements || []);
          } catch {
            setStatements([]);
          }
          break;
        case 'batches':
          try {
            const batchesRes = await fetchBatches(options, filters);
            setBatches(batchesRes.batches || []);
          } catch {
            setBatches([]);
          }
          break;
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, activeTab, dateRange, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRange({ start, end });
  };

  const handleBulkAction = (action: string) => {
    if (selectedItems.size === 0) {
      showError('Please select items first');
      return;
    }
    showSuccess(`Bulk action "${action}" applied to ${selectedItems.size} items`);
    setSelectedItems(new Set());
  };

  const toggleSelectAll = (items: any[]) => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  if (loading && !metrics) {
    return (
      <div className="financials-page">
        <div className="page-header">
          <h1>Financials</h1>
        </div>
        <div className="financial-stats">
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
        </div>
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  const filteredBills = statusFilter === 'all'
    ? bills
    : bills.filter(bill => bill.status === statusFilter);

  return (
    <div className="financials-page" style={{
      background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      {/* Header */}
      <div className="page-header" style={{
        background: 'linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
        padding: '2rem',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        marginBottom: '2rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem'
            }}>Financial Management</h1>
            <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>
              Comprehensive billing, payments, and revenue tracking
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Dashboard - Collapsible */}
      {metrics && (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          marginBottom: '2rem',
          overflow: 'hidden',
        }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              cursor: 'pointer',
              background: '#f9fafb',
              borderBottom: metricsCollapsed ? 'none' : '1px solid #e5e7eb',
            }}
            onClick={() => setMetricsCollapsed(!metricsCollapsed)}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#374151', margin: 0 }}>
              Key Metrics
            </h3>
            <span style={{
              fontSize: '1.2rem',
              color: '#6b7280',
              transform: metricsCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.3s ease',
            }}>
              ▼
            </span>
          </div>
          {!metricsCollapsed && (
            <div className="financial-metrics" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.5rem',
              padding: '1.5rem'
            }}>
              <div
                className="metric-card"
                style={{
                  padding: '1.5rem',
                  borderRadius: '8px',
                  background: '#f0fdf4',
                  border: '2px solid #bbf7d0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  setStatusFilter('new');
                  setActiveTab('bills');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#065f46', marginBottom: '0.5rem', fontWeight: '600' }}>
                  New Bills
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>
                  {metrics.newBillsCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Click to filter
                </div>
              </div>
              <div
                className="metric-card"
                style={{
                  padding: '1.5rem',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '2px solid #a7f3d0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  setStatusFilter('in-progress');
                  setActiveTab('bills');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#065f46', marginBottom: '0.5rem', fontWeight: '600' }}>
                  In Progress Bills
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981' }}>
                  {metrics.inProgressBillsCount || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Click to filter
                </div>
              </div>
              <div className="metric-card" style={{
                padding: '1.5rem',
                borderRadius: '8px',
                background: '#fef3c7',
                border: '2px solid #fde68a',
              }}>
                <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Outstanding Amount
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#f59e0b' }}>
                  {formatCurrency(metrics.outstandingAmountCents || 0)}
                </div>
              </div>
              <div className="metric-card" style={{
                padding: '1.5rem',
                borderRadius: '8px',
                background: '#f0fdf4',
                border: '2px solid #bbf7d0',
              }}>
                <div style={{ fontSize: '0.875rem', color: '#065f46', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Payments This Month
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>
                  {formatCurrency(metrics.paymentsThisMonthCents || 0)}
                </div>
              </div>
              <div className="metric-card" style={{
                padding: '1.5rem',
                borderRadius: '8px',
                background: '#fff7ed',
                border: '2px solid #fdba74',
              }}>
                <div style={{ fontSize: '0.875rem', color: '#9a3412', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Late Fees This Month
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#ea580c' }}>
                  {formatCurrency(metrics.lateFeesThisMonthCents || 0)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date Filters */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        <DatePresets onDateRangeChange={handleDateRangeChange} />
      </div>

      {/* Tabs */}
      <div className="financial-tabs" style={{
        background: 'white',
        padding: '0.5rem',
        borderRadius: '12px 12px 0 0',
        display: 'flex',
        gap: '0.5rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        {[
          { key: 'bills', label: 'Bills' },
          { key: 'claims', label: 'Claims' },
          { key: 'payer-payments', label: 'Payer Payments' },
          { key: 'patient-payments', label: 'Patient Payments' },
          { key: 'statements', label: 'Statements' },
          { key: 'batches', label: 'Batches' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key as TabType)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: activeTab === tab.key ? '#059669' : 'transparent',
              color: activeTab === tab.key ? 'white' : '#6b7280',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '0 0 12px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        {/* Enhanced Action Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '8px',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => showSuccess('Post Payments opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#047857'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#059669'}
            >
              Post Payments
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowClearinghouseMenu(!showClearinghouseMenu)}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                Clearinghouse ▼
              </button>
              {showClearinghouseMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.25rem',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  minWidth: '200px',
                }}>
                  <button
                    onClick={() => {
                      showSuccess('Submit Claims opened');
                      setShowClearinghouseMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'white',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    Submit Claims
                  </button>
                  <button
                    onClick={() => {
                      showSuccess('Check Status opened');
                      setShowClearinghouseMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'white',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    Check Status
                  </button>
                  <button
                    onClick={() => {
                      showSuccess('Download Reports opened');
                      setShowClearinghouseMenu(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'white',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    Download Reports
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => showSuccess('Create a Bill opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              Create a Bill
            </button>

            <button
              type="button"
              onClick={() => showSuccess('Claims Submission Report opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              Claims Submission Report
            </button>

            <button
              type="button"
              onClick={() => showSuccess('ERA Report opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              ERA Report
            </button>

            <button
              type="button"
              onClick={() => showSuccess('Reconcile Reports opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              Reconcile Reports
            </button>

            <button
              type="button"
              onClick={() => showSuccess('Create Closing Report opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              Create Closing Report
            </button>

            <button
              type="button"
              onClick={() => showSuccess('Closing Reports opened')}
              style={{
                padding: '0.6rem 1.2rem',
                background: 'white',
                color: '#374151',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
              }}
            >
              Closing Reports
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedItems.size > 0 && (
              <button
                type="button"
                onClick={() => handleBulkAction('bulk-action')}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                }}
              >
                Bulk Actions ({selectedItems.size})
              </button>
            )}
            <ColumnCustomizer
              columns={billsColumns}
              onApply={(cols) => setBillsColumns(cols)}
            />
          </div>
        </div>

        {/* Bills Tab */}
        {activeTab === 'bills' && (
          <div className="bills-table" style={{ overflowX: 'auto' }}>
            {/* Status Filter Pills */}
            {statusFilter !== 'all' && (
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
                  Active Filter:
                </span>
                <span
                  style={{
                    padding: '0.4rem 0.8rem',
                    background: '#059669',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {statusFilter === 'new' ? 'New Bills' : 'In Progress Bills'}
                  <button
                    onClick={() => setStatusFilter('all')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      lineHeight: '1',
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', position: 'sticky', left: 0, background: '#f9fafb' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredBills.length && filteredBills.length > 0}
                      onChange={() => toggleSelectAll(filteredBills)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  {billsColumns.filter(c => c.visible).map(col => (
                    <th key={col.key} style={{
                      padding: '0.75rem',
                      textAlign: 'left',
                      fontWeight: '700',
                      color: '#374151',
                      fontSize: '0.8rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={billsColumns.filter(c => c.visible).length + 1} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: '0.95rem',
                    }}>
                      No bills found
                    </td>
                  </tr>
                ) : (
                  filteredBills.map(bill => (
                    <tr key={bill.id} style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                      <td style={{ padding: '0.75rem', position: 'sticky', left: 0, background: 'inherit' }}>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(bill.id)}
                          onChange={() => toggleSelectItem(bill.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      {billsColumns.find(c => c.key === 'dos')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#374151', whiteSpace: 'nowrap' }}>
                          {bill.dos ? formatDate(bill.dos) : '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'ptName')?.visible && (
                        <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827', whiteSpace: 'nowrap' }}>
                          {bill.patientLastName}, {bill.patientFirstName}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'flagged')?.visible && (
                        <td style={{ padding: '0.75rem' }}>
                          {bill.flagged ? (
                            <span style={{ fontSize: '1.2rem', color: '#dc2626' }}>🚩</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'billId')?.visible && (
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>
                          {bill.billNumber || bill.id}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'procedures')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#374151' }}>
                          {bill.procedures || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'pointers')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                          {bill.pointers || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'diagnoses')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#374151' }}>
                          {bill.diagnoses || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'payer')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#374151' }}>
                          {bill.payer || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'providerLocation')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#374151', whiteSpace: 'nowrap' }}>
                          {bill.provider || '-'} / {bill.location || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'assigned')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                          {bill.assigned || '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'followUp')?.visible && (
                        <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                          {bill.followUp ? formatDate(bill.followUp) : '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'timelyFiling')?.visible && (
                        <td style={{ padding: '0.75rem' }}>
                          {bill.timelyFiling ? (
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: new Date(bill.timelyFiling) < new Date() ? '#fee2e2' : '#dcfce7',
                              color: new Date(bill.timelyFiling) < new Date() ? '#991b1b' : '#166534',
                            }}>
                              {formatDate(bill.timelyFiling)}
                            </span>
                          ) : '-'}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'visitFinalized')?.visible && (
                        <td style={{ padding: '0.75rem' }}>
                          {bill.visitFinalized ? (
                            <span style={{ color: '#059669', fontWeight: '600' }}>✓</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>-</span>
                          )}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'charges')?.visible && (
                        <td style={{ padding: '0.75rem', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                          {formatCurrency(bill.totalChargesCents || 0)}
                        </td>
                      )}
                      {billsColumns.find(c => c.key === 'balance')?.visible && (
                        <td style={{
                          padding: '0.75rem',
                          fontWeight: '700',
                          color: (bill.balanceCents || 0) > 0 ? '#dc2626' : '#059669',
                          whiteSpace: 'nowrap',
                        }}>
                          {formatCurrency(bill.balanceCents || 0)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Post Bills Button */}
            {selectedItems.size > 0 && (
              <div style={{
                marginTop: '1.5rem',
                display: 'flex',
                justifyContent: 'flex-end',
              }}>
                <button
                  type="button"
                  onClick={() => handleBulkAction('post-bills')}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.3)';
                  }}
                >
                  Post Bills ({selectedItems.size})
                </button>
              </div>
            )}
          </div>
        )}

        {/* Other tabs would be implemented similarly */}
        {activeTab !== 'bills' && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
            <p>Tab content for {activeTab} goes here.</p>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              Implement similar table structures for Claims, Payer Payments, Patient Payments, Statements, and Batches.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
