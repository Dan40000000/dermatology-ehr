import { useEffect, useState } from 'react';
import { Modal } from '../ui';
import { fetchNoteTemplates, applyNoteTemplate, toggleNoteTemplateFavorite, type NoteTemplate } from '../../api';

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (content: NoteTemplate['templateContent']) => void;
  tenantId: string;
  accessToken: string;
}

const TEMPLATE_CATEGORIES = [
  'All',
  'Initial Visit',
  'Follow-up Visit',
  'Procedure Note',
  'Biopsy',
  'Excision',
  'Cosmetic Consultation',
];

export function TemplateSelector({ isOpen, onClose, onApply, tenantId, accessToken }: TemplateSelectorProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load templates
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetchNoteTemplates(tenantId, accessToken);
      setTemplates(res.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    // Category filter
    if (selectedCategory !== 'All' && t.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Group templates
  const favoriteTemplates = filteredTemplates.filter((t) => t.isFavorite);
  const recentTemplates = [...filteredTemplates]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);
  const otherTemplates = filteredTemplates.filter((t) => !t.isFavorite);

  // Apply template
  const handleApply = async (template: NoteTemplate) => {
    try {
      const res = await applyNoteTemplate(tenantId, accessToken, template.id);
      onApply(res.templateContent);
      onClose();
    } catch (err) {
      console.error('Failed to apply template:', err);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (template: NoteTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleNoteTemplateFavorite(tenantId, accessToken, template.id);
      loadTemplates();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  // Preview template
  const handlePreview = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setShowPreview(true);
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

  const TemplateCard = ({ template }: { template: NoteTemplate }) => (
    <div
      onClick={() => handleApply(template)}
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#0369a1';
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Favorite Button */}
      <button
        type="button"
        onClick={(e) => handleToggleFavorite(template, e)}
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          background: 'transparent',
          border: 'none',
          fontSize: '1.25rem',
          cursor: 'pointer',
          padding: 0
        }}
      >
        {template.isFavorite ? '⭐' : '☆'}
      </button>

      {/* Category Badge */}
      <div style={{
        display: 'inline-block',
        padding: '0.25rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.625rem',
        fontWeight: 600,
        background: `${getCategoryColor(template.category)}20`,
        color: getCategoryColor(template.category),
        marginBottom: '0.5rem'
      }}>
        {template.category}
      </div>

      {/* Template Name */}
      <div style={{
        fontWeight: 600,
        fontSize: '0.875rem',
        color: '#111827',
        marginBottom: '0.25rem',
        paddingRight: '2rem'
      }}>
        {template.name}
      </div>

      {/* Description */}
      {template.description && (
        <div style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          marginBottom: '0.5rem',
          lineHeight: '1.4'
        }}>
          {template.description.length > 80
            ? `${template.description.substring(0, 80)}...`
            : template.description}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '0.5rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid #e5e7eb',
        fontSize: '0.625rem',
        color: '#9ca3af'
      }}>
        <span>Used {template.usageCount} times</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePreview(template);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#0369a1',
            fontSize: '0.625rem',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Preview
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal isOpen={isOpen && !showPreview} title="Select Note Template" onClose={onClose} size="lg">
        <div style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
          {/* Search and Filter */}
          <div style={{ marginBottom: '1.5rem' }}>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                marginBottom: '1rem'
              }}
            />

            {/* Category Tabs */}
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem'
            }}>
              {TEMPLATE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: selectedCategory === category ? '#0369a1' : '#f3f4f6',
                    color: selectedCategory === category ? '#ffffff' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Templates List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                Loading templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px dashed #d1d5db'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  No templates found. Try adjusting your filters.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {/* Favorites Section */}
                {favoriteTemplates.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <span>⭐</span>
                      <span>Favorites</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      {favoriteTemplates.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Recently Used Section */}
                {!searchQuery && selectedCategory === 'All' && recentTemplates.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <span>🔥</span>
                      <span>Most Used</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      {recentTemplates.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                      ))}
                    </div>
                  </div>
                )}

                {/* All Templates Section */}
                {otherTemplates.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.75rem'
                    }}>
                      {favoriteTemplates.length > 0 ? 'Other Templates' : 'All Templates'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      {otherTemplates.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Modal>

      {/* Preview Modal */}
      {selectedTemplate && (
        <Modal
          isOpen={showPreview}
          title={selectedTemplate.name}
          onClose={() => {
            setShowPreview(false);
            setSelectedTemplate(null);
          }}
          size="lg"
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {/* Metadata */}
            <div style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: `${getCategoryColor(selectedTemplate.category)}20`,
                color: getCategoryColor(selectedTemplate.category),
                marginBottom: '0.5rem'
              }}>
                {selectedTemplate.category}
              </div>
              {selectedTemplate.description && (
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {selectedTemplate.description}
                </div>
              )}
            </div>

            {/* Template Content */}
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {selectedTemplate.templateContent.chiefComplaint && (
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Chief Complaint
                  </div>
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
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    HPI
                  </div>
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
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    ROS
                  </div>
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
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Physical Exam
                  </div>
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
                  <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    Assessment & Plan
                  </div>
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

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowPreview(false);
                setSelectedTemplate(null);
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                handleApply(selectedTemplate);
                setShowPreview(false);
                setSelectedTemplate(null);
              }}
            >
              Apply This Template
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
