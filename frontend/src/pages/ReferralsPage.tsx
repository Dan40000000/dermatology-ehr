import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Modal } from '../components/ui';
import { createReferral, fetchPatients, fetchReferrals, updateReferral } from '../api';
import type { Patient, Referral } from '../types';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

const defaultForm = {
  patientId: '',
  direction: 'outgoing',
  status: 'new',
  priority: 'routine',
  referringProvider: '',
  referringOrganization: '',
  referredToProvider: '',
  referredToOrganization: '',
  appointmentId: '',
  reason: '',
  notes: '',
};

export function ReferralsPage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState({
    status: 'all',
    direction: 'all',
    priority: 'all',
  });
  const [formData, setFormData] = useState(defaultForm);
  const [editData, setEditData] = useState({
    status: 'new',
    priority: 'routine',
    notes: '',
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);

  const loadReferrals = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchReferrals(session.tenantId, session.accessToken, {
        status: filters.status !== 'all' ? filters.status : undefined,
        direction: filters.direction !== 'all' ? filters.direction : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
      });
      setReferrals(res.referrals || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [session, filters, showError]);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(res.data || res.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load patients');
    }
  }, [session, showError]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const openCreateModal = (direction: 'incoming' | 'outgoing') => {
    setFormData({ ...defaultForm, direction });
    setShowCreateModal(true);
  };

  const handleCreateReferral = async () => {
    if (!session) return;
    if (!formData.patientId) {
      showError('Select a patient');
      return;
    }
    try {
      await createReferral(session.tenantId, session.accessToken, formData);
      showSuccess('Referral created');
      setShowCreateModal(false);
      setFormData(defaultForm);
      loadReferrals();
    } catch (err: any) {
      showError(err.message || 'Failed to create referral');
    }
  };

  const handleOpenEdit = (referral: Referral) => {
    setEditingReferral(referral);
    setEditData({
      status: referral.status,
      priority: referral.priority,
      notes: referral.notes || '',
    });
  };

  const handleUpdateReferral = async () => {
    if (!session || !editingReferral) return;
    try {
      await updateReferral(session.tenantId, session.accessToken, editingReferral.id, editData);
      showSuccess('Referral updated');
      setEditingReferral(null);
      loadReferrals();
    } catch (err: any) {
      showError(err.message || 'Failed to update referral');
    }
  };

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Referrals</div>
          <h1>Referrals</h1>
          <p className="muted">Manage incoming and outgoing referrals with tracking.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle} onClick={() => openCreateModal('incoming')}>
            Log Incoming
          </button>
          <button type="button" style={actionStyle} onClick={() => openCreateModal('outgoing')}>
            New Referral
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <div className="form-field">
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="filter-direction">Direction</label>
            <select
              id="filter-direction"
              value={filters.direction}
              onChange={(e) => setFilters((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <option value="all">All</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="filter-priority">Priority</label>
            <select
              id="filter-priority"
              value={filters.priority}
              onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
            >
              <option value="all">All</option>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading referrals...</p>
        ) : referrals.length === 0 ? (
          <EmptyState
            title="No referrals yet"
            description="Referral activity will be listed here as it is created."
          />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      {referral.patientLastName
                        ? `${referral.patientLastName}, ${referral.patientFirstName}`
                        : referral.patientId}
                    </td>
                    <td>{referral.direction}</td>
                    <td>{referral.status.replace(/_/g, ' ')}</td>
                    <td>{referral.priority.toUpperCase()}</td>
                    <td>{referral.reason || '—'}</td>
                    <td>
                      <button type="button" className="ghost" onClick={() => handleOpenEdit(referral)}>
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setFormData(defaultForm);
        }}
        title={formData.direction === 'incoming' ? 'Log Incoming Referral' : 'New Referral'}
      >
        <div className="modal-form">
          <div className="form-field">
            <label htmlFor="referral-patient">Patient</label>
            <select
              id="referral-patient"
              value={formData.patientId}
              onChange={(e) => setFormData((prev) => ({ ...prev, patientId: e.target.value }))}
            >
              <option value="">Select patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.lastName}, {patient.firstName}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <div className="form-field">
              <label htmlFor="referral-status">Status</label>
              <select
                id="referral-status"
                value={formData.status}
                onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="new">New</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="referral-priority">Priority</label>
              <select
                id="referral-priority"
                value={formData.priority}
                onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="referral-referring-provider">Referring Provider</label>
            <input
              id="referral-referring-provider"
              type="text"
              value={formData.referringProvider}
              onChange={(e) => setFormData((prev) => ({ ...prev, referringProvider: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="referral-referring-org">Referring Organization</label>
            <input
              id="referral-referring-org"
              type="text"
              value={formData.referringOrganization}
              onChange={(e) => setFormData((prev) => ({ ...prev, referringOrganization: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="referral-referred-provider">Referred To Provider</label>
            <input
              id="referral-referred-provider"
              type="text"
              value={formData.referredToProvider}
              onChange={(e) => setFormData((prev) => ({ ...prev, referredToProvider: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="referral-referred-org">Referred To Organization</label>
            <input
              id="referral-referred-org"
              type="text"
              value={formData.referredToOrganization}
              onChange={(e) => setFormData((prev) => ({ ...prev, referredToOrganization: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="referral-reason">Reason</label>
            <input
              id="referral-reason"
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="referral-notes">Notes</label>
            <textarea
              id="referral-notes"
              rows={4}
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateReferral}>
            Save Referral
          </button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(editingReferral)} onClose={() => setEditingReferral(null)} title="Update Referral">
        <div className="modal-form">
          <div className="form-field">
            <label htmlFor="edit-status">Status</label>
            <select
              id="edit-status"
              value={editData.status}
              onChange={(e) => setEditData((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="new">New</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="edit-priority">Priority</label>
            <select
              id="edit-priority"
              value={editData.priority}
              onChange={(e) => setEditData((prev) => ({ ...prev, priority: e.target.value }))}
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="edit-notes">Notes</label>
            <textarea
              id="edit-notes"
              rows={4}
              value={editData.notes}
              onChange={(e) => setEditData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setEditingReferral(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleUpdateReferral}>
            Save Updates
          </button>
        </div>
      </Modal>
    </div>
  );
}
