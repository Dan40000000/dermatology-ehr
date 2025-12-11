import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, createOrder, updateOrderStatus } from '../api';
import type { Order, Patient } from '../types';

type ImagingFilter = 'all' | 'pending' | 'scheduled' | 'completed';

const IMAGING_TYPES = [
  { name: 'X-Ray', modality: 'XR' },
  { name: 'CT Scan', modality: 'CT' },
  { name: 'MRI', modality: 'MR' },
  { name: 'Ultrasound', modality: 'US' },
  { name: 'PET Scan', modality: 'PT' },
];

const COMMON_DERM_IMAGING = [
  { name: 'Chest X-Ray', modality: 'XR', indication: 'Metastatic workup' },
  { name: 'CT Chest/Abdomen/Pelvis', modality: 'CT', indication: 'Staging melanoma' },
  { name: 'PET/CT', modality: 'PT', indication: 'Metastatic melanoma staging' },
  { name: 'MRI Brain', modality: 'MR', indication: 'CNS metastases' },
  { name: 'Ultrasound - Lymph Nodes', modality: 'US', indication: 'Lymphadenopathy evaluation' },
  { name: 'Ultrasound - Soft Tissue', modality: 'US', indication: 'Mass characterization' },
  { name: 'CT Soft Tissue', modality: 'CT', indication: 'Deep tissue evaluation' },
  { name: 'Dermoscopy/Dermatoscopic Photography', modality: 'Other', indication: 'Lesion documentation' },
];

export function RadiologyPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [imagingOrders, setImagingOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<ImagingFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showNewImagingModal, setShowNewImagingModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newImaging, setNewImaging] = useState({
    patientId: '',
    study: '',
    indication: '',
    priority: 'routine' as 'stat' | 'urgent' | 'routine',
    contrast: false,
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

      const imaging = (ordersRes.orders || []).filter((o: Order) => o.type === 'imaging');
      setImagingOrders(imaging);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load imaging orders');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateImaging = async () => {
    if (!session || !newImaging.patientId || !newImaging.study) {
      showError('Please fill in required fields');
      return;
    }

    setCreating(true);
    try {
      const details = `${newImaging.study}${newImaging.contrast ? ' with contrast' : ''}\nIndication: ${newImaging.indication}`;

      await createOrder(session.tenantId, session.accessToken, {
        patientId: newImaging.patientId,
        type: 'imaging',
        details,
        priority: newImaging.priority,
        notes: newImaging.notes,
        status: 'pending',
      });

      showSuccess('Imaging order created');
      setShowNewImagingModal(false);
      setNewImaging({
        patientId: '',
        study: '',
        indication: '',
        priority: 'routine',
        contrast: false,
        notes: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create imaging order');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    if (!session) return;

    try {
      await updateOrderStatus(session.tenantId, session.accessToken, orderId, status);
      showSuccess('Status updated');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update status');
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const filteredImaging = imagingOrders.filter((img) => {
    const status = img.status === 'ordered' ? 'scheduled' : img.status;
    if (filter !== 'all' && status !== filter) return false;
    if (searchTerm) {
      const patientName = getPatientName(img.patientId).toLowerCase();
      const details = (img.details || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !details.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'ordered':
      case 'scheduled':
      case 'in-progress':
        return 'in-progress';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  };

  const getModalityIcon = (details?: string) => {
    if (!details) return '📷';
    const lower = details.toLowerCase();
    if (lower.includes('x-ray') || lower.includes('xr')) return '☢️';
    if (lower.includes('ct')) return '🔬';
    if (lower.includes('mri') || lower.includes('mr ')) return '🧲';
    if (lower.includes('ultrasound') || lower.includes('us ')) return '🔊';
    if (lower.includes('pet')) return '⚛️';
    return '📷';
  };

  if (loading) {
    return (
      <div className="radiology-page">
        <div className="page-header">
          <h1>Radiology</h1>
        </div>
        <Skeleton variant="card" height={60} />
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="radiology-page">
      <div className="page-header">
        <h1>Radiology / Imaging</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowNewImagingModal(true)}
        >
          + New Imaging Order
        </button>
      </div>

      {/* Filters */}
      <div className="imaging-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search imaging orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          {(['all', 'pending', 'scheduled', 'completed'] as ImagingFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Imaging Orders List */}
      {filteredImaging.length === 0 ? (
        <Panel title="">
          <div className="empty-state">
            <div className="empty-icon">📷</div>
            <h3>No imaging orders found</h3>
            <p className="muted">
              {filter !== 'all' ? 'Try adjusting your filters' : 'Create your first imaging order'}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="imaging-list">
          {filteredImaging.map((img) => (
            <div key={img.id} className="imaging-card">
              <div className="imaging-icon">{getModalityIcon(img.details)}</div>

              <div className="imaging-content">
                <div className="imaging-header">
                  <span className="imaging-patient strong">{getPatientName(img.patientId)}</span>
                  <span className={`pill ${getStatusColor(img.status)}`}>
                    {img.status === 'ordered' ? 'scheduled' : img.status}
                  </span>
                </div>

                <div className="imaging-study">
                  {img.details?.split('\n')[0]}
                </div>

                {img.details?.includes('Indication:') && (
                  <div className="imaging-indication muted">
                    {img.details.split('\n').find((l) => l.includes('Indication:'))}
                  </div>
                )}

                <div className="imaging-meta muted tiny">
                  Ordered: {new Date(img.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="imaging-actions">
                {img.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      className="btn-sm btn-secondary"
                      onClick={() => handleStatusChange(img.id, 'ordered')}
                    >
                      Schedule
                    </button>
                    <button type="button" className="btn-sm btn-secondary">
                      Print Req
                    </button>
                  </>
                )}
                {img.status === 'ordered' && (
                  <button
                    type="button"
                    className="btn-sm btn-success"
                    onClick={() => handleStatusChange(img.id, 'completed')}
                  >
                    Mark Complete
                  </button>
                )}
                {img.status === 'completed' && (
                  <button type="button" className="btn-sm btn-secondary">
                    View Results
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Imaging Modal */}
      <Modal
        isOpen={showNewImagingModal}
        title="New Imaging Order"
        onClose={() => setShowNewImagingModal(false)}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Patient *</label>
              <select
                value={newImaging.patientId}
                onChange={(e) => setNewImaging((prev) => ({ ...prev, patientId: e.target.value }))}
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Priority</label>
              <select
                value={newImaging.priority}
                onChange={(e) =>
                  setNewImaging((prev) => ({
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
            <label>Study *</label>
            <select
              value={newImaging.study}
              onChange={(e) => {
                const selected = COMMON_DERM_IMAGING.find((i) => i.name === e.target.value);
                setNewImaging((prev) => ({
                  ...prev,
                  study: e.target.value,
                  indication: selected?.indication || prev.indication,
                }));
              }}
            >
              <option value="">Select study...</option>
              {IMAGING_TYPES.map((type) => (
                <optgroup key={type.modality} label={type.name}>
                  {COMMON_DERM_IMAGING.filter((i) => i.modality === type.modality).map((study) => (
                    <option key={study.name} value={study.name}>
                      {study.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Clinical Indication *</label>
            <input
              type="text"
              value={newImaging.indication}
              onChange={(e) => setNewImaging((prev) => ({ ...prev, indication: e.target.value }))}
              placeholder="Reason for imaging..."
            />
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newImaging.contrast}
                onChange={(e) => setNewImaging((prev) => ({ ...prev, contrast: e.target.checked }))}
              />
              With Contrast
            </label>
          </div>

          <div className="form-field">
            <label>Additional Notes</label>
            <textarea
              value={newImaging.notes}
              onChange={(e) => setNewImaging((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Special instructions, allergies, etc."
              rows={2}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowNewImagingModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreateImaging}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Imaging Order'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
