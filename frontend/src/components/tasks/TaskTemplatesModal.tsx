import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import {
  fetchTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
} from '../../api';
import type { TaskTemplate, TaskCategory, TaskPriority, Provider } from '../../types';

interface TaskTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Array<{ id: string; fullName: string }>;
}

export function TaskTemplatesModal({ isOpen, onClose, providers }: TaskTemplatesModalProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    title: '',
    description: '',
    category: '' as TaskCategory | '',
    priority: 'normal' as TaskPriority,
    defaultAssignee: '',
  });

  useEffect(() => {
    if (isOpen && session) {
      loadTemplates();
    }
  }, [isOpen, session]);

  const loadTemplates = async () => {
    if (!session) return;

    setLoading(true);
    try {
      const res = await fetchTaskTemplates(session.tenantId, session.accessToken);
      setTemplates(res.templates || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      title: '',
      description: '',
      category: '',
      priority: 'normal',
      defaultAssignee: '',
    });
    setEditingTemplate(null);
    setShowForm(false);
  };

  const handleEdit = (template: TaskTemplate) => {
    setFormData({
      name: template.name,
      title: template.title,
      description: template.description || '',
      category: template.category || '',
      priority: template.priority,
      defaultAssignee: template.defaultAssignee || '',
    });
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!session) return;

    if (!formData.name || !formData.title) {
      showError('Name and title are required');
      return;
    }

    try {
      if (editingTemplate) {
        await updateTaskTemplate(session.tenantId, session.accessToken, editingTemplate.id, formData);
        showSuccess('Template updated successfully');
      } else {
        await createTaskTemplate(session.tenantId, session.accessToken, formData);
        showSuccess('Template created successfully');
      }

      resetForm();
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to save template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!session) return;
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await deleteTaskTemplate(session.tenantId, session.accessToken, templateId);
      showSuccess('Template deleted successfully');
      loadTemplates();
    } catch (err: any) {
      showError(err.message || 'Failed to delete template');
    }
  };

  return (
    <Modal isOpen={isOpen} title="Manage Quick Task Templates" onClose={onClose} maxWidth="800px">
      <div style={{ padding: '1rem' }}>
        {!showForm ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Task Templates</h3>
              <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
                + New Template
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading templates...</div>
            ) : templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <p>No templates yet.</p>
                <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
                  Create First Template
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {templates.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>{template.name}</h4>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500, color: '#374151' }}>
                          {template.title}
                        </p>
                        {template.description && (
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                            {template.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {template.category && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                background: '#e0f2fe',
                                color: '#0369a1',
                                borderRadius: '4px',
                              }}
                            >
                              {template.category.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background:
                                template.priority === 'urgent'
                                  ? '#fee2e2'
                                  : template.priority === 'high'
                                  ? '#fef3c7'
                                  : template.priority === 'low'
                                  ? '#d1fae5'
                                  : '#f3f4f6',
                              color:
                                template.priority === 'urgent'
                                  ? '#991b1b'
                                  : template.priority === 'high'
                                  ? '#92400e'
                                  : template.priority === 'low'
                                  ? '#065f46'
                                  : '#374151',
                              borderRadius: '4px',
                              textTransform: 'capitalize',
                            }}
                          >
                            {template.priority} Priority
                          </span>
                          {template.defaultAssigneeName && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                background: '#f3f4f6',
                                color: '#374151',
                                borderRadius: '4px',
                              }}
                            >
                              Default: {template.defaultAssigneeName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                        <button
                          type="button"
                          onClick={() => handleEdit(template)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(template.id)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: '#fee2e2',
                            border: '1px solid #fecaca',
                            color: '#991b1b',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{editingTemplate ? 'Edit Template' : 'New Template'}</h3>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Follow-up Call"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Task Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Call patient for follow-up"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as TaskCategory | '' })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                  >
                    <option value="">None</option>
                    <option value="patient-followup">Patient Follow-up</option>
                    <option value="prior-auth">Prior Authorization</option>
                    <option value="lab-path-followup">Lab/Path Follow-up</option>
                    <option value="prescription-refill">Prescription Refill</option>
                    <option value="insurance-verification">Insurance Verification</option>
                    <option value="general">General</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Default Assignee
                </label>
                <select
                  value={formData.defaultAssignee}
                  onChange={(e) => setFormData({ ...formData, defaultAssignee: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                >
                  <option value="">None</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
