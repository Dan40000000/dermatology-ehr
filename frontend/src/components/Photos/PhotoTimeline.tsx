import React, { useState } from 'react';
import { Calendar, Clock, User, FileText, Plus, ArrowRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { Photo } from './PhotoGallery';

/**
 * PhotoTimeline Component
 *
 * Features:
 * - Timeline view of photos for same location
 * - Visual progression over time
 * - Click to compare any two photos
 * - Treatment annotations (what was done between photos)
 */

interface PhotoTimelineProps {
  photos: Photo[];
  bodyRegion: string;
  onCompare: (beforeId: string, afterId: string) => void;
  onAddPhoto?: () => void;
}

interface TreatmentAnnotation {
  id: string;
  fromPhotoId: string;
  toPhotoId: string;
  description: string;
  treatmentDate?: string;
}

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

export function PhotoTimeline({
  photos,
  bodyRegion,
  onCompare,
  onAddPhoto,
}: PhotoTimelineProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [annotations, setAnnotations] = useState<TreatmentAnnotation[]>([]);

  // Sort photos chronologically
  const sortedPhotos = [...photos].sort(
    (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime()
  );

  const handlePhotoClick = (photoId: string) => {
    if (selectedPhotos.includes(photoId)) {
      setSelectedPhotos(selectedPhotos.filter((id) => id !== photoId));
    } else if (selectedPhotos.length < 2) {
      setSelectedPhotos([...selectedPhotos, photoId]);
    } else {
      setSelectedPhotos([selectedPhotos[1], photoId]);
    }
  };

  const handleCompare = () => {
    if (selectedPhotos.length === 2) {
      const [before, after] = selectedPhotos.sort((a, b) => {
        const photoA = photos.find((p) => p.id === a)!;
        const photoB = photos.find((p) => p.id === b)!;
        return (
          new Date(photoA.taken_at).getTime() - new Date(photoB.taken_at).getTime()
        );
      });
      onCompare(before, after);
    }
  };

  const addAnnotation = (fromIndex: number) => {
    // This would open a modal to add treatment annotation
    setShowAnnotationForm(true);
  };

  const getDaysBetween = (date1: string, date2: string) => {
    const diff = new Date(date2).getTime() - new Date(date1).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  if (photos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-500 mb-4">
          No photos found for {BODY_REGION_LABELS[bodyRegion] || bodyRegion}
        </p>
        {onAddPhoto && (
          <button
            onClick={onAddPhoto}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add First Photo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {BODY_REGION_LABELS[bodyRegion] || bodyRegion} - Treatment Timeline
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {photos.length} photo{photos.length !== 1 ? 's' : ''} •{' '}
              {getDaysBetween(sortedPhotos[0].taken_at, sortedPhotos[sortedPhotos.length - 1].taken_at)}{' '}
              days tracked
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedPhotos.length === 2 && (
              <button
                onClick={handleCompare}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Compare Selected
              </button>
            )}

            {onAddPhoto && (
              <button
                onClick={onAddPhoto}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Photo
              </button>
            )}
          </div>
        </div>

        {selectedPhotos.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              {selectedPhotos.length === 1
                ? '1 photo selected - select one more to compare'
                : '2 photos selected - click "Compare Selected" to view'}
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>

          {/* Timeline Items */}
          <div className="space-y-8">
            {sortedPhotos.map((photo, index) => {
              const isSelected = selectedPhotos.includes(photo.id);
              const isFirst = index === 0;
              const isLast = index === sortedPhotos.length - 1;
              const daysSincePrevious = index > 0
                ? getDaysBetween(sortedPhotos[index - 1].taken_at, photo.taken_at)
                : 0;

              return (
                <div key={photo.id} className="relative">
                  {/* Show days between if not first */}
                  {!isFirst && daysSincePrevious > 0 && (
                    <div className="mb-4 ml-16 flex items-center gap-2">
                      <div className="flex-1 border-t border-dashed border-gray-300"></div>
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                        {daysSincePrevious} days later
                      </span>
                      <div className="flex-1 border-t border-dashed border-gray-300"></div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    {/* Timeline Dot */}
                    <div className="relative z-10">
                      <div
                        className={`w-16 h-16 rounded-full border-4 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-100'
                            : 'border-white bg-gray-100'
                        } shadow-md overflow-hidden cursor-pointer hover:scale-110 transition-transform`}
                        onClick={() => handlePhotoClick(photo.id)}
                      >
                        <img
                          src={photo.thumbnail_path || photo.file_path}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {isFirst && (
                        <div className="absolute -top-2 -right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                          Start
                        </div>
                      )}
                      {isLast && (
                        <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                          Latest
                        </div>
                      )}
                    </div>

                    {/* Photo Card */}
                    <div
                      className={`flex-1 border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      onClick={() => handlePhotoClick(photo.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Photo Preview */}
                        <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <img
                            src={photo.thumbnail_path || photo.file_path}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {format(new Date(photo.taken_at), 'MMMM d, yyyy')}
                            </span>
                            <span className="text-sm text-gray-500">
                              ({formatDistanceToNow(new Date(photo.taken_at), { addSuffix: true })})
                            </span>
                          </div>

                          {photo.taken_by_name && (
                            <div className="flex items-center gap-2 mb-2 text-sm text-gray-600">
                              <User className="w-4 h-4" />
                              <span>Taken by {photo.taken_by_name}</span>
                            </div>
                          )}

                          {photo.photo_type && photo.photo_type !== 'clinical' && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full mb-2">
                              <FileText className="w-3 h-3" />
                              {photo.photo_type}
                            </div>
                          )}

                          {photo.notes && (
                            <p className="text-sm text-gray-600 mt-2">
                              {photo.notes}
                            </p>
                          )}

                          {photo.clinical_findings && (
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                              <span className="font-medium text-yellow-900">Findings:</span>{' '}
                              <span className="text-yellow-800">{photo.clinical_findings}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Treatment Annotation Button */}
                  {!isLast && (
                    <div className="ml-24 mt-2">
                      <button
                        onClick={() => addAnnotation(index)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add treatment note between photos
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">First Photo</div>
          <div className="text-lg font-semibold text-gray-900 mt-1">
            {format(new Date(sortedPhotos[0].taken_at), 'MMM d, yyyy')}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Latest Photo</div>
          <div className="text-lg font-semibold text-gray-900 mt-1">
            {format(new Date(sortedPhotos[sortedPhotos.length - 1].taken_at), 'MMM d, yyyy')}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Duration</div>
          <div className="text-lg font-semibold text-gray-900 mt-1">
            {getDaysBetween(
              sortedPhotos[0].taken_at,
              sortedPhotos[sortedPhotos.length - 1].taken_at
            )}{' '}
            days
          </div>
        </div>
      </div>
    </div>
  );
}
