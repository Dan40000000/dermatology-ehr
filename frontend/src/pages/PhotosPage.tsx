import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { PatientLookupSelect } from '../components/patients/PatientLookupSelect';
import {
  fetchPhotos,
  fetchPatients,
  createPhoto,
  uploadPhotoFile,
  updatePhotoMetadata,
  updatePhotoAnnotations,
  createComparisonGroup,
  getPresignedAccess,
  signUploadKey,
  API_BASE_URL,
} from '../api';
import type { Photo, Patient, PhotoType } from '../types';
import { PhotoAnnotator } from '../components/clinical/PhotoAnnotator';
import { PhotoComparison } from '../components/clinical/PhotoComparison';
import { PhotoTimeline } from '../components/clinical/PhotoTimeline';
import { ClinicalPhotoImage } from '../components/clinical/ClinicalPhotoImage';

type ViewMode = 'grid' | 'list' | 'timeline' | 'comparison';
type PhotoCategory = 'all' | 'clinical' | 'dermoscopy' | 'before-after' | 'other';
type PhotoFilter = 'all' | 'recent';
type PhotoWorkflowFilter = 'all' | 'needs-context' | 'needs-encounter' | 'compare-ready' | 'annotated';

interface PhotoContextFormState {
  photoType: PhotoType;
  category: Exclude<PhotoCategory, 'all'>;
  bodyLocation: string;
  description: string;
  encounterId: string;
}

const BODY_REGIONS = [
  'Face', 'Scalp', 'Neck', 'Chest', 'Back', 'Abdomen',
  'Upper Arm (L)', 'Upper Arm (R)', 'Forearm (L)', 'Forearm (R)',
  'Hand (L)', 'Hand (R)', 'Upper Leg (L)', 'Upper Leg (R)',
  'Lower Leg (L)', 'Lower Leg (R)', 'Foot (L)', 'Foot (R)', 'Other',
];

const createInitialUploadForm = () => ({
  patientId: '',
  category: 'clinical' as PhotoCategory,
  photoType: 'clinical' as PhotoType,
  bodyRegion: '',
  encounterId: '',
  description: '',
  file: null as File | null,
  previewUrl: '',
});

const defaultContextForm: PhotoContextFormState = {
  photoType: 'clinical',
  category: 'clinical',
  bodyLocation: '',
  description: '',
  encounterId: '',
};

const getLocalUploadKey = (photo: Photo) => {
  if (photo.objectKey) {
    return photo.objectKey;
  }
  if (!photo.url) {
    return null;
  }

  try {
    const path = photo.url.startsWith('http')
      ? new URL(photo.url).pathname
      : photo.url;
    const match = path.match(/\/(?:api\/)?uploads\/([^/?#]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Fall through to basic parsing below.
  }

  return null;
};

function getPhotoBodySite(photo: Photo): string {
  return (photo.bodyLocation || photo.bodyRegion || '').trim();
}

function photoHasBodySite(photo: Photo): boolean {
  return getPhotoBodySite(photo).length > 0;
}

function photoHasAnnotations(photo: Photo): boolean {
  return Boolean(photo.annotations?.shapes?.length);
}

function photoNeedsContext(photo: Photo): boolean {
  return !photoHasBodySite(photo) || !(photo.description || '').trim();
}

function photoNeedsEncounterLink(photo: Photo): boolean {
  return !photo.encounterId;
}

function isComparisonCandidate(photo: Photo, allPhotos: Photo[]): boolean {
  const type = photo.photoType || '';
  const category = photo.category || '';
  if (['before', 'after', 'baseline'].includes(type) || category === 'before-after') {
    return true;
  }

  const bodySite = getPhotoBodySite(photo).toLowerCase();
  if (!bodySite) return false;

  return allPhotos.some((candidate) => (
    candidate.id !== photo.id &&
    candidate.patientId === photo.patientId &&
    getPhotoBodySite(candidate).toLowerCase() === bodySite
  ));
}

function getPhotoTypeDisplay(photoType?: string): string {
  switch (photoType) {
    case 'before':
      return 'Before Treatment';
    case 'after':
      return 'After Treatment';
    case 'baseline':
      return 'Baseline';
    case 'dermoscopy':
      return 'Dermoscopy';
    case 'clinical':
      return 'Clinical';
    default:
      return 'Clinical';
  }
}

function getEffectivePhotoCategory(photo: Photo): Exclude<PhotoCategory, 'all'> {
  if (photo.category === 'clinical' || photo.category === 'dermoscopy' || photo.category === 'before-after' || photo.category === 'other') {
    return photo.category;
  }
  if (photo.photoType === 'dermoscopy') return 'dermoscopy';
  if (photo.photoType === 'before' || photo.photoType === 'after') return 'before-after';
  return 'clinical';
}

export function PhotosPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<PhotoCategory>('all');
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all');
  const [workflowFilter, setWorkflowFilter] = useState<PhotoWorkflowFilter>('all');
  const [selectedPatient, setSelectedPatient] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAnnotateModal, setShowAnnotateModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<Photo[]>([]);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<Record<string, string>>({});

  const [uploadForm, setUploadForm] = useState(createInitialUploadForm);
  const [contextForm, setContextForm] = useState<PhotoContextFormState>(defaultContextForm);

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

  useEffect(() => {
    if (!session || photos.length === 0) {
      setResolvedPhotoUrls({});
      return;
    }

    let cancelled = false;

    const resolvePhotoUrls = async () => {
      const urlEntries = await Promise.all(
        photos.map(async (photo) => {
          try {
            // Local uploads are served through signed /api/uploads URLs.
            const localUploadKey = getLocalUploadKey(photo);
            if (photo.storage === 'local' || (!photo.storage && localUploadKey)) {
              const key = localUploadKey;
              if (key) {
                const signed = await signUploadKey(session.tenantId, session.accessToken, key);
                const signedUrl = signed.url.startsWith('http')
                  ? signed.url
                  : `${API_BASE_URL}${signed.url}`;
                return [photo.id, signedUrl] as const;
              }
            }

            // For S3, prefer a fresh presigned URL when objectKey is available.
            if (photo.storage === 's3' && photo.objectKey) {
              if (photo.url && /^https?:\/\//.test(photo.url)) {
                return [photo.id, photo.url] as const;
              }
              try {
                const signed = await getPresignedAccess(
                  session.tenantId,
                  session.accessToken,
                  photo.objectKey
                );
                return [photo.id, signed.url] as const;
              } catch {
                // Fallback to persisted URL if presign lookup fails.
              }
            }

            if (photo.url?.startsWith('/')) {
              return [photo.id, `${API_BASE_URL}${photo.url}`] as const;
            }

            return [photo.id, photo.url] as const;
          } catch {
            return [photo.id, photo.url] as const;
          }
        })
      );

      if (!cancelled) {
        setResolvedPhotoUrls(
          Object.fromEntries(urlEntries.filter((entry): entry is [string, string] => Boolean(entry[1])))
        );
      }
    };

    resolvePhotoUrls();

    return () => {
      cancelled = true;
    };
  }, [photos, session]);

  // Handle URL query parameters on page load and changes
  useEffect(() => {
    const action = searchParams.get('action');
    const filter = searchParams.get('filter');
    const patientId = searchParams.get('patientId');
    const encounterId = searchParams.get('encounterId');
    const workflow = searchParams.get('workflow');
    const view = searchParams.get('view');
    const photoType = searchParams.get('photoType');

    if (action === 'upload') {
      setShowUploadModal(true);
    }

    if (filter === 'recent') {
      setPhotoFilter('recent');
    } else if (!filter) {
      setPhotoFilter('all');
    }

    if (patientId) {
      setSelectedPatient(patientId);
      setUploadForm((prev) => ({
        ...prev,
        patientId,
        encounterId: encounterId || prev.encounterId,
      }));
    } else {
      setSelectedPatient('all');
    }

    if (encounterId) {
      setUploadForm((prev) => ({ ...prev, encounterId }));
    }

    if (
      workflow === 'needs-context' ||
      workflow === 'needs-encounter' ||
      workflow === 'compare-ready' ||
      workflow === 'annotated'
    ) {
      setWorkflowFilter(workflow);
    } else if (!workflow) {
      setWorkflowFilter('all');
    }

    if (view === 'grid' || view === 'list' || view === 'timeline' || view === 'comparison') {
      setViewMode(view);
    }

    if (
      photoType === 'clinical' ||
      photoType === 'before' ||
      photoType === 'after' ||
      photoType === 'dermoscopy' ||
      photoType === 'baseline'
    ) {
      setUploadForm((prev) => ({ ...prev, photoType }));
    }
  }, [searchParams]);

  useEffect(
    () => () => {
      if (uploadForm.previewUrl) {
        URL.revokeObjectURL(uploadForm.previewUrl);
      }
    },
    [uploadForm.previewUrl]
  );

  const clearUploadActionParam = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('action');
    setSearchParams(newParams);
  };

  const clearSelectedUploadFile = () => {
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file: null, previewUrl: '' };
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    setIsUploadDragOver(false);
  };

  const resetUploadForm = () => {
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return createInitialUploadForm();
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    setIsUploadDragOver(false);
  };

  const applySelectedPhotoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file, previewUrl };
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      applySelectedPhotoFile(file);
    }
  };

  const handleUploadDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsUploadDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      applySelectedPhotoFile(file);
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
        encounterId: uploadForm.encounterId || undefined,
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
      resetUploadForm();
      // Remove action parameter from URL after successful upload
      clearUploadActionParam();
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

  const openContextEditor = (photo: Photo) => {
    setSelectedPhoto(photo);
    setContextForm({
      photoType: (photo.photoType || 'clinical') as PhotoType,
      category: getEffectivePhotoCategory(photo),
      bodyLocation: photo.bodyLocation || photo.bodyRegion || '',
      description: photo.description || '',
      encounterId: photo.encounterId || '',
    });
    setShowViewModal(false);
    setShowContextModal(true);
  };

  const handleSaveContext = async () => {
    if (!session || !selectedPhoto) return;

    setSavingContext(true);
    try {
      await updatePhotoMetadata(session.tenantId, session.accessToken, selectedPhoto.id, {
        encounterId: contextForm.encounterId.trim() || null,
        bodyLocation: contextForm.bodyLocation.trim() || null,
        bodyRegion: contextForm.bodyLocation.trim() || null,
        photoType: contextForm.photoType,
        category: contextForm.category,
        description: contextForm.description.trim() || null,
      });

      showSuccess('Photo clinical context updated');
      setShowContextModal(false);
      setSelectedPhoto(null);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update photo context');
    } finally {
      setSavingContext(false);
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
      await createComparisonGroup(session.tenantId, session.accessToken, {
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

  const getPatientDisplayName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.firstName} ${patient.lastName}` : 'Selected patient';
  };

  const getPhotoUrl = (photo: Photo) => {
    const resolvedUrl = resolvedPhotoUrls[photo.id];
    if (resolvedUrl) {
      return resolvedUrl;
    }
    if (photo.url?.startsWith('/')) {
      return `${API_BASE_URL}${photo.url}`;
    }
    return photo.url;
  };

  const navigateToPatientChart = (photo: Photo) => {
    navigate(`/patients/${photo.patientId}?tab=photos`);
  };

  const navigateToBodyMap = (photo: Photo) => {
    const params = new URLSearchParams({ patientId: photo.patientId });
    if (photo.encounterId) params.set('encounterId', photo.encounterId);
    params.set('source', 'photos');
    params.set('photoId', photo.id);
    navigate(`/body-diagram?${params.toString()}`);
  };

  const navigateToEncounter = (photo: Photo) => {
    if (!photo.encounterId) return;
    navigate(`/patients/${photo.patientId}/encounter/${photo.encounterId}`);
  };

  const setWorkflowAndParams = (next: PhotoWorkflowFilter) => {
    setWorkflowFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('workflow');
    } else {
      params.set('workflow', next);
    }
    setSearchParams(params);
  };

  const setSelectedPatientFilter = (patientId: string) => {
    setSelectedPatient(patientId);
    const params = new URLSearchParams(searchParams);
    if (!patientId || patientId === 'all') {
      params.delete('patientId');
    } else {
      params.set('patientId', patientId);
    }
    setSearchParams(params);
  };

  const setViewModeWithParams = (next: ViewMode) => {
    setViewMode(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'grid') {
      params.delete('view');
    } else {
      params.set('view', next);
    }
    setSearchParams(params);
  };

  const filteredPhotos = photos.filter((photo) => {
    if (categoryFilter !== 'all' && getEffectivePhotoCategory(photo) !== categoryFilter) return false;
    if (selectedPatient !== 'all' && photo.patientId !== selectedPatient) return false;

    if (workflowFilter === 'needs-context' && !photoNeedsContext(photo)) return false;
    if (workflowFilter === 'needs-encounter' && !photoNeedsEncounterLink(photo)) return false;
    if (workflowFilter === 'compare-ready' && !isComparisonCandidate(photo, photos)) return false;
    if (workflowFilter === 'annotated' && !photoHasAnnotations(photo)) return false;

    // Filter by recent (photos from last 30 days)
    if (photoFilter === 'recent') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const photoDate = new Date(photo.createdAt);
      if (photoDate < thirtyDaysAgo) return false;
    }

    if (searchTerm) {
      const patientName = getPatientName(photo.patientId).toLowerCase();
      const desc = (photo.description || '').toLowerCase();
      const region = getPhotoBodySite(photo).toLowerCase();
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

  const openUploadModal = () => {
    setShowUploadModal(true);
    const next = new URLSearchParams(searchParams);
    next.set('action', 'upload');
    setSearchParams(next);
  };

  const totalPhotos = photos.length;
  const recentPhotosCount = photos.filter((photo) => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    return new Date(photo.createdAt) >= threshold;
  }).length;
  const needsContextCount = photos.filter(photoNeedsContext).length;
  const needsEncounterCount = photos.filter(photoNeedsEncounterLink).length;
  const bodySiteTaggedCount = photos.filter(photoHasBodySite).length;
  const compareReadyCount = photos.filter((photo) => isComparisonCandidate(photo, photos)).length;
  const annotatedPhotosCount = photos.filter(photoHasAnnotations).length;
  const selectedPatientName = selectedPatient !== 'all' ? getPatientDisplayName(selectedPatient) : '';

  const workflowCards: Array<{
    key: PhotoWorkflowFilter;
    label: string;
    count: number;
    detail: string;
  }> = [
    {
      key: 'needs-context',
      label: 'Needs Context',
      count: needsContextCount,
      detail: 'Missing body site or clinical note',
    },
    {
      key: 'needs-encounter',
      label: 'Needs Chart Link',
      count: needsEncounterCount,
      detail: 'No encounter attached',
    },
    {
      key: 'compare-ready',
      label: 'Ready to Compare',
      count: compareReadyCount,
      detail: 'Before/after, baseline, or repeated site',
    },
    {
      key: 'annotated',
      label: 'Annotated',
      count: annotatedPhotosCount,
      detail: 'Has markup saved',
    },
  ];

  if (loading) {
    return (
      <div className="photos-page">
        <div className="page-header">
          <h1>Clinical Photos & Imaging</h1>
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
      <div className="photos-hero">
        <div>
          <h1>Clinical Photos & Imaging</h1>
          <p className="muted">Capture, tag, compare, and route clinical images back into the patient chart.</p>
          <div className="photos-hero-metrics">
            <span>{recentPhotosCount} recent</span>
            <span>{needsEncounterCount} need encounter link</span>
            <span>{selectedForComparison.length} selected</span>
          </div>
          {selectedPatientName && (
            <div className="photos-patient-scope">
              Viewing {selectedPatientName}
              <button type="button" onClick={() => navigate(`/patients/${selectedPatient}?tab=photos`)}>
                Open Chart
              </button>
              <button type="button" onClick={() => navigate(`/body-diagram?patientId=${selectedPatient}&source=photos`)}>
                Body Map
              </button>
            </div>
          )}
        </div>
        <div className="photos-hero-actions">
          {selectedForComparison.length >= 2 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCreateComparison}
            >
              Save Comparison Group
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={openUploadModal}
          >
            + Upload Photo
          </button>
        </div>
      </div>

      <div className="photos-kpi-row">
        <div className="photos-kpi-card">
          <div className="photos-kpi-label">Total Photos</div>
          <div className="photos-kpi-value">{totalPhotos}</div>
        </div>
        <div className="photos-kpi-card">
          <div className="photos-kpi-label">Needs Context</div>
          <div className="photos-kpi-value">{needsContextCount}</div>
        </div>
        <div className="photos-kpi-card">
          <div className="photos-kpi-label">Body Site Tagged</div>
          <div className="photos-kpi-value">{bodySiteTaggedCount}</div>
        </div>
        <div className="photos-kpi-card">
          <div className="photos-kpi-label">Ready to Compare</div>
          <div className="photos-kpi-value">{compareReadyCount}</div>
        </div>
      </div>

      <div className="photos-workflow-row">
        {workflowCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`photos-workflow-card ${workflowFilter === card.key ? 'active' : ''}`}
            onClick={() => setWorkflowAndParams(workflowFilter === card.key ? 'all' : card.key)}
          >
            <span>
              <strong>{card.count}</strong>
              {card.label}
            </span>
            <small>{card.detail}</small>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="photos-toolbar">
        <div className="photos-toolbar-main">
          <div className="photos-search">
            <label htmlFor="photos-search" className="sr-only">Search photos</label>
            <span className="photos-search-icon" aria-hidden="true">🔍</span>
            <input
              id="photos-search"
              type="text"
              placeholder="Search patient, body region, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="photos-field">
            <PatientLookupSelect
              id="photos-patient-filter"
              patients={patients}
              value={selectedPatient}
              onChange={setSelectedPatientFilter}
              label="Patient"
              includeAllOption
              allValue="all"
              compact
            />
          </div>

          <div className="photos-field">
            <label htmlFor="photos-time-filter">Time</label>
            <select
              id="photos-time-filter"
              value={photoFilter}
              onChange={(e) => {
                const newFilter = e.target.value as PhotoFilter;
                setPhotoFilter(newFilter);
                const params = new URLSearchParams(searchParams);
                if (newFilter === 'recent') {
                  params.set('filter', 'recent');
                } else {
                  params.delete('filter');
                }
                setSearchParams(params);
              }}
            >
              <option value="all">All Photos</option>
              <option value="recent">Recent (30 days)</option>
            </select>
          </div>
        </div>

        <div className="photos-toolbar-bottom">
          <div className="filter-tabs photos-category-tabs">
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

          <div className="view-toggle photos-view-toggle">
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewModeWithParams('grid')}
                title="Grid view"
              >
              Grid
            </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewModeWithParams('list')}
                title="List view"
              >
              List
            </button>
              <button
                type="button"
                className={viewMode === 'timeline' ? 'active' : ''}
                onClick={() => setViewModeWithParams('timeline')}
                title="Timeline view"
              >
              Timeline
            </button>
              <button
                type="button"
                className={viewMode === 'comparison' ? 'active' : ''}
                onClick={() => setViewModeWithParams('comparison')}
                title="Comparison view"
              disabled={selectedForComparison.length < 2}
            >
              Compare ({selectedForComparison.length})
            </button>
          </div>
        </div>

        {selectedForComparison.length > 0 && (
          <div className="photos-selection-chip">
            {selectedForComparison.length} selected for comparison
          </div>
        )}
        {(workflowFilter !== 'all' || photoFilter !== 'all' || selectedPatient !== 'all' || categoryFilter !== 'all' || searchTerm) && (
          <div className="photos-filter-status">
            Showing {filteredPhotos.length} of {photos.length} photos
            <button
              type="button"
              onClick={() => {
                setWorkflowFilter('all');
                setPhotoFilter('all');
                setSelectedPatient('all');
                setCategoryFilter('all');
                setSearchTerm('');
                setSearchParams(new URLSearchParams());
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Photos Display */}
      {filteredPhotos.length === 0 ? (
        <Panel title="">
          <div className="empty-state photos-empty-state">
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
              onClick={openUploadModal}
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
            const needsContext = photoNeedsContext(photo);
            const needsEncounter = photoNeedsEncounterLink(photo);
            const compareCandidate = isComparisonCandidate(photo, photos);
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
                  <ClinicalPhotoImage
                    src={getPhotoUrl(photo)}
                    alt={photo.description || 'Clinical photo'}
                    loading="lazy"
                  />
                  <span className={`photo-category ${getEffectivePhotoCategory(photo)}`}>
                    {getCategoryLabel(getEffectivePhotoCategory(photo))}
                  </span>
                  {photo.annotations && photo.annotations.shapes.length > 0 && (
                    <span className="photo-annotated-badge" title="Has annotations">
                      Annotated
                    </span>
                  )}
                </div>
                <div className="photo-info">
                  <div className="photo-header">
                    <div className="photo-patient strong">
                      {getPatientName(photo.patientId)}
                    </div>
                    <button
                      type="button"
                      className={`photo-compare-btn ${isSelected ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePhotoSelection(photo);
                      }}
                    >
                      {isSelected ? 'Selected' : 'Compare'}
                    </button>
                  </div>
                  {(photo.bodyRegion || photo.bodyLocation) && (
                    <div className="photo-region muted tiny">
                      {photo.bodyLocation || photo.bodyRegion}
                    </div>
                  )}
                  <div className="photo-date muted tiny">
                    {new Date(photo.createdAt).toLocaleDateString()}
                  </div>
                  {photo.description && (
                    <div className="photo-desc muted tiny">{photo.description}</div>
                  )}
                  <div className="photo-workflow-badges">
                    {needsContext && <span className="warning">Needs context</span>}
                    {needsEncounter && <span>Needs chart link</span>}
                    {compareCandidate && <span>Compare-ready</span>}
                  </div>
                  <div className="photo-card-actions">
                    <button type="button" onClick={() => openContextEditor(photo)}>
                      Context
                    </button>
                    <button type="button" onClick={() => navigateToPatientChart(photo)}>
                      Chart
                    </button>
                    <button type="button" onClick={() => navigateToBodyMap(photo)}>
                      Body Map
                    </button>
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
                <ClinicalPhotoImage
                  src={getPhotoUrl(photo)}
                  alt={photo.description || 'Clinical photo'}
                  loading="lazy"
                />
              </div>
              <div className="photo-list-content">
                <div className="photo-list-header">
                  <span className="strong">{getPatientName(photo.patientId)}</span>
                  <span className={`pill ${getEffectivePhotoCategory(photo)}`}>
                    {getCategoryLabel(getEffectivePhotoCategory(photo))}
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
              <div className="photo-list-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`photo-compare-btn ${selectedForComparison.some((p) => p.id === photo.id) ? 'active' : ''}`}
                  onClick={() => togglePhotoSelection(photo)}
                >
                  {selectedForComparison.some((p) => p.id === photo.id) ? 'Selected' : 'Compare'}
                </button>
                <button type="button" className="photo-compare-btn" onClick={() => openContextEditor(photo)}>
                  Context
                </button>
                <button type="button" className="photo-compare-btn" onClick={() => navigateToPatientChart(photo)}>
                  Chart
                </button>
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
          resetUploadForm();
          // Remove action parameter from URL when closing
          clearUploadActionParam();
        }}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-field">
            <PatientLookupSelect
              patients={patients}
              value={uploadForm.patientId}
              onChange={(patientId) => setUploadForm((prev) => ({ ...prev, patientId }))}
              label="Patient"
              required
            />
          </div>

          {uploadForm.encounterId && (
            <div className="photos-context-note">
              This photo will be attached to encounter {uploadForm.encounterId}.
            </div>
          )}

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
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
                    clearSelectedUploadFile();
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                className={`upload-dropzone ${isUploadDragOver ? 'drag-active' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={() => setIsUploadDragOver(true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsUploadDragOver(true);
                }}
                onDragLeave={() => setIsUploadDragOver(false)}
                onDrop={handleUploadDrop}
              >
                <div className="upload-icon"></div>
                <p>Drag and drop an image here</p>
                <p className="muted tiny">JPG, PNG, or HEIC supported</p>
                <div className="upload-dropzone-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Browse Files
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                  >
                    Take Photo
                  </button>
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
              setShowUploadModal(false);
              resetUploadForm();
              clearUploadActionParam();
            }}
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
              <ClinicalPhotoImage
                src={getPhotoUrl(selectedPhoto)}
                alt={selectedPhoto.description || 'Clinical photo'}
                loading="eager"
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
                  {getPhotoTypeDisplay(selectedPhoto.photoType || selectedPhoto.category)}
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
              <div className="detail-row">
                <span className="label">Chart Link:</span>
                <span>{selectedPhoto.encounterId ? `Encounter ${selectedPhoto.encounterId}` : 'No encounter attached'}</span>
              </div>

              <div className="photo-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openContextEditor(selectedPhoto)}
                >
                  Edit Context
                </button>
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
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigateToPatientChart(selectedPhoto)}
                >
                  Patient Chart
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigateToBodyMap(selectedPhoto)}
                >
                  Body Map
                </button>
                {selectedPhoto.encounterId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigateToEncounter(selectedPhoto)}
                  >
                    Encounter Note
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Context Modal */}
      <Modal
        isOpen={showContextModal}
        title="Photo Clinical Context"
        onClose={() => {
          setShowContextModal(false);
          setSelectedPhoto(null);
        }}
        size="lg"
      >
        {selectedPhoto && (
          <>
            <div className="modal-form">
              <div className="photos-context-note">
                {getPatientDisplayName(selectedPhoto.patientId)} • {new Date(selectedPhoto.createdAt).toLocaleDateString()}
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Photo Type</label>
                  <select
                    value={contextForm.photoType}
                    onChange={(e) => setContextForm((prev) => ({ ...prev, photoType: e.target.value as PhotoType }))}
                  >
                    <option value="clinical">Clinical</option>
                    <option value="baseline">Baseline</option>
                    <option value="before">Before Treatment</option>
                    <option value="after">After Treatment</option>
                    <option value="dermoscopy">Dermoscopy</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Category</label>
                  <select
                    value={contextForm.category}
                    onChange={(e) =>
                      setContextForm((prev) => ({
                        ...prev,
                        category: e.target.value as Exclude<PhotoCategory, 'all'>,
                      }))
                    }
                  >
                    <option value="clinical">Clinical</option>
                    <option value="dermoscopy">Dermoscopy</option>
                    <option value="before-after">Before/After</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Body Site</label>
                  <select
                    value={contextForm.bodyLocation}
                    onChange={(e) => setContextForm((prev) => ({ ...prev, bodyLocation: e.target.value }))}
                  >
                    <option value="">Select region...</option>
                    {BODY_REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Encounter ID</label>
                  <input
                    type="text"
                    value={contextForm.encounterId}
                    onChange={(e) => setContextForm((prev) => ({ ...prev, encounterId: e.target.value }))}
                    placeholder="Optional encounter link"
                  />
                </div>
              </div>

              <div className="form-field">
                <label>Clinical Description</label>
                <textarea
                  value={contextForm.description}
                  onChange={(e) => setContextForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Example: baseline left cheek inflammatory papules before isotretinoin start"
                  rows={4}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowContextModal(false);
                  setSelectedPhoto(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingContext}
                onClick={handleSaveContext}
              >
                {savingContext ? 'Saving...' : 'Save Context'}
              </button>
            </div>
          </>
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
