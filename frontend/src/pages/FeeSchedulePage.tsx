import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { hasAnyRole } from '../utils/roles';
import {
  fetchFeeSchedules,
  fetchFeeSchedule,
  createFeeSchedule,
  updateFeeSchedule,
  deleteFeeSchedule,
  updateFeeScheduleItem,
  deleteFeeScheduleItem,
  importFeeScheduleItems,
  exportFeeSchedule,
} from '../api';
import type { FeeSchedule, FeeScheduleItem } from '../types';

interface CreateScheduleFormData {
  name: string;
  isDefault: boolean;
  description: string;
  cloneFromId: string;
}

interface EditFeeFormData {
  cptCode: string;
  cptDescription: string;
  fee: string;
}

export function FeeSchedulePage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<FeeSchedule | null>(null);
  const [scheduleItems, setScheduleItems] = useState<FeeScheduleItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditFeeModal, setShowEditFeeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState<CreateScheduleFormData>({
    name: '',
    isDefault: false,
    description: '',
    cloneFromId: '',
  });

  const [editFeeForm, setEditFeeForm] = useState<EditFeeFormData>({
    cptCode: '',
    cptDescription: '',
    fee: '',
  });

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [scheduleToDelete, setScheduleToDelete] = useState<FeeSchedule | null>(null);

  // Check if user has permission
  const hasPermission = hasAnyRole(session?.user, ['admin', 'billing', 'front_desk']);

  const loadSchedules = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const data = await fetchFeeSchedules(session.tenantId, session.accessToken);
      setSchedules(data || []);

      // Auto-select the first schedule or default
      if (data && data.length > 0 && !selectedSchedule) {
        const defaultSchedule = data.find((s: FeeSchedule) => s.isDefault) || data[0];
        setSelectedSchedule(defaultSchedule);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load fee schedules');
    } finally {
      setLoading(false);
    }
  }, [session, showError, selectedSchedule]);

  const loadScheduleItems = useCallback(async () => {
    if (!session || !selectedSchedule) return;

    setItemsLoading(true);
    try {
      const data = await fetchFeeSchedule(session.tenantId, session.accessToken, selectedSchedule.id);
      setScheduleItems(data.items || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load fee schedule items');
    } finally {
      setItemsLoading(false);
    }
  }, [session, selectedSchedule, showError]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    if (selectedSchedule) {
      loadScheduleItems();
    }
  }, [loadScheduleItems, selectedSchedule]);

  const handleCreateSchedule = async () => {
    if (!session || !createForm.name.trim()) {
      showError('Schedule name is required');
      return;
    }

    try {
      const data = {
        name: createForm.name.trim(),
        isDefault: createForm.isDefault,
        description: createForm.description.trim() || undefined,
        cloneFromId: createForm.cloneFromId || undefined,
      };

      await createFeeSchedule(session.tenantId, session.accessToken, data);
      showSuccess('Fee schedule created successfully');
      setShowCreateModal(false);
      setCreateForm({ name: '', isDefault: false, description: '', cloneFromId: '' });
      loadSchedules();
    } catch (err: any) {
      showError(err.message || 'Failed to create fee schedule');
    }
  };

  const handleUpdateSchedule = async (schedule: FeeSchedule, updates: any) => {
    if (!session) return;

    try {
      await updateFeeSchedule(session.tenantId, session.accessToken, schedule.id, updates);
      showSuccess('Fee schedule updated');
      loadSchedules();
      if (selectedSchedule?.id === schedule.id) {
        setSelectedSchedule({ ...schedule, ...updates });
      }
    } catch (err: any) {
      showError(err.message || 'Failed to update fee schedule');
    }
  };

  const handleDeleteSchedule = async () => {
    if (!session || !scheduleToDelete) return;

    try {
      await deleteFeeSchedule(session.tenantId, session.accessToken, scheduleToDelete.id);
      showSuccess('Fee schedule deleted');
      setShowDeleteConfirm(false);
      setScheduleToDelete(null);

      if (selectedSchedule?.id === scheduleToDelete.id) {
        setSelectedSchedule(null);
        setScheduleItems([]);
      }

      loadSchedules();
    } catch (err: any) {
      showError(err.message || 'Failed to delete fee schedule');
    }
  };

  const handleSaveFee = async () => {
    if (!session || !selectedSchedule || !editFeeForm.cptCode.trim() || !editFeeForm.fee) {
      showError('CPT code and fee are required');
      return;
    }

    const fee = parseFloat(editFeeForm.fee);
    if (isNaN(fee) || fee < 0) {
      showError('Invalid fee amount');
      return;
    }

    try {
      const feeCents = Math.round(fee * 100);
      await updateFeeScheduleItem(
        session.tenantId,
        session.accessToken,
        selectedSchedule.id,
        editFeeForm.cptCode.trim(),
        {
          feeCents,
          cptDescription: editFeeForm.cptDescription.trim() || undefined,
        }
      );

      showSuccess('Fee updated successfully');
      setShowEditFeeModal(false);
      setEditFeeForm({ cptCode: '', cptDescription: '', fee: '' });
      loadScheduleItems();
    } catch (err: any) {
      showError(err.message || 'Failed to update fee');
    }
  };

  const handleDeleteItem = async (cptCode: string) => {
    if (!session || !selectedSchedule) return;

    if (!confirm(`Delete fee for CPT code ${cptCode}?`)) return;

    try {
      await deleteFeeScheduleItem(session.tenantId, session.accessToken, selectedSchedule.id, cptCode);
      showSuccess('Fee deleted');
      loadScheduleItems();
    } catch (err: any) {
      showError(err.message || 'Failed to delete fee');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    // Parse CSV for preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const preview: any[] = [];

      // Skip header row
      for (let i = 1; i < Math.min(lines.length, 11); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [cptCode, description, fee] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));

        if (cptCode && fee) {
          preview.push({
            cptCode,
            description: description || '',
            fee: parseFloat(fee),
          });
        }
      }

      setImportPreview(preview);
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!session || !selectedSchedule || !importFile) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const items: any[] = [];

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const [cptCode, description, fee] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));

          if (cptCode && fee) {
            items.push({
              cptCode,
              description: description || undefined,
              fee: parseFloat(fee),
            });
          }
        }

        if (items.length === 0) {
          showError('No valid items found in CSV');
          return;
        }

        const result = await importFeeScheduleItems(
          session.tenantId,
          session.accessToken,
          selectedSchedule.id,
          items
        );

        showSuccess(`Imported ${result.imported} of ${result.total} items`);
        setShowImportModal(false);
        setImportFile(null);
        setImportPreview([]);
        loadScheduleItems();
      };

      reader.readAsText(importFile);
    } catch (err: any) {
      showError(err.message || 'Failed to import fees');
    }
  };

  const handleExport = async () => {
    if (!session || !selectedSchedule) return;

    try {
      const blob = await exportFeeSchedule(session.tenantId, session.accessToken, selectedSchedule.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSchedule.name.replace(/[^a-zA-Z0-9]/g, '_')}_fees.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showSuccess('Fee schedule exported');
    } catch (err: any) {
      showError(err.message || 'Failed to export fee schedule');
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  // Get unique categories from schedule items
  const categories = Array.from(new Set(scheduleItems.map(item => item.category).filter(Boolean))).sort();

  const filteredItems = scheduleItems.filter((item) => {
    // Apply category filter
    if (categoryFilter && item.category !== categoryFilter) return false;

    // Apply search query
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.cptCode.toLowerCase().includes(q) ||
      (item.cptDescription && item.cptDescription.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  if (!hasPermission) {
    return (
      <div className="fee-schedule-page">
        <div className="page-header">
          <h1>Fee Schedules</h1>
        </div>
        <Panel title="">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p className="muted">You do not have permission to access fee schedules.</p>
            <p className="muted tiny">Contact your administrator for access.</p>
          </div>
        </Panel>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fee-schedule-page">
        <div className="page-header">
          <h1>Fee Schedules</h1>
        </div>
        <div className="fee-schedule-layout">
          <Skeleton variant="card" height={400} />
          <Skeleton variant="card" height={600} />
        </div>
      </div>
    );
  }

  return (
    <div className="fee-schedule-page">
      <div className="page-header">
        <h1>Fee Schedules</h1>
      </div>

      <div className="fee-schedule-layout">
        {/* Left Sidebar - Schedule List */}
        <div className="fee-schedule-sidebar">
          <Panel title="Fee Schedules">
            <div className="fee-schedule-list">
              {schedules.length === 0 ? (
                <p className="muted tiny">No fee schedules found</p>
              ) : (
                schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`fee-schedule-item ${selectedSchedule?.id === schedule.id ? 'active' : ''}`}
                    onClick={() => setSelectedSchedule(schedule)}
                  >
                    <div className="schedule-info">
                      <div className="schedule-name">{schedule.name}</div>
                      {schedule.isDefault && <span className="pill success tiny">Default</span>}
                    </div>
                    <div className="schedule-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSchedule(schedule, { isDefault: !schedule.isDefault });
                        }}
                        title={schedule.isDefault ? 'Unset as default' : 'Set as default'}
                      >
                        {schedule.isDefault ? '' : ''}
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setScheduleToDelete(schedule);
                          setShowDeleteConfirm(true);
                        }}
                        title="Delete"
                        disabled={schedule.isDefault}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={() => setShowCreateModal(true)}
            >
              + Create Fee Schedule
            </button>
          </Panel>
        </div>

        {/* Right Panel - Fee Schedule Editor */}
        <div className="fee-schedule-editor">
          {!selectedSchedule ? (
            <Panel title="">
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p className="muted">Select a fee schedule to view and edit fees</p>
              </div>
            </Panel>
          ) : (
            <Panel title={selectedSchedule.name}>
              <div className="fee-schedule-toolbar">
                <div className="toolbar-left">
                  <input
                    type="text"
                    placeholder="Search CPT codes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="category-filter"
                    style={{ marginLeft: '8px', minWidth: '200px' }}
                  >
                    <option value="">All Categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="toolbar-right">
                  <button type="button" className="btn-secondary" onClick={() => setShowImportModal(true)}>
                    Import CSV
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleExport}>
                    Export CSV
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setEditFeeForm({ cptCode: '', cptDescription: '', fee: '' });
                      setShowEditFeeModal(true);
                    }}
                  >
                    + Add Fee
                  </button>
                </div>
              </div>

              {itemsLoading ? (
                <Skeleton variant="rectangular" height={400} />
              ) : (
                <div className="fee-schedule-table">
                  <table>
                    <thead>
                      <tr>
                        <th>CPT Code</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Fee</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                            <p className="muted">
                              {searchQuery || categoryFilter ? 'No matching CPT codes found' : 'No fees defined yet'}
                            </p>
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              style={{ marginTop: '12px' }}
                              onClick={() => {
                                setEditFeeForm({ cptCode: '', cptDescription: '', fee: '' });
                                setShowEditFeeModal(true);
                              }}
                            >
                              Add First Fee
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => (
                          <tr key={item.id}>
                            <td className="strong">{item.cptCode}</td>
                            <td>
                              <span className="pill info tiny">{item.category || 'Uncategorized'}</span>
                            </td>
                            <td className="muted">{item.cptDescription || '-'}</td>
                            <td>{formatCurrency(item.feeCents)}</td>
                            <td>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-sm btn-secondary"
                                  onClick={() => {
                                    setEditFeeForm({
                                      cptCode: item.cptCode,
                                      cptDescription: item.cptDescription || '',
                                      fee: (item.feeCents / 100).toFixed(2),
                                    });
                                    setShowEditFeeModal(true);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm btn-danger"
                                  onClick={() => handleDeleteItem(item.cptCode)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* Create Fee Schedule Modal */}
      <Modal
        isOpen={showCreateModal}
        title="Create Fee Schedule"
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm({ name: '', isDefault: false, description: '', cloneFromId: '' });
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Name *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g., Commercial Insurance, Medicare, Cash Pay"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Optional description"
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>Clone from existing schedule</label>
            <select
              value={createForm.cloneFromId}
              onChange={(e) => setCreateForm({ ...createForm, cloneFromId: e.target.value })}
            >
              <option value="">Start with empty schedule</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={createForm.isDefault}
                onChange={(e) => setCreateForm({ ...createForm, isDefault: e.target.checked })}
              />
              <span>Set as default fee schedule</span>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateSchedule}>
            Create Schedule
          </button>
        </div>
      </Modal>

      {/* Edit Fee Modal */}
      <Modal
        isOpen={showEditFeeModal}
        title={editFeeForm.cptCode ? 'Edit Fee' : 'Add Fee'}
        onClose={() => {
          setShowEditFeeModal(false);
          setEditFeeForm({ cptCode: '', cptDescription: '', fee: '' });
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>CPT Code *</label>
            <input
              type="text"
              value={editFeeForm.cptCode}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, cptCode: e.target.value })}
              placeholder="e.g., 99213"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <input
              type="text"
              value={editFeeForm.cptDescription}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, cptDescription: e.target.value })}
              placeholder="e.g., Office visit, established patient"
            />
          </div>

          <div className="form-field">
            <label>Fee (USD) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editFeeForm.fee}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, fee: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowEditFeeModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSaveFee}>
            Save Fee
          </button>
        </div>
      </Modal>

      {/* Import CSV Modal */}
      <Modal
        isOpen={showImportModal}
        title="Import Fees from CSV"
        onClose={() => {
          setShowImportModal(false);
          setImportFile(null);
          setImportPreview([]);
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>CSV File</label>
            <p className="muted tiny" style={{ marginBottom: '8px' }}>
              Format: CPT Code, Description, Fee (header row required)
            </p>
            <input type="file" accept=".csv" onChange={handleFileSelect} />
          </div>

          {importPreview.length > 0 && (
            <div className="import-preview">
              <h4>Preview (first 10 rows):</h4>
              <table>
                <thead>
                  <tr>
                    <th>CPT Code</th>
                    <th>Description</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((item, i) => (
                    <tr key={i}>
                      <td>{item.cptCode}</td>
                      <td className="muted tiny">{item.description || '-'}</td>
                      <td>{formatCurrency(Math.round(item.fee * 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleImport} disabled={!importFile}>
            Import
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        title="Delete Fee Schedule"
        onClose={() => {
          setShowDeleteConfirm(false);
          setScheduleToDelete(null);
        }}
      >
        <div className="modal-form">
          <p>
            Are you sure you want to delete the fee schedule <strong>{scheduleToDelete?.name}</strong>?
          </p>
          <p className="muted tiny">This action cannot be undone. All fees in this schedule will be deleted.</p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={handleDeleteSchedule}>
            Delete Schedule
          </button>
        </div>
      </Modal>
    </div>
  );
}
