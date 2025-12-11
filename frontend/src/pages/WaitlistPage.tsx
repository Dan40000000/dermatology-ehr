import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Modal, Skeleton } from '../components/ui';
import { fetchPatients, fetchProviders } from '../api';
import type { Patient, Provider } from '../types';

interface WaitlistEntry {
  id: string;
  patientId: string;
  providerId?: string;
  reason: string;
  notes?: string;
  preferredStartDate?: string;
  preferredEndDate?: string;
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'any';
  preferredDaysOfWeek?: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'active' | 'contacted' | 'scheduled' | 'cancelled' | 'expired';
  patientNotifiedAt?: string;
  notificationMethod?: 'phone' | 'email' | 'sms' | 'portal';
  createdAt: string;
  // Joined data
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  provider_name?: string;
}

const PRIORITY_COLORS = {
  low: '#10b981',
  normal: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
};

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const STATUS_COLORS = {
  active: '#3b82f6',
  contacted: '#8b5cf6',
  scheduled: '#10b981',
  cancelled: '#6b7280',
  expired: '#ef4444',
};

export function WaitlistPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    patientId: '',
    providerId: '',
    reason: '',
    notes: '',
    preferredStartDate: '',
    preferredEndDate: '',
    preferredTimeOfDay: 'any' as 'morning' | 'afternoon' | 'evening' | 'any',
    preferredDaysOfWeek: [] as string[],
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
  });

  const [updateData, setUpdateData] = useState({
    status: 'contacted' as 'active' | 'contacted' | 'scheduled' | 'cancelled' | 'expired',
    patientNotifiedAt: '',
    notificationMethod: 'phone' as 'phone' | 'email' | 'sms' | 'portal',
    notes: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [waitlistRes, patientsRes, providersRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/waitlist${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }).then(r => r.json()).catch(() => []),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setWaitlist(Array.isArray(waitlistRes) ? waitlistRes : []);
      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, [session, statusFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!session) return;
    if (!formData.patientId || !formData.reason) {
      showError('Patient and reason are required');
      return;
    }

    setCreating(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          patientId: formData.patientId,
          providerId: formData.providerId || undefined,
          reason: formData.reason,
          notes: formData.notes || undefined,
          preferredStartDate: formData.preferredStartDate || undefined,
          preferredEndDate: formData.preferredEndDate || undefined,
          preferredTimeOfDay: formData.preferredTimeOfDay,
          preferredDaysOfWeek: formData.preferredDaysOfWeek.length > 0 ? formData.preferredDaysOfWeek : undefined,
          priority: formData.priority,
        }),
      });

      showSuccess('Patient added to waitlist');
      setShowCreateModal(false);
      setFormData({
        patientId: '',
        providerId: '',
        reason: '',
        notes: '',
        preferredStartDate: '',
        preferredEndDate: '',
        preferredTimeOfDay: 'any',
        preferredDaysOfWeek: [],
        priority: 'normal',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add to waitlist');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!session || !selectedEntry) return;

    setCreating(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/waitlist/${selectedEntry.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          status: updateData.status,
          patientNotifiedAt: updateData.patientNotifiedAt || new Date().toISOString(),
          notificationMethod: updateData.notificationMethod,
          notes: updateData.notes || undefined,
        }),
      });

      showSuccess('Waitlist entry updated');
      setShowUpdateModal(false);
      setSelectedEntry(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update waitlist entry');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    if (!window.confirm('Remove this patient from the waitlist?')) return;

    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/waitlist/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      showSuccess('Removed from waitlist');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to remove from waitlist');
    }
  };

  const openUpdateModal = (entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setUpdateData({
      status: entry.status,
      patientNotifiedAt: entry.patientNotifiedAt || '',
      notificationMethod: entry.notificationMethod || 'phone',
      notes: entry.notes || '',
    });
    setShowUpdateModal(true);
  };

  const filteredWaitlist = waitlist.filter((entry) => {
    if (priorityFilter !== 'all' && entry.priority !== priorityFilter) return false;
    if (providerFilter !== 'all' && entry.providerId !== providerFilter) return false;
    return true;
  });

  return (
    <div className="waitlist-page">
      {/* Header */}
      <div className="ema-action-bar">
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowCreateModal(true)}
        >
          <span className="icon">➕</span>
          Add to Waitlist
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon">🔃</span>
          Refresh
        </button>
      </div>

      <div className="ema-section-header">Appointment Waitlist</div>

      {/* Filters */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">Status</label>
            <select
              className="ema-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="contacted">Contacted</option>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Priority</label>
            <select
              className="ema-filter-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Provider</label>
            <select
              className="ema-filter-select"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="all">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Waitlist Table */}
      {loading ? (
        <Skeleton variant="card" height={400} />
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Patient</th>
              <th>Contact</th>
              <th>Provider</th>
              <th>Reason</th>
              <th>Preferred Time</th>
              <th>Status</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredWaitlist.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No waitlist entries found
                </td>
              </tr>
            ) : (
              filteredWaitlist.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: PRIORITY_COLORS[entry.priority],
                        color: 'white',
                      }}
                    >
                      {PRIORITY_LABELS[entry.priority]}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    {entry.last_name}, {entry.first_name}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {entry.phone && <div>{entry.phone}</div>}
                    {entry.email && <div>{entry.email}</div>}
                  </td>
                  <td>{entry.provider_name || 'Any'}</td>
                  <td>{entry.reason}</td>
                  <td style={{ fontSize: '0.875rem' }}>
                    <div>
                      {entry.preferredTimeOfDay === 'any'
                        ? 'Any time'
                        : entry.preferredTimeOfDay.charAt(0).toUpperCase() + entry.preferredTimeOfDay.slice(1)}
                    </div>
                    {entry.preferredDaysOfWeek && entry.preferredDaysOfWeek.length > 0 && (
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        {entry.preferredDaysOfWeek.join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        backgroundColor: STATUS_COLORS[entry.status],
                        color: 'white',
                      }}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => openUpdateModal(entry)}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-danger"
                        onClick={() => handleDelete(entry.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        title="Add Patient to Waitlist"
        onClose={() => setShowCreateModal(false)}
      >
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Patient *</label>
              <select
                value={formData.patientId}
                onChange={(e) => setFormData((prev) => ({ ...prev, patientId: e.target.value }))}
              >
                <option value="">Select Patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Priority *</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as any }))}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Preferred Provider</label>
            <select
              value={formData.providerId}
              onChange={(e) => setFormData((prev) => ({ ...prev, providerId: e.target.value }))}
            >
              <option value="">Any Provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Reason *</label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="e.g., Earlier appointment, specific time slot"
            />
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional details..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Preferred Start Date</label>
              <input
                type="date"
                value={formData.preferredStartDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, preferredStartDate: e.target.value }))}
              />
            </div>

            <div className="form-field">
              <label>Preferred End Date</label>
              <input
                type="date"
                value={formData.preferredEndDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, preferredEndDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-field">
            <label>Preferred Time of Day</label>
            <select
              value={formData.preferredTimeOfDay}
              onChange={(e) => setFormData((prev) => ({ ...prev, preferredTimeOfDay: e.target.value as any }))}
            >
              <option value="any">Any Time</option>
              <option value="morning">Morning (6am-12pm)</option>
              <option value="afternoon">Afternoon (12pm-5pm)</option>
              <option value="evening">Evening (5pm-8pm)</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Adding...' : 'Add to Waitlist'}
          </button>
        </div>
      </Modal>

      {/* Update Modal */}
      <Modal
        isOpen={showUpdateModal}
        title="Update Waitlist Entry"
        onClose={() => setShowUpdateModal(false)}
      >
        {selectedEntry && (
          <div className="modal-form">
            <div
              style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                {selectedEntry.last_name}, {selectedEntry.first_name}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                <div>Reason: {selectedEntry.reason}</div>
                <div>Priority: {PRIORITY_LABELS[selectedEntry.priority]}</div>
              </div>
            </div>

            <div className="form-field">
              <label>Status *</label>
              <select
                value={updateData.status}
                onChange={(e) => setUpdateData((prev) => ({ ...prev, status: e.target.value as any }))}
              >
                <option value="active">Active</option>
                <option value="contacted">Contacted</option>
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div className="form-field">
              <label>Notification Method</label>
              <select
                value={updateData.notificationMethod}
                onChange={(e) => setUpdateData((prev) => ({ ...prev, notificationMethod: e.target.value as any }))}
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="portal">Patient Portal</option>
              </select>
            </div>

            <div className="form-field">
              <label>Additional Notes</label>
              <textarea
                value={updateData.notes}
                onChange={(e) => setUpdateData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Add notes about contact attempt..."
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowUpdateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleUpdate} disabled={creating}>
            {creating ? 'Updating...' : 'Update'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
