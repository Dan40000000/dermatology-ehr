import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, updateOrderStatus, createOrder } from '../api';
import type { Order, Patient } from '../types';

type OrderFilter = 'all' | 'pending' | 'in-progress' | 'completed' | 'cancelled';
type OrderType =
  | 'biopsy'
  | 'lab'
  | 'pathology'
  | 'dermpath'
  | 'procedure'
  | 'imaging'
  | 'rx'
  | 'cosmetic'
  | 'referral'
  | 'supply';

const ORDER_TYPES: { value: OrderType; label: string; icon: string }[] = [
  { value: 'biopsy', label: 'Biopsy', icon: '' },
  { value: 'pathology', label: 'Pathology', icon: '' },
  { value: 'dermpath', label: 'DermPath', icon: '' },
  { value: 'lab', label: 'Lab Work', icon: '' },
  { value: 'procedure', label: 'Procedure', icon: '' },
  { value: 'cosmetic', label: 'Cosmetic', icon: '' },
  { value: 'imaging', label: 'Imaging', icon: '' },
  { value: 'rx', label: 'Prescription', icon: '' },
  { value: 'referral', label: 'Referral', icon: '' },
  { value: 'supply', label: 'Supply Order', icon: '' },
];

export function OrdersPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [typeFilter, setTypeFilter] = useState<OrderType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Get filter from URL parameter, default to 'all'
  const tabParam = searchParams.get('tab');
  const filter: OrderFilter =
    tabParam === 'pending' || tabParam === 'in-progress' || tabParam === 'completed' || tabParam === 'cancelled'
      ? tabParam
      : 'all';

  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrder, setNewOrder] = useState({
    patientId: '',
    type: 'lab' as OrderType,
    details: '',
    priority: 'routine' as 'stat' | 'urgent' | 'routine',
    notes: '',
  });

  // Function to update filter and URL
  const updateFilter = (newFilter: OrderFilter) => {
    if (newFilter === 'all') {
      // Remove the tab parameter for 'all'
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      // Set the tab parameter
      setSearchParams({ tab: newFilter });
    }
  };

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [ordersRes, patientsRes] = await Promise.all([
        fetchOrders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setOrders(ordersRes.orders || []);
      // Patients API returns data in 'data' key, not 'patients'
      setPatients(patientsRes.data || patientsRes.patients || []);
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
    <div className="orders-page" style={{
      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(16, 185, 129, 0.3)',
    }}>
      {/* Action Bar */}
      <div className="ema-action-bar" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        display: 'flex',
        gap: '0.75rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <button type="button" onClick={() => setShowNewOrderModal(true)} style={{
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
        }}>
          <span style={{ marginRight: '0.5rem' }}>+</span>
          New Order
        </button>
        <button type="button" disabled={selectedOrders.size === 0} style={{
          padding: '0.75rem 1.25rem',
          background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
          color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
          border: '2px solid #10b981',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Start Selected
        </button>
        <button type="button" disabled={selectedOrders.size === 0} style={{
          padding: '0.75rem 1.25rem',
          background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
          color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
          border: '2px solid #10b981',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Complete Selected
        </button>
        <button type="button" disabled={selectedOrders.size === 0} style={{
          padding: '0.75rem 1.25rem',
          background: selectedOrders.size === 0 ? '#d1d5db' : '#ffffff',
          color: selectedOrders.size === 0 ? '#9ca3af' : '#059669',
          border: '2px solid #10b981',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Print
        </button>
        <button type="button" onClick={loadData} style={{
          padding: '0.75rem 1.25rem',
          background: '#ffffff',
          color: '#059669',
          border: '2px solid #10b981',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Refresh
        </button>
      </div>

      {/* Section Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Orders Log</h1>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <div
          onClick={() => updateFilter('pending')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'pending' ? '0 8px 32px rgba(16, 185, 129, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'pending' ? '2px solid #10b981' : '2px solid transparent',
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem',
          }}>{pendingCount}</div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>Pending</div>
        </div>
        <div
          onClick={() => updateFilter('in-progress')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'in-progress' ? '0 8px 32px rgba(16, 185, 129, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'in-progress' ? '2px solid #10b981' : '2px solid transparent',
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem',
          }}>{inProgressCount}</div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>In Progress</div>
        </div>
        <div
          onClick={() => updateFilter('completed')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'completed' ? '0 8px 32px rgba(16, 185, 129, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'completed' ? '2px solid #10b981' : '2px solid transparent',
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem',
          }}>{completedCount}</div>
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
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            color: statCount > 0 ? '#ffffff' : '#6b7280',
            marginBottom: '0.5rem',
          }}>{statCount}</div>
          <div style={{ color: statCount > 0 ? '#ffffff' : '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>STAT Orders</div>
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
              onChange={(e) => updateFilter(e.target.value as OrderFilter)}
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
                updateFilter('all');
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
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
