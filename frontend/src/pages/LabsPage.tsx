import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, createOrder, updateOrderStatus } from '../api';
import type { Order, Patient } from '../types';

type LabFilter = 'all' | 'pending' | 'in-progress' | 'completed';

const COMMON_DERM_LABS = [
  { name: 'CBC with Differential', code: '85025' },
  { name: 'Comprehensive Metabolic Panel', code: '80053' },
  { name: 'Liver Function Tests', code: '80076' },
  { name: 'Lipid Panel', code: '80061' },
  { name: 'ANA (Antinuclear Antibody)', code: '86038' },
  { name: 'ESR (Sed Rate)', code: '85652' },
  { name: 'CRP (C-Reactive Protein)', code: '86140' },
  { name: 'Vitamin D, 25-Hydroxy', code: '82306' },
  { name: 'TSH', code: '84443' },
  { name: 'Zinc Level', code: '84630' },
  { name: 'Ferritin', code: '82728' },
  { name: 'HgbA1c', code: '83036' },
  { name: 'HIV Screening', code: '86701' },
  { name: 'Hepatitis Panel', code: '80074' },
  { name: 'RPR (Syphilis)', code: '86592' },
  { name: 'Fungal Culture', code: '87101' },
  { name: 'Bacterial Culture', code: '87070' },
  { name: 'HSV PCR', code: '87529' },
];

export function LabsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [labOrders, setLabOrders] = useState<Order[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<LabFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLabs, setSelectedLabs] = useState<Set<string>>(new Set());

  const [showNewLabModal, setShowNewLabModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedLab, setSelectedLab] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);

  const [newLab, setNewLab] = useState({
    patientId: '',
    tests: [] as string[],
    priority: 'routine' as 'stat' | 'urgent' | 'routine',
    fasting: false,
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

      const labs = (ordersRes.orders || []).filter((o: Order) => o.type === 'lab');
      setLabOrders(labs);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load lab orders');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateLab = async () => {
    if (!session || !newLab.patientId || newLab.tests.length === 0) {
      showError('Please select patient and at least one test');
      return;
    }

    setCreating(true);
    try {
      const details = newLab.tests.join('\n') + (newLab.fasting ? '\n\n** FASTING REQUIRED **' : '');

      await createOrder(session.tenantId, session.accessToken, {
        patientId: newLab.patientId,
        type: 'lab',
        details,
        priority: newLab.priority,
        notes: newLab.notes,
        status: 'pending',
      });

      showSuccess('Lab order created');
      setShowNewLabModal(false);
      setNewLab({
        patientId: '',
        tests: [],
        priority: 'routine',
        fasting: false,
        notes: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create lab order');
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

  const toggleTest = (testName: string) => {
    setNewLab((prev) => ({
      ...prev,
      tests: prev.tests.includes(testName)
        ? prev.tests.filter((t) => t !== testName)
        : [...prev.tests, testName],
    }));
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const filteredLabs = labOrders.filter((lab) => {
    if (filter !== 'all' && lab.status !== filter) return false;
    if (searchTerm) {
      const patientName = getPatientName(lab.patientId).toLowerCase();
      const details = (lab.details || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !details.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const toggleLabSelection = (labId: string) => {
    const newSelected = new Set(selectedLabs);
    if (newSelected.has(labId)) {
      newSelected.delete(labId);
    } else {
      newSelected.add(labId);
    }
    setSelectedLabs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedLabs.size === filteredLabs.length) {
      setSelectedLabs(new Set());
    } else {
      setSelectedLabs(new Set(filteredLabs.map((l) => l.id)));
    }
  };

  // Stats
  const pendingCount = labOrders.filter((l) => l.status === 'pending').length;
  const inProgressCount = labOrders.filter((l) => l.status === 'in-progress' || l.status === 'ordered').length;
  const completedCount = labOrders.filter((l) => l.status === 'completed').length;
  const statCount = labOrders.filter((l) => l.priority === 'stat' && l.status !== 'completed').length;

  return (
    <div className="labs-page" style={{
      background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(251, 113, 133, 0.3)',
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
        <button type="button" onClick={() => setShowNewLabModal(true)} style={{
          padding: '0.75rem 1.25rem',
          background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(251, 113, 133, 0.4)',
          transition: 'all 0.3s ease',
        }}>
          <span style={{ marginRight: '0.5rem' }}>+</span>
          New Lab Order
        </button>
        <button type="button" disabled={selectedLabs.size === 0} style={{
          padding: '0.75rem 1.25rem',
          background: selectedLabs.size === 0 ? '#d1d5db' : '#ffffff',
          color: selectedLabs.size === 0 ? '#9ca3af' : '#f43f5e',
          border: '2px solid #fb7185',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: selectedLabs.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Print Requisition
        </button>
        <button type="button" disabled={selectedLabs.size === 0} style={{
          padding: '0.75rem 1.25rem',
          background: selectedLabs.size === 0 ? '#d1d5db' : '#ffffff',
          color: selectedLabs.size === 0 ? '#9ca3af' : '#f43f5e',
          border: '2px solid #fb7185',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: selectedLabs.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Send to Lab
        </button>
        <button type="button" style={{
          padding: '0.75rem 1.25rem',
          background: '#ffffff',
          color: '#f43f5e',
          border: '2px solid #fb7185',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
        }}>
          Review Results
        </button>
        <button type="button" onClick={loadData} style={{
          padding: '0.75rem 1.25rem',
          background: '#ffffff',
          color: '#f43f5e',
          border: '2px solid #fb7185',
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
          background: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Pathology & Lab Orders</h1>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <div
          onClick={() => setFilter('pending')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'pending' ? '0 8px 32px rgba(251, 113, 133, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'pending' ? '2px solid #fb7185' : '2px solid transparent',
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
          onClick={() => setFilter('in-progress')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'in-progress' ? '0 8px 32px rgba(251, 113, 133, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'in-progress' ? '2px solid #fb7185' : '2px solid transparent',
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
          onClick={() => setFilter('completed')}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: filter === 'completed' ? '0 8px 32px rgba(251, 113, 133, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            border: filter === 'completed' ? '2px solid #fb7185' : '2px solid transparent',
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
              placeholder="Search labs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Status</label>
            <select
              className="ema-filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as LabFilter)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
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

      {/* Labs Table */}
      {loading ? (
        <div style={{ padding: '1rem' }}>
          <Skeleton variant="card" height={400} />
        </div>
      ) : filteredLabs.length === 0 ? (
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧪</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Lab Orders Found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {filter !== 'all' ? 'Try adjusting your filters' : 'Create your first lab order'}
          </p>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedLabs.size === filteredLabs.length && filteredLabs.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Patient</th>
              <th>Tests</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Ordered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLabs.map((lab) => {
              const tests = (lab.details || '').split('\n').filter((t) => t && !t.startsWith('**'));
              return (
                <tr
                  key={lab.id}
                  style={{
                    background:
                      lab.priority === 'stat'
                        ? '#fef2f2'
                        : lab.status === 'completed'
                        ? '#f0fdf4'
                        : undefined,
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedLabs.has(lab.id)}
                      onChange={() => toggleLabSelection(lab.id)}
                    />
                  </td>
                  <td>
                    <a href="#" className="ema-patient-link">
                      {getPatientName(lab.patientId)}
                    </a>
                  </td>
                  <td>
                    <div style={{ maxWidth: '300px' }}>
                      {tests.slice(0, 3).map((test, i) => (
                        <div key={i} style={{ fontSize: '0.875rem' }}>
                          {test}
                        </div>
                      ))}
                      {tests.length > 3 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          +{tests.length - 3} more
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        background:
                          lab.priority === 'stat'
                            ? '#dc2626'
                            : lab.priority === 'urgent'
                            ? '#f59e0b'
                            : '#e5e7eb',
                        color: lab.priority === 'stat' || lab.priority === 'urgent' ? '#ffffff' : '#374151',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {lab.priority === 'stat' ? 'STAT' : lab.priority === 'urgent' ? 'Urgent' : 'Routine'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`ema-status ${
                        lab.status === 'completed'
                          ? 'established'
                          : lab.status === 'in-progress' || lab.status === 'ordered'
                          ? 'pending'
                          : 'pending'
                      }`}
                    >
                      {lab.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(lab.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {lab.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(lab.id, 'in-progress')}
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
                            Collected
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
                      {(lab.status === 'in-progress' || lab.status === 'ordered') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLab(lab);
                            setShowResultsModal(true);
                          }}
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
                          Results
                        </button>
                      )}
                      {lab.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLab(lab);
                            setShowResultsModal(true);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          View
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

      {/* New Lab Modal */}
      <Modal isOpen={showNewLabModal} title="New Lab Order" onClose={() => setShowNewLabModal(false)} size="lg">
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Patient *</label>
              <select
                value={newLab.patientId}
                onChange={(e) => setNewLab((prev) => ({ ...prev, patientId: e.target.value }))}
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
                value={newLab.priority}
                onChange={(e) =>
                  setNewLab((prev) => ({
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
            <label>Select Tests * ({newLab.tests.length} selected)</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '0.5rem',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            >
              {COMMON_DERM_LABS.map((test) => (
                <label
                  key={test.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    background: newLab.tests.includes(test.name) ? '#e0f2fe' : '#f9fafb',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newLab.tests.includes(test.name)}
                    onChange={() => toggleTest(test.name)}
                  />
                  <span>{test.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={newLab.fasting}
                onChange={(e) => setNewLab((prev) => ({ ...prev, fasting: e.target.checked }))}
              />
              Fasting Required
            </label>
          </div>

          <div className="form-field" style={{ marginTop: '1rem' }}>
            <label>Notes</label>
            <textarea
              value={newLab.notes}
              onChange={(e) => setNewLab((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional instructions..."
              rows={2}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowNewLabModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateLab} disabled={creating}>
            {creating ? 'Creating...' : 'Create Lab Order'}
          </button>
        </div>
      </Modal>

      {/* Results Modal */}
      <Modal
        isOpen={showResultsModal}
        title="Lab Results"
        onClose={() => {
          setShowResultsModal(false);
          setSelectedLab(null);
        }}
        size="lg"
      >
        {selectedLab && (
          <div style={{ padding: '1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#f9fafb',
                borderRadius: '4px',
              }}
            >
              <div>
                <strong>Patient:</strong> {getPatientName(selectedLab.patientId)}
              </div>
              <div>
                <strong>Ordered:</strong> {new Date(selectedLab.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="ema-section-header" style={{ marginBottom: '0.5rem' }}>
              Tests Ordered
            </div>
            <table className="ema-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Result</th>
                  <th>Reference</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {selectedLab.details?.split('\n').filter((l) => l && !l.startsWith('**')).map((line, i) => (
                  <tr key={i}>
                    <td>{line}</td>
                    <td style={{ color: '#6b7280' }}>-- pending --</td>
                    <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>--</td>
                    <td>--</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(selectedLab.status === 'in-progress' || selectedLab.status === 'ordered') && (
              <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleStatusChange(selectedLab.id, 'completed');
                    setShowResultsModal(false);
                    setSelectedLab(null);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Mark Complete
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
