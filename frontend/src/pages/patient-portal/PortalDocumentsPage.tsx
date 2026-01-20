import { useState, useEffect } from 'react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';

interface Document {
  id: string;
  title: string;
  description: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  category: string;
  sharedAt: string;
  viewedAt: string | null;
  notes: string;
  sharedBy: string;
}

export function PortalDocumentsPage() {
  const { token } = usePatientPortalAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  const fetchDocuments = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/patient-portal-data/documents', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`/api/patient-portal-data/documents/${doc.id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.title;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Refresh to update viewed status
        fetchDocuments();
      }
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType?.toLowerCase() || '';
    if (type.includes('pdf')) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <path d="M10 12h4M10 16h4M8 12h.01M8 16h.01" />
        </svg>
      );
    }
    if (type.includes('image') || type.includes('jpg') || type.includes('png')) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21,15 16,10 5,21" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'lab_results': '#d97706',
      'visit_summary': '#2563eb',
      'consent_form': '#059669',
      'prescription': '#7c3aed',
      'imaging': '#ec4899',
      'other': '#6b7280',
    };
    return colors[category] || colors.other;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'lab_results': 'Lab Results',
      'visit_summary': 'Visit Summary',
      'consent_form': 'Consent Form',
      'prescription': 'Prescription',
      'imaging': 'Imaging',
      'other': 'Other',
    };
    return labels[category] || category;
  };

  const categories = ['all', ...Array.from(new Set(documents.map(d => d.category).filter(Boolean)))];

  const filteredDocuments = documents.filter(doc => {
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const unreadCount = documents.filter(d => !d.viewedAt).length;

  return (
    <PatientPortalLayout>
      <style>{`
        .documents-page {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 2rem;
        }

        .page-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem 0;
        }

        .page-subtitle {
          color: #6b7280;
          margin: 0;
        }

        .stats-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 1rem 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-icon svg {
          width: 20px;
          height: 20px;
        }

        .stat-icon.total {
          background: #eef2ff;
          color: #6366f1;
        }

        .stat-icon.unread {
          background: #fef3c7;
          color: #d97706;
        }

        .stat-info .label {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
        }

        .stat-info .value {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }

        .filters-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .search-input {
          flex: 1;
          min-width: 200px;
          position: relative;
        }

        .search-input input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.9375rem;
          transition: all 0.2s;
        }

        .search-input input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .search-input svg {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          color: #9ca3af;
        }

        .category-filters {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .category-btn {
          padding: 0.5rem 1rem;
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .category-btn:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .category-btn.active {
          background: #6366f1;
          border-color: #6366f1;
          color: white;
        }

        .content-section {
          background: white;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .section-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .section-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .document-item {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #f3f4f6;
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          cursor: pointer;
          transition: background 0.2s;
        }

        .document-item:hover {
          background: #f9fafb;
        }

        .document-item:last-child {
          border-bottom: none;
        }

        .document-item.unread {
          background: #fffbeb;
        }

        .document-item.unread:hover {
          background: #fef3c7;
        }

        .doc-icon {
          width: 48px;
          height: 48px;
          background: #f3f4f6;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .doc-icon svg {
          width: 24px;
          height: 24px;
          color: #6366f1;
        }

        .doc-info {
          flex: 1;
          min-width: 0;
        }

        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.25rem;
        }

        .doc-title {
          font-weight: 600;
          color: #111827;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .new-badge {
          background: #d97706;
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .doc-description {
          color: #6b7280;
          font-size: 0.875rem;
          margin: 0 0 0.5rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .doc-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.75rem;
          color: #9ca3af;
          flex-wrap: wrap;
        }

        .category-badge {
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
        }

        .doc-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .action-btn {
          padding: 0.5rem;
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .action-btn svg {
          width: 18px;
          height: 18px;
          color: #6b7280;
        }

        .action-btn.download:hover {
          background: #eef2ff;
          border-color: #6366f1;
        }

        .action-btn.download:hover svg {
          color: #6366f1;
        }

        .empty-state {
          padding: 3rem;
          text-align: center;
          color: #6b7280;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          background: #f3f4f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }

        .empty-icon svg {
          width: 32px;
          height: 32px;
          color: #9ca3af;
        }

        .loading-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          padding: 1.5rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
        }

        .modal-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .modal-close {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          color: #6b7280;
        }

        .modal-body {
          margin-bottom: 1.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid #f3f4f6;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .detail-value {
          color: #111827;
          font-weight: 500;
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
        }

        .modal-btn {
          flex: 1;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-btn.secondary {
          background: white;
          border: 1px solid #e5e7eb;
          color: #374151;
        }

        .modal-btn.secondary:hover {
          background: #f3f4f6;
        }

        .modal-btn.primary {
          background: #6366f1;
          border: none;
          color: white;
        }

        .modal-btn.primary:hover {
          background: #4f46e5;
        }

        @media (max-width: 640px) {
          .documents-page {
            padding: 1rem;
          }

          .stats-row {
            flex-direction: column;
          }

          .filters-row {
            flex-direction: column;
          }

          .search-input {
            min-width: 100%;
          }

          .document-item {
            flex-direction: column;
          }

          .doc-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>

      <div className="documents-page">
        <div className="page-header">
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">Access your medical documents and forms</p>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
            </div>
            <div className="stat-info">
              <div className="label">Total Documents</div>
              <div className="value">{loading ? '-' : documents.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon unread">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="stat-info">
              <div className="label">Unread</div>
              <div className="value">{loading ? '-' : unreadCount}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-row">
          <div className="search-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="category-filters">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? 'All' : getCategoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Documents List */}
        <div className="content-section">
          <div className="section-header">
            <h3 className="section-title">
              {selectedCategory === 'all' ? 'All Documents' : getCategoryLabel(selectedCategory)}
              {filteredDocuments.length > 0 && ` (${filteredDocuments.length})`}
            </h3>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="loading-skeleton" style={{ height: '5rem', marginBottom: '1rem' }} />
              ))}
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
              </div>
              <p>No documents found</p>
              <p style={{ fontSize: '0.875rem' }}>
                {searchQuery ? 'Try adjusting your search' : 'Documents shared by your care team will appear here'}
              </p>
            </div>
          ) : (
            filteredDocuments.map(doc => (
              <div
                key={doc.id}
                className={`document-item ${!doc.viewedAt ? 'unread' : ''}`}
                onClick={() => setViewingDocument(doc)}
              >
                <div className="doc-icon">
                  {getFileIcon(doc.fileType)}
                </div>
                <div className="doc-info">
                  <div className="doc-header">
                    <h4 className="doc-title">
                      {doc.title}
                      {!doc.viewedAt && <span className="new-badge">New</span>}
                    </h4>
                    {doc.category && (
                      <span
                        className="category-badge"
                        style={{ backgroundColor: getCategoryColor(doc.category) }}
                      >
                        {getCategoryLabel(doc.category)}
                      </span>
                    )}
                  </div>
                  {doc.description && (
                    <p className="doc-description">{doc.description}</p>
                  )}
                  <div className="doc-meta">
                    <span>Shared {formatDate(doc.sharedAt)}</span>
                    {doc.sharedBy && <span>by {doc.sharedBy}</span>}
                    {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                  </div>
                </div>
                <div className="doc-actions">
                  <button
                    className="action-btn download"
                    onClick={e => {
                      e.stopPropagation();
                      handleDownload(doc);
                    }}
                    title="Download"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7,10 12,15 17,10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Document Detail Modal */}
      {viewingDocument && (
        <div className="modal-overlay" onClick={() => setViewingDocument(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{viewingDocument.title}</h3>
              <button className="modal-close" onClick={() => setViewingDocument(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {viewingDocument.description && (
                <div className="detail-row">
                  <span className="detail-label">Description</span>
                  <span className="detail-value">{viewingDocument.description}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Category</span>
                <span className="detail-value">{getCategoryLabel(viewingDocument.category)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Shared By</span>
                <span className="detail-value">{viewingDocument.sharedBy}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Date Shared</span>
                <span className="detail-value">{formatDate(viewingDocument.sharedAt)}</span>
              </div>
              {viewingDocument.fileSize && (
                <div className="detail-row">
                  <span className="detail-label">File Size</span>
                  <span className="detail-value">{formatFileSize(viewingDocument.fileSize)}</span>
                </div>
              )}
              {viewingDocument.notes && (
                <div className="detail-row">
                  <span className="detail-label">Notes</span>
                  <span className="detail-value">{viewingDocument.notes}</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setViewingDocument(null)}>
                Close
              </button>
              <button className="modal-btn primary" onClick={() => handleDownload(viewingDocument)}>
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </PatientPortalLayout>
  );
}
