import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Modal } from '../components/ui';
import {
  fetchNoteTemplates,
  createNoteTemplate,
  updateNoteTemplate,
  deleteNoteTemplate,
  toggleNoteTemplateFavorite,
  type NoteTemplate,
} from '../api';

const TEMPLATE_CATEGORIES = [
  'Initial Visit',
  'Follow-up Visit',
  'Procedure Note',
  'Biopsy',
  'Excision',
  'Cosmetic Consultation',
];

export function NoteTemplatesPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<NoteTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'Initial Visit',
    description: '',
    isShared: false,
    templateContent: {
      chiefComplaint: '',
      hpi: '',
      ros: '',
      exam: '',
      assessmentPlan: '',
    },
  });

  // Load templates
  const loadTemplates = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const res = await fetchNoteTemplates(session.tenantId, session.accessToken);
      setTemplates(res.templates || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [session]);

  // Filter templates
  useEffect(() => {
    let filtered = [...templates];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((t) => t.category === selectedCategory);
    }

    // Filter favorites
    if (showOnlyFavorites) {
      filtered = filtered.filter((t) => t.isFavorite);
    }

    setFilteredTemplates(filtered);
  }, [templates, searchQuery, selectedCategory, showOnlyFavorites]);

  // Create template
  const handleCreate = async () => {
    if (!session) return;

    try {
      await createNoteTemplate(session.tenantId, session.accessToken, formData);
      showSuccess('Template created successfully');
      setShowCreateModal(false);
      resetForm();
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to create template');
    }
  };

  // Edit template
  const handleEdit = async () => {
    if (!session || !selectedTemplate) return;

    try {
      await updateNoteTemplate(session.tenantId, session.accessToken, selectedTemplate.id, formData);
      showSuccess('Template updated successfully');
      setShowEditModal(false);
      resetForm();
      setSelectedTemplate(null);
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to update template');
    }
  };

  // Delete template
  const handleDelete = async () => {
    if (!session || !selectedTemplate) return;

    try {
      await deleteNoteTemplate(session.tenantId, session.accessToken, selectedTemplate.id);
      showSuccess('Template deleted successfully');
      setShowDeleteModal(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to delete template');
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (template: NoteTemplate) => {
    if (!session) return;

    try {
      const res = await toggleNoteTemplateFavorite(session.tenantId, session.accessToken, template.id);
      showSuccess(res.isFavorite ? 'Added to favorites' : 'Removed from favorites');
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to update favorite');
    }
  };

  // Clone template
  const handleClone = (template: NoteTemplate) => {
    setFormData({
      name: `${template.name} (Copy)`,
      category: template.category,
      description: template.description || '',
      isShared: false,
      templateContent: {
        chiefComplaint: template.templateContent.chiefComplaint || '',
        hpi: template.templateContent.hpi || '',
        ros: template.templateContent.ros || '',
        exam: template.templateContent.exam || '',
        assessmentPlan: template.templateContent.assessmentPlan || '',
      },
    });
    setShowCreateModal(true);
  };

  // Open edit modal
  const openEditModal = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      description: template.description || '',
      isShared: template.isShared,
      templateContent: {
        chiefComplaint: template.templateContent.chiefComplaint || '',
        hpi: template.templateContent.hpi || '',
        ros: template.templateContent.ros || '',
        exam: template.templateContent.exam || '',
        assessmentPlan: template.templateContent.assessmentPlan || '',
      },
    });
    setShowEditModal(true);
  };

  // Open delete modal
  const openDeleteModal = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setShowDeleteModal(true);
  };

  // Open preview modal
  const openPreviewModal = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setShowPreviewModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Initial Visit',
      description: '',
      isShared: false,
      templateContent: {
        chiefComplaint: '',
        hpi: '',
        ros: '',
        exam: '',
        assessmentPlan: '',
      },
    });
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Initial Visit': '#0369a1',
      'Follow-up Visit': '#059669',
      'Procedure Note': '#7c3aed',
      'Biopsy': '#dc2626',
      'Excision': '#ea580c',
      'Cosmetic Consultation': '#d946ef',
    };
    return colors[category] || '#6b7280';
  };

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>Loading templates...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Note Templates</h1>
          <p className="page-subtitle">Create and manage reusable clinical note templates</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          style={{ background: '#0369a1' }}
        >
          Create Template
        </button>
      </div>

      {/* Filters */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '1rem', alignItems: 'center' }}>
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search templates by name, description, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem',
              minWidth: '200px'
            }}
          >
            <option value="">All Categories</option>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Favorites Toggle */}
          <button
            type="button"
            onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
            style={{
              padding: '0.75rem 1.5rem',
              background: showOnlyFavorites ? '#fef3c7' : '#f3f4f6',
              color: showOnlyFavorites ? '#92400e' : '#374151',
              border: showOnlyFavorites ? '1px solid #fbbf24' : '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>{showOnlyFavorites ? '' : ''}</span>
            <span>Favorites Only</span>
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div style={{
          background: '#ffffff',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '4rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>
            {searchQuery || selectedCategory || showOnlyFavorites ? 'No templates found' : 'No templates yet'}
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            {searchQuery || selectedCategory || showOnlyFavorites
              ? 'Try adjusting your filters'
              : 'Create your first template to get started'}
          </p>
          {!searchQuery && !selectedCategory && !showOnlyFavorites && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
            >
              Create Your First Template
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                position: 'relative',
                transition: 'box-shadow 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
              onClick={() => openPreviewModal(template)}
            >
              {/* Favorite Badge */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(template);
                }}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {template.isFavorite ? '' : ''}
              </button>

              {/* Category Badge */}
              <div style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: `${getCategoryColor(template.category)}20`,
                color: getCategoryColor(template.category),
                marginBottom: '1rem'
              }}>
                {template.category}
              </div>

              {/* Template Name */}
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '0.5rem',
                paddingRight: '2rem'
              }}>
                {template.name}
              </h3>

              {/* Description */}
              {template.description && (
                <p style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginBottom: '1rem',
                  lineHeight: '1.5'
                }}>
                  {template.description}
                </p>
              )}

              {/* Metadata */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                fontSize: '0.75rem',
                color: '#9ca3af',
                marginBottom: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e5e7eb'
              }}>
                <span>Used {template.usageCount} times</span>
                {template.isShared && <span>• Shared</span>}
              </div>

              {/* Actions */}
              <div
                style={{ display: 'flex', gap: '0.5rem' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openEditModal(template)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleClone(template)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #0369a1',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteModal(template)}
                  style={{
                    padding: '0.5rem',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal || showEditModal}
        title={showCreateModal ? 'Create Note Template' : 'Edit Note Template'}
        onClose={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          resetForm();
          setSelectedTemplate(null);
        }}
        size="lg"
      >
        <div className="modal-form" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Basic Info */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="form-field">
              <label>Template Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Skin Cancer Screening Visit"
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.isShared}
                    onChange={(e) => setFormData({ ...formData, isShared: e.target.checked })}
                  />
                  <span>Share with all providers</span>
                </label>
              </div>
            </div>

            <div className="form-field">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of when to use this template..."
                rows={2}
              />
            </div>
          </div>

          {/* Template Content */}
          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              Tip: Use variables like {'{{'} patientName {'}}'}, {'{{'} patientAge {'}}'}, {'{{'} date {'}}'}, {'{{'} providerName {'}}'} in your templates
            </div>
          </div>

          <div className="form-field">
            <label>Chief Complaint</label>
            <textarea
              value={formData.templateContent.chiefComplaint}
              onChange={(e) => setFormData({
                ...formData,
                templateContent: { ...formData.templateContent, chiefComplaint: e.target.value }
              })}
              placeholder="e.g., Patient presents for annual skin check"
              rows={2}
            />
          </div>

          <div className="form-field">
            <label>History of Present Illness (HPI)</label>
            <textarea
              value={formData.templateContent.hpi}
              onChange={(e) => setFormData({
                ...formData,
                templateContent: { ...formData.templateContent, hpi: e.target.value }
              })}
              placeholder="Patient history template..."
              rows={4}
            />
          </div>

          <div className="form-field">
            <label>Review of Systems (ROS)</label>
            <textarea
              value={formData.templateContent.ros}
              onChange={(e) => setFormData({
                ...formData,
                templateContent: { ...formData.templateContent, ros: e.target.value }
              })}
              placeholder="Constitutional: Negative. HEENT: Negative..."
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>Physical Exam</label>
            <textarea
              value={formData.templateContent.exam}
              onChange={(e) => setFormData({
                ...formData,
                templateContent: { ...formData.templateContent, exam: e.target.value }
              })}
              placeholder="General: Well-appearing. Skin:..."
              rows={6}
            />
          </div>

          <div className="form-field">
            <label>Assessment & Plan</label>
            <textarea
              value={formData.templateContent.assessmentPlan}
              onChange={(e) => setFormData({
                ...formData,
                templateContent: { ...formData.templateContent, assessmentPlan: e.target.value }
              })}
              placeholder="1. Diagnosis - Treatment plan..."
              rows={6}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowCreateModal(false);
              setShowEditModal(false);
              resetForm();
              setSelectedTemplate(null);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={showCreateModal ? handleCreate : handleEdit}
            disabled={!formData.name || !formData.category}
          >
            {showCreateModal ? 'Create Template' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        title={selectedTemplate?.name || 'Template Preview'}
        onClose={() => {
          setShowPreviewModal(false);
          setSelectedTemplate(null);
        }}
        size="lg"
      >
        {selectedTemplate && (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* Metadata */}
            <div style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: '#6b7280' }}>Category:</span>{' '}
                  <span style={{ fontWeight: 500, color: getCategoryColor(selectedTemplate.category) }}>
                    {selectedTemplate.category}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Usage Count:</span>{' '}
                  <span style={{ fontWeight: 500 }}>{selectedTemplate.usageCount}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Shared:</span>{' '}
                  <span style={{ fontWeight: 500 }}>{selectedTemplate.isShared ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Favorite:</span>{' '}
                  <span>{selectedTemplate.isFavorite ? 'Yes' : 'No'}</span>
                </div>
              </div>
              {selectedTemplate.description && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Description:</div>
                  <div style={{ fontSize: '0.875rem' }}>{selectedTemplate.description}</div>
                </div>
              )}
            </div>

            {/* Template Content */}
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {selectedTemplate.templateContent.chiefComplaint && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Chief Complaint</div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedTemplate.templateContent.chiefComplaint}
                  </div>
                </div>
              )}

              {selectedTemplate.templateContent.hpi && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>HPI</div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedTemplate.templateContent.hpi}
                  </div>
                </div>
              )}

              {selectedTemplate.templateContent.ros && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>ROS</div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedTemplate.templateContent.ros}
                  </div>
                </div>
              )}

              {selectedTemplate.templateContent.exam && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Physical Exam</div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedTemplate.templateContent.exam}
                  </div>
                </div>
              )}

              {selectedTemplate.templateContent.assessmentPlan && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Assessment & Plan</div>
                  <div style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedTemplate.templateContent.assessmentPlan}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowPreviewModal(false);
              setSelectedTemplate(null);
            }}
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        title="Delete Template"
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedTemplate(null);
        }}
      >
        <div style={{ padding: '1rem 0' }}>
          <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem' }}>
            Are you sure you want to delete the template "{selectedTemplate?.name}"? This action cannot be undone.
          </p>
          {selectedTemplate && selectedTemplate.usageCount > 0 && (
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.875rem',
              color: '#92400e'
            }}>
              This template has been used {selectedTemplate.usageCount} time(s). Deleting it will not affect existing encounters.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowDeleteModal(false);
              setSelectedTemplate(null);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: '0.5rem 1rem',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Delete Template
          </button>
        </div>
      </Modal>
    </div>
  );
}
