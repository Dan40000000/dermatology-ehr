import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, updateOrderStatus, createOrder } from '../api';
import type { Order, Patient } from '../types';

type OrderFilter = 'all' | 'pending' | 'in-progress' | 'completed' | 'cancelled';
type OrderType = 'lab' | 'imaging' | 'biopsy' | 'procedure' | 'referral' | 'rx';

const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: 'lab', label: 'Lab', icon: '🧪' },
  { value: 'biopsy', label: 'Biopsy', icon: '🔬' },
  { value: 'imaging', label: 'Imaging', icon: '📷' },
  { value: 'procedure', label: 'Procedure', icon: '🩺' },
  { value: 'referral', label: 'Referral', icon: '📋' },
  { value: 'rx', label: 'Prescription', icon: '💊' },
];

export function OrdersPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    patientId: '',
    type: 'lab' as OrderType,
    details: '',
    priority: 'routine' as 'stat' | 'urgent' | 'routine',
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
        priority: 'routine',
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
    if (filter !== 'all' && order.status !== filter) return false;
    if (typeFilter !== 'all' && order.type !== typeFilter) return false;
    if (searchTerm) {
      const patientName = getPatientName(order.patientId).toLowerCase();
      const details = (order.details || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !details.includes(searchTerm.toLowerCase())
      ) {
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

  // Stats
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const inProgressCount = orders.filter((o) => o.status === 'in-progress').length;
  const completedCount = orders.filter((o) => o.status === 'completed').length;
  const statCount = orders.filter((o) => o.priority === 'stat' && o.status !== 'completed').length;

  return (
    <div className="orders-page">
      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => setShowNewOrderModal(true)}>
          <span className="icon">➕</span>
          New Order
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedOrders.size === 0}>
          <span className="icon">▶️</span>
          Start Selected
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedOrders.size === 0}>
          <span className="icon">✅</span>
          Complete Selected
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedOrders.size === 0}>
          <span className="icon">🖨️</span>
          Print
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon">🔃</span>
          Refresh
        </button>
      </div>

      {/* Section Header */}
      <div className="ema-section-header">Orders Management</div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', padding: '1rem' }}>
        <div
          className="stat-card-teal"
          style={{ cursor: 'pointer', opacity: filter === 'pending' ? 1 : 0.8 }}
          onClick={() => setFilter('pending')}
        >
          <div className="stat-number">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div
          className="stat-card-teal"
          style={{ cursor: 'pointer', opacity: filter === 'in-progress' ? 1 : 0.8 }}
          onClick={() => setFilter('in-progress')}
        >
          <div className="stat-number">{inProgressCount}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            opacity: filter === 'completed' ? 1 : 0.8,
            background: '#10b981',
          }}
          onClick={() => setFilter('completed')}
        >
          <div className="stat-number">{completedCount}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            background: statCount > 0 ? '#dc2626' : undefined,
          }}
        >
          <div className="stat-number">{statCount}</div>
          <div className="stat-label">STAT Orders</div>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">Search</label>
            <input
              type="text"
              className="ema-filter-input"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Status</label>
            <select
              className="ema-filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as OrderFilter)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Order Type</label>
            <select
              className="ema-filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as OrderType | 'all')}
            >
              <option value="all">All Types</option>
              {ORDER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">&nbsp;</label>
            <button
              type="button"
              className="ema-filter-btn secondary"
              onClick={() => {
                setFilter('all');
                setTypeFilter('all');
                setSearchTerm('');
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
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
            background: '#ffffff',
            margin: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Orders Found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {filter !== 'all' || typeFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first order to get started'}
          </p>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Type</th>
              <th>Patient</th>
              <th>Details</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => {
              const typeInfo = ORDER_TYPES.find((t) => t.value === order.type);
              return (
                <tr
                  key={order.id}
                  style={{
                    background:
                      order.priority === 'stat'
                        ? '#fef2f2'
                        : order.status === 'completed'
                        ? '#f0fdf4'
                        : undefined,
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => toggleOrderSelection(order.id)}
                    />
                  </td>
                  <td>
                    <span
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      {typeInfo?.icon} {typeInfo?.label || order.type}
                    </span>
                  </td>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {getPatientName(order.patientId)}
                    </a>
                  </td>
                  <td style={{ maxWidth: '250px' }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={order.details}
                    >
                      {order.details}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        background:
                          order.priority === 'stat'
                            ? '#dc2626'
                            : order.priority === 'urgent'
                            ? '#f59e0b'
                            : '#e5e7eb',
                        color: order.priority === 'stat' || order.priority === 'urgent' ? '#ffffff' : '#374151',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {order.priority === 'stat' ? 'STAT' : order.priority === 'urgent' ? 'Urgent' : 'Routine'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`ema-status ${
                        order.status === 'completed'
                          ? 'established'
                          : order.status === 'cancelled'
                          ? 'cancelled'
                          : 'pending'
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {order.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, 'in-progress')}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#3b82f6',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, 'cancelled')}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {order.status === 'in-progress' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(order.id, 'completed')}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* New Order Modal */}
      <Modal isOpen={showNewOrderModal} title="Create New Order" onClose={() => setShowNewOrderModal(false)} size="lg">
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
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
                    {t.icon} {t.label}
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
                    priority: e.target.value as 'stat' | 'urgent' | 'routine',
                  }))
                }
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
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
