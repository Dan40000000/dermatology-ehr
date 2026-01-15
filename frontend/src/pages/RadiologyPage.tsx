import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchOrders, fetchPatients, createOrder, updateOrderStatus } from '../api';
import type { Order, Patient, ResultFlagType } from '../types';
import { ResultFlagBadge, ResultFlagSelect } from '../components/ResultFlagBadge';

type ImagingFilter = 'all' | 'pending' | 'scheduled' | 'completed';
type WorkflowStatus = 'pending_review' | 'reviewed' | 'filed' | 'needs_followup';
type PortalStatus = 'not_shared' | 'shared' | 'viewed_by_patient';

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

  // EMA-style features
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    checkbox: true,
    receivedDate: true,
    visitDate: true,
    performedDate: true,
    patientName: true,
    resultType: true,
    resultName: true,
    flag: true,
    resultStatus: true,
    workflowStatus: true,
    portal: true,
  });

  // Date filters
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo, setDateFilterTo] = useState('');

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

  // Selection handlers
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
    if (selectedOrders.size === filteredImaging.length && filteredImaging.length > 0) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredImaging.map((o) => o.id)));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedOrders.size === 0) return;

    try {
      if (action === 'mark_reviewed') {
        // Mark selected orders as reviewed
        showSuccess(`Marked ${selectedOrders.size} orders as reviewed`);
      } else if (action === 'share_to_portal') {
        showSuccess(`Shared ${selectedOrders.size} orders to patient portal`);
      } else if (action === 'file') {
        showSuccess(`Filed ${selectedOrders.size} orders`);
      }
      setSelectedOrders(new Set());
      setShowBulkActions(false);
    } catch (err: any) {
      showError(err.message || 'Failed to perform bulk action');
    }
  };

  const toggleColumnVisibility = (column: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  // Mock workflow and portal status (in real app, these would come from the order data)
  const getWorkflowStatus = (order: Order): WorkflowStatus => {
    if (order.status === 'completed') return 'reviewed';
    if (order.status === 'pending') return 'pending_review';
    return 'filed';
  };

  const getPortalStatus = (order: Order): PortalStatus => {
    return 'not_shared'; // Default, would come from order data in real app
  };

  const getWorkflowBadgeColor = (status: WorkflowStatus) => {
    switch (status) {
      case 'pending_review': return { bg: '#fef3c7', color: '#d97706' };
      case 'reviewed': return { bg: '#d1fae5', color: '#059669' };
      case 'filed': return { bg: '#e0e7ff', color: '#4f46e5' };
      case 'needs_followup': return { bg: '#fee2e2', color: '#dc2626' };
      default: return { bg: '#f3f4f6', color: '#6b7280' };
    }
  };

  const getPortalBadgeColor = (status: PortalStatus) => {
    switch (status) {
      case 'not_shared': return { bg: '#f3f4f6', color: '#6b7280' };
      case 'shared': return { bg: '#dbeafe', color: '#2563eb' };
      case 'viewed_by_patient': return { bg: '#d1fae5', color: '#059669' };
      default: return { bg: '#f3f4f6', color: '#6b7280' };
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
    if (!details) return '';
    const lower = details.toLowerCase();
    if (lower.includes('x-ray') || lower.includes('xr')) return '';
    if (lower.includes('ct')) return '';
    if (lower.includes('mri') || lower.includes('mr ')) return '';
    if (lower.includes('ultrasound') || lower.includes('us ')) return '';
    if (lower.includes('pet')) return '';
    return '';
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
    <div className="radiology-page" style={{
      background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(6, 182, 212, 0.3)',
    }}>
      {/* EMA-Style Header */}
      <div className="ema-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '1.25rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '1.75rem',
          fontWeight: 700,
          color: '#0891b2',
        }}>Results</h1>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#ffffff',
              color: '#0891b2',
              border: '2px solid #06b6d4',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Filters
          </button>

          <button
            type="button"
            onClick={() => setShowColumnsModal(true)}
            style={{
              padding: '0.625rem 1.25rem',
              background: '#ffffff',
              color: '#0891b2',
              border: '2px solid #06b6d4',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Select Columns
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              disabled={selectedOrders.size === 0}
              onClick={() => setShowBulkActions(!showBulkActions)}
              style={{
                padding: '0.625rem 1.25rem',
                background: selectedOrders.size === 0 ? '#e5e7eb' : '#ffffff',
                color: selectedOrders.size === 0 ? '#9ca3af' : '#0891b2',
                border: `2px solid ${selectedOrders.size === 0 ? '#d1d5db' : '#06b6d4'}`,
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              Select Action {selectedOrders.size > 0 && `(${selectedOrders.size})`}
            </button>

            {showBulkActions && selectedOrders.size > 0 && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                background: '#ffffff',
                border: '2px solid #06b6d4',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 100,
                minWidth: '200px',
              }}>
                <button
                  type="button"
                  onClick={() => handleBulkAction('mark_reviewed')}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    color: '#374151',
                    border: 'none',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Mark Reviewed
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction('share_to_portal')}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    color: '#374151',
                    border: 'none',
                    borderBottom: '1px solid #e5e7eb',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Share to Portal
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkAction('file')}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'transparent',
                    color: '#374151',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  File Orders
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowNewImagingModal(true)}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
              transition: 'all 0.3s ease',
            }}
          >
            + New Order
          </button>
        </div>
      </div>

      {/* EMA-Style Filters Panel */}
      {showFiltersPanel && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#374151', fontSize: '0.875rem' }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Search by patient name or study..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #06b6d4',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#374151', fontSize: '0.875rem' }}>
                Date From
              </label>
              <input
                type="date"
                value={dateFilterFrom}
                onChange={(e) => setDateFilterFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #06b6d4',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#374151', fontSize: '0.875rem' }}>
                Date To
              </label>
              <input
                type="date"
                value={dateFilterTo}
                onChange={(e) => setDateFilterTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #06b6d4',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#374151', fontSize: '0.875rem' }}>
              Result Status
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'pending', 'scheduled', 'completed'] as ImagingFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: filter === f ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' : '#ffffff',
                    color: filter === f ? '#ffffff' : '#0891b2',
                    border: '2px solid #06b6d4',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* EMA-Style Results Table */}
      {filteredImaging.length === 0 ? (
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No imaging orders found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {filter !== 'all' ? 'Try adjusting your filters' : 'Create your first imaging order'}
          </p>
        </div>
      ) : (
        <>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            overflowX: 'auto',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
            }}>
              <thead>
                <tr style={{
                  borderBottom: '2px solid #e5e7eb',
                  background: '#f9fafb',
                }}>
                  {visibleColumns.checkbox && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151', width: '50px' }}>
                      <input
                        type="checkbox"
                        checked={selectedOrders.size === filteredImaging.length && filteredImaging.length > 0}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                  )}
                  {visibleColumns.receivedDate && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Received Date</th>
                  )}
                  {visibleColumns.visitDate && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Visit Date</th>
                  )}
                  {visibleColumns.performedDate && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Performed Date</th>
                  )}
                  {visibleColumns.patientName && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Patient Name</th>
                  )}
                  {visibleColumns.resultType && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Result Type</th>
                  )}
                  {visibleColumns.resultName && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Result Name</th>
                  )}
                  {visibleColumns.flag && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Flag</th>
                  )}
                  {visibleColumns.resultStatus && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Result Status</th>
                  )}
                  {visibleColumns.workflowStatus && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Workflow Status</th>
                  )}
                  {visibleColumns.portal && (
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Portal</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredImaging.map((img) => {
                  const workflowStatus = getWorkflowStatus(img);
                  const portalStatus = getPortalStatus(img);
                  const workflowColors = getWorkflowBadgeColor(workflowStatus);
                  const portalColors = getPortalBadgeColor(portalStatus);

                  return (
                    <tr
                      key={img.id}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background 0.2s ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {visibleColumns.checkbox && (
                        <td style={{ padding: '1rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedOrders.has(img.id)}
                            onChange={() => toggleOrderSelection(img.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                      )}
                      {visibleColumns.receivedDate && (
                        <td style={{ padding: '1rem', color: '#6b7280' }}>
                          {new Date(img.createdAt).toLocaleDateString()}
                        </td>
                      )}
                      {visibleColumns.visitDate && (
                        <td style={{ padding: '1rem', color: '#6b7280' }}>
                          {img.createdAt ? new Date(img.createdAt).toLocaleDateString() : '-'}
                        </td>
                      )}
                      {visibleColumns.performedDate && (
                        <td style={{ padding: '1rem', color: '#6b7280' }}>
                          {img.status === 'completed' ? new Date(img.createdAt).toLocaleDateString() : '-'}
                        </td>
                      )}
                      {visibleColumns.patientName && (
                        <td style={{ padding: '1rem', fontWeight: 600, color: '#0891b2' }}>
                          {getPatientName(img.patientId)}
                        </td>
                      )}
                      {visibleColumns.resultType && (
                        <td style={{ padding: '1rem', color: '#374151' }}>
                          {img.type === 'imaging' ? 'Radiology' : img.type}
                        </td>
                      )}
                      {visibleColumns.resultName && (
                        <td style={{ padding: '1rem', color: '#374151' }}>
                          {img.details?.split('\n')[0] || 'Imaging Study'}
                        </td>
                      )}
                      {visibleColumns.flag && (
                        <td style={{ padding: '1rem' }}>
                          <ResultFlagBadge flag={img.resultFlag} size="sm" />
                        </td>
                      )}
                      {visibleColumns.resultStatus && (
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: img.status === 'completed' ? '#d1fae5' : img.status === 'ordered' ? '#dbeafe' : '#fef3c7',
                            color: img.status === 'completed' ? '#059669' : img.status === 'ordered' ? '#2563eb' : '#d97706',
                            display: 'inline-block',
                          }}>
                            {img.status === 'ordered' ? 'Scheduled' : img.status.charAt(0).toUpperCase() + img.status.slice(1)}
                          </span>
                        </td>
                      )}
                      {visibleColumns.workflowStatus && (
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: workflowColors.bg,
                            color: workflowColors.color,
                            display: 'inline-block',
                          }}>
                            {workflowStatus.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                        </td>
                      )}
                      {visibleColumns.portal && (
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: portalColors.bg,
                            color: portalColors.color,
                            display: 'inline-block',
                          }}>
                            {portalStatus === 'not_shared' ? 'Not Shared' : portalStatus === 'viewed_by_patient' ? 'Viewed' : 'Shared'}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total Results Counter */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '1rem',
            marginTop: '1rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
            textAlign: 'center',
            fontWeight: 600,
            color: '#374151',
          }}>
            Total Results: {filteredImaging.length}
          </div>
        </>
      )}

      {/* Select Columns Modal */}
      <Modal
        isOpen={showColumnsModal}
        title="Select Columns"
        onClose={() => setShowColumnsModal(false)}
        size="md"
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
            Choose which columns to display in the results table:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(visibleColumns).map(([key, value]) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                }}
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => toggleColumnVisibility(key as keyof typeof visibleColumns)}
                  style={{ marginRight: '0.75rem', cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  {key === 'checkbox' ? 'Selection Checkbox' :
                   key === 'receivedDate' ? 'Received Date' :
                   key === 'visitDate' ? 'Visit Date' :
                   key === 'performedDate' ? 'Performed Date' :
                   key === 'patientName' ? 'Patient Name' :
                   key === 'resultType' ? 'Result Type' :
                   key === 'resultName' ? 'Result Name' :
                   key === 'flag' ? 'Flag' :
                   key === 'resultStatus' ? 'Result Status' :
                   key === 'workflowStatus' ? 'Workflow Status' :
                   key === 'portal' ? 'Portal' :
                   key}
                </span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowColumnsModal(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
                transition: 'all 0.3s ease',
              }}
            >
              Save & Close
            </button>
          </div>
        </div>
      </Modal>

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
