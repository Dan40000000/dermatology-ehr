import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, updateOrderStatus, createOrder } from '../api';
import { QuickFilters } from '../components/orders/QuickFilters';
import { GroupedOrdersTable } from '../components/orders/GroupedOrdersTable';
import type {
  Order,
  Patient,
  OrderType,
  OrderStatus,
  OrderPriority,
  OrderGroupBy,
  OrderFilters as OrderFiltersType,
} from '../types';

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'followup', label: 'Follow Up' },
  { value: 'infusion', label: 'Infusion' },
  { value: 'injection', label: 'Injection' },
  { value: 'lab', label: 'Labs' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'referral', label: 'Referral' },
  { value: 'surgery', label: 'Surgery' },
];

const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'sent', label: 'Sent' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'canceled', label: 'Canceled' },
];

const ORDER_PRIORITIES: { value: OrderPriority; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'stat', label: 'STAT' },
];

export function OrdersPageEnhanced() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<OrderFiltersType>({
    orderTypes: [],
    statuses: [],
    priorities: [],
    searchTerm: '',
    groupBy: 'none',
  });

  // Advanced filter state
  const [advancedFilters, setAdvancedFilters] = useState({
    patientName: '',
    provider: '',
    facility: '',
    performAt: '',
    workflowStatus: '',
    insuranceName: '',
    orderName: '',
    orderReqNumber: '',
    orderNotes: '',
    orderAssociatedToCase: false,
    dateFilterType: 'order' as 'order' | 'scheduled' | 'due' | 'sent',
    dateFrom: '',
    dateTo: '',
  });

  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    patientId: '',
    type: 'lab' as OrderType,
    details: '',
    priority: 'normal' as OrderPriority,
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [ordersRes, patientsRes] = await Promise.all([
        fetchOrders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setOrders(ordersRes.orders || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!session) return;

    try {
      await updateOrderStatus(session.tenantId, session.accessToken, orderId, newStatus);
      showSuccess('Order status updated');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    }
  };

  const handleCreateOrder = async () => {
    if (!session || !newOrder.patientId || !newOrder.details) {
      showError('Please fill in required fields');
      return;
    }

    setCreating(true);
    try {
      await createOrder(session.tenantId, session.accessToken, {
        patientId: newOrder.patientId,
        providerId: session.user.id,
        type: newOrder.type,
        details: newOrder.details,
        priority: newOrder.priority,
        notes: newOrder.notes,
        status: 'pending',
      });
      showSuccess('Order created');
      setShowNewOrderModal(false);
      setNewOrder({
        patientId: '',
        type: 'lab',
        details: '',
        priority: 'normal',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const filteredOrders = orders.filter((order) => {
    // Order types filter
    if (filters.orderTypes.length > 0 && !filters.orderTypes.includes(order.type as OrderType)) {
      return false;
    }

    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(order.status as OrderStatus)) {
      return false;
    }

    // Priority filter
    if (filters.priorities.length > 0) {
      const orderPriority = order.priority || 'normal';
      if (!filters.priorities.includes(orderPriority as OrderPriority)) {
        return false;
      }
    }

    // Search filter
    if (filters.searchTerm) {
      const patientName = getPatientName(order.patientId).toLowerCase();
      const details = (order.details || '').toLowerCase();
      const searchLower = filters.searchTerm.toLowerCase();
      if (!patientName.includes(searchLower) && !details.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleClearFilters = () => {
    setFilters({
      orderTypes: [],
      statuses: [],
      priorities: [],
      searchTerm: '',
      groupBy: 'none',
    });
  };

  const handleLoadQuickFilter = (quickFilters: OrderFiltersType) => {
    setFilters(quickFilters);
  };

  // Stats
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'open').length;
  const inProgressCount = orders.filter((o) => o.status === 'in-progress').length;
  const completedCount = orders.filter((o) => o.status === 'completed' || o.status === 'closed').length;
  const statCount = orders.filter(
    (o) => o.priority === 'stat' && o.status !== 'completed' && o.status !== 'closed'
  ).length;

  // Helper functions for advanced filters
  const toggleOrderType = (type: OrderType) => {
    if (filters.orderTypes.includes(type)) {
      setFilters((prev) => ({ ...prev, orderTypes: prev.orderTypes.filter((t) => t !== type) }));
    } else {
      setFilters((prev) => ({ ...prev, orderTypes: [...prev.orderTypes, type] }));
    }
  };

  const toggleAllOrderTypes = () => {
    if (filters.orderTypes.length === ORDER_TYPES.length) {
      setFilters((prev) => ({ ...prev, orderTypes: [] }));
    } else {
      setFilters((prev) => ({ ...prev, orderTypes: ORDER_TYPES.map((t) => t.value) }));
    }
  };

  const toggleStatus = (status: OrderStatus) => {
    if (filters.statuses.includes(status)) {
      setFilters((prev) => ({ ...prev, statuses: prev.statuses.filter((s) => s !== status) }));
    } else {
      setFilters((prev) => ({ ...prev, statuses: [...prev.statuses, status] }));
    }
  };

  const toggleAllStatuses = () => {
    if (filters.statuses.length === ORDER_STATUSES.length) {
      setFilters((prev) => ({ ...prev, statuses: [] }));
    } else {
      setFilters((prev) => ({ ...prev, statuses: ORDER_STATUSES.map((s) => s.value) }));
    }
  };

  const togglePriority = (priority: OrderPriority) => {
    if (filters.priorities.includes(priority)) {
      setFilters((prev) => ({ ...prev, priorities: prev.priorities.filter((p) => p !== priority) }));
    } else {
      setFilters((prev) => ({ ...prev, priorities: [...prev.priorities, priority] }));
    }
  };

  const toggleAllPriorities = () => {
    if (filters.priorities.length === ORDER_PRIORITIES.length) {
      setFilters((prev) => ({ ...prev, priorities: [] }));
    } else {
      setFilters((prev) => ({ ...prev, priorities: ORDER_PRIORITIES.map((p) => p.value) }));
    }
  };

  const handleApplyAdvancedFilters = () => {
    // Apply advanced filters logic here
    setShowAdvancedFilters(false);
  };

  const handleClearAdvancedFilters = () => {
    setAdvancedFilters({
      patientName: '',
      provider: '',
      facility: '',
      performAt: '',
      workflowStatus: '',
      insuranceName: '',
      orderName: '',
      orderReqNumber: '',
      orderNotes: '',
      orderAssociatedToCase: false,
      dateFilterType: 'order',
      dateFrom: '',
      dateTo: '',
    });
    handleClearFilters();
  };

  return (
    <div
      className="orders-page"
      style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
        minHeight: 'calc(100vh - 200px)',
        padding: '1.5rem',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(79, 70, 229, 0.3)',
      }}
    >
      {/* Header Section */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '2rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Orders Log
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{
                padding: '0.75rem 1.25rem',
                background: showAdvancedFilters ? '#4f46e5' : '#ffffff',
                color: showAdvancedFilters ? '#ffffff' : '#4f46e5',
                border: '2px solid #4f46e5',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              {showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button
              type="button"
              onClick={loadData}
              style={{
                padding: '0.75rem 1.25rem',
                background: '#ffffff',
                color: '#4f46e5',
                border: '2px solid #4f46e5',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              Refresh View
            </button>
            <select
              disabled={selectedOrders.size === 0}
              style={{
                padding: '0.75rem 1.25rem',
                background: selectedOrders.size === 0 ? '#e5e7eb' : '#ffffff',
                color: selectedOrders.size === 0 ? '#9ca3af' : '#4f46e5',
                border: '2px solid #4f46e5',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">Select Action ({selectedOrders.size})</option>
              <option value="start">Start Selected</option>
              <option value="complete">Complete Selected</option>
              <option value="cancel">Cancel Selected</option>
              <option value="print">Print Selected</option>
            </select>
          </div>
        </div>
      </div>

      {/* My Quick Filters Section */}
      <QuickFilters onLoadFilter={handleLoadQuickFilter} currentFilters={filters} />

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Advanced Filters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1.5rem' }}>
            {/* Column 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Patient Name
                </label>
                <input
                  type="text"
                  value={advancedFilters.patientName}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, patientName: e.target.value }))}
                  placeholder="Search patient..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Provider
                </label>
                <select
                  value={advancedFilters.provider}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, provider: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">All Providers</option>
                  <option value="dr_smith">Dr. Smith</option>
                  <option value="dr_jones">Dr. Jones</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Facility
                </label>
                <select
                  value={advancedFilters.facility}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, facility: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">All Facilities</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Perform At
                </label>
                <select
                  value={advancedFilters.performAt}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, performAt: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">All</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Workflow Status
                </label>
                <select
                  value={advancedFilters.workflowStatus}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, workflowStatus: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">All</option>
                </select>
              </div>
            </div>

            {/* Column 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Insurance Name
                </label>
                <input
                  type="text"
                  value={advancedFilters.insuranceName}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, insuranceName: e.target.value }))}
                  placeholder="Enter insurance..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Order Name
                </label>
                <input
                  type="text"
                  value={advancedFilters.orderName}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, orderName: e.target.value }))}
                  placeholder="Enter order name..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Order Req Number
                </label>
                <select
                  value={advancedFilters.orderReqNumber}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, orderReqNumber: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  <option value="">All</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  Order Notes
                </label>
                <input
                  type="text"
                  value={advancedFilters.orderNotes}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, orderNotes: e.target.value }))}
                  placeholder="Search notes..."
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={advancedFilters.orderAssociatedToCase}
                    onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, orderAssociatedToCase: e.target.checked }))}
                    style={{ cursor: 'pointer' }}
                  />
                  Order Associated to Case
                </label>
              </div>
            </div>

            {/* Column 3 - Order Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                Order Type
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.orderTypes.length === ORDER_TYPES.length}
                  onChange={toggleAllOrderTypes}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
              </label>
              {ORDER_TYPES.map((type) => (
                <label key={type.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filters.orderTypes.includes(type.value)}
                    onChange={() => toggleOrderType(type.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.813rem' }}>{type.label}</span>
                </label>
              ))}
            </div>

            {/* Column 4 - Date Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Date Type
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="dateType"
                      value="order"
                      checked={advancedFilters.dateFilterType === 'order'}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateFilterType: e.target.value as any }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Order Date</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="dateType"
                      value="scheduled"
                      checked={advancedFilters.dateFilterType === 'scheduled'}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateFilterType: e.target.value as any }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Scheduled Date</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="dateType"
                      value="due"
                      checked={advancedFilters.dateFilterType === 'due'}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateFilterType: e.target.value as any }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Due Date</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="dateType"
                      value="sent"
                      checked={advancedFilters.dateFilterType === 'sent'}
                      onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateFilterType: e.target.value as any }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Sent Date</span>
                  </label>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={advancedFilters.dateFrom}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: '#374151' }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={advancedFilters.dateTo}
                  onChange={(e) => setAdvancedFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
            </div>

            {/* Column 5 - Priority & Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Priority
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={filters.priorities.length === ORDER_PRIORITIES.length}
                      onChange={toggleAllPriorities}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
                  </label>
                  {ORDER_PRIORITIES.map((priority) => (
                    <label key={priority.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={filters.priorities.includes(priority.value)}
                        onChange={() => togglePriority(priority.value)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.813rem' }}>{priority.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Status
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={filters.statuses.length === ORDER_STATUSES.length}
                      onChange={toggleAllStatuses}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
                  </label>
                  {ORDER_STATUSES.map((status) => (
                    <label key={status.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={filters.statuses.includes(status.value)}
                        onChange={() => toggleStatus(status.value)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.813rem' }}>{status.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 6 - Group By & Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Group By
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="groupBy"
                      value="none"
                      checked={filters.groupBy === 'none'}
                      onChange={() => setFilters((prev) => ({ ...prev, groupBy: 'none' }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>None</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="groupBy"
                      value="patient"
                      checked={filters.groupBy === 'patient'}
                      onChange={() => setFilters((prev) => ({ ...prev, groupBy: 'patient' }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Patient</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="groupBy"
                      value="provider"
                      checked={filters.groupBy === 'provider'}
                      onChange={() => setFilters((prev) => ({ ...prev, groupBy: 'provider' }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.813rem' }}>Provider</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={handleClearAdvancedFilters}
                  style={{
                    padding: '0.625rem 1rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Clear Filter
                </button>
                <button
                  type="button"
                  onClick={handleApplyAdvancedFilters}
                  style={{
                    padding: '0.625rem 1rem',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Total Results & Table */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>
            Total Results: <span style={{ color: '#4f46e5', fontWeight: 700 }}>{filteredOrders.length}</span>
          </h3>
          <button
            type="button"
            onClick={() => setShowNewOrderModal(true)}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
            }}
          >
            + New Order
          </button>
        </div>

        {/* Orders Table */}
        {loading ? (
          <div style={{ padding: '1rem' }}>
            <Skeleton variant="card" height={400} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Orders Found</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>
              {filters.orderTypes.length > 0 ||
              filters.statuses.length > 0 ||
              filters.priorities.length > 0 ||
              filters.searchTerm
                ? 'Try adjusting your filters'
                : 'Create your first order to get started'}
            </p>
          </div>
        ) : (
          <GroupedOrdersTable
            orders={filteredOrders}
            patients={patients}
            groupBy={filters.groupBy}
            selectedOrders={selectedOrders}
            onToggleOrder={toggleOrderSelection}
            onToggleSelectAll={toggleSelectAll}
            onStatusChange={handleStatusChange}
            getPatientName={getPatientName}
          />
        )}
      </div>

      {/* New Order Modal */}
      <Modal isOpen={showNewOrderModal} title="Create New Order" onClose={() => setShowNewOrderModal(false)} size="lg">
        <div className="modal-form">
          <div className="form-field">
            <label htmlFor="patient-select">Patient *</label>
            <select
              id="patient-select"
              value={newOrder.patientId}
              onChange={(e) => setNewOrder((prev) => ({ ...prev, patientId: e.target.value }))}
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Order Type *</label>
              <select
                value={newOrder.type}
                onChange={(e) => setNewOrder((prev) => ({ ...prev, type: e.target.value as OrderType }))}
              >
                {ORDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Priority</label>
              <select
                value={newOrder.priority}
                onChange={(e) =>
                  setNewOrder((prev) => ({
                    ...prev,
                    priority: e.target.value as OrderPriority,
                  }))
                }
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Order Details *</label>
            <textarea
              value={newOrder.details}
              onChange={(e) => setNewOrder((prev) => ({ ...prev, details: e.target.value }))}
              placeholder="Enter order details..."
              rows={4}
            />
          </div>

          <div className="form-field">
            <label>Additional Notes</label>
            <textarea
              value={newOrder.notes}
              onChange={(e) => setNewOrder((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowNewOrderModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateOrder} disabled={creating}>
            {creating ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
