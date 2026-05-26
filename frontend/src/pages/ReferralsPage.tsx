import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Modal } from '../components/ui';
import { PatientLookupSelect } from '../components/patients/PatientLookupSelect';
import { createReferral, fetchPatients, fetchReferrals, updateReferral } from '../api';
import type { Patient, Referral } from '../types';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

type ReferralDirectionFilter = 'all' | 'incoming' | 'outgoing';
type ReferralStatusFilter = 'all' | 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
type ReferralPriorityFilter = 'all' | 'routine' | 'urgent' | 'stat';
type ReferralActionQuery = 'new' | 'incoming';

const REFERRAL_TAB_QUERY_MAP: Record<string, ReferralDirectionFilter> = {
  all: 'all',
  incoming: 'incoming',
  outgoing: 'outgoing',
  in: 'incoming',
  out: 'outgoing',
};

const REFERRAL_STATUS_QUERY_MAP: Record<string, ReferralStatusFilter> = {
  all: 'all',
  new: 'new',
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  'in-progress': 'in_progress',
  progress: 'in_progress',
  completed: 'completed',
  declined: 'declined',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

const REFERRAL_PRIORITY_QUERY_MAP: Record<string, ReferralPriorityFilter> = {
  all: 'all',
  routine: 'routine',
  urgent: 'urgent',
  stat: 'stat',
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filters, setFilters] = useState({
    status: 'all' as ReferralStatusFilter,
    direction: 'all' as ReferralDirectionFilter,
    priority: 'all' as ReferralPriorityFilter,
  });
  const [formData, setFormData] = useState(defaultForm);
  const [editData, setEditData] = useState({
    status: 'new',
    priority: 'routine',
    notes: '',
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const queryPatientId = searchParams.get('patientId') || undefined;

  const loadReferrals = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchReferrals(session.tenantId, session.accessToken, {
        status: filters.status !== 'all' ? filters.status : undefined,
        direction: filters.direction !== 'all' ? filters.direction : undefined,
        priority: filters.priority !== 'all' ? filters.priority : undefined,
        patientId: queryPatientId,
      });
      setReferrals(res.referrals || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [session, filters, queryPatientId, showError]);

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
    const requestedTab = searchParams.get('tab');
    if (requestedTab) {
      const normalized = requestedTab.toLowerCase();
      const mappedDirection = REFERRAL_TAB_QUERY_MAP[normalized];
      if (mappedDirection && filters.direction !== mappedDirection) {
        setFilters((prev) => ({ ...prev, direction: mappedDirection }));
      }

      if (mappedDirection && mappedDirection !== normalized) {
        const params = new URLSearchParams(searchParams);
        if (mappedDirection === 'all') {
          params.delete('tab');
        } else {
          params.set('tab', mappedDirection);
        }
        setSearchParams(params, { replace: true });
      }
    }

    const requestedStatus = searchParams.get('status');
    if (requestedStatus) {
      const normalized = requestedStatus.toLowerCase();
      const mappedStatus = REFERRAL_STATUS_QUERY_MAP[normalized];
      if (mappedStatus && filters.status !== mappedStatus) {
        setFilters((prev) => ({ ...prev, status: mappedStatus }));
      }

      if (mappedStatus && mappedStatus !== normalized) {
        const params = new URLSearchParams(searchParams);
        if (mappedStatus === 'all') {
          params.delete('status');
        } else {
          params.set('status', mappedStatus);
        }
        setSearchParams(params, { replace: true });
      }
    }

    const requestedPriority = searchParams.get('priority');
    if (requestedPriority) {
      const normalized = requestedPriority.toLowerCase();
      const mappedPriority = REFERRAL_PRIORITY_QUERY_MAP[normalized];
      if (mappedPriority && filters.priority !== mappedPriority) {
        setFilters((prev) => ({ ...prev, priority: mappedPriority }));
      }

      if (mappedPriority && mappedPriority !== normalized) {
        const params = new URLSearchParams(searchParams);
        if (mappedPriority === 'all') {
          params.delete('priority');
        } else {
          params.set('priority', mappedPriority);
        }
        setSearchParams(params, { replace: true });
      }
    }

    const requestedAction = (searchParams.get('action') || '').toLowerCase() as ReferralActionQuery | '';
    if (requestedAction === 'new' || requestedAction === 'incoming') {
      const direction = requestedAction === 'incoming' ? 'incoming' : 'outgoing';
      setFormData({ ...defaultForm, direction });
      setShowCreateModal(true);
      if (filters.direction !== direction) {
        setFilters((prev) => ({ ...prev, direction }));
      }

      const params = new URLSearchParams(searchParams);
      params.delete('action');
      params.set('tab', direction);
      setSearchParams(params, { replace: true });
    }
  }, [filters.direction, filters.priority, filters.status, searchParams, setSearchParams]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const updateDirectionFilter = useCallback((direction: ReferralDirectionFilter) => {
    setFilters((prev) => ({ ...prev, direction }));

    const params = new URLSearchParams(searchParams);
    if (direction === 'all') {
      params.delete('tab');
    } else {
      params.set('tab', direction);
    }
    params.delete('action');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateStatusFilter = useCallback((status: ReferralStatusFilter) => {
    setFilters((prev) => ({ ...prev, status }));

    const params = new URLSearchParams(searchParams);
    if (status === 'all') {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const updatePriorityFilter = useCallback((priority: ReferralPriorityFilter) => {
    setFilters((prev) => ({ ...prev, priority }));

    const params = new URLSearchParams(searchParams);
    if (priority === 'all') {
      params.delete('priority');
    } else {
      params.set('priority', priority);
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const openCreateModal = useCallback((direction: 'incoming' | 'outgoing') => {
    setFormData({ ...defaultForm, direction });
    setShowCreateModal(true);
    updateDirectionFilter(direction);
  }, [updateDirectionFilter]);

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
              onChange={(e) => updateStatusFilter(e.target.value as ReferralStatusFilter)}
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
              onChange={(e) => updateDirectionFilter(e.target.value as ReferralDirectionFilter)}
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
              onChange={(e) => updatePriorityFilter(e.target.value as ReferralPriorityFilter)}
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
            <PatientLookupSelect
              id="referral-patient"
              patients={patients}
              value={formData.patientId}
              onChange={(patientId) => setFormData((prev) => ({ ...prev, patientId }))}
              label="Patient"
              placeholder="Select patient"
            />
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowCreateModal(false);
              setFormData(defaultForm);
            }}
          >
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
