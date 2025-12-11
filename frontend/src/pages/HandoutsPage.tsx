import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Modal, Skeleton } from '../components/ui';

interface Handout {
  id: string;
  title: string;
  category: string;
  condition: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  'Skin Conditions',
  'Procedures',
  'Medications',
  'Post-Procedure Care',
  'Prevention',
  'General Information',
];

export function HandoutsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHandout, setSelectedHandout] = useState<Handout | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Skin Conditions',
    condition: '',
    content: '',
    isActive: true,
  });

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/handouts?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load handouts');
      const data = await response.json();
      setHandouts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showError(err.message || 'Failed to load handouts');
    } finally {
      setLoading(false);
    }
  }, [session, categoryFilter, searchTerm, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!session) return;
    if (!formData.title || !formData.condition || !formData.content) {
      showError('Title, condition, and content are required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/handouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create handout');

      showSuccess('Handout created successfully');
      setShowCreateModal(false);
      setFormData({
        title: '',
        category: 'Skin Conditions',
        condition: '',
        content: '',
        isActive: true,
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create handout');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    if (!window.confirm('Delete this handout? This cannot be undone.')) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/handouts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to delete handout');

      showSuccess('Handout deleted');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete handout');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredHandouts = handouts.filter((h) => {
    if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
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

  const groupedHandouts = filteredHandouts.reduce((acc, handout) => {
    if (!acc[handout.category]) {
      acc[handout.category] = [];
    }
    acc[handout.category].push(handout);
    return acc;
  }, {} as Record<string, Handout[]>);

  return (
    <div className="handouts-page">
      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => setShowCreateModal(true)}>
          <span className="icon">➕</span>
          Create Handout
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon">🔃</span>
          Refresh
        </button>
      </div>

      <div className="ema-section-header">Patient Education Handout Library</div>

      {/* Filters */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
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
              placeholder="Search handouts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Handouts Grid */}
      {loading ? (
        <Skeleton variant="card" height={400} />
      ) : (
        <div style={{ padding: '1rem' }}>
          {Object.keys(groupedHandouts).length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: '#6b7280',
                background: '#f9fafb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                No handouts found
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                {searchTerm || categoryFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first patient education handout'}
              </div>
            </div>
          ) : (
            Object.entries(groupedHandouts).map(([category, categoryHandouts]) => (
              <div key={category} style={{ marginBottom: '2rem' }}>
                <h3
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#1f2937',
                    marginBottom: '1rem',
                    borderBottom: '2px solid #e5e7eb',
                    paddingBottom: '0.5rem',
                  }}
                >
                  {category} ({categoryHandouts.length})
                </h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {categoryHandouts.map((handout) => (
                    <div
                      key={handout.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        setSelectedHandout(handout);
                        setShowPreviewModal(true);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 600,
                          color: '#1f2937',
                          marginBottom: '0.5rem',
                        }}
                      >
                        {handout.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {handout.condition}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                          borderTop: '1px solid #f3f4f6',
                          paddingTop: '0.5rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>Click to preview</span>
                        <button
                          type="button"
                          className="btn-sm btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(handout.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        title={selectedHandout?.title || ''}
        onClose={() => setShowPreviewModal(false)}
        size="large"
      >
        {selectedHandout && (
          <>
            <div style={{ padding: '1rem' }}>
              <div
                style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {selectedHandout.condition}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Category: {selectedHandout.category}
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.9375rem',
                  lineHeight: 1.6,
                  color: '#374151',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedHandout.content}
              </div>

              <div
                style={{
                  marginTop: '2rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #e5e7eb',
                  fontSize: '0.75rem',
                  color: '#9ca3af',
                  textAlign: 'center',
                }}
              >
                This handout is for educational purposes only. Always consult with your healthcare
                provider for medical advice.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowPreviewModal(false)}
              >
                Close
              </button>
              <button type="button" className="btn-primary" onClick={handlePrint}>
                Print Handout
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        title="Create Patient Handout"
        onClose={() => setShowCreateModal(false)}
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Understanding Eczema"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Condition *</label>
              <input
                type="text"
                value={formData.condition}
                onChange={(e) => setFormData((prev) => ({ ...prev, condition: e.target.value }))}
                placeholder="e.g., Atopic Dermatitis"
              />
            </div>
          </div>

          <div className="form-field">
            <label>Content *</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Enter the full handout content here..."
              rows={15}
              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active (visible to staff)
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Handout'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
