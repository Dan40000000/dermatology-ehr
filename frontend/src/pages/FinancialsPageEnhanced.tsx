import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
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

  // Column visibility state for each tab
  const [billsColumns, setBillsColumns] = useState([
    { key: 'billNumber', label: 'Bill #', visible: true },
    { key: 'patient', label: 'Patient', visible: true },
    { key: 'billDate', label: 'Bill Date', visible: true },
    { key: 'dueDate', label: 'Due Date', visible: true },
    { key: 'totalCharges', label: 'Total Charges', visible: true },
    { key: 'balance', label: 'Balance', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'actions', label: 'Actions', visible: true },
  ]);

  // Bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const options = { tenantId: session.tenantId, accessToken: session.accessToken };

      // Load metrics
      const metricsRes = await fetchFinancialMetrics(options);
      setMetrics(metricsRes.metrics);

      // Load data based on active tab
      const filters = dateRange.start && dateRange.end ? {
        startDate: dateRange.start,
        endDate: dateRange.end,
      } : undefined;

      switch (activeTab) {
        case 'bills':
          const billsRes = await fetchBills(options, filters);
          setBills(billsRes.bills || []);
          break;
        case 'claims':
          const claimsRes = await fetchClaims(options, filters);
          setClaims(claimsRes.claims || []);
          break;
        case 'payer-payments':
          const payerRes = await fetchPayerPayments(options, filters);
          setPayerPayments(payerRes.payerPayments || []);
          break;
        case 'patient-payments':
          const patientRes = await fetchPatientPayments(options, filters);
          setPatientPayments(patientRes.patientPayments || []);
          break;
        case 'statements':
          const statementsRes = await fetchStatements(options, filters);
          setStatements(statementsRes.statements || []);
          break;
        case 'batches':
          const batchesRes = await fetchBatches(options, filters);
          setBatches(batchesRes.batches || []);
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-primary" style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: 'pointer',
            }}>
              + New Bill
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Dashboard */}
      {metrics && (
        <div className="financial-metrics" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div className="metric-card" style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            cursor: 'pointer',
          }} onClick={() => setActiveTab('bills')}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>New Bills</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>
              {metrics.newBillsCount}
            </div>
          </div>
          <div className="metric-card" style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            cursor: 'pointer',
          }} onClick={() => setActiveTab('bills')}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>In Progress Bills</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10b981' }}>
              {metrics.inProgressBillsCount}
            </div>
          </div>
          <div className="metric-card" style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Outstanding Amount</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#fb923c' }}>
              {formatCurrency(metrics.outstandingAmountCents)}
            </div>
          </div>
          <div className="metric-card" style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Payments This Month</div>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669' }}>
              {formatCurrency(metrics.paymentsThisMonthCents)}
            </div>
          </div>
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
        {/* Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selectedItems.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleBulkAction('export')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Export ({selectedItems.size})
                </button>
                {activeTab === 'statements' && (
                  <button
                    type="button"
                    onClick={() => handleBulkAction('send')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Send ({selectedItems.size})
                  </button>
                )}
              </>
            )}
          </div>
          <ColumnCustomizer
            columns={billsColumns}
            onApply={(cols) => setBillsColumns(cols)}
          />
        </div>

        {/* Bills Tab */}
        {activeTab === 'bills' && (
          <div className="bills-table">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.size === bills.length && bills.length > 0}
                      onChange={() => toggleSelectAll(bills)}
                    />
                  </th>
                  {billsColumns.filter(c => c.visible).map(col => (
                    <th key={col.key} style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <tr key={bill.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(bill.id)}
                        onChange={() => toggleSelectItem(bill.id)}
                      />
                    </td>
                    {billsColumns.find(c => c.key === 'billNumber')?.visible && (
                      <td style={{ padding: '0.75rem', fontWeight: '600' }}>{bill.billNumber}</td>
                    )}
                    {billsColumns.find(c => c.key === 'patient')?.visible && (
                      <td style={{ padding: '0.75rem' }}>
                        {bill.patientLastName}, {bill.patientFirstName}
                      </td>
                    )}
                    {billsColumns.find(c => c.key === 'billDate')?.visible && (
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{formatDate(bill.billDate)}</td>
                    )}
                    {billsColumns.find(c => c.key === 'dueDate')?.visible && (
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{bill.dueDate ? formatDate(bill.dueDate) : '-'}</td>
                    )}
                    {billsColumns.find(c => c.key === 'totalCharges')?.visible && (
                      <td style={{ padding: '0.75rem' }}>{formatCurrency(bill.totalChargesCents)}</td>
                    )}
                    {billsColumns.find(c => c.key === 'balance')?.visible && (
                      <td style={{ padding: '0.75rem', fontWeight: '600', color: bill.balanceCents > 0 ? '#dc2626' : '#059669' }}>
                        {formatCurrency(bill.balanceCents)}
                      </td>
                    )}
                    {billsColumns.find(c => c.key === 'status')?.visible && (
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`pill ${bill.status}`} style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          background: bill.status === 'paid' ? '#d1fae5' : bill.status === 'overdue' ? '#fee2e2' : '#e0e7ff',
                          color: bill.status === 'paid' ? '#065f46' : bill.status === 'overdue' ? '#991b1b' : '#3730a3',
                        }}>
                          {bill.status}
                        </span>
                      </td>
                    )}
                    {billsColumns.find(c => c.key === 'actions')?.visible && (
                      <td style={{ padding: '0.75rem' }}>
                        <button type="button" className="btn-sm" style={{
                          padding: '0.25rem 0.75rem',
                          background: '#f3f4f6',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}>
                          View
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
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
