import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Modal, Skeleton } from '../components/ui';
import { API_BASE_URL } from '../utils/apiBase';

type InstructionType =
  | 'all'
  | 'general'
  | 'aftercare'
  | 'lab_results'
  | 'prescription_instructions'
  | 'rash_care'
  | 'cleansing';

interface Handout {
  id: string;
  title: string;
  category: string;
  condition: string;
  content: string;
  instruction_type: Exclude<InstructionType, 'all'>;
  template_key?: string | null;
  print_disclaimer?: string | null;
  is_system_template: boolean;
  is_active: boolean;
  created_at: string;
}

interface HandoutFormState {
  title: string;
  category: string;
  condition: string;
  content: string;
  instructionType: Exclude<InstructionType, 'all'>;
  printDisclaimer: string;
  isActive: boolean;
}

interface PersonalizationState {
  patientName: string;
  patientDob: string;
  providerName: string;
  medicationName: string;
  dosageInstructions: string;
  labSummary: string;
  followUpDate: string;
}

const CATEGORIES = [
  'Skin Conditions',
  'Procedures',
  'Medications',
  'Post-Procedure Care',
  'Lab Results',
  'Pathology Reports',
  'Prevention',
  'General Information',
];

const INSTRUCTION_TYPE_LABELS: Record<InstructionType, string> = {
  all: 'All Templates',
  general: 'General',
  aftercare: 'Aftercare',
  lab_results: 'Lab Results',
  prescription_instructions: 'Prescription Instructions',
  rash_care: 'Rash Care',
  cleansing: 'Cleansing',
};

const PLACEHOLDER_GUIDE = [
  '{{patient_name}}',
  '{{patient_dob}}',
  '{{provider_name}}',
  '{{today_date}}',
  '{{medication_name}}',
  '{{dosage_instructions}}',
  '{{lab_summary}}',
  '{{follow_up_date}}',
];

const defaultFormState: HandoutFormState = {
  title: '',
  category: 'Skin Conditions',
  condition: '',
  content: '',
  instructionType: 'general',
  printDisclaimer:
    'For educational use only. Follow your provider instructions and call with concerns.',
  isActive: true,
};

function formatInstructionType(value: Exclude<InstructionType, 'all'>): string {
  return INSTRUCTION_TYPE_LABELS[value] || 'General';
}

function getTodayDateLabel(): string {
  return new Date().toLocaleDateString();
}

function renderTemplateContent(template: string, values: PersonalizationState): string {
  const replacements: Record<string, string> = {
    '{{patient_name}}': values.patientName || '________________',
    '{{patient_dob}}': values.patientDob || '________________',
    '{{provider_name}}': values.providerName || '________________',
    '{{today_date}}': getTodayDateLabel(),
    '{{medication_name}}': values.medicationName || '________________',
    '{{dosage_instructions}}': values.dosageInstructions || '________________',
    '{{lab_summary}}': values.labSummary || '________________',
    '{{follow_up_date}}': values.followUpDate || '________________',
  };

  return Object.entries(replacements).reduce(
    (acc, [token, value]) => acc.replaceAll(token, value),
    template,
  );
}

function toPrintableHtml(title: string, condition: string, body: string, disclaimer?: string | null): string {
  const escapedBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        padding: 24px;
        color: #111827;
        line-height: 1.5;
      }
      h1 {
        margin: 0 0 8px 0;
        font-size: 24px;
      }
      .condition {
        margin-bottom: 16px;
        color: #4b5563;
        font-size: 14px;
      }
      .content {
        white-space: normal;
        font-size: 14px;
      }
      .disclaimer {
        margin-top: 24px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div class="condition">${condition}</div>
    <div class="content">${escapedBody}</div>
    ${disclaimer ? `<div class="disclaimer">${disclaimer}</div>` : ''}
  </body>
</html>
`;
}

export function HandoutsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryInstructionType = searchParams.get('instructionType') as InstructionType | null;

  const [loading, setLoading] = useState(true);
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [instructionTypeFilter, setInstructionTypeFilter] = useState<InstructionType>(
    queryInstructionType && INSTRUCTION_TYPE_LABELS[queryInstructionType]
      ? queryInstructionType
      : 'all',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHandout, setSelectedHandout] = useState<Handout | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [createForm, setCreateForm] = useState<HandoutFormState>(defaultFormState);
  const [editForm, setEditForm] = useState<HandoutFormState>(defaultFormState);
  const [personalization, setPersonalization] = useState<PersonalizationState>({
    patientName: '',
    patientDob: '',
    providerName: '',
    medicationName: '',
    dosageInstructions: '',
    labSummary: '',
    followUpDate: '',
  });

  useEffect(() => {
    if (queryInstructionType && INSTRUCTION_TYPE_LABELS[queryInstructionType]) {
      setInstructionTypeFilter(queryInstructionType);
    }
  }, [queryInstructionType]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (searchTerm) params.append('search', searchTerm);
      if (instructionTypeFilter !== 'all') params.append('instructionType', instructionTypeFilter);
      params.append('isActive', 'true');

      const response = await fetch(`${API_BASE_URL}/api/handouts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to load handout templates');
      const data = await response.json();
      setHandouts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showError(err.message || 'Failed to load handout templates');
    } finally {
      setLoading(false);
    }
  }, [session, categoryFilter, searchTerm, instructionTypeFilter, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetCreateForm = () => {
    setCreateForm(defaultFormState);
  };

  const openPreview = (handout: Handout) => {
    setSelectedHandout(handout);
    setPersonalization({
      patientName: '',
      patientDob: '',
      providerName: session?.user?.fullName || '',
      medicationName: '',
      dosageInstructions: '',
      labSummary: '',
      followUpDate: '',
    });
    setShowPreviewModal(true);
  };

  const handleCreate = async () => {
    if (!session) return;
    if (!createForm.title || !createForm.condition || !createForm.content) {
      showError('Title, condition, and content are required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify(createForm),
      });

      if (!response.ok) throw new Error('Failed to create handout template');

      showSuccess('Template created');
      setShowCreateModal(false);
      resetCreateForm();
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create handout template');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (handout: Handout) => {
    setSelectedHandout(handout);
    setEditForm({
      title: handout.title,
      category: handout.category,
      condition: handout.condition,
      content: handout.content,
      instructionType: handout.instruction_type,
      printDisclaimer:
        handout.print_disclaimer ||
        'For educational use only. Follow your provider instructions and call with concerns.',
      isActive: handout.is_active,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!session || !selectedHandout) return;
    if (!editForm.title || !editForm.condition || !editForm.content) {
      showError('Title, condition, and content are required');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts/${selectedHandout.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) throw new Error('Failed to update handout template');

      showSuccess('Template updated');
      setShowEditModal(false);
      setSelectedHandout(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update handout template');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to delete template');

      showSuccess('Template deleted');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete template');
    }
  };

  const renderedContent = useMemo(() => {
    if (!selectedHandout) return '';
    return renderTemplateContent(selectedHandout.content, personalization);
  }, [selectedHandout, personalization]);

  const handlePrint = () => {
    if (!selectedHandout) return;

    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      showError('Unable to open print preview');
      return;
    }

    const html = toPrintableHtml(
      selectedHandout.title,
      selectedHandout.condition,
      renderedContent,
      selectedHandout.print_disclaimer,
    );

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const filteredHandouts = handouts.filter((h) => {
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
    if (instructionTypeFilter !== 'all' && h.instruction_type !== instructionTypeFilter) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        h.title.toLowerCase().includes(term) ||
        h.condition.toLowerCase().includes(term) ||
        h.content.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const groupedByType = filteredHandouts.reduce(
    (acc, handout) => {
      const key = handout.instruction_type || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(handout);
      return acc;
    },
    {} as Record<string, Handout[]>,
  );

  const setInstructionFilter = (next: InstructionType) => {
    setInstructionTypeFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('instructionType');
    } else {
      params.set('instructionType', next);
    }
    setSearchParams(params);
  };

  return (
    <div className="handouts-page">
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => setShowCreateModal(true)}>
          <span className="icon">+</span>
          New Template
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon"></span>
          Refresh
        </button>
      </div>

      <div className="ema-section-header">Clinical Print Templates</div>

      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">Template Type</label>
            <select
              className="ema-filter-select"
              value={instructionTypeFilter}
              onChange={(e) => setInstructionFilter(e.target.value as InstructionType)}
            >
              {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[]).map((type) => (
                <option key={type} value={type}>
                  {INSTRUCTION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Category</label>
            <select
              className="ema-filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group" style={{ flex: 1 }}>
            <label className="ema-filter-label">Search</label>
            <input
              type="text"
              className="ema-filter-select"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          margin: '0 1rem 1rem 1rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          fontSize: '0.85rem',
          color: '#1e3a8a',
        }}
      >
        Placeholder tokens supported in templates: {PLACEHOLDER_GUIDE.join(' • ')}
      </div>

      {loading ? (
        <Skeleton variant="card" height={400} />
      ) : (
        <div style={{ padding: '1rem' }}>
          {Object.keys(groupedByType).length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: '#6b7280',
                background: '#f9fafb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                No templates found
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                Try adjusting filters or create a new template.
              </div>
            </div>
          ) : (
            Object.entries(groupedByType).map(([type, templates]) => (
              <div key={type} style={{ marginBottom: '2rem' }}>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#1f2937',
                    marginBottom: '1rem',
                    borderBottom: '2px solid #e5e7eb',
                    paddingBottom: '0.5rem',
                  }}
                >
                  {formatInstructionType(type as Exclude<InstructionType, 'all'>)} ({templates.length})
                </h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {templates.map((handout) => (
                    <div
                      key={handout.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                          {handout.title}
                        </div>
                        <span
                          style={{
                            background: handout.is_system_template ? '#ecfccb' : '#e0f2fe',
                            color: handout.is_system_template ? '#3f6212' : '#075985',
                            fontSize: '0.7rem',
                            borderRadius: '999px',
                            padding: '0.15rem 0.5rem',
                            fontWeight: 600,
                          }}
                        >
                          {handout.is_system_template ? 'System' : 'Custom'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.5rem' }}>
                        {handout.condition}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                        Category: {handout.category}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                        {handout.content.slice(0, 110)}
                        {handout.content.length > 110 ? '...' : ''}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-primary btn-sm" onClick={() => openPreview(handout)}>
                          Preview / Print
                        </button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(handout)}>
                          Edit
                        </button>
                        {!handout.is_system_template && (
                          <button
                            type="button"
                            className="btn-sm btn-danger"
                            onClick={() => handleDelete(handout.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        isOpen={showPreviewModal}
        title={selectedHandout?.title || 'Template Preview'}
        onClose={() => setShowPreviewModal(false)}
        size="large"
      >
        {selectedHandout && (
          <>
            <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{selectedHandout.condition}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {formatInstructionType(selectedHandout.instruction_type)} • {selectedHandout.category}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  background: '#ffffff',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Personalize before printing</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Patient name"
                    value={personalization.patientName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, patientName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="DOB"
                    value={personalization.patientDob}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, patientDob: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Provider name"
                    value={personalization.providerName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, providerName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Follow-up date"
                    value={personalization.followUpDate}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, followUpDate: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Medication name"
                    value={personalization.medicationName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, medicationName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Dose instructions"
                    value={personalization.dosageInstructions}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, dosageInstructions: e.target.value }))
                    }
                  />
                </div>
                <textarea
                  style={{ marginTop: '0.5rem', width: '100%' }}
                  rows={3}
                  placeholder="Lab summary / extra instructions"
                  value={personalization.labSummary}
                  onChange={(e) =>
                    setPersonalization((prev) => ({ ...prev, labSummary: e.target.value }))
                  }
                />
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#fff',
                  padding: '1rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  fontSize: '0.95rem',
                }}
              >
                {renderedContent}
              </div>

              {selectedHandout.print_disclaimer && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }}>
                  {selectedHandout.print_disclaimer}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowPreviewModal(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowPreviewModal(false);
                  openEdit(selectedHandout);
                }}
              >
                Edit Template
              </button>
              <button type="button" className="btn-primary" onClick={handlePrint}>
                Print
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showCreateModal}
        title="Create Template"
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        size="large"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Template title"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Template Type *</label>
              <select
                value={createForm.instructionType}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    instructionType: e.target.value as Exclude<InstructionType, 'all'>,
                  }))
                }
              >
                {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[])
                  .filter((type) => type !== 'all')
                  .map((type) => (
                    <option key={type} value={type}>
                      {INSTRUCTION_TYPE_LABELS[type]}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-field">
              <label>Category *</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Condition *</label>
            <input
              type="text"
              value={createForm.condition}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, condition: e.target.value }))}
              placeholder="e.g., Rash flare, lab review, post biopsy care"
            />
          </div>

          <div className="form-field">
            <label>Content *</label>
            <textarea
              value={createForm.content}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Use placeholder tokens like {{patient_name}} and {{dosage_instructions}}"
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          <div className="form-field">
            <label>Print Disclaimer</label>
            <textarea
              value={createForm.printDisclaimer}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, printDisclaimer: e.target.value }))
              }
              rows={2}
              placeholder="Optional footer disclaimer"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Template'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        title={`Edit Template${selectedHandout ? `: ${selectedHandout.title}` : ''}`}
        onClose={() => setShowEditModal(false)}
        size="large"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Template Type *</label>
              <select
                value={editForm.instructionType}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    instructionType: e.target.value as Exclude<InstructionType, 'all'>,
                  }))
                }
              >
                {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[])
                  .filter((type) => type !== 'all')
                  .map((type) => (
                    <option key={type} value={type}>
                      {INSTRUCTION_TYPE_LABELS[type]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-field">
              <label>Category *</label>
              <select
                value={editForm.category}
                onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Condition *</label>
            <input
              type="text"
              value={editForm.condition}
              onChange={(e) => setEditForm((prev) => ({ ...prev, condition: e.target.value }))}
            />
          </div>

          <div className="form-field">
            <label>Content *</label>
            <textarea
              value={editForm.content}
              onChange={(e) => setEditForm((prev) => ({ ...prev, content: e.target.value }))}
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          <div className="form-field">
            <label>Print Disclaimer</label>
            <textarea
              value={editForm.printDisclaimer}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, printDisclaimer: e.target.value }))
              }
              rows={2}
            />
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleUpdate} disabled={updating}>
            {updating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
