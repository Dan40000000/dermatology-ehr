import React, { useState } from 'react';
import {
  Grid,
  List,
  Filter,
  Calendar,
  MapPin,
  Tag,
  Trash2,
  Archive,
  Download,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { format } from 'date-fns';

/**
 * PhotoGallery Component
 *
 * Features:
 * - Grid view of all patient photos
 * - Filter by body region, date, type
 * - Sort by date (newest/oldest)
 * - Select multiple for comparison
 * - Delete/archive options
 */

export interface Photo {
  id: string;
  patient_id: string;
  file_path: string;
  thumbnail_path: string | null;
  body_region: string;
  photo_type: string;
  taken_at: string;
  taken_by_name?: string;
  notes?: string;
  clinical_findings?: string;
  width: number;
  height: number;
}

interface PhotoGalleryProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  onPhotoSelect?: (photoIds: string[]) => void;
  onDelete?: (photoIds: string[]) => void;
  onDownload?: (photoIds: string[]) => void;
  loading?: boolean;
  selectionMode?: boolean;
}

type ViewMode = 'grid' | 'list';
type SortOrder = 'newest' | 'oldest';

const BODY_REGION_LABELS: Record<string, string> = {
  face: 'Face',
  chest: 'Chest',
  back: 'Back',
  arm_left: 'Left Arm',
  arm_right: 'Right Arm',
  leg_left: 'Left Leg',
  leg_right: 'Right Leg',
  hand_left: 'Left Hand',
  hand_right: 'Right Hand',
  foot_left: 'Left Foot',
  foot_right: 'Right Foot',
  abdomen: 'Abdomen',
  neck: 'Neck',
  scalp: 'Scalp',
  other: 'Other',
};

const PHOTO_TYPE_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  cosmetic: 'Cosmetic',
  baseline: 'Baseline',
  followup: 'Follow-up',
  consent: 'Consent',
  dermoscopic: 'Dermoscopic',
  other: 'Other',
};

export function PhotoGallery({
  photos,
  onPhotoClick,
  onPhotoSelect,
  onDelete,
  onDownload,
  loading = false,
  selectionMode = false,
}: PhotoGalleryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [filterRegion, setFilterRegion] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort photos
  const filteredPhotos = photos
    .filter((photo) => {
      if (filterRegion && photo.body_region !== filterRegion) return false;
      if (filterType && photo.photo_type !== filterType) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.taken_at).getTime();
      const dateB = new Date(b.taken_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  // Get unique regions and types from photos
  const availableRegions = [...new Set(photos.map((p) => p.body_region))];
  const availableTypes = [...new Set(photos.map((p) => p.photo_type))];

  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
    onPhotoSelect?.(Array.from(newSelected));
  };

  const selectAll = () => {
    const allIds = filteredPhotos.map((p) => p.id);
    setSelectedPhotos(new Set(allIds));
    onPhotoSelect?.(allIds);
  };

  const clearSelection = () => {
    setSelectedPhotos(new Set());
    onPhotoSelect?.([]);
  };

  const handleDelete = () => {
    if (selectedPhotos.size === 0) return;
    if (confirm(`Delete ${selectedPhotos.size} photo(s)?`)) {
      onDelete?.(Array.from(selectedPhotos));
      clearSelection();
    }
  };

  const handleDownload = () => {
    if (selectedPhotos.size === 0) return;
    onDownload?.(Array.from(selectedPhotos));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${
                  viewMode === 'grid'
                    ? 'bg-white shadow-sm text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${
                  viewMode === 'list'
                    ? 'bg-white shadow-sm text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            {/* Sort Order */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>

            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="w-5 h-5" />
              Filters
              {(filterRegion || filterType) && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {(filterRegion ? 1 : 0) + (filterType ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {/* Selection Actions */}
          {selectionMode && selectedPhotos.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedPhotos.size} selected
              </span>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={clearSelection}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {selectionMode && selectedPhotos.size === 0 && (
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:underline"
            >
              Select All
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Body Region
              </label>
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Regions</option>
                {availableRegions.map((region) => (
                  <option key={region} value={region}>
                    {BODY_REGION_LABELS[region] || region}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Photo Type
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {PHOTO_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilterRegion('');
                  setFilterType('');
                }}
                className="w-full px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredPhotos.length} of {photos.length} photos
      </div>

      {/* Photos Grid/List */}
      {filteredPhotos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No photos found</p>
          {(filterRegion || filterType) && (
            <button
              onClick={() => {
                setFilterRegion('');
                setFilterType('');
              }}
              className="mt-2 text-blue-600 hover:underline"
            >
              Clear filters to see all photos
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="group relative bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                if (selectionMode) {
                  togglePhotoSelection(photo.id);
                } else {
                  onPhotoClick(photo);
                }
              }}
            >
              {/* Selection Checkbox */}
              {selectionMode && (
                <div className="absolute top-2 left-2 z-10">
                  <div className="bg-white rounded shadow-sm p-1">
                    {selectedPhotos.has(photo.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              )}

              {/* Photo */}
              <div className="aspect-square bg-gray-100">
                <img
                  src={photo.thumbnail_path || photo.file_path}
                  alt={`${BODY_REGION_LABELS[photo.body_region]} - ${format(
                    new Date(photo.taken_at),
                    'MMM d, yyyy'
                  )}`}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info */}
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span className="font-medium">
                    {BODY_REGION_LABELS[photo.body_region] || photo.body_region}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(photo.taken_at), 'MMM d, yyyy')}
                </div>
                {photo.photo_type !== 'clinical' && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Tag className="w-3 h-3" />
                    {PHOTO_TYPE_LABELS[photo.photo_type] || photo.photo_type}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-4"
              onClick={() => {
                if (selectionMode) {
                  togglePhotoSelection(photo.id);
                } else {
                  onPhotoClick(photo);
                }
              }}
            >
              {/* Selection Checkbox */}
              {selectionMode && (
                <div>
                  {selectedPhotos.has(photo.id) ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              )}

              {/* Thumbnail */}
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                <img
                  src={photo.thumbnail_path || photo.file_path}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {BODY_REGION_LABELS[photo.body_region] || photo.body_region}
                  </span>
                  <span className="text-sm text-gray-500">
                    {PHOTO_TYPE_LABELS[photo.photo_type] || photo.photo_type}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {format(new Date(photo.taken_at), 'MMM d, yyyy h:mm a')}
                  {photo.taken_by_name && ` • by ${photo.taken_by_name}`}
                </div>
                {photo.notes && (
                  <p className="text-sm text-gray-500 mt-1 truncate">
                    {photo.notes}
                  </p>
                )}
              </div>

              {/* Dimensions */}
              <div className="text-sm text-gray-500">
                {photo.width} x {photo.height}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
