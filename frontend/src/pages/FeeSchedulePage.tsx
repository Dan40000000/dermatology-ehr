import { useEffect, useRef, useState } from 'react';
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
  minPrice: string;
  maxPrice: string;
  category: string;
  subcategory: string;
  codeType: 'CPT' | 'HCPCS' | 'INTERNAL';
  billingRoute: 'insurance' | 'self_pay' | 'non_billable';
  isCosmetic: boolean;
  requiresDiagnosis: boolean;
  units: string;
  notes: string;
}

const emptyEditFeeForm = (): EditFeeFormData => ({
  cptCode: '',
  cptDescription: '',
  fee: '',
  minPrice: '',
  maxPrice: '',
  category: '',
  subcategory: '',
  codeType: 'CPT',
  billingRoute: 'insurance',
  isCosmetic: false,
  requiresDiagnosis: true,
  units: '',
  notes: '',
});

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

  const [editFeeForm, setEditFeeForm] = useState<EditFeeFormData>(emptyEditFeeForm());

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [scheduleToDelete, setScheduleToDelete] = useState<FeeSchedule | null>(null);
  const showErrorRef = useRef(showError);

  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  // Check if user has permission
  const hasPermission = hasAnyRole(session?.user, ['admin', 'billing', 'front_desk']);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      setSchedules([]);
      setSelectedSchedule(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const data = await fetchFeeSchedules(session.tenantId, session.accessToken);
        if (cancelled) return;

        const nextSchedules = Array.isArray(data) ? data : [];
        setSchedules(nextSchedules);

        setSelectedSchedule((current) => {
          if (nextSchedules.length === 0) return null;
          if (current) {
            const matchingSchedule = nextSchedules.find((schedule) => schedule.id === current.id);
            if (matchingSchedule) return matchingSchedule;
          }
          return nextSchedules.find((schedule) => schedule.isDefault) || nextSchedules[0];
        });
      } catch (err: any) {
        if (!cancelled) {
          showErrorRef.current(err.message || 'Failed to load fee schedules');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [session?.tenantId, session?.accessToken]);

  useEffect(() => {
    if (!session || !selectedSchedule?.id) {
      setScheduleItems([]);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setItemsLoading(true);
      try {
        const data = await fetchFeeSchedule(session.tenantId, session.accessToken, selectedSchedule.id);
        if (!cancelled) {
          setScheduleItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          showErrorRef.current(err.message || 'Failed to load fee schedule items');
        }
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [session?.tenantId, session?.accessToken, selectedSchedule?.id]);

  const refreshSchedules = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const data = await fetchFeeSchedules(session.tenantId, session.accessToken);
      const nextSchedules = Array.isArray(data) ? data : [];
      setSchedules(nextSchedules);

      setSelectedSchedule((current) => {
        if (nextSchedules.length === 0) return null;
        if (current) {
          const matchingSchedule = nextSchedules.find((schedule) => schedule.id === current.id);
          if (matchingSchedule) return matchingSchedule;
        }
        return nextSchedules.find((schedule) => schedule.isDefault) || nextSchedules[0];
      });
    } catch (err: any) {
      showError(err.message || 'Failed to load fee schedules');
    } finally {
      setLoading(false);
    }
  };

  const refreshScheduleItems = async () => {
    if (!session || !selectedSchedule) return;

    setItemsLoading(true);
    try {
      const data = await fetchFeeSchedule(session.tenantId, session.accessToken, selectedSchedule.id);
      setScheduleItems(Array.isArray(data.items) ? data.items : []);
    } catch (err: any) {
      showError(err.message || 'Failed to load fee schedule items');
    } finally {
      setItemsLoading(false);
    }
  };

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
      refreshSchedules();
    } catch (err: any) {
      showError(err.message || 'Failed to create fee schedule');
    }
  };

  const handleUpdateSchedule = async (schedule: FeeSchedule, updates: any) => {
    if (!session) return;

    try {
      await updateFeeSchedule(session.tenantId, session.accessToken, schedule.id, updates);
      showSuccess('Fee schedule updated');
      refreshSchedules();
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

      refreshSchedules();
    } catch (err: any) {
      showError(err.message || 'Failed to delete fee schedule');
    }
  };

  const handleSaveFee = async () => {
    if (!session || !selectedSchedule || !editFeeForm.cptCode.trim() || !editFeeForm.fee) {
      showError('Code and fee are required');
      return;
    }

    const fee = parseFloat(editFeeForm.fee);
    if (isNaN(fee) || fee < 0) {
      showError('Invalid fee amount');
      return;
    }
    const toOptionalCents = (value: string) => {
      if (!value.trim()) return null;
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
    };
    const minPriceCents = toOptionalCents(editFeeForm.minPrice);
    const maxPriceCents = toOptionalCents(editFeeForm.maxPrice);

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
          category: editFeeForm.category.trim() || undefined,
          subcategory: editFeeForm.subcategory.trim() || undefined,
          codeType: editFeeForm.codeType,
          billingRoute: editFeeForm.billingRoute,
          isCosmetic: editFeeForm.isCosmetic,
          requiresDiagnosis: editFeeForm.requiresDiagnosis,
          units: editFeeForm.units.trim() || undefined,
          minPriceCents,
          maxPriceCents,
          notes: editFeeForm.notes.trim() || undefined,
        }
      );

      showSuccess('Fee updated successfully');
      setShowEditFeeModal(false);
      setEditFeeForm(emptyEditFeeForm());
      refreshScheduleItems();
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
      refreshScheduleItems();
    } catch (err: any) {
      showError(err.message || 'Failed to delete fee');
    }
  };

  const parseCsvLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const normalizeImportRow = (headers: string[], values: string[]) => {
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header.toLowerCase().trim()] = values[index] || '';
      return acc;
    }, {});
    const cptCode = row.code || row['cpt code'] || values[0] || '';
    const description = row.description || values[1] || '';
    const fee = row.fee || values[2] || '';
    if (!cptCode || !fee) return null;
    return {
      cptCode,
      description: description || undefined,
      fee: parseFloat(fee),
      codeType: row['code type'] || undefined,
      billingRoute: row['billing route'] || undefined,
      category: row.category || undefined,
      subcategory: row.subcategory || undefined,
      minPriceCents: row['min price'] ? Math.round(parseFloat(row['min price']) * 100) : undefined,
      maxPriceCents: row['max price'] ? Math.round(parseFloat(row['max price']) * 100) : undefined,
      units: row.units || undefined,
      isCosmetic: row.cosmetic ? row.cosmetic.toLowerCase() === 'true' : undefined,
      requiresDiagnosis: row['requires diagnosis'] ? row['requires diagnosis'].toLowerCase() === 'true' : undefined,
      notes: row.notes || undefined,
    };
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
      const headers = parseCsvLine(lines[0] || '');

      // Skip header row
      for (let i = 1; i < Math.min(lines.length, 11); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const item = normalizeImportRow(headers, parseCsvLine(line));

        if (item?.cptCode && Number.isFinite(item.fee)) {
          preview.push(item);
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
        const headers = parseCsvLine(lines[0] || '');

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const item = normalizeImportRow(headers, parseCsvLine(line));
          if (item?.cptCode && Number.isFinite(item.fee)) {
            items.push(item);
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
        refreshScheduleItems();
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
    const safeCents = Number.isFinite(cents) ? cents : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(safeCents / 100);
  };

  // Get unique categories from schedule items
  const categories = Array.from(new Set(scheduleItems.map(item => item.category).filter(Boolean))).sort();

  const filteredItems = scheduleItems.filter((item) => {
    const itemCode = String(item.cptCode || '').toLowerCase();
    const itemDescription = String(item.cptDescription || '').toLowerCase();
    const itemCategory = String(item.category || '').toLowerCase();

    // Apply category filter
    if (categoryFilter && item.category !== categoryFilter) return false;

    // Apply search query
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      itemCode.includes(q) ||
      itemDescription.includes(q) ||
      itemCategory.includes(q)
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
                      setEditFeeForm(emptyEditFeeForm());
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
                        <th>Code</th>
                        <th>Route</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Fee</th>
                        <th>Range / Unit</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                            <p className="muted">
                              {searchQuery || categoryFilter ? 'No matching CPT codes found' : 'No fees defined yet'}
                            </p>
                            <button
                              type="button"
                              className="btn-sm btn-primary"
                              style={{ marginTop: '12px' }}
                              onClick={() => {
                                setEditFeeForm(emptyEditFeeForm());
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
                            <td className="strong">{item.cptCode || '-'}</td>
                            <td>
                              <span className={`pill tiny ${item.billingRoute === 'self_pay' ? 'warning' : item.billingRoute === 'non_billable' ? 'muted' : 'info'}`}>
                                {item.billingRoute === 'self_pay' ? 'Self-pay' : item.billingRoute === 'non_billable' ? 'No bill' : 'Insurance'}
                              </span>
                            </td>
                            <td>
                              <span className="pill info tiny">{item.category || 'Uncategorized'}</span>
                            </td>
                            <td className="muted">{item.cptDescription || '-'}</td>
                            <td>{formatCurrency(Number(item.feeCents || 0))}</td>
                            <td className="muted tiny">
                              {item.minPriceCents || item.maxPriceCents
                                ? `${item.minPriceCents ? formatCurrency(Number(item.minPriceCents)) : ''}${item.maxPriceCents ? ` - ${formatCurrency(Number(item.maxPriceCents))}` : ''}`
                                : '-'}
                              {item.units ? ` / ${item.units}` : ''}
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="btn-sm btn-secondary"
                                  onClick={() => {
                                    const itemFeeCents = Number(item.feeCents || 0);
                                    const minPriceCents = Number(item.minPriceCents || 0);
                                    const maxPriceCents = Number(item.maxPriceCents || 0);
                                    setEditFeeForm({
                                      cptCode: item.cptCode || '',
                                      cptDescription: item.cptDescription || '',
                                      fee: ((Number.isFinite(itemFeeCents) ? itemFeeCents : 0) / 100).toFixed(2),
                                      minPrice: minPriceCents ? (minPriceCents / 100).toFixed(2) : '',
                                      maxPrice: maxPriceCents ? (maxPriceCents / 100).toFixed(2) : '',
                                      category: item.category || '',
                                      subcategory: item.subcategory || '',
                                      codeType: item.codeType || 'CPT',
                                      billingRoute: item.billingRoute || 'insurance',
                                      isCosmetic: Boolean(item.isCosmetic),
                                      requiresDiagnosis: item.requiresDiagnosis !== false,
                                      units: item.units || '',
                                      notes: item.notes || '',
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
          setEditFeeForm(emptyEditFeeForm());
        }}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Code *</label>
            <input
              type="text"
              value={editFeeForm.cptCode}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, cptCode: e.target.value })}
              placeholder="e.g., 99213 or COS-BOTOX"
            />
          </div>

          <div className="form-field">
            <label>Billing Route</label>
            <select
              value={editFeeForm.billingRoute}
              onChange={(e) => {
                const billingRoute = e.target.value as EditFeeFormData['billingRoute'];
                setEditFeeForm({
                  ...editFeeForm,
                  billingRoute,
                  codeType: billingRoute === 'self_pay' ? 'INTERNAL' : editFeeForm.codeType,
                  requiresDiagnosis: billingRoute === 'insurance',
                });
              }}
            >
              <option value="insurance">Insurance</option>
              <option value="self_pay">Self-pay / patient responsible</option>
              <option value="non_billable">Non-billable</option>
            </select>
          </div>

          <div className="form-field">
            <label>Code Type</label>
            <select
              value={editFeeForm.codeType}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, codeType: e.target.value as EditFeeFormData['codeType'] })}
            >
              <option value="CPT">CPT</option>
              <option value="HCPCS">HCPCS</option>
              <option value="INTERNAL">Internal practice code</option>
            </select>
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
            <label>Category</label>
            <input
              type="text"
              value={editFeeForm.category}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, category: e.target.value })}
              placeholder="e.g., Neurotoxins, Self-Pay Biopsies"
            />
          </div>

          <div className="form-field">
            <label>Subcategory</label>
            <input
              type="text"
              value={editFeeForm.subcategory}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, subcategory: e.target.value })}
              placeholder="Optional"
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

          <div className="form-field">
            <label>Min Price (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editFeeForm.minPrice}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, minPrice: e.target.value })}
              placeholder="Optional range min"
            />
          </div>

          <div className="form-field">
            <label>Max Price (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={editFeeForm.maxPrice}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, maxPrice: e.target.value })}
              placeholder="Optional range max"
            />
          </div>

          <div className="form-field">
            <label>Units</label>
            <input
              type="text"
              value={editFeeForm.units}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, units: e.target.value })}
              placeholder="service, unit, syringe, add-on"
            />
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editFeeForm.isCosmetic}
                onChange={(e) => setEditFeeForm({ ...editFeeForm, isCosmetic: e.target.checked })}
              />
              <span>Cosmetic/self-pay catalog item</span>
            </label>
          </div>

          <div className="form-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={editFeeForm.requiresDiagnosis}
                onChange={(e) => setEditFeeForm({ ...editFeeForm, requiresDiagnosis: e.target.checked })}
              />
              <span>Requires diagnosis link before claim release</span>
            </label>
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea
              value={editFeeForm.notes}
              onChange={(e) => setEditFeeForm({ ...editFeeForm, notes: e.target.value })}
              placeholder="Optional billing/pricing notes"
              rows={3}
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
