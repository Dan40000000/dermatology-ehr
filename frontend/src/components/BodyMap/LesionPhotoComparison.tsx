import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Calendar, Maximize2 } from 'lucide-react';

interface Photo {
  id: string;
  url?: string;
  file_path?: string;
  thumbnail_path?: string;
  created_at: string;
  photo_type: string;
  notes?: string;
  uploaded_by_name?: string;
}

interface LesionPhotoComparisonProps {
  lesionId: string;
  patientId: string;
}

export function LesionPhotoComparison({ lesionId, patientId }: LesionPhotoComparisonProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedBefore, setSelectedBefore] = useState<Photo | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<Photo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [lesionId]);

  useEffect(() => {
    if (photos.length >= 2 && !selectedBefore && !selectedAfter) {
      // Auto-select first and last photos for comparison
      setSelectedBefore(photos[photos.length - 1]); // Oldest
      setSelectedAfter(photos[0]); // Newest
    }
  }, [photos]);

  const fetchPhotos = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/lesions/${lesionId}/photos`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculateDaysBetween = (date1: string, date2: string) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percentage)));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">📷</div>
        <p>No photos available for comparison</p>
        <p className="text-sm mt-1">Take photos to track lesion progression</p>
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">📷</div>
        <p>Only one photo available</p>
        <p className="text-sm mt-1">Take more photos to enable comparisons</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Photo Selection */}
      <div className="grid grid-cols-2 gap-4">
        {/* Before Photo Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Before (Baseline)
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {photos.map((photo) => (
              <button
                key={`before-${photo.id}`}
                onClick={() => setSelectedBefore(photo)}
                className={`w-full p-2 border rounded-lg text-left transition-all ${
                  selectedBefore?.id === photo.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {formatDate(photo.created_at)}
                    </div>
                    {photo.notes && (
                      <div className="text-xs text-gray-500 truncate">{photo.notes}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* After Photo Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            After (Current)
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {photos.map((photo) => (
              <button
                key={`after-${photo.id}`}
                onClick={() => setSelectedAfter(photo)}
                className={`w-full p-2 border rounded-lg text-left transition-all ${
                  selectedAfter?.id === photo.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {formatDate(photo.created_at)}
                    </div>
                    {photo.notes && (
                      <div className="text-xs text-gray-500 truncate">{photo.notes}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison View */}
      {selectedBefore && selectedAfter && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium text-purple-900">Time between photos:</span>{' '}
                <span className="text-purple-700">
                  {calculateDaysBetween(selectedBefore.created_at, selectedAfter.created_at)} days
                </span>
              </div>
              <ArrowLeftRight className="w-5 h-5 text-purple-600" />
            </div>
          </div>

          {/* Slider Comparison */}
          <div
            className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden cursor-ew-resize select-none"
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onMouseMove={handleMouseMove}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            onTouchMove={handleTouchMove}
          >
            {/* After Image (full width) */}
            <img
              src={selectedAfter.url || selectedAfter.file_path}
              alt="After"
              className="absolute inset-0 w-full h-full object-contain"
            />

            {/* Before Image (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={selectedBefore.url || selectedBefore.file_path}
                alt="Before"
                className="absolute inset-0 w-full h-full object-contain"
                style={{ width: `${(100 / sliderPosition) * 100}%` }}
              />
            </div>

            {/* Slider Line */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                <ArrowLeftRight className="w-4 h-4 text-purple-600" />
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
              Before: {formatDate(selectedBefore.created_at)}
            </div>
            <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
              After: {formatDate(selectedAfter.created_at)}
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center text-sm text-gray-500">
            Drag the slider to compare photos
          </div>

          {/* Side by Side View */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Before</div>
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={selectedBefore.url || selectedBefore.file_path}
                  alt="Before"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(selectedBefore.created_at)}
                {selectedBefore.uploaded_by_name && (
                  <span className="ml-2">by {selectedBefore.uploaded_by_name}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">After</div>
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={selectedAfter.url || selectedAfter.file_path}
                  alt="After"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(selectedAfter.created_at)}
                {selectedAfter.uploaded_by_name && (
                  <span className="ml-2">by {selectedAfter.uploaded_by_name}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
