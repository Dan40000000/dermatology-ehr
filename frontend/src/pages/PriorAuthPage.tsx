import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

interface PriorAuth {
  id: string;
  authNumber: string;
  patientId: string;
  firstName: string;
  lastName: string;
  medicationName: string;
  diagnosisCode: string;
  insuranceName: string;
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'additional_info_needed';
  urgency: 'routine' | 'urgent' | 'stat';
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  deniedAt: string | null;
  insuranceAuthNumber: string | null;
  denialReason: string | null;
  providerName: string;
}

export function PriorAuthPage() {
  const { session } = useAuth();
  const [priorAuths, setPriorAuths] = useState<PriorAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPA, setSelectedPA] = useState<PriorAuth | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadPriorAuths();
  }, [selectedStatus]);

  const loadPriorAuths = async () => {
    if (!session) return;

    try {
      setLoading(true);
      const params: any = {};
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }

      const response = await api.get('/api/prior-auth', {
        headers: {
          'X-Tenant-ID': session.tenantId,
          Authorization: `Bearer ${session.accessToken}`,
        },
        params,
      });

      setPriorAuths(response.data);
    } catch (error) {
      console.error('Failed to load prior authorizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      denied: 'bg-red-100 text-red-800',
      additional_info_needed: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getUrgencyColor = (urgency: string) => {
    const colors: Record<string, string> = {
      routine: 'text-gray-600',
      urgent: 'text-orange-600',
      stat: 'text-red-600 font-bold',
    };
    return colors[urgency] || 'text-gray-600';
  };

  const filteredPAs = priorAuths;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Electronic Prior Authorization (ePA)</h1>
        <p className="text-gray-600 mt-1">
          Manage prior authorization requests for medications requiring insurance approval
        </p>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="additional_info_needed">Additional Info Needed</option>
            </select>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Prior Auth Request
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900">{priorAuths.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">
            {priorAuths.filter((pa) => pa.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Submitted</p>
          <p className="text-2xl font-bold text-blue-600">
            {priorAuths.filter((pa) => pa.status === 'submitted').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Approved</p>
          <p className="text-2xl font-bold text-green-600">
            {priorAuths.filter((pa) => pa.status === 'approved').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Denied</p>
          <p className="text-2xl font-bold text-red-600">
            {priorAuths.filter((pa) => pa.status === 'denied').length}
          </p>
        </div>
      </div>

      {/* Prior Auth List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredPAs.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No prior authorization requests</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new prior auth request.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Request
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PA #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Medication
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Insurance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Urgency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPAs.map((pa) => (
                  <tr key={pa.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {pa.authNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {pa.firstName} {pa.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{pa.providerName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{pa.medicationName}</div>
                      <div className="text-sm text-gray-500">Dx: {pa.diagnosisCode}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {pa.insuranceName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getUrgencyColor(pa.urgency)}`}>
                        {pa.urgency.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                          pa.status
                        )}`}
                      >
                        {pa.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(pa.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedPA(pa);
                          setShowDetailModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View
                      </button>
                      <button className="text-green-600 hover:text-green-900 mr-3">Print</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && <CreatePAModal onClose={() => setShowCreateModal(false)} onSuccess={loadPriorAuths} />}

      {/* Detail Modal */}
      {showDetailModal && selectedPA && (
        <DetailPAModal pa={selectedPA} onClose={() => setShowDetailModal(false)} onUpdate={loadPriorAuths} />
      )}
    </div>
  );
}

// Create PA Modal Component
function CreatePAModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { session } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    patientId: '',
    medicationName: '',
    diagnosisCode: '',
    insuranceName: '',
    providerNpi: '',
    clinicalJustification: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'stat',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    if (!session) return;
    try {
      const response = await api.get('/api/patients', {
        headers: {
          'X-Tenant-ID': session.tenantId,
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
      setPatients(response.data);
    } catch (err) {
      console.error('Failed to load patients:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.patientId) {
      setError('Please select a patient');
      return;
    }

    if (!formData.clinicalJustification || formData.clinicalJustification.length < 10) {
      setError('Clinical justification must be at least 10 characters');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/prior-auth', formData, {
        headers: {
          'X-Tenant-ID': session!.tenantId,
          Authorization: `Bearer ${session!.accessToken}`,
        },
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create prior authorization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">New Prior Authorization Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.patientId}
              onChange={(e) => {
                const patient = patients.find((p) => p.id === e.target.value);
                setFormData({
                  ...formData,
                  patientId: e.target.value,
                  insuranceName: patient?.insurance || '',
                });
              }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} - DOB: {new Date(p.dateOfBirth).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {/* Medication Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medication Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.medicationName}
              onChange={(e) => setFormData({ ...formData, medicationName: e.target.value })}
              placeholder="e.g., Dupixent, Humira, Accutane"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Diagnosis Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diagnosis Code (ICD-10) <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.diagnosisCode}
              onChange={(e) => setFormData({ ...formData, diagnosisCode: e.target.value })}
              placeholder="e.g., L20.9 (Atopic dermatitis), L40.0 (Psoriasis)"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Insurance Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Insurance Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.insuranceName}
              onChange={(e) => setFormData({ ...formData, insuranceName: e.target.value })}
              placeholder="e.g., United Healthcare, Cigna, Aetna"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Provider NPI */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider NPI <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.providerNpi}
              onChange={(e) => setFormData({ ...formData, providerNpi: e.target.value })}
              placeholder="10-digit NPI number"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Urgency <span className="text-red-600">*</span>
            </label>
            <select
              value={formData.urgency}
              onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="routine">Routine (72 hours)</option>
              <option value="urgent">Urgent (24 hours)</option>
              <option value="stat">STAT (Same day)</option>
            </select>
          </div>

          {/* Clinical Justification */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clinical Justification <span className="text-red-600">*</span>
            </label>
            <textarea
              value={formData.clinicalJustification}
              onChange={(e) => setFormData({ ...formData, clinicalJustification: e.target.value })}
              placeholder="Explain why this medication is medically necessary. Include: failed prior treatments, severity of condition, specific clinical findings..."
              rows={6}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Minimum 10 characters. Be specific and thorough.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Prior Auth Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Detail PA Modal Component
function DetailPAModal({
  pa,
  onClose,
  onUpdate,
}: {
  pa: PriorAuth;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { session } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [updateData, setUpdateData] = useState({
    status: pa.status,
    insuranceAuthNumber: pa.insuranceAuthNumber || '',
    denialReason: pa.denialReason || '',
    notes: '',
  });

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await api.patch(`/api/prior-auth/${pa.id}`, updateData, {
        headers: {
          'X-Tenant-ID': session!.tenantId,
          Authorization: `Bearer ${session!.accessToken}`,
        },
      });
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to update PA:', err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Prior Authorization Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* PA Number */}
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-gray-600">PA Number</p>
            <p className="text-lg font-bold text-gray-900">{pa.authNumber}</p>
          </div>

          {/* Patient Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Patient</p>
              <p className="font-medium">{pa.firstName} {pa.lastName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Provider</p>
              <p className="font-medium">{pa.providerName}</p>
            </div>
          </div>

          {/* Medication Info */}
          <div>
            <p className="text-sm text-gray-600">Medication</p>
            <p className="font-medium">{pa.medicationName}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Diagnosis Code</p>
              <p className="font-medium">{pa.diagnosisCode}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Insurance</p>
              <p className="font-medium">{pa.insuranceName}</p>
            </div>
          </div>

          {/* Update Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Update Status</label>
            <select
              value={updateData.status}
              onChange={(e) => setUpdateData({ ...updateData, status: e.target.value as any })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="additional_info_needed">Additional Info Needed</option>
            </select>
          </div>

          {/* Insurance Auth Number */}
          {updateData.status === 'approved' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Insurance Authorization Number
              </label>
              <input
                type="text"
                value={updateData.insuranceAuthNumber}
                onChange={(e) => setUpdateData({ ...updateData, insuranceAuthNumber: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Enter auth number from insurance"
              />
            </div>
          )}

          {/* Denial Reason */}
          {updateData.status === 'denied' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Denial Reason</label>
              <textarea
                value={updateData.denialReason}
                onChange={(e) => setUpdateData({ ...updateData, denialReason: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2"
                rows={3}
                placeholder="Reason provided by insurance"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Add Notes</label>
            <textarea
              value={updateData.notes}
              onChange={(e) => setUpdateData({ ...updateData, notes: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
              rows={3}
              placeholder="Any additional notes..."
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {updating ? 'Updating...' : 'Update Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriorAuthPage;
