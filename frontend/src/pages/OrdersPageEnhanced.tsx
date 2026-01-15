import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, updateOrderStatus, createOrder } from '../api';
import { QuickFilters } from '../components/orders/QuickFilters';
import { OrderFilters } from '../components/orders/OrderFilters';
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

export function OrdersPageEnhanced() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Filter state
  const [filters, setFilters] = useState<OrderFiltersType>({
    orderTypes: [],
    statuses: [],
    priorities: [],
    searchTerm: '',
    groupBy: 'none',
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

  return (
    <div
      className="orders-page"
      style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        minHeight: 'calc(100vh - 200px)',
        padding: '1.5rem',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(16, 185, 129, 0.3)',
      }}
    >
      {/* Action Bar */}
      <div
        className="ema-action-bar"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.75rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowNewOrderModal(true)}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            transition: 'all 0.3s ease',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>+</span>
          New Order
        </button>
        <button
          type="button"
          disabled={selectedOrders.size === 0}
          style={{
            padding: '0.75rem 1.25rem',
            background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
            color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
            border: '2px solid #10b981',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Start Selected ({selectedOrders.size})
        </button>
        <button
          type="button"
          disabled={selectedOrders.size === 0}
          style={{
            padding: '0.75rem 1.25rem',
            background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
            color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
            border: '2px solid #10b981',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Complete Selected ({selectedOrders.size})
        </button>
        <button
          type="button"
          disabled={selectedOrders.size === 0}
          style={{
            padding: '0.75rem 1.25rem',
            background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
            color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
            border: '2px solid #10b981',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Print
        </button>
        <button
          type="button"
          onClick={loadData}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#ffffff',
            color: '#059669',
            border: '2px solid #10b981',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
        >
          Refresh View
        </button>
      </div>

      {/* Section Header */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '2rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Orders Log
        </h1>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <div
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem',
            }}
          >
            {pendingCount}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>Pending</div>
        </div>
        <div
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem',
            }}
          >
            {inProgressCount}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>In Progress</div>
        </div>
        <div
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem',
            }}
          >
            {completedCount}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>Completed</div>
        </div>
        <div
          style={{
            background: statCount > 0 ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              color: statCount > 0 ? '#ffffff' : '#6b7280',
              marginBottom: '0.5rem',
            }}
          >
            {statCount}
          </div>
          <div style={{ color: statCount > 0 ? '#ffffff' : '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>
            STAT Orders
          </div>
        </div>
      </div>

      {/* Quick Filters */}
      <QuickFilters onLoadFilter={handleLoadQuickFilter} currentFilters={filters} />

      {/* Filter Panel */}
      <OrderFilters
        selectedOrderTypes={filters.orderTypes}
        selectedStatuses={filters.statuses}
        selectedPriorities={filters.priorities}
        searchTerm={filters.searchTerm}
        groupBy={filters.groupBy}
        onOrderTypesChange={(types) => setFilters((prev) => ({ ...prev, orderTypes: types }))}
        onStatusesChange={(statuses) => setFilters((prev) => ({ ...prev, statuses: statuses }))}
        onPrioritiesChange={(priorities) => setFilters((prev) => ({ ...prev, priorities: priorities }))}
        onSearchChange={(search) => setFilters((prev) => ({ ...prev, searchTerm: search }))}
        onGroupByChange={(groupBy) => setFilters((prev) => ({ ...prev, groupBy: groupBy }))}
        onClearFilters={handleClearFilters}
      />

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
            background: '#ffffff',
            margin: '1rem',
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
