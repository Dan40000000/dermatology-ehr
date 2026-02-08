import React, { useState, useEffect } from 'react';
import {
  Camera,
  Upload,
  Image as ImageIcon,
  TrendingUp,
  MapPin,
  Filter,
  Download,
  FileText,
  Grid3x3,
} from 'lucide-react';
import { PhotoCapture, type CaptureMetadata } from '../components/Photos/PhotoCapture';
import { PhotoGallery, type Photo } from '../components/Photos/PhotoGallery';
import { BeforeAfterSlider } from '../components/Photos/BeforeAfterSlider';
import { PhotoTimeline } from '../components/Photos/PhotoTimeline';
import { PhotoAnnotation } from '../components/Photos/PhotoAnnotation';
import { PhotoUpload } from '../components/Photos/PhotoUpload';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../utils/apiBase';

/**
 * PatientPhotosPage - Main patient photo management page
 *
 * Features:
 * - All photos organized by region
 * - Quick comparison tools
 * - Export for patient
 * - Camera capture, upload, timeline, and annotation
 */

interface PatientPhotosPageProps {
  patientId: string;
  patientName: string;
}

type ViewMode = 'gallery' | 'timeline' | 'comparisons';

export function PatientPhotosPage({ patientId, patientName }: PatientPhotosPageProps) {
  const { session } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  // Modal states
  const [showCapture, setShowCapture] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [comparePhotos, setComparePhotos] = useState<{ before: Photo; after: Photo } | null>(null);
  const [annotatePhoto, setAnnotatePhoto] = useState<Photo | null>(null);

  // Stats
  const [stats, setStats] = useState<{
    totalCount: number;
    totalSizeMB: number;
    byRegion: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (session) {
      fetchPhotos();
      fetchStats();
    }
  }, [patientId, session]);

  const fetchPhotos = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/photos`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch photos');
      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error('Error fetching photos:', error);
      toast.error('Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/photos/stats`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCapture = async (file: File, metadata: CaptureMetadata) => {
    if (!session) return;
    try {
      const formData = new FormData();
      formData.append('photos', file);
      formData.append(
        'metadata',
        JSON.stringify({
          patientId,
          ...metadata,
        })
      );

      const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/photos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      toast.success('Photo captured successfully');
      fetchPhotos();
      fetchStats();
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to save photo');
      throw error;
    }
  };

  const handleUpload = async (files: File[], metadata: any) => {
    if (!session) return;
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));
      formData.append(
        'metadata',
        JSON.stringify({
          patientId,
          ...metadata,
        })
      );

      const response = await fetch(`${API_BASE}/api/patients/${patientId}/photos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      toast.success(`${files.length} photo(s) uploaded successfully`);
      fetchPhotos();
      fetchStats();
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload photos');
      throw error;
    }
  };

  const handleCompare = (beforeId: string, afterId: string) => {
    const before = photos.find((p) => p.id === beforeId);
    const after = photos.find((p) => p.id === afterId);

    if (before && after) {
      setComparePhotos({ before, after });
      setShowComparison(true);
    }
  };

  const handlePhotoClick = (photo: Photo) => {
    // Open photo detail/annotation view
    setAnnotatePhoto(photo);
    setShowAnnotation(true);
  };

  const handleSaveAnnotations = async (annotations: any) => {
    if (!annotatePhoto || !session) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/patients/${patientId}/photos/${annotatePhoto.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
          body: JSON.stringify({ annotations }),
        }
      );

      if (!response.ok) throw new Error('Failed to save annotations');

      toast.success('Annotations saved');
      setShowAnnotation(false);
      fetchPhotos();
    } catch (error) {
      console.error('Error saving annotations:', error);
      toast.error('Failed to save annotations');
    }
  };

  const handleDelete = async (photoIds: string[]) => {
    if (!session) return;
    try {
      await Promise.all(
        photoIds.map((id) =>
          fetch(`${API_BASE}/api/patients/${patientId}/photos/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              'x-tenant-id': session.tenantId,
            },
          })
        )
      );

      toast.success(`${photoIds.length} photo(s) deleted`);
      fetchPhotos();
      fetchStats();
    } catch (error) {
      console.error('Error deleting photos:', error);
      toast.error('Failed to delete photos');
    }
  };

  const handleDownload = (photoIds: string[]) => {
    // In a real implementation, this would trigger downloads
    toast.success(`Downloading ${photoIds.length} photo(s)...`);
  };

  const handleExportForPatient = async () => {
    try {
      // Export photos that are marked for patient sharing
      const sharedPhotos = photos.filter((p) => p.share_with_patient);
      toast.success(`Exporting ${sharedPhotos.length} photos for patient portal`);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export photos');
    }
  };

  // Get photos by region for timeline view
  const photosByRegion = selectedRegion
    ? photos.filter((p) => p.body_region === selectedRegion)
    : [];

  // Get unique regions
  const regions = [...new Set(photos.map((p) => p.body_region))];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Patient Photos - {patientName}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Clinical photography for treatment documentation and progress tracking
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCapture(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Take Photo
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Upload
              </button>
              {photos.length > 0 && (
                <button
                  onClick={handleExportForPatient}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Export
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">Total Photos</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{stats.totalCount}</div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <MapPin className="w-5 h-5" />
                  <span className="text-sm font-medium">Body Regions</span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {Object.keys(stats.byRegion).length}
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 text-purple-600 mb-1">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm font-medium">Comparisons</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {/* This would come from API */}
                  0
                </div>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2 text-orange-600 mb-1">
                  <FileText className="w-5 h-5" />
                  <span className="text-sm font-medium">Storage Used</span>
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  {stats.totalSizeMB.toFixed(1)} MB
                </div>
              </div>
            </div>
          )}
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1 flex">
          <button
            onClick={() => setViewMode('gallery')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'gallery'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Grid3x3 className="w-5 h-5 inline mr-2" />
            Gallery View
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Timeline View
          </button>
          <button
            onClick={() => setViewMode('comparisons')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'comparisons'
                ? 'bg-blue-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Before/After
          </button>
        </div>

        {/* Content */}
        {viewMode === 'gallery' && (
          <PhotoGallery
            photos={photos}
            onPhotoClick={handlePhotoClick}
            onDelete={handleDelete}
            onDownload={handleDownload}
            loading={loading}
            selectionMode={true}
          />
        )}

        {viewMode === 'timeline' && (
          <div className="space-y-4">
            {/* Region Selector */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Body Region for Timeline
              </label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Choose a region...</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region} ({stats?.byRegion[region] || 0} photos)
                  </option>
                ))}
              </select>
            </div>

            {selectedRegion ? (
              <PhotoTimeline
                photos={photosByRegion}
                bodyRegion={selectedRegion}
                onCompare={handleCompare}
                onAddPhoto={() => setShowCapture(true)}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
                Select a body region to view timeline
              </div>
            )}
          </div>
        )}

        {viewMode === 'comparisons' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              No comparisons yet. Select two photos from the Gallery or Timeline view to
              create a before/after comparison.
            </p>
            <button
              onClick={() => setViewMode('gallery')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Gallery
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCapture && (
        <PhotoCapture
          onCapture={handleCapture}
          onClose={() => setShowCapture(false)}
          patientId={patientId}
        />
      )}

      {showUpload && (
        <PhotoUpload
          onUpload={handleUpload}
          onClose={() => setShowUpload(false)}
          patientId={patientId}
        />
      )}

      {showComparison && comparePhotos && (
        <BeforeAfterSlider
          beforePhoto={comparePhotos.before}
          afterPhoto={comparePhotos.after}
          onClose={() => {
            setShowComparison(false);
            setComparePhotos(null);
          }}
        />
      )}

      {showAnnotation && annotatePhoto && (
        <PhotoAnnotation
          photoUrl={annotatePhoto.file_path}
          existingAnnotations={annotatePhoto.annotations as any}
          onSave={handleSaveAnnotations}
          onClose={() => {
            setShowAnnotation(false);
            setAnnotatePhoto(null);
          }}
        />
      )}
    </div>
  );
}
