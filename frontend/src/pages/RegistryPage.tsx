import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState, Modal } from '../components/ui';
import {
  fetchRegistryCohorts,
  fetchRegistryMembers,
  createRegistryCohort,
  addRegistryMember,
  removeRegistryMember,
  fetchPatients,
} from '../api';
import type { RegistryCohort, RegistryMember, Patient } from '../types';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function RegistryPage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [cohorts, setCohorts] = useState<RegistryCohort[]>([]);
  const [members, setMembers] = useState<RegistryMember[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<RegistryCohort | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active',
  });
  const [memberPatientId, setMemberPatientId] = useState('');

  const loadCohorts = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetchRegistryCohorts(session.tenantId, session.accessToken);
      setCohorts(res.cohorts || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load registries');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  const loadMembers = useCallback(
    async (cohortId: string) => {
      if (!session) return;
      try {
        const res = await fetchRegistryMembers(session.tenantId, session.accessToken, cohortId);
        setMembers(res.members || []);
      } catch (err: any) {
        showError(err.message || 'Failed to load registry members');
      }
    },
    [session, showError]
  );

  const loadPatients = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(res.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load patients');
    }
  }, [session, showError]);

  useEffect(() => {
    loadCohorts();
    loadPatients();
  }, [loadCohorts, loadPatients]);

  useEffect(() => {
    if (selectedCohort) {
      loadMembers(selectedCohort.id);
    } else {
      setMembers([]);
    }
  }, [selectedCohort, loadMembers]);

  const handleCreate = async () => {
    if (!session) return;
    try {
      await createRegistryCohort(session.tenantId, session.accessToken, formData);
      showSuccess('Registry created');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', status: 'active' });
      loadCohorts();
    } catch (err: any) {
      showError(err.message || 'Failed to create registry');
    }
  };

  const handleAddMember = async () => {
    if (!session || !selectedCohort) return;
    if (!memberPatientId) {
      showError('Select a patient to add');
      return;
    }
    try {
      await addRegistryMember(session.tenantId, session.accessToken, selectedCohort.id, {
        patientId: memberPatientId,
      });
      showSuccess('Patient added to registry');
      setMemberPatientId('');
      setShowAddMemberModal(false);
      loadMembers(selectedCohort.id);
      loadCohorts();
    } catch (err: any) {
      showError(err.message || 'Failed to add patient');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!session || !selectedCohort) return;
    try {
      await removeRegistryMember(session.tenantId, session.accessToken, selectedCohort.id, memberId);
      showSuccess('Patient removed');
      loadMembers(selectedCohort.id);
      loadCohorts();
    } catch (err: any) {
      showError(err.message || 'Failed to remove patient');
    }
  };

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">Registry</div>
          <h1>Registry</h1>
          <p className="muted">Track patient cohorts, outcomes, and quality metrics.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle} onClick={() => setShowCreateModal(true)}>
            Create Registry
          </button>
          <button
            type="button"
            style={actionStyle}
            onClick={() => setShowAddMemberModal(true)}
            disabled={!selectedCohort}
          >
            Add Patient
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {loading ? (
          <p className="muted">Loading registries...</p>
        ) : cohorts.length === 0 ? (
          <EmptyState
            title="No registries yet"
            description="Registries will appear here once cohorts are configured."
          />
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.id}>
                    <td>{cohort.name}</td>
                    <td>{cohort.status}</td>
                    <td>{cohort.memberCount || 0}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setSelectedCohort(cohort)}
                      >
                        View Members
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedCohort && (
        <div style={{ padding: '0 1.5rem 1.5rem' }}>
          <div className="section-header" style={{ marginBottom: '1rem' }}>
            <div>
              <div className="eyebrow">Members</div>
              <h2>{selectedCohort.name}</h2>
            </div>
            <button type="button" className="ghost" onClick={() => setSelectedCohort(null)}>
              Clear Selection
            </button>
          </div>
          {members.length === 0 ? (
            <EmptyState
              title="No members yet"
              description="Add patients to start tracking this registry."
            />
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        {member.patientLastName}, {member.patientFirstName}
                      </td>
                      <td>{member.status}</td>
                      <td>{member.addedAt ? new Date(member.addedAt).toLocaleDateString() : '--'}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Registry">
          <div className="form-grid">
            <label>
              Name
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label>
              Description
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label>
              Status
              <select
                value={formData.status}
                onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="ghost" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="button" onClick={handleCreate}>
                Save Registry
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showAddMemberModal && (
        <Modal isOpen={showAddMemberModal} onClose={() => setShowAddMemberModal(false)} title="Add Patient">
          <div className="form-grid">
            <label>
              Patient
              <select
                value={memberPatientId}
                onChange={(e) => setMemberPatientId(e.target.value)}
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.lastName}, {patient.firstName}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="ghost" onClick={() => setShowAddMemberModal(false)}>
                Cancel
              </button>
              <button type="button" onClick={handleAddMember}>
                Add to Registry
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
