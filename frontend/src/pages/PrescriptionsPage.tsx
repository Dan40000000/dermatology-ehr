import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, createOrder, sendErx } from '../api';
import type { Order, Patient } from '../types';

type RxFilter = 'all' | 'pending' | 'ordered' | 'completed' | 'cancelled';

const COMMON_DERM_MEDS = [
  { name: 'Tretinoin 0.025% cream', category: 'Retinoid' },
  { name: 'Tretinoin 0.05% cream', category: 'Retinoid' },
  { name: 'Hydrocortisone 2.5% cream', category: 'Steroid' },
  { name: 'Triamcinolone 0.1% cream', category: 'Steroid' },
  { name: 'Clobetasol 0.05% cream', category: 'Steroid' },
  { name: 'Mupirocin 2% ointment', category: 'Antibiotic' },
  { name: 'Clindamycin 1% gel', category: 'Antibiotic' },
  { name: 'Doxycycline 100mg capsule', category: 'Antibiotic' },
  { name: 'Ketoconazole 2% cream', category: 'Antifungal' },
  { name: 'Terbinafine 1% cream', category: 'Antifungal' },
  { name: 'Fluorouracil 5% cream', category: 'Chemotherapy' },
  { name: 'Imiquimod 5% cream', category: 'Immunomodulator' },
  { name: 'Tacrolimus 0.1% ointment', category: 'Immunomodulator' },
  { name: 'Methotrexate 2.5mg tablet', category: 'Systemic' },
  { name: 'Isotretinoin 40mg capsule', category: 'Systemic' },
];

const FREQUENCIES = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every other day',
  'Once weekly',
  'As needed',
];

const QUANTITIES = ['15g', '30g', '45g', '60g', '90g', '30 tabs', '60 tabs', '90 tabs'];

export function PrescriptionsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [prescriptions, setPrescriptions] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<RxFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRx, setSelectedRx] = useState<Set<string>>(new Set());

  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [newRx, setNewRx] = useState({
    patientId: '',
    medication: '',
    strength: '',
    quantity: '30g',
    frequency: 'Twice daily',
    refills: '0',
    instructions: '',
    pharmacy: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [ordersRes, patientsRes] = await Promise.all([
        fetchOrders(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      const rxOrders = (ordersRes.orders || []).filter((o: Order) => o.type === 'rx');
      setPrescriptions(rxOrders);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateRx = async () => {
    if (!session || !newRx.patientId || !newRx.medication) {
      showError('Please fill in required fields');
      return;
    }

    setSending(true);
    try {
      const details = `${newRx.medication} ${newRx.strength}\nQty: ${newRx.quantity}\nSig: ${newRx.frequency}\nRefills: ${newRx.refills}${newRx.instructions ? `\nInstructions: ${newRx.instructions}` : ''}`;

      await createOrder(session.tenantId, session.accessToken, {
        patientId: newRx.patientId,
        type: 'rx',
        details,
        notes: newRx.pharmacy ? `Pharmacy: ${newRx.pharmacy}` : undefined,
        status: 'pending',
      });

      showSuccess('Prescription created');
      setShowNewRxModal(false);
      setNewRx({
        patientId: '',
        medication: '',
        strength: '',
        quantity: '30g',
        frequency: 'Twice daily',
        refills: '0',
        instructions: '',
        pharmacy: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create prescription');
    } finally {
      setSending(false);
    }
  };

  const handleSendErx = async (rx: Order) => {
    if (!session) return;

    try {
      await sendErx(session.tenantId, session.accessToken, {
        orderId: rx.id,
        patientId: rx.patientId,
      });
      showSuccess('Prescription sent electronically');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to send e-prescription');
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const filteredRx = prescriptions.filter((rx) => {
    if (filter !== 'all' && rx.status !== filter) return false;
    if (searchTerm) {
      const patientName = getPatientName(rx.patientId).toLowerCase();
      const details = (rx.details || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !details.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const toggleRxSelection = (rxId: string) => {
    const newSelected = new Set(selectedRx);
    if (newSelected.has(rxId)) {
      newSelected.delete(rxId);
    } else {
      newSelected.add(rxId);
    }
    setSelectedRx(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRx.size === filteredRx.length) {
      setSelectedRx(new Set());
    } else {
      setSelectedRx(new Set(filteredRx.map((r) => r.id)));
    }
  };

  // Stats
  const pendingCount = prescriptions.filter((r) => r.status === 'pending').length;
  const sentCount = prescriptions.filter((r) => r.status === 'ordered').length;
  const filledCount = prescriptions.filter((r) => r.status === 'completed').length;

  return (
    <div className="prescriptions-page">
      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => setShowNewRxModal(true)}>
          <span className="icon">➕</span>
          New Prescription
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0}>
          <span className="icon">📤</span>
          Send eRx
        </button>
        <button type="button" className="ema-action-btn" disabled={selectedRx.size === 0}>
          <span className="icon">🖨️</span>
          Print
        </button>
        <button type="button" className="ema-action-btn">
          <span className="icon">📜</span>
          Rx History
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon">🔃</span>
          Refresh
        </button>
      </div>

      {/* Section Header */}
      <div className="ema-section-header">Prescriptions (eRx)</div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', padding: '1rem' }}>
        <div
          className="stat-card-teal"
          style={{ cursor: 'pointer', opacity: filter === 'all' ? 1 : 0.8 }}
          onClick={() => setFilter('all')}
        >
          <div className="stat-number">{prescriptions.length}</div>
          <div className="stat-label">Total Rx</div>
        </div>
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
          style={{ cursor: 'pointer', opacity: filter === 'ordered' ? 1 : 0.8 }}
          onClick={() => setFilter('ordered')}
        >
          <div className="stat-number">{sentCount}</div>
          <div className="stat-label">Sent</div>
        </div>
        <div
          className="stat-card-teal"
          style={{ cursor: 'pointer', opacity: filter === 'completed' ? 1 : 0.8, background: '#10b981' }}
          onClick={() => setFilter('completed')}
        >
          <div className="stat-number">{filledCount}</div>
          <div className="stat-label">Filled</div>
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
              placeholder="Search prescriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Status</label>
            <select
              className="ema-filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as RxFilter)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ordered">Sent</option>
              <option value="completed">Filled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">&nbsp;</label>
            <button
              type="button"
              className="ema-filter-btn secondary"
              onClick={() => {
                setFilter('all');
                setSearchTerm('');
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Prescriptions Table */}
      {loading ? (
        <div style={{ padding: '1rem' }}>
          <Skeleton variant="card" height={400} />
        </div>
      ) : filteredRx.length === 0 ? (
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💊</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Prescriptions Found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {filter !== 'all' ? 'Try adjusting your filters' : 'Create your first prescription'}
          </p>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedRx.size === filteredRx.length && filteredRx.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Patient</th>
              <th>Medication</th>
              <th>Sig</th>
              <th>Qty / Refills</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRx.map((rx) => {
              const lines = (rx.details || '').split('\n');
              const medication = lines[0] || '';
              const qty = lines.find((l) => l.startsWith('Qty:'))?.replace('Qty: ', '') || '';
              const sig = lines.find((l) => l.startsWith('Sig:'))?.replace('Sig: ', '') || '';
              const refills = lines.find((l) => l.startsWith('Refills:'))?.replace('Refills: ', '') || '0';

              return (
                <tr
                  key={rx.id}
                  style={{
                    background: rx.status === 'completed' ? '#f0fdf4' : undefined,
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedRx.has(rx.id)}
                      onChange={() => toggleRxSelection(rx.id)}
                    />
                  </td>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {getPatientName(rx.patientId)}
                    </a>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{medication}</div>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>{sig}</td>
                  <td style={{ fontSize: '0.875rem' }}>
                    {qty} / {refills} refills
                  </td>
                  <td>
                    <span
                      className={`ema-status ${
                        rx.status === 'completed'
                          ? 'established'
                          : rx.status === 'ordered'
                          ? 'pending'
                          : rx.status === 'cancelled'
                          ? 'cancelled'
                          : 'pending'
                      }`}
                    >
                      {rx.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(rx.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {rx.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSendErx(rx)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#0369a1',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Send eRx
                          </button>
                          <button
                            type="button"
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            Print
                          </button>
                        </>
                      )}
                      {rx.status === 'ordered' && (
                        <button
                          type="button"
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Resend
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

      {/* New Rx Modal */}
      <Modal isOpen={showNewRxModal} title="New Prescription" onClose={() => setShowNewRxModal(false)} size="lg">
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={newRx.patientId}
              onChange={(e) => setNewRx((prev) => ({ ...prev, patientId: e.target.value }))}
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
            <label>Medication *</label>
            <select
              value={newRx.medication}
              onChange={(e) => setNewRx((prev) => ({ ...prev, medication: e.target.value }))}
            >
              <option value="">Select medication...</option>
              {COMMON_DERM_MEDS.map((med) => (
                <option key={med.name} value={med.name}>
                  {med.name} ({med.category})
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Quantity</label>
              <select
                value={newRx.quantity}
                onChange={(e) => setNewRx((prev) => ({ ...prev, quantity: e.target.value }))}
              >
                {QUANTITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Frequency</label>
              <select
                value={newRx.frequency}
                onChange={(e) => setNewRx((prev) => ({ ...prev, frequency: e.target.value }))}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Refills</label>
              <select
                value={newRx.refills}
                onChange={(e) => setNewRx((prev) => ({ ...prev, refills: e.target.value }))}
              >
                {['0', '1', '2', '3', '4', '5', '6', '11'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Additional Instructions</label>
            <textarea
              value={newRx.instructions}
              onChange={(e) => setNewRx((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="Apply to affected area..."
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>Pharmacy</label>
            <input
              type="text"
              value={newRx.pharmacy}
              onChange={(e) => setNewRx((prev) => ({ ...prev, pharmacy: e.target.value }))}
              placeholder="CVS, Walgreens, etc."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowNewRxModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateRx} disabled={sending}>
            {sending ? 'Creating...' : 'Create Prescription'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
