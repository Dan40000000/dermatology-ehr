import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import {
  fetchPhotos,
  fetchPatients,
  createPhoto,
  uploadPhotoFile,
  updatePhotoAnnotations,
  createComparisonGroup,
  fetchComparisonGroup,
  API_BASE_URL,
} from '../api';
import type { Photo, Patient, PhotoType, PhotoComparisonGroup } from '../types';
import { PhotoAnnotator } from '../components/clinical/PhotoAnnotator';
import { PhotoComparison } from '../components/clinical/PhotoComparison';
import { PhotoTimeline } from '../components/clinical/PhotoTimeline';

type ViewMode = 'grid' | 'list' | 'timeline' | 'comparison';
type PhotoCategory = 'all' | 'clinical' | 'dermoscopy' | 'before-after' | 'other';

const BODY_REGIONS = [
  'Face', 'Scalp', 'Neck', 'Chest', 'Back', 'Abdomen',
  'Upper Arm (L)', 'Upper Arm (R)', 'Forearm (L)', 'Forearm (R)',
  'Hand (L)', 'Hand (R)', 'Upper Leg (L)', 'Upper Leg (R)',
  'Lower Leg (L)', 'Lower Leg (R)', 'Foot (L)', 'Foot (R)', 'Other',
];

export function PhotosPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<PhotoCategory>('all');
  const [selectedPatient, setSelectedPatient] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAnnotateModal, setShowAnnotateModal] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [comparisonGroup, setComparisonGroup] = useState<PhotoComparisonGroup | null>(null);
  const [selectedForComparison, setSelectedForComparison] = useState<Photo[]>([]);

  const [uploadForm, setUploadForm] = useState({
    patientId: '',
    category: 'clinical' as PhotoCategory,
    photoType: 'clinical' as PhotoType,
    bodyRegion: '',
    description: '',
    file: null as File | null,
    previewUrl: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [photosRes, patientsRes] = await Promise.all([
        fetchPhotos(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setPhotos(photosRes.photos || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load photos');
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
      if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setUploadForm((prev) => ({ ...prev, file, previewUrl }));
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
      const uploadResult = await uploadPhotoFile(
        session.tenantId,
        session.accessToken,
        uploadForm.file
      );

      // Create photo record
      await createPhoto(session.tenantId, session.accessToken, {
        patientId: uploadForm.patientId,
        url: uploadResult.url,
        objectKey: uploadResult.objectKey,
        storage: uploadResult.storage,
        category: uploadForm.category,
        photoType: uploadForm.photoType,
        bodyRegion: uploadForm.bodyRegion,
        bodyLocation: uploadForm.bodyRegion,
        description: uploadForm.description,
        filename: uploadForm.file.name,
        mimeType: uploadForm.file.type,
        fileSize: uploadForm.file.size,
      });

      showSuccess('Photo uploaded successfully');
      setShowUploadModal(false);
      setUploadForm({
        patientId: '',
        category: 'clinical',
        photoType: 'clinical',
        bodyRegion: '',
        description: '',
        file: null,
        previewUrl: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAnnotations = async (annotations: any) => {
    if (!session || !selectedPhoto) return;

    try {
      await updatePhotoAnnotations(session.tenantId, session.accessToken, selectedPhoto.id, annotations);
      showSuccess('Annotations saved successfully');
      setShowAnnotateModal(false);
      setSelectedPhoto(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to save annotations');
    }
  };

  const handleCreateComparison = async () => {
    if (!session || selectedForComparison.length < 2) {
      showError('Please select at least 2 photos');
      return;
    }

    const firstPhoto = selectedForComparison[0];
    const groupName = `Comparison ${new Date().toLocaleDateString()}`;

    try {
      const result = await createComparisonGroup(session.tenantId, session.accessToken, {
        patientId: firstPhoto.patientId,
        name: groupName,
        description: `Comparison of ${selectedForComparison.length} photos`,
      });

      // Would need to update photos with comparison group ID here
      showSuccess('Comparison group created');
      setSelectedForComparison([]);
    } catch (err: any) {
      showError(err.message || 'Failed to create comparison');
    }
  };

  const togglePhotoSelection = (photo: Photo) => {
    setSelectedForComparison((prev) => {
      const exists = prev.find((p) => p.id === photo.id);
      if (exists) {
        return prev.filter((p) => p.id !== photo.id);
      } else {
        return [...prev, photo];
      }
    });
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getPhotoUrl = (photo: Photo) => {
    if (photo.storage === 's3' && photo.objectKey) {
      return `${API_BASE_URL}/api/photos/view/${photo.objectKey}`;
    }
    return photo.url;
  };

  const filteredPhotos = photos.filter((photo) => {
    if (categoryFilter !== 'all' && photo.category !== categoryFilter) return false;
    if (selectedPatient !== 'all' && photo.patientId !== selectedPatient) return false;
    if (searchTerm) {
      const patientName = getPatientName(photo.patientId).toLowerCase();
      const desc = (photo.description || '').toLowerCase();
      const region = (photo.bodyRegion || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !desc.includes(searchTerm.toLowerCase()) &&
        !region.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const getCategoryLabel = (category?: string) => {
    switch (category) {
      case 'dermoscopy':
        return 'Dermoscopy';
      case 'before-after':
        return 'Before/After';
      case 'clinical':
        return 'Clinical';
      default:
        return 'Other';
    }
  };

  if (loading) {
    return (
      <div className="photos-page">
        <div className="page-header">
          <h1>Clinical Photos</h1>
        </div>
        <Skeleton variant="card" height={60} />
        <div className="photo-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="card" height={200} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="photos-page">
      <div className="page-header">
        <h1>Clinical Photos</h1>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowUploadModal(true)}
        >
          + Upload Photo
        </button>
      </div>

      {/* Filters */}
      <div className="photos-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search photos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
          {(['all', 'clinical', 'dermoscopy', 'before-after', 'other'] as PhotoCategory[]).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                className={`filter-tab ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'all' ? 'All' : getCategoryLabel(cat)}
              </button>
            )
          )}
        </div>

        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            Grid
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            List
          </button>
          <button
            type="button"
            className={viewMode === 'timeline' ? 'active' : ''}
            onClick={() => setViewMode('timeline')}
            title="Timeline view"
          >
            Timeline
          </button>
          <button
            type="button"
            className={viewMode === 'comparison' ? 'active' : ''}
            onClick={() => setViewMode('comparison')}
            title="Comparison view"
            disabled={selectedForComparison.length < 2}
          >
            Compare ({selectedForComparison.length})
          </button>
        </div>
      </div>

      {/* Photos Display */}
      {filteredPhotos.length === 0 ? (
        <Panel title="">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h3>No photos found</h3>
            <p className="muted">
              {categoryFilter !== 'all' || selectedPatient !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload your first clinical photo'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowUploadModal(true)}
            >
              Upload Photo
            </button>
          </div>
        </Panel>
      ) : viewMode === 'timeline' ? (
        <PhotoTimeline
          photos={filteredPhotos}
          getPhotoUrl={getPhotoUrl}
          onPhotoClick={(photo) => {
            setSelectedPhoto(photo);
            setShowViewModal(true);
          }}
        />
      ) : viewMode === 'comparison' ? (
        <PhotoComparison photos={selectedForComparison} getPhotoUrl={getPhotoUrl} />
      ) : viewMode === 'grid' ? (
        <div className="photo-grid">
          {filteredPhotos.map((photo) => {
            const isSelected = selectedForComparison.find((p) => p.id === photo.id);
            return (
              <div
                key={photo.id}
                className={`photo-card ${isSelected ? 'selected' : ''}`}
              >
                <div
                  className="photo-thumbnail"
                  onClick={() => {
                    setSelectedPhoto(photo);
                    setShowViewModal(true);
                  }}
                >
                  <img
                    src={getPhotoUrl(photo)}
                    alt={photo.description || 'Clinical photo'}
                    loading="lazy"
                  />
                  <span className={`photo-category ${photo.category || photo.photoType}`}>
                    {getCategoryLabel(photo.category || photo.photoType)}
                  </span>
                  {photo.annotations && photo.annotations.shapes.length > 0 && (
                    <span className="photo-annotated-badge" title="Has annotations">
                      ✎
                    </span>
                  )}
                </div>
                <div className="photo-info">
                  <div className="photo-header">
                    <div className="photo-patient strong">
                      {getPatientName(photo.patientId)}
                    </div>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        togglePhotoSelection(photo);
                      }}
                      title="Select for comparison"
                    />
                  </div>
                  {(photo.bodyRegion || photo.bodyLocation) && (
                    <div className="photo-region muted tiny">
                      {photo.bodyLocation || photo.bodyRegion}
                    </div>
                  )}
                  <div className="photo-date muted tiny">
                    {new Date(photo.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="photo-list">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="photo-list-item"
              onClick={() => {
                setSelectedPhoto(photo);
                setShowViewModal(true);
              }}
            >
              <div className="photo-list-thumb">
                <img
                  src={getPhotoUrl(photo)}
                  alt={photo.description || 'Clinical photo'}
                  loading="lazy"
                />
              </div>
              <div className="photo-list-content">
                <div className="photo-list-header">
                  <span className="strong">{getPatientName(photo.patientId)}</span>
                  <span className={`pill ${photo.category}`}>
                    {getCategoryLabel(photo.category)}
                  </span>
                </div>
                {photo.bodyRegion && (
                  <div className="photo-region">{photo.bodyRegion}</div>
                )}
                {photo.description && (
                  <div className="photo-desc muted">{photo.description}</div>
                )}
                <div className="photo-meta muted tiny">
                  Uploaded: {new Date(photo.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        title="Upload Clinical Photo"
        onClose={() => {
          setShowUploadModal(false);
          setUploadForm({
            patientId: '',
            category: 'clinical',
            photoType: 'clinical',
            bodyRegion: '',
            description: '',
            file: null,
            previewUrl: '',
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
              <label>Photo Type</label>
              <select
                value={uploadForm.photoType}
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    photoType: e.target.value as PhotoType,
                  }))
                }
              >
                <option value="clinical">Clinical</option>
                <option value="before">Before Treatment</option>
                <option value="after">After Treatment</option>
                <option value="dermoscopy">Dermoscopy</option>
                <option value="baseline">Baseline</option>
              </select>
            </div>

            <div className="form-field">
              <label>Body Region</label>
              <select
                value={uploadForm.bodyRegion}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, bodyRegion: e.target.value }))
                }
              >
                <option value="">Select region...</option>
                {BODY_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={uploadForm.description}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Clinical notes about this photo..."
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>Photo *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {uploadForm.previewUrl ? (
              <div className="upload-preview">
                <img src={uploadForm.previewUrl} alt="Preview" />
                <button
                  type="button"
                  className="btn-sm btn-secondary"
                  onClick={() => {
                    setUploadForm((prev) => ({ ...prev, file: null, previewUrl: '' }));
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
                <p>Click to select an image</p>
                <p className="muted tiny">JPG, PNG, or HEIC supported</p>
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
            {uploading ? 'Uploading...' : 'Upload Photo'}
          </button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={showViewModal}
        title="Photo Details"
        onClose={() => {
          setShowViewModal(false);
          setSelectedPhoto(null);
        }}
        size="full"
      >
        {selectedPhoto && (
          <div className="photo-view-modal">
            <div className="photo-view-image">
              <img
                src={getPhotoUrl(selectedPhoto)}
                alt={selectedPhoto.description || 'Clinical photo'}
              />
            </div>
            <div className="photo-view-details">
              <div className="detail-row">
                <span className="label">Patient:</span>
                <span className="strong">{getPatientName(selectedPhoto.patientId)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Photo Type:</span>
                <span className={`pill ${selectedPhoto.photoType || selectedPhoto.category}`}>
                  {getCategoryLabel(selectedPhoto.photoType || selectedPhoto.category)}
                </span>
              </div>
              {(selectedPhoto.bodyRegion || selectedPhoto.bodyLocation) && (
                <div className="detail-row">
                  <span className="label">Body Location:</span>
                  <span>{selectedPhoto.bodyLocation || selectedPhoto.bodyRegion}</span>
                </div>
              )}
              {selectedPhoto.description && (
                <div className="detail-row">
                  <span className="label">Description:</span>
                  <span>{selectedPhoto.description}</span>
                </div>
              )}
              {selectedPhoto.annotations && selectedPhoto.annotations.shapes.length > 0 && (
                <div className="detail-row">
                  <span className="label">Annotations:</span>
                  <span>{selectedPhoto.annotations.shapes.length} annotations</span>
                </div>
              )}
              <div className="detail-row">
                <span className="label">Uploaded:</span>
                <span>{new Date(selectedPhoto.createdAt).toLocaleString()}</span>
              </div>

              <div className="photo-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowViewModal(false);
                    setShowAnnotateModal(true);
                  }}
                >
                  Annotate
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    togglePhotoSelection(selectedPhoto);
                    setShowViewModal(false);
                  }}
                >
                  {selectedForComparison.find((p) => p.id === selectedPhoto.id)
                    ? 'Remove from Comparison'
                    : 'Add to Comparison'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Annotate Modal */}
      <Modal
        isOpen={showAnnotateModal}
        title="Annotate Photo"
        onClose={() => {
          setShowAnnotateModal(false);
          setSelectedPhoto(null);
        }}
        size="full"
      >
        {selectedPhoto && (
          <PhotoAnnotator
            imageUrl={getPhotoUrl(selectedPhoto)}
            annotations={selectedPhoto.annotations}
            onSave={handleSaveAnnotations}
            onCancel={() => {
              setShowAnnotateModal(false);
              setSelectedPhoto(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
