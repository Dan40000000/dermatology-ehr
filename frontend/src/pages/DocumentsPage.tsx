import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import {
  fetchDocuments,
  fetchPatients,
  createDocument,
  uploadDocumentFile,
  API_BASE_URL,
} from '../api';
import type { Document, Patient } from '../types';

type ViewMode = 'grid' | 'list';
type DocCategory = 'all' | 'lab-result' | 'imaging' | 'referral' | 'consent' | 'other';

const DOC_CATEGORIES: { value: DocCategory; label: string; icon: string }[] = [
  { value: 'lab-result', label: 'Lab Results', icon: '' },
  { value: 'imaging', label: 'Imaging', icon: '' },
  { value: 'referral', label: 'Referrals', icon: '' },
  { value: 'consent', label: 'Consent Forms', icon: '' },
  { value: 'other', label: 'Other', icon: '' },
];

export function DocumentsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [categoryFilter, setCategoryFilter] = useState<DocCategory>('all');
  const [selectedPatient, setSelectedPatient] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    patientId: '',
    category: 'other' as DocCategory,
    title: '',
    description: '',
    file: null as File | null,
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [docsRes, patientsRes] = await Promise.all([
        fetchDocuments(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setDocuments(docsRes.documents || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm((prev) => ({
        ...prev,
        file,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
    }
  };

  const handleUpload = async () => {
    if (!session || !uploadForm.file || !uploadForm.patientId) {
      showError('Please select a patient and file');
      return;
    }

    setUploading(true);
    try {
      // Upload file first
      const uploadResult = await uploadDocumentFile(
        session.tenantId,
        session.accessToken,
        uploadForm.file
      );

      // Create document record
      await createDocument(session.tenantId, session.accessToken, {
        patientId: uploadForm.patientId,
        url: uploadResult.url,
        objectKey: uploadResult.objectKey,
        storage: uploadResult.storage,
        category: uploadForm.category,
        title: uploadForm.title || uploadForm.file.name,
        description: uploadForm.description,
        filename: uploadForm.file.name,
        mimeType: uploadForm.file.type,
        fileSize: uploadForm.file.size,
      });

      showSuccess('Document uploaded successfully');
      setShowUploadModal(false);
      setUploadForm({
        patientId: '',
        category: 'other',
        title: '',
        description: '',
        file: null,
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getDocUrl = (doc: Document) => {
    if (doc.storage === 's3' && doc.objectKey) {
      return `${API_BASE_URL}/api/documents/view/${doc.objectKey}`;
    }
    return doc.url;
  };

  const filteredDocuments = documents.filter((doc) => {
    if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
    if (selectedPatient !== 'all' && doc.patientId !== selectedPatient) return false;
    if (searchTerm) {
      const patientName = getPatientName(doc.patientId).toLowerCase();
      const title = (doc.title || '').toLowerCase();
      const desc = (doc.description || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !title.includes(searchTerm.toLowerCase()) &&
        !desc.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const getCategoryInfo = (category?: string) => {
    const cat = DOC_CATEGORIES.find((c) => c.value === category);
    return cat || { value: 'other', label: 'Other', icon: '' };
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return '';
    if (mimeType.startsWith('image/')) return '';
    if (mimeType === 'application/pdf') return '';
    if (mimeType.includes('word')) return '';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '';
    return '';
  };

  if (loading) {
    return (
      <div className="documents-page">
        <div className="page-header">
          <h1>Documents</h1>
        </div>
        <Skeleton variant="card" height={60} />
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="documents-page" style={{
      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(20, 184, 166, 0.3)',
    }}>
      <div className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Document Management</h1>
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(20, 184, 166, 0.4)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(20, 184, 166, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 184, 166, 0.4)';
          }}
        >
          + Upload Document
        </button>
      </div>

      {/* Document Management Sections */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {/* Patient Attachments */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Patient Attachments</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Upload attachments (images, scans, etc) and associate them with patients or add to the fax queue.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setShowUploadModal(true)} style={{
              flex: 1,
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Upload New Attachments</button>
            <button style={{
              flex: 1,
              padding: '0.75rem',
              background: '#ffffff',
              color: '#0d9488',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Associate Attachments with Patients</button>
          </div>
        </div>

        {/* Physician Specialties and Referral Contacts */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Physician Specialties and Referral Contacts</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Create and update your referral contacts, mark them as active or inactive.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Manage Referral Contacts</button>
            <button style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Manage Physician Specialties</button>
          </div>
        </div>

        {/* Faxes Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Faxes</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Manage incoming and outgoing faxes.
          </p>
          <button style={{
            width: '100%',
            padding: '0.75rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>Manage Faxes</button>
        </div>

        {/* Consents Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Consents and Procedure Forms</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Manage consent forms and procedure consents.
          </p>
          <button style={{
            width: '100%',
            padding: '0.75rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>Manage Consents</button>
        </div>

        {/* Clinical Quality Measures */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          gridColumn: 'span 2',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Clinical Quality Measures</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Manage CQM Category 1 Files.
          </p>
          <button style={{
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>Import CQM Category 1 Files</button>
        </div>
      </div>

      {/* Filters */}
      <div className="documents-filters" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              width: '100%',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div className="filter-group">
          <label>Patient:</label>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
          >
            <option value="all">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-tabs">
          <button
            type="button"
            className={`filter-tab ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All
          </button>
          {DOC_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`filter-tab ${categoryFilter === cat.value ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat.value)}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Documents Display */}
      {filteredDocuments.length === 0 ? (
        <Panel title="">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h3>No documents found</h3>
            <p className="muted">
              {categoryFilter !== 'all' || selectedPatient !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload your first document'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowUploadModal(true)}
            >
              Upload Document
            </button>
          </div>
        </Panel>
      ) : viewMode === 'grid' ? (
        <div className="document-grid">
          {filteredDocuments.map((doc) => {
            const catInfo = getCategoryInfo(doc.category);
            return (
              <a
                key={doc.id}
                href={getDocUrl(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className="document-card"
              >
                <div className="document-icon">{getFileIcon(doc.mimeType)}</div>
                <div className="document-info">
                  <div className="document-title strong">
                    {doc.title || doc.filename}
                  </div>
                  <div className="document-patient muted">
                    {getPatientName(doc.patientId)}
                  </div>
                  <div className="document-meta">
                    <span className={`pill subtle ${doc.category}`}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                    <span className="muted tiny">{formatFileSize(doc.fileSize)}</span>
                  </div>
                  <div className="document-date muted tiny">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="document-list">
          {filteredDocuments.map((doc) => {
            const catInfo = getCategoryInfo(doc.category);
            return (
              <a
                key={doc.id}
                href={getDocUrl(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className="document-list-item"
              >
                <div className="document-list-icon">{getFileIcon(doc.mimeType)}</div>
                <div className="document-list-content">
                  <div className="document-list-header">
                    <span className="strong">{doc.title || doc.filename}</span>
                    <span className={`pill ${doc.category}`}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                  </div>
                  <div className="document-list-patient">
                    Patient: {getPatientName(doc.patientId)}
                  </div>
                  {doc.description && (
                    <div className="document-desc muted">{doc.description}</div>
                  )}
                  <div className="document-list-meta muted tiny">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>Uploaded: {new Date(doc.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        title="Upload Document"
        onClose={() => {
          setShowUploadModal(false);
          setUploadForm({
            patientId: '',
            category: 'other',
            title: '',
            description: '',
            file: null,
          });
        }}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={uploadForm.patientId}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, patientId: e.target.value }))
              }
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select
                value={uploadForm.category}
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    category: e.target.value as DocCategory,
                  }))
                }
              >
                {DOC_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Document Title</label>
              <input
                type="text"
                value={uploadForm.title}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Document title"
              />
            </div>
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={uploadForm.description}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>File *</label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {uploadForm.file ? (
              <div className="file-selected">
                <div className="file-info">
                  <span className="file-icon">{getFileIcon(uploadForm.file.type)}</span>
                  <div>
                    <div className="strong">{uploadForm.file.name}</div>
                    <div className="muted tiny">
                      {formatFileSize(uploadForm.file.size)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-sm btn-secondary"
                  onClick={() => {
                    setUploadForm((prev) => ({ ...prev, file: null }));
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                className="upload-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon"></div>
                <p>Click to select a file</p>
                <p className="muted tiny">PDF, Word, Excel, images supported</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowUploadModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleUpload}
            disabled={uploading || !uploadForm.file || !uploadForm.patientId}
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
